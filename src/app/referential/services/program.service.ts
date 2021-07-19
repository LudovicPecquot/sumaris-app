import {Injectable} from '@angular/core';
import {FetchPolicy, gql, WatchQueryFetchPolicy} from '@apollo/client/core';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {ErrorCodes} from './errors';
import {ReferentialFragments} from './referential.fragments';
import {
  AccountService,
  EntitiesStorage,
  EntityUtils,
  GraphqlService,
  IEntitiesService,
  IEntityService,
  isNil,
  isNotNil,
  LoadResult,
  NetworkService,
  PlatformService,
  ReferentialAsObjectOptions, ReferentialUtils,
  StatusIds
} from '@sumaris-net/ngx-components';
import {CacheService} from 'ionic-cache';
import {ReferentialRefService} from './referential-ref.service';
import {Program} from './model/program.model';
import {SortDirection} from '@angular/material/sort';
import {ReferentialService} from './referential.service';
import {ProgramFragments} from './program.fragments';
import {BaseEntityGraphqlMutations, BaseEntityGraphqlQueries} from '@sumaris-net/ngx-components';
import {ProgramRefService} from './program-ref.service';
import {BaseReferentialService} from './base-referential-service.class';
import {StrategyRefService} from './strategy-ref.service';
import {ProgramFilter} from './filter/program.filter';
import {NOT_MINIFY_OPTIONS} from '@app/core/services/model/referential.model';

const ProgramQueries: BaseEntityGraphqlQueries = {
  // Load by id
  load: gql`query Program($id: Int, $label: String){
    data: program(id: $id, label: $label){
      ...ProgramFragment
    }
  }
  ${ProgramFragments.program}
  ${ReferentialFragments.referential}`,

  // Load all query
  loadAll: gql`query Programs($filter: ProgramFilterVOInput!, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String){
    data: programs(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...LightProgramFragment
    }
  }
  ${ProgramFragments.lightProgram}`,

  // Load all query (with total)
  loadAllWithTotal: gql`query ProgramsWithTotal($filter: ProgramFilterVOInput!, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String){
    data: programs(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...LightProgramFragment
    }
    total: programsCount(filter: $filter)
  }
  ${ProgramFragments.lightProgram}`
};

const ProgramMutations: BaseEntityGraphqlMutations = {
  save: gql`mutation SaveProgram($data: ProgramVOInput!){
    data: saveProgram(program: $data){
      ...ProgramFragment
    }
  }
  ${ProgramFragments.program}
  ${ReferentialFragments.referential}`,

  delete: gql`mutation DeletePrograms($ids:[Int]){
    deleteReferentials(entityName: "Program", ids: $ids)
  }`
};

@Injectable({providedIn: 'root'})
export class ProgramService extends BaseReferentialService<Program, ProgramFilter>
  implements IEntitiesService<Program, ProgramFilter>,
    IEntityService<Program> {

  constructor(
    protected graphql: GraphqlService,
    protected platform: PlatformService,
    protected network: NetworkService,
    protected accountService: AccountService,
    protected referentialService: ReferentialService,
    protected referentialRefService: ReferentialRefService,
    protected programRefService: ProgramRefService,
    protected strategyRefService: StrategyRefService,
    protected cache: CacheService,
    protected entities: EntitiesStorage
  ) {
    super(graphql, platform, Program, ProgramFilter, {
      queries: ProgramQueries,
      mutations: ProgramMutations
    });
    if (this._debug) console.debug('[program-service] Creating service');
  }

  /**
   * Load programs
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
           dataFilter?: ProgramFilter,
           opts?: {
             fetchPolicy?: WatchQueryFetchPolicy;
             withTotal?: boolean;
           }): Observable<LoadResult<Program>> {

    const variables: any = {
      offset: offset || 0,
      size: size || 100,
      sortBy: sortBy || 'label',
      sortDirection: sortDirection || 'asc',
      filter: dataFilter
    };
    const now = Date.now();
    if (this._debug) console.debug("[program-service] Watching programs using options:", variables);

    const query = (!opts || opts.withTotal !== false) ? ProgramQueries.loadAllWithTotal : ProgramQueries.loadAll;
    return this.mutableWatchQuery<LoadResult<any>>({
      queryName: (!opts || opts.withTotal !== false) ? 'LoadAllWithTotal' : 'LoadAll',
      arrayFieldName: 'data',
      totalFieldName: 'total',
      query,
      variables,
      error: {code: ErrorCodes.LOAD_PROGRAMS_ERROR, message: "PROGRAM.ERROR.LOAD_PROGRAMS_ERROR"},
      fetchPolicy: opts && opts.fetchPolicy || undefined
    })
      .pipe(
        map(({data, total}) => {
            const entities = (data || []).map(Program.fromObject);
            if (this._debug) console.debug(`[program-service] Programs loaded in ${Date.now() - now}ms`, entities);
            return {
              data: entities,
              total
            };
          }
        )
      );
  }

  /**
   * Load programs
   * @param offset
   * @param size
   * @param sortBy
   * @param sortDirection
   * @param dataFilter
   * @param opts
   */
  async loadAll(offset: number,
           size: number,
           sortBy?: string,
           sortDirection?: SortDirection,
           dataFilter?: Partial<ProgramFilter>,
           opts?: {
             query?: any,
             fetchPolicy: FetchPolicy;
             withTotal?: boolean;
             toEntity?: boolean;
             debug?: boolean;
           }): Promise<LoadResult<Program>> {

    dataFilter = this.asFilter(dataFilter);

    const variables: any = {
      offset: offset || 0,
      size: size || 100,
      sortBy: sortBy || 'label',
      sortDirection: sortDirection || 'asc'
    };
    const debug = this._debug && (!opts || opts.debug !== false);
    const now = debug && Date.now();
    if (debug) console.debug("[program-service] Loading programs... using options:", variables);

    let res: LoadResult<any>;

    // Offline mode
    const offline = this.network.offline && (!opts || opts.fetchPolicy !== 'network-only');
    if (offline) {
      res = await this.entities.loadAll(Program.TYPENAME,
        {
          ...variables,
          filter: dataFilter && dataFilter.asFilterFn()
        }
      );
    }

    // Online mode
    else {
      const query = opts && opts.query
        || opts && opts.withTotal && ProgramQueries.loadAllWithTotal
        || ProgramQueries.loadAll;
      res = await this.graphql.query<LoadResult<any>>({
        query,
        variables: {
          ...variables,
          filter: dataFilter && dataFilter.asPodObject()
        },
        error: {code: ErrorCodes.LOAD_PROGRAMS_ERROR, message: "PROGRAM.ERROR.LOAD_PROGRAMS_ERROR"},
        fetchPolicy: opts && opts.fetchPolicy || undefined
      });
    }

    const entities = (!opts || opts.toEntity !== false) ?
      (res && res.data || []).map(Program.fromObject) :
      (res && res.data || []) as Program[];
    if (debug) console.debug(`[program-service] Programs loaded in ${Date.now() - now}ms`, entities);
    return {
      data: entities,
      total: res && res.total
    };
  }


  async existsByLabel(label: string, opts?: {
    excludedIds?: number[];
    fetchPolicy?: FetchPolicy;
  }): Promise<boolean> {
    if (isNil(label)) return false;
    return await this.referentialService.existsByLabel(label, { ...opts, entityName: 'Pmfm' });
  }

  async save(entity: Program, options?: any): Promise<Program> {
    if (!entity) return entity;

    // Clean cache
    await this.clearCache();

    return super.save(entity, options);
  }

  async clearCache() {
    // Make sure to clean all strategy references (.e.g Pmfm cache, etc)
    await Promise.all([
      this.programRefService.clearCache(),
      this.strategyRefService.clearCache()
    ]);
  }

  async deleteAll(entities: Program[], options?: any): Promise<any> {
    // Avoid any deletion (need more control, to check if there is linked data, etc.)
    throw new Error('Not implemented yet!');
  }

  canUserWrite(entity: Program) {
    // TODO : check user is in program managers
    return this.accountService.isAdmin()
      || (ReferentialUtils.isNotEmpty(entity) && this.accountService.isSupervisor());
  }

  copyIdAndUpdateDate(source: Program, target: Program) {
    EntityUtils.copyIdAndUpdateDate(source, target);

    // Update strategies
    if (target.strategies && source.strategies) {
      target.strategies.forEach(entity => {

        // Make sure tp copy programId (need by equals)
        entity.programId = source.id;

      });
    }
  }

  /* -- protected methods -- */

  protected asObject(source: Program, opts?: ReferentialAsObjectOptions): any {
    return source.asObject(
      <ReferentialAsObjectOptions>{
        ...opts,
        ...NOT_MINIFY_OPTIONS, // Force NOT minify, because program is a referential that can be minify in just an ID
      });
  }

  protected fillDefaultProperties(program: Program) {
    program.statusId = isNotNil(program.statusId) ? program.statusId : StatusIds.ENABLE;

    // Update strategies
    (program.strategies || []).forEach(strategy => {

      strategy.statusId = isNotNil(strategy.statusId) ? strategy.statusId : StatusIds.ENABLE;

      // Force a valid programId
      // (because a bad copy can leave an old value)
      strategy.programId = isNotNil(program.id) ? program.id : undefined;
    });
  }

}
