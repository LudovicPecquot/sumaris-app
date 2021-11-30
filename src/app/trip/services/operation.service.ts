import {Injectable, Optional} from '@angular/core';
import {FetchPolicy, FetchResult, gql, InternalRefetchQueriesInclude, WatchQueryFetchPolicy} from '@apollo/client/core';
import {BehaviorSubject, combineLatest, EMPTY, from, Observable} from 'rxjs';
import {filter, first, map} from 'rxjs/operators';
import {DataCommonFragments, DataFragments} from './trip.queries';
import {
  AccountService,
  BaseEntityGraphqlMutations,
  BaseEntityGraphqlSubscriptions,
  BaseGraphqlService,
  chainPromises,
  Department,
  EntitiesServiceWatchOptions,
  EntitiesStorage,
  EntitySaveOptions,
  EntityServiceLoadOptions,
  EntityUtils,
  firstNotNilPromise,
  GraphqlService,
  IEntitiesService,
  IEntityService,
  isEmptyArray,
  isNil,
  isNilOrBlank,
  isNotEmptyArray,
  isNotNil,
  JobUtils,
  LoadResult, MINIFY_ENTITY_FOR_LOCAL_STORAGE,
  MutableWatchQueriesUpdatePolicy,
  NetworkService,
  QueryVariables,
  toNumber,
} from '@sumaris-net/ngx-components';
import {Measurement} from './model/measurement.model';
import {DataEntity, SAVE_AS_OBJECT_OPTIONS, SERIALIZE_FOR_OPTIMISTIC_RESPONSE} from '@app/data/services/model/data-entity.model';
import {MINIFY_OPERATION_FOR_LOCAL_STORAGE, Operation, OperationAsObjectOptions, OperationFromObjectOptions, Trip, VesselPosition} from './model/trip.model';
import {Batch, BatchUtils} from './model/batch.model';
import {Sample} from './model/sample.model';
import {SortDirection} from '@angular/material/sort';
import {ReferentialFragments} from '@app/referential/services/referential.fragments';
import {AcquisitionLevelCodes, QualityFlagIds} from '@app/referential/services/model/model.enum';
import {environment} from '@environments/environment';
import {MINIFY_OPTIONS} from '@app/core/services/model/referential.model';
import {OperationFilter} from '@app/trip/services/filter/operation.filter';
import {DataRootEntityUtils} from '@app/data/services/model/root-data-entity.model';
import {Geolocation} from '@ionic-native/geolocation/ngx';
import {GeolocationOptions} from '@ionic-native/geolocation';
import moment from 'moment';
import {VesselSnapshotFragments} from '@app/referential/services/vessel-snapshot.service';
import {MetierFilter} from '@app/referential/services/filter/metier.filter';
import {Metier} from '@app/referential/services/model/metier.model';
import {MetierService} from '@app/referential/services/metier.service';
import {mergeMap} from 'rxjs/internal/operators';
import {PositionUtils} from '@app/trip/services/position.utils';
import {IPosition} from '@app/trip/services/model/position.model';
import {ErrorCodes} from '@app/data/services/errors';
import {mergeLoadResult} from '@app/shared/functions';


export const OperationFragments = {
  lightOperation: gql`fragment LightOperationFragment on OperationVO {
    id
    startDateTime
    endDateTime
    fishingStartDateTime
    fishingEndDateTime
    rankOrderOnPeriod
    tripId
    comments
    hasCatch
    updateDate
    qualityFlagId
    physicalGearId
    physicalGear {
      id
      rankOrder
      gear {
        ...ReferentialFragment
      }
    }
    metier {
      ...MetierFragment
    }
    recorderDepartment {
      ...LightDepartmentFragment
    }
    positions {
      ...PositionFragment
    }
    parentOperationId
    childOperationId
  }
  ${ReferentialFragments.lightDepartment}
  ${ReferentialFragments.metier}
  ${ReferentialFragments.referential}
  ${DataCommonFragments.position}`,

  operation: gql`fragment OperationFragment on OperationVO {
    id
    startDateTime
    endDateTime
    fishingStartDateTime
    fishingEndDateTime
    rankOrderOnPeriod
    qualityFlagId
    physicalGearId
    physicalGear {
      id
      rankOrder
      gear {
        ...ReferentialFragment
      }
    }
    tripId
    comments
    hasCatch
    updateDate
    metier {
      ...MetierFragment
    }
    recorderDepartment {
      ...LightDepartmentFragment
    }
    positions {
      ...PositionFragment
    }
    measurements {
      ...MeasurementFragment
    }
    gearMeasurements {
      ...MeasurementFragment
    }
    samples {
      ...SampleFragment
    }
    batches {
      ...BatchFragment
    }
    fishingAreas {
      ...FishingAreaFragment
    }
    parentOperationId
    childOperationId
  }
  ${ReferentialFragments.lightDepartment}
  ${ReferentialFragments.metier}
  ${ReferentialFragments.referential}
  ${DataCommonFragments.position}
  ${DataCommonFragments.measurement}
  ${DataFragments.sample}
  ${DataFragments.batch}
  ${DataFragments.fishingArea}`

};


export const OperationQueries = {
  // Load many operations (with total)
  loadAllWithTotal: gql`query Operations($filter: OperationFilterVOInput!, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String){
    data: operations(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...LightOperationFragment
    }
    total: operationsCount(filter: $filter)
  }
  ${OperationFragments.lightOperation}`,

  loadAllWithTripWithTotal: gql`query Operations($filter: OperationFilterVOInput!, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String){
    data: operations(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...LightOperationFragment
      trip {
           id
        program {
          id
          label
        }
        departureDateTime
        returnDateTime
        creationDate
        updateDate
        controlDate
        validationDate
        qualificationDate
        qualityFlagId
        comments
        departureLocation {
          ...LocationFragment
        }
        returnLocation {
          ...LocationFragment
        }
        vesselSnapshot {
          ...LightVesselSnapshotFragment
        }
        recorderDepartment {
          ...LightDepartmentFragment
        }
        recorderPerson {
          ...LightPersonFragment
        }
        observers {
          ...LightPersonFragment
        }
      }
    }
    total: operationsCount(filter: $filter)
  }
  ${OperationFragments.lightOperation}
  ${DataCommonFragments.location}
  ${DataCommonFragments.lightDepartment}
  ${DataCommonFragments.lightPerson}
  ${VesselSnapshotFragments.lightVesselSnapshot}
  ${DataCommonFragments.referential}`,


  // Load many operations
  loadAll: gql`query Operations($filter: OperationFilterVOInput!, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String){
    data: operations(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...LightOperationFragment
    }
  }
  ${OperationFragments.lightOperation}`,

  // Load one
  load: gql`query Operation($id: Int!) {
    data: operation(id: $id) {
      ...OperationFragment
    }
  }
  ${OperationFragments.operation}`,

  // Load one light
  loadLight: gql`query Operation($id: Int!) {
    data: operation(id: $id) {
      ...LightOperationFragment
    }
  }
  ${OperationFragments.lightOperation}`
};

const OperationMutations: BaseEntityGraphqlMutations = {
  // Save many operations
  saveAll: gql`mutation saveOperations($data:[OperationVOInput]!){
    data: saveOperations(operations: $data){
      ...OperationFragment
    }
  }
  ${OperationFragments.operation}`,

  // Delete many operations
  deleteAll: gql`mutation deleteOperations($ids:[Int]!){
    deleteOperations(ids: $ids)
  }`
};

const OperationSubscriptions: BaseEntityGraphqlSubscriptions = {
  listenChanges: gql`subscription updateOperation($id: Int!, $interval: Int){
    data: updateOperation(id: $id, interval: $interval) {
      ...OperationFragment
    }
  }
  ${OperationFragments.operation}`
};

const sortByStartDateFn = (n1: Operation, n2: Operation) => {
  return n1.startDateTime.isSame(n2.startDateTime) ? 0 : (n1.startDateTime.isAfter(n2.startDateTime) ? 1 : -1);
};

const sortByEndDateOrStartDateFn = (n1: Operation, n2: Operation) => {
  const d1 = n1.endDateTime || n1.startDateTime;
  const d2 = n2.endDateTime || n2.startDateTime;
  return d1.isSame(d2) ? 0 : (d1.isAfter(d2) ? 1 : -1);
};

const sortByAscRankOrderOnPeriod = (n1: Operation, n2: Operation) => {
  return n1.rankOrderOnPeriod === n2.rankOrderOnPeriod ? 0 :
    (n1.rankOrderOnPeriod > n2.rankOrderOnPeriod ? 1 : -1);
};

const sortByDescRankOrderOnPeriod = (n1: Operation, n2: Operation) => {
  return n1.rankOrderOnPeriod === n2.rankOrderOnPeriod ? 0 :
    (n1.rankOrderOnPeriod > n2.rankOrderOnPeriod ? -1 : 1);
};

export declare interface OperationSaveOptions extends EntitySaveOptions {
  tripId?: number;
  trip?: Trip;
  computeBatchRankOrder?: boolean;
  computeBatchIndividualCount?: boolean;
  updateLinkedOperation?: boolean;
}

export declare interface OperationMetierFilter {
  searchJoin?: string;
}

export declare interface OperationServiceWatchOptions extends OperationFromObjectOptions, EntitiesServiceWatchOptions {

  computeRankOrder?: boolean;
  fullLoad?: boolean;
  fetchPolicy?: WatchQueryFetchPolicy; // Avoid the use cache-and-network, that exists in WatchFetchPolicy
  mapFn?: (operations: Operation[]) => Operation[] | Promise<Operation[]>;
  sortByDistance?: boolean;
  mutable?: boolean; // should be a mutable query ? true by default
  withOffline?: boolean;
}

export declare interface OperationServiceLoadOptions extends EntityServiceLoadOptions {
  query?: any;
  fullLoad?: boolean;
}

@Injectable({providedIn: 'root'})
export class OperationService extends BaseGraphqlService<Operation, OperationFilter>
  implements IEntitiesService<Operation, OperationFilter, OperationServiceWatchOptions>,
    IEntityService<Operation> {

  protected loading = false;
  protected _watchQueriesUpdatePolicy: MutableWatchQueriesUpdatePolicy;

  constructor(
    protected graphql: GraphqlService,
    protected network: NetworkService,
    protected accountService: AccountService,
    protected metierService: MetierService,
    protected entities: EntitiesStorage,
    @Optional() protected geolocation: Geolocation
  ) {
    super(graphql, environment);

    this._mutableWatchQueriesMaxCount = 3;
    this._watchQueriesUpdatePolicy = 'update-cache';

    // -- For DEV only
    this._debug = !environment.production;
  }

  async loadAll(offset: number,
                size: number,
                sortBy?: string,
                sortDirection?: SortDirection,
                dataFilter?: OperationFilter | any,
                opts?: OperationServiceWatchOptions): Promise<LoadResult<Operation>> {
    return firstNotNilPromise(this.watchAll(offset, size, sortBy, sortDirection, dataFilter, opts));
  }

  loadAllLocally(offset: number,
                 size: number,
                 sortBy?: string,
                 sortDirection?: SortDirection,
                 dataFilter?: OperationFilter | any,
                 opts?: OperationServiceWatchOptions
  ): Promise<LoadResult<Operation>> {
    return firstNotNilPromise(this.watchAllLocally(offset, size, sortBy, sortDirection, dataFilter, opts));
  }

  async loadAllByTrip(filter?: (OperationFilter | any) & { tripId: number; }, opts?: OperationServiceWatchOptions): Promise<LoadResult<Operation>> {
    return firstNotNilPromise(this.watchAllByTrip(filter, opts));
  }

  watchAllByTrip(filter?: (OperationFilter | any) & { tripId: number; }, opts?: OperationServiceWatchOptions): Observable<LoadResult<Operation>> {
    return this.watchAll(0, -1, null, null, filter, opts);
  }

  /**
   * Load many operations
   *
   * @param offset
   * @param size
   * @param sortBy
   * @param sortDirection
   * @param dataFilter
   * @param opts
   */
  watchAll(offset: number,
           size: number,
           sortBy?: string,
           sortDirection?: SortDirection,
           dataFilter?: OperationFilter | any,
           opts?: OperationServiceWatchOptions
  ): Observable<LoadResult<Operation>> {

    const forceOffline = this.network.offline || (dataFilter && dataFilter.tripId < 0);
    const offline = forceOffline || opts?.withOffline || false;
    const online = !forceOffline;

    const options: OperationServiceWatchOptions = {...opts};

    //If we have both online and offline, watch all options has to be apply when all results are merged
    if (offline && online){
      options.mapFn = undefined;
      options.sortByDistance = undefined;
      options.toEntity = undefined;
      options.computeRankOrder = undefined
    }

    const offline$ = offline && this.watchAllLocally(offset, size, sortBy, sortDirection, dataFilter, options);
    const online$ = online && this.watchAllRemotely(offset, size, sortBy, sortDirection, dataFilter, options);

    // Merge local and remote
    if (offline$ && online$) {
      return combineLatest([offline$, online$])
      .pipe(
        map(([res1, res2]) => mergeLoadResult(res1, res2)),
        mergeMap(async ({data, total}) => {
          return await this.applyWatchOptions({data, total}, offset, size,sortBy,sortDirection, dataFilter, opts);
        })
      );
    }
    return offline$ || online$;
  }

  async load(id: number, opts?: OperationServiceLoadOptions): Promise<Operation | null> {
    if (isNil(id)) throw new Error('Missing argument \'id\' ');

    const now = this._debug && Date.now();
    if (this._debug) console.debug(`[operation-service] Loading operation #${id}...`);
    this.loading = true;

    try {
      let json: any;

      // Load locally
      if (id < 0) {
        json = await this.entities.load<Operation>(id, Operation.TYPENAME, opts);
        if (!json) throw {code: ErrorCodes.LOAD_ENTITY_ERROR, message: 'ERROR.LOAD_ENTITY_ERROR'};
      }

      // Load from pod
      else {
        const query = (opts && opts.query) || (opts && opts.fullLoad === false ? OperationQueries.loadLight: OperationQueries.load);
        const res = await this.graphql.query<{ data: Operation }>({
          query,
          variables: {id},
          error: {code: ErrorCodes.LOAD_ENTITY_ERROR, message: 'ERROR.LOAD_ENTITY_ERROR'},
          fetchPolicy: opts && opts.fetchPolicy || undefined
        });
        json = res && res.data;
      }

      // Transform to entity
      const data = (!opts || opts.toEntity !== false)
        ? Operation.fromObject(json)
        : json as Operation;
      if (data && this._debug) console.debug(`[operation-service] Operation #${id} loaded in ${Date.now() - now}ms`, data);
      return data;
    } finally {
      this.loading = false;
    }
  }

  async delete(data: Operation, options?: any): Promise<any> {
    await this.deleteAll([data]);
  }

  public listenChanges(id: number): Observable<Operation> {
    if (isNil(id)) throw new Error('Missing argument \'id\' ');

    if (this._debug) console.debug(`[operation-service] [WS] Listening changes for operation {${id}}...`);

    return this.graphql.subscribe<{ data: Operation }, { id: number, interval: number }>({
      query: OperationSubscriptions.listenChanges,
      variables: {
        id,
        interval: 10
      },
      error: {
        code: ErrorCodes.SUBSCRIBE_ENTITY_ERROR,
        message: 'ERROR.SUBSCRIBE_ENTITY_ERROR'
      }
    })
      .pipe(
        map(data => {
          if (data && data.data) {
            const res = Operation.fromObject(data.data);
            if (this._debug) console.debug(`[operation-service] Operation {${id}} updated on server !`, res);
            return res;
          }
          return null; // deleted ?
        })
      );
  }

  /**
   * Save many operations
   *
   * @param entities
   * @param opts
   */
  async saveAll(entities: Operation[], opts?: OperationSaveOptions): Promise<Operation[]> {
    if (isEmptyArray(entities)) return entities;

    if (this._debug) console.debug(`[operation-service] Saving ${entities.length} operations...`);
    const jobsFactories = (entities || []).map(entity => () => this.save(entity, {...opts}));
    return chainPromises<Operation>(jobsFactories);
  }

  /**
   * Save an operation
   *
   * @param entity
   * @param opts
   */
  async save(entity: Operation, opts?: OperationSaveOptions): Promise<Operation> {

    // If parent is a local entity: force to save locally
    const tripId = toNumber(entity.tripId, opts && (opts.tripId || opts.trip?.id));
    if (tripId < 0) {
      return await this.saveLocally(entity, opts);
    }

    const now = Date.now();

    // Fill default properties (as recorder department and person)
    this.fillDefaultProperties(entity, opts);

    // If new, create a temporary if (for offline mode)
    const isNew = isNil(entity.id);

    // Transform into json
    const json = this.asObject(entity, SAVE_AS_OBJECT_OPTIONS);
    if (this._debug) console.debug('[operation-service] Saving operation remotely...', json);

    await this.graphql.mutate<{ data: Operation[] }>({
      mutation: OperationMutations.saveAll,
      variables: {
        data: [json]
      },
      error: {code: ErrorCodes.SAVE_ENTITIES_ERROR, message: 'ERROR.SAVE_ENTITIES_ERROR'},
      offlineResponse: async (context) => {
        // Make sure to fill id, with local ids
        await this.fillOfflineDefaultProperties(entity);

        // For the query to be tracked (see tracked query link) with a unique serialization key
        context.tracked = (entity.tripId >= 0);
        if (isNotNil(entity.id)) context.serializationKey = `${Operation.TYPENAME}:${entity.id}`;

        return {data: [this.asObject(entity, SERIALIZE_FOR_OPTIMISTIC_RESPONSE)]};
      },
      refetchQueries: this.getRefetchQueriesForMutation(opts),
      awaitRefetchQueries: opts && opts.awaitRefetchQueries,
      update: async (cache, {data}) => {
        const savedEntity = data && data.data && data.data[0];

        // Local entity: save it
        if (savedEntity.id < 0) {
          if (this._debug) console.debug('[operation-service] [offline] Saving operation locally...', savedEntity);

          // Save response locally
          await this.entities.save(savedEntity.asObject(MINIFY_ENTITY_FOR_LOCAL_STORAGE));
        }

        // Update the entity and update GraphQL cache
        else {

          // Remove existing entity from the local storage
          if (entity.id < 0 && savedEntity.updateDate) {
            await this.entities.delete(entity);
          }

          // Copy id and update Date
          this.copyIdAndUpdateDate(savedEntity, entity);

          // Copy gear
          if (savedEntity.metier && !savedEntity.metier.gear) {
            savedEntity.metier.gear = savedEntity.metier.gear || (entity.physicalGear && entity.physicalGear.gear && entity.physicalGear.gear.asObject());
          }

          // Update parent/child operation
          if (opts?.updateLinkedOperation) {
            await this.updateLinkedOperation(entity, opts);
          }

          if (isNew && this._watchQueriesUpdatePolicy === 'update-cache') {
            this.insertIntoMutableCachedQueries(cache, {
              queryNames: this.getLoadQueryNames(),
              data: savedEntity
            });
          }

          if (opts && opts.update) {
            opts.update(cache, {data});
          }

          if (this._debug) console.debug(`[operation-service] Operation saved in ${Date.now() - now}ms`, entity);
        }
      }
    });

    return entity;
  }

  /**
   * Save many operations
   *
   * @param entities
   * @param opts
   */
  async deleteAll(entities: Operation[], opts?: OperationSaveOptions & {
    trash?: boolean; // True by default
  }): Promise<any> {

    // Delete local entities
    const localEntities = entities?.filter(EntityUtils.isLocal);
    if (isNotEmptyArray(localEntities)) {
      return this.deleteAllLocally(localEntities, opts);
    }

    // Get remote ids, then delete remotely
    const remoteEntities = (entities || []).filter(EntityUtils.isRemote);
    if (isNotEmptyArray(remoteEntities)) {

      const ids = remoteEntities.map(e => e.id);
      const now = Date.now();
      if (this._debug) console.debug('[operation-service] Deleting operations... ids:', ids);

      await this.graphql.mutate({
        mutation: OperationMutations.deleteAll,
        variables: {ids},
        refetchQueries: this.getRefetchQueriesForMutation(opts),
        awaitRefetchQueries: opts && opts.awaitRefetchQueries,
        update: (cache, res) => {

          // Remove from cached queries
          if (this._watchQueriesUpdatePolicy === 'update-cache') {
            this.removeFromMutableCachedQueriesByIds(cache, {
              queryNames: this.getLoadQueryNames(),
              ids
            });
          }

          if (opts && opts.update) {
            opts.update(cache, res);
          }

          if (this._debug) console.debug(`[operation-service] Operations deleted in ${Date.now() - now}ms`);
        }
      });
    }
  }

  async deleteAllLocally(entities: Operation[], opts?: OperationSaveOptions & {
    trash?: boolean; // True by default
  }): Promise<any> {

    // Get local ids
    const localIds = entities.map(e => e.id).filter(id => id < 0);
    if (isEmptyArray(localIds)) return; // Skip if empty

    const parentOperationIds = entities.filter(o => o.parentOperation || o.parentOperationId)
      .map(o => o.parentOperation && o.parentOperation.id || o.parentOperationId);
    if (parentOperationIds && parentOperationIds.length > 0) {
      await this.removeChildOperationLocally(parentOperationIds);
    }

    const trash = !opts || opts.trash !== false;
    if (this._debug) console.debug(`[operation-service] Deleting local operations... {trash: ${trash}}`);

    if (trash) {
      await this.entities.moveManyToTrash<Operation>(localIds, {entityName: Operation.TYPENAME});
    } else {
      await this.entities.deleteMany<Operation>(localIds, {entityName: Operation.TYPENAME});
    }
  }

  /**
   * Delete operation locally (from the entity storage)
   *
   * @param filter
   */
  async deleteLocally(filter: Partial<OperationFilter> & { tripId?: number }): Promise<Operation[]> {
    if (!filter || (isNil(filter.tripId) && isNotNil(filter.includedIds) && filter.includedIds.find(id => id < 0) === null)) {
      throw new Error('Missing arguments \'filter.tripId\' or \'filter.includedIds\' with only includedIds > 0');
    }

    const dataFilter = this.asFilter(filter);

    try {
      // Find operations to delete
      const res = await this.entities.loadAll<Operation>(Operation.TYPENAME, {
        filter: dataFilter.asFilterFn()
      }, {fullLoad: false});

      const parentOperationIds = (res && res.data || []).filter(o => o.parentOperation || o.parentOperationId)
        .map(o => o.parentOperation && o.parentOperation.id || o.parentOperationId);
      if (parentOperationIds && parentOperationIds.length > 0) {
        await this.removeChildOperationLocally(parentOperationIds);
      }

      const ids = (res && res.data || []).map(o => o.id);
      if (isEmptyArray(ids)) return undefined; // Skip

      // Apply deletion
      return await this.entities.deleteMany(ids, {entityName: Operation.TYPENAME});
    } catch (err) {
      console.error(`[operation-service] Failed to delete operations ${JSON.stringify(filter)}`, err);
      throw err;
    }
  }

  /**
   * Load many remote operations
   *
   * @param offset
   * @param size
   * @param sortBy
   * @param sortDirection
   * @param dataFilter
   * @param opts
   */
  watchAllRemotely(offset: number,
                   size: number,
                   sortBy?: string,
                   sortDirection?: SortDirection,
                   dataFilter?: OperationFilter | any,
                   opts?: OperationServiceWatchOptions
  ): Observable<LoadResult<Operation>> {

    if (!dataFilter || (isNil(dataFilter.tripId) && isNil(dataFilter.programLabel))) {
      console.warn('[operation-service] Trying to load operations without \'filter.tripId\' or \'filter.programLabel\'. Skipping.');
      return EMPTY;
    }
    if (opts && opts.fullLoad) {
      throw new Error('Loading full operation (opts.fullLoad) is only available for local trips');
    }

    dataFilter = this.asFilter(dataFilter);

    const variables: QueryVariables<OperationFilter> = {
      offset: offset || 0,
      size: size >= 0 ? size : 1000,
      sortBy: (sortBy !== 'id' && sortBy) || (opts && opts.trash ? 'updateDate' : 'endDateTime'),
      sortDirection: sortDirection || (opts && opts.trash ? 'desc' : 'asc'),
      trash: opts && opts.trash || false,
      filter: dataFilter.asPodObject()
    };

    let now = this._debug && Date.now();
    if (this._debug) console.debug('[operation-service] Loading operations... using options:', variables);

    const withTotal = opts && opts.withTotal === true;
    const query = (opts && opts.query) || (withTotal ? OperationQueries.loadAllWithTotal : OperationQueries.loadAll);
    const mutable = !opts || opts.mutable !== false;

    const result$ = mutable
      ? this.mutableWatchQuery<LoadResult<any>>({
        queryName: withTotal ? 'LoadAllWithTotal' : 'LoadAll',
        query,
        arrayFieldName: 'data',
        totalFieldName: withTotal ? 'total' : undefined,
        insertFilterFn: dataFilter.asFilterFn(),
        variables,
        error: {code: ErrorCodes.LOAD_ENTITIES_ERROR, message: 'ERROR.LOAD_ENTITIES_ERROR'},
        fetchPolicy: opts && opts.fetchPolicy || 'cache-and-network'
      })
      : from(this.graphql.query<LoadResult<any>>({
        query,
        variables,
        error: {code: ErrorCodes.LOAD_ENTITIES_ERROR, message: 'ERROR.LOAD_ENTITIES_ERROR'},
        fetchPolicy: (opts && opts.fetchPolicy as FetchPolicy) || 'no-cache'
      }));

    return result$
      .pipe(
        // Skip update during load()
        //tap(() => this.loading && console.debug('SKIP loading OP')),
        filter(() => !this.loading),

        mergeMap(async ({data, total}) => {
          if (now) {
            console.debug(`[operation-service] Loaded ${data.length} operations in ${Date.now() - now}ms`);
            now = undefined;
          }
          return await this.applyWatchOptions({data, total}, offset, size,sortBy,sortDirection, dataFilter, opts);
        }));
  }

  /**
   * Watch many local operations
   */
  watchAllLocally(offset: number,
                  size: number,
                  sortBy?: string,
                  sortDirection?: SortDirection,
                  filter?: Partial<OperationFilter>,
                  opts?: OperationServiceWatchOptions): Observable<LoadResult<Operation>> {


    if (!filter || (isNil(filter.tripId) && isNil(filter.programLabel) && isNil(filter.vesselId))) {
      console.warn('[operation-service] Trying to load operations without \'filter.tripId\' and \'filter.programLabel\' and \'filter.vesselId\'. Skipping.');
      return EMPTY;
    }
    if (filter.tripId >= 0) throw new Error('Invalid \'filter.tripId\': must be a local ID (id<0)!');

    filter = this.asFilter(filter);

    const variables = {
      offset: offset || 0,
      size: size >= 0 ? size : 1000,
      sortBy: (sortBy !== 'id' && sortBy) || (opts && opts.trash ? 'updateDate' : 'endDateTime'),
      sortDirection: sortDirection || (opts && opts.trash ? 'desc' : 'asc'),
      trash: opts && opts.trash || false,
      filter: filter.asFilterFn()
    };

    if (this._debug) console.debug('[operation-service] Loading operations locally... using options:', variables);
    return this.entities.watchAll<Operation>(Operation.TYPENAME, variables, {fullLoad: opts && opts.fullLoad})
      .pipe(mergeMap(async ({data, total}) => {
               return await this.applyWatchOptions({data, total}, offset, size,sortBy,sortDirection, filter, opts);
      }));
  }


  async loadPracticedMetier(offset: number,
                            size: number,
                            sortBy?: string,
                            sortDirection?: SortDirection,
                            filter?: Partial<MetierFilter>,
                            opts?: {
                              [key: string]: any;
                              fetchPolicy?: FetchPolicy;
                              debug?: boolean;
                              toEntity?: boolean;
                              withTotal?: boolean;
                            }): Promise<LoadResult<Metier>> {

    const online = !(this.network.offline && (!opts || opts.fetchPolicy !== 'network-only'));

    if (online) {
      return this.metierService.loadAll(offset, size, sortBy, sortDirection, filter, opts);
    }

    const {data, total} = await firstNotNilPromise(this.watchAllLocally(offset, size, sortBy, sortDirection, {
        vesselId: filter.vesselId,
        startDate: filter.startDate,
        endDate: filter.endDate,
        gearIds: filter.gearIds,
        programLabel: filter.programLabel
      },
      {
        toEntity: false,
        fullLoad: false,
        withTotal: opts?.withTotal
      }
    ));
    const useChildAttributes = filter && (filter.searchJoin === 'TaxonGroup' || filter.searchJoin === 'Gear') ? filter.searchJoin : undefined;
    const entities = (data || []).map(source => source.metier)
      .filter((metier, i, res) => res.findIndex(m => m.id === metier.id) === i)
      .map(metier => Metier.fromObject(metier, {useChildAttributes}));
    return {data: entities, total};
  }

  /**
   * Compute rank order of the given operation. This function will load all operations, to compute the rank order.
   * Please use opts={fetchPolicy: 'cache-first'} when possible
   *
   * @param source
   * @param opts
   */
  computeRankOrder(source: Operation, opts?: { fetchPolicy?: FetchPolicy }): Promise<number> {
    return this.watchRankOrder(source, opts)
      .pipe(first())
      .toPromise();
  }

  /**
   * Compute rank order of the operation
   *
   * @param source
   * @param opts
   */
  watchRankOrder(source: Operation, opts?: OperationServiceWatchOptions): Observable<number> {
    console.debug(`[operation-service] Loading rankOrder of operation #${source.id}...`);
    const tripId = source.tripId;
    return this.watchAllByTrip({tripId}, {fetchPolicy: 'cache-first', ...opts})
      .pipe(
        map(res => {
          const existingOperation = (res && res.data || []).find(o => o.id === source.id);
          return existingOperation ? existingOperation.rankOrderOnPeriod : null;
        })
      );
  }

  asFilter(source: Partial<OperationFilter>): OperationFilter {
    return OperationFilter.fromObject(source);
  }

  /**
   * Get the position by geo loc sensor
   */
  async getCurrentPosition(options?: GeolocationOptions): Promise<{ latitude: number; longitude: number }> {
    return PositionUtils.getCurrentPosition(this.geolocation, {
      maximumAge: 30000/*30s*/,
      timeout: 10000/*10s*/,
      enableHighAccuracy: true,
      ...options
    });
  }

  async computeDistanceInMilesToCurrentPosition(position: IPosition): Promise<number | undefined> {
    const currentPosition = await this.getCurrentPosition();
    return currentPosition && PositionUtils.computeDistanceInMiles(currentPosition, position);
  }

  async executeImport(progression: BehaviorSubject<number>,
                      opts?: {
                        maxProgression?: number;
                        filter: OperationFilter | any;
                      }): Promise<void> {

    const maxProgression = opts && opts.maxProgression || 100;
    const filter = {
      excludeChildOperation: true,
      hasNoChildOperation: true,
      startDate: moment().add(-15, 'day'),
      qualityFlagId: QualityFlagIds.NOT_COMPLETED,
      ...opts.filter
    };

    console.info('[operation-service] Importing operation...');

    const res = await JobUtils.fetchAllPages((offset, size) =>
        this.loadAll(offset, size, 'id', null, filter, {
          debug: false,
          fetchPolicy: 'network-only',
          withTotal: (offset === 0), // Compute total only once
          toEntity: false,
          computeRankOrder: false,
          query: OperationQueries.loadAllWithTripWithTotal
        }),
      progression,
      {maxProgression: maxProgression * 0.9}
    );

    //Remove parent operation stayed saved locally which have a child synchronized
    const resLocal = await this.entities.loadAll<Operation>(Operation.TYPENAME, {}, {fullLoad: false});
    const ids = (resLocal && resLocal.data || []).filter(ope => !res.data.find(o => o.id === ope.id) && ope.id > 0).map(o => o.id);

    if (ids.length > 0) {
      await this.entities.deleteMany<Operation>(ids, {entityName: 'OperationVO', emitEvent: false});
    }

    // Save result locally
    await this.entities.saveAll(res.data, {entityName: 'OperationVO', reset: false});
  }

  /**
   * Save many operations
   *
   * @param entities
   * @param opts
   */
  async saveAllLocally(entities: Operation[], opts?: OperationSaveOptions): Promise<Operation[]> {
    if (isEmptyArray(entities)) return entities;

    if (this._debug) console.debug(`[operation-service] Saving locally ${entities.length} operations...`);
    const jobsFactories = (entities || []).map(entity => () => this.saveLocally(entity, {...opts}));
    return chainPromises<Operation>(jobsFactories);
  }


  /**
   * Save an operation on the local storage
   *
   * @param entity
   * @param opts
   */
  async saveLocally(entity: Operation, opts?: OperationSaveOptions): Promise<Operation> {
    if (entity.tripId >= 0 && entity.qualityFlagId !== QualityFlagIds.NOT_COMPLETED) throw new Error('Must be a local entity');

    // Fill default properties (as recorder department and person)
    this.fillDefaultProperties(entity, opts);

    // Make sure to fill id, with local ids
    await this.fillOfflineDefaultProperties(entity, opts);

    const json = this.asObject(entity, MINIFY_OPERATION_FOR_LOCAL_STORAGE);
    if (this._debug) console.debug('[operation-service] [offline] Saving operation locally...', json);

    // Save response locally
    await this.entities.save(json);

    // Update parent/child operation
    if (opts?.updateLinkedOperation) {
     await this.updateLinkedOperation(entity, opts);
    }

    return entity;
  }

  async updateLinkedOperation(entity: Operation, opts?: OperationSaveOptions) {

    // Update the child operation
    if (isNotNil(entity.childOperationId)) {
      const child = entity.childOperation || await this.load(entity.childOperationId);
      const needUpdateChild = !entity.startDateTime.isSame(child.startDateTime)
        || !entity.fishingStartDateTime.isSame(child.fishingStartDateTime);

      // Update the child operation, if need
      if (needUpdateChild) {
        const fullChild = !entity.childOperation ? child : await this.load(entity.childOperationId);
        console.warn('[operation-service] Updating child operation...');
        fullChild.startDateTime = entity.startDateTime;
        fullChild.fishingStartDateTime = entity.fishingStartDateTime;
        await this.save(fullChild, {...opts, updateLinkedOperation: false});
        if (entity.childOperation) {
          entity.childOperation.startDateTime = fullChild.startDateTime;
          entity.childOperation.fishingStartDateTime = fullChild.fishingStartDateTime;
          entity.childOperation.updateDate = fullChild.updateDate;
        }
      }
    }

    // Update the parent operation (only if parent is a local entity)
    else {
      const parentOperationId = toNumber(entity.parentOperationId, entity.parentOperation?.id);
      if (isNotNil(parentOperationId) && parentOperationId < 0) {
        const parent = entity.parentOperation || await this.load(parentOperationId);
        if (parent.childOperationId !== entity.id) {
          parent.childOperationId = entity.id;
          await this.save(parent, {...opts, updateLinkedOperation: false});
        }
      }
    }

  }

  async sortByDistance(operations: Operation[], sortDirection: string, position: string): Promise<Operation[]> {
    let sortedOperation = new Map<number, Operation>();
    let distance: number;

    for (const o of operations) {
      distance = await this.computeOperationDistance(o, position);
      sortedOperation.set(distance, o);
    }

    sortedOperation = new Map([...sortedOperation.entries()].sort((d1, d2) => {
      if (sortDirection === 'asc') {
        return d1[0] - d2[0];
      } else {
        return d2[0] - d1[0];
      }
    }));

    return Array.from(sortedOperation.values());
  }

  async computeOperationDistance(operation: Operation, position: string): Promise<number> {
    let distance: number;

    if (position === 'startPosition') {
      if (operation.startPosition) {
        distance = await this.computeDistanceInMilesToCurrentPosition(operation.startPosition);
      } else if (operation.positions.length === 2) {
        distance = await this.computeDistanceInMilesToCurrentPosition(operation.positions[0]);
      }
    } else {
      if (operation.endPosition) {
        distance = await this.computeDistanceInMilesToCurrentPosition(operation.endPosition);
      } else if (operation.positions.length === 2) {
        distance = await this.computeDistanceInMilesToCurrentPosition(operation.positions[1]);
      }
    }
    return distance;
  }

  /* -- protected methods -- */

  protected asObject(entity: Operation, opts?: OperationAsObjectOptions): any {
    opts = {...MINIFY_OPTIONS, ...opts};
    const copy: any = entity.asObject(opts);

    // Full json optimisation
    if (opts.minify && !opts.keepTypename && !opts.keepEntityName) {
      // Clean metier object, before saving
      copy.metier = {id: entity.metier && entity.metier.id};
    }
    return copy;
  }

  protected fillDefaultProperties(entity: Operation, options?: Partial<OperationSaveOptions>) {

    const department = this.accountService.department;

    // Fill Recorder department
    this.fillRecorderDepartment(entity, department);
    this.fillRecorderDepartment(entity.startPosition, department);
    this.fillRecorderDepartment(entity.endPosition, department);

    // Measurements
    (entity.measurements || []).forEach(m => this.fillRecorderDepartment(m, department));

    // Fill position dates
    if (entity.startPosition) entity.startPosition.dateTime = entity.fishingStartDateTime || entity.startDateTime;
    if (entity.endPosition) entity.endPosition.dateTime = entity.fishingEndDateTime || entity.endDateTime || entity.startPosition?.dateTime;

    // Fill trip ID
    if (isNil(entity.tripId) && options) {
      entity.tripId = options.tripId;
    }

    // Fill catch batch label
    if (entity.catchBatch) {
      // Fill catch batch label
      if (isNilOrBlank(entity.catchBatch.label)) {
        entity.catchBatch.label = AcquisitionLevelCodes.CATCH_BATCH;
      }

      // Fill sum and rank order
      this.fillBatchTreeDefaults(entity.catchBatch, options);
    }
  }

  protected fillRecorderDepartment(entity: DataEntity<Operation | VesselPosition | Measurement>, department?: Department) {
    if (entity && (!entity.recorderDepartment || !entity.recorderDepartment.id)) {

      department = department || this.accountService.department;

      // Recorder department
      if (department) {
        entity.recorderDepartment = department;
      }
    }
  }

  protected async fillOfflineDefaultProperties(entity: Operation, opts?: OperationSaveOptions) {
    const isNew = isNil(entity.id);

    // If new, generate a local id
    if (isNew) {
      entity.id = await this.entities.nextValue(entity);
    }

    // Fill all sample ids
    const samples = entity.samples && EntityUtils.listOfTreeToArray(entity.samples) || [];
    await EntityUtils.fillLocalIds(samples, (_, count) => this.entities.nextValues(Sample.TYPENAME, count));

    // Fill all batches id
    const batches = entity.catchBatch && EntityUtils.treeToArray(entity.catchBatch) || [];
    if (isNotEmptyArray(batches)) {
      await EntityUtils.fillLocalIds(batches, (_, count) => this.entities.nextValues('BatchVO', count));
      if (this._debug) {
        console.debug('[Operation-service] Preparing batches to be saved locally:');
        BatchUtils.logTree(entity.catchBatch);
      }
    }

    // Load trip, if need
    const trip = opts?.trip || (isNotNil(entity.tripId) && await this.entities.load<Trip>(entity.tripId, Trip.TYPENAME, {fullLoad: false}));

    // Copy some properties from trip - see OperationFilter
    if (trip) {
      entity.tripId = trip.id;
      entity.programLabel = trip.program?.label;
      entity.vesselId = trip.vesselSnapshot?.id;
    }
  }

  protected fillBatchTreeDefaults(catchBatch: Batch, options?: Partial<OperationSaveOptions>) {

    if (!options) return;

    // Compute rankOrder (and label)
    if (options.computeBatchRankOrder) BatchUtils.computeRankOrder(catchBatch);

    // Compute individual count
    if (options.computeBatchIndividualCount) BatchUtils.computeIndividualCount(catchBatch);
  }

  protected copyIdAndUpdateDate(source: Operation | undefined | any, target: Operation) {
    if (!source) return;

    // Update (id and updateDate)
    EntityUtils.copyIdAndUpdateDate(source, target);

    // Update parent operation
    if (target.parentOperation && source.parentOperation) {
      EntityUtils.copyIdAndUpdateDate(source.parentOperation, target.parentOperation);
    }

    // Update child operation
    if (target.childOperation && source.childOperation) {
      EntityUtils.copyIdAndUpdateDate(source.childOperation, target.childOperation);
    }

    // Update positions (id and updateDate)
    if (source.positions && source.positions.length > 0) {
      [target.startPosition, target.endPosition].forEach(targetPos => {
        const savedPos = source.positions.find(srcPos => targetPos.equals(srcPos));
        EntityUtils.copyIdAndUpdateDate(savedPos, targetPos);
      });
    }

    // Update measurements
    if (target.measurements && source.measurements) {
      target.measurements.forEach(targetMeas => {
        const sourceMeas = source.measurements.find(json => targetMeas.equals(json));
        EntityUtils.copyIdAndUpdateDate(sourceMeas, targetMeas);
      });
    }

    // Update samples (recursively)
    if (target.samples && source.samples) {
      this.copyIdAndUpdateDateOnSamples(source.samples, target.samples, source);
    }

    // Update batches (recursively)
    if (target.catchBatch && source.batches) {
      this.copyIdAndUpdateDateOnBatch(source.batches, [target.catchBatch]);
    }
  }

  /**
   * Copy Id and update, in sample tree (recursively)
   *
   * @param sources
   * @param targets
   */
  protected copyIdAndUpdateDateOnSamples(sources: (Sample | any)[], targets: Sample[], savedOperation: Operation) {
    // DEBUG
    //console.debug("[operation-service] Calling copyIdAndUpdateDateOnSamples()");

    // Update samples
    if (sources && targets) {
      targets.forEach(target => {
        // Set the operation id (required by equals function)
        target.operationId = savedOperation.id;

        const source = sources.find(json => target.equals(json));
        EntityUtils.copyIdAndUpdateDate(source, target);
        DataRootEntityUtils.copyControlAndValidationDate(source, target);

        // Copy parent Id (need for link to parent)
        target.parentId = source.parentId;
        target.parent = null;

        // Apply to children
        if (target.children && target.children.length) {
          this.copyIdAndUpdateDateOnSamples(sources, target.children, savedOperation);
        }
      });
    }
  }

  /**
   * Copy Id and update, in batch tree (recursively)
   *
   * @param sources
   * @param targets
   */
  protected copyIdAndUpdateDateOnBatch(sources: (Batch | any)[], targets: Batch[]) {
    if (sources && targets) {
      targets.forEach(target => {
        const index = sources.findIndex(json => target.equals(json));
        if (index !== -1) {
          EntityUtils.copyIdAndUpdateDate(sources[index], target);
          const items = [...sources];
          items.splice(index, 1); // remove from sources list, as it has been found
          sources = items;
        } else {
          console.error('Batch NOT found ! ', target);
        }

        // Loop on children
        if (target.children && target.children.length) {
          this.copyIdAndUpdateDateOnBatch(sources, target.children);
        }
      });
    }
  }

  protected computeRankOrderAndSort(data: Operation[],
                                    offset: number,
                                    total: number,
                                    sortBy: string,
                                    sortDirection: SortDirection,
                                    filter?: OperationFilter) {
    // Compute rankOrderOnPeriod, by tripId
    if (filter && isNotNil(filter.tripId)) {
      const asc = (!sortDirection || sortDirection === 'asc');
      let rankOrderOnPeriod = asc ? 1 + offset : (total - offset - data.length + 1);
      // apply a sorted copy (do NOT change original order), then compute rankOrder
      data.slice().sort(sortByEndDateOrStartDateFn)
        .forEach(o => o.rankOrderOnPeriod = rankOrderOnPeriod++);

      // sort by rankOrderOnPeriod (received as 'id')
      if (!sortBy || sortBy === 'id' || sortBy === 'endDateTime') {
        data.sort(asc ? sortByAscRankOrderOnPeriod : sortByDescRankOrderOnPeriod);
      }
    }
  }

  protected getRefetchQueriesForMutation(opts?: EntitySaveOptions): ((result: FetchResult<{ data: any; }>) => InternalRefetchQueriesInclude) | InternalRefetchQueriesInclude {
    if (opts && opts.refetchQueries) return opts.refetchQueries;

    // Skip if update policy not used refecth queries
    if (this._watchQueriesUpdatePolicy !== 'refetch-queries') return undefined;

    // Find the refetch queries definition
    return this.findRefetchQueries({queryNames: this.getLoadQueryNames()});
  }

  protected getLoadQueryNames(): string[] {
    return ['LoadAllWithTotal', 'LoadAll'];
  }

  protected async removeChildOperationLocally(parentOperationIds: number[]) {
    const res = await this.entities.loadAll<Operation>(Operation.TYPENAME, {
      filter: (this.asFilter({
        includedIds: parentOperationIds
      }).asFilterFn())
    }, {fullLoad: true});

    const operations = new Array<Operation>();
    (res && res.data || []).forEach(operation => {
      operation.childOperationId = null;
      operation.childOperation = null;
      operations.push(Operation.fromObject(operation));
    });

    return this.saveAllLocally(operations, {});
  }

  protected async applyWatchOptions({data, total}: LoadResult<Operation>,
                                    offset: number,
                                    size: number,
                                    sortBy?: string,
                                    sortDirection?: SortDirection,
                                    filter?: Partial<OperationFilter>,
                                    opts?: OperationServiceWatchOptions) : Promise<LoadResult<Operation>>{
    let entities = (!opts || opts.toEntity !== false) ?
      (data || []).map(source => Operation.fromObject(source, opts))
      : (data || []) as Operation[];

    if (opts?.mapFn) {
      entities = await opts.mapFn(entities);
    }

    if (opts?.sortByDistance) {
      entities = await this.sortByDistance(entities, sortDirection, sortBy);
    }

    // Compute rankOrder and re-sort (if enable AND all data fetched)
    if (!opts || opts.computeRankOrder !== false) {
      this.computeRankOrderAndSort(entities, offset, total, sortBy, sortDirection, filter as OperationFilter);
    }

    return {data: entities, total};
  }
}
