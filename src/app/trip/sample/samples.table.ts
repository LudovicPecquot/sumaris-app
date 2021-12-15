import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Directive, EventEmitter, Injector, Input, Optional, Output, ViewChild } from '@angular/core';
import { TableElement } from '@e-is/ngx-material-table';
import { SampleValidatorService } from '../services/validator/sample.validator';
import { SamplingStrategyService } from '@app/referential/services/sampling-strategy.service';
import {
  AppFormUtils,
  AppValidatorService,
  ColorName,
  firstNotNilPromise,
  InMemoryEntitiesService,
  IReferentialRef,
  isEmptyArray,
  isNil,
  isNilOrBlank,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrBlank,
  LoadResult,
  ObjectMap,
  PlatformService,
  ReferentialRef, ReferentialUtils,
  RESERVED_END_COLUMNS,
  RESERVED_START_COLUMNS,
  toBoolean,
  toNumber,
  UsageMode,
} from '@sumaris-net/ngx-components';
import * as momentImported from 'moment';
import { Moment } from 'moment';
import { AppMeasurementsTable, AppMeasurementsTableOptions } from '../measurement/measurements.table.class';
import { ISampleModalOptions, SampleModal } from './sample.modal';
import {FormGroup, Validators} from '@angular/forms';
import { TaxonGroupRef } from '@app/referential/services/model/taxon-group.model';
import { Sample, SampleUtils } from '../services/model/sample.model';
import {AcquisitionLevelCodes, AcquisitionLevelType, ParameterGroups, PmfmIds, QualitativeLabels, WeightUnitSymbol} from '@app/referential/services/model/model.enum';
import { ReferentialRefService } from '@app/referential/services/referential-ref.service';
import { environment } from '@environments/environment';
import {debounceTime, delay, filter, map, tap} from 'rxjs/operators';
import { IPmfm, PmfmUtils } from '@app/referential/services/model/pmfm.model';
import { SampleFilter } from '../services/filter/sample.filter';
import { PmfmFilter, PmfmService } from '@app/referential/services/pmfm.service';
import { SelectPmfmModal } from '@app/referential/pmfm/select-pmfm.modal';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { MatMenu } from '@angular/material/menu';
import { TaxonNameRef } from '@app/referential/services/model/taxon-name.model';
import { isNilOrNaN } from '@app/shared/functions';
import { DenormalizedPmfmStrategy } from '@app/referential/services/model/pmfm-strategy.model';
import { BatchGroup } from '@app/trip/services/model/batch-group.model';
import { ISubSampleModalOptions, SubSampleModal } from '@app/trip/sample/sub-sample.modal';
import { MatCellDef } from '@angular/material/table';
import { OverlayEventDetail } from '@ionic/core';

const moment = momentImported;

/**
 * Cell definition for the mat-table.
 * Captures the template of a column's data row cell as well as cell-specific properties.
 */
@Directive({
  selector: '[appActionCellDef]',
  providers: [{provide: MatCellDef, useExisting: AppActionCellDef}],
})
export class AppActionCellDef extends MatCellDef {}

export type PmfmValueColorFn = (value: any, pmfm: IPmfm) => ColorName;

export class SamplesTableOptions extends AppMeasurementsTableOptions<Sample> {

}

declare interface GroupColumnDefinition {
  key: string;
  label?: string;
  name?: string;
  colSpan: number;
  cssClass?: string;
}

export const SAMPLE_RESERVED_START_COLUMNS: string[] = ['label', 'taxonGroup', 'taxonName', 'sampleDate'];
export const SAMPLE_RESERVED_END_COLUMNS: string[] = ['comments'];
export const SAMPLE_TABLE_DEFAULT_I18N_PREFIX = 'TRIP.SAMPLE.TABLE.';

@Component({
  selector: 'app-samples-table',
  templateUrl: 'samples.table.html',
  styleUrls: ['samples.table.scss'],
  providers: [
    {provide: AppValidatorService, useExisting: SampleValidatorService}
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SamplesTable extends AppMeasurementsTable<Sample, SampleFilter> {

  private _footerRowsSubscription: Subscription;

  protected cd: ChangeDetectorRef;
  protected referentialRefService: ReferentialRefService;
  protected pmfmService: PmfmService;
  protected currentSample: Sample; // require to preset presentation on new row
  protected currentTagId: string;

  // Top group header
  groupHeaderStartColSpan: number;
  groupHeaderEndColSpan: number;
  $pmfmGroups = new BehaviorSubject<ObjectMap<number[]>>(null);
  pmfmGroupColumns$ = new BehaviorSubject<GroupColumnDefinition[]>([]);
  groupHeaderColumnNames: string[] = [];
  footerColumns: string[] = ['footer-start'];
  showFooter: boolean;
  showTagCount: boolean;
  tagCount$ = new BehaviorSubject<number>(0);

  @Input() tagIdPmfm: IPmfm;
  @Input() showGroupHeader = false;
  @Input() useSticky = false;
  @Input() canAddPmfm = false;
  @Input() showError = true;
  @Input() showToolbar: boolean;
  @Input() mobile: boolean;
  @Input() usageMode: UsageMode;
  @Input() showLabelColumn = false;
  @Input() showPmfmDetails = false;
  @Input() showFabButton = false;
  @Input() showIndividualReleaseButton = false;
  @Input() showIndividualMonitoringButton = false;
  @Input() defaultSampleDate: Moment;
  @Input() defaultTaxonGroup: ReferentialRef;
  @Input() defaultTaxonName: ReferentialRef;
  @Input() modalOptions: Partial<ISampleModalOptions>;
  @Input() subSampleModalOptions: Partial<ISubSampleModalOptions>;
  @Input() compactFields = true;
  @Input() showDisplayColumnModal = true;
  @Input() weightDisplayedUnit: WeightUnitSymbol;
  @Input() tagIdMinLength = 4;
  @Input() tagIdPadString = '0';
  @Input() defaultLatitudeSign: '+' | '-';
  @Input() defaultLongitudeSign: '+' | '-';

  //@ViewChild('[appActionCellDef]') actionCellDef: AppActionCellDef;

  @Input() set pmfmGroups(value: ObjectMap<number[]>) {
    if (this.$pmfmGroups.value !== value) {
      this.showGroupHeader = true;
      this.showToolbar = false;
      this.$pmfmGroups.next(value);
    }
  }

  get pmfmGroups(): ObjectMap<number[]> {
    return this.$pmfmGroups.getValue();
  }

  @Input()
  set value(data: Sample[]) {
    this.memoryDataService.value = data;
  }

  get value(): Sample[] {
    return this.memoryDataService.value;
  }

  @Input()
  set showSampleDateColumn(value: boolean) {
    this.setShowColumn('sampleDate', value);
  }

  get showSampleDateColumn(): boolean {
    return this.getShowColumn('sampleDate');
  }

  @Input()
  set showTaxonGroupColumn(value: boolean) {
    this.setShowColumn('taxonGroup', value);
  }

  get showTaxonGroupColumn(): boolean {
    return this.getShowColumn('taxonGroup');
  }

  @Input()
  set showTaxonNameColumn(value: boolean) {
    this.setShowColumn('taxonName', value);
  }

  get showTaxonNameColumn(): boolean {
    return this.getShowColumn('taxonName');
  }

  @Input() availableTaxonGroups: IReferentialRef[] | Observable<IReferentialRef[]>;

  get memoryDataService(): InMemoryEntitiesService<Sample, SampleFilter> {
    return this.dataService as InMemoryEntitiesService<Sample, SampleFilter>;
  }

  @Output() onPrepareRowForm = new EventEmitter<{ form: FormGroup, pmfms: IPmfm[] }>();

  @ViewChild('optionsMenu') optionMenu: MatMenu;

  constructor(
    injector: Injector,
    protected samplingStrategyService: SamplingStrategyService,
    @Optional() options?: SamplesTableOptions
  ) {
    super(injector,
      Sample,
      new InMemoryEntitiesService(Sample, SampleFilter, {
        equals: Sample.equals,
        sortByReplacement: {'id': 'rankOrder'}
      }),
      injector.get(PlatformService).mobile ? null : injector.get(AppValidatorService),
      {
        prependNewElements: false,
        suppressErrors: environment.production,
        reservedStartColumns: SAMPLE_RESERVED_START_COLUMNS,
        reservedEndColumns: SAMPLE_RESERVED_END_COLUMNS,
        requiredStrategy: false,
        debug: !environment.production,
        ...options,
        // Cannot override mapPmfms (by options)
        mapPmfms: (pmfms) => this.mapPmfms(pmfms)
      }
    );
    this.cd = injector.get(ChangeDetectorRef);
    this.referentialRefService = injector.get(ReferentialRefService);
    this.pmfmService = injector.get(PmfmService);
    this.i18nColumnPrefix = 'TRIP.SAMPLE.TABLE.';
    this.i18nPmfmPrefix = 'TRIP.SAMPLE.PMFM.';
    this.inlineEdition = !this.mobile;
    this.defaultSortBy = 'rankOrder';
    this.defaultSortDirection = 'asc';

    this.confirmBeforeDelete = false;
    this.confirmBeforeCancel = false;
    this.undoableDeletion = false;
    this.saveBeforeDelete = this.mobile;

    this.saveBeforeSort = true;
    this.saveBeforeFilter = true;
    this.propagateRowError = true;

    // Set default value
    this._acquisitionLevel = null; // Avoid load to early. Need sub classes to set it

    //this.debug = false;
    this.debug = !environment.production;

    // If init form callback exists, apply it when start row edition
    this.registerSubscription(
      this.onStartEditingRow
        .pipe(
          filter(row => row && row.validator && true),
          map(row => ({form: row.validator, pmfms: this.pmfms})),
          tap(event => {
            // DEBUG
            //console.debug('[samples-table] will sent onPrepareRowForm event:', event)
            this.onPrepareRowForm.emit(event);

            // Force update of the form validity
            event.form?.updateValueAndValidity({emitEvent: true, onlySelf: false});
          })
        )
        .subscribe());
  }

  ngOnInit() {
    this.inlineEdition = this.validatorService && !this.mobile;
    this.allowRowDetail = !this.inlineEdition;
    this.showToolbar = toBoolean(this.showToolbar, !this.showGroupHeader);

    // in DEBUG only: force validator = null
    if (this.debug && this.mobile) this.setValidatorService(null);

    super.ngOnInit();

    // Add footer listener
    this.registerSubscription(
      this.$pmfms.subscribe(pmfms => this.addFooterListener(pmfms))
    );

    // Create listener on column 'INDIVIDUAL_ON_DECK' value changes
    this.registerSubscription(
      this.registerCellValueChanges('individual_on_deck', "measurementValues." + PmfmIds.INDIVIDUAL_ON_DECK.toString())
        .subscribe((value) => {
          if (!this.editedRow || !this.pmfms) return; // Should never occur
          const row = this.editedRow;

            const individualOnDeckPmfm = this.pmfms.find(pmfm => pmfm.id === PmfmIds.INDIVIDUAL_ON_DECK);
            if (individualOnDeckPmfm) {

              const measFormGroup = (row.validator.controls['measurementValues'] as FormGroup);
              const individualOnDeckControl = measFormGroup.controls[individualOnDeckPmfm.id];
              const controls = this.pmfms.filter(pmfm => pmfm.rankOrder > individualOnDeckPmfm.rankOrder).map(pmfm => measFormGroup.controls[pmfm.id]);

              this.registerSubscription(individualOnDeckControl.valueChanges
                .pipe(
                  // IMPORTANT: add a delay, to make sure to be executed AFTER the form.enable()
                  delay(200)
                )
                .subscribe((value) => {
                  if (value) {
                    if (row.validator.enabled) {
                      controls.forEach(control => {
                        control.enable();
                      });
                      this.pmfms.filter(pmfm => pmfm.rankOrder > individualOnDeckPmfm.rankOrder && pmfm.required).forEach(pmfm => {
                        measFormGroup.controls[pmfm.id].setValidators(Validators.required);
                        measFormGroup.controls[pmfm.id].updateValueAndValidity({onlySelf: true})
                      });

                      measFormGroup.updateValueAndValidity({onlySelf: true});
                      row.validator.updateValueAndValidity({onlySelf: true});
                    }
                  } else {
                    controls.forEach(control => {
                      control.setValue(null);
                      control.setValidators(null);
                      control.disable();
                    });
                  }
                }));
            }
        }));

  }

  ngAfterViewInit() {
    super.ngAfterViewInit();

    this.setShowColumn('label', this.showLabelColumn);
    this.setShowColumn('comments', this.showCommentsColumn);

    // Taxon group combo
    this.registerAutocompleteField('taxonGroup', {
      suggestFn: (value: any, options?: any) => this.suggestTaxonGroups(value, options)
    });

    // Taxon name combo
    this.registerAutocompleteField('taxonName', {
      suggestFn: (value: any, options?: any) => this.suggestTaxonNames(value, options),
      showAllOnFocus: this.showTaxonGroupColumn /*show all, because limited to taxon group*/
    });
  }

  ngOnDestroy() {
    super.ngOnDestroy();

    this.onPrepareRowForm.complete();
    this.onPrepareRowForm.unsubscribe();
    this.$pmfmGroups.complete();
    this.$pmfmGroups.unsubscribe();
    this.pmfmGroupColumns$.complete();
    this.pmfmGroupColumns$.unsubscribe();
  }

  /**
   * Use in ngFor, for trackBy
   * @param index
   * @param column
   */
  trackColumnDef(index: number, column: GroupColumnDefinition) {
    return column.key;
  }

  setSubSampleModalOption(key: keyof ISubSampleModalOptions, value: ISubSampleModalOptions[typeof key]) {
    this.subSampleModalOptions = this.subSampleModalOptions || {};
    this.subSampleModalOptions[key as any] = value;
  }

  async openDetailModal(dataToOpen?: Sample, row?: TableElement<Sample>): Promise<OverlayEventDetail<Sample | undefined>> {
    console.debug('[samples-table] Opening detail modal...');
    const pmfms = await firstNotNilPromise(this.$pmfms);

    let isNew = !dataToOpen && true;
    if (isNew) {
      dataToOpen = new Sample();
      await this.onNewEntity(dataToOpen);
    }

    const onModalReady = (modal) => {
      const form = modal.form.form;
      this.onPrepareRowForm.emit({form, pmfms});
    };

    this.markAsLoading();

    const options: Partial<ISampleModalOptions> = {
      // Default options:
      programLabel: undefined, // Prefer to pass PMFMs directly, to avoid a reloading
      pmfms,
      acquisitionLevel: this.acquisitionLevel,
      disabled: this.disabled,
      i18nSuffix: this.i18nColumnSuffix,
      usageMode: this.usageMode,
      showLabel: this.showLabelColumn,
      mobile: this.mobile,
      defaultSampleDate: this.defaultSampleDate,
      showSampleDate: this.showSampleDateColumn,
      showTaxonGroup: this.showTaxonGroupColumn,
      showTaxonName: this.showTaxonNameColumn,
      showIndividualReleaseButton: this.showIndividualReleaseButton,
      onReady: onModalReady,
      onDelete: (event, data) => this.deleteEntity(event, data),
      onSaveAndNew: async (dataToSave) => {
        if (isNew) {
          await this.addEntityToTable(dataToSave);
        } else {
          this.updateEntityToTable(dataToSave, row);
          row = null; // Avoid updating twice (should never occur, because onSubmitAndNext always create a new entity)
          isNew = true; // Next row should be new
        }
        // Prepare new sample
        const newData = new Sample();
        await this.onNewEntity(newData);
        return newData;
      },
      openSubSampleModal: (parent, acquisitionLevel) => this.openSubSampleModalFromRootModal(parent, acquisitionLevel),

      // Override using given options
      ...this.modalOptions,

      // Data to open
      isNew,
      data: dataToOpen
    };

    const modal = await this.modalCtrl.create({
      component: SampleModal,
      componentProps: options,
      keyboardClose: true,
      backdropDismiss: false,
      cssClass: 'modal-large'
    });

    // Open the modal
    await modal.present();

    // Wait until closed
    const {data, role} = await modal.onDidDismiss();
    if (data && this.debug) console.debug('[samples-table] Modal result: ', data);
    this.markAsLoaded();

    return {data:(data instanceof Sample ? data : undefined), role};
  }

  async onIndividualMonitoringClick(event: UIEvent, row: TableElement<Sample>) {
    return this.onSubSampleButtonClick(event, row, AcquisitionLevelCodes.INDIVIDUAL_MONITORING);

  }

  async onIndividualReleaseClick(event: UIEvent, row: TableElement<Sample>) {
    return this.onSubSampleButtonClick(event, row, AcquisitionLevelCodes.INDIVIDUAL_RELEASE);
  }

  async onSubSampleButtonClick(event: UIEvent,
                               row: TableElement<Sample>,
                               acquisitionLevel: AcquisitionLevelType) {
    if (event) event.preventDefault();
    console.debug(`[samples-table] onSubSampleButtonClick() on ${acquisitionLevel}`);
    // Loading spinner
    this.markAsLoading();

    try {

      const parent = this.toEntity(row);
      const { data, role } = await this.openSubSampleModal(parent, {acquisitionLevel });

      if (isNil(data)) return; // User cancelled

      if (role === 'DELETE') {
        parent.children = SampleUtils.removeChild(parent, data);
      }
      else {
        parent.children = SampleUtils.insertOrUpdateChild(parent, data, acquisitionLevel);
      }

      if (row.validator) {
        row.validator.patchValue({children: parent.children});
      }
      else {
        row.currentData.children = parent.children.slice(); // Force pipes update
        this.markAsDirty();
      }

    } finally {
      this.markAsLoaded();
    }
  }

  protected async openSubSampleModalFromRootModal(parent: Sample, acquisitionLevel: AcquisitionLevelType): Promise<Sample> {
    if (!parent || !acquisitionLevel) throw Error('Missing \'parent\' or \'acquisitionLevel\' arguments');

    // Make sure the row exists
    this.editedRow = (this.editedRow && BatchGroup.equals(this.editedRow.currentData, parent) && this.editedRow)
      || (await this.findRowByEntity(parent))
      // Or add it to table, if new
      || (await this.addEntityToTable(parent, {confirmCreate: false}));

    const { data, role } = await this.openSubSampleModal(parent, { acquisitionLevel });

    if (isNil(data)) return; // User cancelled

    if (role === 'DELETE') {
      parent.children = SampleUtils.removeChild(parent, data);
    }
    else {
      parent.children = SampleUtils.insertOrUpdateChild(parent, data, acquisitionLevel);
    }

    // Return the updated parent
    return parent;
  }

  protected async openSubSampleModal(parentSample?: Sample, opts?: {
    showParent?: boolean;
    acquisitionLevel?: AcquisitionLevelType;
  }): Promise<OverlayEventDetail<Sample | undefined>> {


    const showParent = opts && opts.showParent === true; // False by default
    const acquisitionLevel = opts?.acquisitionLevel || AcquisitionLevelCodes.INDIVIDUAL_MONITORING;

    console.debug(`[samples-table] Opening sub-sample modal for {acquisitionLevel: ${acquisitionLevel}}`);

    const children = SampleUtils.filterByAcquisitionLevel(parentSample.children || [], acquisitionLevel);
    const isNew = !children || children.length === 0;
    let subSample: Sample;
    if (isNew) {
      subSample = new Sample();
    } else {
      subSample = children[0];
    }

    // Make sure to set the parent
    subSample.parent = parentSample.asObject({withChildren: false});

    const hasTopModal = !!(await this.modalCtrl.getTop());
    const modal = await this.modalCtrl.create({
      component: SubSampleModal,
      componentProps: <ISubSampleModalOptions>{
        programLabel: this.programLabel,
        usageMode: this.usageMode,
        acquisitionLevel,
        isNew,
        data: subSample,
        showParent,
        i18nSuffix: this.i18nColumnSuffix,
        defaultLatitudeSign: this.defaultLatitudeSign,
        defaultLongitudeSign: this.defaultLongitudeSign,
        showLabel: false,
        disabled: this.disabled,
        maxVisibleButtons: this.modalOptions?.maxVisibleButtons,
        mobile: this.mobile,

        onDelete: (event, data) => Promise.resolve(true),
        ...this.subSampleModalOptions
      },
      backdropDismiss: false,
      keyboardClose: true,
      cssClass: hasTopModal ? 'modal-large stack-modal' : 'modal-large'
    });

    // Open the modal
    await modal.present();

    // Wait until closed
    const {data, role} = await modal.onDidDismiss();

    // User cancelled
    if (isNil(data)) {
      if (this.debug) console.debug('[sample-table] Sub-sample modal: user cancelled');
    } else {
      // DEBUG
      if (this.debug) console.debug('[sample-table] Sub-sample modal result: ', data, role);
    }

    return {data, role};
  }

  onDeleteSubSample(event: UIEvent, parent: Sample, subSample: Sample): boolean {

    parent.children = SampleUtils.removeChild(parent, subSample);

    this.findRowByEntity(parent)
      .then(row => {
        if (row.validator) {
          row.validator.patchValue({ children: parent.children})
        }
        else {
          row.currentData.children = parent.children.slice(); // Force pipes update
          this.markAsDirty();
        }
      });

    return true;
  }

  filterColumnsByTaxonGroup(taxonGroup: TaxonGroupRef) {
    const toggleLoading = !this.loading;
    if (toggleLoading) this.markAsLoading();

    try {
      const taxonGroupId = toNumber(taxonGroup && taxonGroup.id, null);
      (this.pmfms || []).forEach(pmfm => {

        const show = isNil(taxonGroupId)
          || !PmfmUtils.isDenormalizedPmfm(pmfm)
          || (isEmptyArray(pmfm.taxonGroupIds) || pmfm.taxonGroupIds.includes(taxonGroupId));
        this.setShowColumn(pmfm.id.toString(), show);
      });

      this.updateColumns();
    }
    finally {
      if (toggleLoading) this.markAsLoaded();
    }
  }

  async openAddPmfmsModal(event?: UIEvent) {

    // If pending rows, save first
    if (this.dirty) {
      const saved = await this.save();
      if (!saved) return;
    }

    const existingPmfmIds = (this.pmfms || []).map(p => p.id).filter(isNotNil);

    const pmfmIds = await this.openSelectPmfmsModal(event, {
      excludedIds: existingPmfmIds
    }, {
      allowMultiple: false
    });
    if (!pmfmIds) return; // User cancelled

    console.debug('[samples-table] Adding pmfm ids:', pmfmIds);
    await this.addPmfmColumns(pmfmIds);

  }

  /**
   * Not used yet. Implementation must manage stored samples values and different pmfms types (number, string, qualitative values...)
   * @param event
   */
  async openChangePmfmsModal(event?: UIEvent) {
    const existingPmfmIds = (this.pmfms || []).map(p => p.id).filter(isNotNil);

    const pmfmIds = await this.openSelectPmfmsModal(event, {
      excludedIds: existingPmfmIds
    }, {
      allowMultiple: false
    });
    if (!pmfmIds) return; // USer cancelled

  }

  /* -- protected methods -- */

  protected async suggestTaxonGroups(value: any, options?: any): Promise<LoadResult<IReferentialRef>> {
    //if (isNilOrBlank(value)) return [];
    return this.programRefService.suggestTaxonGroups(value,
      {
        program: this.programLabel,
        searchAttribute: options && options.searchAttribute
      });
  }

  protected async suggestTaxonNames(value: any, options?: any): Promise<LoadResult<IReferentialRef>> {
    const taxonGroup = this.editedRow && this.editedRow.validator.get('taxonGroup').value;

    // IF taxonGroup column exists: taxon group must be filled first
    if (this.showTaxonGroupColumn && isNilOrBlank(value) && isNil(taxonGroup)) return {data: []};

    return this.programRefService.suggestTaxonNames(value,
      {
        programLabel: this.programLabel,
        searchAttribute: options && options.searchAttribute,
        taxonGroupId: taxonGroup && taxonGroup.id || undefined
      });
  }

  protected async onNewEntity(data: Sample): Promise<void> {
    console.debug('[sample-table] Initializing new row data...');

    await super.onNewEntity(data);

    // generate label
    if (!this.showLabelColumn) {
      data.label = `${this.acquisitionLevel}#${data.rankOrder}`;
    }

    // Default date
    if (isNotNil(this.defaultSampleDate)) {
      data.sampleDate = this.defaultSampleDate;
    } else {
      if (this.settings.isOnFieldMode(this.usageMode)) {
        data.sampleDate = moment();
      }
    }

    // Default taxon name
    if (isNotNil(this.defaultTaxonName)) {
      data.taxonName = TaxonNameRef.fromObject(this.defaultTaxonName);
    }

    // Default taxon group
    if (isNotNil(this.defaultTaxonGroup)) {
      data.taxonGroup = TaxonGroupRef.fromObject(this.defaultTaxonGroup);
    }

    // Get the previous sample
    const previousSample: Sample = await this.getPreviousSample();

    // server call for first sample and increment from server call value
    if (data.measurementValues.hasOwnProperty(PmfmIds.TAG_ID) && this._strategyLabel && this.tagIdMinLength > 0) {
      const existingTagId = this.currentTagId || previousSample?.measurementValues[PmfmIds.TAG_ID];
      const existingTagIdAsNumber = existingTagId && parseInt(existingTagId);
      const newTagId = isNilOrNaN(existingTagIdAsNumber)
        ? (await this.samplingStrategyService.computeNextSampleTagId(this._strategyLabel, '-', this.tagIdMinLength)).slice(-1 * this.tagIdMinLength)
        : (existingTagIdAsNumber + 1).toString().padStart(this.tagIdMinLength, '0');
      data.measurementValues[PmfmIds.TAG_ID] = newTagId;
      this.currentTagId = newTagId; // Remember, for next iteration
    }

    // Default presentation value
    if (data.measurementValues.hasOwnProperty(PmfmIds.DRESSING) && previousSample) {
      data.measurementValues[PmfmIds.DRESSING] = previousSample.measurementValues[PmfmIds.DRESSING];
    }
  }

  protected async getPreviousSample(): Promise<Sample> {
    if (isNil(this.visibleRowCount) || this.visibleRowCount === 0) return undefined;
    const row = await this.dataSource.getRow(this.visibleRowCount - 1);
    return row && row.currentData;
  }

  protected async openNewRowDetail(): Promise<boolean> {
    if (!this.allowRowDetail) return false;

    const {data} = await this.openDetailModal();
    if (data) {
      await this.addEntityToTable(data);
    }
    return true;
  }

  protected async openRow(id: number, row: TableElement<Sample>): Promise<boolean> {
    if (!this.allowRowDetail) return false;

    if (this.onOpenRow.observers.length) {
      this.onOpenRow.emit({id, row});
      return true;
    }

    const dataToOpen = this.toEntity(row, true);

    // Prepare entity measurement values
    this.prepareEntityToSave(dataToOpen);

    const {data} = await this.openDetailModal(dataToOpen, row);
    if (data) {
      await this.updateEntityToTable(data, row);
    } else {
      this.editedRow = null;
    }
    return true;
  }

  protected prepareEntityToSave(data: Sample) {
    // Override by subclasses
  }

  async findRowByEntity(data: Sample): Promise<TableElement<Sample>> {
    if (!data || isNil(data.rankOrder)) throw new Error('Missing argument data or data.rankOrder');
    return (await this.dataSource.getRows())
      .find(r => r.currentData.rankOrder === data.rankOrder);
  }

  async deleteEntity(event: UIEvent, data: Sample): Promise<boolean> {
    const row = await this.findRowByEntity(data);

    // Row not exists: OK
    if (!row) return true;

    const canDeleteRow = await this.canDeleteRows([row]);
    if (canDeleteRow === true) {
      this.cancelOrDelete(event, row, {interactive: false /*already confirmed*/});
    }
    return canDeleteRow;
  }


  protected async addPmfmColumns(pmfmIds: number[]) {
    if (isEmptyArray(pmfmIds)) return; // Skip if empty

    // Load each pmfms, by id
    const newPmfms = (await Promise.all(pmfmIds.map(id => this.pmfmService.loadPmfmFull(id))))
      .map(DenormalizedPmfmStrategy.fromFullPmfm);

    this.pmfms = [
      ...this.pmfms,
      ...newPmfms
    ];
  }

  protected async openSelectPmfmsModal(event?: UIEvent, filter?: Partial<PmfmFilter>,
                                       opts?: {
                                         allowMultiple?: boolean;
                                       }): Promise<number[]> {

    const modal = await this.modalCtrl.create({
      component: SelectPmfmModal,
      componentProps: {
        filter: PmfmFilter.fromObject(filter),
        allowMultiple: opts && opts.allowMultiple
      },
      keyboardClose: true,
      cssClass: 'modal-large'
    });

    // Open the modal
    await modal.present();

    // On dismiss
    const res = await modal.onDidDismiss();
    if (!res || isEmptyArray(res.data)) return; // CANCELLED

    // Return pmfm ids
    return res.data.map(p => p.id);
  }

  /**
   * Force to wait PMFM map to be loaded
   * @param pmfms
   */
  protected async mapPmfms(pmfms: IPmfm[]): Promise<IPmfm[]> {

    if (isEmptyArray(pmfms)) return pmfms; // Nothing to map

    if (this.showGroupHeader) {
      console.debug('[samples-table] Computing Pmfm group header...');

      // Wait until map is loaded
      const groupedPmfmIdsMap = await firstNotNilPromise(this.$pmfmGroups);

      // Create a list of known pmfm ids
      const groupedPmfmIds = Object.values(groupedPmfmIdsMap).reduce((res, pmfmIds) => res.concat(...pmfmIds), []);

      // Create pmfms group
      const orderedPmfmIds: number[] = [];
      const orderedPmfms: IPmfm[] = [];
      let groupIndex = 0;
      const pmfmGroupColumns: GroupColumnDefinition[] = ParameterGroups.concat('OTHER').reduce((pmfmGroups, group) => {
        let groupPmfms: IPmfm[];
        if (group === 'OTHER') {
          groupPmfms = pmfms.filter(p => !groupedPmfmIds.includes(p.id));
        } else {
          const groupPmfmIds = groupedPmfmIdsMap[group];
          groupPmfms = isNotEmptyArray(groupPmfmIds) ? pmfms.filter(p => groupPmfmIds.includes(p.id)) : [];
        }

        const groupPmfmCount = groupPmfms.length;
        if (groupPmfmCount) {
          ++groupIndex;
        }
        const cssClass = groupIndex % 2 === 0 ? 'even' : 'odd';

        groupPmfms.forEach(pmfm => {
          pmfm = pmfm.clone(); // Clone, to leave original PMFM unchanged

          // Use rankOrder as a group index (will be used in template, to computed column class)
          if (PmfmUtils.isDenormalizedPmfm(pmfm)) {
            pmfm.rankOrder = groupIndex;
          }

          // Apply weight conversion, if need
          if (this.weightDisplayedUnit) {
            PmfmUtils.setWeightUnitConversion(pmfm, this.weightDisplayedUnit, {clone: false});
          }

          // Add pmfm into the final list of ordered pmfms
          orderedPmfms.push(pmfm);
        });

        return pmfmGroups.concat(
          ...groupPmfms.reduce((res, pmfm, index) => {
            if (orderedPmfmIds.includes(pmfm.id)) return res; // Skip if already proceed
            orderedPmfmIds.push(pmfm.id);
            const visible = group !== 'TAG_ID'; //  && groupPmfmCount > 1;
            const key = 'group-' + group;
            return index !== 0 ? res : res.concat(<GroupColumnDefinition>{
              key,
              label: group,
              name: visible && ('TRIP.SAMPLE.PMFM_GROUP.' + group) || '',
              cssClass: visible && cssClass || '',
              colSpan: groupPmfmCount
            });
          }, []));
      }, []);
      this.pmfmGroupColumns$.next(pmfmGroupColumns);
      this.groupHeaderColumnNames =
        ['top-start']
          .concat(pmfmGroupColumns.map(g => g.key))
          .concat(['top-end']);
      this.groupHeaderStartColSpan = RESERVED_START_COLUMNS.length
        + (this.showLabelColumn ? 1 : 0)
        + (this.showTaxonGroupColumn ? 1 : 0)
        + (this.showTaxonNameColumn ? 1 : 0)
        + (this.showSampleDateColumn ? 1 : 0);
      this.groupHeaderEndColSpan = RESERVED_END_COLUMNS.length
        + (this.showCommentsColumn ? 1 : 0);

      pmfms = orderedPmfms;
    }

    // No pmfm group (no table top headers)
    else {
      // Apply weight conversion, if need
      if (this.weightDisplayedUnit) {
        pmfms = PmfmUtils.setWeightUnitConversions(pmfms, this.weightDisplayedUnit);
      }
    }

    // Add replacement map, for sort by
    const dataService = this.memoryDataService;
    pmfms
      .forEach(p => dataService.addSortByReplacement(p.id.toString(), `measurementValues.${p.id}`));

    return pmfms;
  }

  openSelectColumnsModal(event?: UIEvent): Promise<any> {
    return super.openSelectColumnsModal(event);
  }

  getPmfmValueColor(pmfmValue: any, pmfm: IPmfm): string {
    let color: ColorName;
    switch (pmfm.id) {
      case PmfmIds.OUT_OF_SIZE_PCT:
        if (pmfmValue && pmfmValue > 50) {
          color = 'danger';
        } else {
          color = 'success';
        }
        break;
    }
    return color ? `var(--ion-color-${color})` : undefined;
  }

  addRow(event?: Event, insertAt?: number): boolean {
    this.focusColumn = this.firstUserColumn;
    return super.addRow(event, insertAt);
  }

  protected addFooterListener(pmfms: IPmfm[]) {

    this.tagIdPmfm = this.tagIdPmfm || pmfms && pmfms.find(pmfm => pmfm.id === PmfmIds.TAG_ID);
    this.showTagCount = !!this.tagIdPmfm;

    // Should display tag count: add column to footer
    if (this.showTagCount && !this.footerColumns.includes('footer-tagCount')) {
      this.footerColumns = [...this.footerColumns, 'footer-tagCount'];
    }
    // If tag count not displayed
    else if (!this.showTagCount) {
      // Remove from footer columns
      this.footerColumns = this.footerColumns.filter(column => column !== 'footer-tagCount');

      // Reset counter
      this.tagCount$.next(0);
    }

    this.showFooter = this.footerColumns.length > 1;

    // DEBUG
    console.debug('[samples-table] Show footer ?', this.showFooter);

    // Remove previous rows listener
    if (!this.showFooter && this._footerRowsSubscription) {
      this.unregisterSubscription(this._footerRowsSubscription);
      this._footerRowsSubscription.unsubscribe();
      this._footerRowsSubscription = null;
    } else if (this.showFooter && !this._footerRowsSubscription) {
      this._footerRowsSubscription = this.dataSource.connect(null)
        .pipe(
          debounceTime(500)
        ).subscribe(rows => this.updateFooter(rows));
    }
  }

  protected updateFooter(rows: TableElement<Sample>[] | readonly TableElement<Sample>[]) {
    // Update tag count
    const tagCount = (rows || []).map(row => row.currentData.measurementValues[PmfmIds.TAG_ID.toString()] as string)
      .filter(isNotNilOrBlank)
      .length;
    this.tagCount$.next(tagCount);
  }

  selectInputContent = AppFormUtils.selectInputContent;
  isIndividualMonitoring = SampleUtils.isIndividualMonitoring;
  isIndividualRelease = SampleUtils.isIndividualRelease;

  markForCheck() {
    this.cd.markForCheck();
  }

}

