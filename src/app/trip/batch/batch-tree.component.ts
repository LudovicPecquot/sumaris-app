import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, ViewChild } from '@angular/core';
import {
  AppFormUtils,
  AppTabEditor,
  AppTable,
  Entity,
  firstTruePromise,
  InMemoryEntitiesService, IReferentialRef,
  isEmptyArray,
  isNil,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrBlank,
  PlatformService,
  toBoolean,
  UsageMode,
} from '@sumaris-net/ngx-components';
import { AlertController, ModalController } from '@ionic/angular';
import { BehaviorSubject, defer, Observable } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { OperationService } from '../services/operation.service';
import { debounceTime, distinctUntilChanged, filter, map, switchMap } from 'rxjs/operators';
import { TripService } from '../services/trip.service';
import { Batch, BatchUtils } from '../services/model/batch.model';
import { BatchGroup, BatchGroupUtils } from '../services/model/batch-group.model';
import { BatchGroupsTable } from './table/batch-groups.table';
import { SubBatchesTable, SubBatchFilter } from './table/sub-batches.table';
import { CatchBatchForm } from '../catch/catch.form';
import { AcquisitionLevelCodes } from '@app/referential/services/model/model.enum';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MatTabChangeEvent } from '@angular/material/tabs';
import { ProgramProperties } from '@app/referential/services/config/program.config';
import { SubBatch, SubBatchUtils } from '../services/model/subbatch.model';
import { Program } from '@app/referential/services/model/program.model';
import { ProgramRefService } from '@app/referential/services/program-ref.service';
import { TaxonGroupRef } from '@app/referential/services/model/taxon-group.model';

@Component({
  selector: 'app-batch-tree',
  templateUrl: './batch-tree.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BatchTreeComponent extends AppTabEditor<Batch, any> implements OnInit, AfterViewInit {

  private _gearId: number;
  private _allowSubBatches: boolean;
  private _subBatchesService: InMemoryEntitiesService<SubBatch, SubBatchFilter>;

  data: Batch;
  $programLabel = new BehaviorSubject<string>(null);
  $program = new BehaviorSubject<Program>(null);
  showSubBatchesTable = false;
  listenProgramChanges = true;

  @Input() debug: boolean;
  @Input() mobile: boolean;
  @Input() usageMode: UsageMode;
  @Input() showCatchForm: boolean;
  @Input() showBatchTables: boolean;

  @Input() set allowSamplingBatches(allow: boolean) {
    this.batchGroupsTable.showSamplingBatchColumns = allow;
  }

  get allowSamplingBatches(): boolean {
    return this.batchGroupsTable.showSamplingBatchColumns;
  }

  @Input() set allowSubBatches(value: boolean) {
    if (this._allowSubBatches !== value) {
      this._allowSubBatches = value;
      this.showSubBatchesTable = value;
      // If disabled
      if (!value) {
        // Reset existing sub batches
        if (!this.loading) this.resetSubBatches();
        // Select the first tab
        this.setSelectedTabIndex(0);
      }
      if (!this.loading) this.markForCheck();
    }
  }

  get allowSubBatches(): boolean {
    return this._allowSubBatches;
  }

  get isNewData(): boolean {
    return false;
  }

  @Input()
  set value(catchBatch: Batch) {
    this.setValue(catchBatch);
  }

  get value(): Batch {
    return this.getValue();
  }

  @Input()
  set programLabel(value: string) {
    if (this.$programLabel.value !== value) {
      this.$programLabel.next(value);
    }
  }

  get programLabel(): string {
    return this.$programLabel.value;
  }

  @Input()
  set program(value: Program) {
    this.listenProgramChanges = false; // Avoid to watch program changes, when program is given by parent component
    this.$program.next(value);
  }

  @Input()
  set gearId(value: number) {
    if (this._gearId !== value && isNotNil(value)) {
      this._gearId = value;
      this.catchBatchForm.gearId = value;
    }
  }

  @Input() set availableTaxonGroups(value: TaxonGroupRef[]) {
    this.batchGroupsTable.availableTaxonGroups = value;
  }

  get availableTaxonGroups(): TaxonGroupRef[]  {
    return this.batchGroupsTable.availableTaxonGroups;
  }

  @Input() set defaultHasSubBatches(value: boolean) {
    this.batchGroupsTable.defaultHasSubBatches = value;
  }

  get defaultHasSubBatches(): boolean {
    return this.batchGroupsTable.defaultHasSubBatches;
  }

  get dirty(): boolean {
    return super.dirty || (this._subBatchesService && this._subBatchesService.dirty) || false;
  }

  @ViewChild('catchBatchForm', {static: true}) catchBatchForm: CatchBatchForm;
  @ViewChild('batchGroupsTable', {static: true}) batchGroupsTable: BatchGroupsTable;
  @ViewChild('subBatchesTable', {static: false}) subBatchesTable: SubBatchesTable;


  constructor(
    protected route: ActivatedRoute,
    protected router: Router,
    protected alertCtrl: AlertController,
    protected translate: TranslateService,
    protected programRefService: ProgramRefService,
    protected tripService: TripService,
    protected operationService: OperationService,
    protected modalCtrl: ModalController,
    protected platform: PlatformService,
    protected cd: ChangeDetectorRef
  ) {
    super(route, router, alertCtrl, translate,
      {
        tabCount: platform.mobile ? 1 : 2
      });

    // Defaults
    this.mobile = platform.mobile;

    // FOR DEV ONLY ----
    //this.debug = !environment.production;
  }

  ngOnInit() {
    // Set defaults
    this.tabCount = this.mobile ? 1 : 2;
    this.showCatchForm = toBoolean(this.showCatchForm, true);
    this.showBatchTables = toBoolean(this.showBatchTables, true);
    this.allowSamplingBatches = toBoolean(this.allowSamplingBatches, true);
    this.allowSubBatches = toBoolean(this.allowSubBatches, true);

    this._subBatchesService = this.mobile
      ? new InMemoryEntitiesService(SubBatch, SubBatchFilter, {
        equals: Batch.equals
      })
      : null;

    super.ngOnInit();

    this.registerSubscription(
      this.catchBatchForm.$pmfms
        .pipe(
          filter(isNotNil)
        )
        .subscribe(pmfms => {
          const hasPmfms = pmfms.length > 0;
          this.showCatchForm = this.showCatchForm && hasPmfms;
          if (this._enabled) {
            if (hasPmfms) this.catchBatchForm.enable()
            else this.catchBatchForm.disable();
          }
          this.markForCheck();
        })
    );

    this.registerForms();
  }

  ngAfterViewInit() {

    // Get available sub-batches only when subscribe (for performance reason)
    this.batchGroupsTable.availableSubBatches = defer(() => this.getSubBatches());

    // Watch program, to configure tables from program properties
    this.registerSubscription(
      this.$programLabel
        .pipe(
          filter(() => this.listenProgramChanges), // Avoid to watch program, if was already set
          filter(isNotNilOrBlank),
          distinctUntilChanged(),
          switchMap(programLabel => this.programRefService.watchByLabel(programLabel))
        )
        .subscribe(program => this.$program.next(program))
    );

    // Watch program, to configure tables from program properties
    this.registerSubscription(
      this.$program
        .pipe(
          distinctUntilChanged((p1, p2) => p1 && p2 && p1.label === p2.label && p1.updateDate.isSame(p2.updateDate)),
          filter(isNotNil)
        )
        .subscribe(program => this.setProgram(program))
    );

    if (this.subBatchesTable) {

      // Enable sub batches table, only when table pmfms ready
      firstTruePromise(this.subBatchesTable.$hasPmfms)
        .then(() => this.showSubBatchesTable = true);

      // Update available parent on individual batch table, when batch group changes
      this.registerSubscription(
        this.batchGroupsTable.dataSource.datasourceSubject
          .pipe(
            // skip if loading, or hide
            filter(() => !this.loading && this.allowSubBatches),
            debounceTime(400),
            map(value => value || [])
          )
          // Will refresh the tables (inside the setter):
          .subscribe(batchGroups => {
            const isNotEmpty = batchGroups.length > 0;
            if (isNotEmpty) this.subBatchesTable.availableParents = batchGroups;
            if (this.showSubBatchesTable !== isNotEmpty) {
              this.showSubBatchesTable = isNotEmpty;
              this.markForCheck();
            }
          })
      );
    }
  }

  ngOnDestroy() {
    super.ngOnDestroy();

    this._subBatchesService?.ngOnDestroy();

    this.$programLabel.complete();
    this.$program.complete();
  }


  async save(event?: UIEvent, options?: any): Promise<any> {

    // Create (or fill) the catch form entity
    const source = this.getJsonValueToSave();
    const target = this.data || new Batch();
    target.fromObject(source, {withChildren: false /*will be set after*/});

    // Save batch groups and sub batches
    const [batchGroups, subBatches] = await Promise.all([
      this.getTableValue(this.batchGroupsTable),
      this.getSubBatches()
    ]);
    target.children = batchGroups;

    // Prepare subBatches for model (set parent)
    if (isNotEmptyArray(subBatches)){
      SubBatchUtils.linkSubBatchesToParent(batchGroups, subBatches, {
        qvPmfm: this.batchGroupsTable.qvPmfm
      });
    }

    // DEBUG
    if (this.debug) BatchUtils.logTree(target);

    this.data = target;

    return true;
  }

  protected getJsonValueToSave(): any {
    // Get only the catch form
    return this.form.value;
  }

  getValue(): Batch {
    return this.data;
  }

  load(id?: number, options?: any): Promise<any> {
    // Unused
    return Promise.resolve(undefined);
  }

  reload() {
    // Unused
    return Promise.resolve(undefined);
  }


  /* -- protected method -- */

  async setValue(catchBatch: Batch) {

    // Make sure this is catch batch
    if (catchBatch && catchBatch.label !== AcquisitionLevelCodes.CATCH_BATCH) {
      throw new Error('Catch batch should have label=' + AcquisitionLevelCodes.CATCH_BATCH);
    }

    // DEBUG
    //console.debug('[batch-tree] setValue()');

    this.markAsLoading();

    try {

      catchBatch = catchBatch || Batch.fromObject({
        rankOrder: 1,
        label: AcquisitionLevelCodes.CATCH_BATCH
      });

      this.data = catchBatch;

      // Set catch batch
      this.catchBatchForm.gearId = this._gearId;
      this.catchBatchForm.value = catchBatch.clone({ withChildren: false });

      if (this.batchGroupsTable) {
        // Retrieve batch group (make sure label start with acquisition level)
        // Then convert into batch group entities
        const batchGroups: BatchGroup[] = BatchGroupUtils.fromBatchTree(catchBatch);

        // Apply to table
        this.batchGroupsTable.value = batchGroups;

        // Wait batch group table ready (need to be sure the QV pmfm is set)
        await this.batchGroupsTable.waitIdle();

        const groupQvPmfm = this.batchGroupsTable.qvPmfm;
        const subBatches: SubBatch[] = SubBatchUtils.fromBatchGroups(batchGroups, {
          groupQvPmfm
        });

        if (this.subBatchesTable) {
          this.subBatchesTable.qvPmfm = groupQvPmfm;
          this.subBatchesTable.setAvailableParents(batchGroups, {
            emitEvent: false,
            linkDataToParent: false // Not need here
          });
          this.subBatchesTable.value = subBatches;
        } else {
          this._subBatchesService.value = subBatches;
        }
      }
    }
    finally {
      this.markAsLoaded({emitEvent: false});
      this.markAsPristine();
    }
  }

  protected get form(): FormGroup {
    return this.catchBatchForm.form;
  }

  protected registerForms() {
    this.addChildForms([
      this.catchBatchForm,
      this.batchGroupsTable,
      () => this.subBatchesTable
    ]);
  }

  protected async setProgram(program: Program) {
    if (this.debug) console.debug(`[batch-tree] Program ${program.label} loaded, with properties: `, program.properties);

    const hasBatchMeasure = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_MEASURE_ENABLE);
    this.allowSamplingBatches = hasBatchMeasure;
    this.allowSubBatches = hasBatchMeasure;

    this.batchGroupsTable.showWeightColumns = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_WEIGHT_ENABLE);
    this.batchGroupsTable.showTaxonGroupColumn = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_TAXON_GROUP_ENABLE);
    this.batchGroupsTable.showTaxonNameColumn = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_TAXON_NAME_ENABLE);

    this.batchGroupsTable.setModalOption('maxVisibleButtons', program.getPropertyAsInt(ProgramProperties.MEASUREMENTS_MAX_VISIBLE_BUTTONS));

    // Some specific taxon groups have no weight collected
    const taxonGroupsNoWeight = program.getProperty(ProgramProperties.TRIP_BATCH_TAXON_GROUPS_NO_WEIGHT);
    this.batchGroupsTable.taxonGroupsNoWeight = taxonGroupsNoWeight && taxonGroupsNoWeight.split(',')
      .map(label => label.trim().toUpperCase())
      .filter(isNotNilOrBlank) || undefined;

    // Force taxon name in sub batches, if not filled in root batch
    if (this.subBatchesTable) {
      this.subBatchesTable.showTaxonNameColumn = !this.batchGroupsTable.showTaxonNameColumn && program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_MEASURE_INDIVIDUAL_TAXON_NAME_ENABLE);
      this.subBatchesTable.showTaxonNameInParentAutocomplete = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_MEASURE_INDIVIDUAL_TAXON_NAME_ENABLE)
      this.subBatchesTable.showIndividualCount = program.getPropertyAsBoolean(ProgramProperties.TRIP_BATCH_MEASURE_INDIVIDUAL_COUNT_ENABLE);
    }

    // Propagate to children components, if need
    // This should be need when $program has been set by parent, and not from the $programLabel observable
    if (this.$programLabel.value !== program?.label) this.$programLabel.next(program?.label);
  }

  async onSubBatchesChanges(subbatches: SubBatch[]) {
    if (isNil(subbatches)) return; // user cancelled

    if (this.subBatchesTable) {
      this.subBatchesTable.value = subbatches;

      // Wait table not busy
      await this.subBatchesTable.waitIdle();

      this.subBatchesTable.markAsDirty();
    } else  {
      await this._subBatchesService.saveAll(subbatches);
    }
  }

  onTabChange(event: MatTabChangeEvent, queryTabIndexParamName?: string) {
    const result = super.onTabChange(event, queryTabIndexParamName);

    if (!this.loading)  {
      // On each tables, confirm the current editing row
      if (this.showBatchTables && this.batchGroupsTable) this.batchGroupsTable.confirmEditCreate();
      if (this.allowSubBatches && this.subBatchesTable) this.subBatchesTable.confirmEditCreate();
    }

    return result;
  }


  async autoFill(opts?: { forceIfDisabled?: boolean; }): Promise<void> {
    return this.batchGroupsTable.autoFillTable(opts);
  }

  setSelectedTabIndex(value: number, opts?: { emitEvent?: boolean; realignInkBar?: boolean; }) {
    super.setSelectedTabIndex(value, {
      realignInkBar: !this.mobile, // Tab header are NOT visible on mobile
      ...opts
    });
  }

  realignInkBar() {
    if (this.tabGroup && this.showBatchTables) {
      //this.tabGroup.selectedIndex = this.selectedTabIndex;
      this.tabGroup.realignInkBar();
    }
  }

  addRow(event: UIEvent) {
    switch (this.selectedTabIndex) {
      case 0:
        this.batchGroupsTable.addRow(event);
        break;
      case 1:
        this.subBatchesTable.addRow(event);
        break;
    }
  }

  getFirstInvalidTabIndex(): number {
    if (this.showCatchForm && this.catchBatchForm.invalid) return 0;
    if (this.showBatchTables && this.batchGroupsTable.invalid) return 0;
    if (this.allowSubBatches && this.subBatchesTable?.invalid) return 1;
    return -1;
  }

  waitIdle(): Promise<any> {
    return AppFormUtils.waitIdle(this);
  }

  /* -- protected methods -- */

  async getSubBatches(): Promise<SubBatch[]> {
    if (!this.showBatchTables) return undefined;
    if (this.subBatchesTable) {
      return this.getTableValue(this.subBatchesTable);
    } else {
      return this._subBatchesService.value;
    }
  }


  protected resetSubBatches() {
    if (this.subBatchesTable) this.subBatchesTable.value = [];
    if (this._subBatchesService) this._subBatchesService.setValue([]);
  }

  protected async getTableValue<T extends Entity<T>>(table: AppTable<T> & { value: T[]}): Promise<T[]> {
    if (table.dirty) {
      await table.save();

      // Remember dirty state
      this.markAsDirty({emitEvent: false});
    }

    return table.value;
  }

  markForCheck() {
    this.cd.markForCheck();
  }
}
