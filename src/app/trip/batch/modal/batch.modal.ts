import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnInit, ViewChild} from "@angular/core";
import {Batch, BatchUtils} from "../../services/model/batch.model";
import {BehaviorSubject} from "rxjs";
import {PmfmStrategy} from "../../../referential/services/model/pmfm-strategy.model";
import {BatchForm} from "../form/batch.form";
import {ModalController} from "@ionic/angular";
import {PlatformService}  from "@sumaris-net/ngx-components";
import {LocalSettingsService}  from "@sumaris-net/ngx-components";
import {TranslateService} from "@ngx-translate/core";
import {AcquisitionLevelCodes} from "../../../referential/services/model/model.enum";
import {toBoolean} from "@sumaris-net/ngx-components";
import {AppFormUtils}  from "@sumaris-net/ngx-components";

@Component({
    selector: 'app-batch-modal',
    templateUrl: './batch.modal.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BatchModal implements OnInit {

    debug = false;
    loading = false;
    mobile: boolean;
    data: Batch;
    $title = new BehaviorSubject<string>(undefined);

    @Input() acquisitionLevel: string;

    @Input() programLabel: string;

    @Input() canEdit: boolean;

    @Input() disabled: boolean;

    @Input() isNew = false;

    @Input() showTaxonGroup = true;

    @Input() showTaxonName = true;

    @Input() showIndividualCount = false;

    @Input() showTotalIndividualCount = false;

    @Input() qvPmfm: PmfmStrategy;

    @Input() showSampleBatch = false;

    @Input()
    set value(value: Batch) {
        this.data = value;
    }

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
        this.canEdit = toBoolean(this.canEdit, !this.disabled);
        this.disabled = !this.canEdit || toBoolean(this.disabled, true);

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
