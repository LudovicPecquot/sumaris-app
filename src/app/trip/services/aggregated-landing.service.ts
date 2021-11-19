import {Injectable, Injector} from '@angular/core';
import {AggregatedLanding, AggregatedLandingUtils} from './model/aggregated-landing.model';
import {
  BaseEntityGraphqlMutations,
  BaseGraphqlService,
  chainPromises,
  EntitiesServiceWatchOptions,
  EntitiesStorage,
  Entity,
  firstNotNilPromise,
  fromDateISOString,
  GraphqlService,
  IEntitiesService,
  isEmptyArray,
  isNil,
  isNotEmptyArray,
  isNotNil,
  LoadResult,
  NetworkService,
} from '@sumaris-net/ngx-components';
import {gql} from '@apollo/client/core';
import {VesselSnapshotFragments} from '@app/referential/services/vessel-snapshot.service';
import {ReferentialFragments} from '@app/referential/services/referential.fragments';
import {EMPTY, Observable} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import {SortDirection} from '@angular/material/sort';
import {DataEntityAsObjectOptions, MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE} from '@app/data/services/model/data-entity.model';
import {environment} from '@environments/environment';
import {MINIFY_OPTIONS} from '@app/core/services/model/referential.model';
import {AggregatedLandingFilter} from '@app/trip/services/filter/aggregated-landing.filter';
import {BaseEntityGraphqlQueries} from '@sumaris-net/ngx-components/src/app/core/services/base-entity-service.class';
import {ErrorCodes} from '@app/data/services/errors';

const VesselActivityFragment = gql`fragment VesselActivityFragment on VesselActivityVO {
  __typename
  date
  rankOrder
  comments
  measurementValues
  metiers {
    ...ReferentialFragment
  }
  observedLocationId
  landingId
  tripId
}
${ReferentialFragments.referential}`;

const AggregatedLandingFragment = gql`fragment AggregatedLandingFragment on AggregatedLandingVO {
  __typename
  id
  observedLocationId
  vesselSnapshot {
    ...LightVesselSnapshotFragment
  }
  vesselActivities {
    ...VesselActivityFragment
  }
}
${VesselSnapshotFragments.lightVesselSnapshot}
${ReferentialFragments.referential}
${VesselActivityFragment}`;

const AggregatedLandingQueries: BaseEntityGraphqlQueries = {
  loadAll: gql`
    query AggregatedLandings($filter: AggregatedLandingFilterVOInput){
      data: aggregatedLandings(filter: $filter){
        ...AggregatedLandingFragment
      }
    }
    ${AggregatedLandingFragment}
  `
};

const AggregatedLandingMutations: BaseEntityGraphqlMutations = {
  saveAll: gql`
    mutation SaveAggregatedLandings($aggregatedLandings:[AggregatedLandingVOInput], $filter: AggregatedLandingFilterVOInput){
      saveAggregatedLandings(aggregatedLandings: $aggregatedLandings, filter: $filter){
        ...AggregatedLandingFragment
      }
    }
    ${AggregatedLandingFragment}
  `,
  deleteAll: gql`
    mutation DeleteAggregatedLandings($filter: AggregatedLandingFilterVOInput, $vesselSnapshotIds: [Int]){
      deleteAggregatedLandings(filter: $filter, vesselSnapshotIds: $vesselSnapshotIds)
    }
  `
};

@Injectable({providedIn: 'root'})
export class AggregatedLandingService
  extends BaseGraphqlService<AggregatedLanding, AggregatedLandingFilter>
  implements IEntitiesService<AggregatedLanding, AggregatedLandingFilter> {

  protected loading = false;
  private _lastFilter;

  constructor(
    injector: Injector,
    protected network: NetworkService,
    protected entities: EntitiesStorage
  ) {
    super(injector.get(GraphqlService), environment);

    // FOR DEV ONLY
    this._debug = !environment.production;
  }

  async loadAllByObservedLocation(filter?: (AggregatedLandingFilter | any) & { observedLocationId: number; }, opts?: EntitiesServiceWatchOptions): Promise<LoadResult<AggregatedLanding>> {
    return firstNotNilPromise(this.watchAllByObservedLocation(filter, opts));
  }

  watchAllByObservedLocation(filter?: (AggregatedLandingFilter | any) & { observedLocationId: number; }, opts?: EntitiesServiceWatchOptions): Observable<LoadResult<AggregatedLanding>> {
    return this.watchAll(0, -1, null, null, filter, opts);
  }


  watchAll(offset: number,
           size: number,
           sortBy?: string,
           sortDirection?: SortDirection,
           dataFilter?: Partial<AggregatedLandingFilter>,
           opts?: EntitiesServiceWatchOptions): Observable<LoadResult<AggregatedLanding>> {

    // Update previous filter
    dataFilter = this.asFilter(dataFilter);
    this._lastFilter = dataFilter.clone();

    if (!dataFilter || dataFilter.isEmpty()) {
      console.warn('[aggregated-landing-service] Trying to load landing without \'filter\'. Skipping.');
      return EMPTY;
    }

    // Load offline
    const offline = this.network.offline || (dataFilter && dataFilter.synchronizationStatus && dataFilter.synchronizationStatus !== 'SYNC') || false;
    if (offline) {
      return this.watchAllLocally(offset, size, sortBy, sortDirection, dataFilter, opts);
    }

    // TODO: manage offset/size/sort ?
    const variables: any = {};

    let now = this._debug && Date.now();
    if (this._debug) console.debug('[aggregated-landing-service] Loading aggregated landings... using options:', variables);

    return this.mutableWatchQuery<LoadResult<AggregatedLanding>>({
        queryName: 'LoadAll',
        query: AggregatedLandingQueries.loadAll,
        arrayFieldName: 'data',
        insertFilterFn: dataFilter && dataFilter.asFilterFn(),
        variables: {
          ...variables,
          filter: dataFilter && dataFilter.asPodObject()
        },
        error: {code: ErrorCodes.LOAD_ENTITIES_ERROR, message: 'ERROR.LOAD_ENTITIES_ERROR'},
        fetchPolicy: opts && opts.fetchPolicy || (this.network.offline ? 'cache-only' : 'no-cache')
      })
      .pipe(
        filter(() => !this.loading),
        filter(isNotNil),
        map(res => {
          let data = (res && res.data || []).map(AggregatedLanding.fromObject);

          // Sort locally
          data = AggregatedLandingUtils.sort(data, sortBy, sortDirection);

          if (now) {
            console.debug(`[aggregated-landing-service] Loaded {${data.length || 0}} landings in ${Date.now() - now}ms`, data);
            now = undefined;
          }
          return {
            data,
            total: undefined
          };
        })
      );
  }



  /**
   * Load many local landings
   */
  watchAllLocally(offset: number,
                  size: number,
                  sortBy?: string,
                  sortDirection?: SortDirection,
                  dataFilter?: Partial<AggregatedLandingFilter>,
                  opts?: EntitiesServiceWatchOptions): Observable<LoadResult<AggregatedLanding>> {

    dataFilter = AggregatedLandingFilter.fromObject(dataFilter);

    if (!dataFilter || dataFilter.isEmpty()) {
      console.warn('[aggregated-landing-service] Trying to watch aggregated landings without \'filter\': skipping.');
      return EMPTY;
    }
    if (isNotNil(dataFilter.observedLocationId) && dataFilter.observedLocationId >= 0) throw new Error('Invalid \'filter.observedLocationId\': must be a local ID (id<0)!');

    const variables = {
      offset: offset || 0,
      size: size >= 0 ? size : 20,
      sortBy: (sortBy !== 'id' && sortBy) || (opts && opts.trash ? 'updateDate' : 'dateTime'),
      sortDirection: sortDirection || (opts && opts.trash ? 'desc' : 'asc'),
      trash: opts && opts.trash || false,
      filter: dataFilter.asFilterFn()
    };

    if (this._debug) console.debug(`[aggregated-landing-service] Loading aggregated locally... using options:`, variables);
    return this.entities.watchAll<AggregatedLanding>(AggregatedLanding.TYPENAME, variables, {fullLoad: opts && opts.fullLoad})
      .pipe(map(({data, total}) => {
        const entities = (!opts || opts.toEntity !== false)
          ? (data || []).map(AggregatedLanding.fromObject)
          : (data || []) as AggregatedLanding[];
        total = total || entities.length;

        return {
          data: entities,
          total
        };
      }));
  }

  async saveAll(entities: AggregatedLanding[], options?: any): Promise<AggregatedLanding[]> {
    if (!entities) return entities;

    const localEntities = entities.filter(entity => entity
      && (entity.id < 0 || (entity.synchronizationStatus && entity.synchronizationStatus !== 'SYNC'))
    );
    if (isNotEmptyArray(localEntities)) {
      return this.saveAllLocally(localEntities, options);
    }

    const json = entities.map(t => this.asObject(t));

    const now = Date.now();
    if (this._debug) console.debug('[aggregated-landing-service] Saving aggregated landings...', json);

    await this.graphql.mutate<{ saveAggregatedLandings: AggregatedLanding[] }>({
      mutation: AggregatedLandingMutations.saveAll,
      variables: {
        aggregatedLandings: json,
        filter: this._lastFilter && this._lastFilter.asPodObject()
      },
      error: {code: ErrorCodes.SAVE_ENTITIES_ERROR, message: 'ERROR.SAVE_ENTITIES_ERROR'},
      update: (proxy, {data}) => {

        const res = data?.saveAggregatedLandings || [];
        if (this._debug) console.debug(`[aggregated-landing-service] Aggregated landings saved remotely in ${Date.now() - now}ms`, res);

        entities.forEach(aggLanding => {
          const savedAggLanding = res.find(value => value.vesselSnapshot.id === aggLanding.vesselSnapshot.id);
          if (savedAggLanding) {

            aggLanding.observedLocationId = savedAggLanding.observedLocationId;

            aggLanding.vesselActivities.forEach(vesselActivity=>{
              const savedVesselActivity = savedAggLanding.vesselActivities.find(value => fromDateISOString(value.date).isSame(fromDateISOString(vesselActivity.date)));
              if (savedVesselActivity) {
                vesselActivity.observedLocationId = savedVesselActivity.observedLocationId;
                vesselActivity.landingId = savedVesselActivity.landingId;
                if (vesselActivity.tripId !== savedVesselActivity.tripId) {
                  console.warn(`!!!!!!!!!!!!!! ${vesselActivity.tripId} !== ${savedVesselActivity.tripId}`)
                }
                vesselActivity.tripId = savedVesselActivity.tripId;
              }
            })

          }
        })
      }
    });
    return entities;
  }

  async saveAllLocally(entities: AggregatedLanding[], opts?: any): Promise<AggregatedLanding[]> {
    if (!entities) return entities;

    if (this._debug) console.debug(`[aggregated-landing-service] Saving ${entities.length} aggregated landings locally...`);
    const jobsFactories = (entities || []).map(entity => () => this.saveLocally(entity, {...opts}));
    return chainPromises<AggregatedLanding>(jobsFactories);
  }

  async deleteAll(entities: AggregatedLanding[], options?: any): Promise<any> {

    // Get local entity ids, then delete id
    const localIds = entities && entities
      .map(t => t.id)
      .filter(id => id < 0);
    if (isNotEmptyArray(localIds)) {
      if (this._debug) console.debug('[aggregated-landing-service] Deleting aggregated landings locally... ids:', localIds);
      await this.entities.deleteMany<AggregatedLanding>(localIds, {entityName: AggregatedLanding.TYPENAME});
    }

    const ids = entities && entities
      .filter(entity => entity.id === undefined && !!entity.vesselSnapshot.id);
    if (isEmptyArray(ids)) return; // stop, if nothing else to do

    const now = Date.now();
    if (this._debug) console.debug('[aggregated-landing-service] Deleting aggregated landings... ids:', ids);

    await this.graphql.mutate<any>({
      mutation: AggregatedLandingMutations.deleteAll,
      variables: {
        filter: this._lastFilter && this._lastFilter.asPodObject(),
        vesselSnapshotIds: entities.map(value => value.vesselSnapshot.id)
      },
      update: (proxy) => {

        // Remove from cache
        this.removeFromMutableCachedQueriesByIds(proxy, {queryName: 'LoadAll', ids});

        if (this._debug) console.debug(`[aggregated-landing-service] Aggregated Landings deleted in ${Date.now() - now}ms`);
      }
    });

  }


  async synchronize(entity: AggregatedLanding, opts?: any): Promise<AggregatedLanding> {
    opts = {
      enableOptimisticResponse: false, // Optimistic response not need
      ...opts
    };

    const localId = entity?.id;
    if (isNil(localId) || localId >= 0) throw new Error('Entity must be a local entity');
    if (this.network.offline) throw new Error('Could not synchronize if network if offline');

    // Clone (to keep original entity unchanged)
    entity = entity instanceof Entity ? entity.clone() : entity;
    entity.synchronizationStatus = 'SYNC';
    entity.id = undefined;


    try {

      // entity = await this.save(entity, opts);

      // Check return entity has a valid id
      if (isNil(entity.id) || entity.id < 0) {
        throw {code: ErrorCodes.SYNCHRONIZE_ENTITY_ERROR};
      }

    } catch (err) {
      throw {
        ...err,
        code: ErrorCodes.SYNCHRONIZE_ENTITY_ERROR,
        message: 'ERROR.SYNCHRONIZE_ENTITY_ERROR',
        context: entity.asObject(MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE)
      };
    }

    try {
      if (this._debug) console.debug(`[aggregated-landing-service] Deleting aggregated landing {${entity.id}} from local storage`);
      await this.entities.deleteById(localId, {entityName: AggregatedLanding.TYPENAME});

    } catch (err) {
      console.error(`[aggregated-landing-service] Failed to locally delete aggregated landing {${entity.id}}`, err);
      // Continue
    }
    return entity;
  }

  asFilter(filter: Partial<AggregatedLandingFilter>): AggregatedLandingFilter {
    return AggregatedLandingFilter.fromObject(filter);
  }

  protected asObject(entity: AggregatedLanding, options?: DataEntityAsObjectOptions) {
    options = {...MINIFY_OPTIONS, ...options};
    const copy: any = entity.asObject(options);

    if (options.minify && !options.keepEntityName && !options.keepTypename) {
      // Clean vessel features object, before saving
      copy.vesselSnapshot = {id: entity.vesselSnapshot && entity.vesselSnapshot.id};

      // Keep id only, on activity.metier
      (copy.vesselActivities || []).forEach(activity => activity.metiers = (activity.metiers || []).map(metier => ({id: metier.id})));
    }

    return copy;
  }

  /**
   * Save into the local storage
   *
   * @param entity
   * @param opts
   */
  async saveLocally(entity: AggregatedLanding, opts?: any): Promise<AggregatedLanding> {
    if (entity.observedLocationId >= 0) throw new Error('Must be a local entity');

    // Fill default properties (as recorder department and person)
    // this.fillDefaultProperties(entity, opts);

    // Make sure to fill id, with local ids
    await this.fillOfflineDefaultProperties(entity);

    const json = this.asObject(entity, MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE);
    if (this._debug) console.debug('[aggregated-landing-service] [offline] Saving aggregated landing locally...', json);

    // Save response locally
    await this.entities.save(json);

    return entity;
  }

  protected async fillOfflineDefaultProperties(entity: AggregatedLanding) {
    const isNew = isNil(entity.id);

    // If new, generate a local id
    if (isNew) {
      entity.id = await this.entities.nextValue(entity);
    }

    // Fill default synchronization status
    entity.synchronizationStatus = entity.synchronizationStatus || 'DIRTY';

    // Fill all sample ids
    // const samples = entity.samples && EntityUtils.listOfTreeToArray(entity.samples) || [];
    // await EntityUtils.fillLocalIds(samples, (_, count) => this.entities.nextValues(Sample.TYPENAME, count));
  }

}
