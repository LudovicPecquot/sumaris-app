import {ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, Optional, QueryList, ViewChild, ViewChildren} from '@angular/core';

import {
  AppEditorOptions,
  EntityServiceLoadOptions,
  EntityUtils,
  fadeInOutAnimation,
  firstArrayValue,
  firstNotNilPromise,
  fromDateISOString,
  HistoryPageReference,
  isEmptyArray,
  isNil,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrBlank,
  PlatformService,
  ReferentialRef,
  ReferentialUtils,
  UsageMode
} from '@sumaris-net/ngx-components';
import {LandingForm} from './landing.form';
import {SAMPLE_TABLE_DEFAULT_I18N_PREFIX, SamplesTable} from '../sample/samples.table';
import {LandingService} from '../services/landing.service';
import {AppRootDataEditor} from '@app/data/form/root-data-editor.class';
import {FormGroup} from '@angular/forms';
import {ObservedLocationService} from '../services/observed-location.service';
import {TripService} from '../services/trip.service';
import {debounceTime, filter, tap, throttleTime} from 'rxjs/operators';
import {ReferentialRefService} from '@app/referential/services/referential-ref.service';
import {VesselSnapshotService} from '@app/referential/services/vessel-snapshot.service';
import {Landing} from '../services/model/landing.model';
import {Trip} from '../services/model/trip.model';
import {ObservedLocation} from '../services/model/observed-location.model';
import {ProgramProperties} from '@app/referential/services/config/program.config';
import {Program} from '@app/referential/services/model/program.model';
import {environment} from '@environments/environment';
import {STRATEGY_SUMMARY_DEFAULT_I18N_PREFIX, StrategySummaryCardComponent} from '@app/data/strategy/strategy-summary-card.component';
import {merge, Subscription} from 'rxjs';
import {Strategy} from '@app/referential/services/model/strategy.model';
import * as momentImported from 'moment';
import {PmfmService} from '@app/referential/services/pmfm.service';
import {IPmfm} from '@app/referential/services/model/pmfm.model';
import {PmfmIds} from '@app/referential/services/model/model.enum';

const moment = momentImported;

const LANDING_DEFAULT_I18N_PREFIX = 'LANDING.EDIT.';

export class LandingEditorOptions extends AppEditorOptions {
}

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing.page.html',
  styleUrls: ['./landing.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeInOutAnimation],
  providers: [
    {
      provide: AppEditorOptions,
      useValue: {
        pathIdAttribute: 'landingId'
      }
    }
  ]
})
export class LandingPage extends AppRootDataEditor<Landing, LandingService> implements OnInit {

  protected parent: Trip | ObservedLocation;
  protected observedLocationService: ObservedLocationService;
  protected tripService: TripService;
  protected pmfmService: PmfmService;
  protected referentialRefService: ReferentialRefService;
  protected vesselService: VesselSnapshotService;
  protected platform: PlatformService;
  private _rowValidatorSubscription: Subscription;

  mobile: boolean;
  showEntityMetadata = false;
  showQualityForm = false;
  i18nPrefix = LANDING_DEFAULT_I18N_PREFIX;

  get form(): FormGroup {
    return this.landingForm.form;
  }

  @ViewChild('landingForm', { static: true }) landingForm: LandingForm;
  @ViewChild('samplesTable', { static: true }) samplesTable: SamplesTable;
  @ViewChild('strategyCard', {static: false}) strategyCard: StrategySummaryCardComponent;

  @ViewChild('firstTabInjection', {static: false}) firstTabInjection: ElementRef;
  @ViewChildren('tabContent') tabContents: QueryList<ElementRef>;

  constructor(
    injector: Injector,
    @Optional() options: LandingEditorOptions
  ) {
    super(injector, Landing, injector.get(LandingService), {
      tabCount: 2,
      pathIdAttribute: 'landingId',
      autoOpenNextTab: true,
      ...options
    });
    this.observedLocationService = injector.get(ObservedLocationService);
    this.tripService = injector.get(TripService);
    this.referentialRefService = injector.get(ReferentialRefService);
    this.vesselService = injector.get(VesselSnapshotService);
    this.platform = injector.get(PlatformService);

    this.mobile = this.platform.mobile;
    // FOR DEV ONLY ----
    this.debug = !environment.production;
  }

  ngAfterViewInit() {
    super.ngAfterViewInit();

    // Use landing date as default dateTime for samples
    this.registerSubscription(
      this.landingForm.form.get('dateTime').valueChanges
        .pipe(
          throttleTime(200),
          filter(isNotNil),
          tap(dateTime => this.samplesTable.defaultSampleDate = fromDateISOString(dateTime))
        )
        .subscribe());

    this.registerSubscription(
      this.landingForm.$strategyLabel
        .pipe(
          tap(strategyLabel => console.debug("[landing-page] Received strategy label: ", strategyLabel)),
          tap(strategyLabel => this.$strategyLabel.next(strategyLabel))
        )
        .subscribe());

    // Watch table events, to avoid strategy edition, when has sample rows
    this.registerSubscription(
      merge(
        this.samplesTable.onConfirmEditCreateRow,
        this.samplesTable.onCancelOrDeleteRow,
        this.samplesTable.onAfterDeletedRows
      )
        .pipe(debounceTime(500))
        .subscribe(() => this.landingForm.canEditStrategy = this.samplesTable.empty)
    );
  }

  protected registerForms() {
    this.addChildForms([this.landingForm, this.samplesTable]);
  }

  async reload(): Promise<void> {
    this.loading = true;
    const route = this.route.snapshot;
    await this.load(this.data && this.data.id, route.params);
  }

  protected async onNewEntity(data: Landing, options?: EntityServiceLoadOptions): Promise<void> {

    if (this.isOnFieldMode) {
      data.dateTime = moment();
    }

    // Fill parent ids
    data.observedLocationId = options && options.observedLocationId && parseInt(options.observedLocationId);
    data.tripId = options && options.tripId && parseInt(options.tripId);

    // Load parent
    this.parent = await this.loadParent(data);

    // Copy from parent into the new object
    if (this.parent) {
      const queryParams = this.route.snapshot.queryParams;
      data.program = this.parent.program;
      data.observers = this.parent.observers;
      if (this.parent instanceof ObservedLocation) {
        data.location = this.parent.location;
        data.dateTime = this.parent.startDateTime || this.parent.endDateTime;
        data.tripId = undefined;

        // Load the vessel, if any
        if (isNotNil(queryParams['vessel'])) {
          const vesselId = +queryParams['vessel'];
          console.debug(`[landing-page] Loading vessel {${vesselId}}...`);
          data.vesselSnapshot = await this.vesselService.load(vesselId, {fetchPolicy: 'cache-first'});
        }

        // Define back link
        this.defaultBackHref = `/observations/${this.parent.id}?tab=1`;
      }
      else if (this.parent instanceof Trip) {
        data.vesselSnapshot = this.parent.vesselSnapshot;
        data.location = this.parent.returnLocation || this.parent.departureLocation;
        data.dateTime = this.parent.returnDateTime || this.parent.departureDateTime;
        data.observedLocationId = undefined;

        // Define back link
        this.defaultBackHref = `/trips/${this.parent.id}?tab=2`;
      }

      // Set rankOrder
      if (isNotNil(queryParams['rankOrder'])) {
        data.rankOrder = +queryParams['rankOrder'];
      }
      else {
        data.rankOrder = 1;
      }
    }

    // Landing as root
    else {
      // Specific conf
    }

    this.showEntityMetadata = false;
    this.showQualityForm = false;

  }

  protected async onEntityLoaded(data: Landing, options?: EntityServiceLoadOptions): Promise<void> {

    this.parent = await this.loadParent(data);

    // Copy not fetched data
    if (this.parent) {
      // Set program using parent's program, if not already set
      data.program = ReferentialUtils.isNotEmpty(data.program) ? data.program : this.parent.program;
      data.observers = isNotEmptyArray(data.observers) && data.observers || this.parent.observers;

      if (this.parent instanceof ObservedLocation) {
        data.location = data.location || this.parent.location;
        data.dateTime = data.dateTime || this.parent.startDateTime || this.parent.endDateTime;
        data.tripId = undefined;

        // Define back link
        this.defaultBackHref = `/observations/${this.parent.id}?tab=1`;
      }
      else if (this.parent instanceof Trip) {
        data.vesselSnapshot = this.parent.vesselSnapshot;
        data.location = data.location || this.parent.returnLocation || this.parent.departureLocation;
        data.dateTime = data.dateTime || this.parent.returnDateTime || this.parent.departureDateTime;
        data.observedLocationId = undefined;

        this.defaultBackHref = `/trips/${this.parent.id}?tab=2`;
      }

      this.showEntityMetadata = EntityUtils.isRemote(data);
      this.showQualityForm = false;
    }
    // Landing as root
    else {
      this.showEntityMetadata = EntityUtils.isRemote(data);
      this.showQualityForm = this.showEntityMetadata;
    }
  }

  onPrepareSampleForm({form, pmfms}) {
    console.debug('[landing-page] Initializing sample form (validators...)');

    // Remove previous subscription
    if (this._rowValidatorSubscription) {
      this._rowValidatorSubscription.unsubscribe();
    }

    // Add computation and validation
    this._rowValidatorSubscription = this.computeSampleRowValidator(form, pmfms);
  }

  updateView(data: Landing | null, opts?: {
    emitEvent?: boolean;
    openTabIndex?: number;
    updateRoute?: boolean;
  }) {
    super.updateView(data, opts);

    if (this.parent) {
      if (this.parent instanceof ObservedLocation) {
        this.landingForm.showProgram = false;
        this.landingForm.showVessel = true;

      } else if (this.parent instanceof Trip) {

        // Hide some fields
        this.landingForm.showProgram = false;
        this.landingForm.showVessel = false;

      }
    } else {

      this.landingForm.showVessel = true;
      this.landingForm.showLocation = true;
      this.landingForm.showDateTime = true;

      this.showQualityForm = true;
    }
  }

  protected async setProgram(program: Program) {
    await super.setProgram(program);
    if (!program) return; // Skip

    // Customize the UI, using program options
    this.landingForm.locationLevelIds = program.getPropertyAsNumbers(ProgramProperties.OBSERVED_LOCATION_LOCATION_LEVEL_IDS);
    this.landingForm.allowAddNewVessel = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_CREATE_VESSEL_ENABLE);
    this.landingForm.requiredStrategy = program.getPropertyAsBoolean(ProgramProperties.LANDING_STRATEGY_ENABLE);
    this.landingForm.showStrategy = this.landingForm.requiredStrategy;
    this.landingForm.showObservers = program.getPropertyAsBoolean(ProgramProperties.LANDING_OBSERVERS_ENABLE);
    this.landingForm.showDateTime = program.getPropertyAsBoolean(ProgramProperties.LANDING_DATE_TIME_ENABLE);
    this.landingForm.showLocation = program.getPropertyAsBoolean(ProgramProperties.LANDING_LOCATION_ENABLE);

    // Compute i18n prefix
    let i18nSuffix = program.getProperty(ProgramProperties.I18N_SUFFIX);
    i18nSuffix = (i18nSuffix && i18nSuffix !== 'legacy') ? i18nSuffix : '';
    this.i18nPrefix = LANDING_DEFAULT_I18N_PREFIX + i18nSuffix;
    this.landingForm.i18nPrefix = this.i18nPrefix;

    if (this.samplesTable) {
      this.samplesTable.modalOptions = {
        ...this.samplesTable.modalOptions,
        maxVisibleButtons: program.getPropertyAsInt(ProgramProperties.MEASUREMENTS_MAX_VISIBLE_BUTTONS)
      };
      this.samplesTable.i18nColumnPrefix = SAMPLE_TABLE_DEFAULT_I18N_PREFIX + i18nSuffix;
      this.samplesTable.programLabel = program.label;
    }

    if (this.strategyCard) {
      this.strategyCard.i18nPrefix = STRATEGY_SUMMARY_DEFAULT_I18N_PREFIX + i18nSuffix;
    }

    // Listen program's strategies change (will reload strategy if need)
    this.startListenProgramRemoteChanges(program);
    this.startListenStrategyRemoteChanges(program);
  }

  protected async setStrategy(strategy: Strategy) {
    await super.setStrategy(strategy);

    if (!strategy) return; // Skip if empty

    this.landingForm.strategyLabel = strategy.label;
    if (this.strategyCard) {
      this.strategyCard.value = strategy;
    }
    this.samplesTable.strategyLabel = strategy.label;

    // Set table defaults
    const taxonNameStrategy = firstArrayValue(strategy.taxonNames);
    this.samplesTable.defaultTaxonName = taxonNameStrategy && taxonNameStrategy.taxonName;
    this.samplesTable.showTaxonGroupColumn = false;

    // We use pmfms from strategy and from sampling data. Some pmfms are only stored in data.
    const strategyPmfms: IPmfm[] = (strategy.denormalizedPmfms || []).filter(p => p.acquisitionLevel === this.samplesTable.acquisitionLevel);
    const strategyPmfmIds = strategyPmfms.map(pmfm => pmfm.id);

    // Retrieve additional pmfms, from data (= PMFMs NOT in the strategy)
    const additionalPmfmIds = (this.data.samples || []).reduce((res, sample) => {
      const pmfmIds = Object.keys(sample.measurementValues || {}).map(id => +id);
      const newPmfmIds = pmfmIds.filter(id => !res.includes(id) && !strategyPmfmIds.includes(id));
      return newPmfmIds.length ? res.concat(...newPmfmIds) : res;
    }, []);

    // Override samples table pmfm, if need
    if (isNotEmptyArray(additionalPmfmIds)) {

      // Load additional pmfms, from ids
      const additionalPmfms = await Promise.all(additionalPmfmIds.map(id => this.pmfmService.load(id)));

      // IMPORTANT: Make sure pmfms have been loaded once, BEFORE override.
      // (Elsewhere, the strategy's PMFM will be applied after the override, and additional PMFM will be lost)
      await this.samplesTable.ready();

      // Applying additional PMFMs
      this.samplesTable.pmfms = [
        ...strategyPmfms,
        ...additionalPmfms
      ];
    }

  }

  protected async loadParent(data: Landing): Promise<Trip | ObservedLocation> {
    let parent: Trip|ObservedLocation;

    // Load parent observed location
    if (isNotNil(data.observedLocationId)) {
      console.debug('[landing-page] Loading parent observed location...');
      parent = await this.observedLocationService.load(data.observedLocationId, {fetchPolicy: 'cache-first'});
    }
    // Load parent trip
    else if (isNotNil(data.tripId)) {
      console.debug('[landing-page] Loading parent trip...');
      parent = await this.tripService.load(data.tripId, {fetchPolicy: 'cache-first'});
    }
    else {
      throw new Error('No parent found in path. Landing without parent not implemented yet !');
    }

    // Emit program
    if (parent.program && parent.program.label) {
      this.$programLabel.next(parent.program.label);
    }

    return parent;
  }

  protected async setValue(data: Landing): Promise<void> {
    if (!data) return; // Skip

    const strategyLabel = data.measurementValues && data.measurementValues[PmfmIds.STRATEGY_LABEL];
    if (strategyLabel) {
      this.landingForm.$strategyLabel.next(strategyLabel);
    }

    this.landingForm.canEditStrategy = isNil(strategyLabel) || isEmptyArray(data.samples);
    this.landingForm.value = data;

    // Set samples to table
    this.samplesTable.value = data.samples || [];

  }

  protected async computePageHistory(title: string): Promise<HistoryPageReference> {
    return {
      ... (await super.computePageHistory(title)),
      icon: 'boat'
    };
  }

  protected async computeTitle(data: Landing): Promise<string> {

    const program = await firstNotNilPromise(this.$program);
    let i18nSuffix = program.getProperty(ProgramProperties.I18N_SUFFIX);
    i18nSuffix = i18nSuffix !== 'legacy' && i18nSuffix || '';

    const titlePrefix = this.parent && (this.parent instanceof ObservedLocation) &&
      await this.translate.get('LANDING.EDIT.TITLE_PREFIX', {
        location: (this.parent.location && (this.parent.location.name || this.parent.location.label)),
        date: this.parent.startDateTime && this.dateFormat.transform(this.parent.startDateTime) as string || ''
      }).toPromise() || '';

    // new data
    if (!data || isNil(data.id)) {
      return titlePrefix + (await this.translate.get(`LANDING.NEW.${i18nSuffix}TITLE`).toPromise());
    }

    // Existing data
    return titlePrefix + (await this.translate.get(`LANDING.EDIT.${i18nSuffix}TITLE`, {
      vessel: data.vesselSnapshot && (data.vesselSnapshot.exteriorMarking || data.vesselSnapshot.name)
    }).toPromise());
  }

  protected computePageUrl(id: number|'new') {
    const parentUrl = this.getParentPageUrl();
    return `${parentUrl}/landing/${id}`;
  }

  protected getFirstInvalidTabIndex(): number {
    if (this.landingForm.invalid) return 0;
    if (this.samplesTable.invalid) return 1;
    return -1;
  }

  protected computeUsageMode(landing: Landing): UsageMode {
    return this.settings.isUsageMode('FIELD')
      // Force desktop mode if landing date/time is 1 day later than now
      && (isNil(landing && landing.dateTime) || landing.dateTime.diff(moment(), "day") <= 1) ? 'FIELD' : 'DESK';
  }

  protected async getValue(): Promise<Landing> {
    console.debug('[landing-page] DEV get value');
    const data = await super.getValue();

    // Re add program, because program control can be disabled
    data.program = ReferentialRef.fromObject(this.form.controls['program'].value);

    // Workaround, because sometime measurementValues is empty (see issue IMAGINE-273)
    data.measurementValues = this.form.controls.measurementValues?.value || {};
    if (isNotNilOrBlank(this.$strategyLabel.getValue())) {
      data.measurementValues[PmfmIds.STRATEGY_LABEL] = this.$strategyLabel.getValue();
    }

    // Save samples table
    if (this.samplesTable.dirty) {
      await this.samplesTable.save();
    }
    data.samples = this.samplesTable.value;

    // DEBUG
    //console.debug('[landing-page] DEV check getValue() result:', data);

    return data;
  }

  protected getJsonValueToSave(): Promise<any> {
    return this.landingForm.value.asObject();
  }

  protected computeSampleRowValidator(form: FormGroup, pmfms: IPmfm[]): Subscription {
    console.warn('[landing-page] No row validator override');
    // Can be override by subclasses (e.g auction control, biological sampling samples table)
    return null;
  }
}
