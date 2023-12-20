import { __awaiter, __decorate, __metadata, __param } from "tslib";
import { Inject, Injectable, Injector, Optional } from '@angular/core';
import { gql } from '@apollo/client/core';
import { combineLatest, firstValueFrom } from 'rxjs';
import { QualityFlagIds } from '@app/referential/services/model/model.enum';
import { APP_JOB_PROGRESSION_SERVICE, Entity, EntityUtils, isEmptyArray, isNil, isNotEmptyArray, isNotNil, JobProgression, mergeLoadResult, MINIFY_ENTITY_FOR_LOCAL_STORAGE, Person, StatusIds, } from '@sumaris-net/ngx-components';
import { map } from 'rxjs/operators';
import { ReferentialFragments } from '@app/referential/services/referential.fragments';
import { VesselFeatureQueries, VesselFeaturesFragments, VesselFeaturesService } from './vessel-features.service';
import { VesselRegistrationFragments, VesselRegistrationService, VesselRegistrationsQueries } from './vessel-registration.service';
import { Vessel } from './model/vessel.model';
import { VesselSnapshot } from '@app/referential/services/model/vessel-snapshot.model';
import { RootDataEntityUtils } from '@app/data/services/model/root-data-entity.model';
import { RootDataSynchroService } from '@app/data/services/root-data-synchro-service.class';
import { VESSEL_FEATURE_NAME } from './config/vessel.config';
import { VesselFilter } from './filter/vessel.filter';
import { environment } from '@environments/environment';
import { VesselSnapshotFilter } from '@app/referential/services/filter/vessel.filter';
import { DataErrorCodes } from '@app/data/services/errors';
import { MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE } from '@app/data/services/model/data-entity.model';
import { LandingService } from '@app/trip/landing/landing.service';
import { TripService } from '@app/trip/trip/trip.service';
import { OperationService } from '@app/trip/operation/operation.service';
import { MINIFY_OPTIONS } from '@app/core/services/model/referential.utils';
import { VesselErrorCodes } from '@app/vessel/services/errors';
import { JobFragments } from '@app/social/job/job.service';
import { Job } from '@app/social/job/job.model';
import { TranslateService } from '@ngx-translate/core';
export const VesselFragments = {
    lightVessel: gql `
    fragment VesselFragment on VesselVO {
      id
      comments
      statusId
      creationDate
      controlDate
      validationDate
      qualificationDate
      qualificationComments
      updateDate
      comments
      program {
        id
        label
      }
      vesselType {
        ...LightReferentialFragment
      }
      vesselFeatures {
        ...VesselFeaturesFragment
      }
      vesselRegistrationPeriod {
        ...VesselRegistrationPeriodFragment
      }
      recorderDepartment {
        ...LightDepartmentFragment
      }
      recorderPerson {
        ...LightPersonFragment
      }
    }
  `,
    vessel: gql `
    fragment VesselFragment on VesselVO {
      id
      comments
      statusId
      creationDate
      controlDate
      validationDate
      qualificationDate
      qualificationComments
      updateDate
      comments
      program {
        id
        label
      }
      vesselType {
        ...LightReferentialFragment
      }
      vesselFeatures {
        ...VesselFeaturesFragment
      }
      vesselRegistrationPeriod {
        ...VesselRegistrationPeriodFragment
      }
      recorderDepartment {
        ...LightDepartmentFragment
      }
      recorderPerson {
        ...LightPersonFragment
      }
    }
  `,
};
const VesselQueries = {
    load: gql `query Vessel($id: Int!) {
        data: vessel(id: $id) {
            ...VesselFragment
        }
    }
    ${VesselFragments.vessel}
    ${VesselFeaturesFragments.vesselFeatures}
    ${VesselRegistrationFragments.registration}
    ${ReferentialFragments.location}
    ${ReferentialFragments.lightDepartment}
    ${ReferentialFragments.lightPerson}
    ${ReferentialFragments.lightReferential}`,
    loadAllWithTotal: gql `query Vessels($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: VesselFilterVOInput){
        data: vessels(offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection, filter: $filter){
            ...VesselFragment
        }
        total: vesselsCount(filter: $filter)
    }
    ${VesselFragments.vessel}
    ${VesselFeaturesFragments.vesselFeatures}
    ${VesselRegistrationFragments.registration}
    ${ReferentialFragments.location}
    ${ReferentialFragments.lightDepartment}
    ${ReferentialFragments.lightPerson}
    ${ReferentialFragments.lightReferential}`,
    loadAll: gql `query Vessels($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: VesselFilterVOInput){
        data: vessels(offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection, filter: $filter){
            ...VesselFragment
        }
    }
    ${VesselFragments.vessel}
    ${VesselFeaturesFragments.vesselFeatures}
    ${VesselRegistrationFragments.registration}
    ${ReferentialFragments.location}
    ${ReferentialFragments.lightDepartment}
    ${ReferentialFragments.lightPerson}
    ${ReferentialFragments.lightReferential}`,
    importSiopFile: gql `query ImportVesselSiopFile($fileName: String) {
      data: importSiopVessels(fileName: $fileName) {
        ...LightJobFragment
      }
    }
    ${JobFragments.light}`
};
const VesselMutations = {
    saveAll: gql `mutation SaveVessels($data:[VesselVOInput]!){
        data: saveVessels(vessels: $data){
            ...VesselFragment
        }
    }
    ${VesselFragments.vessel}
    ${VesselFeaturesFragments.vesselFeatures}
    ${VesselRegistrationFragments.registration}
    ${ReferentialFragments.location}
    ${ReferentialFragments.lightDepartment}
    ${ReferentialFragments.lightPerson}
    ${ReferentialFragments.lightReferential}`,
    deleteAll: gql `mutation DeleteVessels($ids:[Int]!){
        deleteVessels(ids: $ids)
    }`,
    replaceAll: gql `mutation ReplaceVessels($temporaryVesselIds: [Int]!, $validVesselId: Int!) {
    replaceVessels(temporaryVesselIds: $temporaryVesselIds, validVesselId: $validVesselId)
  }`
};
let VesselService = class VesselService extends RootDataSynchroService {
    constructor(injector, vesselFeatureService, vesselRegistrationService, landingService, tripService, operationService, translate, jobProgressionService) {
        super(injector, Vessel, VesselFilter, {
            queries: VesselQueries,
            mutations: VesselMutations,
            equalsFn: (e1, e2) => this.vesselEquals(e1, e2)
        });
        this.vesselFeatureService = vesselFeatureService;
        this.vesselRegistrationService = vesselRegistrationService;
        this.landingService = landingService;
        this.tripService = tripService;
        this.operationService = operationService;
        this.translate = translate;
        this.jobProgressionService = jobProgressionService;
        this._featureName = VESSEL_FEATURE_NAME;
        this._debug = !environment.production;
        this._logPrefix = '[vessel-service]';
    }
    vesselEquals(e1, e2) {
        var _a, _b, _c, _d;
        return e1 && e2 && (
        // check id equals
        e1.id === e2.id ||
            // or exteriorMarking and registrationCode equals
            (((_a = e1.vesselFeatures) === null || _a === void 0 ? void 0 : _a.exteriorMarking) === ((_b = e2.vesselFeatures) === null || _b === void 0 ? void 0 : _b.exteriorMarking) &&
                ((_c = e1.vesselRegistrationPeriod) === null || _c === void 0 ? void 0 : _c.registrationCode) === ((_d = e2.vesselRegistrationPeriod) === null || _d === void 0 ? void 0 : _d.registrationCode)));
    }
    load(id, opts) {
        const _super = Object.create(null, {
            load: { get: () => super.load }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // Load using vessel snapshot, if offline and has offline feature
            if (this.network.offline && EntityUtils.isRemoteId(id) && (yield this.hasOfflineData())) {
                const data = yield this.entities.load(id, VesselSnapshot.TYPENAME);
                if (!data)
                    throw { code: DataErrorCodes.LOAD_ENTITY_ERROR, message: 'ERROR.LOAD_ENTITY_ERROR' };
                return VesselSnapshot.toVessel(data);
            }
            return _super.load.call(this, id, opts);
        });
    }
    loadAll(offset, size, sortBy, sortDirection, filter, opts) {
        return firstValueFrom(this.watchAll(offset, size, sortBy, sortDirection, filter, opts));
    }
    /**
     * Load many vessels
     *
     * @param offset
     * @param size
     * @param sortBy
     * @param sortDirection
     * @param filter
     * @param opts
     */
    watchAll(offset, size, sortBy, sortDirection, filter, opts) {
        const forceOffline = this.network.offline || (isNotNil(filter.vesselId) && filter.vesselId < 0);
        const offline = forceOffline || (filter.synchronizationStatus && filter.synchronizationStatus !== 'SYNC');
        const online = !forceOffline && (!filter.synchronizationStatus || filter.synchronizationStatus === 'SYNC');
        const offline$ = offline && this.watchAllLocally(offset, size, sortBy, sortDirection, filter, opts);
        const online$ = online && this.watchAllRemotely(offset, size, sortBy, sortDirection, filter, opts);
        // Merge local and remote
        return (offline$ && online$)
            ? combineLatest([offline$, online$])
                .pipe(map(([res1, res2]) => mergeLoadResult(res1, res2)))
            : (offline$ || online$);
    }
    watchAllRemotely(offset, size, sortBy, sortDirection, filter, opts) {
        sortBy = sortBy || 'vesselFeatures.exteriorMarking';
        return super.watchAll(offset, size, sortBy, sortDirection, filter, opts);
    }
    watchAllLocally(offset, size, sortBy, sortDirection, filter, opts) {
        // Adapt filter
        const vesselSnapshotFilter = VesselSnapshotFilter.fromVesselFilter(filter);
        sortBy = (sortBy === null || sortBy === void 0 ? void 0 : sortBy.includes('.')) && sortBy.substring(sortBy.lastIndexOf('.') + 1) || sortBy;
        return this.vesselSnapshotService.watchAllLocally(offset, size, sortBy, sortDirection, vesselSnapshotFilter)
            .pipe(map(({ data, total }) => {
            const entities = (data || []).map(VesselSnapshot.toVessel);
            return { data: entities, total };
        }));
    }
    /**
     * Save many vessels
     *
     * @param entities
     * @param opts
     */
    saveAll(entities, opts) {
        const _super = Object.create(null, {
            saveAll: { get: () => super.saveAll }
        });
        return __awaiter(this, void 0, void 0, function* () {
            return _super.saveAll.call(this, entities, Object.assign(Object.assign({}, opts), { update: (proxy, { data }) => {
                    if (isEmptyArray(data && data.data))
                        return; // Skip if empty
                    // update features history FIXME: marche pas
                    if (opts && opts.isNewFeatures) {
                        const lastFeatures = entities[entities.length - 1].vesselFeatures;
                        this.vesselFeatureService.insertIntoMutableCachedQueries(proxy, {
                            query: VesselFeatureQueries.loadAll,
                            data: lastFeatures
                        });
                    }
                    // update registration history FIXME: marche pas
                    if (opts && opts.isNewRegistration) {
                        const lastRegistration = entities[entities.length - 1].vesselRegistrationPeriod;
                        this.vesselRegistrationService.insertIntoMutableCachedQueries(proxy, {
                            query: VesselRegistrationsQueries.loadAll,
                            data: lastRegistration
                        });
                    }
                } }));
        });
    }
    /**
     * Save a vessel
     *
     * @param entity
     * @param opts
     */
    save(entity, opts) {
        const _super = Object.create(null, {
            save: { get: () => super.save }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // prepare previous vessel to save if present
            if (opts && isNotNil(opts.previousVessel)) {
                // update previous features
                if (opts.isNewFeatures) {
                    // set end date = new start date - 1
                    const newStartDate = entity.vesselFeatures.startDate.clone();
                    newStartDate.subtract(1, 'seconds');
                    opts.previousVessel.vesselFeatures.endDate = newStartDate;
                }
                // prepare previous registration period
                else if (opts.isNewRegistration) {
                    // set registration end date = new registration start date - 1
                    const newRegistrationStartDate = entity.vesselRegistrationPeriod.startDate.clone();
                    newRegistrationStartDate.subtract(1, 'seconds');
                    opts.previousVessel.vesselRegistrationPeriod.endDate = newRegistrationStartDate;
                }
                // save both by calling saveAll
                const savedVessels = yield this.saveAll([opts.previousVessel, entity], opts);
                // then return last
                return Promise.resolve(savedVessels.pop());
            }
            // Prepare to save
            this.fillDefaultProperties(entity);
            // Save locally, when offline
            const offline = this.network.offline || EntityUtils.isLocal(entity) || (entity.synchronizationStatus && entity.synchronizationStatus !== 'SYNC');
            if (offline) {
                console.debug(`${this._logPrefix} Saving a vessel locally...`);
                // Make sure to fill id, with local ids
                yield this.fillOfflineDefaultProperties(entity);
                const json = this.asObject(entity, MINIFY_ENTITY_FOR_LOCAL_STORAGE);
                if (this._debug)
                    console.debug(`${this._logPrefix} [offline] Saving vessel locally...`, json);
                // Save vessel locally
                yield this.entities.save(json);
                // Transform to vesselSnapshot, and add to offline storage
                const vesselSnapshot = VesselSnapshot.fromVessel(entity).asObject(MINIFY_ENTITY_FOR_LOCAL_STORAGE);
                yield this.entities.save(vesselSnapshot);
                return entity;
            }
            // Save remotely
            return _super.save.call(this, entity, opts);
        });
    }
    /**
     * Save a vessel
     *
     * @param entity
     * @param opts
     */
    saveLocally(entity, opts) {
        const _super = Object.create(null, {
            save: { get: () => super.save }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // prepare previous vessel to save if present
            if (opts && isNotNil(opts.previousVessel)) {
                // update previous features
                if (opts.isNewFeatures) {
                    // set end date = new start date - 1
                    const newStartDate = entity.vesselFeatures.startDate.clone();
                    newStartDate.subtract(1, 'seconds');
                    opts.previousVessel.vesselFeatures.endDate = newStartDate;
                }
                // prepare previous registration period
                else if (opts.isNewRegistration) {
                    // set registration end date = new registration start date - 1
                    const newRegistrationStartDate = entity.vesselRegistrationPeriod.startDate.clone();
                    newRegistrationStartDate.subtract(1, 'seconds');
                    opts.previousVessel.vesselRegistrationPeriod.endDate = newRegistrationStartDate;
                }
                // save both by calling saveAll
                const savedVessels = yield this.saveAll([opts.previousVessel, entity], opts);
                // then return last
                return Promise.resolve(savedVessels.pop());
            }
            // Prepare to save
            this.fillDefaultProperties(entity);
            // Save locally, when offline
            const offline = this.network.offline || EntityUtils.isLocal(entity);
            if (offline) {
                console.debug(`${this._logPrefix} Saving a vessel locally...`);
                // Make sure to fill id, with local ids
                yield this.fillOfflineDefaultProperties(entity);
                const json = this.asObject(entity, MINIFY_ENTITY_FOR_LOCAL_STORAGE);
                if (this._debug)
                    console.debug(`${this._logPrefix} [offline] Saving vessel locally...`, json);
                // Save vessel locally
                yield this.entities.save(json);
                // Transform to vesselSnapshot, and add to offline storage
                const vesselSnapshot = VesselSnapshot.fromVessel(entity).asObject(MINIFY_ENTITY_FOR_LOCAL_STORAGE);
                yield this.entities.save(vesselSnapshot);
                return entity;
            }
            // Save remotely
            return _super.save.call(this, entity, opts);
        });
    }
    replaceTemporaryVessel(temporaryVesselIds, validVesselId, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.network.offline) {
                console.warn(`${this._logPrefix} Vessel replacement cannot be done offline`);
                return;
            }
            if (temporaryVesselIds.some(EntityUtils.isLocalId)) {
                console.error(`${this._logPrefix} Cannot replace a local temporary vessel`);
                return;
            }
            if (EntityUtils.isLocalId(validVesselId)) {
                console.error(`${this._logPrefix} Cannot replace with local vessel`);
                return;
            }
            const now = new Date();
            yield this.graphql.mutate({
                mutation: VesselMutations.replaceAll,
                refetchQueries: this.getRefetchQueriesForMutation(opts),
                awaitRefetchQueries: opts && opts.awaitRefetchQueries,
                variables: {
                    temporaryVesselIds,
                    validVesselId
                },
                error: { code: VesselErrorCodes.REPLACE_VESSEL_ERROR, message: 'VESSEL.ERROR.REPLACE_ERROR' },
                update: (proxy, res) => {
                    // Remove from cache
                    if (this.watchQueriesUpdatePolicy === 'update-cache') {
                        this.removeFromMutableCachedQueriesByIds(proxy, {
                            queries: this.getLoadQueries(),
                            ids: temporaryVesselIds
                        });
                    }
                    if (opts && opts.update) {
                        opts.update(proxy, res);
                    }
                    if (this._debug)
                        console.debug(this._logPrefix + `Vessel replaced in ${new Date().getTime() - now.getTime()}ms`);
                }
            });
        });
    }
    importFile(fileName, format = 'siop') {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._debug)
                console.debug(this._logPrefix + `Importing vessels from SIOP file '${fileName}' ...`);
            let query;
            let variables;
            switch (format) {
                case 'siop':
                    query = VesselQueries.importSiopFile;
                    variables = { fileName };
                    break;
                default:
                    throw new Error('Unknown vessel file format: ' + format);
            }
            const { data } = yield this.graphql.query({
                query,
                variables,
                error: { code: VesselErrorCodes.SIOP_IMPORT_ERROR, message: 'VESSEL.ERROR.SIOP_IMPORT_ERROR' }
            });
            const job = Job.fromObject(data);
            const message = this.translate.instant('SOCIAL.JOB.STATUS_ENUM.' + (job.status || 'PENDING'));
            const progression = JobProgression.fromObject(Object.assign(Object.assign({}, job), { message }));
            // Start to listen job
            this.jobProgressionService.addJob(job.id, progression);
            return job;
        });
    }
    deleteAllLocally(entities, opts) {
        const _super = Object.create(null, {
            deleteAllLocally: { get: () => super.deleteAllLocally }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // Delete the vessel
            yield _super.deleteAllLocally.call(this, entities, opts);
            // Delete the associated vessel snapshot
            const snapshots = entities.filter(RootDataEntityUtils.isLocal).map(e => e.id);
            if (isEmptyArray(snapshots))
                return; // Skip
            yield this.entities.deleteMany(snapshots, { entityName: VesselSnapshot.TYPENAME });
        });
    }
    synchronize(entity, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            console.info(`${this._logPrefix} Synchronizing vessel {${entity.id}}...`);
            opts = Object.assign({ isNewFeatures: true, isNewRegistration: true }, opts);
            const localId = entity === null || entity === void 0 ? void 0 : entity.id;
            if (isNil(localId) || localId >= 0)
                throw new Error('Entity must be a local entity');
            if (this.network.offline)
                throw new Error('Could not synchronize if network if offline');
            // Clone (to keep original entity unchanged)
            entity = entity instanceof Entity ? entity.clone() : entity;
            entity.synchronizationStatus = 'SYNC';
            entity.id = undefined;
            entity.vesselFeatures.vesselId = undefined;
            entity.vesselRegistrationPeriod.vesselId = undefined;
            try {
                entity = yield this.save(entity, opts);
                // Check return entity has a valid id
                if (isNil(entity.id) || entity.id < 0) {
                    throw { code: DataErrorCodes.SYNCHRONIZE_ENTITY_ERROR };
                }
            }
            catch (err) {
                throw Object.assign(Object.assign({}, err), { code: DataErrorCodes.SYNCHRONIZE_ENTITY_ERROR, message: 'ERROR.SYNCHRONIZE_ENTITY_ERROR', context: entity.asObject(MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE) });
            }
            if (this._debug)
                console.debug(`${this._logPrefix} Adding new VesselSnapshot {${entity.id}} into the local storage`);
            const vesselSnapshot = VesselSnapshot.fromVessel(entity);
            yield this.vesselSnapshotService.saveLocally(vesselSnapshot);
            // Replace local vessel, in data
            yield this.replaceLocalVessel(localId, vesselSnapshot);
            // Delete local vessel (wan failed)
            try {
                if (this._debug)
                    console.debug(`${this._logPrefix} Deleting vessel snapshot {${localId}} from local storage`);
                yield this.vesselSnapshotService.deleteLocally({ vesselId: localId });
                if (this._debug)
                    console.debug(`${this._logPrefix} Deleting vessel {${localId}} from local storage`);
                yield this.entities.deleteById(localId, { entityName: Vessel.TYPENAME });
            }
            catch (err) {
                console.error(`${this._logPrefix} Failed to locally delete vessel {${entity.id}}`, err);
                // Continue
            }
            return entity;
        });
    }
    control(entity, opts) {
        return undefined; // Not implemented
    }
    terminate(entity) {
        return __awaiter(this, void 0, void 0, function* () {
            return entity; // Not implemented
        });
    }
    /* -- protected methods -- */
    asObject(vessel, opts) {
        return vessel.asObject(Object.assign(Object.assign({}, MINIFY_OPTIONS), opts));
    }
    fillDefaultProperties(entity) {
        const person = this.accountService.account;
        // Recorder department
        if (person && person.department && (!entity.recorderDepartment || entity.recorderDepartment.id !== person.department.id)) {
            if (!entity.recorderDepartment) {
                entity.recorderDepartment = person.department;
            }
            else {
                // Update the recorder department
                entity.recorderDepartment.id = person.department.id;
            }
            if (entity.vesselFeatures) {
                if (!entity.vesselFeatures.recorderDepartment) {
                    entity.vesselFeatures.recorderDepartment = person.department;
                }
                else {
                    // Update the VF recorder department
                    entity.vesselFeatures.recorderDepartment.id = person.department.id;
                }
            }
        }
        // Recorder person
        if (person && (!entity.recorderPerson || entity.recorderPerson.id !== person.id)) {
            if (!entity.recorderPerson) {
                entity.recorderPerson = new Person();
            }
            entity.recorderPerson.id = person.id;
            if (entity.vesselFeatures) {
                if (!entity.vesselFeatures.recorderPerson) {
                    entity.vesselFeatures.recorderPerson = new Person();
                }
                entity.vesselFeatures.recorderPerson.id = person.id;
            }
        }
        // Quality flag (set default)
        if (entity.vesselFeatures && isNil(entity.vesselFeatures.qualityFlagId)) {
            entity.vesselFeatures.qualityFlagId = QualityFlagIds.NOT_QUALIFIED;
        }
    }
    fillOfflineDefaultProperties(entity) {
        return __awaiter(this, void 0, void 0, function* () {
            const isNew = isNil(entity.id);
            // If new, generate a local id
            if (isNew) {
                entity.id = yield this.entities.nextValue(entity);
            }
            // Force status as temporary
            entity.statusId = StatusIds.TEMPORARY;
        });
    }
    copyIdAndUpdateDate(source, target) {
        EntityUtils.copyIdAndUpdateDate(source, target);
        if (source) {
            EntityUtils.copyIdAndUpdateDate(source.vesselFeatures, target.vesselFeatures);
            EntityUtils.copyIdAndUpdateDate(source.vesselRegistrationPeriod, target.vesselRegistrationPeriod);
        }
    }
    replaceLocalVessel(localVesselId, remoteVesselSnapshot) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            // Replace in landings
            if (this._debug)
                console.debug(`${this._logPrefix} Update local landings: replace vessel #${localVesselId} by #${remoteVesselSnapshot.id}`);
            const landings = (_a = (yield this.landingService.loadAllLocally(0, 999, null, null, { vesselId: localVesselId }, { withTotal: false, fullLoad: true }))) === null || _a === void 0 ? void 0 : _a.data;
            if (isNotEmptyArray(landings)) {
                landings.forEach(l => l.vesselSnapshot = remoteVesselSnapshot);
                yield this.landingService.saveAllLocally(landings);
            }
            // Replace in trips
            if (this._debug)
                console.debug(`${this._logPrefix} Update local trips: replace vessel #${localVesselId} by #${remoteVesselSnapshot.id}`);
            const trips = (_b = (yield this.tripService.loadAllLocally(0, 999, null, null, { vesselId: localVesselId }, { withTotal: false, fullLoad: true }))) === null || _b === void 0 ? void 0 : _b.data;
            if (isNotEmptyArray(trips)) {
                trips.forEach(l => l.vesselSnapshot = remoteVesselSnapshot);
                yield this.tripService.saveAllLocally(trips);
            }
            // Replace in operations
            if (this._debug)
                console.debug(`${this._logPrefix} Update local operations: replace vessel #${localVesselId} by #${remoteVesselSnapshot.id}`);
            const operations = (_c = (yield this.operationService.loadAllLocally(0, 999, null, null, { vesselId: localVesselId }, { withTotal: false, fullLoad: true }))) === null || _c === void 0 ? void 0 : _c.data;
            if (isNotEmptyArray(operations)) {
                operations.forEach(l => l.vesselId = remoteVesselSnapshot.id);
                yield this.operationService.saveAllLocally(operations);
            }
        });
    }
};
VesselService = __decorate([
    Injectable({ providedIn: 'root' }),
    __param(7, Optional()),
    __param(7, Inject(APP_JOB_PROGRESSION_SERVICE)),
    __metadata("design:paramtypes", [Injector,
        VesselFeaturesService,
        VesselRegistrationService,
        LandingService,
        TripService,
        OperationService,
        TranslateService, Object])
], VesselService);
export { VesselService };
//# sourceMappingURL=vessel-service.js.map