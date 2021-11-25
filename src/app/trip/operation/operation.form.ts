import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Optional, Output} from '@angular/core';
import {OperationValidatorService} from '../services/validator/operation.validator';
import * as momentImported from 'moment';
import {Moment} from 'moment';
import {
  AccountService,
  AppForm,
  AppFormUtils,
  DateFormatPipe,
  EntityUtils,
  FormArrayHelper,
  fromDateISOString,
  IReferentialRef,
  isNil,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrNaN,
  LoadResult,
  LocalSettingsService,
  MatAutocompleteField,
  PlatformService,
  ReferentialRef,
  ReferentialUtils,
  removeDuplicatesFromArray,
  SharedFormArrayValidators,
  SharedValidators,
  StatusIds,
  suggestFromArray,
  toBoolean,
  UsageMode,
} from '@sumaris-net/ngx-components';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Operation, PhysicalGear, Trip, VesselPosition } from '../services/model/trip.model';
import { BehaviorSubject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { METIER_DEFAULT_FILTER } from '@app/referential/services/metier.service';
import { ReferentialRefService } from '@app/referential/services/referential-ref.service';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { OperationService } from '@app/trip/services/operation.service';
import { ModalController } from '@ionic/angular';
import { SelectOperationModal, SelectOperationModalOptions } from '@app/trip/operation/select-operation.modal';
import { PmfmService } from '@app/referential/services/pmfm.service';
import { Router } from '@angular/router';
import { PositionUtils } from '@app/trip/services/position.utils';
import { FishingArea } from '@app/trip/services/model/fishing-area.model';
import { FishingAreaValidatorService } from '@app/trip/services/validator/fishing-area.validator';
import { LocationLevelIds } from '@app/referential/services/model/model.enum';

const moment = momentImported;

type FilterableFieldName = 'fishingArea';

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
  private _showPosition = true;
  private _showFishingArea = false;
  private _requiredComment = false;
  private _copyTripDates = false;

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

  isParentOperationControl: FormControl;
  $parentOperationLabel = new BehaviorSubject<string>('');
  fishingAreasHelper: FormArrayHelper<FishingArea>;
  fishingAreaFocusIndex = -1;
  autocompleteFilters = {
    fishingArea: false
  };

  @Input() usageMode: UsageMode;
  @Input() programLabel: string;
  @Input() showError = true;
  @Input() showComment = true;
  @Input() defaultLatitudeSign: '+' | '-';
  @Input() defaultLongitudeSign: '+' | '-';
  @Input() filteredFishingAreaLocations: ReferentialRef[] = null;

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
      if (!this._loading) this.updateFormGroup();
    }
  }

  get allowParentOperation(): boolean {
    return this._allowParentOperation;
  }

  @Input() set showPosition(value: boolean) {
    if (this._showPosition !== value) {
      this._showPosition = value;
      if (!this._loading) this.updateFormGroup();
    }
  }

  get showPosition(): boolean {
    return this._showPosition;
  }

  @Input() set showFishingArea(value: boolean) {
    if (this._showFishingArea !== value) {
      this._showFishingArea = value;
      if (!this._loading) this.updateFormGroup();
    }
  }

  get showFishingArea(): boolean {
    return this._showFishingArea;
  }

  @Input() set fishingAreaLocationLevelIds(ids: number[]) {
    this.autocompleteFields.fishingAreaLocation.filter.levelIds = ids;
  }

  @Input() set requiredComment(value: boolean) {
    if (this._requiredComment !== value) {
      this._requiredComment = value;
      const commentControl = this.form.get('comments');
      if (value) {
        commentControl.setValidators(Validators.required);
        commentControl.markAsPending({onlySelf: true});
      } else {
        commentControl.clearValidators();
      }
      commentControl.updateValueAndValidity({emitEvent: !this._loading, onlySelf: true});
    }
  }

  get isCommentRequired(): boolean {
    return this._requiredComment;
  }

  get copyTripDates(): boolean {
    return this._copyTripDates;
  }

  @Input() set copyTripDates(value: boolean) {
    this._copyTripDates = value;
    this.updateDates();
  }

  get trip(): Trip {
    return this._trip;
  }

  set trip(value: Trip) {
    this.setTrip(value);
  }

  get parentControl(): FormControl {
    return this.form.get('parentOperation') as FormControl;
  }

  get fishingAreasForm(): FormArray {
    return this.form?.controls.fishingAreas as FormArray;
  }

  get isParentOperation(): boolean {
    return this.isParentOperationControl.value === true;
  }

  @Input()
  set isParentOperation(value: boolean) {
    this.setIsParentOperation(value);
  }

  get isChildOperation(): boolean {
    return this.isParentOperationControl.value !== true;
  }

  @Input()
  set isChildOperation(value: boolean) {
    this.setIsParentOperation(!value);
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
    protected formBuilder: FormBuilder,
    protected fishingAreaValidatorService: FishingAreaValidatorService,
    protected cd: ChangeDetectorRef,
    @Optional() protected geolocation: Geolocation
  ) {
    super(dateFormat, validatorService.getFormGroup(), settings);
    this.mobile = this.settings.mobile;

    // A boolean control, to store if parent is a parent or child operation
    this.isParentOperationControl = new FormControl(true, Validators.required);
  }

  ngOnInit() {
    this.usageMode = this.settings.isOnFieldMode(this.usageMode) ? 'FIELD' : 'DESK';
    this.latLongFormat = this.settings.latLongFormat;

    this.enableGeolocation = (this.usageMode === 'FIELD') && this.settings.mobile;
    this.allowParentOperation = toBoolean(this.allowParentOperation, false);

    super.ngOnInit();

    // Combo: physicalGears
    const physicalGearAttributes = ['rankOrder'].concat(this.settings.getFieldDisplayAttributes('gear').map(key => 'gear.' + key));
    this.registerAutocompleteField('physicalGear', {
      items: this._physicalGearsSubject,
      attributes: physicalGearAttributes,
      mobile: this.mobile
    });

    // Combo: fishingAreas
    this.initFishingAreas(this.form);
    const locationAttributes = this.settings.getFieldDisplayAttributes('location');
    this.registerAutocompleteField('fishingAreaLocation', {
      showAllOnFocus: true,
      suggestFn: (value, filter) => this.suggestFishingAreaLocations(value, filter),
      // Default filter. An excludedIds will be add dynamically
      filter: {
        entityName: 'Location',
        statusIds: [StatusIds.TEMPORARY, StatusIds.ENABLE],
        levelIds: LocationLevelIds.LOCATIONS_AREA // should be overridden by program property
      },
      attributes: locationAttributes
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
      this.parentControl.valueChanges
        .subscribe(value => this.onParentOperationChanged(value))
    );

    this.registerSubscription(
      merge(
        this.form.get('startPosition').valueChanges,
        this.form.get('endPosition').valueChanges
      )
        .pipe(debounceTime(200))
        .subscribe(_ => this.updateDistance())
    );

    this.registerSubscription(
      this.isParentOperationControl.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe(value => this.setIsParentOperation(value))
    );
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this._physicalGearsSubject.complete();
    this._metiersSubject.complete();
    this.$parentOperationLabel.complete();
  }

  setValue(data: Operation, opts?: { emitEvent?: boolean; onlySelf?: boolean; }) {
    const isNew = isNil(data?.id);

    // Use label and name from metier.taxonGroup
    if (!isNew && data.metier) {
      data.metier = data.metier.clone(); // Leave original object unchanged
      data.metier.label = data.metier.taxonGroup && data.metier.taxonGroup.label || data.metier.label;
      data.metier.name = data.metier.taxonGroup && data.metier.taxonGroup.name || data.metier.name;
    }

    const isChildOperation = isNotNil(data.parentOperation?.id);
    if (isChildOperation || this.allowParentOperation) {
      this._allowParentOperation = true; // do not use setter to not update form group
      this.setIsParentOperation(!isChildOperation, {emitEvent: false});
    }

    super.setValue(data, opts);

    if (data.childOperation && data.childOperation.fishingEndDateTime){
      this.setChildOperation(data.childOperation, {emitEvent:false});
    }

    this.markAsLoaded();
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

      this.updateDates();

      // Update form group
      if (!this._loading) this.updateFormGroup();
    }
  }

  private updateDates() {
    // Copy dates from trip
    if (this.copyTripDates && this.trip && !this.form.value.startDateTime && !this.form.value.endDateTime) {
      const endDateTime = fromDateISOString(this.trip.returnDateTime).clone();
      endDateTime.subtract(1, 'second');
      this.form.patchValue({ startDateTime: this.trip.departureDateTime, endDateTime: endDateTime });
    }
  }

  setChildOperation(value: Operation, opts?: {emitEvent: boolean}) {
    this.form.patchValue({
      childOperation: value,
      childOperationFishingEndDateTime: value.fishingEndDateTime
    }, opts);

    if (!opts || opts.emitEvent !== false){
      this.updateFormGroup();
    }
  }

  async setParentOperation(value: Operation) {
    this.parentControl.setValue(value);
    await this.onParentOperationChanged(value, {emitEvent: false});
    this.updateFormGroup();
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
      const coords = await this.operationService.getCurrentPosition();
      positionGroup.patchValue(coords, {emitEvent: false, onlySelf: true});
    }
    // Set also the end date time
    if (fieldName === 'endPosition') {
      const endDateTimeControlName = this.isChildOperation ? 'endDateTime' : 'fishingStartDateTime';
      this.form.get(endDateTimeControlName).setValue(moment(), {emitEvent: false, onlySelf: true});
    }

    this.form.markAsDirty({onlySelf: true});
    this.form.updateValueAndValidity();

    this.updateDistance({emitEvent: false /* done after */});

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
    const endDate = value.fishingEndDateTime || this.trip && this.trip.returnDateTime || moment();
    const parent = value.parentOperation;
    const trip = this.trip;
    const startDate = trip && fromDateISOString(trip.departureDateTime).clone().add(-15, 'day') || moment().add(-15, 'day');

    const gearIds = removeDuplicatesFromArray((this._physicalGearsSubject.value || []).map(physicalGear => physicalGear.gear.id));

    const modal = await this.modalCtrl.create({
      component: SelectOperationModal,
      componentProps: <SelectOperationModalOptions>{
        filter: {
          programLabel: this.programLabel,
          vesselId: trip.vesselSnapshot?.id,
          excludedIds: isNotNil(value.id) ? [value.id] : null,
          excludeChildOperation: true,
          hasNoChildOperation: true,
          //endDate,
          startDate,
          gearIds
        },
        gearIds,
        parent,
        enableGeolocation: this.enableGeolocation
      },
      keyboardClose: true,
      cssClass: 'modal-large'
    });

    await modal.present();

    const {data} = await modal.onDidDismiss();
    if (data && this.debug) console.debug('[operation-form] Modal result: ', data);

    return (data instanceof Operation) ? data : undefined;
  }

  async onParentOperationChanged(parentOperation?: Operation, opts?: { emitEvent: boolean }) {
    parentOperation = parentOperation || this.form.get('parentOperation').value;
    if (this.debug) console.debug('[operation-form] Parent operation changed: ', parentOperation);

    if (!opts || opts.emitEvent !== false) {
      this.onParentChanges.emit(parentOperation);
    }

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
        // TODO: voir comment sélectionner l'engin par rankOrder, label, etc.
        // Ou alors proposer à l'utilisateur de la choisir
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
        } else {
          // TODO
        }
      } else if (physicalGear.length === 0) {
        console.warn('[operation-form] no matching physical gear on trip');
      } else {
        console.warn('[operation-form] several matching physical gear on trip');
      }
    }

    if (this._showPosition) {
      this.setPosition(startPositionControl, operation.startPosition);
      this.setPosition(endPositionControl, operation.endPosition);
    }

    startDateTimeControl.patchValue(operation.startDateTime);
    fishingStartDateTimeControl.patchValue(operation.fishingStartDateTime);
    this.form.get('qualityFlagId').patchValue(null);

    this.markAsDirty();

    return operation;
  }

  addFishingArea() {
    this.fishingAreasHelper.add();
    if (!this.mobile) {
      this.fishingAreaFocusIndex = this.fishingAreasHelper.size() - 1;
    }
  }

  toggleMetierFilter($event) {
    if ($event) $event.preventDefault();
    this.enableMetierFilter = !this.enableMetierFilter;
    const physicalGear = this.form.get('physicalGear').value;

    // Refresh metiers
    if (physicalGear) this.loadMetiers(physicalGear);
  }

  toggleFilter(fieldName: FilterableFieldName, field?: MatAutocompleteField) {
    this.setFieldFilterEnable(fieldName, !this.isFieldFilterEnable(fieldName), field);
  }

  async updateParentOperation() {
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

  setIsParentOperation(isParent: boolean, opts?: { emitEvent?: boolean; }) {

    if (this.debug) console.debug('[operation-form] Is parent operation ? ', isParent);

    if (this.isParentOperationControl.value !== isParent) {
      this.isParentOperationControl.setValue(isParent, opts);
    }

    // Parent operation (= Filage) (or parent not used)
    if (isParent) {
      if (!opts || opts.emitEvent !== false) {
        // Clean child fields
        this.form.patchValue({
          fishingEndDateTime: null,
          endDateTime: null,
          physicalGear: null,
          metier: null,
          parentOperation: null
        });

        this.updateFormGroup();
      }
    }

    // Child operation (=Virage)
    else {
      if ((!opts || opts.emitEvent !== false) && !this.parentControl.value) {
        // Copy parent fields, to child fields
        this.form.get('fishingEndDateTime').patchValue(this.form.get('startDateTime').value);
        this.form.get('endDateTime').patchValue(this.form.get('fishingStartDateTime').value);

        // Clean parent fields (should be filled after parent selection)
        this.form.patchValue({
          startDateTime: null,
          fishingStartDateTime: null,
          physicalGear: null,
          metier: null,
          childOperation: null
        });

        this.updateFormGroup();

        // Propage to page, that there is an operation
        //setTimeout(() => this.onParentChanges.next(new Operation()), 600);

        // Select a parent (or same if user cancelled)
        this.addParentOperation();
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

  protected updateDistance(opts?: {emitEvent?: boolean}) {
    if (!this._showPosition) return; // Skip

    const startPosition = this.form.get('startPosition').value;
    const endPosition = this.form.get('endPosition').value;

    const distance = PositionUtils.computeDistanceInMiles(startPosition, endPosition);
    if (this.debug) console.debug('[operation-form] Distance between position: ' + distance);

    this.distance = distance;
    this.updateDistanceValidity(distance, {emitEvent: false});
    if (!opts || opts.emitEvent !== false) this.markForCheck();
  }

  protected updateDistanceValidity(distance?: number, opts?: {emitEvent?: boolean}) {
    distance = distance || this.distance;
    if (isNotNilOrNaN(distance)) {
      // Distance > max error distance
      if (this.maxDistanceError > 0 && distance > this.maxDistanceError) {
        console.error('Too long distance (> ' + this.maxDistanceError + ') between start and end positions');
        this.setPositionError(true, false);
        return;
      }

      // Distance > max warn distance
      if (this.maxDistanceWarning > 0 && distance > this.maxDistanceWarning) {
        console.warn('Too long distance (> ' + this.maxDistanceWarning + ') between start and end positions');
        this.setPositionError(false, true);
        return;
      }
    }

    // No error
    this.setPositionError(false, false);

    if (!opts || !opts.emitEvent !== false) this.markForCheck();
  }

  protected setPositionError(hasError: boolean, hasWarning: boolean) {

    // If some changes detected
    if (this.distanceError !== hasError || this.distanceWarning !== hasWarning) {
      if (hasError) {
        this.form.get('endPosition.longitude').setErrors({tooLong: true});
        this.form.get('endPosition.latitude').setErrors({tooLong: true});
        this.form.get('startPosition.longitude').setErrors({tooLong: true});
        this.form.get('startPosition.latitude').setErrors({tooLong: true});
      } else {
        SharedValidators.clearError(this.form.get('endPosition.longitude'), 'tooLong');
        SharedValidators.clearError(this.form.get('endPosition.latitude'), 'tooLong');
        SharedValidators.clearError(this.form.get('startPosition.longitude'), 'tooLong');
        SharedValidators.clearError(this.form.get('startPosition.latitude'), 'tooLong');
      }

      this.distanceError = hasError;
      this.distanceWarning = hasWarning;

      // To force error display: mark as touched
      if (this.distanceError) {
        AppFormUtils.markAllAsTouched(this.form.get('endPosition'));
      }
    }

  }

  protected initFishingAreas(form: FormGroup) {
    this.fishingAreasHelper = new FormArrayHelper<FishingArea>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, form, 'fishingAreas'),
      (fishingArea) => this.fishingAreaValidatorService.getFormGroup(fishingArea, {required: true}),
      (o1, o2) => isNil(o1) && isNil(o2) || (o1 && o1.equals(o2)),
      (fishingArea) => !fishingArea || ReferentialUtils.isEmpty(fishingArea.location),
      {allowEmptyArray: true}
    );
    if (this.fishingAreasHelper.size() === 0) {
      this.fishingAreasHelper.resize(1);
    }
    this.fishingAreasHelper.formArray.setValidators(SharedFormArrayValidators.requiredArrayMinLength(1));
  }

  protected async suggestFishingAreaLocations(value: string, filter: any): Promise<LoadResult<IReferentialRef>> {
    const currentControlValue = ReferentialUtils.isNotEmpty(value) ? value : null;

    // Excluded existing locations, BUT keep the current control value
    const excludedIds = (this.fishingAreasForm.value || [])
      .map(fa => fa.location)
      .filter(ReferentialUtils.isNotEmpty)
      .filter(item => !currentControlValue || currentControlValue !== item)
      .map(item => parseInt(item.id));

    if (this.autocompleteFilters.fishingArea && isNotNil(this.filteredFishingAreaLocations)) {
      return suggestFromArray(this.filteredFishingAreaLocations, value, {
        ...filter,
        excludedIds
      });
    } else {
      return this.referentialRefService.suggest(value, {
        ...filter,
        excludedIds
      });
    }
  }

  protected isFieldFilterEnable(fieldName: FilterableFieldName) {
    return this.autocompleteFilters[fieldName];
  }

  protected setFieldFilterEnable(fieldName: FilterableFieldName, value: boolean, field?: MatAutocompleteField, forceReload?: boolean) {
    if (this.autocompleteFilters[fieldName] !== value || forceReload) {
      this.autocompleteFilters[fieldName] = value;
      this.markForCheck();
      if (field) field.reloadItems();
    }
  }

  protected updateFormGroup() {

    // Resize fishing areas array
    if (this.showFishingArea) {
      this.trip.fishingAreas = isNotEmptyArray(this.trip.fishingAreas) ? this.trip.fishingAreas : [null];
      this.fishingAreasHelper.resize(Math.max(1, this.trip.fishingAreas.length));
    } else {
      this.fishingAreasHelper?.removeAllEmpty();
    }

    this.validatorService.updateFormGroup(this.form, {
      isOnFieldMode: this.usageMode === 'FIELD',
      trip: this.trip,
      isParent: this.allowParentOperation && this.isParentOperation,
      isChild: this.isChildOperation,
      withPosition: this.showPosition,
      withFishingAreas: this.showFishingArea
    });

    this.form.updateValueAndValidity();
    this.markForCheck();
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

}
