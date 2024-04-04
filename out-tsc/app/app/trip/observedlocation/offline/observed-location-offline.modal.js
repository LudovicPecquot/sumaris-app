import { __awaiter, __decorate, __metadata } from "tslib";
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { UntypedFormBuilder, Validators } from '@angular/forms';
import { AppForm, AppFormUtils, isEmptyArray, isNilOrBlank, isNotEmptyArray, isNotNil, referentialsToString, referentialToString, SharedValidators, StatusIds, } from '@sumaris-net/ngx-components';
import moment from 'moment';
import { ReferentialRefService } from '@app/referential/services/referential-ref.service';
import { ProgramRefQueries, ProgramRefService } from '@app/referential/services/program-ref.service';
import { map, mergeMap, tap } from 'rxjs/operators';
import { ProgramProperties } from '@app/referential/services/config/program.config';
import { ObservedLocationOfflineFilter } from '../observed-location.filter';
import { DATA_IMPORT_PERIODS } from '@app/data/data.config';
import { AcquisitionLevelCodes } from '@app/referential/services/model/model.enum';
import { StrategyRefService } from '@app/referential/services/strategy-ref.service';
import { BehaviorSubject } from 'rxjs';
let ObservedLocationOfflineModal = class ObservedLocationOfflineModal extends AppForm {
    constructor(injector, viewCtrl, translate, formBuilder, programRefService, strategyRefService, referentialRefService, cd) {
        super(injector, formBuilder.group({
            program: [null, Validators.compose([Validators.required, SharedValidators.entity])],
            strategy: [null, Validators.required],
            enableHistory: [true, Validators.required],
            location: [null, Validators.required],
            periodDuration: ['15 day', Validators.required],
        }));
        this.viewCtrl = viewCtrl;
        this.translate = translate;
        this.formBuilder = formBuilder;
        this.programRefService = programRefService;
        this.strategyRefService = strategyRefService;
        this.referentialRefService = referentialRefService;
        this.cd = cd;
        this.title = 'OBSERVED_LOCATION.OFFLINE_MODAL.TITLE';
        this._enable = false; // Disable by default
        this.mobile = this.settings.mobile;
        // Prepare start date items
        const datePattern = translate.instant('COMMON.DATE_PATTERN');
        this.periodDurationLabels = DATA_IMPORT_PERIODS.map((v) => {
            const date = moment()
                .utc(false)
                .add(-1 * v.value, v.unit); // Substract the period, from now
            return {
                key: `${v.value} ${v.unit}`,
                label: `${date.fromNow(true /*no suffix*/)} (${date.format(datePattern)})`,
                startDate: date.startOf('day'), // Reset time
            };
        });
    }
    get value() {
        return this.getValue();
    }
    set value(data) {
        this.setValue(data);
    }
    get valid() {
        return this.form.valid;
    }
    get modalName() {
        return this.constructor.name;
    }
    ngOnInit() {
        super.ngOnInit();
        // Program
        this.registerAutocompleteField('program', {
            service: this.programRefService,
            filter: {
                statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY],
                acquisitionLevelLabels: [AcquisitionLevelCodes.OBSERVED_LOCATION, AcquisitionLevelCodes.LANDING],
            },
            mobile: this.mobile,
        });
        // Listen program (with properties)
        const programSubject = new BehaviorSubject(null);
        this.registerSubscription(this.form
            .get('program')
            .valueChanges.pipe(
        // Load the program
        mergeMap((program) => isNilOrBlank(program === null || program === void 0 ? void 0 : program.label)
            ? Promise.resolve()
            : this.programRefService.loadByLabel(program.label, {
                query: ProgramRefQueries.loadLight,
                fetchPolicy: 'cache-first',
            })))
            .subscribe((program) => programSubject.next(program || null)));
        const displayAttributes = this.settings.getFieldDisplayAttributes('location');
        const locations$ = programSubject.pipe(mergeMap((program) => {
            if (!program)
                return Promise.resolve();
            const locationLevelIds = program.getPropertyAsNumbers(ProgramProperties.OBSERVED_LOCATION_LOCATION_LEVEL_IDS);
            return this.referentialRefService.loadAll(0, 100, displayAttributes[0], 'asc', {
                entityName: 'Location',
                levelIds: locationLevelIds,
            });
        }), map((res) => res && res.data), tap((items) => {
            if (isEmptyArray(items)) {
                this.form.get('location').disable();
            }
            else {
                this.form.get('location').enable();
            }
        }));
        this.registerAutocompleteField('location', {
            items: locations$,
            displayWith: (arg) => {
                if (Array.isArray(arg)) {
                    return referentialsToString(arg, displayAttributes);
                }
                return referentialToString(arg, displayAttributes);
            },
            mobile: this.mobile,
        });
        // Strategies
        this.registerAutocompleteField('strategy', {
            suggestFn: (value, filter) => this.strategyRefService.suggest(value, Object.assign(Object.assign({}, filter), { level: programSubject.value }), 'label', 'desc', { fetchPolicy: 'cache-first' }),
            displayWith: (item) => (item === null || item === void 0 ? void 0 : item.label) || '',
            mobile: this.mobile,
        });
        this.registerSubscription(programSubject
            .pipe(mergeMap((program) => {
            if (!program)
                return Promise.resolve();
            return this.strategyRefService.loadAll(0, 0, null, null, { levelId: program.id });
        }), map((res) => (res && res.total) || 0))
            .subscribe((strategiesCount) => {
            if (strategiesCount > 1) {
                this.form.get('strategy').enable();
            }
            else {
                this.form.get('strategy').disable();
            }
        }));
        // Enable/disable sub controls, from the 'enable history' checkbox
        const subControls = [this.form.get('location'), this.form.get('periodDuration')];
        this.form.get('enableHistory').valueChanges.subscribe((enable) => {
            if (enable) {
                subControls.forEach((control) => {
                    control.enable();
                    control.setValidators(Validators.required);
                });
            }
            else {
                subControls.forEach((control) => {
                    control.disable();
                    control.setValidators(null);
                });
            }
        });
    }
    setValue(value) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (!value)
                return; // skip
            const json = {
                program: null,
                strategy: null,
                location: null,
                periodDuration: null,
            };
            // Program
            if (value.programLabel) {
                json.program = yield this.programRefService.loadByLabel(value.programLabel, { query: ProgramRefQueries.loadLight });
            }
            // Strategy
            if (isNotEmptyArray(value.strategyIds) && isNotNil(json.program.id)) {
                json.strategy = (_b = (yield this.strategyRefService.loadAll(0, value.strategyIds.length, 'label', 'asc', {
                    levelId: (_a = json.program) === null || _a === void 0 ? void 0 : _a.id,
                    includedIds: value.strategyIds,
                }))) === null || _b === void 0 ? void 0 : _b.data;
            }
            else {
            }
            // Location
            if (isNotEmptyArray(value.locationIds)) {
                json.location = yield Promise.all(value.locationIds.map((id) => this.referentialRefService.loadById(id, 'Location')));
            }
            // Duration period
            if (value.periodDuration && value.periodDurationUnit) {
                json.periodDuration = `${value.periodDuration} ${value.periodDurationUnit}`;
            }
            this.enable();
            if (isEmptyArray(json.strategy)) {
                this.form.get('strategy').disable(); // Disable by default, when empty
            }
            this.form.patchValue(json);
            this.markAsLoaded();
        });
    }
    getValue() {
        const json = this.form.value;
        // DEBUG
        console.debug('[observed-location-offline] Modal form.value:', json);
        const value = new ObservedLocationOfflineFilter();
        // Set program
        value.programLabel = (json.program && json.program.label) || json.program;
        // Location
        if (json.strategy) {
            if (Array.isArray(json.strategy)) {
                value.strategyIds = json.strategy.map((entity) => entity.id);
            }
            else {
                value.strategyIds = [json.strategy.id];
            }
        }
        // Location
        if (json.location) {
            if (Array.isArray(json.location)) {
                value.locationIds = json.location.map((entity) => entity.id);
            }
            else {
                value.locationIds = [json.location.id];
            }
        }
        // Set start date
        if (json.enableHistory && json.periodDuration) {
            const periodDuration = this.periodDurationLabels.find((item) => item.key === json.periodDuration);
            value.startDate = periodDuration && periodDuration.startDate;
            // Keep value of periodDuration (to be able to save it in local settings)
            const parts = json.periodDuration.split(' ');
            value.periodDuration = +parts[0];
            value.periodDurationUnit = parts[1];
        }
        // DEBUG
        //console.debug("[observed-location-offline] Modal result value:", value);
        return value;
    }
    cancel() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.viewCtrl.dismiss(null, 'cancel');
        });
    }
    validate(event) {
        return __awaiter(this, void 0, void 0, function* () {
            this.form.markAllAsTouched();
            if (!this.form.valid) {
                yield AppFormUtils.waitWhilePending(this.form);
                if (this.form.invalid) {
                    AppFormUtils.logFormErrors(this.form, '[offline-import-config] ');
                    return; // stop
                }
            }
            return this.viewCtrl.dismiss(this.getValue(), 'OK');
        });
    }
    markForCheck() {
        this.cd.markForCheck();
    }
};
__decorate([
    Input(),
    __metadata("design:type", Object)
], ObservedLocationOfflineModal.prototype, "title", void 0);
ObservedLocationOfflineModal = __decorate([
    Component({
        selector: 'app-observed-location-offline-modal',
        styleUrls: ['./observed-location-offline.modal.scss'],
        templateUrl: './observed-location-offline.modal.html',
        changeDetection: ChangeDetectionStrategy.OnPush,
    }),
    __metadata("design:paramtypes", [Injector,
        ModalController,
        TranslateService,
        UntypedFormBuilder,
        ProgramRefService,
        StrategyRefService,
        ReferentialRefService,
        ChangeDetectorRef])
], ObservedLocationOfflineModal);
export { ObservedLocationOfflineModal };
//# sourceMappingURL=observed-location-offline.modal.js.map