import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Batch } from '../common/batch.model';
// import { setTimeout } from '@rx-angular/cdk/zone-less/browser';
import {
  Alerts,
  AppFormUtils,
  AudioProvider,
  ErrorCodes,
  IReferentialRef,
  isNil,
  isNotNil,
  isNotNilOrBlank,
  LocalSettingsService,
  PlatformService,
  ReferentialUtils,
  toBoolean,
  UsageMode,
} from '@sumaris-net/ngx-components';
import { AlertController, IonContent, ModalController } from '@ionic/angular';
import { BehaviorSubject, merge, Observable, Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AcquisitionLevelCodes } from '@app/referential/services/model/model.enum';
import { BatchGroupForm } from './batch-group.form';
import { debounceTime, filter, map, startWith } from 'rxjs/operators';
import { BatchGroup } from './batch-group.model';
import { IBatchModalOptions } from '@app/trip/batch/common/batch.modal';
import { IPmfm } from '@app/referential/services/model/pmfm.model';
import { TripContextService } from '@app/trip/trip-context.service';
import { ContextService } from '@app/shared/context.service';
import { BatchUtils } from '@app/trip/batch/common/batch.utils';
import { SamplingRatioFormat } from '@app/shared/material/sampling-ratio/material.sampling-ratio';
import { environment } from '@environments/environment';

export interface IBatchGroupModalOptions extends IBatchModalOptions<BatchGroup> {
  // Show/Hide fields
  showSamplingBatch: boolean;

  // Other options
  qvPmfm?: IPmfm;
  childrenPmfms: IPmfm[];
  enableWeightConversion: boolean;
  enableBulkMode: boolean;

  // Sub batches modal
  showHasSubBatchesButton: boolean;
  allowSubBatches: boolean;
  defaultHasSubBatches: boolean;
  openSubBatchesModal: (batchGroup: BatchGroup) => Promise<BatchGroup | undefined>;
  onSaveAndNew: (batchGroup: BatchGroup) => Promise<BatchGroup>;
}

@Component({
  selector: 'app-batch-group-modal',
  templateUrl: 'batch-group.modal.html',
  styleUrls: ['batch-group.modal.scss'],
  providers: [{ provide: ContextService, useExisting: TripContextService }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchGroupModal implements OnInit, AfterViewInit, OnDestroy, IBatchGroupModalOptions {
  private _subscription = new Subscription();
  private _isOnFieldMode: boolean;

  protected loadingSubject = new BehaviorSubject(false);
  protected get loading(): boolean {
    return this.loadingSubject.value;
  }

  protected titleSubject = new BehaviorSubject<string>(undefined);
  protected settingsId: string;

  @Input() data: BatchGroup;
  @Input() isNew: boolean;
  @Input() disabled: boolean;
  @Input() usageMode: UsageMode;
  @Input() mobile: boolean;
  @Input() debug = false;
  @Input() playSound: boolean;

  @Input() qvPmfm: IPmfm;
  @Input() pmfms: Observable<IPmfm[]> | IPmfm[];
  @Input() childrenPmfms: IPmfm[];
  @Input() acquisitionLevel: string;
  @Input() programLabel: string;

  @Input() showTaxonGroup = true;
  @Input() showTaxonName = true;
  @Input() showIndividualCount = false;
  @Input() showSamplingBatch: boolean;
  @Input() showComment: boolean;
  @Input() allowSubBatches = true;
  @Input() showHasSubBatchesButton: boolean;
  @Input() defaultHasSubBatches: boolean;
  @Input() taxonGroupsNoWeight: string[] = [];
  @Input() availableTaxonGroups: IReferentialRef[] | Observable<IReferentialRef[]>;
  @Input() enableWeightConversion: boolean;
  @Input() maxVisibleButtons: number;
  @Input() maxItemCountForButtons: number;
  @Input() samplingRatioFormat: SamplingRatioFormat;
  @Input() i18nSuffix: string;
  @Input() enableBulkMode: boolean;
  @Input() canDebug: boolean;

  @Input() openSubBatchesModal: (batchGroup: BatchGroup) => Promise<BatchGroup>;
  @Input() onDelete: (event: Event, data: Batch) => Promise<boolean>;
  @Input() onSaveAndNew: (data: BatchGroup) => Promise<BatchGroup>;

  @ViewChild('form', { static: true }) form: BatchGroupForm;
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

  get pending(): boolean {
    return this.form.pending;
  }

  get enabled(): boolean {
    return !this.disabled;
  }

  enable(opts?: { onlySelf?: boolean; emitEvent?: boolean }) {
    this.form.enable(opts);
  }

  disable(opts?: { onlySelf?: boolean; emitEvent?: boolean }) {
    this.form.disable(opts);
  }

  constructor(
    protected injector: Injector,
    protected alertCtrl: AlertController,
    protected modalCtrl: ModalController,
    protected platform: PlatformService,
    protected settings: LocalSettingsService,
    protected translate: TranslateService,
    protected audio: AudioProvider,
    protected cd: ChangeDetectorRef
  ) {
    // Fixed values
    this.acquisitionLevel = AcquisitionLevelCodes.SORTING_BATCH;

    this.settingsId = 'batch-group-modal';

    // -- for DEV only
    //this.debug = !environment.production;
  }

  ngOnInit() {
    // Default values
    this.canDebug = toBoolean(this.canDebug, !environment.production);
    this.debug = this.canDebug && toBoolean(this.settings.getPageSettings(this.settingsId, 'debug'), false);
    this.mobile = isNotNil(this.mobile) ? this.mobile : this.settings.mobile;
    this.isNew = toBoolean(this.isNew, !this.data);
    this.usageMode = this.usageMode || this.settings.usageMode;
    this._isOnFieldMode = this.settings.isOnFieldMode(this.usageMode);
    this.playSound = toBoolean(this.playSound, this.mobile || this._isOnFieldMode);
    this.disabled = toBoolean(this.disabled, false);
    this.enableBulkMode = this.enableBulkMode && !this.disabled && typeof this.onSaveAndNew === 'function';
    this.showComment = toBoolean(this.showComment, !this.mobile || isNotNil(this.data.comments));

    if (this.disabled) this.disable();

    // Update title, when form change
    this._subscription.add(
      merge(this.form.form.get('taxonGroup').valueChanges, this.form.form.get('taxonName').valueChanges)
        .pipe(
          filter((_) => !this.form.loading),
          debounceTime(500),
          map(() => this.form.value),
          // Start with current data
          startWith(this.data)
        )
        .subscribe((data) => this.computeTitle(data))
    );

    this.form.childrenState = {
      showSamplingBatch: this.showSamplingBatch,
      samplingBatchEnabled: this.data?.observedIndividualCount > 0 || this.defaultHasSubBatches,
      showExhaustiveInventory: false,
      showEstimatedWeight: false,
    };

    this.load();
  }

  ngAfterViewInit(): void {
    // Focus on the first field (if new AND desktop AND enabled)
    if (this.isNew && !this.mobile && this.enabled) {
      this.form.ready().then(() => this.form.focusFirstInput());
    }
  }

  async load() {
    this.markAsReady();
    this.markAsLoading();

    try {
      await this.updateView(this.data);
    } catch (err) {
      if (err === 'CANCELLED') return;
      this.setError(err);
    } finally {
      this.markAsLoaded();
    }
  }

  ngOnDestroy(): void {
    this._subscription.unsubscribe();
  }

  async updateView(
    data: BatchGroup,
    opts?: {
      emitEvent?: boolean;
    }
  ): Promise<void> {
    this.resetError();

    if (!data) throw { code: ErrorCodes.DATA_NOT_FOUND_ERROR, message: 'ERROR.DATA_NO_FOUND' };

    this.data = data;

    await this.setValue(data);

    if (!opts || opts.emitEvent !== false) {
      this.markAsPristine();
      this.markAsUntouched();
      this.updateViewState(data);
    }
  }

  async setValue(data: BatchGroup) {
    await this.form.setValue(data);
  }

  protected ready(): Promise<void> {
    return this.form.ready();
  }

  protected updateViewState(data?: BatchGroup, opts?: { emitEvent?: boolean }) {
    if (this.isNew || this.enabled) {
      this.enable(opts);
    } else {
      this.disable(opts);
    }

    const errorMessage = this.enabled && this.usageMode === 'DESK' && isNil(data.controlDate) ? data.qualificationComments : null;
    // Skip if default/generic error, because this one is not useful. It can have been set when closing the modal
    if (isNotNilOrBlank(errorMessage) && errorMessage !== this.translate.instant('ERROR.INVALID_OR_INCOMPLETE_FILL')) {
      // Replace newline by a <br> tag, then display
      this.setError(errorMessage.replace(/(\n|\r|<br\/>)+/g, '<br/>'));
    }
  }

  async close(event?: Event) {
    if (this.dirty) {
      let saveBeforeLeave = await Alerts.askSaveBeforeLeave(this.alertCtrl, this.translate, event);

      // User cancelled
      if (isNil(saveBeforeLeave) || (event && event.defaultPrevented)) return;

      // Ask a second confirmation, if observed individual count > 0
      if (saveBeforeLeave === false && this.isNew && this.data.observedIndividualCount > 0) {
        saveBeforeLeave = await Alerts.askSaveBeforeLeave(this.alertCtrl, this.translate, event);

        // User cancelled
        if (isNil(saveBeforeLeave) || (event && event.defaultPrevented)) return;
      }

      // Is user confirm: close normally
      if (saveBeforeLeave === true) {
        await this.onSubmit(event);
        return;
      }
    }

    await this.modalCtrl.dismiss();
  }

  protected async getDataToSave(opts?: { allowInvalid?: boolean }): Promise<BatchGroup> {
    if (this.loading) return undefined; // avoid many call

    // Force enable form, before use value
    if (!this.enabled) this.enable({ emitEvent: false });

    this.markAsLoading();
    this.resetError();

    try {
      try {
        // Wait pending async validator
        await AppFormUtils.waitWhilePending(this.form, {
          timeout: 2000, // Workaround because of child form never finish FIXME
        });
      } catch (err) {
        console.warn('FIXME - Batch group form pending timeout!');
      }

      const invalid = !this.valid;
      if (invalid) {
        let allowInvalid = !opts || opts.allowInvalid !== false;
        // DO not allow invalid form, when taxon group and taxon name are missed
        const taxonGroup = this.form.form.get('taxonGroup').value;
        const taxonName = this.form.form.get('taxonName').value;
        if (ReferentialUtils.isEmpty(taxonGroup) && ReferentialUtils.isEmpty(taxonName)) {
          this.setError('COMMON.FORM.HAS_ERROR');
          allowInvalid = false;
        }

        // Invalid not allowed: stop
        if (!allowInvalid) {
          if (this.debug) this.form.logFormErrors('[batch-group-modal] ');
          this.form.markAllAsTouched();
          return undefined;
        }
      }

      // Save table content
      this.data = this.form.value;

      // Mark as invalid
      if (invalid) {
        BatchUtils.markAsInvalid(this.data, this.translate.instant('ERROR.INVALID_OR_INCOMPLETE_FILL'));
      }
      // Reset control (and old invalid quality flag)
      else {
        BatchUtils.markAsNotControlled(this.data, { withChildren: true });
      }

      return this.data;
    } finally {
      this.markAsLoaded();
    }
  }

  /**
   * Validate and close. If on bulk mode is enable, skip validation if form is pristine
   *
   * @param event
   */
  async onSubmitIfDirty(event?: Event) {
    if (this.loading) return undefined; // avoid many call
    if (this.enableBulkMode && !this.dirty) {
      await this.modalCtrl.dismiss();
    } else {
      return this.onSubmit(event);
    }
  }

  async onSubmit(event?: Event, opts?: { allowInvalid?: boolean }) {
    if (this.loading) return undefined; // avoid many call

    const data = await this.getDataToSave({ allowInvalid: true, ...opts });
    if (!data) return;

    this.markAsLoading();
    await this.modalCtrl.dismiss(data);
  }

  async delete(event?: Event) {
    // Apply deletion, if callback exists
    if (this.onDelete) {
      const deleted = await this.onDelete(event, this.data);
      if (isNil(deleted) || (event && event.defaultPrevented)) return; // User cancelled
      if (deleted) await this.modalCtrl.dismiss();
    } else {
      // Ask caller the modal owner apply deletion
      await this.modalCtrl.dismiss(this.data, 'delete');
    }
  }

  /**
   * Add and reset form
   */
  async onSubmitAndNext(event?: Event) {
    if (this.loading) return undefined; // avoid many call
    // DEBUG
    //console.debug('[batch-group-modal] Calling onSubmitAndNext()');

    // If new AND pristine BUT valid (e.g. all PMFMs are optional): avoid to validate
    if (this.isNew && !this.dirty && this.valid) {
      return; // skip
    }

    const data = await this.getDataToSave();

    // invalid
    if (!data) {
      if (this.playSound) await this.audio.playBeepError();
      return;
    }

    this.markAsLoading();

    try {
      const newData = await this.onSaveAndNew(data);
      if (!newData) return; // Failed to save row

      await this.reset(newData);
      this.isNew = true;
      if (this.playSound) {
        setTimeout(async () => {
          try {
            await this.audio.playBeepConfirm();
          } catch (err) {
            console.error(err);
          }
        }, 50);
      }

      await this.scrollToTop();
    } finally {
      this.markAsLoaded();
    }
  }

  protected async reset(data?: BatchGroup) {
    await this.updateView(data || new BatchGroup());
  }

  async onShowSubBatchesButtonClick(event?: Event) {
    if (!this.openSubBatchesModal) return; // Skip

    // Save
    const data = await this.getDataToSave({ allowInvalid: true });
    if (!data) return;

    // Execute the callback
    const updatedParent = await this.openSubBatchesModal(data);

    if (!updatedParent) return; // User cancelled

    this.data = updatedParent;
    await this.form.setValue(this.data);

    this.form.markAsDirty();
  }

  /* -- protected methods -- */

  protected async computeTitle(data?: Batch) {
    data = data || this.data;
    if (this.isNew) {
      this.titleSubject.next(await this.translate.instant('TRIP.BATCH.NEW.TITLE'));
    } else {
      const label = BatchUtils.parentToString(data);
      this.titleSubject.next(await this.translate.instant('TRIP.BATCH.EDIT.TITLE', { label }));
    }
  }

  protected markAllAsTouched() {
    this.form.markAllAsTouched();
  }

  protected markAsUntouched() {
    this.form.markAsUntouched();
  }

  protected markAsPristine() {
    this.form.markAsPristine();
  }

  async scrollToTop() {
    return this.content.scrollToTop();
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

  protected markAsReady() {
    this.form.markAsReady();
  }

  protected markAsLoading() {
    if (!this.loadingSubject.value) {
      this.loadingSubject.next(true);
      this.markForCheck();
    }
  }

  protected markAsLoaded() {
    if (this.loadingSubject.value) {
      this.loadingSubject.next(false);
      this.markForCheck();
    }
  }

  protected setError(error: any) {
    const errorMessage = error?.message ? error.message : error;
    this.form.error = errorMessage;
  }

  protected resetError() {
    this.form.error = null;
  }

  protected async devToggleDebug() {
    this.debug = !this.debug;
    this.markForCheck();
    await this.settings.savePageSetting(this.settingsId, this.debug, 'debug');
  }
}
