import { Injectable, InjectionToken } from '@angular/core';
import {
  AccountService,
  arrayDistinct,
  BaseEntityGraphqlQueries,
  BaseGraphqlService,
  EntitiesServiceWatchOptions,
  EntitiesStorage, EntityUtils,
  firstNotNilPromise,
  GraphqlService,
  IEntitiesService,
  isNil,
  isNotEmptyArray,
  isNotNil,
  JobUtils,
  LoadResult,
  NetworkService
} from '@sumaris-net/ngx-components';
import { Trip } from '../services/model/trip.model';
import { environment } from '@environments/environment';
import { BehaviorSubject, combineLatest, EMPTY, Observable } from 'rxjs';
import { filter, first, map, throttleTime } from 'rxjs/operators';
import { gql, WatchQueryFetchPolicy } from '@apollo/client/core';
import { PhysicalGearFragments } from '../services/trip.queries';
import { ReferentialFragments } from '@app/referential/services/referential.fragments';
import { SortDirection } from '@angular/material/sort';
import { PhysicalGearFilter } from './physical-gear.filter';
import moment from 'moment';
import { TripFilter } from '@app/trip/services/filter/trip.filter';
import { ErrorCodes } from '@app/data/services/errors';
import { mergeLoadResult } from '@app/shared/functions';
import { VesselSnapshotFragments } from '@app/referential/services/vessel-snapshot.service';
import { ProgramFragments } from '@app/referential/services/program.fragments';
import { PhysicalGear } from "@app/trip/physicalgear/physical-gear.model";

const Queries: BaseEntityGraphqlQueries & {loadAllWithTrip: any} = {
  loadAll: gql`query PhysicalGears($filter: PhysicalGearFilterVOInput, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String) {
    data: physicalGears(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...PhysicalGearFragment
    }
  }
  ${PhysicalGearFragments.physicalGear}
  ${ReferentialFragments.referential}
  ${ReferentialFragments.lightDepartment}`,

  load: gql`query PhysicalGear($id: Int!) {
    data: physicalGear(id: $id){
      ...PhysicalGearFragment
    }
  }
  ${PhysicalGearFragments.physicalGear}
  ${ReferentialFragments.referential}
  ${ReferentialFragments.lightDepartment}`,

  loadAllWithTrip: gql`query PhysicalGearsWithTrip($filter: PhysicalGearFilterVOInput, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String){
    data: physicalGears(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...PhysicalGearFragment
      trip {
        departureDateTime
        returnDateTime
        program {
          ...ProgramRefFragment
        }
        vesselSnapshot {
          ...LightVesselSnapshotFragment
        }
      }
    }
  }
  ${PhysicalGearFragments.physicalGear}
  ${ReferentialFragments.referential}
  ${ReferentialFragments.lightDepartment}
  ${ReferentialFragments.lightDepartment}
  ${VesselSnapshotFragments.lightVesselSnapshot}
  ${ProgramFragments.programRef}`
};


const sortByTripDateFn = (n1: PhysicalGear, n2: PhysicalGear) => {
  const d1 = n1.trip && (n1.trip.returnDateTime || n1.trip.departureDateTime);
  const d2 = n2.trip && (n2.trip.returnDateTime || n2.trip.departureDateTime);
  return d1.isSame(d2) ? 0 : (d1.isAfter(d2) ? 1 : -1);
};

export const PHYSICAL_GEAR_DATA_SERVICE_TOKEN = new InjectionToken<IEntitiesService<PhysicalGear, PhysicalGearFilter>>('PhysicalGearDataService');


export declare interface PhysicalGearServiceWatchOptions extends EntitiesServiceWatchOptions {
  fullLoad?: boolean;
  withOffline?: boolean;
  distinctBy?: string[];
  query?: any;
}

@Injectable({providedIn: 'root'})
export class PhysicalGearService extends BaseGraphqlService<PhysicalGear, PhysicalGearFilter>
  implements IEntitiesService<PhysicalGear, PhysicalGearFilter, PhysicalGearServiceWatchOptions> {

  loading = false;

  constructor(
    protected graphql: GraphqlService,
    protected network: NetworkService,
    protected accountService: AccountService,
    protected entities: EntitiesStorage
  ) {
    super(graphql, environment);
    this._logPrefix = '[physical-gear-service] ';

    // -- For DEV only
    this._debug = !environment.production;
  }

  watchAll(
    offset: number,
    size: number,
    sortBy?: string,
    sortDirection?: SortDirection,
    dataFilter?: Partial<PhysicalGearFilter>,
    opts?: PhysicalGearServiceWatchOptions
  ): Observable<LoadResult<PhysicalGear>> {

    if (!dataFilter || (isNil(dataFilter.parentGearId) && (isNil(dataFilter.program) || (isNil(dataFilter.vesselId) && isNil(dataFilter.startDate))))) {
      console.warn('[physical-gear-service] Missing physical gears filter. At least \'parentGearId\', or \'program\' and \'vesselId\' or \'startDate\'. Skipping.');
      return EMPTY;
    }
    // Fix sortBy
    sortBy = sortBy !== 'id' ? sortBy : 'rankOrder';
    sortBy = sortBy !== 'label' ? sortBy : 'gear.label';

    const forceOffline = this.network.offline || (isNotNil(dataFilter.tripId) && dataFilter.tripId < 0);
    const offline = forceOffline || opts?.withOffline || false;
    const online = !forceOffline;

    const offline$ = offline && this.watchAllLocally(offset, size, sortBy, sortDirection, dataFilter, {...opts, toEntity: false, distinctBy: undefined});
    const online$ = online && this.watchAllRemotely(offset, size, sortBy, sortDirection, dataFilter, {...opts, toEntity: false, distinctBy: undefined});

    // Merge local and remote
    const res = (offline$ && online$)
      ? combineLatest([offline$, online$])
        .pipe(
          map(([res1, res2]) => mergeLoadResult(res1, res2))
        )
      : (offline$ || online$);
    return res.pipe(
      map(res => this.applyWatchOptions(res, offset, size, sortBy, sortDirection, dataFilter, opts))
    );
  }

  async deleteAll(data: PhysicalGear[], options?: any): Promise<any> {
    console.error('PhysicalGearService.deleteAll() not implemented yet');
  }

  async saveAll(data: PhysicalGear[], options?: any): Promise<PhysicalGear[]> {
    console.error('PhysicalGearService.saveAll() not implemented yet !');
    return data;
  }

  watchAllRemotely(
    offset: number,
    size: number,
    sortBy?: string,
    sortDirection?: SortDirection,
    dataFilter?: Partial<PhysicalGearFilter>,
    opts?: PhysicalGearServiceWatchOptions): Observable<LoadResult<PhysicalGear>> {

    if (!dataFilter || (isNil(dataFilter.parentGearId) && (isNil(dataFilter.program) || (isNil(dataFilter.vesselId) && isNil(dataFilter.startDate))))) {
      console.warn('[physical-gear-service] Missing physical gears filter. Expected at least \'parentGearId\', or \'program\' and \'vesselId\' or \'startDate\'. Skipping.');
      return EMPTY;
    }

    dataFilter = this.asFilter(dataFilter);

    const variables: any = {
      offset: offset || 0,
      size: size >= 0 ? size : 100,
      sortBy: (sortBy !== 'id' && sortBy !== 'lastUsed' && sortBy) || 'rankOrder',
      sortDirection: sortDirection || 'desc',
      filter: dataFilter.asPodObject()
    };

    let now = this._debug && Date.now();
    if (this._debug) console.debug('[physical-gear-service] Loading physical gears... using options:', variables);

    const withTrip = dataFilter && dataFilter.vesselId && isNil(dataFilter.tripId);
    const query = opts?.query || (withTrip ? Queries.loadAllWithTrip : Queries.loadAll);
    return this.graphql.watchQuery<LoadResult<any>>({
      query,
      variables,
      error: {code: ErrorCodes.LOAD_ENTITIES_ERROR, message: 'ERROR.LOAD_ENTITIES_ERROR'},
      fetchPolicy: opts && opts.fetchPolicy || undefined
    })
      .pipe(
        throttleTime(200), // avoid multiple call
        filter(() => !this.loading),
        map(({ data, total }) => {
          if (now) {
            console.debug(`[physical-gear-service] Loaded ${data.length} physical gears in ${Date.now() - now}ms`);
            now = undefined;
          }
          return {
            data,
            total: total || data.length
          };
        }),
        map(res => this.applyWatchOptions(res, offset, size, sortBy, sortDirection, dataFilter, opts))
      );
  }

  /**
   * Get physical gears, from trips data, and imported gears (offline mode)
   * @param offset
   * @param size
   * @param sortBy
   * @param sortDirection
   * @param dataFilter
   * @param opts
   */
  watchAllLocally(
    offset: number,
    size: number,
    sortBy?: string,
    sortDirection?: SortDirection,
    dataFilter?: Partial<PhysicalGearFilter>,
    opts?: PhysicalGearServiceWatchOptions
  ): Observable<LoadResult<PhysicalGear>> {

    if (!dataFilter || (isNil(dataFilter.parentGearId) && isNil(dataFilter.vesselId))) {
      console.warn('[physical-gear-service] Missing physical gears filter. Expected at least \'vesselId\' or \'parentGearId\'. Skipping.');
      return EMPTY;
    }

    const withTrip = isNil(dataFilter.tripId);
    const fromTrip$ = withTrip && this.watchAllLocallyFromTrips(offset, size, sortBy, sortDirection, dataFilter, {...opts, toEntity: false, distinctBy: undefined});

    // Then, search from predoc (physical gears imported by the offline mode, into the local storage)
    const variables: any = {
      offset: offset || 0,
      size,
      sortBy: (sortBy !== 'id' && sortBy !== 'lastUsed' && sortBy) || 'rankOrder',
      sortDirection: sortDirection || 'desc',
      filter: dataFilter.asFilterFn()
    };
    if (this._debug) console.debug('[physical-gear-service] Loading physical gears locally... using variables:', variables);
    const fromStorage$ = this.entities.watchAll<PhysicalGear>(PhysicalGear.TYPENAME, variables, {fullLoad: opts && opts.fullLoad});

    const res = (fromTrip$ && fromStorage$)
      // Merge local and remote
      ? combineLatest([fromTrip$, fromStorage$])
        .pipe(map(([res1, res2]) => mergeLoadResult(res1, res2)))
      : (fromTrip$ || fromStorage$);

    return res.pipe(
      map(res => this.applyWatchOptions(res, offset, size, sortBy, sortDirection, dataFilter, opts))
    );
  }

  watchAllLocallyFromTrips(
    offset: number,
    size: number,
    sortBy?: string,
    sortDirection?: SortDirection,
    dataFilter?: Partial<PhysicalGearFilter>,
    opts?: PhysicalGearServiceWatchOptions
  ): Observable<LoadResult<PhysicalGear>> {
    if (!dataFilter || isNil(dataFilter.vesselId) || (isNil(dataFilter.program))) {
      console.warn('[physical-gear-service] Trying to load gears from trips, without \'filter.vesselId\' and \'filter.program\'. Skipping.');
      return EMPTY;
    }
    const tripFilter = TripFilter.fromObject(dataFilter && <Partial<TripFilter>>{
      vesselId: dataFilter.vesselId,
      startDate: dataFilter.startDate,
      endDate: dataFilter.endDate,
      program: dataFilter.program,
      excludedIds: isNotNil(dataFilter.excludeTripId) ? [dataFilter.excludeTripId] : undefined
    });

    size = size >= 0 ? size : 100;
    const variables: any = {
      offset: offset || 0,
      size,
      sortBy: 'id', // Need a trip attribute, not a physicalGear attributes
      sortDirection: sortDirection || 'desc',
      filter: tripFilter.asFilterFn()
    };

    if (this._debug) console.debug('[physical-gear-service] Loading physical gears, from local trips... using variables:', variables);

    const withTrip = isNil(dataFilter.tripId);

    return this.entities.watchAll<Trip>(Trip.TYPENAME, variables, { fullLoad: true }) // FullLoad is needed to get gears
      .pipe(
        // Need only one iteration
        first(),
        // Get trips array
        map(res => res && res.data || []),
        // Extract physical gears, from trip
        map(trips => {
          return trips.reduce((res, trip) => res.concat((trip.gears || [])
            .map(gear => ({
              ...gear,
              // Add metadata on trip, if need
              trip: withTrip ? {
                id: trip.id,
                program: trip.program,
                departureDateTime: trip.departureDateTime,
                returnDateTime: trip.returnDateTime
              } : undefined
            }))
          ), []);
        }),
        // Return as load result
        map(data => ({ data, total: data.length })),
        map(res => this.applyWatchOptions(res, offset, size, sortBy, sortDirection, dataFilter, opts))
      );
  }

  protected applyWatchOptions({data, total}: LoadResult<PhysicalGear>,
                                    offset: number,
                                    size: number,
                                    sortBy?: string,
                                    sortDirection?: SortDirection,
                                    filter?: Partial<PhysicalGearFilter>,
                                    opts?: PhysicalGearServiceWatchOptions): LoadResult<PhysicalGear> {
    const toEntity = (!opts || opts.toEntity !== false);
    let entities = toEntity ?
      (data || []).map(source => PhysicalGear.fromObject(source, opts))
      : (data || []) as PhysicalGear[];

    // Sort by trip dates
    const withTrip = isNil(filter.tripId);

    // Remove duplicated gears
    if (isNotEmptyArray(opts?.distinctBy)) {
      // Sort by trip dates desc, to keep newer
      if (toEntity && withTrip) entities.sort(sortByTripDateFn).reverse();

      entities = arrayDistinct(entities, opts?.distinctBy);
    }

    // Sort
    if (sortBy) {
      entities = toEntity ? entities : entities.slice(); // Make sure to source array, as it can be a readonly array
      if (sortBy === 'lastUsed') {
        if (toEntity && withTrip) {
          entities.sort(sortByTripDateFn);
          if (sortDirection === 'desc') {
            entities.reverse();
          }
        }
      } else {
        EntityUtils.sort(entities, sortBy, sortDirection);
      }
    }

    return {data: entities, total};
  }

  async load(id: number, tripId?: number, opts?: {
    distinctByRankOrder?: boolean;
    toEntity?: boolean;
    fullLoad?: boolean;
  }): Promise<PhysicalGear | null> {
    if (isNil(id)) throw new Error('Missing argument \'id\' ');

    const now = this._debug && Date.now();
    if (this._debug) console.debug(`[physical-gear-service] Loading physical gear #${id}...`);
    this.loading = true;

    try {
      let json: any;
      const offline = this.network.offline || id < 0;

      // Load locally
      if (offline) {
        // Watch on storage
        json = await this.entities.load<PhysicalGear>(id, PhysicalGear.TYPENAME);

        if (!json) {
          // If not on storage, watch on trip
          const trip = await this.entities.load<Trip>(tripId, Trip.TYPENAME);
          if (trip && trip.gears) {
            json = trip.gears.find(g => g.id === id);
          }
        }
        if (!json) throw {code: ErrorCodes.LOAD_ENTITY_ERROR, message: 'ERROR.LOAD_ENTITY_ERROR'};
      }

      // Load from pod
      else {
        const res = await this.graphql.query<{ data: PhysicalGear }>({
          query: Queries.load,
          variables: {id},
          error: {code: ErrorCodes.LOAD_ENTITY_ERROR, message: 'ERROR.LOAD_ENTITY_ERROR'}
        });
        json = res && res.data;
      }

      // Transform to entity
      const data = (!opts || opts.toEntity !== false)
        ? PhysicalGear.fromObject(json)
        : json as PhysicalGear;
      if (data && this._debug) console.debug(`[physical-gear-service] Physical gear #${id} loaded in ${Date.now() - now}ms`, data);
      return data;
    } finally {
      this.loading = false;
    }
  }

  async loadAll(offset: number,
                size: number,
                sortBy?: string,
                sortDirection?: SortDirection,
                dataFilter?: Partial<PhysicalGearFilter>,
                opts?: {
                  distinctByRankOrder?: boolean;
                  fetchPolicy?: WatchQueryFetchPolicy;
                  toEntity?: boolean;
                  withTotal?: boolean;
                  query?: any;
                }): Promise<LoadResult<PhysicalGear>> {
    return firstNotNilPromise(this.watchAll(offset, size, sortBy, sortDirection, dataFilter, opts));
  }


  async loadAllByParentId(parentGearId: number,
            opts?: {
              fetchPolicy?: WatchQueryFetchPolicy;
              toEntity?: boolean;
              withTotal?: boolean;
            }): Promise<LoadResult<PhysicalGear>> {
    return this.loadAll(0, 100, 'rankOrder', 'asc', {parentGearId}, opts);
  }

  async executeImport(filter: Partial<PhysicalGearFilter>,
                      opts?: {
                        progression?: BehaviorSubject<number>;
                        maxProgression?: number;
                      }): Promise<void> {

    const maxProgression = opts && opts.maxProgression || 100;
    filter = {
      startDate: moment().add(-1, 'month'), // Can be overwritten by given filter
      ...filter
    };

    console.info('[physical-gear-service] Importing physical gears...');

    const res = await JobUtils.fetchAllPages((offset, size) =>
        this.loadAll(offset, size, 'id', null, filter, {
          fetchPolicy: 'no-cache',
          distinctByRankOrder: true,
          toEntity: false,
          query: Queries.loadAllWithTrip
        }),
      {
        progression: opts?.progression,
        maxProgression: maxProgression * 0.9,
        logPrefix: this._logPrefix,
        fetchSize: 100
      }
    );


    // Save result locally
    await this.entities.saveAll(res.data, {entityName: PhysicalGear.TYPENAME, reset: true});
  }

  asFilter(filter: Partial<PhysicalGearFilter>): PhysicalGearFilter {
    return PhysicalGearFilter.fromObject(filter);
  }

}