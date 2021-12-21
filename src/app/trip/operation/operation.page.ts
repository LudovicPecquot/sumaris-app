import { ChangeDetectionStrategy, Component, Injector, ViewChild, ViewEncapsulation } from '@angular/core';
import { OperationSaveOptions, OperationService } from '../services/operation.service';
import { OperationForm } from './operation.form';
import { TripService } from '../services/trip.service';
import { MeasurementsForm } from '../measurement/measurements.form.component';
import {
  AppEntityEditor,
  AppHelpModal,
  EntityServiceLoadOptions,
  EntityUtils,
  fadeInOutAnimation,
  firstNotNilPromise,
  fromDateISOString,
  HistoryPageReference,
  Hotkeys,
  IEntity,
  isNil,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrBlank,
  PlatformService,
  ReferentialUtils,
  toBoolean,
  toNumber,
  UsageMode,
} from '@sumaris-net/ngx-components';
import { MatTabChangeEvent } from '@angular/material/tabs';
import { debounceTime, distinctUntilChanged, filter, map, mergeMap, startWith, switchMap, tap } from 'rxjs/operators';
import { FormGroup, Validators } from '@angular/forms';
import * as momentImported from 'moment';
import { Program } from '@app/referential/services/model/program.model';
import { Operation, Trip } from '../services/model/trip.model';
import { ProgramProperties } from '@app/referential/services/config/program.config';
import { AcquisitionLevelCodes, AcquisitionLevelType, PmfmIds, QualitativeLabels, QualityFlagIds } from '@app/referential/services/model/model.enum';
import { BatchTreeComponent } from '../batch/batch-tree.component';
import { environment } from '@environments/environment';
import { ProgramRefService } from '@app/referential/services/program-ref.service';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Measurement, MeasurementUtils } from '@app/trip/services/model/measurement.model';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { SampleTreeComponent } from '@app/trip/sample/sample-tree.component';
import { OperationValidators, PmfmForm } from '@app/trip/services/validator/operation.validator';
import { Moment } from 'moment';

const moment = momentImported;


@Component({
  selector: 'app-operation-page',
  templateUrl: './operation.page.html',
  styleUrls: ['./operation.page.scss'],
  animations: [fadeInOutAnimation],
  providers: [
    {
      provide: IonRouterOutlet,
      useValue: {
        // Tweak the IonRouterOutlet if this component shown in a modal
        canGoBack: () => false,
        nativeEl: '',
      },
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OperationPage extends AppEntityEditor<Operation, OperationService> {


  private static TABS = {
    GENERAL: 0,
    CATCH: 1,
    SAMPLE: 2
  };

  private _lastOperationsTripId: number;
  private _measurementSubscription: Subscription;
  private _sampleRowSubscription: Subscription;

  readonly dateTimePattern: string;
  readonly showLastOperations: boolean;
  readonly mobile: boolean;
  readonly $acquisitionLevel = new BehaviorSubject<string>(AcquisitionLevelCodes.OPERATION);
  readonly $programLabel = new BehaviorSubject<string>(null);
  readonly $tripId = new BehaviorSubject<number>(null);
  readonly $lastOperations = new BehaviorSubject<Operation[]>(null);
  readonly $maxDateChanges = new BehaviorSubject<Moment>(null);

  trip: Trip;
  measurements: Measurement[];
  saveOptions: OperationSaveOptions = {};
  rankOrder: number;
  selectedSubTabIndex = 0;
  copyTripDates = false;
  allowParentOperation = false;
  autoFillBatch = false;
  autoFillDatesFromTrip = false;

  // All second tabs components are disabled, by default (waiting PMFM measurements to decide that to show)
  showCatchTab = false;
  showSamplesTab = false;
  showBatchTables = false;
  showBatchTablesByProgram = true;
  showSampleTablesByProgram = false;

  @ViewChild('opeForm', {static: true}) opeForm: OperationForm;
  @ViewChild('measurementsForm', {static: true}) measurementsForm: MeasurementsForm;

  // Catch batch, sorting batches, individual measure
  @ViewChild('batchTree', {static: true}) batchTree: BatchTreeComponent;

  // Sample tables
  @ViewChild('sampleTree', {static: true}) sampleTree: SampleTreeComponent;

  get form(): FormGroup {
    return this.opeForm.form;
  }

  get showFabButton(): boolean {
    if (!this._enabled) return false;
    switch (this._selectedTabIndex) {
      case OperationPage.TABS.CATCH:
        return this.showBatchTables;
      case OperationPage.TABS.SAMPLE:
        return this.showSamplesTab;
      default:
        return false;
    }
  }

  constructor(
    injector: Injector,
    hotkeys: Hotkeys,
    dataService: OperationService,
    protected tripService: TripService,
    protected programRefService: ProgramRefService,
    protected platform: PlatformService,
    protected modalCtrl: ModalController
  ) {
    super(injector, Operation, dataService, {
      pathIdAttribute: 'operationId',
      tabCount: 3,
      autoOpenNextTab: !platform.mobile
    });

    this.dateTimePattern = this.translate.instant('COMMON.DATE_TIME_PATTERN');

    // Init mobile
    this.mobile = platform.mobile;
    this.showLastOperations = this.settings.isUsageMode('FIELD');


    this.registerSubscription(
      hotkeys.addShortcut({keys: 'f1', description: 'COMMON.BTN_SHOW_HELP', preventDefault: true})
        .subscribe((event) => this.openHelpModal(event))
    )

    // FOR DEV ONLY ----
    this.debug = !environment.production;
  }

  async openHelpModal(event) {
    if (event) event.preventDefault();

    console.debug('[operation-page] Open help page...');
    const modal = await this.modalCtrl.create({
      component: AppHelpModal,
      componentProps: {
        title: 'COMMON.BTN_SHOW_HELP',
        docUrl: 'https://gitlab.ifremer.fr/sih-public/sumaris/sumaris-doc/-/blob/master/user-manual/index_fr.md'
      },
      backdropDismiss: true
    });
    return modal.present();
  }

  ngOnInit() {
    super.ngOnInit();

    // Watch program, to configure tables from program properties
    this.registerSubscription(
      this.$programLabel
        .pipe(
          filter(isNotNilOrBlank),
          distinctUntilChanged(),
          switchMap(programLabel => this.programRefService.watchByLabel(programLabel))
        )
        .subscribe(program => this.setProgram(program)));


    // Watch trip
    this.registerSubscription(
      this.$tripId
        .pipe(
          // Only if tripId changes
          filter(tripId => isNotNil(tripId) && this._lastOperationsTripId !== tripId),

          // Update default back Href
          tap(tripId => {
            this._lastOperationsTripId = tripId; // Remember new trip id
            // Update back href
            const tripHref = `/trips/${tripId}?tab=2`;
            if (this.defaultBackHref !== tripHref) {
              this.defaultBackHref = tripHref;
              this.markForCheck();
            }
          }),

          // Load last operations (if enabled)
          //filter(_ => this.showLastOperations),
          switchMap(tripId => this.dataService.watchAll(
            0, 5,
            'startDateTime', 'desc',
            {tripId}, {
              withBatchTree: false,
              withSamples: false,
              computeRankOrder: false,
              fetchPolicy: 'cache-and-network',
              withTotal: true
            })),
          map(res => res && res.data || []),
          tap(data => this.$lastOperations.next(data))
        )
        .subscribe()
    );

  }

  ngAfterViewInit() {
    super.ngAfterViewInit();

    this.registerSubscription(
      this.form.get('physicalGear').valueChanges
        .pipe(
          // skip if loading
          filter(() => !this.loading)
        )
        .subscribe((res) => {
          const gearId = res && res.gear && res.gear.id || null;
          this.measurementsForm.gearId = gearId;
          this.batchTree.gearId = gearId;
        })
    );

    if (this.measurementsForm) {
      this.registerSubscription(
        this.measurementsForm.$pmfms
          .pipe(
            debounceTime(400),
            filter(isNotNil),
            mergeMap(_ => this.measurementsForm.ready())
          )
          .subscribe(_ => this.onMeasurementsFormReady())
      );
    }

    // Manage tab group
    {
      const queryParams = this.route.snapshot.queryParams;
      const subTabIndex = queryParams['subtab'] && parseInt(queryParams['subtab']) || 0;
      this.selectedSubTabIndex = subTabIndex;
    }
  }

  /**
   * Configure specific behavior
   */
  protected async onMeasurementsFormReady() {

    // Wait program to be loaded
    //await this.ready();

    // DEBUG
    console.debug('[operation-page] Measurement form is ready');

    // Clean existing subscription (e.g. when acquisition level change, this function can= be called many times)
    this._measurementSubscription?.unsubscribe();
    this._measurementSubscription = new Subscription();

    const formGroup = this.measurementsForm.form as FormGroup;
    let defaultTableStates = true;

    // If PMFM "Sampling type" exists (e.g. SUMARiS), then use to enable/disable some tables
    const samplingTypeControl = formGroup?.controls[PmfmIds.SURVIVAL_SAMPLING_TYPE];
    if (isNotNil(samplingTypeControl)) {
      defaultTableStates = false;
      this.showCatchTab = this.batchTree.showCatchForm;
      this._measurementSubscription.add(
        samplingTypeControl.valueChanges
          .pipe(
            debounceTime(400),
            startWith<any, any>(samplingTypeControl.value),
            filter(ReferentialUtils.isNotEmpty),
            map(qv => qv.label),
            distinctUntilChanged()
          )
          .subscribe(qvLabel => {

            switch (qvLabel as string) {
              case QualitativeLabels.SURVIVAL_SAMPLING_TYPE.SURVIVAL:
                if (this.debug) console.debug('[operation] Enable samples tables');
                this.showBatchTablesByProgram = false;
                this.showSampleTablesByProgram = true;
                break;
              case QualitativeLabels.SURVIVAL_SAMPLING_TYPE.CATCH_HAUL:
                if (this.debug) console.debug('[operation] Enable batches tables');
                this.showBatchTablesByProgram = true;
                this.showSampleTablesByProgram = false;
                break;
              case QualitativeLabels.SURVIVAL_SAMPLING_TYPE.UNSAMPLED:
                if (this.debug) console.debug('[operation] Disable samples and batches tables');
                this.showBatchTablesByProgram = false;
                this.showSampleTablesByProgram = false;
            }

            this.showBatchTables = this.showBatchTablesByProgram;
            this.showSamplesTab = this.showSampleTablesByProgram;
            this.tabCount = 2 + (this.showSamplesTab ? 3 : 0);

            // Force first sub tab index, if modification was done from the form
            // This condition avoid to change subtab, when reloading the page
            if (this.selectedTabIndex == OperationPage.TABS.GENERAL) {
              this.selectedSubTabIndex = 0;
            }
            this.updateTablesState();
            this.markForCheck();
          })
      );
    }

    // If PMFM "Has accidental catches ?" exists, then use to enable/disable sample tables
    const hasAccidentalCatchesControl = formGroup?.controls[PmfmIds.HAS_ACCIDENTAL_CATCHES];
    if (isNotNil(hasAccidentalCatchesControl)) {
      defaultTableStates = true; // Applying defaults (because will not manage the catch
      hasAccidentalCatchesControl.setValidators(Validators.required);
      this._measurementSubscription.add(
        hasAccidentalCatchesControl.valueChanges
          .pipe(
            debounceTime(400),
            startWith<any, any>(hasAccidentalCatchesControl.value),
            filter(isNotNil),
            distinctUntilChanged()
          )
          .subscribe(hasAccidentalCatches => {

            if (this.debug) console.debug('[operation] Enable/Disable samples table, because HAS_ACCIDENTAL_CATCHES=' + hasAccidentalCatches);

            // Enable samples, when has accidental catches
            this.showSampleTablesByProgram = hasAccidentalCatches;
            this.showSamplesTab = this.showSampleTablesByProgram;
            this.showCatchTab = this.showBatchTables || this.batchTree.showCatchForm;
            this.tabCount = 2 + (this.showSamplesTab ? 3 : 0);

            // Force first tab index
            if (this.selectedTabIndex == OperationPage.TABS.GENERAL) {
              this.selectedSubTabIndex = 0;
            }
            this.updateTablesState();
            this.markForCheck();
          })
      );
    }

    if (this.allowParentOperation) {
      defaultTableStates = false;
      this._measurementSubscription.add(
        this.opeForm.onParentChanges
          .pipe(
            startWith<Operation>(this.opeForm.parentControl.value as Operation),
            map(parent => !!parent), // into boolean
            distinctUntilChanged()
          )
          .subscribe((hasParent) => {
            let acquisitionLevel: AcquisitionLevelType;
            if (hasParent) {
              if (this.debug) console.debug('[operation] Enable batch tables');
              this.showBatchTables = this.showBatchTablesByProgram;
              this.showSamplesTab = this.showSampleTablesByProgram;
              this.showCatchTab = this.showBatchTables || this.batchTree.showCatchForm;
              this.tabCount = 2 + (this.showSamplesTab ? 3 : 0);
              acquisitionLevel = AcquisitionLevelCodes.CHILD_OPERATION;
            } else {
              if (this.debug) console.debug('[operation] Disable batch tables');
              this.showBatchTables = false;
              this.showSamplesTab = false;
              this.showCatchTab = false;
              this.tabCount = 1;
              acquisitionLevel = AcquisitionLevelCodes.OPERATION;
            }

            // Change acquisition level, if need
            if (this.$acquisitionLevel.value !== acquisitionLevel) {
              this.measurementsForm.setAcquisitionLevel(acquisitionLevel, []/* force cleaning previous values*/);
              this.$acquisitionLevel.next(acquisitionLevel);
            }

            // Force first tab index
            if (this.selectedTabIndex == OperationPage.TABS.GENERAL) {
              this.selectedSubTabIndex = 0;
            }
            this.updateTablesState();
            this.markForCheck();
          })
      );
    }

    const hasIndividualMeasuresControl = formGroup?.controls[PmfmIds.HAS_INDIVIDUAL_MEASURES];
    if (isNotNil(hasIndividualMeasuresControl)) {
      if (!this.allowParentOperation) {
        defaultTableStates = true;
      }
      this._measurementSubscription.add(
        hasIndividualMeasuresControl.valueChanges
          .pipe(
            debounceTime(400),
            startWith<any, any>(hasIndividualMeasuresControl.value),
            filter(isNotNil),
            distinctUntilChanged()
          )
          .subscribe(hasIndividualMeasures => {
            this.batchTree.allowSamplingBatches = hasIndividualMeasures;
            this.batchTree.defaultHasSubBatches = hasIndividualMeasures;
            this.batchTree.allowSubBatches = hasIndividualMeasures;
            if (!this.allowParentOperation) {
              this.showBatchTables = hasIndividualMeasures && this.showBatchTablesByProgram;
              this.showCatchTab = this.showBatchTables || this.batchTree.showCatchForm;
              this.tabCount = 2 + (this.showSamplesTab ? 3 : 0);
            }
          })
      );
    }

    // Show default tables
    if (defaultTableStates) {
      if (this.debug) console.debug('[operation] Enable default tables (Nor SUMARiS nor ADAP pmfms were found)');
      this.showBatchTables = this.showBatchTablesByProgram;
      this.showSamplesTab = this.showSampleTablesByProgram;
      this.showCatchTab = this.showBatchTables || this.batchTree.showCatchForm;
      this.tabCount = 2 + (this.showSamplesTab ? 3 : 0);
      this.updateTablesState();
      this.markForCheck();
    }

    // Abnormal trip => Change comments as required
    const tripProgressControl = formGroup?.controls[PmfmIds.TRIP_PROGRESS];
    if (isNotNil(tripProgressControl)) {
      this._measurementSubscription.add(
        tripProgressControl.valueChanges
          .pipe(
            debounceTime(400),
            startWith<any, any>(tripProgressControl.value),
            filter(isNotNilOrBlank),
            distinctUntilChanged()
          )
          .subscribe(normalProgress => {
            if (!normalProgress) console.debug('[operation] Abnormal OPE: comment is now required');
            this.opeForm.requiredComment = !normalProgress;
            this.markForCheck();
          })
      );
    }
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this._measurementSubscription?.unsubscribe();
    this.$acquisitionLevel.complete();
    this.$programLabel.complete();
    this.$lastOperations.complete();
    this.$tripId.complete();
    this._sampleRowSubscription?.unsubscribe();
  }

  protected async setProgram(program: Program) {
    if (!program) return; // Skip
    if (this.debug) console.debug(`[operation] Program ${program.label} loaded, with properties: `, program.properties);

    let i18nSuffix = program.getProperty(ProgramProperties.I18N_SUFFIX);
    i18nSuffix = i18nSuffix !== 'legacy' ? i18nSuffix : '';
    this.i18nContext.suffix = i18nSuffix;

    this.allowParentOperation = program.getPropertyAsBoolean(ProgramProperties.TRIP_ALLOW_PARENT_OPERATION);
    this.autoFillBatch = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_AUTO_FILL);
    this.autoFillDatesFromTrip = program.getPropertyAsBoolean(ProgramProperties.TRIP_APPLY_DATE_ON_NEW_OPERATION);

    const isGPSUsed = toBoolean(MeasurementUtils.asBooleanValue(this.trip?.measurements, PmfmIds.GPS_USED), true);
    this.opeForm.trip = this.trip;
    this.opeForm.showPosition = isGPSUsed && program.getPropertyAsBoolean(ProgramProperties.TRIP_POSITION_ENABLE);
    this.opeForm.showFishingArea = !this.opeForm.showPosition; // Trip has gps in use, so active positions controls else active fishing area control
    this.opeForm.fishingAreaLocationLevelIds = program.getPropertyAsNumbers(ProgramProperties.TRIP_FISHING_AREA_LOCATION_LEVEL_IDS);
    const defaultLatitudeSign: '+' | '-' = program.getProperty(ProgramProperties.TRIP_LATITUDE_SIGN);
    const defaultLongitudeSign: '+' | '-' = program.getProperty(ProgramProperties.TRIP_LONGITUDE_SIGN);
    this.opeForm.defaultLatitudeSign = defaultLatitudeSign;
    this.opeForm.defaultLongitudeSign = defaultLongitudeSign;
    this.opeForm.maxDistanceWarning = program.getPropertyAsInt(ProgramProperties.TRIP_DISTANCE_MAX_WARNING);
    this.opeForm.maxDistanceError = program.getPropertyAsInt(ProgramProperties.TRIP_DISTANCE_MAX_ERROR);
    this.opeForm.allowParentOperation = this.allowParentOperation;
    this.opeForm.startProgram = program.creationDate;
    this.opeForm.showMetierFilter = program.getPropertyAsBoolean(ProgramProperties.TRIP_FILTER_METIER);
    this.opeForm.programLabel = program.label;
    this.opeForm.fishingStartDateTimeEnable = program.getPropertyAsBoolean(ProgramProperties.TRIP_OPERATION_FISHING_START_DATE_ENABLE);
    this.opeForm.fishingEndDateTimeEnable = program.getPropertyAsBoolean(ProgramProperties.TRIP_OPERATION_FISHING_END_DATE_ENABLE);
    this.opeForm.endDateTimeEnable = program.getPropertyAsBoolean(ProgramProperties.TRIP_OPERATION_END_DATE_ENABLE);

    this.saveOptions.computeBatchRankOrder = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_MEASURE_RANK_ORDER_COMPUTE);
    this.saveOptions.computeBatchIndividualCount = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_INDIVIDUAL_COUNT_COMPUTE);

    this.showBatchTablesByProgram = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_ENABLE);
    this.showSampleTablesByProgram = program.getPropertyAsBoolean(ProgramProperties.TRIP_SAMPLE_ENABLE);

    this.batchTree.program = program;
    this.sampleTree.program = program;

    // Load available taxon groups (e.g. with taxon groups found in strategies)
    await this.initAvailableTaxonGroups(program.label);

    this.cd.detectChanges();
    this.markAsReady();

    await this.ready();
  }

  load(id?: number, opts?: EntityServiceLoadOptions & { emitEvent?: boolean; openTabIndex?: number; updateTabAndRoute?: boolean; [p: string]: any }): Promise<void> {
    return super.load(id, {...opts, withLinkedOperation: true});
  }

  async onNewEntity(data: Operation, options?: EntityServiceLoadOptions): Promise<void> {
    const tripId = options && isNotNil(options.tripId) ? +(options.tripId) :
      isNotNil(this.trip && this.trip.id) ? this.trip.id : (data && data.tripId);
    if (isNil(tripId)) throw new Error('Missing argument \'options.tripId\'!');
    data.tripId = tripId;

    // Load parent trip
    const trip = await this.loadTrip(tripId);

    // Use the default gear, if only one
    if (trip && trip.gears && trip.gears.length === 1) {
      data.physicalGear = trip.gears[0];
    }

    // Copy some trip's properties (need by filter)
    data.programLabel = trip.program?.label;
    data.vesselId = trip.vesselSnapshot?.id;

    // If is on field mode, fill default values
    if (this.isOnFieldMode) {
      data.startDateTime = moment();

      // Wait last operations to be loaded
      const previousOperations = await firstNotNilPromise(this.$lastOperations);

      // Copy from previous operation
      if (isNotEmptyArray(previousOperations)) {
        const previousOperation = previousOperations
          .find(ope => ope && ope !== data && ReferentialUtils.isNotEmpty(ope.metier));
        if (previousOperation) {
          data.physicalGear = (trip.gears || []).find(g => EntityUtils.equals(g, previousOperation.physicalGear, 'id')) || data.physicalGear;
          data.metier = previousOperation.metier;
          data.rankOrderOnPeriod = previousOperation.rankOrderOnPeriod + 1;
        }
      }
    }

    if (data.programLabel) this.$programLabel.next(data.programLabel)
  }

  async onEntityLoaded(data: Operation, options?: EntityServiceLoadOptions): Promise<void> {
    const tripId = options && isNotNil(options.tripId) ? +(options.tripId) :
      isNotNil(this.trip && this.trip.id) ? this.trip.id : (data && data.tripId);
    if (isNil(tripId)) throw new Error('Missing argument \'options.tripId\'!');
    data.tripId = tripId;

    const trip = await this.loadTrip(tripId);

    // Replace physical gear by the real entity
    data.physicalGear = (trip.gears || []).find(g => EntityUtils.equals(g, data.physicalGear, 'id')) || data.physicalGear;
    data.programLabel = trip.program?.label;
    data.vesselId = trip.vesselSnapshot?.id;

    await this.loadLinkedOperation(data);

    if (data.programLabel) this.$programLabel.next(data.programLabel)
  }

  onNewFabButtonClick(event: UIEvent) {
    switch (this.selectedTabIndex) {
      case OperationPage.TABS.CATCH:
        if (this.showBatchTables) this.batchTree.addRow(event);
        break;
      case OperationPage.TABS.SAMPLE:
        if (this.showSamplesTab) this.sampleTree.addRow(event);
        break;
    }
  }

  /**
   * Compute the title
   * @param data
   * @param opts
   */
  protected async computeTitle(data: Operation, opts?: {
    withPrefix?: boolean;
  }): Promise<string> {

    // Trip exists
    const titlePrefix = (!opts || opts.withPrefix !== false) && this.trip && (await this.translate.get('TRIP.OPERATION.TITLE_PREFIX', {
      vessel: this.trip && this.trip.vesselSnapshot && (this.trip.vesselSnapshot.exteriorMarking || this.trip.vesselSnapshot.name) || '',
      departureDateTime: this.trip && this.trip.departureDateTime && this.dateFormat.transform(this.trip.departureDateTime) as string || ''
    }).toPromise()) || '';

    // new ope
    if (!data || isNil(data.id)) {
      return titlePrefix + (await this.translate.get('TRIP.OPERATION.NEW.TITLE').toPromise());
    }

    // Existing operation
    if (this.platform.mobile) {
      return titlePrefix + (await this.translate.get('TRIP.OPERATION.EDIT.TITLE_NO_RANK', {
        startDateTime: data.startDateTime && this.dateFormat.transform(data.startDateTime, {time: true}) as string
      }).toPromise()) as string;
    } else {
      return titlePrefix + (await this.translate.get('TRIP.OPERATION.EDIT.TITLE', {
        startDateTime: data.startDateTime && this.dateFormat.transform(data.startDateTime, {time: true}) as string,
        rankOrder: await this.service.computeRankOrder(data, {fetchPolicy: 'cache-first'})
      }).toPromise()) as string;
    }
  }

  protected async computePageHistory(title: string): Promise<HistoryPageReference> {
    return {
      ...(await super.computePageHistory(title)),
      icon: 'navigate'
    };
  }

  onTabChange(event: MatTabChangeEvent, queryParamName?: string): boolean {
    const changed = super.onTabChange(event, queryParamName);
    if (changed) {
      switch (this.selectedTabIndex) {
        case OperationPage.TABS.CATCH:
          if (this.showBatchTables && this.batchTree) this.batchTree.realignInkBar();
          this.markForCheck();
          break;
        case OperationPage.TABS.SAMPLE:
          if (this.showSamplesTab && this.sampleTree) this.sampleTree.realignInkBar();
          this.markForCheck();
          break;
      }
    }
    return changed;
  }

  async onLastOperationClick(event: UIEvent, id: number): Promise<any> {
    if (event && event.defaultPrevented) return; // Skip

    if (isNil(id) || this.data.id === id) return; // skip

    const savePromise: Promise<boolean> = this.isOnFieldMode && this.dirty && this.valid
      // If on field mode: try to save silently
      ? this.save(event)
      // If desktop mode: ask before save
      : this.saveIfDirtyAndConfirm(null, {
        emitEvent: false /*do not update view*/
      });
    const canContinue = await savePromise;

    if (canContinue) {
      return this.load(+id, {tripId: this.data.tripId, updateTabAndRoute: true});
    }
  }

  async saveAndNew(event: UIEvent): Promise<any> {
    if (event && event.defaultPrevented) return Promise.resolve(); // Skip
    if (event) event.preventDefault(); // Avoid propagation to <ion-item>

    const savePromise: Promise<boolean> = (this.isOnFieldMode && this.dirty && this.valid)
      // If on field mode AND valid: save silently
      ? this.save(event)
      // Else If desktop mode: ask before save
      : this.saveIfDirtyAndConfirm(null, {
        emitEvent: false /*do not update view*/
      });
    const canContinue = await savePromise;
    if (canContinue) {
      if (this.mobile) {
        return this.load(undefined, {tripId: this.data.tripId, updateTabAndRoute: true});
      }
      else {
        return this.router.navigate(['..', 'new'], {
          relativeTo: this.route,
          replaceUrl: true,
          queryParams: {tab: 0}
        });
      }
    }
  }

  async setValue(data: Operation) {
    await this.opeForm.setValue(data);

    // Get gear, from the physical gear
    const gearId = data && data.physicalGear && data.physicalGear.gear && data.physicalGear.gear.id || null;

    // Set measurements form
    this.measurementsForm.gearId = gearId;
    this.measurementsForm.programLabel = this.$programLabel.value;
    if (isNotNil(data.parentOperationId)) {
      await this.measurementsForm.setAcquisitionLevel(AcquisitionLevelCodes.CHILD_OPERATION, data && data.measurements || []);
      this.$acquisitionLevel.next(AcquisitionLevelCodes.CHILD_OPERATION);
    } else {
      this.measurementsForm.value = data && data.measurements || [];
    }

    // Set batch tree
    this.batchTree.gearId = gearId;
    this.batchTree.value = data && data.catchBatch || null;

    // Set sample tree
    this.sampleTree.value = (data && data.samples || []);

    // If new data, auto fill the table
    if (this.isNewData) {
      if (this.autoFillDatesFromTrip) this.opeForm.fillWithTripDates();
      if (this.autoFillBatch) this.batchTree.autoFill({forceIfDisabled: true});
    }

  }

  isCurrentData(other: IEntity<any>): boolean {
    return (this.isNewData && isNil(other.id))
      || (this.data && this.data.id === other.id);
  }

  async save(event, opts?: OperationSaveOptions): Promise<boolean> {

    // Save new gear to the trip
    const gearSaved = await this.saveNewPhysicalGear();
    if (!gearSaved) return false; // Stop if failed

    // Force to pass specific saved options to dataService.save()
    const saved = await super.save(event, <OperationSaveOptions>{
      ...this.saveOptions,
      updateLinkedOperation: this.opeForm.isParentOperation || this.opeForm.isChildOperation, // Apply updates on child operation if it exists
      ...opts
    });
    if (!saved && this.opeForm.invalid) {

      // DEBUG
      console.debug('[operation] Computing form error...');

      this.setError(this.opeForm.formError);
      this.scrollToTop();
    }
    return saved;
  }

  async saveIfDirtyAndConfirm(event?: UIEvent, opts?: { emitEvent: boolean }): Promise<boolean> {
    return super.saveIfDirtyAndConfirm(event, {...this.saveOptions, ...opts});
  }

  async saveNewPhysicalGear(): Promise<boolean> {
    const physicalGear = this.opeForm.physicalGearControl.value;
    if (!physicalGear || isNotNil(physicalGear.id)) return true; // Skip

    this.markAsSaving();
    this.error = undefined;

    try {
      const savedPhysicalGear = await this.tripService.addGear(this.trip.id, physicalGear);

      // Update form with the new gear
      this.opeForm.physicalGearControl.patchValue(savedPhysicalGear, {emitEvent: false});
      this.trip.gears.push(savedPhysicalGear);

      return true;
    }
    catch(err) {
      this.setError(err);
      return false;
    }
    finally {
      this.markAsSaved({emitEvent: false});
    }
  }

  onPrepareSampleForm(pmfmForm: PmfmForm) {
    console.debug('[operation-page] Initializing sample form (validators...)');
    this._sampleRowSubscription?.unsubscribe();
    this._sampleRowSubscription = this.computeSampleRowValidator(pmfmForm);
  }


  /* -- protected method -- */

  protected computeSampleRowValidator(pmfmForm: PmfmForm): Subscription {
    return OperationValidators.addSampleValidators(pmfmForm);
  }

  protected async loadTrip(tripId: number): Promise<Trip> {

    // Update trip id (will cause last operations to be watched, if need)
    this.$tripId.next(+tripId);

    const trip = await this.tripService.load(tripId);
    this.trip = trip;
    this.saveOptions.trip = trip;
    return trip;
  }

  /**
   * Open the first tab that is invalid
   */
  protected getFirstInvalidTabIndex(): number {
    // find invalids tabs (keep order)
    const invalidTabs = [
      this.opeForm.invalid || this.measurementsForm.invalid,
      this.showCatchTab && this.batchTree.invalid,
      this.showSamplesTab && this.sampleTree.invalid
    ];

    // Open the first invalid tab
    const invalidTabIndex = invalidTabs.indexOf(true);

    // If catch tab, open the invalid sub tab
    if (invalidTabIndex === OperationPage.TABS.CATCH) {
      this.selectedSubTabIndex = this.batchTree.getFirstInvalidTabIndex();
      this.updateTablesState();
    }
    // If sample tab, open the invalid sub tab
    else if (invalidTabIndex === OperationPage.TABS.SAMPLE) {
      this.selectedSubTabIndex = this.sampleTree.getFirstInvalidTabIndex();
      this.updateTablesState();
    }
    return invalidTabIndex;
  }

  protected computeUsageMode(operation: Operation): UsageMode {
    return this.settings.isUsageMode('FIELD') && (
      isNil(this.trip) || (
        isNotNil(this.trip.departureDateTime)
        && fromDateISOString(this.trip.departureDateTime).diff(moment(), 'day') < 15))
      ? 'FIELD' : 'DESK';
  }

  protected registerForms() {
    // Register sub forms & table
    this.addChildForms([
      this.opeForm,
      this.measurementsForm,
      this.batchTree,
      this.sampleTree
    ]);
  }

  protected waitWhilePending(): Promise<void> {
    this.form.updateValueAndValidity();
    return super.waitWhilePending();
  }

  protected async getValue(): Promise<Operation> {
    const data = await super.getValue();

    // Batches
    if (this.showCatchTab) {
      await this.batchTree.save();

      // Get batch tree,rom the batch tree component
      data.catchBatch = this.batchTree.value;

      // Make sure to clean species groups, if not batch enable
      if (!this.showBatchTables) {
        data.catchBatch.children = undefined;
      }
    } else {
      data.catchBatch = undefined;
    }

    // Samples
    if (this.showSamplesTab) {
      await this.sampleTree.save();
      data.samples = this.sampleTree.value;
    } else {
      data.samples = undefined;
    }

    return data;
  }

  protected getJsonValueToSave(): Promise<any> {
    const json = this.opeForm.value;

    // Make sure parent operation has quality flag
    if (this.allowParentOperation && EntityUtils.isEmpty(json.parentOperation, 'id') && isNil(json.qualityFlagId)){
      console.warn('[operation-page] Parent operation does not have quality flag id');
      json.qualityFlagId = QualityFlagIds.NOT_COMPLETED;
      this.opeForm.qualityFlagControl.patchValue(QualityFlagIds.NOT_COMPLETED, {emitEvent: false});
    }

    // Clean childOperation if empty
    if (EntityUtils.isEmpty(json.childOperation, 'id')) {
      delete json.childOperation;
    }
    json.measurements = this.measurementsForm.value;
    json.tripId = this.trip.id;
    return json;
  }

  protected canUserWrite(data: Operation): boolean {
    return !!data && this.trip && isNil(this.trip.validationDate)
      && this.tripService.canUserWrite(this.trip);
  }

  protected async initAvailableTaxonGroups(programLabel: string) {
    if (this.debug) console.debug('[operation] Setting available taxon groups...');

    // Load program's taxon groups
    let availableTaxonGroups = await this.programRefService.loadTaxonGroups(programLabel);

    // Retrieve the trip measurements on SELF_SAMPLING_PROGRAM, if any
    const qvMeasurement = (this.trip.measurements || []).find(m => m.pmfmId === PmfmIds.SELF_SAMPLING_PROGRAM);
    if (qvMeasurement && ReferentialUtils.isNotEmpty(qvMeasurement.qualitativeValue)) {

      // Retrieve QV from the program pmfm (because measurement's QV has only the 'id' attribute)
      const tripPmfms = await this.programRefService.loadProgramPmfms(programLabel, {acquisitionLevel: AcquisitionLevelCodes.TRIP});
      const pmfm = (tripPmfms || []).find(pmfm => pmfm.id === PmfmIds.SELF_SAMPLING_PROGRAM);
      const qualitativeValue = (pmfm && pmfm.qualitativeValues || []).find(qv => qv.id === qvMeasurement.qualitativeValue.id);

      // Transform QV.label has a list of TaxonGroup.label
      const contextualTaxonGroups = qualitativeValue?.label
        .split(/[^\w]+/) // Split by separator (= not a word)
        .filter(isNotNilOrBlank)
        .map(label => label.trim().toUpperCase());

      // Limit the program list, using the restricted list
      if (isNotEmptyArray(contextualTaxonGroups)) {
        availableTaxonGroups = availableTaxonGroups.filter(tg => contextualTaxonGroups.includes(tg.label));
      }
    }

    // Set table's default taxon groups
    this.sampleTree.availableTaxonGroups = availableTaxonGroups;
    this.batchTree.availableTaxonGroups = availableTaxonGroups;
  }

  protected updateTablesState() {
    if (this.enabled) {
      if (this.showCatchTab) {
        if (this.batchTree.disabled) {
          this.batchTree.enable();
          this.batchTree.realignInkBar();
        }
      }
      if (this.showSamplesTab) {
        if (this.sampleTree.disabled) {
          this.sampleTree.enable();
          this.sampleTree.realignInkBar();
        }
      }
    } else {
      if (this.showCatchTab && this.batchTree.enabled) {
        this.batchTree.disable();
      }
      if (this.showSamplesTab && this.sampleTree.enabled) {
        this.sampleTree.disable();
      }
    }
    // Force expected sub tab index
    if (this.showBatchTables && this.batchTree.selectedTabIndex !== this.selectedSubTabIndex) {
      this.batchTree.setSelectedTabIndex(this.selectedSubTabIndex);
    }
    else if (this.showSamplesTab && this.sampleTree.selectedTabIndex !== this.selectedSubTabIndex) {
      this.sampleTree.setSelectedTabIndex(this.selectedSubTabIndex);
    }

  }

  protected async loadLinkedOperation(data: Operation): Promise<void> {

    try {
      // Load child operation
      const childOperationId = toNumber(data.childOperationId, data.childOperation?.id);
      if (isNotNil(childOperationId)) {
        data.childOperation = await this.dataService.load(childOperationId, {fetchPolicy: 'cache-first'});
      }

      // Load parent operation
      else {
        const parentOperationId = toNumber(data.parentOperationId, data.parentOperation?.id);
        if (isNotNil(parentOperationId)) {
          data.parentOperation = await this.dataService.load(parentOperationId, {fullLoad: false, fetchPolicy: 'cache-first'});
        }
      }
    } catch (err) {
      console.error('Cannot load child/parent operation', err);
      data.childOperation = undefined;
      data.parentOperation = undefined;
    }
  }

  protected computePageUrl(id: number | 'new'): string | any[] {
    const parentUrl = this.getParentPageUrl();
    return parentUrl && `${parentUrl}/operation/${id}`;
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

  markAsLoaded(opts?: { emitEvent?: boolean }) {
    super.markAsLoaded(opts);
    this.children?.forEach(c => c.markAsLoaded(opts));
  }

  protected computeNextTabIndex(): number | undefined {
    if (this.selectedTabIndex > 0) return undefined; // Already on the next tab

    return this.showCatchTab ? OperationPage.TABS.CATCH :
      (this.showSamplesTab ? OperationPage.TABS.SAMPLE : undefined);
  }
}
