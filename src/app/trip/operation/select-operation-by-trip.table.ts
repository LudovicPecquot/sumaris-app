import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { TableElement, ValidatorService } from '@e-is/ngx-material-table';
import { OperationValidatorService } from '../services/validator/operation.validator';
import { AlertController, ModalController, Platform } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { OperationService, OperationServiceWatchOptions } from '../services/operation.service';
import { TranslateService } from '@ngx-translate/core';
import {
  AccountService,
  AppTable,
  EntitiesTableDataSource, isEmptyArray, isNil, isNotEmptyArray,
  LatLongPattern, LocalSettings,
  LocalSettingsService,
  NetworkService,
  ReferentialRef, removeDuplicatesFromArray,
  RESERVED_END_COLUMNS,
  RESERVED_START_COLUMNS, StatusIds,
} from '@sumaris-net/ngx-components';
import { environment } from '@environments/environment';
import { Operation, PhysicalGear, Trip } from '../services/model/trip.model';
import { OperationFilter } from '@app/trip/services/filter/operation.filter';
import { TripService } from '@app/trip/services/trip.service';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { AbstractControl, FormBuilder, FormGroup } from '@angular/forms';
import moment from 'moment/moment';
import { METIER_DEFAULT_FILTER } from '@app/referential/services/metier.service';
import { ReferentialRefService } from '@app/referential/services/referential-ref.service';
import { BehaviorSubject, from, merge, of } from 'rxjs';
import { SynchronizationStatusEnum } from '@app/data/services/model/model.utils';
import { mergeLoadResult } from '@app/shared/functions';

class OperationDivider extends Operation {
  trip: Trip;
}

@Component({
  selector: 'app-select-operation-by-trip-table',
  templateUrl: 'select-operation-by-trip.table.html',
  styleUrls: ['select-operation-by-trip.table.scss'],
  providers: [
    {provide: ValidatorService, useExisting: OperationValidatorService}
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SelectOperationByTripTable extends AppTable<Operation, OperationFilter> implements OnInit, OnDestroy {

  limitDateForLostOperation = moment().add(-4, 'day');
  trips = new Array<Trip>();
  filterForm: FormGroup;
  displayAttributes: {
    [key: string]: string[]
  };
  highlightedRow: TableElement<Operation>;
  $taxonGroups = new BehaviorSubject<ReferentialRef[]>(undefined);
  $gears = new BehaviorSubject<ReferentialRef[]>(undefined);

  @Input() latLongPattern: LatLongPattern;
  @Input() tripId: number;
  @Input() showToolbar = true;
  @Input() showPaginator = false;
  @Input() showFilter = true;
  @Input() useSticky = true;
  @Input() enableGeolocation = false;
  @Input() gearIds: number[];
  @Input() parent: Operation;

  get sortActive(): string {
    const sortActive = super.sortActive;
    // Local sort
    if (this.tripId < 0) {
      switch (sortActive) {
        case 'physicalGear':
          return 'physicalGear.gear.' + this.displayAttributes.gear[0];
        case 'targetSpecies':
          return 'metier.taxonGroup.' + this.displayAttributes.taxonGroup[0];
        case 'tripId':
          return 'trip';
        default:
          return sortActive;
      }
    }
    // Remote sort
    else {
      switch (sortActive) {
        case 'targetSpecies':
          return 'metier';
        case 'tripId':
          return 'trip';
        default:
          return sortActive;
      }
    }
  }

  get sortByDistance(): boolean{
    return this.enableGeolocation && (this.sortActive === 'startPosition' || this.sortActive === 'endPosition');
  }

  constructor(
    protected route: ActivatedRoute,
    protected router: Router,
    protected platform: Platform,
    protected location: Location,
    protected modalCtrl: ModalController,
    protected settings: LocalSettingsService,
    protected validatorService: ValidatorService,
    protected dataService: OperationService,
    protected referentialRefService: ReferentialRefService,
    protected tripService: TripService,
    protected alertCtrl: AlertController,
    protected translate: TranslateService,
    protected accountService: AccountService,
    protected network: NetworkService,
    formBuilder: FormBuilder,
    protected cd: ChangeDetectorRef
  ) {
    super(route, router, platform, location, modalCtrl, settings,
      RESERVED_START_COLUMNS
        .concat(
          ['tripId',
            'physicalGear',
            'targetSpecies',
            'startDateTime',
            'startPosition',
            'fishingStartDateTime',
            'endPosition'])
        .concat(RESERVED_END_COLUMNS),
      new EntitiesTableDataSource<Operation, OperationFilter, number, OperationServiceWatchOptions>(Operation,
        dataService,
        null,
        // DataSource options
        {
          prependNewElements: false,
          suppressErrors: environment.production,
          dataServiceOptions: <OperationServiceWatchOptions>{
            readOnly: true,
            withBatchTree: false,
            withSamples: false,
            withTotal: true,
            mapFn: (operations) => this.mapOperations(operations),
            computeRankOrder: false,
            mutable: false, // use simple load query
            withOffline: true
          }
        })
    );
    this.i18nColumnPrefix = 'TRIP.OPERATION.LIST.';

    this.readOnly = true;
    this.inlineEdition = false;
    this.confirmBeforeDelete = true;
    this.saveBeforeSort = false;
    this.saveBeforeFilter = false;
    this.saveBeforeDelete = false;
    this.autoLoad = false; // waiting parent to be loaded

    this.defaultPageSize = -1; // Do not use paginator
    this.defaultSortBy = this.mobile ? 'startDateTime' : 'endDateTime';
    this.defaultSortDirection = this.mobile ? 'desc' : 'asc';
    this.excludesColumns = ['select'];

    this.filterForm = formBuilder.group({
      'startDate': null,
      'gearIds': [null],
      'taxonGroupLabels': [null]
    });

    // Update filter when changes
    this.registerSubscription(
      this.filterForm.valueChanges
        .pipe(
          debounceTime(250),
          filter(() => this.filterForm.valid)
        )
        // Applying the filter
        .subscribe((json) => this.setFilter({
            ...this.filter, // Keep previous filter
            ...json
          },
          {emitEvent: true /*always apply*/}))
    );

    // Listen settings changed
    this.registerSubscription(
      merge(
        from(this.settings.ready()),
        this.settings.onChange
      )
      .subscribe(value => this.configureFromSettings(value))
    );
  }

  ngOnInit() {
    super.ngOnInit();

    // Apply filter value
    const filter = this.filter;
    if (filter?.startDate) {
      this.filterForm.get('startDate').setValue(filter.startDate, {emitEvent: false});
    }
    if (filter?.gearIds.length === 1) {
      this.filterForm.get('gearIds').setValue(filter.gearIds[0], {emitEvent: false});
    }

    // Load taxon groups, and gears
    this.loadTaxonGroups();
    this.loadGears();
  }

  clickRow(event: MouseEvent | undefined, row: TableElement<Operation>): boolean {
    this.highlightedRow = row;
    return super.clickRow(event, row);
  }


  isDivider(index, item: TableElement<Operation>): boolean {
    return item.currentData instanceof OperationDivider;
  }

  isOperation(index, item: TableElement<Operation>): boolean {
    return !(item.currentData instanceof OperationDivider);
  }

  clearControlValue(event: UIEvent, formControl: AbstractControl): boolean {
    if (event) event.stopPropagation(); // Avoid to enter input the field
    formControl.setValue(null);
    return false;
  }

  isCurrentData(row: any) {
    return this.parent && row.currentData.id === this.parent.id;
  }

  /* -- protected methods -- */

  protected configureFromSettings(settings: LocalSettings) {
    console.debug('[operation-table] Configure from local settings (latLong format, display attributes)...')
    settings = settings || this.settings.settings;

    if (settings.accountInheritance) {
      const account = this.accountService.account;
      this.latLongPattern = account && account.settings && account.settings.latLongFormat || this.settings.latLongFormat;
    }
    else {
      this.latLongPattern = this.settings.latLongFormat;
    }

    this.displayAttributes = {
      gear: this.settings.getFieldDisplayAttributes('gear'),
      taxonGroup: this.settings.getFieldDisplayAttributes('taxonGroup'),
    };

    this.markForCheck();
  }

  protected async loadTaxonGroups() {
    const { data } = await this.referentialRefService.loadAll(0, 100, null, null,
      {
        entityName: 'Metier',
        ...METIER_DEFAULT_FILTER,
        searchJoin: 'TaxonGroup',
        levelIds: this.gearIds,
      },
      {
        withTotal: false
      });

    const items = removeDuplicatesFromArray(data || [], 'label');

    this.$taxonGroups.next(items);
  }

  protected async loadGears() {
    const { data } = await this.referentialRefService.loadAll(0, 100, null, null,
      {
        entityName: 'Gear',
        includedIds: this.gearIds,
      },
      {
        withTotal: false
      });

    this.$gears.next(data || []);
  }

  protected async mapOperations(data: Operation[]): Promise<Operation[]> {

    // Add existing parent operation
    if (this.parent && data.findIndex(o => o.id === this.parent.id) === -1){
      data.push(this.parent)
    }

    if (isEmptyArray((data))) return data;

    // Not done on watch all to apply filter on parent operation
    if (this.sortByDistance){
      data = await this.dataService.sortByDistance(data, this.sortDirection, this.sortActive);
    }

    // Load trips (remote and local)
    const tripIds = removeDuplicatesFromArray(data.map(ope => ope.tripId));
    const localTripIds = tripIds.filter(id => id < 0);
    const remoteTripIds = tripIds.filter(id => id >= 0);

    let trips: Trip[];
    if (isNotEmptyArray(localTripIds) && isNotEmptyArray(remoteTripIds)) {
      trips = await Promise.all([
        this.tripService.loadAll(0, remoteTripIds.length, null, null, {includedIds: remoteTripIds}, {mutable: false}),
        this.tripService.loadAll(0, localTripIds.length, null, null, {includedIds: localTripIds, synchronizationStatus: 'DIRTY'}),
      ]).then(([res1, res2]) => mergeLoadResult(res1, res2)?.data);
    }
    else if (isNotEmptyArray(localTripIds)) {
      trips = (await this.tripService.loadAll(0, localTripIds.length, null, null, {includedIds: localTripIds, synchronizationStatus: 'DIRTY'}))?.data;
    }
    else {
      trips = (await this.tripService.loadAll(0, remoteTripIds.length, null, null, {includedIds: remoteTripIds}, {mutable: false}))?.data;
    }

    // Remove duplicated trips
    //trips = removeDuplicatesFromArray(trips, 'id');

    // Insert a divider (between operations) for each trip
    data = tripIds.reduce((res, tripId) => {
      const divider = new OperationDivider();
      divider.id = tripId;
      divider.tripId = tripId;
      divider.trip = trips.find(t => t.id === tripId) || Trip.fromObject({id: tripId});
      const childrenOperations = data.filter(o => o.tripId === tripId);
      return res.concat(divider).concat(...childrenOperations);
    }, []);

    return data;
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

}
