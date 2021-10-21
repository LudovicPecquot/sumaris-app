import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Optional, Output } from '@angular/core';
import { OperationValidatorService } from '../services/validator/operation.validator';
import * as momentImported from 'moment';
import { Moment } from 'moment';
import {
  AccountService,
  AppForm,
  DateFormatPipe,
  EntityUtils,
  fromDateISOString,
  IReferentialRef,
  isNil,
  isNotEmptyArray,
  isNotNil,
  LocalSettingsService,
  PlatformService,
  ReferentialRef,
  ReferentialUtils,
  SharedValidators,
  toBoolean,
  UsageMode,
} from '@sumaris-net/ngx-components';
import { AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Operation, PhysicalGear, Trip, VesselPosition } from '../services/model/trip.model';
import { BehaviorSubject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { METIER_DEFAULT_FILTER } from '@app/referential/services/metier.service';
import { ReferentialRefService } from '@app/referential/services/referential-ref.service';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { OperationService } from '@app/trip/services/operation.service';
import { ModalController } from '@ionic/angular';
import { SelectOperationModal } from '@app/trip/operation/select-operation.modal';
import { QualityFlagIds } from '@app/referential/services/model/model.enum';
import { PmfmService } from '@app/referential/services/pmfm.service';
import { Router } from '@angular/router';

const moment = momentImported;


export const IS_CHILD_OPERATION_ITEMS = Object.freeze([
  {
    value: false,
    label: 'TRIP.OPERATION.EDIT.TYPE.PARENT'
  },
  {
    value: true,
    label: 'TRIP.OPERATION.EDIT.TYPE.CHILD'
  }
]);

@Component({
  selector: 'app-form-operation',
  templateUrl: './operation.form.html',
  styleUrls: ['./operation.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OperationForm extends AppForm<Operation> implements OnInit {

  private _trip: Trip;
  private _physicalGearsSubject = new BehaviorSubject<PhysicalGear[]>(undefined);
  private _metiersSubject = new BehaviorSubject<IReferentialRef[]>(undefined);
  private _showMetierFilter = false;
  private _allowParentOperation = false;

  startProgram: Date | Moment;
  enableGeolocation: boolean;
  latLongFormat: string;
  mobile: boolean;
  distance: number;
  maxDistanceWarning: number;
  maxDistanceError: number;
  distanceError: boolean;
  distanceWarning: boolean;
  enableMetierFilter = false;

  isChildOperationItems = IS_CHILD_OPERATION_ITEMS;
  $isChildOperation = new BehaviorSubject<boolean>(undefined);
  $parentOperationLabel = new BehaviorSubject<string>('');

  @Input() showComment = true;
  @Input() showError = true;

  @Input() set showMetierFilter(value: boolean) {
    this._showMetierFilter = value;
    // Change metier filter button
    if (this._showMetierFilter !== this.enableMetierFilter) {
      this.toggleMetierFilter(null);
    }
  }

  get showMetierFilter(): boolean {
    return this._showMetierFilter;
  }

  @Input() set allowParentOperation(value: boolean) {
    if (this._allowParentOperation !== value) {
      this._allowParentOperation = value;
      // TODO find a way to avoid duplicate execution
      this.updateFormGroup();
    }
  }

  get allowParentOperation(): boolean {
    return this._allowParentOperation;
  }

  @Input() usageMode: UsageMode;
  @Input() defaultLatitudeSign: '+' | '-';
  @Input() defaultLongitudeSign: '+' | '-';
  @Input() programLabel: string;

  get trip(): Trip {
    return this._trip;
  }

  set trip(value: Trip) {
    this.setTrip(value);
  }

  get isChildOperation(): boolean {
    return this.$isChildOperation.value === true;
  }

  @Input()
  set isChildOperation(value: boolean) {
    this.setIsChildOperation(value);
  }

  get isParentOperation(): boolean {
    return this.$isChildOperation.value !== true;
  }

  get parentControl(): FormControl {
    return this.form.get('parentOperation') as FormControl;
  }

  enable(opts?: { onlySelf?: boolean; emitEvent?: boolean }) {
    super.enable(opts);
  }

  @Output() onParentChanges = new EventEmitter<Operation>();

  constructor(
    protected dateFormat: DateFormatPipe,
    protected router: Router,
    protected validatorService: OperationValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected modalCtrl: ModalController,
    protected accountService: AccountService,
    protected operationService: OperationService,
    protected pmfmService: PmfmService,
    protected settings: LocalSettingsService,
    protected translate: TranslateService,
    protected platform: PlatformService,
    protected cd: ChangeDetectorRef,
    @Optional() protected geolocation: Geolocation
  ) {
    super(dateFormat, validatorService.getFormGroup(), settings);
    this.mobile = this.settings.mobile;
  }

  ngOnInit() {
    this.usageMode = this.settings.isOnFieldMode(this.usageMode) ? 'FIELD' : 'DESK';
    this.latLongFormat = this.settings.latLongFormat;

    this.enableGeolocation = (this.usageMode === 'FIELD') && this.settings.mobile;
    this.allowParentOperation = toBoolean(this.allowParentOperation, false);

    // Combo: physicalGears
    const physicalGearAttributes = ['rankOrder'].concat(this.settings.getFieldDisplayAttributes('gear').map(key => 'gear.' + key));
    this.registerAutocompleteField('physicalGear', {
      items: this._physicalGearsSubject,
      attributes: physicalGearAttributes,
      mobile: this.mobile
    });

    // Taxon group combo
    this.registerAutocompleteField('taxonGroup', {
      items: this._metiersSubject,
      mobile: this.mobile
    });

    // Listen physical gear, to enable/disable metier
    this.registerSubscription(
      this.form.get('physicalGear').valueChanges
        .pipe(
          distinctUntilChanged((o1, o2) => EntityUtils.equals(o1, o2, 'id'))
        )
        .subscribe((physicalGear) => this.onPhysicalGearChanged(physicalGear))
    );

    // Listen parent operation
    this.registerSubscription(
      this.form.get('parentOperation').valueChanges
        .subscribe(value => this.onParentOperationChanged(value))
    );

    this.registerSubscription(
      merge(
        this.form.get('startPosition').valueChanges,
        this.form.get('endPosition').valueChanges
      )
        .pipe(debounceTime(200))
        .subscribe(() => this.computeDistance())
    );
  }

  setValue(data: Operation, opts?: { emitEvent?: boolean; onlySelf?: boolean; }) {
    const isNew = isNil(data?.id);

    // Use label and name from metier.taxonGroup
    if (!isNew && data.metier) {
      data.metier = data.metier.clone(); // Leave original object unchanged
      data.metier.label = data.metier.taxonGroup && data.metier.taxonGroup.label || data.metier.label;
      data.metier.name = data.metier.taxonGroup && data.metier.taxonGroup.name || data.metier.name;
    }

    const hasParent = isNotNil(data.parentOperation?.id);
    this.setIsChildOperation(hasParent, {emitEvent: false});
    if (hasParent && !this.allowParentOperation) {
      // Force to allow parent, to show existing parent data
      this.allowParentOperation = true;
    }

    super.setValue(data, opts);
  }

  setTrip(trip: Trip) {
    this._trip = trip;

    if (trip) {
      // Propagate physical gears
      this._physicalGearsSubject.next((trip.gears || []).map(ps => PhysicalGear.fromObject(ps).clone()));

      // Use trip physical gear Object (if possible)
      const physicalGearControl = this.form.get('physicalGear');
      let physicalGear = physicalGearControl.value;
      if (physicalGear && isNotNil(physicalGear.id)) {
        physicalGear = (trip.gears || []).find(g => g.id === physicalGear.id) || physicalGear;
        if (physicalGear) physicalGearControl.patchValue(physicalGear);
      }

      // Update form group
      this.updateFormGroup();
    }
  }

  /**
   * Get the position by GPS sensor
   * @param fieldName
   */
  async onFillPositionClick(event: UIEvent, fieldName: string) {

    if (event) {
      event.preventDefault();
      event.stopPropagation(); // Avoid focus into the longitude field
    }
    const positionGroup = this.form.controls[fieldName];
    if (positionGroup && positionGroup instanceof FormGroup) {
      const coords = await this.operationService.getGeoCoordinates();
      positionGroup.patchValue(coords, {emitEvent: false, onlySelf: true});
    }
    // Set also the end date time
    if (fieldName === 'endPosition') {
      const endDateTimeControlName = this.isChildOperation ? 'endDateTime' : 'fishingStartDateTime';
      this.form.get(endDateTimeControlName).setValue(moment(), {emitEvent: false, onlySelf: true});
    }


    this.form.markAsDirty({onlySelf: true});
    this.form.updateValueAndValidity();

    this.computeDistance({emitEvent: false /* done after */ });

    this.markForCheck();
  }

  copyPosition(event: UIEvent, source: string, target: string) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const value = this.form.get(source).value;

    this.form.get(target).patchValue({
      latitude: value.latitude,
      longitude: value.longitude
    }, {emitEvent: true});
    this.markAsDirty();
  }

  async openSelectOperationModal(): Promise<Operation> {

    const value = this.form.value as Partial<Operation>;
    const endDate = value.fishingEndDateTime || this.trip.returnDateTime;
    const parent = value.parentOperation;
    const startDate = fromDateISOString(this._trip.departureDateTime).clone().add(-15, 'day');

    const modal = await this.modalCtrl.create({
      component: SelectOperationModal,
      componentProps: {
        filter: {
          programLabel: this.programLabel,
          vesselId: this._trip.vesselSnapshot.id,
          excludedIds: isNotNil(value.id) ? [value.id] : null,
          excludeChildOperation: true,
          hasNoChildOperation: true,
          endDate,
          startDate,
          gearIds: this._physicalGearsSubject.getValue().map(physicalGear => physicalGear.gear.id)
        },
        physicalGears: this._physicalGearsSubject.getValue(),
        programLabel: this.programLabel,
        enableGeolocation: this.enableGeolocation,
        parent
      },
      keyboardClose: true,
      cssClass: 'modal-large'
    });

    await modal.present();

    const {data} = await modal.onDidDismiss();
    if (data && this.debug) console.debug('[operation-form] Modal result: ', data);

    return (data instanceof Operation) ? data : undefined;
  }

  async onParentOperationChanged(parentOperation?: Operation) {
    parentOperation = parentOperation || this.form.get('parentOperation').value;
    if (this.debug) console.debug('[operation-form] Parent operation changed: ', parentOperation);

    this.onParentChanges.emit(parentOperation);

    // Compute parent operation label
    let parentLabel = '';
    if (isNotNil(parentOperation?.id)) {
      parentLabel = await this.translate.get('TRIP.OPERATION.EDIT.TITLE_NO_RANK', {
        startDateTime: parentOperation.startDateTime && this.dateFormat.transform(parentOperation.startDateTime, {time: true}) as string
      }).toPromise() as string;
    }
    this.$parentOperationLabel.next(parentLabel);

  }

  async addParentOperation(): Promise<Operation> {
    const operation = await this.openSelectOperationModal();

    // User cancelled
    if (!operation) {
      this.parentControl.markAsTouched();
      this.parentControl.markAsDirty();
      this.markForCheck();
      return;
    }

    const metierControl = this.form.get('metier');
    const physicalGearControl = this.form.get('physicalGear');
    const startPositionControl = this.form.get('startPosition');
    const endPositionControl = this.form.get('endPosition');
    const startDateTimeControl = this.form.get('startDateTime');
    const fishingStartDateTimeControl = this.form.get('fishingStartDateTime');

    this.parentControl.setValue(operation);

    if (this._trip.id === operation.tripId) {
      physicalGearControl.patchValue(operation.physicalGear);
      metierControl.patchValue(operation.metier);
    } else {
      const physicalGear = this._physicalGearsSubject.getValue().filter((value) => {
        return value.gear.id === operation.physicalGear.gear.id;
      });

      if (physicalGear.length === 1) {
        physicalGearControl.setValue(physicalGear[0]);
        const metiers = await this.loadMetiers(operation.physicalGear);

        const metier = metiers.filter((value) => {
          return value.id === operation.metier.id;
        });

        if (metier.length === 1) {
          metierControl.patchValue(metier[0]);
        }
      } else if (physicalGear.length === 0) {
        console.warn('[operation-form] no matching physical gear on trip');
      } else {
        console.warn('[operation-form] several matching physical gear on trip');
      }
    }

    this.setPosition(startPositionControl, operation.startPosition);
    this.setPosition(endPositionControl, operation.endPosition);

    startDateTimeControl.patchValue(operation.startDateTime);
    fishingStartDateTimeControl.patchValue(operation.fishingStartDateTime);
    this.form.get('qualityFlagId').patchValue(null);

    this.markAsDirty();

    return operation;
  }

  updateDistanceValidity() {
    if (this.maxDistanceError && this.maxDistanceError > 0 && this.distance > this.maxDistanceError) {
      console.error('Too long distance (> ' + this.maxDistanceError + ') between start and end positions');
      this.setPositionError(true, false);
    } else if (this.maxDistanceWarning && this.maxDistanceWarning > 0 && this.distance > this.maxDistanceWarning) {
      console.warn('Too long distance (> ' + this.maxDistanceWarning + ') between start and end positions');
      this.setPositionError(false, true);
    } else {
      this.setPositionError(false, false);
    }
  }

  toggleMetierFilter($event) {
    if ($event) $event.preventDefault();
    this.enableMetierFilter = !this.enableMetierFilter;
    const physicalGear = this.form.get('physicalGear').value;

    if (physicalGear) {
      // Refresh metiers
      this.loadMetiers(physicalGear);
    }
  }

  async updateParentOperation() {
    //console.debug(this.form.get('parentOperation'));
    const parent = this.parentControl.value;

    if (parent) {
      await this.router.navigateByUrl(`/trips/${parent.tripId}/operation/${parent.id}`);
    }
  }

  /* -- protected methods -- */

  protected async onPhysicalGearChanged(physicalGear) {
    const metierControl = this.form.get('metier');
    const physicalGearControl = this.form.get('physicalGear');

    const hasPhysicalGear = EntityUtils.isNotEmpty(physicalGear, 'id');
    const gears = this._physicalGearsSubject.getValue() || this._trip && this._trip.gears;
    // Use same trip's gear Object (if found)
    if (hasPhysicalGear && isNotEmptyArray(gears)) {
      physicalGear = (gears || []).find(g => g.id === physicalGear.id);
      physicalGearControl.patchValue(physicalGear, {emitEvent: false});
    }

    // Change metier status, if need
    const enableMetier = hasPhysicalGear && this.form.enabled && isNotEmptyArray(gears) || this.allowParentOperation;
    if (enableMetier) {
      if (metierControl.disabled) metierControl.enable();
    } else {
      if (metierControl.enabled) metierControl.disable();
    }

    if (hasPhysicalGear) {
      // Refresh metiers
      await this.loadMetiers(physicalGear);
    }
  }

  protected async loadMetiers(physicalGear?: PhysicalGear | any): Promise<ReferentialRef[]> {

    // No gears selected: skip
    if (EntityUtils.isEmpty(physicalGear, 'id')) return undefined;

    const gear = physicalGear && physicalGear.gear;
    console.debug('[operation-form] Loading Metier ref items for the gear: ' + (gear && gear.label));

    let res;
    if (this.enableMetierFilter) {
      res = await this.operationService.loadPracticedMetier(0, 100, null, null,
        {
          ...METIER_DEFAULT_FILTER,
          searchJoin: 'TaxonGroup',
          vesselId: this.trip.vesselSnapshot.id,
          startDate: this.startProgram as Moment,
          endDate: moment(),
          programLabel: this.programLabel,
          gearIds: gear && [gear.id],
          levelId: gear && gear.id || undefined
        },
        {
          withTotal: false
        });
    } else {
      res = await this.referentialRefService.loadAll(0, 100, null, null,
        {
          entityName: 'Metier',
          ...METIER_DEFAULT_FILTER,
          searchJoin: 'TaxonGroup',
          levelId: gear && gear.id || undefined
        },
        {
          withTotal: false
        });
    }

    const metiers = res.data;

    if (this.enableMetierFilter && metiers.length === 0) {
      this.toggleMetierFilter(null);
      return;
    }

    const metierControl = this.form.get('metier');

    const metier = metierControl.value;
    if (ReferentialUtils.isNotEmpty(metier)) {
      // Find new reference, by ID
      let updatedMetier = (metiers || []).find(m => m.id === metier.id);

      // If not found : retry using the label (WARN: because of searchJoin, label = taxonGroup.label)
      updatedMetier = updatedMetier || (metiers || []).find(m => m.label === metier.label);

      // Update the metier, if not found (=reset) or ID changed
      if (!updatedMetier || !ReferentialUtils.equals(metier, updatedMetier)) {
        metierControl.patchValue(updatedMetier);
      }
    }
    this._metiersSubject.next(metiers);
    if (metiers.length === 1 && ReferentialUtils.isEmpty(metier)) {
      metierControl.patchValue(metiers[0]);
    }
    return res.data;
  }

  setIsChildOperation(isChildOperation: boolean, opts?: { emitEvent?: boolean; }) {
    if (this.$isChildOperation.value === isChildOperation) return; // Skip if same

    this.$isChildOperation.next(isChildOperation);
    console.debug('[operation-form] Is child operation ? ', isChildOperation);

    // Virage
    if (isChildOperation) {
      if ((!opts || opts.emitEvent !== false) && !this.parentControl.value) {
        // Keep filled values
        this.form.get('fishingEndDateTime').patchValue(this.form.get('startDateTime').value);
        this.updateFormGroup();

        // Propage to page, that there is an operation
        setTimeout(() => this.onParentChanges.next(new Operation()), 600);

        // Select a parent (or same if user cancelled)
        this.addParentOperation();
      }
    }

    // Filage or other case
    else {
      this.form.patchValue({
        parentOperation: null
      });
      if (!opts || opts.emitEvent !== false) {
        this.updateFormGroup();
      }
    }
  }

  protected setPosition(positionControl: AbstractControl, position?: VesselPosition) {
    const latitudeControl = positionControl.get('latitude');
    const longitudeControl = positionControl.get('longitude');

    if (isNil(latitudeControl) || isNil(longitudeControl)) {
      console.warn('[operation-form] This control does not contains longitude or latitude field');
      return;
    }
    latitudeControl.patchValue(position && position.latitude || null);
    longitudeControl.patchValue(position && position.longitude || null);
  }

  protected computeDistance(opts?: {emitEvent?: boolean}) {
    const startPosition = this.form.get('startPosition').value;
    const endPosition = this.form.get('endPosition').value;

    this.distance = this.operationService.getDistanceBetweenPositions(startPosition, endPosition);
    this.updateDistanceValidity();

    if (!opts || opts.emitEvent !== false) {
      this.markForCheck();
    }
  }

  protected setPositionError(hasError: boolean, hasWarning: boolean) {
    if (hasError) {
      this.form.get('endPosition').get('longitude').setErrors({tooLong: true});
      this.form.get('endPosition').get('latitude').setErrors({tooLong: true});
      this.form.get('startPosition').get('longitude').setErrors({tooLong: true});
      this.form.get('startPosition').get('latitude').setErrors({tooLong: true});
    } else {
      SharedValidators.clearError(this.form.get('endPosition').get('longitude'), 'tooLong');
      SharedValidators.clearError(this.form.get('endPosition').get('latitude'), 'tooLong');
      SharedValidators.clearError(this.form.get('startPosition').get('longitude'), 'tooLong');
      SharedValidators.clearError(this.form.get('startPosition').get('latitude'), 'tooLong');
    }

    this.distanceError = hasError;
    this.distanceWarning = hasWarning;

    if (this.form.get('endPosition').touched || this.form.get('startPosition').touched) {
      this.form.get('endPosition').markAllAsTouched();
    }
  }

  protected updateFormGroup() {

    this.validatorService.updateFormGroup(this.form, {
      trip: this.trip,
      withChild: this.allowParentOperation && this.isParentOperation,
      withParent: this.isChildOperation
    });

    this.form.updateValueAndValidity();
    this.markForCheck();
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

}
