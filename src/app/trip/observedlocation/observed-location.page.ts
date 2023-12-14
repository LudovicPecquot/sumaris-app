import { ChangeDetectionStrategy, Component, Injector, Input, OnInit, ViewChild } from '@angular/core';
import { ObservedLocationForm } from './form/observed-location.form';
import { ObservedLocationService } from './observed-location.service';
import { LandingsTable } from '../landing/landings.table';
import { AppRootDataEntityEditor } from '@app/data/form/root-data-editor.class';
import { UntypedFormGroup } from '@angular/forms';
import {
  AccountService,
  Alerts,
  AppTable,
  ConfigService,
  CORE_CONFIG_OPTIONS,
  DateUtils,
  EntityServiceLoadOptions,
  EntityUtils,
  fadeInOutAnimation,
  firstNotNilPromise,
  HistoryPageReference,
  isNotNil,
  NetworkService,
  ReferentialRef,
  ReferentialUtils,
  StatusIds,
  toBoolean,
  TranslateContextService,
  UsageMode,
} from '@sumaris-net/ngx-components';
import { ModalController } from '@ionic/angular';
import { SelectVesselsForDataModal, SelectVesselsForDataModalOptions } from './vessels/select-vessel-for-data.modal';
import { ObservedLocation } from './observed-location.model';
import { Landing } from '../landing/landing.model';
import { LandingEditor, ProgramProperties } from '@app/referential/services/config/program.config';
import { VesselSnapshot } from '@app/referential/services/model/vessel-snapshot.model';
import { BehaviorSubject } from 'rxjs';
import { filter, first, tap } from 'rxjs/operators';
import { AggregatedLandingsTable } from '../aggregated-landing/aggregated-landings.table';
import { Program } from '@app/referential/services/model/program.model';
import { ObservedLocationsPageSettingsEnum } from './table/observed-locations.page';
import { environment } from '@environments/environment';
import { DATA_CONFIG_OPTIONS } from '@app/data/data.config';
import { LandingFilter } from '../landing/landing.filter';
import { ContextService } from '@app/shared/context.service';
import { VesselFilter } from '@app/vessel/services/filter/vessel.filter';
import moment from 'moment';
import { TableElement } from '@e-is/ngx-material-table';
import { PredefinedColors } from '@ionic/core';
import { VesselService } from '@app/vessel/services/vessel-service';
import { ObservedLocationContextService } from '@app/trip/observedlocation/observed-location-context.service';
import { ObservedLocationFilter } from '@app/trip/observedlocation/observed-location.filter';

import { APP_DATA_ENTITY_EDITOR } from '@app/data/form/base-data-editor.utils';

const ObservedLocationPageTabs = {
  GENERAL: 0,
  LANDINGS: 1,
};

type LandingTableType = 'legacy' | 'aggregated';
type ILandingsTable = AppTable<any> & { setParent(value: ObservedLocation | undefined) };

@Component({
  selector: 'app-observed-location-page',
  templateUrl: './observed-location.page.html',
  styleUrls: ['./observed-location.page.scss'],
  animations: [fadeInOutAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {provide: APP_DATA_ENTITY_EDITOR, useExisting: ObservedLocationPage}
  ],
})
export class ObservedLocationPage extends AppRootDataEntityEditor<ObservedLocation, ObservedLocationService> implements OnInit {

  @ViewChild('observedLocationForm', {static: true}) observedLocationForm: ObservedLocationForm;
  @ViewChild('landingsTable') landingsTable: LandingsTable;
  @ViewChild('aggregatedLandingsTable') aggregatedLandingsTable: AggregatedLandingsTable;

  showLandingTab = false;
  $landingTableType = new BehaviorSubject<LandingTableType>(undefined);
  $table = new BehaviorSubject<ILandingsTable>(undefined);
  dbTimeZone = DateUtils.moment().tz();
  allowAddNewVessel: boolean;
  showVesselType: boolean;
  showVesselBasePortLocation: boolean;
  addLandingUsingHistoryModal: boolean;
  showRecorder = true;
  showObservers = true;
  landingEditor: LandingEditor;
  enableReport: boolean;
  canCopyLocally = false;

  get table(): ILandingsTable {
    return this.$table.value;
  }

  @Input() showToolbar = true;
  @Input() showQualityForm = true;
  @Input() showOptionsMenu = true;
  @Input() toolbarColor: PredefinedColors = 'primary';

  constructor(
    injector: Injector,
    dataService: ObservedLocationService,
    protected modalCtrl: ModalController,
    protected configService: ConfigService,
    protected accountService: AccountService,
    protected vesselService: VesselService,
    protected translateContext: TranslateContextService,
    protected context: ContextService,
    protected observedLocationContext: ObservedLocationContextService,
    public network: NetworkService
  ) {
    super(injector,
      ObservedLocation,
      dataService,
      {
        pathIdAttribute: 'observedLocationId',
        tabCount: 2,
        i18nPrefix: 'OBSERVED_LOCATION.EDIT.',
        enableListenChanges: true
      });
    this.defaultBackHref = '/observations';

    // FOR DEV ONLY ----
    this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();

    this.registerSubscription(
      this.configService.config.subscribe(config => {
        if (!config) return;
        this.showRecorder = config.getPropertyAsBoolean(DATA_CONFIG_OPTIONS.SHOW_RECORDER);
        this.dbTimeZone = config.getProperty(CORE_CONFIG_OPTIONS.DB_TIMEZONE);
        this.markForCheck();
      })
    );

    // Detect embedded mode, from route params
    this.registerSubscription(
      this.route.queryParams
        .pipe(first())
        .subscribe(queryParams => {
          // Manage embedded mode
          const embedded = toBoolean(queryParams['embedded'], false);
          if (embedded) {
            this.showLandingTab = false;
            this.showOptionsMenu = false;
            this.showQualityForm = false;
            this.autoOpenNextTab = false; // Keep first tab
            this.toolbarColor = 'secondary';
            this.markForCheck();
          }
      })
    );

  }

  updateView(data: ObservedLocation | null, opts?: { emitEvent?: boolean; openTabIndex?: number; updateRoute?: boolean }): Promise<void> {
    //return super.updateView(Object.freeze(data), opts);
    return super.updateView(data, opts);
  }

  updateViewState(data: ObservedLocation, opts?: {onlySelf?: boolean; emitEvent?: boolean }) {
    super.updateViewState(data);

    // Update tabs state (show/hide)
    this.updateTabsState(data);

    if (this.aggregatedLandingsTable) this.aggregatedLandingsTable.updateCanEditDelete(isNotNil(data.validationDate));
  }

  updateTabsState(data: ObservedLocation) {
    // Enable landings tab
    this.showLandingTab = this.showLandingTab || (!this.isNewData || this.isOnFieldMode);

    // INFO CLT : #IMAGINE-614 / Set form to dirty in creation in order to manager errors on silent save (as done for update)
    if (this.isNewData && this.isOnFieldMode) {
      this.markAsDirty();
    }

    // Move to second tab
    if (this.showLandingTab && this.autoOpenNextTab && !this.isNewData && this.selectedTabIndex === 0) {
      this.selectedTabIndex = 1;
      this.tabGroup.realignInkBar();
      this.autoOpenNextTab = false; // Should switch only once
    }
  }

  async onOpenLanding(row) {
    if (!row) return;

    const saved = this.isOnFieldMode && this.dirty
      // If on field mode: try to save silently
      ? await this.save(undefined)
      // If desktop mode: ask before save
      : await this.saveIfDirtyAndConfirm();

    if (!saved) return; // Cannot save

    this.markAsLoading();

    try {
      await this.router.navigateByUrl(`/observations/${this.data.id}/${this.landingEditor}/${row.currentData.id}`);
    }
    finally {
      this.markAsLoaded();
    }
  }

  async onNewLanding(event?: any) {

    const saved = this.isOnFieldMode && this.dirty
      // If on field mode: try to save silently
      ? await this.save(event)
      // If desktop mode: ask before save
      : await this.saveIfDirtyAndConfirm();

    if (!saved) return; // Cannot save

    this.markAsLoading();

    try {
      // Add landing using vessels modal
      if (this.addLandingUsingHistoryModal) {
        const vessel = await this.openSelectVesselModal();
        if (vessel && this.landingsTable) {
          const rankOrder = (await this.landingsTable.getMaxRankOrderOnVessel(vessel) || 0) + 1;
          await this.router.navigateByUrl(`/observations/${this.data.id}/${this.landingEditor}/new?vessel=${vessel.id}&rankOrder=${rankOrder}`);
        }
      }
      // Create landing without vessel selection
      else {
        const rankOrder = (await this.landingsTable.getMaxRankOrder() || 0) + 1;
        await this.router.navigateByUrl(`/observations/${this.data.id}/${this.landingEditor}/new?rankOrder=${rankOrder}`);
      }
    } finally {
      this.markAsLoaded();
    }
  }

  async onNewAggregatedLanding(event?: any) {
    const saved = this.isOnFieldMode && this.dirty
      // If on field mode: try to save silently
      ? await this.save(event)
      // If desktop mode: ask before save
      : await this.saveIfDirtyAndConfirm();

    if (!saved) return; // Cannot save

    this.markAsLoading();

    try {
      const vessel = await this.openSelectVesselModal(true);
      if (vessel && this.aggregatedLandingsTable) {
        await this.aggregatedLandingsTable.addAggregatedRow(vessel);
      }
    } finally {
      this.markAsLoaded();
    }
  }

  async onNewTrip<T extends Landing>(row: TableElement<T>) {
    const saved = this.isOnFieldMode && this.dirty
      // If on field mode: try to save silently
      ? await this.save(undefined)
      // If desktop mode: ask before save
      : await this.saveIfDirtyAndConfirm();

    if (!saved) return; // Cannot save

    this.markAsLoading();

    try {
      const landing = row.currentData;
      await this.router.navigateByUrl(`/observations/${this.data.id}/${this.landingEditor}/new?vessel=${landing.vesselSnapshot.id}&landing=${landing.id}`);
    } finally {
      this.markAsLoaded();
    }
  }

  async onOpenTrip<T extends Landing>(row: TableElement<T>) {
    const saved = this.isOnFieldMode && this.dirty
      // If on field mode: try to save silently
      ? await this.save(undefined)
      // If desktop mode: ask before save
      : await this.saveIfDirtyAndConfirm();

    if (!saved) return; // Cannot save

    this.markAsLoading();

    try {
      await this.router.navigateByUrl(`/observations/${this.data.id}/${this.landingEditor}/${row.currentData.tripId}`);
    } finally {
      this.markAsLoaded();
    }
  }

  async openSelectVesselModal(excludeExistingVessels?: boolean): Promise<VesselSnapshot | undefined> {
    const programLabel = this.aggregatedLandingsTable?.programLabel || this.programLabel || this.data.program.label;
    if (!this.data.startDateTime || !programLabel) {
      throw new Error('Root entity has no program and start date. Cannot open select vessels modal');
    }

    // Prepare vessel filter's value
    const excludeVesselIds = (toBoolean(excludeExistingVessels, false) && this.aggregatedLandingsTable
      && (await this.aggregatedLandingsTable.vesselIdsAlreadyPresent())) || [];
    const showOfflineVessels = EntityUtils.isLocal(this.data) && (await this.vesselService.countAll({synchronizationStatus: 'DIRTY'})) > 0;
    const defaultVesselSynchronizationStatus = this.network.offline || showOfflineVessels ? 'DIRTY' : 'SYNC';

    // Prepare landing's filter
    const startDate = this.data.startDateTime.clone().add(-15, 'days');
    const endDate = this.data.startDateTime.clone();
    const landingFilter = LandingFilter.fromObject({
      programLabel,
      startDate,
      endDate,
      locationId: ReferentialUtils.isNotEmpty(this.data.location) ? this.data.location.id : undefined,
      groupByVessel: (this.landingsTable && this.landingsTable.isTripDetailEditor) || (isNotNil(this.aggregatedLandingsTable)),
      excludeVesselIds,
      synchronizationStatus: 'SYNC' // only remote entities. This is required to read 'Remote#LandingVO' local storage
    });

    const modal = await this.modalCtrl.create({
      component: SelectVesselsForDataModal,
      componentProps: <SelectVesselsForDataModalOptions>{
        allowMultiple: false,
        landingFilter,
        vesselFilter: <VesselFilter>{
          statusIds: [StatusIds.TEMPORARY, StatusIds.ENABLE],
          onlyWithRegistration: true
        },
        allowAddNewVessel: this.allowAddNewVessel,
        showVesselTypeColumn: this.showVesselType,
        showBasePortLocationColumn: this.showVesselBasePortLocation,
        showSamplesCountColumn: this.landingsTable?.showSamplesCountColumn,
        defaultVesselSynchronizationStatus,
        showOfflineVessels,
        maxDateVesselRegistration: endDate,
      },
      keyboardClose: true,
      cssClass: 'modal-large'
    });

    // Open the modal
    await modal.present();

    // Wait until closed
    const {data} = await modal.onDidDismiss();

    // If modal return a landing, use it
    if (data && data[0] instanceof Landing) {
      console.debug('[observed-location] Vessel selection modal result:', data);
      return (data[0] as Landing).vesselSnapshot;
    }
    if (data && data[0] instanceof VesselSnapshot) {
      console.debug('[observed-location] Vessel selection modal result:', data);
      const vessel = data[0] as VesselSnapshot;
      if (excludeVesselIds.includes(data.id)) {
        await Alerts.showError('AGGREGATED_LANDING.VESSEL_ALREADY_PRESENT', this.alertCtrl, this.translate);
        return;
      }
      return vessel;
    } else {
      console.debug('[observed-location] Vessel selection modal was cancelled');
    }
  }

  addRow(event: MouseEvent) {
    if (this.landingsTable) {
      this.landingsTable.addRow(event);
    } else if (this.aggregatedLandingsTable) {
      this.aggregatedLandingsTable.addRow(event);
    }
  }

  async openReport(event?: Event) {
    if (this.dirty) {
      const data = await this.saveAndGetDataIfValid();
      if (!data) return; // Cancel
    }
    return this.router.navigateByUrl(this.computePageUrl(this.data.id) + '/report');
  }

  async copyLocally() {
    if (!this.data) return;
    // Copy the trip
    await this.dataService.copyLocallyById(this.data.id, {withLanding: true, displaySuccessToast: true});
  }

  /* -- protected methods -- */

  protected async setProgram(program: Program) {
    if (!program) return; // Skip
    if (this.debug) console.debug(`[observed-location] Program ${program.label} loaded, with properties: `, program.properties);

    // Update the context
    if (this.observedLocationContext.program !== program) {
      console.debug('TODO setting context program', program.label);
      this.observedLocationContext.setValue('program', program);
    }

    try {
      this.observedLocationForm.showEndDateTime = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_END_DATE_TIME_ENABLE);
      this.observedLocationForm.showStartTime = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_START_TIME_ENABLE);
      this.observedLocationForm.locationLevelIds = program.getPropertyAsNumbers(ProgramProperties.OBSERVED_LOCATION_LOCATION_LEVEL_IDS);
      this.observedLocationForm.showObservers = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_OBSERVERS_ENABLE);
      if (!this.observedLocationForm.showObservers && this.data?.observers) {
        this.data.observers = []; // make sure to reset data observers, if any
      }
      const aggregatedLandings = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_AGGREGATED_LANDINGS_ENABLE);
      if (aggregatedLandings) {
        // Force some date properties
        this.observedLocationForm.timezone = this.dbTimeZone;
        this.observedLocationForm.showEndDateTime = true;
        this.observedLocationForm.showStartTime = false;
        this.observedLocationForm.showEndTime = false;
        this.observedLocationForm.startDateDay = program.getPropertyAsInt(ProgramProperties.OBSERVED_LOCATION_AGGREGATED_LANDINGS_START_DAY);
        this.observedLocationForm.forceDurationDays = program.getPropertyAsInt(ProgramProperties.OBSERVED_LOCATION_AGGREGATED_LANDINGS_DAY_COUNT);
      }
      else {
        this.observedLocationForm.timezone = null; // Use local TZ for dates
      }
      this.allowAddNewVessel = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_CREATE_VESSEL_ENABLE);
      this.addLandingUsingHistoryModal = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_SHOW_LANDINGS_HISTORY);

      let i18nSuffix = program.getProperty(ProgramProperties.I18N_SUFFIX);
      i18nSuffix = i18nSuffix !== 'legacy' ? i18nSuffix : '';
      this.i18nContext.suffix = i18nSuffix;

      this.enableReport = program.getPropertyAsBoolean(ProgramProperties.OBSERVED_LOCATION_REPORT_ENABLE);
      this.landingEditor = program.getProperty<LandingEditor>(ProgramProperties.LANDING_EDITOR);
      this.showVesselType = program.getPropertyAsBoolean(ProgramProperties.VESSEL_TYPE_ENABLE);
      this.showVesselBasePortLocation = program.getPropertyAsBoolean(ProgramProperties.LANDING_VESSEL_BASE_PORT_LOCATION_ENABLE);

      this.$landingTableType.next(aggregatedLandings ? 'aggregated' : 'legacy');

      // Wait the expected table (set using ngInit - see template)
      const table$ = this.$table.pipe(
          filter(t => aggregatedLandings ? t instanceof AggregatedLandingsTable : t instanceof LandingsTable));
      const table = await firstNotNilPromise(table$, {stop: this.destroySubject});

      // Configure table
      if (aggregatedLandings) {
        console.debug('[observed-location] Init aggregated landings table:', table);
        const aggregatedLandingsTable = table as AggregatedLandingsTable;
        aggregatedLandingsTable.timeZone = this.dbTimeZone;
        aggregatedLandingsTable.nbDays = program.getPropertyAsInt(ProgramProperties.OBSERVED_LOCATION_AGGREGATED_LANDINGS_DAY_COUNT);
        aggregatedLandingsTable.programLabel = program.getProperty(ProgramProperties.OBSERVED_LOCATION_AGGREGATED_LANDINGS_PROGRAM);
      }
      else {
        console.debug('[observed-location] Init landings table:', table);
        const landingsTable = table as LandingsTable;
        landingsTable.i18nColumnSuffix = i18nSuffix;
        landingsTable.detailEditor = this.landingEditor;

        landingsTable.showDateTimeColumn = program.getPropertyAsBoolean(ProgramProperties.LANDING_DATE_TIME_ENABLE);
        landingsTable.showVesselTypeColumn = this.showVesselType;
        landingsTable.showVesselBasePortLocationColumn = this.showVesselBasePortLocation;
        landingsTable.showObserversColumn = program.getPropertyAsBoolean(ProgramProperties.LANDING_OBSERVERS_ENABLE);
        landingsTable.showCreationDateColumn = program.getPropertyAsBoolean(ProgramProperties.LANDING_CREATION_DATE_ENABLE);
        landingsTable.showRecorderPersonColumn = program.getPropertyAsBoolean(ProgramProperties.LANDING_RECORDER_PERSON_ENABLE);
        landingsTable.showLocationColumn = program.getPropertyAsBoolean(ProgramProperties.LANDING_LOCATION_ENABLE);
        landingsTable.showSamplesCountColumn = program.getPropertyAsBoolean(ProgramProperties.LANDING_SAMPLES_COUNT_ENABLE);
        landingsTable.includedPmfmIds = program.getPropertyAsNumbers(ProgramProperties.LANDING_COLUMNS_PMFM_IDS);
        this.showLandingTab = true;
      }

      this.addChildForm(() => table);
      this.markAsReady();

      // Listen program, to reload if changes
      if (this.network.online) this.startListenProgramRemoteChanges(program);
    }
    catch (err) {
      this.setError(err);
    }
  }


  protected async onNewEntity(data: ObservedLocation, options?: EntityServiceLoadOptions): Promise<void> {
    console.debug('[observed-location] New entity: applying defaults...');

    // If is on field mode, fill default values
    if (this.isOnFieldMode) {
      if (!this.observedLocationForm.showStartTime && this.observedLocationForm.timezone) {
        data.startDateTime = moment().tz(this.observedLocationForm.timezone)
          .startOf('day').utc();
      }
      else {
        data.startDateTime = moment();
      }

      // Set current user as observers (if enable)
      if (this.showObservers) {
        const user = this.accountService.account.asPerson();
        data.observers.push(user);
      }

      this.showLandingTab = true;

      // Listen first opening the operations tab, then save
      this.registerSubscription(
        this.tabGroup.selectedTabChange
          .pipe(
            filter(event => event.index === ObservedLocationPageTabs.LANDINGS),
            first(),
            tap(() => this.save())
          )
          .subscribe()
      );
    }

    // Fill defaults, from table's filter. Implemented for all usage mode, to fix #IMAGINE-648
    const tableId = this.queryParams['tableId'];
    const searchFilter = tableId && this.settings.getPageSettings<ObservedLocationFilter>(tableId, ObservedLocationsPageSettingsEnum.FILTER_KEY);
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
      if (searchFilter.location) {
        data.location = ReferentialRef.fromObject(searchFilter.location);
      }
    }

    // Set contextual program, if any
    if (!data.program) {
      const contextualProgram = this.context.getValue('program') as Program;
      if (contextualProgram?.label) {
        data.program = ReferentialRef.fromObject(contextualProgram);
      }
    }

    // Propagate program
    const programLabel = data.program?.label;
    this.programLabel = programLabel;

    // Enable forms (do not wait for program load)
    if (!programLabel) this.markAsReady();
  }

  protected async onEntityLoaded(data: ObservedLocation, options?: EntityServiceLoadOptions): Promise<void> {
    const programLabel = data.program?.label;
    if (programLabel) this.programLabel = programLabel;
    this.canCopyLocally = this.accountService.isAdmin() && EntityUtils.isRemoteId(data?.id);
  }

  protected async setValue(data: ObservedLocation) {
    console.info('[observed-location] Setting data', data);

    if (!this.isNewData) {
      // Wait ready only on existing data (must not wait table because program is not set yet)
      await this.ready();
    }

    // Set data to form
    this.observedLocationForm.value = data;

    if (!this.isNewData) {
      // Propagate to table parent
      this.table?.setParent(data);
    }
  }

  protected async getValue(): Promise<ObservedLocation> {
    return await super.getValue();
  }

  protected get form(): UntypedFormGroup {
    return this.observedLocationForm.form;
  }

  protected computeUsageMode(data: ObservedLocation): UsageMode {
    return this.settings.isUsageMode('FIELD') || data.synchronizationStatus === 'DIRTY'  ? 'FIELD' : 'DESK';
  }

  protected registerForms() {
    this.addChildForms([
      this.observedLocationForm,
      // Use landings table as child, only if editable
      //() => this.landingsTable?.canEdit && this.landingsTable,
      //() => this.aggregatedLandingsTable
    ]);
  }

  protected async computeTitle(data: ObservedLocation): Promise<string> {

    // new data
    if (this.isNewData) {
      return this.translate.get('OBSERVED_LOCATION.NEW.TITLE').toPromise();
    }

    // Make sure page is ready (e.g. i18nContext has been loaded, in setProgram())
    await this.ready();

    // Existing data
    return this.translateContext.get(`OBSERVED_LOCATION.EDIT.TITLE`, this.i18nContext.suffix, {
      location: data.location && (data.location.name || data.location.label),
      dateTime: data.startDateTime && this.dateFormat.transform(data.startDateTime) as string
    }).toPromise();
  }

  protected async computePageHistory(title: string): Promise<HistoryPageReference> {
    return {
      ... (await super.computePageHistory(title)),
      icon: 'location'
    };
  }

  protected async onEntitySaved(data: ObservedLocation): Promise<void> {
    await super.onEntitySaved(data);

    // Save landings table, when editable
    if (this.landingsTable?.dirty && this.landingsTable.canEdit) {
      await this.landingsTable.save();
    }
    else if (this.aggregatedLandingsTable?.dirty) {
      await this.aggregatedLandingsTable.save();
    }
  }

  protected getFirstInvalidTabIndex(): number {
    return this.observedLocationForm.invalid ? 0
      : ((this.table?.invalid) ? 1
        : -1);
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
