import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit} from "@angular/core";
import {Batch, BatchUtils} from "../../services/model/batch.model";
import {MeasurementValuesForm} from "../../measurement/measurement-values.form.class";
import {DateAdapter} from "@angular/material/core";
import {Moment} from "moment";
import {MeasurementsValidatorService} from "../../services/validator/measurement.validator";
import {FormArray, FormBuilder, FormGroup, Validators} from "@angular/forms";
import {ReferentialRefService} from "../../../referential/services/referential-ref.service";
import {EntityUtils}  from "@sumaris-net/ngx-components";
import {IReferentialRef, ReferentialUtils}  from "@sumaris-net/ngx-components";
import {UsageMode}  from "@sumaris-net/ngx-components";

import {debounceTime, filter, first} from "rxjs/operators";
import {AcquisitionLevelCodes, MethodIds, PmfmLabelPatterns} from "../../../referential/services/model/model.enum";
import {BehaviorSubject, Observable, Subscription} from "rxjs";
import {LocalSettingsService}  from "@sumaris-net/ngx-components";
import {MeasurementValuesUtils} from "../../services/model/measurement.model";
import {isNil, isNotNil, isNotNilOrBlank, toBoolean} from "@sumaris-net/ngx-components";
import {BatchValidatorService} from "../../services/validator/batch.validator";
import {firstNotNilPromise} from "@sumaris-net/ngx-components";
import {PlatformService}  from "@sumaris-net/ngx-components";
import {SharedFormGroupValidators} from "@sumaris-net/ngx-components";
import {AppFormUtils, FormArrayHelper}  from "@sumaris-net/ngx-components";
import {ProgramRefService} from "../../../referential/services/program-ref.service";
import {IPmfm, PmfmUtils} from "../../../referential/services/model/pmfm.model";

@Component({
  selector: 'app-batch-form',
  templateUrl: './batch.form.html',
  styleUrls: ['batch.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BatchForm<T extends Batch<any> = Batch<any>> extends MeasurementValuesForm<T>
  implements OnInit, OnDestroy {

  protected $initialized = new BehaviorSubject<boolean>(false);
  protected _requiredWeight = false;
  protected _showWeight = true;
  protected _requiredSampleWeight = false;
  protected _requiredIndividualCount = false;

  defaultWeightPmfm: IPmfm;
  weightPmfms: IPmfm[];
  weightPmfmsByMethod: { [key: string]: IPmfm };
  isSampling = false;
  mobile: boolean;
  childrenFormHelper: FormArrayHelper<Batch>;
  samplingFormValidator: Subscription;
  taxonNameFilter: any;
  $allPmfms = new BehaviorSubject<IPmfm[]>(null);

  @Input() tabindex: number;
  @Input() usageMode: UsageMode;
  @Input() showTaxonGroup = true;
  @Input() showTaxonName = true;
  @Input() showTotalIndividualCount = false;
  @Input() showIndividualCount = false;
  @Input() showEstimatedWeight = false;
  @Input() showSampleBatch = false;
  @Input() showError = true;
  @Input() availableTaxonGroups: IReferentialRef[] | Observable<IReferentialRef[]>;
  @Input() mapPmfmFn: (pmfms: IPmfm[]) => IPmfm[];

  @Input() set showWeight(value: boolean) {
    if (this._showWeight !== value) {
      this._showWeight = value;
      this.onUpdateControls();
    }
  }

  get showWeight(): boolean {
    return this._showWeight;
  }

  enable(opts?: { onlySelf?: boolean; emitEvent?: boolean }): void {
    super.enable(opts);

    // Refresh sampling child form
    if (!this.isSampling) this.setIsSampling(this.isSampling);
    if (!this._showWeight) this.disableWeightFormGroup();
  }

  get childrenArray(): FormArray {
    return this.form.get('children') as FormArray;
  }

  get weightForm(): FormGroup {
    return this.form.get('weight') as FormGroup;
  }

  @Input()
  set requiredSampleWeight(value: boolean) {
    if (this._requiredSampleWeight !== value) {
      this._requiredSampleWeight = value;
      this.onUpdateControls();
    }
  }

  get requiredSampleWeight(): boolean {
    return this._requiredSampleWeight;
  }

  @Input()
  set requiredWeight(value: boolean) {
    if (this._requiredWeight !== value) {
      this._requiredWeight = value;
      this.onUpdateControls();
    }
  }

  get requiredWeight(): boolean {
    return this._requiredWeight;
  }

  @Input()
  set requiredIndividualCount(value: boolean) {
    if (this._requiredIndividualCount !== value) {
      this._requiredIndividualCount = value;
      this.onUpdateControls();
    }
  }

  get requiredIndividualCount(): boolean {
    return this._requiredIndividualCount;
  }

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected measurementValidatorService: MeasurementsValidatorService,
    protected formBuilder: FormBuilder,
    protected programRefService: ProgramRefService,
    protected platform: PlatformService,
    protected validatorService: BatchValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef
  ) {
    super(dateAdapter, measurementValidatorService, formBuilder, programRefService, settings, cd,
      validatorService.getFormGroup(null, {
        withWeight: true,
        rankOrderRequired: false, // Allow to be set by parent component
        labelRequired: false // Allow to be set by parent component
      }),
      {
        mapPmfms: (pmfms) => this.mapPmfms(pmfms),
        onUpdateControls: (form) => this.onUpdateControls(form)
      });
    this.mobile = platform.mobile;

    // Set default acquisition level
    this._acquisitionLevel = AcquisitionLevelCodes.SORTING_BATCH;
    this._enable = true;

    this.childrenFormHelper = this.getChildrenFormHelper(this.form);

    // for DEV only
    //this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();

    // Default values
    this.tabindex = isNotNil(this.tabindex) ? this.tabindex : 1;

    // This will cause update controls
    this.$initialized.next(true);

    // Taxon group combo
    if (isNotNil(this.availableTaxonGroups)) {
      // Set items (useful to speed up the batch group modal)
      this.registerAutocompleteField('taxonGroup', {
        items: this.availableTaxonGroups,
        mobile: this.settings.mobile
      });
    }
    else {
      this.registerAutocompleteField('taxonGroup', {
        suggestFn: (value: any, filter?: any) => this.programRefService.suggestTaxonGroups(value, {...filter, program: this.programLabel}),
        mobile: this.settings.mobile
    });

    }

    // Taxon name combo
    this.updateTaxonNameFilter();
    this.registerAutocompleteField('taxonName', {
      suggestFn: (value: any, filter?: any) => this.programRefService.suggestTaxonNames(value, filter),
      filter: this.taxonNameFilter,
      mobile: this.settings.mobile
    });

    this.registerSubscription(
      this.form.get('taxonGroup').valueChanges
        .pipe(
          debounceTime(250),
          filter((value) => this.showTaxonGroup && this.showTaxonName)
        )
        .subscribe(taxonGroup => this.updateTaxonNameFilter({taxonGroup}))
    );
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    if (this.samplingFormValidator) this.samplingFormValidator.unsubscribe();
  }

  setValue(data: T, opts?: {emitEvent?: boolean; onlySelf?: boolean; normalizeEntityToForm?: boolean}) {

    if (!this.isReady() || !this.data) {
      this.safeSetValue(data, opts);
      return;
    }

    // Fill weight, if a weight PMFM exists
    if (this.defaultWeightPmfm && this.showWeight) {
      const weightPmfm = (this.weightPmfms || []).find(p => isNotNil(data.measurementValues[p.id.toString()]));
      data.weight = {
        methodId: weightPmfm && weightPmfm.methodId,
        computed: false,
        estimated: weightPmfm && weightPmfm.methodId === MethodIds.ESTIMATED_BY_OBSERVER,
        value : weightPmfm && data.measurementValues[weightPmfm.id.toString()],
      };

      // Clean all weight values and control (to keep only the weight form group)
      this.weightPmfms.forEach(p => {
        delete data.measurementValues[p.id.toString()];
        this.form.removeControl(p.id.toString());
      });
    }

    // No weight PMFM : disable weight form group, if exists (will NOT exists in BatchGroupForm sub classe)
    else {
      // Disable weight, if group exist
      this.disableWeightFormGroup();
    }

    // Adapt measurement values to form
    if (!opts || opts.normalizeEntityToForm !== false) {
      // IMPORTANT: applying normalisation of measurement values on ALL pmfms (not only displayed pmfms)
      // This is required by the batch-group-form component, to keep the value of hidden PMFM, such as Landing/Discard Pmfm
      MeasurementValuesUtils.normalizeEntityToForm(data, this.$allPmfms.getValue(), this.form);
    }

    if (this.showSampleBatch) {

      this.childrenFormHelper.resize(1);
      const samplingFormGroup = this.childrenFormHelper.at(0) as FormGroup;

      const samplingBatch = BatchUtils.getOrCreateSamplingChild(data);
      this.setIsSampling(this.isSampling || BatchUtils.isSampleNotEmpty(samplingBatch));

      // Read child weight (use the first one)
      if (this.defaultWeightPmfm) {
        const samplingWeightPmfm = (this.weightPmfms || []).find(p => isNotNil(samplingBatch.measurementValues[p.id.toString()]));
        samplingBatch.weight = {
          methodId: samplingWeightPmfm && samplingWeightPmfm.methodId,
          computed: false,
          estimated: samplingWeightPmfm && samplingWeightPmfm.methodId === MethodIds.ESTIMATED_BY_OBSERVER,
          value: samplingWeightPmfm && samplingBatch.measurementValues[samplingWeightPmfm.id.toString()],
        };

        // Adapt measurement values to form
        MeasurementValuesUtils.normalizeEntityToForm(samplingBatch, [], samplingFormGroup);
      }

      // Convert sampling ratio
      if (isNotNil(samplingBatch.samplingRatio)) {
        samplingBatch.samplingRatio = samplingBatch.samplingRatio * 100;
      }

    }
    else {
      this.childrenFormHelper.resize((data.children || []).length);
      this.childrenFormHelper.disable();
    }

    super.setValue(data, {
      // Always skip normalization (already done)
      normalizeEntityToForm: false
    });
  }

  protected getValue(): T {
    const json = this.form.value;
    const data = this.data;

    // Convert weight into measurement
    const totalWeight = this.defaultWeightPmfm && json.weight && json.weight.value;
    if (isNotNil(totalWeight)) {
      const weightPmfm = this.weightPmfmsByMethod[MethodIds.ESTIMATED_BY_OBSERVER] || this.defaultWeightPmfm;
      json.measurementValues[weightPmfm.id.toString()] = totalWeight;
    }
    json.weight = undefined;

    // Convert measurements
    json.measurementValues = {
      ...data.measurementValues,
      ...MeasurementValuesUtils.normalizeValuesToModel(json.measurementValues, this.$allPmfms.getValue())
    };

    if (this.showSampleBatch) {

      if (this.isSampling) {
        const child = BatchUtils.getOrCreateSamplingChild(data);
        const childJson = json.children && json.children[0] || {};

        childJson.rankOrder = 1;
        childJson.label = json.label && (json.label  + Batch.SAMPLING_BATCH_SUFFIX) || undefined;

        childJson.measurementValues = childJson.measurementValues || {};

        // Convert weight into measurement
        if (childJson.weight && isNotNil(childJson.weight.value)) {
          const childWeightPmfm = childJson.weight.estimated && this.weightPmfmsByMethod[MethodIds.ESTIMATED_BY_OBSERVER] || this.defaultWeightPmfm;
          childJson.measurementValues[childWeightPmfm.id.toString()] = childJson.weight.value;
        }

        childJson.weight = undefined;

        // Convert measurements
        childJson.measurementValues = Object.assign({},
          child.measurementValues,  // Keep existing extra measurements
          MeasurementValuesUtils.normalizeValuesToModel(childJson.measurementValues, this.weightPmfms));

        // Convert sampling ratio
        if (isNotNilOrBlank(childJson.samplingRatio)) {
          childJson.samplingRatioText = `${childJson.samplingRatio}%`;
          childJson.samplingRatio = +childJson.samplingRatio / 100;
        }

        json.children = [childJson];
      }
      else {
        // No sampling batch
        json.children = [];
      }

      // Update data
      data.fromObject(json, {withChildren: true});
    }
    else {
      // Keep existing children
      data.fromObject(json);
    }

    if (this.debug) console.debug(data.label + " getValue() with data:", data);

    return data;
  }

  setIsSampling(enable: boolean, opts?: {emitEvent?: boolean}) {
    if (this.isSampling !== enable) {
      this.isSampling = enable;

      if (!this.loading) this.form.markAsDirty();

      const childrenArray = this.childrenArray;

      if (childrenArray) {
        if (enable && childrenArray.disabled) {
          childrenArray.enable({emitEvent: toBoolean(opts && opts.emitEvent, false)});
          this.markForCheck();
        } else if (!enable && childrenArray.enabled) {
          childrenArray.disable({emitEvent: toBoolean(opts && opts.emitEvent, false)});
          this.markForCheck();
        }
      }
    }
  }

  /* -- protected methods -- */

  protected async onInitialized(): Promise<void> {
    // Wait end of ngInit()
    if (this.$initialized.getValue() !== true) {
      await this.$initialized
        .pipe(
          filter((initialized) => initialized === true),
          first()
        ).toPromise();
    }
  }

  // Wait form controls ready
  async ready(): Promise<void> {
    await super.ready();

    // Wait all pmfms to be loaded
    if (isNil(this.$allPmfms.getValue())) {
      await firstNotNilPromise(this.$allPmfms);
    }
  }

  protected updateTaxonNameFilter(opts?: {taxonGroup?: any}) {

    // If taxonGroup exists: taxon group must be filled first
    if (this.showTaxonGroup && ReferentialUtils.isEmpty(opts && opts.taxonGroup)) {
      this.taxonNameFilter = {
        programLabel: 'NONE' /*fake program, will cause empty array*/
      };
    }
    else {
      this.taxonNameFilter = {
        programLabel: this.programLabel,
        taxonGroupId: opts && opts.taxonGroup && opts.taxonGroup.id
      };
    }
    this.markForCheck();
  }

  protected mapPmfms(pmfms: IPmfm[]): IPmfm[] {

    if (this.mapPmfmFn) {
      pmfms = this.mapPmfmFn(pmfms);
    }

    // Read weight PMFMs
    this.weightPmfms = pmfms.filter(p => PmfmLabelPatterns.BATCH_WEIGHT.exec(p.label));
    this.defaultWeightPmfm = this.weightPmfms.length && this.weightPmfms[0] || undefined;
    this.weightPmfmsByMethod = {};
    this.weightPmfms.forEach(p => this.weightPmfmsByMethod[p.methodId] = p);

    this.showSampleBatch = toBoolean(this.showSampleBatch, isNotNil(this.defaultWeightPmfm));
    this.$allPmfms.next(pmfms);

    // Exclude hidden and weight PMFMs
    return pmfms.filter(p => !PmfmUtils.isWeight(p) && !p.hidden);
  }

  protected async onUpdateControls(form?: FormGroup): Promise<void> {
    form = form || this.form;

    // Wait end of ngInit()
    await this.onInitialized();

    const childrenFormHelper = this.getChildrenFormHelper(form);

    // Add pmfms to form
    const measFormGroup = form.get('measurementValues') as FormGroup;
    if (measFormGroup) {
      this.measurementValidatorService.updateFormGroup(measFormGroup, {pmfms: this.$allPmfms.getValue()});
    }

    const hasSamplingForm = childrenFormHelper.size() === 1 && this.defaultWeightPmfm && true;

    // If the sample batch exists
    if (this.showSampleBatch) {

      childrenFormHelper.resize(1);
      const samplingForm = childrenFormHelper.at(0) as FormGroup;

      // Reset measurementValues (if exists)
      const samplingMeasFormGroup = samplingForm.get('measurementValues');
      if (samplingMeasFormGroup) {
        this.measurementValidatorService.updateFormGroup(samplingMeasFormGroup as FormGroup, {pmfms: []});
      }

      // Adapt exists sampling child, if any
      if (this.data) {
        const samplingChildBatch = BatchUtils.getOrCreateSamplingChild(this.data);

        this.setIsSampling(this.isSampling || BatchUtils.isSampleNotEmpty(samplingChildBatch));

      } else {
        // No data: disable sampling
        this.setIsSampling(false);
      }

      // If sampling weight is required, make batch weight required also
      if (this._requiredSampleWeight) {
        this.weightForm.setValidators(
          SharedFormGroupValidators.requiredIf('value', samplingForm.get('weight.value'))
        );
      }

      // If sampling weight is required, make batch weight required also
      if (this._requiredIndividualCount) {
        this.form.get('individualCount').setValidators(Validators.required);
      }
    }

    // Remove existing sample, if exists but showSample=false
    else if (hasSamplingForm) {
      childrenFormHelper.resize(0);
    }

    this.addSamplingFormValidators();

    if (this.showWeight) {
      this.enableWeightFormGroup({emitEvent: false});
    }
    else {
      this.disableWeightFormGroup({emitEvent: false});
    }
  }

  protected enableWeightFormGroup(opts?: {onlySelf?: boolean; emitEvent?: boolean; }) {
    const weightFormGroup = this.form.get('weight');
    if (weightFormGroup) weightFormGroup.enable(opts);
  }

  protected disableWeightFormGroup(opts?: {onlySelf?: boolean; emitEvent?: boolean; }) {
    const weightFormGroup = this.form.get('weight');
    if (weightFormGroup) weightFormGroup.disable(opts);
  }

  selectInputContent = AppFormUtils.selectInputContent;

  protected getChildrenFormHelper(form: FormGroup): FormArrayHelper<Batch> {
    let arrayControl = form.get('children') as FormArray;
    if (!arrayControl) {
      arrayControl = this.formBuilder.array([]);
      form.addControl('children', arrayControl);
    }
    return new FormArrayHelper<Batch>(
      arrayControl,
      (value) => this.validatorService.getFormGroup(value, {withWeight: true}),
      (v1, v2) => EntityUtils.equals(v1, v2, 'label'),
      (value) => isNil(value),
      {allowEmptyArray: true}
    );
  }

  // Unregister to previous validator
  protected addSamplingFormValidators() {
    // Has sample batch ?
    if (this.samplingFormValidator) {
      this.samplingFormValidator.unsubscribe();
      this.samplingFormValidator = undefined;

    }
    if (this.showSampleBatch && this.showWeight) {
      this.samplingFormValidator = this.validatorService.addSamplingFormValidators(this.form, {
        requiredSampleWeight: this.requiredSampleWeight
      });
    }
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
