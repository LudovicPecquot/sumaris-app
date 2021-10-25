import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnInit, ViewChild } from '@angular/core';
import { Batch, BatchUtils } from '../../services/model/batch.model';
import { BehaviorSubject, Observable } from 'rxjs';
import { PmfmStrategy } from '../../../referential/services/model/pmfm-strategy.model';
import { BatchForm } from '../form/batch.form';
import { ModalController } from '@ionic/angular';
import { AppFormUtils, Entity, IReferentialRef, LocalSettingsService, PlatformService, toBoolean, UsageMode } from '@sumaris-net/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { AcquisitionLevelCodes } from '../../../referential/services/model/model.enum';
import { IDataEntityModalOptions } from '@app/data/table/data-modal.class';
import { IPmfm } from '@app/referential/services/model/pmfm.model';


export interface IBatchModalOptions<B extends Entity<B> = Batch> extends IDataEntityModalOptions<B> {

  // UI Fields show/hide
  showTaxonGroup: boolean;
  showTaxonName: boolean;
  showIndividualCount: boolean;

  // UI Options
  maxVisibleButtons: number;

  qvPmfm?: PmfmStrategy;
  availableTaxonGroups?: IReferentialRef[] | Observable<IReferentialRef[]>;

  // TODO: voir pour utiliser des IReferentialRef
  taxonGroupsNoWeight?: string[];

}

@Component({
    selector: 'app-batch-modal',
    templateUrl: './batch.modal.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BatchModal implements OnInit, IBatchModalOptions {

  debug = false;
  loading = false;
  mobile: boolean;
  $title = new BehaviorSubject<string>(undefined);

  @Input() data: Batch;
  @Input() disabled: boolean;
  @Input() isNew = false;
  @Input() acquisitionLevel: string;
  @Input() programLabel: string;
  @Input() showTaxonGroup = true;
  @Input() showTaxonName = true;
  @Input() showIndividualCount = false;
  @Input() showTotalIndividualCount = false;
  @Input() showSamplingBatch = false;
  @Input() qvPmfm: PmfmStrategy;
  @Input() maxVisibleButtons: number;
  @Input() usageMode: UsageMode;
  @Input() pmfms: Observable<IPmfm[]> | IPmfm[];

  @Input() onDelete: (event: UIEvent, data: Batch) => Promise<boolean>;

    @ViewChild('form', {static: true}) form: BatchForm;

    get dirty(): boolean {
        return this.form.dirty;
    }

    get invalid(): boolean {
        return this.form.invalid;
    }

    get valid(): boolean {
        return this.form.valid;
    }

    constructor(
        protected injector: Injector,
        protected viewCtrl: ModalController,
        protected platform: PlatformService,
        protected settings: LocalSettingsService,
        protected translate: TranslateService,
        protected cd: ChangeDetectorRef
    ) {
        // Default value
        this.acquisitionLevel = AcquisitionLevelCodes.SORTING_BATCH;
        this.mobile = platform.mobile;

        // TODO: for DEV only
        //this.debug = !environment.production;
    }


    ngOnInit() {
        this.disabled = toBoolean(this.disabled, false);

        if (this.disabled) {
            this.form.disable();
        }

        this.form.value = this.data || new Batch();

        // Compute the title
        this.computeTitle();

        if (!this.isNew) {
            // Update title each time value changes
            this.form.valueChanges.subscribe(batch => this.computeTitle(batch));
        }

    }

    async cancel() {
        await this.viewCtrl.dismiss();
    }

    async close(event?: UIEvent) {
        if (this.loading) return; // avoid many call

        if (this.invalid) {
            if (this.debug) AppFormUtils.logFormErrors(this.form.form, "[batch-modal] ");
            this.form.error = "COMMON.FORM.HAS_ERROR";
            this.form.markAsTouched({emitEvent: true});
            return;
        }

        this.loading = true;

        // Save table content
        const data = this.form.value;

        await this.viewCtrl.dismiss(data);
    }

    /* -- protected methods -- */

    protected markForCheck() {
        this.cd.markForCheck();
    }

    protected async computeTitle(data?: Batch) {
        data = data || this.data;
        if (this.isNew || !data) {
            this.$title.next(await this.translate.get('TRIP.BATCH.NEW.TITLE').toPromise());
        } else {
            const label = BatchUtils.parentToString(data);
            this.$title.next(await this.translate.get('TRIP.BATCH.EDIT.TITLE', {label}).toPromise());
        }
    }
}
