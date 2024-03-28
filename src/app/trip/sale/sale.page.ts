import { AfterViewInit, ChangeDetectionStrategy, Component, inject, Injector, OnInit, Optional, ViewChild } from '@angular/core';
// import { setTimeout } from '@rx-angular/cdk/zone-less/browser';

import {
  AppEditorOptions,
  AppErrorWithDetails,
  EntityServiceLoadOptions,
  EntityUtils,
  equals,
  fadeInOutAnimation,
  firstArrayValue,
  firstNotNilPromise,
  firstTruePromise,
  fromDateISOString,
  HistoryPageReference,
  isEmptyArray,
  isNil,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrBlank,
  ReferentialRef,
  ReferentialUtils,
  removeDuplicatesFromArray,
  ServerErrorCodes,
  UsageMode,
} from '@sumaris-net/ngx-components';
import { SaleForm } from './sale.form';
import { SAMPLE_TABLE_DEFAULT_I18N_PREFIX, SamplesTable } from '../sample/samples.table';
import { SaleService } from './sale.service';
import { AppRootDataEntityEditor, RootDataEditorOptions, RootDataEntityEditorState } from '@app/data/form/root-data-editor.class';
import { UntypedFormGroup } from '@angular/forms';
import { ObservedLocationService } from '../observedlocation/observed-location.service';
import { TripService } from '../trip/trip.service';
import { debounceTime, filter, map, tap, throttleTime } from 'rxjs/operators';
import { ReferentialRefService } from '@app/referential/services/referential-ref.service';
import { VesselSnapshotService } from '@app/referential/services/vessel-snapshot.service';
import { Sale } from './sale.model';
import { Trip } from '../trip/trip.model';
import { ObservedLocation } from '../observedlocation/observed-location.model';
import { ProgramProperties } from '@app/referential/services/config/program.config';
import { Program } from '@app/referential/services/model/program.model';
import { STRATEGY_SUMMARY_DEFAULT_I18N_PREFIX, StrategySummaryCardComponent } from '@app/data/strategy/strategy-summary-card.component';
import { merge, Observable, Subscription } from 'rxjs';
import { Strategy } from '@app/referential/services/model/strategy.model';
import { PmfmService } from '@app/referential/services/pmfm.service';
import { IPmfm } from '@app/referential/services/model/pmfm.model';
import { AcquisitionLevelCodes, AcquisitionLevelType, PmfmIds, WeightUnitSymbol } from '@app/referential/services/model/model.enum';
import { DenormalizedPmfmStrategy } from '@app/referential/services/model/pmfm-strategy.model';

import moment from 'moment';
import { BaseMeasurementsTable } from '@app/data/measurement/measurements-table.class';
import { SampleFilter } from '@app/trip/sample/sample.filter';
import { Sample } from '@app/trip/sample/sample.model';
import { OBSERVED_LOCATION_FEATURE_NAME, TRIP_LOCAL_SETTINGS_OPTIONS } from '@app/trip/trip.config';
import { SaleFilter } from './sale.filter';
import { MeasurementValuesUtils } from '@app/data/measurement/measurement.model';

import { APP_DATA_ENTITY_EDITOR, DataStrategyResolution, DataStrategyResolutions } from '@app/data/form/data-editor.utils';
import { StrategyFilter } from '@app/referential/services/filter/strategy.filter';
import { RxState } from '@rx-angular/state';
import { RxStateProperty } from '@app/shared/state/state.decorator';
import { AppDataEntityEditor } from '@app/data/form/data-editor.class';
import { FishingAreaForm } from '@app/data/fishing-area/fishing-area.form';
import { AppRootTableSettingsEnum } from '@app/data/table/root-table.class';

export class SaleEditorOptions extends RootDataEditorOptions {}

export interface SalePageState extends RootDataEntityEditorState {
  strategyLabel: string;
}
export const SalesPageSettingsEnum = {
  PAGE_ID: 'sale',
  FILTER_KEY: AppRootTableSettingsEnum.FILTER_KEY,
  FEATURE_NAME: OBSERVED_LOCATION_FEATURE_NAME,
};
@Component({
  selector: 'app-sale-page',
  templateUrl: './sale.page.html',
  styleUrls: ['./sale.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeInOutAnimation],
  providers: [
    { provide: APP_DATA_ENTITY_EDITOR, useExisting: SalePage },
    {
      provide: AppEditorOptions,
      useValue: {
        pathIdAttribute: 'saleId',
      },
    },
    RxState,
  ],
})
export class SalePage<ST extends SalePageState = SalePageState>
  extends AppDataEntityEditor<Sale, SaleService, number, ST>
  implements OnInit, AfterViewInit
{
  static TABS = {
    GENERAL: 0,
    SAMPLES: 1,
    BATCHES: 2,
  };
  protected parent: ObservedLocation;
  protected observedLocationService = inject(ObservedLocationService);
  protected tripService = inject(TripService);
  protected pmfmService = inject(PmfmService);
  protected referentialRefService = inject(ReferentialRefService);
  protected vesselSnapshotService = inject(VesselSnapshotService);
  private _rowValidatorSubscription: Subscription;
  protected selectedSubTabIndex = 0;
  showParent = false;
  showEntityMetadata = false;
  showQualityForm = false;
  enableReport = false;
  parentAcquisitionLevel: AcquisitionLevelType;
  showSampleTablesByProgram = false;
  showSamplesTable = false;
  @RxStateProperty() strategyLabel: string;
  get form(): UntypedFormGroup {
    return this.saleForm.form;
  }

  @ViewChild('saleForm', { static: true }) saleForm: SaleForm;
  @ViewChild('fishingAreaForm', { static: true }) fishingAreaForm: FishingAreaForm;
  @ViewChild('strategyCard', { static: false }) strategyCard: StrategySummaryCardComponent;
  constructor(injector: Injector, @Optional() options: SaleEditorOptions) {
    super(injector, Sale, injector.get(SaleService), {
      pathIdAttribute: 'saleId',
      tabCount: 3,
      i18nPrefix: 'SALE.EDIT.',
      enableListenChanges: true,
      acquisitionLevel: AcquisitionLevelCodes.SALE,
      settingsId: AcquisitionLevelCodes.SALE.toLowerCase(),
      ...options,
    });
    this.parentAcquisitionLevel = this.route.snapshot.queryParamMap.get('parent') as AcquisitionLevelType;
    this.showParent = !!this.parentAcquisitionLevel;

    // FOR DEV ONLY ----
    this.logPrefix = '[sale-page] ';
  }

  ngAfterViewInit() {
    super.ngAfterViewInit();
    // // Enable samples tab, when has pmfms
    // firstTruePromise(this.samplesTable.hasPmfms$, { stop: this.destroySubject }).then(() => {
    //   this.showSamplesTable = true;
    //   this.markForCheck();
    // });
    //
    // // Use sale date as default dateTime for samples
    // this.registerSubscription(
    //   this.saleForm.form
    //     .get('dateTime')
    //     .valueChanges.pipe(
    //       throttleTime(200),
    //       filter(isNotNil),
    //       tap((dateTime) => (this.samplesTable.defaultSampleDate = fromDateISOString(dateTime)))
    //     )
    //     .subscribe()
    // );

    // Fill strategy label from form
    // this._state.connect('strategyLabel', this.saleForm.strategyLabel$);

    // this._state.hold(this.saleForm.observedLocationChanges.pipe(filter((_) => this.showParent)), (parent) => this.onParentChanged(parent));
    //
    // // Watch table events, to avoid strategy edition, when has sample rows
    // this._state.hold(
    //   merge(this.samplesTable.onConfirmEditCreateRow, this.samplesTable.onCancelOrDeleteRow, this.samplesTable.onAfterDeletedRows).pipe(
    //     debounceTime(500)
    //   ),
    //   () => (this.saleForm.canEditStrategy = this.samplesTable.empty)
    // );

    // Manage sub tab group
    const queryParams = this.route.snapshot.queryParams;
    this.selectedSubTabIndex = (queryParams['subtab'] && parseInt(queryParams['subtab'])) || 0;
  }

  canUserWrite(data: Sale, opts?: any): boolean {
    return isNil(this.parent?.validationDate) && super.canUserWrite(data, opts);
  }

  async reload(): Promise<void> {
    this.markAsLoading();
    const route = this.route.snapshot;
    await this.load(this.data && this.data.id, route.params);
  }

  protected watchStrategyFilter(program: Program): Observable<Partial<StrategyFilter>> {
    console.debug(this.logPrefix + 'watchStrategyFilter', this.acquisitionLevel);
    if (this.strategyResolution === 'user-select') {
      return this._state
        .select(['acquisitionLevel', 'strategyLabel'], (s) => s)
        .pipe(
          // DEBUG
          tap((s) => console.debug(this.logPrefix + 'Received strategy label: ', s)),
          map(({ acquisitionLevel, strategyLabel }) => {
            return <Partial<StrategyFilter>>{
              acquisitionLevel,
              programId: program.id,
              label: strategyLabel,
            };
          })
        );
    }

    return super.watchStrategyFilter(program);
  }

  onPrepareSampleForm({ form, pmfms }) {
    console.debug('[sale-page] Initializing sample form (validators...)');

    // Add computation and validation
    this._rowValidatorSubscription?.unsubscribe();
    this._rowValidatorSubscription = this.registerSampleRowValidator(form, pmfms);
  }

  setError(err: string | AppErrorWithDetails, opts?: { emitEvent?: boolean; detailsCssClass?: string }) {
    // cast err to solve type error : detail is not a property of AppErrorWithDetails, property detail is on AppErrorWithDetails.error.detail
    err = err as any;
    if (
      err &&
      typeof err !== 'string' &&
      err?.code === ServerErrorCodes.DATA_NOT_UNIQUE &&
      err?.details &&
      typeof err.details === 'object' &&
      isNotNil(err.details['duplicatedValues'])
    ) {
      const details = err.details as any;
      // this.samplesTable.setError('SALE.ERROR.DUPLICATED_SAMPLE_TAG_ID', { duplicatedValues: details.duplicatedValues });
      super.setError(undefined, opts);
      this.selectedTabIndex = this.getFirstInvalidTabIndex();
    } else {
      // this.samplesTable.setError(undefined);
      super.setError(err, opts);
    }
  }

  async updateView(
    data: Sale | null,
    opts?: {
      emitEvent?: boolean;
      openTabIndex?: number;
      updateRoute?: boolean;
    }
  ) {
    await super.updateView(data, opts);

    // this.saleForm.showParent = this.showParent;
    // this.saleForm.parentAcquisitionLevel = this.parentAcquisitionLevel;

    if (this.parent) {
      // Parent is an Observed location
      if (this.parent instanceof ObservedLocation) {
        // this.saleForm.showProgram = false;
        this.saleForm.showVessel = true;
      }
    }
    // No parent defined
    else {
      // If show parent
      if (this.showParent) {
        console.warn('[sale-page] Sale without parent: show parent field');
        // this.saleForm.showProgram = false;
        this.saleForm.showVessel = true;
        // this.saleForm.showLocation = false;
        // this.saleForm.showDateTime = false;
        this.showQualityForm = true;
      }
      // Sale is root
      else {
        console.warn('[sale-page] Sale as ROOT has not been tested !');
        // this.saleForm.showProgram = true;
        this.saleForm.showVessel = true;
        // this.saleForm.showLocation = true;
        // this.saleForm.showDateTime = true;
        this.showQualityForm = true;
      }
    }

    if (!this.isNewData && this.requiredStrategy) {
      // this.saleForm.canEditStrategy = false;
    }
    this.defaultBackHref = this.computeDefaultBackHref();

    if (!opts || opts.emitEvent !== false) {
      this.markForCheck();
    }
  }

  // async openReport(event: Event) {
  //   if (this.dirty) {
  //     const data = await this.saveAndGetDataIfValid();
  //     if (!data) return; // Cancel
  //   }
  //   return this.router.navigateByUrl(this.computePageUrl(this.data.id) + '/report');
  // }

  /* -- protected methods  -- */

  protected registerForms() {
    this.addChildForms([this.saleForm, this.fishingAreaForm]);
  }

  protected async onNewEntity(data: Sale, options?: EntityServiceLoadOptions): Promise<void> {
    const queryParams = this.route.snapshot.queryParams;
    // DEBUG
    //console.debug('DEV - Creating new sale entity');

    // Mask quality cards
    this.showEntityMetadata = false;
    this.showQualityForm = false;

    if (this.isOnFieldMode) {
      // data.dateTime = moment();
    }

    // Fill parent ids
    data.observedLocationId = options && options.observedLocationId && parseInt(options.observedLocationId);

    // Set rankOrder
    if (isNotNil(queryParams['rankOrder'])) {
      data.rankOrder = +queryParams['rankOrder'];
    } else {
      data.rankOrder = 1;
    }

    // Fill defaults, from table's filter.
    const tableId = this.queryParams['tableId'];
    const searchFilter = tableId && this.settings.getPageSettings<SaleFilter>(tableId, SalesPageSettingsEnum.FILTER_KEY);
    if (searchFilter) {
      // Synchronization status
      if (searchFilter.synchronizationStatus && searchFilter.synchronizationStatus !== 'SYNC') {
        data.synchronizationStatus = 'DIRTY';
      }

      // program
      if (searchFilter.program && searchFilter.program.label) {
        data.program = ReferentialRef.fromObject(searchFilter.program);
      }

      // Location
      // if (searchFilter.location && this.saleForm.showLocation) {
      //   data.location = ReferentialRef.fromObject(searchFilter.location);
      // }

      // Strategy
      if (searchFilter.strategy) {
        // data.strategy = Strategy.fromObject(searchFilter.strategy);
      }
    }

    // Load parent
    this.parent = await this.loadParent(data);

    await this.fillPropertiesFromParent(data, this.parent);

    // Get contextual strategy
    const contextualStrategy = this.context.getValue('strategy') as Strategy;
    // const strategyLabel = data.strategy?.label || contextualStrategy?.label || queryParams['strategyLabel'];
    // if (strategyLabel) {
    //   data.measurementValues = data.measurementValues || {};
    //   data.measurementValues[PmfmIds.STRATEGY_LABEL] = strategyLabel;
    //   if (EntityUtils.isEmpty(data.strategy, 'id')) {
    //     data.strategy = contextualStrategy || (await this.strategyRefService.loadByLabel(strategyLabel));
    //   }
    // }

    // Emit program, strategy
    const programLabel = data.program?.label;
    if (programLabel) this.programLabel = programLabel;
    // if (strategyLabel) this.strategyLabel = strategyLabel;
  }

  protected async onEntityLoaded(data: Sale, options?: EntityServiceLoadOptions): Promise<void> {
    this.parent = await this.loadParent(data);
    const programLabel = this.parent.program?.label; 

    // Copy not fetched data
    if (this.parent) {
      // Set program using parent's program, if not already set
      data.program = ReferentialUtils.isNotEmpty(data.program) ? data.program : this.parent.program;
      data.observers = (isNotEmptyArray(data.observers) && data.observers) || this.parent.observers;

      if (this.parent instanceof ObservedLocation) {
        // data.location = data.location || this.parent.location;
        // data.dateTime = data.dateTime || this.parent.startDateTime || this.parent.endDateTime;
        // data.observedLocation = this.showParent ? this.parent : undefined;
        data.observedLocationId = this.showParent ? null : this.parent.id;
        data.tripId = undefined;
        //data.trip = undefined; // Keep it
      } 

      this.showEntityMetadata = EntityUtils.isRemote(data);
      this.showQualityForm = false;
    }
    // Sale as root
    else {
      this.showEntityMetadata = EntityUtils.isRemote(data);
      this.showQualityForm = this.showEntityMetadata;
    }

    // const strategyLabel = data.measurementValues && data.measurementValues[PmfmIds.STRATEGY_LABEL];
    // this.saleForm.canEditStrategy = isNil(strategyLabel) || isEmptyArray(data.samples);

    // Emit program, strategy
    if (programLabel) this.programLabel = programLabel;
    // if (strategyLabel) this.strategyLabel = strategyLabel;
  }

  protected async onParentChanged(parent: ObservedLocation) {
    if (!equals(parent, this.parent)) {
      console.debug('[sale] Parent changed to: ', parent);
      this.parent = parent;

      // Update data (copy some properties)
      if (this.loaded && !this.saving) {
        const data = await this.getValue();
        await this.fillPropertiesFromParent(data, parent);
        await this.setValue(data);
        this.markAsDirty();
      }
    }
  }

  protected async fillPropertiesFromParent(data: Sale, parent: Trip | ObservedLocation) {
    // DEBUG
    console.debug('[sale-page] Fill some properties from parent', parent);

    const queryParams = this.route.snapshot.queryParams;

    if (parent) {
      // Copy parent program and observers
      data.program = parent.program;
      data.observers = parent.observers;

      if (parent instanceof ObservedLocation) {
        // data.observedLocation = this.showParent ? parent : undefined;
        data.observedLocationId = this.showParent ? null : this.parent.id;
        // data.location = (this.saleForm.showLocation && data.location) || parent.location;
        // data.dateTime = (this.saleForm.showDateTime && data.dateTime) || parent.startDateTime || parent.endDateTime;
        // Keep trip, because some data are stored into the trip (e.g. fishingAreas, metier, ...)
        //data.trip = undefined;
        data.tripId = undefined;

        // Load the vessel, if any
        if (isNotNil(queryParams['vessel'])) {
          const vesselId = +queryParams['vessel'];
          console.debug(`[sale-page] Loading vessel {${vesselId}}...`);
          data.vesselSnapshot = await this.vesselSnapshotService.load(vesselId, { fetchPolicy: 'cache-first' });
        }
      } else if (parent instanceof Trip) {
        // data.trip = this.showParent ? parent : undefined;
        data.vesselSnapshot = parent.vesselSnapshot;
        // data.location = parent.returnLocation || parent.departureLocation;
        // data.dateTime = parent.returnDateTime || parent.departureDateTime;
        // data.observedLocation = undefined;
        data.observedLocationId = undefined;
      }

      // Copy date to samples, if not set by user
      // if (!this.samplesTable.showSampleDateColumn) {
      //   console.debug(`[sale-page] Updating samples...`);
      //   (data.samples || []).forEach((sample) => {
      //     sample.sampleDate = data.dateTime;
      //   });
      // }
    }

    // No parent
    else {
      const contextualProgram = this.context.getValue('program');
      const programLabel = data.program?.label || contextualProgram?.label || queryParams['program'];
      if (programLabel && EntityUtils.isEmpty(data?.program, 'id')) {
        data.program = contextualProgram || (await this.programRefService.loadByLabel(programLabel));
      }
    }
  }

  protected computeDefaultBackHref() {
    if (this.parent && !this.showParent) {
      // Back to parent observed location
      if (this.parent instanceof ObservedLocation) {
        return `/observations/${this.parent.id}?tab=1`;
      }
    }
    if (this.parentAcquisitionLevel) {
      // Back to entity table
      switch (this.parentAcquisitionLevel) {
        case 'OBSERVED_LOCATION':
          return `/observations/landings`;
          break;
        default:
          throw new Error('Cannot compute the back href, for parent ' + this.parentAcquisitionLevel);
      }
    }
  }

  protected async setProgram(program: Program) {
    if (!program) return; // Skip

    const showStrategy =
      program.getPropertyAsBoolean(ProgramProperties.LANDING_STRATEGY_ENABLE) ||
      program.getProperty<DataStrategyResolution>(ProgramProperties.DATA_STRATEGY_RESOLUTION) === 'user-select';
    const isNewData = this.isNewData;
    const requiredStrategy = showStrategy && !isNewData;

    this.requiredStrategy = requiredStrategy;
    this.strategyResolution = showStrategy ? 'user-select' : program.getProperty<DataStrategyResolution>(ProgramProperties.DATA_STRATEGY_RESOLUTION);

    // Customize the UI, using program options
    // this.saleForm.locationLevelIds = program.getPropertyAsNumbers(ProgramProperties.OBSERVED_LOCATION_LOCATION_LEVEL_IDS);
    // this.saleForm.allowAddNewVessel = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_CREATE_VESSEL_ENABLE);
    // this.saleForm.showStrategy = showStrategy;
    // this.saleForm.requiredStrategy = requiredStrategy;
    // this.saleForm.canEditStrategy = showStrategy && isNewData;
    // this.saleForm.showObservers = program.getPropertyAsBoolean(ProgramProperties.LANDING_OBSERVERS_ENABLE);
    // this.saleForm.showDateTime = program.getPropertyAsBoolean(ProgramProperties.LANDING_DATE_TIME_ENABLE);
    // this.saleForm.showLocation = program.getPropertyAsBoolean(ProgramProperties.LANDING_LOCATION_ENABLE);
    // this.saleForm.fishingAreaLocationLevelIds = program.getPropertyAsNumbers(ProgramProperties.LANDING_FISHING_AREA_LOCATION_LEVEL_IDS);

    // Compute i18n prefix
    let i18nSuffix = program.getProperty(ProgramProperties.I18N_SUFFIX);
    i18nSuffix = i18nSuffix && i18nSuffix !== 'legacy' ? i18nSuffix : this.i18nContext?.suffix || '';
    this.i18nContext.suffix = i18nSuffix;
    // this.saleForm.i18nSuffix = i18nSuffix;

    this.enableReport = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_REPORT_ENABLE);
    this.showSampleTablesByProgram = program.getPropertyAsBoolean(ProgramProperties.LANDING_SAMPLE_ENABLE);

    // if (this.samplesTable) {
    //   this.samplesTable.i18nColumnSuffix = i18nSuffix;
    //   this.samplesTable.i18nColumnPrefix = SAMPLE_TABLE_DEFAULT_I18N_PREFIX + i18nSuffix;
    //   this.samplesTable.setModalOption('maxVisibleButtons', program.getPropertyAsInt(ProgramProperties.MEASUREMENTS_MAX_VISIBLE_BUTTONS));
    //   this.samplesTable.setModalOption('maxItemCountForButtons', program.getPropertyAsInt(ProgramProperties.MEASUREMENTS_MAX_ITEM_COUNT_FOR_BUTTONS));
    //   this.samplesTable.weightDisplayedUnit = this.settings.getProperty(
    //     TRIP_LOCAL_SETTINGS_OPTIONS.SAMPLE_WEIGHT_UNIT,
    //     program.getProperty(ProgramProperties.LANDING_SAMPLE_WEIGHT_UNIT)
    //   );
    //   this.samplesTable.showLabelColumn = program.getPropertyAsBoolean(ProgramProperties.LANDING_SAMPLE_LABEL_ENABLE);
    //
    //   // Apply sample table pmfms
    //   // If strategy is required, pmfms will be set by setStrategy()
    //   if (!requiredStrategy) {
    //     await this.setTablePmfms(this.samplesTable, program.label);
    //   }
    // }

    if (this.strategyCard) {
      this.strategyCard.i18nPrefix = STRATEGY_SUMMARY_DEFAULT_I18N_PREFIX + i18nSuffix;
    }

    // Emit ready event (should allow children forms to apply value)
    // If strategy is required, markAsReady() will be called in setStrategy()
    if (!requiredStrategy || (isNewData && this.strategyResolution === 'user-select')) {
      this.markAsReady();
    }

    // Listen program's strategies change (will reload strategy if need)
    // if (this.network.online) {
    //   this.startListenProgramRemoteChanges(program);
    //   this.startListenStrategyRemoteChanges(program);
    // }
  }

  protected async setStrategy(strategy: Strategy, opts?: { emitReadyEvent?: boolean }) {
    console.log(this.logPrefix + 'Setting strategy', strategy);
    await super.setStrategy(strategy);

    const program = this.program;
    if (!strategy || !program) return; // Skip if empty

    // Propagate to form
    // this.saleForm.strategyLabel = strategy.label;

    // Propagate strategy's fishing area locations to form
    const fishingAreaLocations = removeDuplicatesFromArray(
      (strategy.appliedStrategies || []).map((a) => a.location),
      'id'
    );
    // this.saleForm.filteredFishingAreaLocations = fishingAreaLocations;
    // this.saleForm.enableFishingAreaFilter = isNotEmptyArray(fishingAreaLocations); // Enable filter should be done AFTER setting locations, to reload items

    // Configure samples table
    // if (this.samplesTable && this.samplesTable.acquisitionLevel) {
    //   this.samplesTable.strategyLabel = strategy.label;
    //   const taxonNameStrategy = firstArrayValue(strategy.taxonNames);
    //   this.samplesTable.defaultTaxonName = taxonNameStrategy && taxonNameStrategy.taxonName;
    //   this.samplesTable.showTaxonGroupColumn = false;
    //
    //   // Load strategy's pmfms
    //   await this.setTablePmfms(this.samplesTable, program.label, strategy.label);
    // }

    this.markAsReady();
    this.markForCheck();
  }

  protected async setTablePmfms(table: BaseMeasurementsTable<Sample, SampleFilter>, programLabel: string, strategyLabel?: string) {
    if (!this.saleForm.showEndDateTime) {
      console.debug(this.logPrefix + 'Delegate pmfms load to table, using programLabel:' + programLabel);
      // Set the table program, to delegate pmfms load
      table.requiredStrategy = this.requiredStrategy;
      table.programLabel = programLabel;
    } else if (table.acquisitionLevel && strategyLabel) {
      console.debug(this.logPrefix + 'Loading table pmfms... strategy:' + strategyLabel);
      // Load strategy's pmfms
      let samplesPmfms: IPmfm[] = await this.programRefService.loadProgramPmfms(programLabel, {
        acquisitionLevel: table.acquisitionLevel,
        strategyLabel,
      });
      const strategyPmfmIds = samplesPmfms.map((pmfm) => pmfm.id);

      // Retrieve additional pmfms(= PMFMs in date, but NOT in the strategy)
      const additionalPmfmIds = ((!this.isNewData && this.data?.samples) || []).reduce(
        (res, sample) =>
          MeasurementValuesUtils.getPmfmIds(sample.measurementValues || {}).reduce(
            (res, pmfmId) => (!strategyPmfmIds.includes(pmfmId) ? res.concat(pmfmId) : res),
            res
          ),
        []
      );

      // Override samples table pmfm, if need
      if (isNotEmptyArray(additionalPmfmIds)) {
        // Load additional pmfms, from ids
        const additionalPmfms = (await Promise.all(additionalPmfmIds.map((id) => this.pmfmService.loadPmfmFull(id)))).map(
          DenormalizedPmfmStrategy.fromFullPmfm
        );

        // IMPORTANT: Make sure pmfms have been loaded once, BEFORE override.
        // (Elsewhere, the strategy's PMFM will be applied after the override, and additional PMFM will be lost)
        samplesPmfms = samplesPmfms.concat(additionalPmfms);
      }

      // Give it to samples table (without the STRATEGY_LABEL pmfm)
      table.pmfms = samplesPmfms.filter((p) => p.id !== PmfmIds.STRATEGY_LABEL);
      // Avoid to load by program, because PMFM are already known
      //table.programLabel = programLabel;
      table.markAsReady();
    }
  }

  protected async loadParent(data: Sale): Promise<ObservedLocation> {
    let parent:  ObservedLocation;

    if (isNotNil(data.observedLocationId)) { 
      console.debug(`[sale-page] Loading parent observed location #${data.observedLocationId} ...`);
      parent = await this.observedLocationService.load(data.observedLocationId, { fetchPolicy: 'cache-first' });
    }

    return parent;
  }

  protected async setValue(data: Sale): Promise<void> {
    if (!data) return; // Skip
    await this.saleForm.setValue(data);
    this.fishingAreaForm.value = data.fishingAreas?.[0] || {};
  }

  protected async computePageHistory(title: string): Promise<HistoryPageReference> {
    return {
      ...(await super.computePageHistory(title)),
      icon: 'boat',
    };
  }

  protected async computeTitle(data: Sale): Promise<string> {
    const program = await firstNotNilPromise(this.program$, { stop: this.destroySubject });
    let i18nSuffix = program.getProperty(ProgramProperties.I18N_SUFFIX);
    i18nSuffix = (i18nSuffix !== 'legacy' && i18nSuffix) || '';
    console.log(data.saleLocation.name);
    const titlePrefix =
      (this.parent &&
        this.parent instanceof ObservedLocation &&
        this.translate.instant('SALE.TITLE_PREFIX', {
          location: this.parent.location && (this.parent.location.name || this.parent.location.label),
          date: (this.parent.startDateTime && (this.dateFormat.transform(this.parent.startDateTime) as string)) || '',
        })) ||
      '';

    // new data
    if (!data || isNil(data.id)) {
      return titlePrefix + this.translate.instant(`SALE.NEW.${i18nSuffix}TITLE`);
    }

    // Existing data
    return (
      titlePrefix +
      this.translate.instant(`SALE.EDIT.${i18nSuffix}TITLE`, {
        vessel: data.vesselSnapshot && (data.vesselSnapshot.exteriorMarking || data.vesselSnapshot.name),
      })
    );
  }

  protected computePageUrl(id: number | 'new') {
    const parentUrl = this.getParentPageUrl();
    return `${parentUrl}/sale/${id}`;
  }

  protected getFirstInvalidTabIndex(): number {
    if (this.saleForm.invalid) return 0;
    // if (this.samplesTable.invalid || this.samplesTable.error) return 1;
    return -1;
  }

  // protected computeUsageMode(sale: Sale): UsageMode {
  //   return this.settings.isUsageMode('FIELD') &&
  //     // Force desktop mode if sale date/time is 1 day later than now
  //     (isNil(sale && sale.dateTime) || sale.dateTime.diff(moment(), 'day') <= 1)
  //     ? 'FIELD'
  //     : 'DESK';
  // }

  protected async getValue(): Promise<Sale> {
    // DEBUG
    //console.debug('[sale-page] getValue()');

    const data = await super.getValue();

    // Workaround, because sometime measurementValues is empty (see issue IMAGINE-273)
    // data.measurementValues = this.form.controls.measurementValues?.value || {};

    // Store strategy label to measurement
    // if (this.strategyResolution === DataStrategyResolutions.USER_SELECT) {
    //   const strategyLabel = this.strategy?.label;
    //   if (isNotNilOrBlank(strategyLabel)) {
    //     data.measurementValues[PmfmIds.STRATEGY_LABEL] = strategyLabel;
    //   }
    // }

    // Save samples table
    // if (this.samplesTable.dirty) {
    //   await this.samplesTable.save();
    // }
    // data.samples = this.samplesTable.value;

    // DEBUG
    //console.debug('[sale-page] DEV check getValue() result:', data);

    return data;
  }

  async openObservedLocation(parent: ObservedLocation): Promise<boolean> {
    const saved =
      (this.mobile || this.isOnFieldMode) && (!this.dirty || this.valid)
        ? // If on field mode: try to save silently
          await this.save(null, { openTabIndex: -1 })
        : // If desktop mode: ask before save
          await this.saveIfDirtyAndConfirm();

    if (!saved) return; // Skip

    return this.navController.navigateForward(['observations', parent.id], {
      replaceUrl: false, // Back should return in the sale
      queryParams: {
        tab: 0,
        embedded: true,
      },
    });
  }

  protected async getJsonValueToSave(): Promise<any> {
    const json = await super.getJsonValueToSave();
    const fishingAreaJson = this.fishingAreaForm.value;
    json.fishingAreas = fishingAreaJson ? [fishingAreaJson] : [];
    json.sale = this.saleForm.value;

    //todo mf To discuss with Benoit
    json.sale.program = this.data.program;

    return json;
  }

  protected registerSampleRowValidator(form: UntypedFormGroup, pmfms: IPmfm[]): Subscription {
    // Can be override by subclasses (e.g auction control, biological sampling samples table)
    console.warn('[sale-page] No row validator override');
    return null;
  }

  // protected async setWeightDisplayUnit(unitLabel: WeightUnitSymbol) {
  //   if (this.samplesTable.weightDisplayedUnit === unitLabel) return; // Skip if same
  //
  //   const saved =
  //     (this.mobile || this.isOnFieldMode) && (!this.dirty || this.valid)
  //       ? // If on field mode: try to save silently
  //         await this.save(null, { openTabIndex: -1 })
  //       : // If desktop mode: ask before save
  //         await this.saveIfDirtyAndConfirm();
  //
  //   if (!saved) return; // Skip
  //
  //   console.debug('[sale-page] Change weight unit to ' + unitLabel);
  //   this.samplesTable.weightDisplayedUnit = unitLabel;
  //   this.settings.setProperty(TRIP_LOCAL_SETTINGS_OPTIONS.SAMPLE_WEIGHT_UNIT, unitLabel);
  //
  //   // Reload program and strategy
  //   await this.reloadProgram({ clearCache: false });
  //   if (this.saleForm.requiredStrategy) await this.reloadStrategy({ clearCache: false });
  //
  //   // Reload data
  //   setTimeout(() => this.reload(), 250);
  // }
}
