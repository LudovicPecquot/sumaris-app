import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, ViewChild} from '@angular/core';
import {TripValidatorService} from '../services/validator/trip.validator';
import {ModalController} from '@ionic/angular';
import {Moment} from 'moment';
import {DateAdapter} from '@angular/material/core';
import {LocationLevelIds} from '@app/referential/services/model/model.enum';

import {
  AppForm,
  EntityUtils,
  FormArrayHelper,
  fromDateISOString,
  isEmptyArray,
  isNil,
  isNotNil,
  isNotNilOrBlank,
  LoadResult,
  LocalSettingsService,
  MatAutocompleteField,
  NetworkService,
  Person,
  PersonService,
  PersonUtils,
  ReferentialRef,
  referentialToString,
  ReferentialUtils,
  StatusIds,
  toBoolean,
  UsageMode,
  UserProfileLabel
} from '@sumaris-net/ngx-components';
import {VesselSnapshotService} from '@app/referential/services/vessel-snapshot.service';
import {FormArray, FormBuilder} from '@angular/forms';

import {Vessel} from '@app/vessel/services/model/vessel.model';
import {METIER_DEFAULT_FILTER, MetierService} from '@app/referential/services/metier.service';
import {Trip} from '../services/model/trip.model';
import {ReferentialRefService} from '@app/referential/services/referential-ref.service';
import {debounceTime, filter} from 'rxjs/operators';
import {VesselModal} from '@app/vessel/modal/vessel-modal';
import {VesselSnapshot} from '@app/referential/services/model/vessel-snapshot.model';
import {ReferentialRefFilter} from '@app/referential/services/filter/referential-ref.filter';
import {Metier} from '@app/referential/services/model/taxon.model';
import {MetierFilter} from '@app/referential/services/filter/metier.filter';

const TRIP_METIER_DEFAULT_FILTER = METIER_DEFAULT_FILTER;

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'form-trip',
  templateUrl: './trip.form.html',
  styleUrls: ['./trip.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripForm extends AppForm<Trip> implements OnInit {

  private _showObservers: boolean;
  private _showMetiers: boolean;

  observersHelper: FormArrayHelper<Person>;
  observerFocusIndex = -1;
  enableMetierFilter = false;
  metierFilter: Partial<MetierFilter>;
  metiersHelper: FormArrayHelper<ReferentialRef>;
  metierFocusIndex = -1;
  locationFilter: Partial<ReferentialRefFilter> = {
    entityName: 'Location',
    levelIds: [LocationLevelIds.PORT]
  };
  canFilterMetier = false;
  mobile: boolean;

  @Input() showComment = true;
  @Input() showAddVessel = true;
  @Input() showError = true;
  @Input() usageMode: UsageMode;
  @Input() vesselDefaultStatus = StatusIds.TEMPORARY;
  @Input() metierHistoryNbDays = 60;

  @Input() set showObservers(value: boolean) {
    if (this._showObservers !== value) {
      this._showObservers = value;
      this.initObserversHelper();
      this.markForCheck();
    }
  }

  get showObservers(): boolean {
    return this._showObservers;
  }

  @Input() set showMetiers(value: boolean) {
    if (this._showMetiers !== value) {
      this._showMetiers = value;
      this.initMetiersHelper();
      this.markForCheck();
    }
  }

  get showMetiers(): boolean {
    return this._showMetiers;
  }

  @Input() set locationLevelIds(value: number[]) {
    if (this.locationFilter.levelIds !== value) {

      console.debug("[trip-form] Location level ids:", value);
      this.locationFilter = {
        ...this.locationFilter,
        entityName: 'Location',
        levelIds: value
      };
      this.markForCheck();
    }
  }

  get locationLevelIds(): number[] {
    return this.locationFilter && this.locationFilter.levelIds;
  }

  get vesselSnapshot(): VesselSnapshot {
    return this.form.get('vesselSnapshot').value as VesselSnapshot;
  }

  get value(): any {
    const json = this.form.value;

    // Add program, because if control disabled the value is missing
    json.program = this.form.get('program').value;

    // Force remove all observers
    if (!this._showObservers) {
      json.observers = [];
    }

    return json;
  }

  set value(json: any) {
    this.setValue(json);
  }

  get observersForm(): FormArray {
    return this.form.controls.observers as FormArray;
  }

  get metiersForm(): FormArray {
    return this.form.controls.metiers as FormArray;
  }

  @ViewChild('metierField') metierField: MatAutocompleteField;

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected formBuilder: FormBuilder,
    protected validatorService: TripValidatorService,
    protected vesselSnapshotService: VesselSnapshotService,
    protected referentialRefService: ReferentialRefService,
    protected metierService: MetierService,
    protected personService: PersonService,
    protected modalCtrl: ModalController,
    protected settings: LocalSettingsService,
    public network: NetworkService,
    protected cd: ChangeDetectorRef
  ) {

    super(dateAdapter, validatorService.getFormGroup(), settings);
    this.mobile = this.settings.mobile;
  }

  ngOnInit() {
    super.ngOnInit();

    // Default values
    this.showObservers = toBoolean(this.showObservers, true); // Will init the observers helper
    this.showMetiers = toBoolean(this.showMetiers, true); // Will init the metiers helper
    this.usageMode = this.usageMode || this.settings.usageMode;
    if (isEmptyArray(this.locationLevelIds)) this.locationLevelIds = [LocationLevelIds.PORT];

    // Combo: programs
    const programAttributes = this.settings.getFieldDisplayAttributes('program');
    this.registerAutocompleteField('program', {
      service: this.referentialRefService,
      attributes: programAttributes,
      // Increase default column size, for 'label'
      columnSizes: programAttributes.map(a => a === 'label' ? 4 : undefined/*auto*/),
      filter: <ReferentialRefFilter>{
        entityName: 'Program'
      },
      mobile: this.mobile
    });

    // Combo: vessels
    const vesselField = this.registerAutocompleteField('vesselSnapshot', {
      service: this.vesselSnapshotService,
      attributes: this.settings.getFieldDisplayAttributes('vesselSnapshot', ['exteriorMarking', 'name']),
      filter: {
        statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY]
      }
    });
    // Add base port location
    vesselField.attributes = vesselField.attributes.concat(this.settings.getFieldDisplayAttributes('location').map(key => 'basePortLocation.' + key));

    // Combo location
    this.registerAutocompleteField('location', {
      service: this.referentialRefService,
      filter: this.locationFilter
    });

    // Combo: observers
    this.registerAutocompleteField('person', {
      // Important, to get the current (focused) control value, in suggestObservers() function (otherwise it will received '*').
      showAllOnFocus: false,
      suggestFn: (value, filter) => this.suggestObservers(value, filter),
      // Default filter. An excludedIds will be add dynamically
      filter: {
        statusIds: [StatusIds.TEMPORARY, StatusIds.ENABLE],
        userProfiles: <UserProfileLabel[]>['SUPERVISOR', 'USER', 'GUEST']
      },
      attributes: ['lastName', 'firstName', 'department.name'],
      displayWith: PersonUtils.personToString
    });

    // Combo: metiers
    const metierAttributes = this.settings.getFieldDisplayAttributes('metier');
    this.registerAutocompleteField<ReferentialRef>('metier', {
      // Important, to get the current (focused) control value, in suggestMetiers() function (otherwise it will received '*').
      //showAllOnFocus: false,
      suggestFn: (value, options) => this.suggestMetiers(value, options),
      // Default filter. An excludedIds will be add dynamically
      filter: {
        statusIds: [StatusIds.TEMPORARY, StatusIds.ENABLE]
      },
      // Increase default column size, for 'label'
      columnSizes: metierAttributes.map(a => a === 'label' ? 3 : undefined/*auto*/),
      attributes: metierAttributes,
      mobile: this.mobile
    });

    // Update metier filter when form changed (if filter enable)
    this.registerSubscription(
      this.form.valueChanges
        .pipe(
          debounceTime(250),
          filter(_ => this._showMetiers)
        )
        .subscribe((value) => this.updateMetierFilter(value))
    );
  }

  toggleFilteredMetier() {
    if (this.enableMetierFilter) {
      this.enableMetierFilter = false;
    }
    else {
      const value = this.form.value;
      const date = value.returnDateTime || value.departureDateTime;
      const vesselId = value.vesselSnapshot && value.vesselSnapshot.id;
      this.enableMetierFilter = date && isNotNil(vesselId);
    }

    // Update the metier filter
    this.updateMetierFilter();
  }

  setValue(value: Trip, opts?: { emitEvent?: boolean; onlySelf?: boolean }) {

    if (!value) return;

    // Make sure to have (at least) one observer
    value.observers = value.observers && value.observers.length ? value.observers : [null];

    // Resize observers array
    if (this._showObservers) {
      this.observersHelper.resize(Math.max(1, value.observers.length));
    }
    else {
      this.observersHelper.removeAllEmpty();
    }

    // Make sure to have (at least) one metier
    value.metiers = value.metiers && value.metiers.length ? value.metiers : [null];
    // Resize metiers array
    if (this._showMetiers) {
      this.metiersHelper.resize(Math.max(1, value.metiers.length));
    } else {
      this.metiersHelper.removeAllEmpty();
    }

    // Send value for form
    super.setValue(value, opts);
  }

  async addVesselModal(): Promise<any> {
    const modal = await this.modalCtrl.create({
      component: VesselModal,
      componentProps: {
        defaultStatus: this.vesselDefaultStatus
      }
    });

    await modal.present();

    const res = await modal.onDidDismiss();

    // if new vessel added, use it
    const vessel = res && res.data;
    if (vessel) {
      const vesselSnapshot = (vessel instanceof VesselSnapshot)
        ? vessel
        : ((vessel instanceof Vessel) ? VesselSnapshot.fromVessel(vessel) : VesselSnapshot.fromObject(vessel));
      console.debug("[trip-form] New vessel added : updating form...", vesselSnapshot);
      this.form.controls['vesselSnapshot'].setValue(vesselSnapshot);
      this.markForCheck();
    } else {
      console.debug("[trip-form] No vessel added (user cancelled)");
    }
  }

  addObserver() {
    this.observersHelper.add();
    if (!this.mobile) {
      this.observerFocusIndex = this.observersHelper.size() - 1;
    }
  }

  addMetier() {
    this.metiersHelper.add();
    if (!this.mobile) {
      this.metierFocusIndex = this.metiersHelper.size() - 1;
    }
  }

  referentialToString = referentialToString;

  /* -- protected methods-- */

  protected initObserversHelper() {
    if (isNil(this._showObservers)) return; // skip if not loading yet

    // Create helper, if need
    if (!this.observersHelper) {
      this.observersHelper = new FormArrayHelper<Person>(
        FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'observers'),
        (person) => this.validatorService.getObserverControl(person),
        ReferentialUtils.equals,
        ReferentialUtils.isEmpty,
        {
          allowEmptyArray: !this._showObservers
        }
      );
    }

    // Helper exists: update options
    else {
      this.observersHelper.allowEmptyArray = !this._showObservers;
    }

    if (this._showObservers) {
      // Create at least one observer
      if (this.observersHelper.size() === 0) {
        this.observersHelper.resize(1);
      }
    } else if (this.observersHelper.size() > 0) {
      this.observersHelper.resize(0);
    }
  }

  protected initMetiersHelper() {
    if (isNil(this._showMetiers)) return; // skip if not loading yet

    this.metiersHelper = new FormArrayHelper<ReferentialRef>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'metiers'),
      (metier) => this.validatorService.getMetierControl(metier),
      ReferentialUtils.equals,
      ReferentialUtils.isEmpty,
      {
        allowEmptyArray: !this._showMetiers
      }
    );

    if (this._showMetiers) {
      // Create at least one metier
      if (this.metiersHelper.size() === 0) {
        this.metiersHelper.resize(1);

      }
    } else if (this.metiersHelper.size() > 0) {
      this.metiersHelper.resize(0);
    }
  }

  protected updateMetierFilter(value?: Trip) {
    console.debug("[trip-form] Updating metier filter...");
    value = value || this.form.value as Trip;
    const program = value.program || this.form.get('program').value;
    const programLabel = program && program.label;
    const endDate = fromDateISOString(value.returnDateTime || value.departureDateTime);
    const vesselId = value.vesselSnapshot && value.vesselSnapshot.id;

    const canFilterMetier = endDate && isNotNilOrBlank(programLabel) && isNotNil(vesselId);

    let metierFilter: Partial<MetierFilter>;
    if (!this.enableMetierFilter || !canFilterMetier) {
      metierFilter = TRIP_METIER_DEFAULT_FILTER;
    }
    else {
      const startDate = endDate.clone().startOf('day').add(-1 * this.metierHistoryNbDays, 'day');
      const excludedTripId = EntityUtils.isRemote(value) ? value.id : undefined;

      metierFilter = {
        ...TRIP_METIER_DEFAULT_FILTER,
        programLabel,
        vesselId,
        startDate,
        endDate,
        excludedTripId
      };
    }
    if (this.canFilterMetier !== canFilterMetier || this.metierFilter !== metierFilter) {
      this.canFilterMetier = canFilterMetier;
      this.metierFilter = metierFilter;
      this.markForCheck();
      this.metierField.reloadItems();
    }
  }

  protected suggestObservers(value: any, filter?: any): Promise<LoadResult<Person>> {
    const currentControlValue = ReferentialUtils.isNotEmpty(value) ? value : null;
    const newValue = currentControlValue ? '*' : value;

    // Excluded existing observers, BUT keep the current control value
    const excludedIds = (this.observersForm.value || [])
      .filter(ReferentialUtils.isNotEmpty)
      .filter(person => !currentControlValue || currentControlValue !== person)
      .map(person => parseInt(person.id));

    return this.personService.suggest(newValue, {
      ...filter,
      excludedIds
    });
  }

  protected suggestMetiers(value: any, filter?: Partial<MetierFilter>): Promise<LoadResult<Metier>> {
    const currentControlValue = ReferentialUtils.isNotEmpty(value) ? value : null;
    const newValue = currentControlValue ? '*' : value;

    // Excluded existing observers, BUT keep the current control value
    const excludedIds = (this.metiersForm.value || [])
      .filter(ReferentialUtils.isNotEmpty)
      .filter(metier => !currentControlValue || currentControlValue !== metier)
      .map(metier => parseInt(metier.id));

    return this.metierService.suggest(newValue, {
      ...filter,
      ...this.metierFilter,
      excludedIds
    });
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
