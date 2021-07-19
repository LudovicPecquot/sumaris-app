import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  Injector,
  Input,
  OnDestroy,
  OnInit,
  ViewChild
} from "@angular/core";
import {Batch, BatchUtils} from "../../services/model/batch.model";
import {LocalSettingsService}  from "@sumaris-net/ngx-components";
import {AlertController, ModalController} from "@ionic/angular";
import {BehaviorSubject, merge, Observable, Subscription} from "rxjs";
import {TranslateService} from "@ngx-translate/core";
import {AcquisitionLevelCodes, QualityFlagIds} from "../../../referential/services/model/model.enum";
import {PmfmStrategy} from "../../../referential/services/model/pmfm-strategy.model";
import {BatchGroupForm} from "../form/batch-group.form";
import {isNil, toBoolean} from "@sumaris-net/ngx-components";
import {debounceTime, map, startWith} from "rxjs/operators";
import {PlatformService}  from "@sumaris-net/ngx-components";
import {Alerts} from "@sumaris-net/ngx-components";
import {BatchGroup} from "../../services/model/batch-group.model";
import {IReferentialRef, ReferentialUtils}  from "@sumaris-net/ngx-components";
import {AppFormUtils}  from "@sumaris-net/ngx-components";
import {environment} from "../../../../environments/environment";

@Component({
  selector: 'app-batch-group-modal',
  templateUrl: 'batch-group.modal.html',
  styleUrls: ['batch-group.modal.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BatchGroupModal implements OnInit, OnDestroy {

  private _subscription = new Subscription();

  debug = false;
  loading = false;
  mobile: boolean;
  data: BatchGroup;
  $title = new BehaviorSubject<string>(undefined);

  @Input() acquisitionLevel: string;

  @Input() programLabel: string;

  @Input() disabled: boolean;

  @Input() isNew: boolean;

  @Input() showTaxonGroup = true;

  @Input() showTaxonName = true;

  @Input() taxonGroupsNoWeight: string[];

  @Input() availableTaxonGroups: IReferentialRef[] | Observable<IReferentialRef[]>;

  @Input() qvPmfm: PmfmStrategy;

  @Input()
  set value(value: BatchGroup) {
    this.data = value;
  }

  @Input() openSubBatchesModal: (parent: Batch) => Promise<BatchGroup>;

  @Input() onDelete: (event: UIEvent, data: Batch) => Promise<boolean>;

  @ViewChild('form', { static: true }) form: BatchGroupForm;

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

  enable(opts?: {
    onlySelf?: boolean;
    emitEvent?: boolean;
  }) {
    this.form.enable(opts);
  }

  disable(opts?: {
    onlySelf?: boolean;
    emitEvent?: boolean;
  }) {
    this.form.disable(opts);
  }

  constructor(
    protected injector: Injector,
    protected alertCtrl: AlertController,
    protected modalCtrl: ModalController,
    protected platform: PlatformService,
    protected settings: LocalSettingsService,
    protected translate: TranslateService,
    protected cd: ChangeDetectorRef,
  ) {
    // Default value
    this.acquisitionLevel = AcquisitionLevelCodes.SORTING_BATCH;
    this.mobile = platform.mobile;

    // TODO: for DEV only
    this.debug = !environment.production;
  }

  ngOnInit() {

    this.isNew = toBoolean(this.isNew, !this.data);
    this.data = this.data || new BatchGroup();
    this.form.setValue(this.data);

    this.disabled = toBoolean(this.disabled, false);

    if (this.disabled) {
      this.disable();
    }
    else {
      this.enable();
    }


    // Update title, when form change
    this._subscription.add(
      merge(
        this.form.form.get('taxonGroup').valueChanges,
        this.form.form.get('taxonName').valueChanges
      )
      .pipe(
        debounceTime(500),
        map(() => this.form.value),
        // Start with current data
        startWith(this.data)
      )
      .subscribe((data) => this.computeTitle(data))
    );


    // Wait that form are ready (because of safeSetValue()) then mark as pristine
    setTimeout(() => {
      this.form.markAsPristine();
      this.form.markAsUntouched();
    }, 500);
  }

  ngAfterViewInit(): void {
    // Focus on the first field (if new AND desktop AND enabled)
    if (this.isNew && !this.mobile && this.enabled) {
      setTimeout(() => this.form.focusFirstInput(), 400);
    }
  }

  ngOnDestroy(): void {
    this._subscription.unsubscribe();
  }

  async cancel(event?: UIEvent) {
    if (this.dirty) {
      let saveBeforeLeave = await Alerts.askSaveBeforeLeave(this.alertCtrl, this.translate, event);
      if (isNil(saveBeforeLeave) || event && event.defaultPrevented) return; // User cancelled

      // Ask a second confirmation, if observed individual count > 0
      if (saveBeforeLeave === false && this.isNew && this.data.observedIndividualCount > 0) {
        saveBeforeLeave = await Alerts.askSaveBeforeLeave(this.alertCtrl, this.translate, event);
        if (isNil(saveBeforeLeave) || event && event.defaultPrevented) return; // User cancelled
      }

      // Is user confirm: close normally
      if (saveBeforeLeave === true) {
        this.close(event);
        return;
      }
    }

    await this.modalCtrl.dismiss();
  }

  async save(opts?: {allowInvalid?: boolean; }): Promise<BatchGroup | undefined> {
    if (this.loading) return undefined; // avoid many call

    this.loading = true;

    // Force enable form, before use value
    if (!this.enabled) this.enable({emitEvent: false});

    try {
      // Wait pending async validator
      await AppFormUtils.waitWhilePending(this.form, {
        timeout: 2000 // Workaround because from child form never finish FIXME
      });

      const invalid = !this.valid;
      if (invalid) {
        let allowInvalid = !opts || opts.allowInvalid !== false;
        // DO not allow invalid form, when taxon group and taxon name are missed
        const taxonGroup = this.form.form.get('taxonGroup').value;
        const taxonName = this.form.form.get('taxonName').value;
        if (ReferentialUtils.isEmpty(taxonGroup) && ReferentialUtils.isEmpty(taxonName)) {
          this.form.error = "COMMON.FORM.HAS_ERROR";
          allowInvalid = false;
        }

        // Invalid not allowed: stop
        if (!allowInvalid) {
          if (this.debug) this.form.logFormErrors("[batch-group-modal] ");
          this.form.markAsTouched({emitEvent: true});
          return undefined;
        }
      }

      // Save table content
      this.data = this.form.value;
      //this.data.qualityFlagId = invalid ? QualityFlagIds.BAD : undefined;

      return this.data;
    }
    finally {
      this.loading = false;
      this.markForCheck();
    }
  }

  async close(event?: UIEvent, opts?: {allowInvalid?: boolean; }): Promise<BatchGroup | undefined> {

    const savedBatch = await this.save({allowInvalid: true, ...opts});
    if (!savedBatch) return;
    await this.modalCtrl.dismiss(savedBatch);

    return savedBatch;
  }

  async delete(event?: UIEvent) {
    if (!this.onDelete) return; // Skip
    const result = await this.onDelete(event, this.data);
    if (isNil(result) || (event && event.defaultPrevented)) return; // User cancelled

    if (result) {
      await this.modalCtrl.dismiss();
    }
  }

  async onShowSubBatchesButtonClick(event?: UIEvent) {
    if (!this.openSubBatchesModal) return; // Skip

    // Save
    const savedBatch = await this.save({allowInvalid: true});
    if (!savedBatch) return;

    // Execute the callback
    const updatedParent = await this.openSubBatchesModal(savedBatch);

    if (!updatedParent) return; // User cancelled

    this.data.observedIndividualCount = updatedParent.observedIndividualCount;
    this.form.form.patchValue({observedIndividualCount: updatedParent.observedIndividualCount}, {emitEvent: false});
    this.form.hasIndividualMeasure = (updatedParent.observedIndividualCount > 0);
    this.form.markAsDirty();
  }

  /* -- protected methods -- */

  protected async computeTitle(data?: Batch) {
    data = data || this.data;
    if (this.isNew) {
      this.$title.next(await this.translate.get('TRIP.BATCH.NEW.TITLE').toPromise());
    }
    else {
      const label = BatchUtils.parentToString(data);
      this.$title.next(await this.translate.get('TRIP.BATCH.EDIT.TITLE', {label}).toPromise());
    }
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
