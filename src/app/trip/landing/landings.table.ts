import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {TableElement, ValidatorService} from '@e-is/ngx-material-table';

import {isNotNil, referentialToString, StatusIds} from '@sumaris-net/ngx-components';
import {LandingService} from '../services/landing.service';
import {AppMeasurementsTable} from '../measurement/measurements.table.class';
import {AcquisitionLevelCodes, LocationLevelIds} from '../../referential/services/model/model.enum';
import {VesselSnapshotService} from '../../referential/services/vessel-snapshot.service';
import {Moment} from 'moment';
import {Trip} from '../services/model/trip.model';
import {ObservedLocation} from '../services/model/observed-location.model';
import {Landing} from '../services/model/landing.model';
import {LandingEditor} from '../../referential/services/config/program.config';
import {VesselSnapshot} from '../../referential/services/model/vessel-snapshot.model';
import {ReferentialRefService} from '../../referential/services/referential-ref.service';
import {environment} from '../../../environments/environment';
import {LandingFilter} from '../services/filter/landing.filter';
import {LandingValidatorService} from '@app/trip/services/validator/landing.validator';

export const LANDING_RESERVED_START_COLUMNS: string[] = ['vessel', 'vesselType', 'vesselBasePortLocation', 'location', 'dateTime', 'observers', 'creationDate', 'recorderPerson', 'samplesCount'];
export const LANDING_RESERVED_END_COLUMNS: string[] = ['comments'];

const LANDING_TABLE_DEFAULT_I18N_PREFIX = 'LANDING.TABLE.';

@Component({
  selector: 'app-landings-table',
  templateUrl: 'landings.table.html',
  styleUrls: ['landings.table.scss'],
  providers: [
    {provide: ValidatorService, useValue: LandingValidatorService}
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandingsTable extends AppMeasurementsTable<Landing, LandingFilter> implements OnInit, OnDestroy {

  private _parentDateTime;
  private _detailEditor: LandingEditor;
  private _strategyPmfmId: number;

  protected cd: ChangeDetectorRef;
  protected vesselSnapshotService: VesselSnapshotService;
  protected referentialRefService: ReferentialRefService;

  @Output() onNewTrip = new EventEmitter<{ id?: number; row: TableElement<Landing> }>();

  @Input() canEdit = true;
  @Input() canDelete = true;
  @Input() showFabButton = false;
  @Input() showError = true;
  @Input() showToolbar = true;
  @Input() showPaginator = true;
  @Input() useSticky = true;

  @Input() set strategyPmfmId(value: number) {
    if (this._strategyPmfmId !== value) {
      this._strategyPmfmId = value;
      this.setShowColumn('strategy', isNotNil(this._strategyPmfmId));
    }
  }

  get strategyPmfmId(): number {
    return this._strategyPmfmId;
  }

  @Input() set detailEditor(value: LandingEditor) {
    if (value !== this._detailEditor) {
      this._detailEditor = value;
      // TODO: should be set with another setter, configure from a ProgramProperties option
      this.inlineEdition = value === 'trip';
    }
  }

  get detailEditor(): LandingEditor {
    return this._detailEditor;
  }

  get isTripDetailEditor(): boolean {
    return this._detailEditor === 'trip';
  }

  get isEditable(): boolean {
    return this.inlineEdition;
  }

  @Input()
  set showBasePortLocationColumn(value: boolean) {
    this.setShowColumn('vesselBasePortLocation', value);
  }

  get showBasePortLocationColumn(): boolean {
    return this.getShowColumn('vesselBasePortLocation');
  }

  @Input()
  set showObserversColumn(value: boolean) {
    this.setShowColumn('observers', value);
  }

  get showObserversColumn(): boolean {
    return this.getShowColumn('observers');
  }

  @Input()
  set showDateTimeColumn(value: boolean) {
    this.setShowColumn('dateTime', value);
  }

  get showDateTimeColumn(): boolean {
    return this.getShowColumn('dateTime');
  }

  @Input()
  set showIdColumn(value: boolean) {
    this.setShowColumn('id', value);
  }
  get showIdColumn(): boolean {
    return this.getShowColumn('id');
  }

  @Input()
  set showVesselTypeColumn(value: boolean) {
    this.setShowColumn('vesselType', value);
  }

  get showVesselTypeColumn(): boolean {
    return this.getShowColumn('vesselType');
  }

  @Input()
  set showLocationColumn(value: boolean) {
    this.setShowColumn('location', value);
  }

  get showLocationColumn(): boolean {
    return this.getShowColumn('location');
  }

  @Input()
  set showCreationDateColumn(value: boolean) {
    this.setShowColumn('creationDate', value);
  }

  get showCreationDateColumn(): boolean {
    return this.getShowColumn('creationDate');
  }

  @Input()
  set showRecorderPersonColumn(value: boolean) {
    this.setShowColumn('recorderPerson', value);
  }

  get showRecorderPersonColumn(): boolean {
    return this.getShowColumn('recorderPerson');
  }

  @Input()
  set showVesselBasePortLocationColumn(value: boolean) {
    this.setShowColumn('vesselBasePortLocation', value);
  }

  get showVesselBasePortLocationColumn(): boolean {
    return this.getShowColumn('vesselBasePortLocation');
  }

  @Input()
  set showSamplesCountColumn(value: boolean) {
    this.setShowColumn('samplesCount', value);
  }

  get showSamplesCountColumn(): boolean {
    return this.getShowColumn('samplesCount');
  }

  constructor(
    injector: Injector
  ) {
    super(injector,
      Landing,
      injector.get(LandingService),
      injector.get(LandingValidatorService),
      {
        prependNewElements: false,
        suppressErrors: environment.production,
        reservedStartColumns: LANDING_RESERVED_START_COLUMNS,
        reservedEndColumns: LANDING_RESERVED_END_COLUMNS,
        mapPmfms: (pmfms) => pmfms.filter(p => p.required)
      });
    this.cd = injector.get(ChangeDetectorRef);
    this.i18nColumnPrefix = LANDING_TABLE_DEFAULT_I18N_PREFIX;
    this.autoLoad = false; // waiting parent to be loaded, or the call of onRefresh.next()
    this.inlineEdition = false;
    this.confirmBeforeDelete = true;
    this.vesselSnapshotService = injector.get(VesselSnapshotService);
    this.referentialRefService = injector.get(ReferentialRefService);
    this.saveBeforeDelete = true;

    // Set default acquisition level
    this.acquisitionLevel = AcquisitionLevelCodes.LANDING;
    this.defaultSortBy = 'id';
    this.defaultSortDirection = 'asc';

    // FOR DEV ONLY ----
    this.debug = !environment.production;
  }

  ngOnInit() {

    this._enabled = this.canEdit;

    super.ngOnInit();

    this.registerAutocompleteField('vesselSnapshot', {
      service: this.vesselSnapshotService,
      attributes: this.settings.getFieldDisplayAttributes('vesselSnapshot', ['exteriorMarking', 'name']),
      filter: {
        statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY]
      }
    });

    this.registerAutocompleteField('location', {
      service: this.referentialRefService,
      filter: {
        entityName: 'Location',
        levelId: LocationLevelIds.PORT
      },
      mobile: this.mobile
    });
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.onNewTrip.unsubscribe();
  }

  setParent(data: ObservedLocation | Trip) {
    if (!data) {
      this._parentDateTime = undefined;
      this.setFilter(LandingFilter.fromObject({}));
    } else if (data instanceof ObservedLocation) {
      this._parentDateTime = data.startDateTime;
      this.setFilter(LandingFilter.fromObject({observedLocationId: data.id}), {emitEvent: true/*refresh*/});
    } else if (data instanceof Trip) {
      this._parentDateTime = data.departureDateTime;
      this.setFilter(LandingFilter.fromObject({tripId: data.id}), {emitEvent: true/*refresh*/});
    }
  }

  async getMaxRankOrderOnVessel(vessel: VesselSnapshot): Promise<number> {
    const rows = await this.dataSource.getRows();
    return rows
      .filter(row => vessel.equals(row.currentData.vesselSnapshot))
      .reduce((res, row) => Math.max(res, row.currentData.rankOrderOnVessel || 0), 0);
  }

  async getMaxRankOrder(): Promise<number> {
    // Expose as public (was protected)
    return super.getMaxRankOrder();
  }

  getLandingDate(landing?: Landing): Moment {
    if (!landing || !landing.dateTime) return undefined;

    // return nothing if the landing date equals parent date
    if (this._parentDateTime && landing.dateTime.isSame(this._parentDateTime)) {
      return undefined;
    }

    // default
    return landing.dateTime;
  }

  addRow(event?: any): boolean {

    if (this.isTripDetailEditor) {
      if (!this._enabled) return false;
      if (this.debug) console.debug("[landings-table] Asking for new landing...");

      // Force modal
      this.openNewRowDetail(event);
      return false;
    }

    // default behavior
    return super.addRow(event);
  }

  confirmAndEditTrip(event?: MouseEvent, row?: TableElement<Landing>): boolean {
    if (event) event.stopPropagation();

    if (!this.confirmEditCreate(event, row)) {
      return false;
    }

    if (row.currentData.tripId) {
      // Edit trip
      this.onOpenRow.emit({id: row.currentData.tripId, row: row});
    } else {
      // New trip
      this.onNewTrip.emit({id: null, row: row});
    }
  }


  /* -- protected methods -- */

  protected markForCheck() {
    this.cd.markForCheck();
  }
}

