import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit} from '@angular/core';
import {OperationValidatorService} from "../services/operation.validator";
import {Moment} from 'moment/moment';
import {DateAdapter} from "@angular/material/core";
import {AppForm, fromDateISOString, IReferentialRef, isNotNil, ReferentialRef} from '../../core/core.module';
import {EntityUtils, ReferentialRefService} from '../../referential/referential.module';
import {UsageMode} from "../../core/services/model";
import {FormGroup} from "@angular/forms";
import * as moment from "moment";
import {LocalSettingsService} from "../../core/services/local-settings.service";
import {TranslateService} from "@ngx-translate/core";
import {isNilOrBlank, isNotEmptyArray, suggestFromArray} from "../../shared/functions";
import {AccountService} from "../../core/services/account.service";
import {PlatformService} from "../../core/services/platform.service";
import {SharedValidators} from "../../shared/validator/validators";
import {Operation, PhysicalGear, Trip} from "../services/model/trip.model";
import {ReferentialRefFilter} from "../../referential/services/referential-ref.service";
import {BehaviorSubject, Subject} from "rxjs";
import {distinctUntilChanged} from "rxjs/operators";

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

  enableGeolocation: boolean;
  latLongFormat: string;
  mobile: boolean;

  @Input() showComment = true;
  @Input() showError = true;

  @Input() usageMode: UsageMode;

  get trip() {
    return this._trip;
  }

  set trip(trip: Trip) {
    this._trip = trip;

    if (trip) {
      // Propagate physical gears
      this._physicalGearsSubject.next(trip.gears || []);

      // Use trip physical gear Object (if possible)
      const physicalGearControl = this.form.get("physicalGear");
      let physicalGear = physicalGearControl.value;
      if (physicalGear && isNotNil(physicalGear.id)) {
        physicalGear = (trip.gears || []).find(g => g.id === physicalGear.id) || physicalGear;
        if (physicalGear) physicalGearControl.patchValue(physicalGear);
      }

      // Add validator on trip date
      this.form.get('endDateTime').setAsyncValidators(async (control) => {
        if (!control.touched) return;
        const endDateTime = fromDateISOString(control.value);
        // Make sure: trip.departureDateTime < operation.endDateTime < trip.returnDateTime
        if (endDateTime && ((trip.departureDateTime && endDateTime.isBefore(trip.departureDateTime))
          || (trip.returnDateTime && endDateTime.isAfter(trip.returnDateTime)))) {
          return {msg: await this.translate.get('TRIP.OPERATION.ERROR.FIELD_DATE_OUTSIDE_TRIP').toPromise() };
        }
        else {
          SharedValidators.clearError(control, 'msg');
        }
        return null;
      });
    }
  }

  get isOnFieldMode(): boolean {
    return this.usageMode ? this.usageMode === 'FIELD' : this.settings.isUsageMode('FIELD');
  }

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected validatorService: OperationValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected accountService: AccountService,
    protected settings: LocalSettingsService,
    protected translate: TranslateService,
    protected platform: PlatformService,
    protected cd: ChangeDetectorRef
  ) {
    super(dateAdapter, validatorService.getFormGroup(), settings);
    this.mobile = this.settings.mobile;
  }

  ngOnInit() {
    this.usageMode = this.usageMode || (this.settings.isUsageMode('FIELD') ? 'FIELD' : 'DESK');
    this.latLongFormat = this.settings.latLongFormat;

    this.enableGeolocation = (this.usageMode === 'FIELD') && this.settings.mobile;

    // Combo: physicalGears
    this.registerAutocompleteField('physicalGear', {
      items: this._physicalGearsSubject.asObservable(),
      //suggestFn: (value, options) => this.suggestPhysicalGear(value, options),
      attributes: ['rankOrder'].concat(this.settings.getFieldDisplayAttributes('gear').map(key => 'gear.' + key)),
      mobile: this.mobile
    });

    // Taxon group combo
    this.registerAutocompleteField('taxonGroup', {
      items: this._metiersSubject.asObservable(),
      //suggestFn: (value, options) => this.suggestTargetSpecies(value, options),
      mobile: this.mobile
    });

    // Listen physical gear, to enablme/disable metier
    const metierControl = this.form.get('metier');
    const physicalGearControl = this.form.get('physicalGear');
    this.registerSubscription(
      physicalGearControl.valueChanges
        .pipe(
          distinctUntilChanged(EntityUtils.equals)
        )
        .subscribe(async (physicalGear) => {

          const hasPhysicalGear = EntityUtils.isNotEmpty(physicalGear);
          const gears = this._physicalGearsSubject.getValue() || this._trip && this._trip.gears;
          // Use same trip's gear Object (if found)
          if (hasPhysicalGear && isNotEmptyArray(gears)) {
            physicalGear = (gears || []).find(g => g.id === physicalGear.id);
            physicalGearControl.patchValue(physicalGear, {emitEvent: false});
          }

          const enableMetier = hasPhysicalGear && this.form.enabled && isNotEmptyArray(gears);
          if (enableMetier) {
            metierControl.enable();
          }
          else {
            metierControl.disable();
          }

          if (hasPhysicalGear) {

            // Refresh metiers
            const metiers = await this.loadMetiers(physicalGear);
            this._metiersSubject.next(metiers);

            const metier = metierControl.value;
            if (EntityUtils.isNotEmpty(metier)) {
              // Find new reference, by label (WARN: because of searchJoin, label = taxonGroup.label)
              const updatedMetier = (metiers || []).find(m => m.label === metier.label);
              // Update the metier, if not found (=reset) or ID changed
              if (!updatedMetier || !EntityUtils.equals(metier, updatedMetier)) {
                metierControl.setValue(updatedMetier);
              }
            }
          }
        })
    );
  }

  /**
   * Get the position by GPS sensor
   * @param fieldName
   */
  async fillPosition(fieldName: string) {

    const positionGroup = this.form.controls[fieldName];
    if (positionGroup && positionGroup instanceof FormGroup) {
      const coords = await this.getGeoCoordinates();
      positionGroup.patchValue(coords, {emitEvent: false, onlySelf: true});
    }
    // Set also the end date time
    if (fieldName === 'endPosition') {
      this.form.controls['endDateTime'].setValue(moment(), {emitEvent: false, onlySelf: true});
    }
    this.form.markAsDirty({onlySelf: true});
    this.form.updateValueAndValidity();
    this.markForCheck();
  }

  /**
   * Get the position by geo loc sensor
   */
  getGeoCoordinates(): Promise<{ latitude: number; longitude: number; }> {
    return new Promise<{ latitude: number; longitude: number; }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position: Position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (err) => {
          console.error(err);
          reject(err);
        },
        // Options
        { maximumAge: 3000, timeout: 1000, enableHighAccuracy: true }
      );
    });
  }

  copyPosition(source: string, target: string) {
    const value = this.form.get(source).value;

    this.form.get(target).patchValue({
      latitude: value.latitude,
      longitude: value.longitude
    }, {emitEvent: true});
    this.markAsDirty();
  }

  /* -- protected methods -- */

  protected async loadMetiers(physicalGear?: PhysicalGear|any): Promise<ReferentialRef[]> {

    // No gears selected: skip
    if (EntityUtils.isEmpty(physicalGear)) return undefined;

    const res = await this.referentialRefService.loadAll(0, 100, null,null,
      {
        entityName: "Metier",
        searchJoin: "TaxonGroup",
        levelId: physicalGear && physicalGear.gear && physicalGear.gear.id || undefined
      },
      {
        withTotal: false
      });
    return res.data;
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

}
