import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {
  Alerts,
  AppFormUtils,
  EntityUtils,
  isNil,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrBlank,
  LocalSettingsService,
  PlatformService,
  referentialToString,
  toBoolean,
  TranslateContextService,
  UsageMode,
} from '@sumaris-net/ngx-components';
import {environment} from '@environments/environment';
import {AlertController, IonContent, ModalController} from '@ionic/angular';
import {BehaviorSubject, Subscription, TeardownLogic} from 'rxjs';
import {TranslateService} from '@ngx-translate/core';
import {AcquisitionLevelCodes, AcquisitionLevelType, PmfmIds} from '@app/referential/services/model/model.enum';
import {SampleForm} from './sample.form';
import {Sample} from '../services/model/sample.model';
import {TRIP_LOCAL_SETTINGS_OPTIONS} from '../services/config/trip.config';
import {IDataEntityModalOptions} from '@app/data/table/data-modal.class';
import {debounceTime} from 'rxjs/operators';
import {IPmfm} from '@app/referential/services/model/pmfm.model';
import {Moment} from 'moment';
import { TaxonGroupRef } from '@app/referential/services/model/taxon-group.model';
import * as momentImported from 'moment';
const moment = momentImported;

export type SampleModalRole = 'VALIDATE'| 'DELETE';
export interface ISampleModalOptions<M = SampleModal> extends IDataEntityModalOptions<Sample> {

  // UI Fields show/hide
  mobile: boolean;
  showLabel: boolean;
  showSampleDate: boolean;
  showTaxonGroup: boolean;
  showTaxonName: boolean;
  showIndividualReleaseButton: boolean;

  availableTaxonGroups?: TaxonGroupRef[];
  defaultSampleDate?: Moment;

  // UI Options
  maxVisibleButtons: number;
  enableBurstMode: boolean;
  i18nSuffix?: string;

  // Callback actions
  onSaveAndNew: (data: Sample) => Promise<Sample>;
  onReady: (modal: M) => Promise<void> | void;
  openSubSampleModal: (parent: Sample, acquisitionLevel: AcquisitionLevelType) => Promise<Sample>;
}

@Component({
  selector: 'app-sample-modal',
  templateUrl: 'sample.modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SampleModal implements OnInit, OnDestroy, ISampleModalOptions {

  private _subscription = new Subscription();
  $title = new BehaviorSubject<string>(undefined);
  debug = false;
  loading = false;

  @Input() mobile: boolean;
  @Input() isNew: boolean;
  @Input() data: Sample;
  @Input() disabled: boolean;
  @Input() acquisitionLevel: string;
  @Input() programLabel: string;
  @Input() usageMode: UsageMode;
  @Input() pmfms: IPmfm[];

  // UI options
  @Input() i18nSuffix: string;
  @Input() showLabel = true;
  @Input() showSampleDate = true;
  @Input() showTaxonGroup = true;
  @Input() showTaxonName = true;
  @Input() showComment: boolean;
  @Input() showIndividualReleaseButton: boolean;
  @Input() maxVisibleButtons: number;
  @Input() enableBurstMode: boolean;
  @Input() availableTaxonGroups: TaxonGroupRef[] = null;
  @Input() defaultSampleDate: Moment;
  tagIdPmfm: IPmfm;

  @Input() onReady: (modal: SampleModal) => Promise<void> | void;
  @Input() onSaveAndNew: (data: Sample) => Promise<Sample>;
  @Input() onDelete: (event: UIEvent, data: Sample) => Promise<boolean>;
  @Input() openSubSampleModal: (parent: Sample, acquisitionLevel: AcquisitionLevelType) => Promise<Sample>;

  @ViewChild('form', {static: true}) form: SampleForm;
  @ViewChild(IonContent) content: IonContent;

  get dirty(): boolean {
    return this.form.dirty;
  }

  get invalid(): boolean {
    return this.form.invalid;
  }

  get valid(): boolean {
    return this.form.valid;
  }


  get isOnFieldMode() {
    return this.usageMode === 'FIELD';
  }


  constructor(
    protected injector: Injector,
    protected platform: PlatformService,
    protected modalCtrl: ModalController,
    protected alertCtrl: AlertController,
    protected settings: LocalSettingsService,
    protected translate: TranslateService,
    protected translateContext: TranslateContextService,
    protected cd: ChangeDetectorRef
  ) {
    // Default value
    this.mobile = platform.mobile;
    this.acquisitionLevel = AcquisitionLevelCodes.SAMPLE;

    // TODO: for DEV only
    this.debug = !environment.production;
    this.showComment = !this.mobile;
  }

  ngOnInit() {
    this.isNew = toBoolean(this.isNew, !this.data);
    this.usageMode = this.usageMode || this.settings.usageMode;
    this.disabled = toBoolean(this.disabled, false);
    this.i18nSuffix = this.i18nSuffix || '';
    if (isNil(this.enableBurstMode)) {
      this.enableBurstMode = this.settings.getPropertyAsBoolean(TRIP_LOCAL_SETTINGS_OPTIONS.SAMPLE_BURST_MODE_ENABLE,
        this.usageMode === 'FIELD');
    }

    // Show/Hide individual release button
    this.tagIdPmfm = this.pmfms?.find(p => p.id === PmfmIds.TAG_ID);
    if (this.tagIdPmfm) {
      this.showIndividualReleaseButton =  !!this.openSubSampleModal
        && !this.isNew && isNotNil(this.data.measurementValues[this.tagIdPmfm.id]);

      this.form.ready().then(() => {
        this.registerSubscription(
          this.form.form.get('measurementValues.' + this.tagIdPmfm.id)
            .valueChanges
            .subscribe(tagId => {
              this.showIndividualReleaseButton = isNotNilOrBlank(tagId);
              this.markForCheck();
            })
        );
      });
    }
    else {
      this.showIndividualReleaseButton =  !!this.openSubSampleModal;
    }

    if (this.disabled) {
      this.form.disable();
    }
    else {
      // Change rankOrder validator, to optional
      this.form.form.get('rankOrder').setValidators(null);
    }

    // Update title each time value changes
    if (!this.isNew) {
      this._subscription.add(
        this.form.valueChanges
          .pipe(debounceTime(250))
          .subscribe(json => this.computeTitle(json))
      );
    }


    this.setValue(this.data);
  }

  ngOnDestroy() {
    this._subscription.unsubscribe();
  }

  private async setValue(data: Sample) {

    console.debug('[sample-modal] Applying value to form...', data);
    this.form.markAsReady();
    this.form.error = null;

    try {
      // Set form value
      this.data = data || new Sample();
      const isNew = isNil(this.data.id);

      if (isNew && !this.data.sampleDate) {
        if (this.defaultSampleDate) {
          this.data.sampleDate = this.defaultSampleDate.clone();
        }
        else if (this.isOnFieldMode) {
          this.data.sampleDate = moment();
        }
      }

      let promiseOrVoid = this.form.setValue(this.data);
      if (promiseOrVoid) await promiseOrVoid;

      // Call ready callback
      if (this.onReady) {
        promiseOrVoid = this.onReady(this);
        if (promiseOrVoid) await promiseOrVoid;
      }

      await this.computeTitle();
    }
    finally {
      if (!this.disabled) this.enable();
      this.form.markAsUntouched();
      this.form.markAsPristine();
      this.markForCheck();
    }
  }

  async close(event?: UIEvent) {
    if (this.dirty) {
      const saveBeforeLeave = await Alerts.askSaveBeforeLeave(this.alertCtrl, this.translate, event);

      // User cancelled
      if (isNil(saveBeforeLeave) || event && event.defaultPrevented) {
        return;
      }

      // Is user confirm: close normally
      if (saveBeforeLeave === true) {
        this.enableBurstMode = false; // Force onSubmit to close
        await this.onSubmit(event);
        return;
      }
    }

    await this.modalCtrl.dismiss();
  }

  /**
   * Add and reset form
   */
  async onSubmitAndNext(event?: UIEvent) {
    if (this.loading) return undefined; // avoid many call
    // DEBUG
    //console.debug('[sample-modal] Calling onSubmitAndNext()');

    const data = this.getDataToSave();
    if (!data) return; // invalid

    this.markAsLoading();

    try {
      const newData = await this.onSaveAndNew(data);
      await this.reset(newData);

      await this.scrollToTop();
    } finally {
      this.markAsLoaded();
    }
  }

  /**
   * Validate and close
   * @param event
   */
  async onSubmit(event?: UIEvent) {
    if (this.loading) return undefined; // avoid many call

    // Leave without saving
    if (!this.dirty) {
      this.markAsLoading();
      await this.modalCtrl.dismiss();
    }
    // Convert and dismiss
    else {
      const data = this.dirty ? this.getDataToSave() : this.data;
      if (!data) return; // invalid

      this.markAsLoading();
      await this.modalCtrl.dismiss(data);
    }
  }

  async delete(event?: UIEvent) {
    let canDelete = true;

    if (this.onDelete) {
      canDelete = await this.onDelete(event, this.data);
      if (isNil(canDelete) || (event && event.defaultPrevented)) return; // User cancelled
    }

    if (canDelete) {
      await this.modalCtrl.dismiss(this.data, 'DELETE');
    }
  }

  async showIndividualReleaseModal(event: UIEvent, acquisitionLevel: AcquisitionLevelType) {
    if (!this.openSubSampleModal) return; // Skip

    // Save
    const savedSample = await this.getDataToSave({disable: false});
    if (!savedSample) return;

    try {

      // Execute the callback
      const updatedParent = await this.openSubSampleModal(savedSample, acquisitionLevel);

      if (!updatedParent) return; // User cancelled

      this.form.setChildren(updatedParent.children);

      this.form.markAsDirty();
    } finally {
      this.loading = false;
      this.form.enable();
    }
  }

  toggleBurstMode() {
    this.enableBurstMode = !this.enableBurstMode;

    // Remember (store in local settings)
    this.settings.setProperty(TRIP_LOCAL_SETTINGS_OPTIONS.SAMPLE_BURST_MODE_ENABLE.key, this.enableBurstMode);
  }

  toggleComment() {
    this.showComment = !this.showComment;
    this.markForCheck();
  }

  /* -- protected methods -- */

  protected getDataToSave(opts?: {disable?: boolean;}): Sample {

    if (this.invalid) {
      if (this.debug) AppFormUtils.logFormErrors(this.form.form, '[sample-modal] ');
      this.form.error = 'COMMON.FORM.HAS_ERROR';
      this.form.markAllAsTouched();
      this.scrollToTop();
      return undefined;
    }

    this.markAsLoading();

    // To force enable, to get computed values
    this.enable();

    try {
      // Get form value
      return this.form.value;
    } finally {
      if (!opts || opts.disable !== false) {
        this.disable();
      }
    }
  }

  protected async reset(data?: Sample) {
    await this.setValue(data || new Sample());
  }

  protected async computeTitle(data?: Sample) {

    data = data || this.data;

    // Compute prefix
    let prefix = '';
    const prefixItems = [];
    if (data && !this.showTaxonGroup && EntityUtils.isNotEmpty(data.taxonGroup, 'id')) {
      prefixItems.push(referentialToString(data.taxonGroup, this.settings.getFieldDisplayAttributes('taxonGroup')));
    }
    if (data && !this.showTaxonName && data && EntityUtils.isNotEmpty(data.taxonName, 'id')) {
      prefixItems.push(referentialToString(data.taxonName, this.settings.getFieldDisplayAttributes('taxonName')));
    }
    if (isNotEmptyArray(prefixItems)) {
      prefix = this.translateContext.instant('TRIP.SAMPLE.TITLE_PREFIX', this.i18nSuffix,
        {prefix: prefixItems.join(' / ')});
    }

    if (this.isNew || !data) {
      this.$title.next(prefix + this.translateContext.instant('TRIP.SAMPLE.NEW.TITLE', this.i18nSuffix));
    } else {
      // Label can be optional (e.g. in auction control)
      const label = this.showLabel && data.label || ('#' + data.rankOrder);
      this.$title.next(prefix + this.translateContext.instant('TRIP.SAMPLE.EDIT.TITLE', this.i18nSuffix, {label}));
    }
  }

  async scrollToTop() {
    return this.content.scrollToTop();
  }

  markForCheck() {
    this.cd.markForCheck();
  }

  protected registerSubscription(teardown: TeardownLogic) {
    this._subscription.add(teardown);
  }

  protected markAsLoading() {
    this.loading = true;
    this.markForCheck();
  }

  protected markAsLoaded() {
    this.loading = false;
    this.markForCheck();
  }

  protected enable() {
    this.form.enable();
  }

  protected disable() {
    this.form.disable();
  }


}
