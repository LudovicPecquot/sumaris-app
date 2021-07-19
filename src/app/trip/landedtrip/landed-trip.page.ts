import {ChangeDetectionStrategy, Component, Injector, OnInit, ViewChild} from '@angular/core';

import {MeasurementsForm} from '../measurement/measurements.form.component';
import * as momentImported from "moment";
import {AcquisitionLevelCodes, SaleTypeIds} from "../../referential/services/model/model.enum";
import {AppRootDataEditor} from "../../data/form/root-data-editor.class";
import {FormBuilder, FormGroup} from "@angular/forms";
import {NetworkService}  from "@sumaris-net/ngx-components";
import {TripForm} from "../trip/trip.form";
import {BehaviorSubject} from "rxjs";
import {TripSaveOptions, TripService} from "../services/trip.service";
import {HistoryPageReference, UsageMode}  from "@sumaris-net/ngx-components";
import {EntitiesStorage}  from "@sumaris-net/ngx-components";
import {ObservedLocationService} from "../services/observed-location.service";
import {VesselSnapshotService} from "../../referential/services/vessel-snapshot.service";
import {isEmptyArray, isNil, isNotEmptyArray, isNotNil, isNotNilOrBlank} from "@sumaris-net/ngx-components";
import {OperationGroupTable} from "../operationgroup/operation-groups.table";
import {MatTabChangeEvent, MatTabGroup} from "@angular/material/tabs";
import {ProductsTable} from "../product/products.table";
import {Product, ProductFilter, ProductUtils} from "../services/model/product.model";
import {PacketsTable} from "../packet/packets.table";
import {Packet, PacketFilter} from "../services/model/packet.model";
import {OperationGroup, Trip} from "../services/model/trip.model";
import {ObservedLocation} from "../services/model/observed-location.model";
import {fillRankOrder, isRankOrderValid} from "../../data/services/model/model.utils";
import {SaleProductUtils} from "../services/model/sale-product.model";
import {debounceTime, filter, first} from "rxjs/operators";
import {Sale} from "../services/model/sale.model";
import {ExpenseForm} from "../expense/expense.form";
import {FishingAreaForm} from "../fishing-area/fishing-area.form";
import {DenormalizedPmfmStrategy} from "../../referential/services/model/pmfm-strategy.model";
import {ProgramProperties} from "../../referential/services/config/program.config";
import {Landing} from "../services/model/landing.model";
import {fadeInOutAnimation} from "@sumaris-net/ngx-components";
import {ReferentialRef}  from "@sumaris-net/ngx-components";
import {EntityServiceLoadOptions} from "@sumaris-net/ngx-components";
import {Program} from "../../referential/services/model/program.model";
import {environment} from "../../../environments/environment";
import {Sample} from "../services/model/sample.model";

const moment = momentImported;

@Component({
  selector: 'app-landed-trip-page',
  templateUrl: './landed-trip.page.html',
  styleUrls: ['./landed-trip.page.scss'],
  animations: [fadeInOutAnimation],
  providers: [{provide: AppRootDataEditor, useExisting: LandedTripPage}],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandedTripPage extends AppRootDataEditor<Trip, TripService> implements OnInit {

  readonly acquisitionLevel = AcquisitionLevelCodes.TRIP;
  observedLocationId: number;

  showOperationGroupTab = false;
  showCatchTab = false;
  showSaleTab = false;
  showExpenseTab = false;

  // List of trip's metier, used to populate operation group's metier combobox
  $metiers = new BehaviorSubject<ReferentialRef[]>(null);

  // List of trip's operation groups, use to populate product filter
  $operationGroups = new BehaviorSubject<OperationGroup[]>(null);
  catchFilterForm: FormGroup;
  $productFilter = new BehaviorSubject<ProductFilter>(undefined);
  $packetFilter = new BehaviorSubject<PacketFilter>(undefined);

  operationGroupAttributes = ['metier.label', 'metier.name'];

  productSalePmfms: DenormalizedPmfmStrategy[];

  @ViewChild('tripForm', {static: true}) tripForm: TripForm;
  @ViewChild('measurementsForm', {static: true}) measurementsForm: MeasurementsForm;
  @ViewChild('fishingAreaForm', {static: true}) fishingAreaForm: FishingAreaForm;
  @ViewChild('operationGroupTable', {static: true}) operationGroupTable: OperationGroupTable;
  @ViewChild('productsTable', {static: true}) productsTable: ProductsTable;
  @ViewChild('packetsTable', {static: true}) packetsTable: PacketsTable;
  @ViewChild('expenseForm', {static: true}) expenseForm: ExpenseForm;

  @ViewChild('catchTabGroup', {static: true}) catchTabGroup: MatTabGroup;

  private _sale: Sale; // pending sale

  constructor(
    injector: Injector,
    protected entities: EntitiesStorage,
    protected dataService: TripService,
    protected observedLocationService: ObservedLocationService,
    protected vesselService: VesselSnapshotService,
    public network: NetworkService, // Used for DEV (to debug OFFLINE mode)
    protected formBuilder: FormBuilder,
  ) {
    super(injector,
      Trip,
      dataService,
      {
        pathIdAttribute: 'tripId',
        tabCount: 4
      });

    // FOR DEV ONLY ----
    this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();

    this.catchFilterForm = this.formBuilder.group({
      operationGroup: [null]
    });
    this.registerSubscription(this.catchFilterForm.valueChanges.subscribe(() => {
      this.$productFilter.next(ProductFilter.fromParent(this.catchFilterForm.value.operationGroup));
      this.$packetFilter.next(PacketFilter.fromParent(this.catchFilterForm.value.operationGroup));
    }));

    // Init operationGroupFilter combobox
    this.registerAutocompleteField('operationGroupFilter', {
      showAllOnFocus: true,
      items: this.$operationGroups,
      attributes: this.operationGroupAttributes,
      columnNames: ['REFERENTIAL.LABEL', 'REFERENTIAL.NAME']
    });

    // Update available operation groups for catches forms
    this.registerSubscription(
      this.operationGroupTable.dataSource.datasourceSubject.pipe(
        debounceTime(400),
        filter(() => !this.loading)
      ).subscribe(operationGroups => this.$operationGroups.next(operationGroups))
    );

    // Cascade refresh to operation tables
    this.registerSubscription(
      this.onUpdateView.subscribe(() => {
        this.operationGroupTable.onRefresh.emit();
        this.productsTable.onRefresh.emit();
        this.packetsTable.onRefresh.emit();
        //this.landedSaleForm.onRefresh.emit();// TODO ? le onRefresh sur les sous tableaux ?
      })
    );

  // Read the selected tab index, from path query params
  this.registerSubscription(this.route.queryParams
    .pipe(first())
    .subscribe(queryParams => {

      const tabIndex = queryParams["tab"] && parseInt(queryParams["tab"]) || 0;
      const subTabIndex = queryParams["subtab"] && parseInt(queryParams["subtab"]) || 0;

      // Update catch tab index
      if (this.catchTabGroup && tabIndex === 2) {
        this.catchTabGroup.selectedIndex = subTabIndex;
        this.catchTabGroup.realignInkBar();
      }

      // Update expenses tab group index
      if (this.expenseForm && tabIndex === 3) {
        this.expenseForm.selectedTabIndex = subTabIndex;
        this.expenseForm.realignInkBar();
      }
    }));
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.$metiers.unsubscribe();
    this.$operationGroups.unsubscribe();
    this.$productFilter.unsubscribe();
    this.$packetFilter.unsubscribe();
  }

  onTabChange(event: MatTabChangeEvent, queryParamName?: string): boolean {
    const changed = super.onTabChange(event, queryParamName);
    // Force sub-tabgroup realign
    if (changed) {
      if (this.catchTabGroup && this.selectedTabIndex === 2) this.catchTabGroup.realignInkBar();
      if (this.expenseForm && this.selectedTabIndex === 3) this.expenseForm.realignInkBar();
      this.markForCheck();
    }
    return changed;
  }

  protected registerForms() {
    this.addChildForms([
      this.tripForm, this.measurementsForm, this.fishingAreaForm,
      this.expenseForm,
      this.operationGroupTable, this.productsTable, this.packetsTable
    ]);
  }

  protected async setProgram(program: Program) {
    if (!program) return; // Skip
    if (this.debug) console.debug(`[landedTrip] Program ${program.label} loaded, with properties: `, program.properties);

    // Configure trip form
    this.tripForm.showObservers = program.getPropertyAsBoolean(ProgramProperties.TRIP_OBSERVERS_ENABLE);
    if (!this.tripForm.showObservers) {
      // make sure to reset data observers, if any
      if (this.data) this.data.observers = [];
    }
    this.tripForm.showMetiers = program.getPropertyAsBoolean(ProgramProperties.TRIP_METIERS_ENABLE);
    if (!this.tripForm.showMetiers) {
      // make sure to reset data metiers, if any
      if (this.data) this.data.metiers = [];
    } else {
      this.tripForm.metiersForm.valueChanges.subscribe(value => {
        const metiers = ((value || []) as ReferentialRef[]).filter(metier => isNotNilOrBlank(metier));
        if (JSON.stringify(metiers) !== JSON.stringify(this.$metiers.value || [])) {
          if (this.debug) console.debug('[landedTrip-page] metiers array has changed', metiers);
          this.$metiers.next(metiers);
        }
      });
    }

    // Configure fishing area form
    this.fishingAreaForm.locationLevelIds = program.getPropertyAsNumbers(ProgramProperties.LANDED_TRIP_FISHING_AREA_LOCATION_LEVEL_IDS);
  }

  async load(id?: number, options?: EntityServiceLoadOptions): Promise<void> {

    this.observedLocationId = options && options.observedLocationId || this.observedLocationId;
    this.defaultBackHref = `/observations/${this.observedLocationId}`;

    return super.load(id, {isLandedTrip: true, ...options});
  }

  protected async onNewEntity(data: Trip, options?: EntityServiceLoadOptions): Promise<void> {

    // Read options and query params
    console.info(options);
    if (options && options.observedLocationId) {

      console.debug("[landedTrip-page] New entity: settings defaults...");
      this.observedLocationId = parseInt(options.observedLocationId);
      const observedLocation = await this.getObservedLocationById(this.observedLocationId);

      // Fill default values
      if (observedLocation) {

        data.observedLocationId = observedLocation.id;

        // program
        data.program = observedLocation.program;
        this.$programLabel.next(data.program.label);

        // location
        const location = observedLocation.location;
        data.departureLocation = location;
        data.returnLocation = location;

        // observers
        if (!isEmptyArray(observedLocation.observers)) {
          data.observers = observedLocation.observers;
        }
      }
    } else {
      throw new Error("[landedTrip-page] the observedLocationId must be present");
    }

    const queryParams = this.route.snapshot.queryParams;
    // Load the vessel, if any
    if (isNotNil(queryParams['vessel'])) {
      const vesselId = +queryParams['vessel'];
      console.debug(`[landedTrip-page] Loading vessel {${vesselId}}...`);
      data.vesselSnapshot = await this.vesselService.load(vesselId, {fetchPolicy: 'cache-first'});
    }
    // Get the landing id
    if (isNotNil(queryParams['landing'])) {
      const landingId = +queryParams['landing'];
      console.debug(`[landedTrip-page] Get landing id {${landingId}}...`);
      if (data.landing) {
        data.landing.id = landingId;
      } else {
        data.landing = Landing.fromObject({id: landingId});
      }
    }
    // Get the landing rankOrder
    if (isNotNil(queryParams['rankOrder'])) {
      const landingRankOrder = +queryParams['rankOrder'];
      console.debug(`[landedTrip-page] Get landing rank order {${landingRankOrder}}...`);
      if (data.landing) {
        data.landing.rankOrderOnVessel = landingRankOrder;
      } else {
        data.landing = Landing.fromObject({rankOrderOnVessel: landingRankOrder});
      }
    }

    if (this.isOnFieldMode) {
      data.departureDateTime = moment();
      data.returnDateTime = moment();
    }

  }

  protected async getObservedLocationById(observedLocationId: number): Promise<ObservedLocation> {

    // Load parent observed location
    if (isNotNil(observedLocationId)) {
      console.debug(`[landedTrip-page] Loading parent observed location ${observedLocationId}...`);
      return this.observedLocationService.load(observedLocationId, {fetchPolicy: "cache-first"});
    } else {
      throw new Error('No parent found in path. landed trip without parent not implemented yet !');
    }
  }

  updateViewState(data: Trip) {
    super.updateViewState(data);

    if (this.isNewData) {
      this.hideTabs();
    } else {
      this.showTabs();
    }
  }

  private showTabs() {
    this.showOperationGroupTab = true;
    this.showCatchTab = true;
    this.showSaleTab = true;
    this.showExpenseTab = true;
  }

  private hideTabs() {
    this.showOperationGroupTab = false;
    this.showCatchTab = false;
    this.showSaleTab = false;
    this.showExpenseTab = false;
  }

  protected async setValue(data: Trip): Promise<void> {

    this.tripForm.value = data;
    const isNew = isNil(data.id);
    if (!isNew) {
      this.$programLabel.next(data.program.label);
      this.$metiers.next(data.metiers);

      // fixme trouver un meilleur moment pour charger les pmfms
      this.productSalePmfms = await this.programRefService.loadProgramPmfms(data.program.label, {acquisitionLevel: AcquisitionLevelCodes.PRODUCT_SALE});

    }

    // Fishing area
    this.fishingAreaForm.value = data && data.fishingArea || {};

    // Trip measurements todo filter ????????
    const tripMeasurements = data && data.measurements || [];
    this.measurementsForm.value = tripMeasurements;
    // Expenses
    this.expenseForm.value = tripMeasurements;

    // Operations table
    const operationGroups = data && data.operationGroups || [];
    this.operationGroupTable.value = operationGroups;
    this.$operationGroups.next(operationGroups);

    let allProducts: Product[] = [];
    let allPackets: Packet[] = [];
    // Iterate over operation groups to collect products, samples and packets
    operationGroups.forEach(operationGroup => {
      // collect all operation group's samples and dispatch to products
      const products = operationGroup.products || [];
      if (isNotEmptyArray(operationGroup.samples)) {
        products.forEach(product => {
          product.samples = operationGroup.samples.filter(sample => ProductUtils.isSampleOfProduct(product, sample));
        });
      }
      // collect all operation group's products (with related samples)
      allProducts = allProducts.concat(products);
      // collect all operation group's packets
      allPackets = allPackets.concat(operationGroup.packets);
    });

    // Fix products and packets rank orders (reset if rank order are invalid, ie. from SIH)
    if (!isRankOrderValid(allProducts))
      fillRankOrder(allProducts);
    if (!isRankOrderValid(allPackets))
      fillRankOrder(allPackets);

    // Sale
    if (data && data.sale && this.productSalePmfms) {

      // fix sale startDateTime
      data.sale.startDateTime = data.sale.startDateTime || data.returnDateTime;

      // keep sale object in safe place
      this._sale = data.sale;

      // Dispatch product and packet sales
      if (isNotEmptyArray(data.sale.products)) {

        // First, reset products and packets sales
        allProducts.forEach(product => product.saleProducts = []);
        allPackets.forEach(packet => packet.saleProducts = []);

        data.sale.products.forEach(saleProduct => {
          if (isNil(saleProduct.batchId)) {
            // = product
            const productFound = allProducts.find(product => SaleProductUtils.isSaleOfProduct(product, saleProduct, this.productSalePmfms));
            if (productFound) {
              productFound.saleProducts.push(saleProduct);
            }
          } else {
            // = packet
            const packetFound = allPackets.find(packet => SaleProductUtils.isSaleOfPacket(packet, saleProduct));
            if (packetFound) {
              packetFound.saleProducts.push(saleProduct);
            }
          }
        });

        // need fill products.saleProducts.rankOrder
        allProducts.forEach(p => fillRankOrder(p.saleProducts));
      }
    }

    // Products table
    this.productsTable.value = allProducts;

    // Packets table
    this.packetsTable.value = allPackets;

  }

  // todo attention à cette action
  async onOpenOperationGroup({id, row}) {
    const savedOrContinue = await this.saveIfDirtyAndConfirm();
    if (savedOrContinue) {
      this.loading = true;
      try {
        await this.router.navigate(['trips', this.data.id, 'operation', id],
          {
            queryParams: {}
          });
      } finally {
        this.loading = false;
      }
    }
  }

  // todo attention à cette action
  async onNewOperationGroup(event?: any) {
    const savePromise: Promise<boolean> = this.isOnFieldMode && this.dirty
      // If on field mode: try to save silently
      ? this.save(event)
      // If desktop mode: ask before save
      : this.saveIfDirtyAndConfirm();

    const savedOrContinue = await savePromise;
    if (savedOrContinue) {
      this.loading = true;
      this.markForCheck();
      try {
        await this.router.navigateByUrl(`/trips/${this.data.id}/operation/new`);
      } finally {
        this.loading = false;
        this.markForCheck();
      }
    }
  }

  enable(opts?: { onlySelf?: boolean; emitEvent?: boolean }): boolean {
    const enabled = super.enable(opts);

    // Leave program & vessel controls disabled
    this.form.get('program').disable(opts);
    this.form.get('vesselSnapshot').disable(opts);

    return enabled;
  }

  devToggleOfflineMode() {
    if (this.network.offline) {
      this.network.setForceOffline(false);
    } else {
      this.network.setForceOffline();
    }
  }

  async copyLocally() {
    if (!this.data) return;

    // Copy the trip
    await this.dataService.copyLocallyById(this.data.id, {isLandedTrip: true, withOperationGroup: true});

  }

  /* -- protected methods -- */

  protected get form(): FormGroup {
    return this.tripForm.form;
  }

  protected canUserWrite(data: Trip): boolean {
    return isNil(data.validationDate) && this.dataService.canUserWrite(data);
  }

  protected computeUsageMode(data: Trip): UsageMode {
    return this.settings.isUsageMode('FIELD') || data.synchronizationStatus === 'DIRTY' ? 'FIELD' : 'DESK';
  }

  /**
   * Compute the title
   * @param data
   */
  protected async computeTitle(data: Trip) {

    // new data
    if (!data || isNil(data.id)) {
      return await this.translate.get('TRIP.NEW.TITLE').toPromise();
    }

    // Existing data
    return await this.translate.get('TRIP.EDIT.TITLE', {
      vessel: data.vesselSnapshot && (data.vesselSnapshot.exteriorMarking || data.vesselSnapshot.name),
      departureDateTime: data.departureDateTime && this.dateFormat.transform(data.departureDateTime) as string
    }).toPromise();
  }

  protected async computePageHistory(title: string): Promise<HistoryPageReference> {
    return {
      ... (await super.computePageHistory(title)),
      icon: 'boat'
    };
  }

  /**
   * Called by super.save()
   */
  protected async getJsonValueToSave(): Promise<any> {
    const json = await super.getJsonValueToSave();

    // parent link
    json.landing = this.data && this.data.landing && {id: this.data.landing.id, rankOrderOnVessel: this.data.landing.rankOrderOnVessel} || undefined;
    json.observedLocationId = this.data && this.data.observedLocationId;

    // recopy vesselSnapshot (disabled control)
    json.vesselSnapshot = this.data && this.data.vesselSnapshot;

    // json.sale = !this.saleForm.empty ? this.saleForm.value : null;
    // Concat trip and expense measurements
    json.measurements = (this.measurementsForm.value || []).concat(this.expenseForm.value);

    // FishingArea
    json.fishingArea = !this.fishingAreaForm.empty ? this.fishingAreaForm.value : null;

    const operationGroups: OperationGroup[] = this.operationGroupTable.value || [];

    // Get products and packets
    const products = this.productsTable.value || [];
    const packets = this.packetsTable.value || [];

    // Restore sale
    json.sale = this._sale && this._sale.asObject();
    if (!json.sale) {
      // Create a sale object if any sale product found
      if (products.find(product => isNotEmptyArray(product.saleProducts))
        || packets.find(packet => isNotEmptyArray(packet.saleProducts))) {
        json.sale = {
          startDateTime: json.returnDateTime,
          saleType: {id: SaleTypeIds.OTHER}
        };
      }
    }

    if (json.sale) {
      // Gather all sale products
      const saleProducts: Product[] = [];
      products.forEach(product => isNotEmptyArray(product.saleProducts) && saleProducts.push(...product.saleProducts));
      packets.forEach(packet => {
        if (isNotEmptyArray(packet.saleProducts)) {
          packet.saleProducts.forEach(saleProduct => {
            // Affect batchId (= packet.id)
            saleProduct.batchId = packet.id;
          });
          saleProducts.push(...packet.saleProducts);
        }
      });
      json.sale.products = saleProducts;
    }

    // Affect in each operation group : products, samples and packets
    operationGroups.forEach(operationGroup => {
      operationGroup.products = products.filter(product => operationGroup.equals(product.parent as OperationGroup));
      let samples: Sample[] = [];
      (operationGroup.products || []).forEach(product => samples = samples.concat(product.samples || []));
      operationGroup.samples = samples;
      operationGroup.packets = packets.filter(packet => operationGroup.equals(packet.parent as OperationGroup));
    });

    json.operationGroups = operationGroups;
    json.gears = operationGroups.map(operationGroup => operationGroup.physicalGear);

    return json;
  }

  async save(event, options?: any): Promise<boolean> {

    const saveOptions: TripSaveOptions = {
      withLanding: true // indicate service to reload with LandedTrip query
    };

    // Save children in-memory datasources
    if (this.productsTable.dirty) {
      await this.productsTable.save();
      this.operationGroupTable.markAsDirty();
    }
    if (this.packetsTable.dirty) {
      await this.packetsTable.save();
      this.operationGroupTable.markAsDirty();
    }
    if (this.operationGroupTable.dirty) {
      await this.operationGroupTable.save();
      saveOptions.withOperationGroup = true;
    }

    // todo same for other tables

    return await super.save(event, {...options, ...saveOptions});
  }

  onNewFabButtonClick(event: UIEvent) {
    if (this.showOperationGroupTab && this.selectedTabIndex === 1) {
      this.operationGroupTable.addRow(event);
    }
    else if (this.showCatchTab && this.selectedTabIndex === 2) {
      switch (this.catchTabGroup.selectedIndex) {
        case 0:
          this.productsTable.addRow(event);
          break;
        case 1:
          this.packetsTable.addRow(event);
          break;
      }
    }
  }

  /**
   * Get the first invalid tab
   */
  protected getFirstInvalidTabIndex(): number {
    const invalidTabs: boolean[] = [
      this.tripForm.invalid || this.measurementsForm.invalid,
      this.operationGroupTable.invalid,
      this.productsTable.invalid || this.packetsTable.invalid,
      this.expenseForm.invalid
    ];

    const firstInvalidTab = invalidTabs.indexOf(true);
    return firstInvalidTab > -1 ? firstInvalidTab : this.selectedTabIndex;
  }

  protected computePageUrl(id: number|'new'): string | any[] {
    const parentUrl = this.getParentPageUrl();
    return `${parentUrl}/trip/${id}`;
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

  filter($event: Event) {
    console.debug('[landed-trip.page] filter : ', $event);

  }

}
