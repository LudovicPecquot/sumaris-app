import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, QueryList, ViewChildren} from '@angular/core';
import {Batch, BatchUtils} from '../../services/model/batch.model';
import {DateAdapter} from '@angular/material/core';
import {Moment} from 'moment';
import {AbstractControl, FormBuilder, FormControl} from '@angular/forms';
import {ReferentialRefService} from '@app/referential/services/referential-ref.service';
import {AcquisitionLevelCodes} from '@app/referential/services/model/model.enum';
import {
  AppFormUtils,
  fadeInAnimation,
  firstNotNilPromise,
  InputElement,
  isNotEmptyArray,
  isNotNil,
  LocalSettingsService,
  PlatformService,
  ReferentialUtils,
  toBoolean,
} from '@sumaris-net/ngx-components';
import {BatchGroupValidatorService} from '../../services/validator/batch-group.validator';
import {BehaviorSubject} from 'rxjs';
import {BatchForm} from './batch.form';
import { distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import {BatchGroup} from '../../services/model/batch-group.model';
import {MeasurementsValidatorService} from '../../services/validator/measurement.validator';
import {IPmfm, PmfmUtils} from '@app/referential/services/model/pmfm.model';
import {ProgramRefService} from '@app/referential/services/program-ref.service';

@Component({
  selector: 'app-batch-group-form',
  templateUrl: 'batch-group.form.html',
  styleUrls: ['batch-group.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeInAnimation]
})
export class BatchGroupForm extends BatchForm<BatchGroup> {

  $childrenPmfms = new BehaviorSubject<IPmfm[]>(undefined);
  hasIndividualMeasureControl: AbstractControl;

  @Input() qvPmfm: IPmfm;
  @Input() taxonGroupsNoWeight: string[];
  @Input() showChildrenWeight = true;
  @Input() showChildrenSampleBatch = true;
  @Input() showSamplingBatch: boolean;
  @Input() defaultIsSampling: boolean;

  @ViewChildren('firstInput') firstInputFields !: QueryList<InputElement>;
  @ViewChildren('childForm') children !: QueryList<BatchForm>;

  get invalid(): boolean {
    return this.form.invalid || this.hasIndividualMeasureControl.invalid ||
      ((this.children || []).find(child => child.invalid) && true) || false;
  }

  get valid(): boolean {
    // Important: Should be not invalid AND not pending, so use '!valid' (and NOT 'invalid')
    return this.form.valid && this.hasIndividualMeasureControl.valid &&
      (!this.children || !this.children.find(child => !child.valid)) || false;
  }

  get pending(): boolean {
    return this.form.pending || this.hasIndividualMeasureControl.pending ||
      (this.children && this.children.find(child => child.pending) && true) || false;
  }

  get loading(): boolean {
    return super.loading || (this.children && this.children.find(child => child.loading) && true) || false;
  }

  get dirty(): boolean {
    return this.form.dirty || this.hasIndividualMeasureControl.dirty ||
      (this.children && this.children.find(child => child.dirty) && true) || false;
  }

  markAsTouched(opts?: { onlySelf?: boolean; emitEvent?: boolean; }) {
    super.markAsTouched(opts);
    (this.children || []).forEach(child => child.markAsTouched(opts));
    this.hasIndividualMeasureControl.markAsTouched(opts);
  }

  markAsPristine(opts?: { onlySelf?: boolean; }) {
    super.markAsPristine(opts);
    (this.children || []).forEach(child => child.markAsPristine(opts));
    this.hasIndividualMeasureControl.markAsPristine(opts);
  }

  markAsUntouched(opts?: { onlySelf?: boolean; }) {
    super.markAsUntouched(opts);
    (this.children || []).forEach(child => child.markAsUntouched(opts));
    this.hasIndividualMeasureControl.markAsUntouched(opts);
  }

  markAsDirty(opts?: {
    onlySelf?: boolean;
  }) {
    super.markAsDirty(opts);
    (this.children && []).forEach(child => child.markAsDirty(opts));
    this.hasIndividualMeasureControl.markAsDirty(opts);
  }

  disable(opts?: {
    onlySelf?: boolean;
    emitEvent?: boolean;
  }) {
    super.disable(opts);
    (this.children || []).forEach(child => child.disable(opts));
    if (this._enable || (opts && opts.emitEvent)) {
      this._enable = false;
      this.markForCheck();
    }
    this.hasIndividualMeasureControl.disable(opts);
  }

  enable(opts?: {
    onlySelf?: boolean;
    emitEvent?: boolean;
  }) {
    super.enable(opts);
    (this.children || []).forEach(child => child.enable(opts));
    if (!this._enable || (opts && opts.emitEvent)) {
      this._enable = true;
      this.markForCheck();
    }
  }

  get hasIndividualMeasure(): boolean {
    return this.hasIndividualMeasureControl.value === true;
  }

  @Input()
  set hasIndividualMeasure(value: boolean) {
    this.hasIndividualMeasureControl.setValue(value);
    if (!value && this.hasIndividualMeasureControl.disabled && this.enabled) {
      this.hasIndividualMeasureControl.enable();
    }
  }


  constructor(
    protected measurementValidatorService: MeasurementsValidatorService,
    protected dateAdapter: DateAdapter<Moment>,
    protected formBuilder: FormBuilder,
    protected programRefService: ProgramRefService,
    protected platform: PlatformService,
    protected validatorService: BatchGroupValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef
  ) {
    super(dateAdapter,
      measurementValidatorService,
      formBuilder,
      programRefService,
      platform,
      validatorService,
      referentialRefService,
      settings,
      cd);

    // Default value
    this.acquisitionLevel = AcquisitionLevelCodes.SORTING_BATCH;
    this.hasIndividualMeasureControl = new FormControl(false);

    // DEBUG
    this.debug = true;
  }

  protected get logPrefix(): string {
    return '[batch-group-form]';
  }

  ngOnInit() {
    super.ngOnInit();

    this.defaultIsSampling = toBoolean(this.defaultIsSampling, false);

    // Set isSampling on each child forms, when has indiv. measure changed
    this.registerSubscription(
      this.hasIndividualMeasureControl.valueChanges
        .pipe(filter(() => !this.applyingValue && !this.loading))
        .subscribe(value => {
          (this.children || []).forEach((childForm, index) => {
            childForm.setIsSampling(value, {emitEvent: true}/*Important, to force async validator*/);
          });
          //this.markForCheck();
        }));

    // Listen form changes
    this.registerSubscription(
      this.form.valueChanges
        .pipe(
          //throttleTime(500)
        )
        .subscribe((batch) => this.computeShowTotalIndividualCount(batch)));
  }

  setValue(data: BatchGroup, opts?: { emitEvent?: boolean; onlySelf?: boolean; }) {
    if (this.loading || !this.data) {
      this.safeSetValue(data, opts);
      return;
    }

    if (this.debug) console.debug('[batch-group-form] setValue() with value:', data);
    let isSampling = data.observedIndividualCount > 0 || this.defaultIsSampling || false;

    if (!this.qvPmfm) {
      super.setValue(data);

      // Should have sub batches, when sampling batch exists
      isSampling = isSampling || isNotNil(BatchUtils.getSamplingChild(data));
    } else {

      // Prepare data array, for each qualitative values
      data.children = this.qvPmfm.qualitativeValues.map((qv, index) => {

        // Find existing child, or create a new one
        // tslint:disable-next-line:triple-equals
        const child = (data.children || []).find(c => +(c.measurementValues[this.qvPmfm.id]) == qv.id)
          || new Batch();

        // Make sure label and rankOrder are correct
        child.label = `${data.label}.${qv.label}`;
        child.measurementValues[this.qvPmfm.id] = qv;
        child.rankOrder = index + 1;

        // Should have sub batches, when sampling batch exists
        isSampling = isSampling || isNotNil(BatchUtils.getSamplingChild(child));

        // Make sure to create a sampling batch, if has sub bacthes
        if (isSampling) {
          BatchUtils.getOrCreateSamplingChild(child);
        }

        return child;
      });

      // Set value (batch group)
      super.setValue(data, opts);

      // Then set value of each child form
      this.children.forEach((childForm, index) => {
        const childBatch = data.children[index] || new Batch();
        childForm.showWeight = this.showChildrenWeight;
        childForm.requiredWeight = this.showChildrenWeight && this.hasIndividualMeasure;
        childForm.requiredSampleWeight = this.showChildrenWeight && this.hasIndividualMeasure;
        childForm.requiredIndividualCount = !this.showChildrenWeight && this.hasIndividualMeasure;
        childForm.setIsSampling(isSampling, {emitEvent: true});
        childForm.setValue(childBatch);
        if (this.enabled) {
          childForm.enable();
        } else {
          childForm.disable();
        }
      });

      this.computeShowTotalIndividualCount(data);

    }

    // Apply computed value of 'has indiv. measure'
    this.hasIndividualMeasureControl.setValue(isSampling, {emitEvent: false});

    // If there is already some measure
    // Not allow to change 'has measure' field
    if (data.observedIndividualCount > 0) {
      this.hasIndividualMeasureControl.disable();
    } else if (this.enabled) {
      this.hasIndividualMeasureControl.enable();
    }
  }

  focusFirstInput() {
    const element = this.firstInputFields.first;
    if (element) element.focus();
  }

  logFormErrors(logPrefix: string) {
    logPrefix = logPrefix || '';
    AppFormUtils.logFormErrors(this.form, logPrefix);
    if (this.children) this.children.forEach((childForm, index) => {
      AppFormUtils.logFormErrors(childForm.form, logPrefix, `children#${index}`);
    });
  }

  protected mapPmfms(pmfms: IPmfm[]) {

    if (this.debug) console.debug('[batch-group-form] mapPmfm()...');

    this.qvPmfm = this.qvPmfm || PmfmUtils.getFirstQualitativePmfm(pmfms);
    if (this.qvPmfm) {

      // Create a copy, to keep original pmfm unchanged
      this.qvPmfm = this.qvPmfm.clone();

      // Hide for children form, and change it as required
      this.qvPmfm.hidden = true;
      this.qvPmfm.required = true;

      // Replace in the list
      this.$childrenPmfms.next(pmfms.map(p => p.id === this.qvPmfm.id ? this.qvPmfm : p));

      // Do not display PMFM in the root batch
      pmfms = [];
    }

    return super.mapPmfms(pmfms);
  }

  /* -- protected methods -- */

  protected getValue(): BatchGroup {
    const data = super.getValue();

    // If has children form
    if (this.qvPmfm) {
      data.children = this.children.map((form, index) => {
        const qv = this.qvPmfm.qualitativeValues[index];
        const child = form.value;
        child.rankOrder = index + 1;
        child.label = `${data.label}.${qv.label}`;
        child.measurementValues = child.measurementValues || {};
        child.measurementValues[this.qvPmfm.id.toString()] = '' + qv.id;

        // Special case: when sampling on individual count only (e.g. RJB - Pocheteau)
        const sampleBatch = BatchUtils.getSamplingChild(child);
        if (sampleBatch && !form.showWeight && isNotNil(sampleBatch.individualCount) && isNotNil(child.individualCount)) {
          sampleBatch.samplingRatio = sampleBatch.individualCount / child.individualCount;
          sampleBatch.samplingRatioText = `${sampleBatch.individualCount}/${child.individualCount}`;
        }

        // Other Pmfms
        Object.keys(form.measurementValuesForm.value).filter(key => !child.measurementValues[key]).forEach(key =>{
          child.measurementValues[key] = form.measurementValuesForm.value[key];
        });

        return child;
      });
    }

    if (this.debug) console.debug('[batch-group-form] getValue():', data);

    return data;
  }

  protected computeShowTotalIndividualCount(data?: Batch) {
    data = data || this.data;
    // Generally, individual count are not need, on a root species batch, because filled in sub-batches,
    // but some species (e.g. RJB) can have no weight.
    const showTotalIndividualCount = data && ReferentialUtils.isNotEmpty(data.taxonGroup) &&
      (this.taxonGroupsNoWeight || []).includes(data.taxonGroup.label);

    if (showTotalIndividualCount !== this.showTotalIndividualCount) {
      this.showTotalIndividualCount = showTotalIndividualCount;
      this.showChildrenWeight = !showTotalIndividualCount; // Hide weight
      this.showChildrenSampleBatch = !showTotalIndividualCount;
      this.markForCheck();
    }
  }
}
