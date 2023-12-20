import { __awaiter, __decorate, __metadata } from "tslib";
import { Directive, Injector, Input, ViewChild } from '@angular/core';
import { debounceTime, distinctUntilChanged, filter, map, startWith, tap, throttleTime } from 'rxjs/operators';
import { AccountService, AppFormUtils, arrayDistinct, chainPromises, FileResponse, FilesUtils, isEmptyArray, isNilOrBlank, isNotEmptyArray, isNotNil, isNotNilOrBlank, NetworkService, referentialToString, toBoolean, toDateISOString, } from '@sumaris-net/ngx-components';
import { BehaviorSubject } from 'rxjs';
import { RootDataEntityUtils } from '../services/model/root-data-entity.model';
import { MatExpansionPanel } from '@angular/material/expansion';
import { HttpEventType } from '@angular/common/http';
import { PopoverController } from '@ionic/angular';
import { AppBaseTable } from '@app/shared/table/base.table';
import { UserEventService } from '@app/social/user-event/user-event.service';
import moment from 'moment';
import { ProgramRefService } from '@app/referential/services/program-ref.service';
export const AppRootTableSettingsEnum = {
    FILTER_KEY: 'filter',
};
let AppRootDataTable = class AppRootDataTable extends AppBaseTable {
    constructor(injector, dataType, filterType, columnNames, dataService, validatorService, options) {
        super(injector, dataType, filterType, columnNames, dataService, validatorService, options);
        this.dataType = dataType;
        this.filterType = filterType;
        this.$selectedProgramLabels = new BehaviorSubject([]);
        this.needUpdateOfflineFeature = false;
        this.offline = false;
        this.logPrefix = '[root-data-table] ';
        this.importing = false;
        this.progressionMessage = null;
        this.$progression = new BehaviorSubject(0);
        this.hasOfflineMode = false;
        this.restoreFilterSources = ['settings', 'queryParams'];
        this.showOfflineMode = true;
        this.showQuality = true;
        this.showUpdateOfflineFeature = true;
        this.showInstallUpgradeCard = true;
        this.referentialToString = referentialToString;
        this.network = injector.get(NetworkService);
        this.accountService = injector.get(AccountService);
        this.userEventService = injector.get(UserEventService);
        this.programRefService = injector.get(ProgramRefService);
        this.popoverController = injector.get(PopoverController);
        this.readOnly = false;
        this.inlineEdition = false;
        this.confirmBeforeDelete = true;
        this.saveBeforeSort = false;
        this.saveBeforeFilter = false;
        this.saveBeforeDelete = false;
        this.registerSubscription(this.selection.changed
            .pipe(debounceTime(650))
            .pipe(map(_ => this.selection.selected), map(rows => (rows || []).map(row => { var _a, _b; return (_b = (_a = row.currentData) === null || _a === void 0 ? void 0 : _a.program) === null || _b === void 0 ? void 0 : _b.label; }).filter(isNotNilOrBlank)), filter(isNotEmptyArray), map(programLabels => arrayDistinct(programLabels)), 
        // DEBUG
        tap(programLabels => console.debug(this.logPrefix + `Selected data programs: [${programLabels.join(', ')}]`)))
            .subscribe(programLabels => this.$selectedProgramLabels.next(programLabels)));
    }
    get synchronizationStatus() {
        return this.filterForm.controls.synchronizationStatus.value || 'SYNC' /*= the default status*/;
    }
    set synchronizationStatus(value) {
        this.setSynchronizationStatus(value);
    }
    get isLogin() {
        return this.accountService.isLogin();
    }
    get canDeleteSelection() {
        // Cannot delete if not connected
        if (!this.isLogin || this.selection.isEmpty()) {
            return false;
        }
        // Find a row that user CANNOT delete
        const invalidRow = this.selection.selected
            .find(row => !this._dataService.canUserWrite(row.currentData));
        return !invalidRow;
    }
    ngOnInit() {
        super.ngOnInit();
        this.isAdmin = this.accountService.isAdmin();
        this.canEdit = toBoolean(this.canEdit, this.isAdmin || this.accountService.isUser());
        this.canDelete = toBoolean(this.canDelete, this.isAdmin);
        if (this.debug)
            console.debug('[root-table] Can user edit table ? ' + this.canEdit);
        if (!this.filterForm)
            throw new Error(`Missing 'filterForm' in ${this.constructor.name}`);
        if (!this.featureName)
            throw new Error(`Missing 'dataService.featureName' in ${this.constructor.name}`);
        // Listen synchronizationStatus
        this.synchronizationStatus$ = this.onRefresh
            .pipe(startWith(this.synchronizationStatus), map(() => this.synchronizationStatus));
        // Listen network
        this.offline = this.network.offline;
        this.registerSubscription(this.network.onNetworkStatusChanges
            .pipe(filter(isNotNil), distinctUntilChanged())
            .subscribe((type) => this.onNetworkStatusChanged(type)));
        this.registerSubscription(this.onRefresh.subscribe(() => {
            this.filterForm.markAsUntouched();
            this.filterForm.markAsPristine();
            // Check if update offline mode is need
            if (this.showUpdateOfflineFeature) {
                this.checkUpdateOfflineNeed();
            }
        }));
        // Update filter when changes
        this.registerSubscription(this.filterForm.valueChanges
            .pipe(debounceTime(250), filter((_) => {
            const valid = this.filterForm.valid;
            if (!valid && this.debug)
                AppFormUtils.logFormErrors(this.filterForm);
            return valid;
        }), 
        // Update the filter, without reloading the content
        tap(json => this.setFilter(json, { emitEvent: false })), 
        // Save filter in settings (after a debounce time)
        debounceTime(500), filter(() => isNotNilOrBlank(this.settingsId) && this.restoreFilterSources !== false && this.restoreFilterSources.includes('settings')), tap(json => this.settings.savePageSetting(this.settingsId, Object.assign({}, json), AppRootTableSettingsEnum.FILTER_KEY)))
            .subscribe());
    }
    ngOnDestroy() {
        super.ngOnDestroy();
        this.$progression.unsubscribe();
    }
    onNetworkStatusChanged(type) {
        const offline = type === 'none';
        if (this.offline !== offline) {
            // Update the property used in template
            this.offline = offline;
            this.markForCheck();
            // When offline, change synchronization status to DIRTY
            if (this.offline && this.synchronizationStatus === 'SYNC') {
                this.setSynchronizationStatus('DIRTY');
            }
        }
    }
    toggleOfflineMode(event) {
        if (this.network.offline) {
            this.network.setForceOffline(false);
        }
        else {
            this.network.setForceOffline(true, { showToast: true });
            this.hasOfflineMode = true;
            this.filterForm.patchValue({ synchronizationStatus: 'DIRTY' }, { emitEvent: false /*avoid refresh*/ });
        }
        // Refresh table
        this.onRefresh.emit();
    }
    prepareOfflineMode(event, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.importing)
                return; // skip
            // If offline, warn user and ask to reconnect
            if (this.network.offline) {
                if ((opts === null || opts === void 0 ? void 0 : opts.showToast) !== false) {
                    return this.network.showOfflineToast({
                        // Allow to retry to connect
                        showRetryButton: true,
                        onRetrySuccess: () => this.prepareOfflineMode(null, opts)
                    });
                }
                return false;
            }
            this.progressionMessage = 'NETWORK.INFO.IMPORTATION_PCT_DOTS';
            const maxProgression = 100;
            this.$progression.next(0);
            this.resetError();
            let success = false;
            try {
                yield new Promise((resolve, reject) => {
                    // Run the import
                    this._dataService.runImport(null, { maxProgression })
                        .pipe(filter(value => value > 0), map((progress) => {
                        if (!this.importing) {
                            this.importing = true;
                            this.markForCheck();
                        }
                        return Math.min(Math.trunc(progress), maxProgression);
                    }), throttleTime(100), tap(progression => this.$progression.next(progression)))
                        .subscribe({
                        error: (err) => reject(err),
                        complete: () => resolve()
                    });
                });
                // Toggle to offline mode
                if (!opts || opts.toggleToOfflineMode !== false) {
                    this.setSynchronizationStatus('DIRTY');
                }
                // Display toast
                if (!opts || opts.showToast !== false) {
                    this.showToast({ message: 'NETWORK.INFO.IMPORTATION_SUCCEED', showCloseButton: true, type: 'info' });
                }
                success = true;
                // Hide the warning message
                this.needUpdateOfflineFeature = false;
                return success;
            }
            catch (err) {
                success = false;
                this.setError(err);
                return success;
            }
            finally {
                this.hasOfflineMode = this.hasOfflineMode || success;
                this.$progression.next(0);
                this.importing = false;
                this.markForCheck();
            }
        });
    }
    setSynchronizationStatus(value, opts = { showToast: true }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!value)
                return false; // Skip if empty
            // Make sure network is UP
            if (this.offline && value === 'SYNC' && !this.hasOfflineMode) {
                if (opts.showToast) {
                    this.network.showOfflineToast({
                        // Allow to retry to connect
                        showRetryButton: true,
                        onRetrySuccess: () => this.setSynchronizationStatus(value) // Loop
                    });
                }
                return false;
            }
            console.debug('[trips] Applying filter to synchronization status: ' + value);
            this.resetError();
            this.filterForm.patchValue({ synchronizationStatus: value }, { emitEvent: false });
            const json = Object.assign(Object.assign({}, this.filter), { synchronizationStatus: value });
            this.setFilter(json, { emitEvent: true });
            // Save filter to settings (need to be done here, because entity creation can need it - e.g. to apply Filter as default values)
            if (isNotNilOrBlank(this.settingsId)) {
                yield this.settings.savePageSetting(this.settingsId, json, AppRootTableSettingsEnum.FILTER_KEY);
            }
            return true;
        });
    }
    toggleSynchronizationStatus() {
        if (this.offline || this.synchronizationStatus === 'SYNC') {
            this.setSynchronizationStatus('DIRTY');
        }
        else {
            this.setSynchronizationStatus('SYNC');
        }
    }
    toggleFilterPanelFloating() {
        this.filterPanelFloating = !this.filterPanelFloating;
        this.markForCheck();
    }
    addRowToSyncStatus(event, value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!value || !this.mobile || this.importing)
                return; // Skip
            // If 'DIRTY' but offline not init : init this mode
            if (value !== 'SYNC' && !this.hasOfflineMode) {
                // If offline, warn user and ask to reconnect
                if (this.network.offline) {
                    return this.network.showOfflineToast({
                        // Allow to retry to connect
                        showRetryButton: true,
                        onRetrySuccess: () => this.addRowToSyncStatus(null, value)
                    });
                }
                const done = yield this.prepareOfflineMode(null, { toggleToOfflineMode: false, showToast: false });
                if (!done || !this.hasOfflineMode)
                    return; // Skip if failed
            }
            // Set the synchronization status, if changed
            if (this.synchronizationStatus !== value) {
                const ok = yield this.setSynchronizationStatus(value, { showToast: false });
                if (!ok)
                    return;
                // Make sure status changed
                if (this.synchronizationStatus !== value) {
                    console.warn('[root-table] Cannot switch to synchronization status: ' + value + '. Cannot add new row !');
                    return;
                }
            }
            // Force settings the expected usageMode
            const forceUsageMode = this.synchronizationStatus === 'SYNC' ? 'DESK' : 'FIELD';
            if (this.settings.usageMode !== forceUsageMode) {
                console.info('[root-table] Changing usage mode to: ' + forceUsageMode);
                yield this.settings.applyProperty('usageMode', forceUsageMode);
            }
            // Add new row
            this.addRow(event);
        });
    }
    clickRow(event, row) {
        if (this.importing)
            return; // Skip
        return super.clickRow(event, row);
    }
    openRow(id, row) {
        const _super = Object.create(null, {
            openRow: { get: () => super.openRow }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // Force settings the expected usageMode
            if (this.mobile && this.hasOfflineMode) {
                const forceUsageMode = this.synchronizationStatus === 'SYNC' ? 'DESK' : 'FIELD';
                if (this.settings.usageMode !== forceUsageMode) {
                    console.info('[root-table] Changing usage mode to: ' + forceUsageMode);
                    yield this.settings.applyProperty('usageMode', forceUsageMode);
                }
            }
            return _super.openRow.call(this, id, row);
        });
    }
    closeFilterPanel() {
        if (this.filterExpansionPanel)
            this.filterExpansionPanel.close();
        if (!this.filterPanelFloating) {
            this.filterPanelFloating = true;
            this.markForCheck();
        }
    }
    get hasReadyToSyncSelection() {
        if (!this._enabled || this.loading || this.selection.isEmpty())
            return false;
        return this.selection.selected
            .map(row => row.currentData)
            .findIndex(RootDataEntityUtils.isReadyToSync) !== -1;
    }
    get hasDirtySelection() {
        if (!this._enabled || this.loading || this.selection.isEmpty())
            return false;
        return this.selection.selected
            .map(row => row.currentData)
            .findIndex(RootDataEntityUtils.isLocalAndDirty) !== -1;
    }
    terminateAndSynchronizeSelection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.markAsLoading();
                const rows = this.selection.selected.slice();
                // Terminate
                yield this.terminateSelection({
                    showSuccessToast: false,
                    emitEvent: false,
                    rows
                });
                yield this.synchronizeSelection({
                    showSuccessToast: true,
                    emitEvent: false,
                    rows
                });
                // Clean selection
                this.selection.clear();
            }
            catch (err) {
                console.error(err);
            }
            finally {
                this.onRefresh.emit();
            }
        });
    }
    terminateSelection(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._enabled)
                return; // Skip
            const rows = opts && opts.rows || (!this.loading && this.selection.selected.slice());
            if (isEmptyArray(rows))
                return; // Skip
            if (this.offline) {
                yield new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                    const res = yield this.network.showOfflineToast({
                        showRetryButton: true,
                        onRetrySuccess: () => resolve()
                    });
                    if (!res)
                        reject('ERROR.NETWORK_REQUIRED');
                }));
            }
            if (this.debug)
                console.debug('[root-table] Starting to terminate data...');
            const ids = rows
                .map(row => row.currentData)
                .filter(RootDataEntityUtils.isLocalAndDirty)
                .map(entity => entity.id);
            if (isEmptyArray(ids))
                return; // Nothing to terminate
            this.markAsLoading();
            this.error = null;
            try {
                yield chainPromises(ids.map(id => () => this._dataService.terminateById(id)));
                // Update rows, when no refresh will be emitted
                if ((opts === null || opts === void 0 ? void 0 : opts.emitEvent) === false) {
                    rows.map(row => {
                        if (RootDataEntityUtils.isLocalAndDirty(row.currentData)) {
                            row.currentData.synchronizationStatus = 'READY_TO_SYNC';
                        }
                    });
                }
                // Success message
                if (!opts || opts.showSuccessToast !== false) {
                    this.showToast({
                        message: 'INFO.SYNCHRONIZATION_SUCCEED'
                    });
                }
            }
            catch (error) {
                this.userEventService.showToastErrorWithContext({
                    error,
                    context: () => chainPromises(ids.map(id => () => this._dataService.load(id, { withOperation: true, toEntity: false })))
                });
                throw error;
            }
            finally {
                if (!opts || opts.emitEvent !== false) {
                    // Reset selection
                    this.selection.clear();
                    // Refresh table
                    this.onRefresh.emit();
                }
            }
        });
    }
    synchronizeSelection(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._enabled)
                return; // Skip
            const rows = opts && opts.rows || (!this.loading && this.selection.selected.slice());
            if (isEmptyArray(rows))
                return; // Skip
            if (this.offline) {
                yield new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                    const res = yield this.network.showOfflineToast({
                        showRetryButton: true,
                        onRetrySuccess: () => resolve()
                    });
                    if (!res)
                        reject('ERROR.NETWORK_REQUIRED');
                }));
            }
            if (this.debug)
                console.debug('[root-table] Starting to synchronize data...');
            const ids = rows
                .map(row => row.currentData)
                .filter(RootDataEntityUtils.isReadyToSync)
                .map(entity => entity.id);
            if (isEmptyArray(ids))
                return; // Nothing to sync
            this.markAsLoading();
            this.error = null;
            try {
                yield chainPromises(ids.map(id => () => this._dataService.synchronizeById(id)));
                this.selection.clear();
                // Success message
                if (!opts || opts.showSuccessToast !== false) {
                    this.showToast({
                        message: 'INFO.SYNCHRONIZATION_SUCCEED'
                    });
                }
            }
            catch (error) {
                this.userEventService.showToastErrorWithContext({
                    error,
                    context: () => chainPromises(ids.map(id => () => this._dataService.load(id, { withOperation: true, toEntity: false })))
                });
                throw error;
            }
            finally {
                if (!opts || opts.emitEvent !== false) {
                    // Clear selection
                    this.selection.clear();
                    // Refresh table
                    this.onRefresh.emit();
                }
            }
        });
    }
    importFromFile(event) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield FilesUtils.showUploadPopover(this.popoverController, event, {
                uniqueFile: true,
                fileExtension: '.json',
                instantUpload: true,
                uploadFn: (file) => this.uploadFile(file)
            });
            const entities = (data || []).flatMap(file => { var _a; return ((_a = file.response) === null || _a === void 0 ? void 0 : _a.body) || []; });
            if (isEmptyArray(entities))
                return; // No entities: skip
            console.info(this.logPrefix + `Loaded ${entities.length} entities from file`);
            return entities;
        });
    }
    /* -- protected methods -- */
    asFilter(source) {
        source = source || this.filterForm.value;
        if (this._dataSource && this._dataSource.dataService) {
            return this._dataSource.dataService.asFilter(source);
        }
        return source;
    }
    restoreFilterOrLoad(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            this.markAsLoading();
            console.log(`${this.logPrefix}restoreFilterOrLoad()`, opts);
            const json = this.restoreFilterSources !== false && ((opts === null || opts === void 0 ? void 0 : opts.sources) || this.restoreFilterSources || []).map(source => {
                switch (source) {
                    case 'settings':
                        if (isNilOrBlank(this.settingsId))
                            return;
                        console.debug(this.logPrefix + 'Restoring filter from settings...');
                        return this.settings.getPageSettings(this.settingsId, AppRootTableSettingsEnum.FILTER_KEY) || {};
                    case 'queryParams':
                        const { q } = this.route.snapshot.queryParams;
                        if (q) {
                            console.debug(this.logPrefix + 'Restoring filter from route query param: ', q);
                            try {
                                return JSON.parse(q);
                            }
                            catch (err) {
                                console.error(this.logPrefix + 'Failed to parse route query param: ' + q, err);
                            }
                        }
                }
                return null;
            }).find(isNotNil);
            if (json) {
                // Force offline, if no network AND has offline feature
                this.hasOfflineMode = (json.synchronizationStatus && json.synchronizationStatus !== 'SYNC') || (yield this._dataService.hasOfflineData());
                if (this.network.offline && this.hasOfflineMode) {
                    json.synchronizationStatus = 'DIRTY';
                }
                this.setFilter(json, Object.assign({ emitEvent: true }, opts));
            }
            else {
                // has offline feature
                this.hasOfflineMode = yield this._dataService.hasOfflineData();
                if (!opts || opts.emitEvent !== false) {
                    this.onRefresh.emit();
                }
            }
        });
    }
    setFilter(filter, opts) {
        super.setFilter(filter, opts);
    }
    patchFilter(filter, opts) {
        super.setFilter(Object.assign(Object.assign({}, this.filter), filter), opts);
    }
    checkUpdateOfflineNeed() {
        return __awaiter(this, void 0, void 0, function* () {
            let needUpdate = false;
            // If online
            if (this.network.online) {
                // Get last synchro date
                const lastSynchronizationDate = this.settings.getOfflineFeatureLastSyncDate(this.featureName);
                // Check only if last synchro older than 10 min
                if (lastSynchronizationDate && lastSynchronizationDate.isBefore(moment().add(-10, 'minute'))) {
                    // Get peer last update date, then compare
                    const remoteUpdateDate = yield this._dataService.lastUpdateDate();
                    if (isNotNil(remoteUpdateDate)) {
                        // Compare dates, to known if an update if need
                        needUpdate = lastSynchronizationDate.isBefore(remoteUpdateDate);
                    }
                    console.info(`[root-table] Checking referential last update dates: {local: '${toDateISOString(lastSynchronizationDate)}', remote: '${toDateISOString(remoteUpdateDate)}'} - Need upgrade: ${needUpdate}`);
                }
            }
            // Update the view
            if (this.needUpdateOfflineFeature !== needUpdate) {
                this.needUpdateOfflineFeature = needUpdate;
                this.markForCheck();
            }
        });
    }
    getJsonEncoding() {
        const key = 'FILE.JSON.ENCODING';
        const encoding = this.translate.instant(key);
        if (encoding !== key)
            return encoding;
        return 'UTF-8'; // Default encoding
    }
    uploadFile(file) {
        console.info(this.logPrefix + `Importing JSON file ${file.name}...`);
        const encoding = this.getJsonEncoding();
        return FilesUtils.readAsText(file, encoding)
            .pipe(map(event => {
            if (event.type === HttpEventType.UploadProgress) {
                const loaded = Math.round(event.loaded * 0.8);
                return Object.assign(Object.assign({}, event), { loaded });
            }
            else if (event instanceof FileResponse) {
                console.debug(this.logPrefix + 'File content: \n' + event.body);
                try {
                    const data = JSON.parse(event.body);
                    if (Array.isArray(data)) {
                        return new FileResponse({ body: data });
                    }
                    return new FileResponse({ body: [data] });
                }
                catch (err) {
                    console.error(this.logPrefix + 'Error while parsing JSON file', err);
                    throw new Error('Invalid JSON file'); // TODO translate
                }
            }
            // Unknown event: skip
            else {
                return null;
            }
        }), filter(isNotNil));
    }
    openNewRowDetail(event) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.allowRowDetail)
                return false;
            if (this.onNewRow.observed) {
                this.onNewRow.emit(event);
                return true;
            }
            return this.navController.navigateForward(`${this.router.url}/new`, {
                // Pass the tableId, to be able to use search field as defaults
                queryParams: this.settingsId && { tableId: this.settingsId }
            });
        });
    }
};
__decorate([
    Input(),
    __metadata("design:type", Object)
], AppRootDataTable.prototype, "hasOfflineMode", void 0);
__decorate([
    Input(),
    __metadata("design:type", Object)
], AppRootDataTable.prototype, "restoreFilterSources", void 0);
__decorate([
    Input(),
    __metadata("design:type", Object)
], AppRootDataTable.prototype, "showOfflineMode", void 0);
__decorate([
    Input(),
    __metadata("design:type", Object)
], AppRootDataTable.prototype, "showQuality", void 0);
__decorate([
    Input(),
    __metadata("design:type", String),
    __metadata("design:paramtypes", [String])
], AppRootDataTable.prototype, "synchronizationStatus", null);
__decorate([
    Input(),
    __metadata("design:type", Object)
], AppRootDataTable.prototype, "showUpdateOfflineFeature", void 0);
__decorate([
    Input(),
    __metadata("design:type", Object)
], AppRootDataTable.prototype, "showInstallUpgradeCard", void 0);
__decorate([
    ViewChild(MatExpansionPanel, { static: true }),
    __metadata("design:type", MatExpansionPanel)
], AppRootDataTable.prototype, "filterExpansionPanel", void 0);
AppRootDataTable = __decorate([
    Directive()
    // tslint:disable-next-line:directive-class-suffix
    ,
    __metadata("design:paramtypes", [Injector, Function, Function, Array, Object, Object, Object])
], AppRootDataTable);
export { AppRootDataTable };
//# sourceMappingURL=root-table.class.js.map