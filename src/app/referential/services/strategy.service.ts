import {Injectable} from "@angular/core";
import gql from "graphql-tag";
import {Observable} from "rxjs";
import {LoadResult, EntitiesService, EntityService, isNil} from "../../shared/shared.module";
import {BaseEntityService, EntityUtils} from "../../core/core.module";
import {ErrorCodes} from "./errors";

import {GraphqlService} from "../../core/services/graphql.service";
import {SortDirection} from "@angular/material/sort";
import {Strategy} from './model/strategy.model';
import {StrategyFilter} from '../strategy/strategies.table';
import {EntitiesServiceWatchOptions, EntityServiceLoadOptions} from 'src/app/shared/services/entity-service.class';
import {FetchPolicy} from 'apollo-client';
import {NetworkService} from 'src/app/core/services/network.service';
import {AccountService} from 'src/app/core/services/account.service';
import {EntitiesStorage} from 'src/app/core/services/entities-storage.service';

export const StrategyFragments = {
  strategyRef: gql`
    fragment StrategyRefFragment on StrategyVO {
      id
      label
      name
      description
      comments
      analyticReference
      updateDate
      creationDate
      statusId
      gears {
        ...ReferentialFragment
      }
      taxonGroups {
        ...TaxonGroupStrategyFragment
      }
      taxonNames {
        ...TaxonNameStrategyFragment
      }
      appliedStrategies {
        ...AppliedStrategyFragment
      }
      pmfmStrategies {
        ...PmfmStrategyRefFragment
      }
      strategyDepartments {
        ...StrategyDepartmentFragment
      }
    }
  `,
  lightStrategy: gql`
  fragment LightStrategyFragment on StrategyVO {
    id
    label
    name
    description
    comments
    analyticReference
    updateDate
    creationDate
    statusId
    programId
  }
  `,
  strategy: gql`
    fragment StrategyFragment on StrategyVO {
      id
      label
      name
      description
      comments
      analyticReference
      updateDate
      creationDate
      statusId
      programId
      gears {
        ...ReferentialFragment
      }
      taxonGroups {
        ...TaxonGroupStrategyFragment
      }
      taxonNames {
        ...TaxonNameStrategyFragment
      }
      appliedStrategies {
        ...AppliedStrategyFragment
      }
      pmfmStrategies {
        ...PmfmStrategyFragment
      }
      strategyDepartments {
        ...StrategyDepartmentFragment
      }
    }
  `,
  appliedStrategy: gql`
    fragment AppliedStrategyFragment on AppliedStrategyVO {
      strategyId
      location {
        ...ReferentialFragment
      }
      appliedPeriods {
        ...AppliedPeriodFragment
      }
      __typename
    }
  `,
  appliedPeriod: gql`
    fragment AppliedPeriodFragment on AppliedPeriodVO {
      appliedStrategyId
      startDate
      endDate
      acquisitionNumber
      __typename
    }
  `,
  strategyDepartment: gql`
    fragment StrategyDepartmentFragment on StrategyDepartmentVO {
      strategyId
      location {
        ...ReferentialFragment
      }
      privilege {
        ...ReferentialFragment
      }
      department {
        ...ReferentialFragment
      }
      __typename
    }
  `,
}


const FindStrategyNextLabel: any = gql`
  query SuggestedStrategyNextLabelQuery($programId: Int!, $labelPrefix: String, $nbDigit: Int){
    suggestedStrategyNextLabel(programId: $programId, labelPrefix: $labelPrefix, nbDigit: $nbDigit)
  }
`;

const LoadQuery: any = gql`
  query Strategy($id: Int!) {
    strategy(id: $id) {
      ...StrategyFragment
    }
  }
  ${StrategyFragments.strategy}
`;

const LoadAllQuery: any = gql`
  query Strategies($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: StrategyFilterVOInput){
    strategies(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...LightStrategyFragment
    }
  }
  ${StrategyFragments.lightStrategy}
`;

const LoadAllWithTotalQuery: any = gql`
  query StrategiesWithTotal($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: StrategyFilterVOInput){
    strategies(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...LightStrategyFragment
    }
    referentialsCount(entityName: "Strategy")
  }
  ${StrategyFragments.lightStrategy}
`;

@Injectable({providedIn: 'root'})
export class StrategyService extends BaseEntityService implements EntitiesService<Strategy, StrategyFilter>, EntityService<Strategy> {

  loading = false;

  constructor(
    protected graphql: GraphqlService,
    protected network: NetworkService,
    protected accountService: AccountService,
    protected entities: EntitiesStorage
  ) {
    super(graphql);
    if (this._debug) console.debug('[strategy-service] Creating service');
  }

  async load(id: number, options?: EntityServiceLoadOptions): Promise<Strategy | null> {
    if (isNil(id)) throw new Error("Missing argument 'id' ");

    const now = this._debug && Date.now();
    if (this._debug) console.debug(`[strategy-service] Loading strategy #${id}...`);
    this.loading = true;

    try {
      let json: any;

      // Load locally
      if (id < 0) {
        json = await this.entities.load<Strategy>(id, Strategy.TYPENAME);
      }

      // Load from pod
      else {
        const res = await this.graphql.query<{ strategy: Strategy }>({
          query: LoadQuery,
          variables: {
            id: id
          },
          error: {code: ErrorCodes.LOAD_STRATEGY_ERROR, message: "STRATEGY.ERROR.LOAD_STRATEGY_ERROR"},
          fetchPolicy: options && options.fetchPolicy || undefined
        });
        json = res && res.strategy;
      }

      // Transform to entity
      const data = Strategy.fromObject(json);
      if (data && this._debug) console.debug(`[strategy-service] Strategy #${id} loaded in ${Date.now() - now}ms`, data);
      return data;
    } finally {
      this.loading = false;
    }
  }


  save(data: Strategy, options?: any): Promise<Strategy> {
    throw new Error('Method not implemented.');
  }

  delete(data: Strategy, options?: any): Promise<any> {
    throw new Error('Method not implemented.');
  }

  listenChanges(id: number, options?: any): Observable<Strategy> {
    throw new Error('Method not implemented.');
  }

  watchAll(offset: number, size: number, sortBy?: string, sortDirection?: SortDirection, filter?: StrategyFilter, options?: EntitiesServiceWatchOptions): Observable<LoadResult<Strategy>> {
    throw new Error('Method not implemented.');
  }

  /**
   * Load strategies
   * @param offset
   * @param size
   * @param sortBy
   * @param sortDirection
   * @param dataFilter
   */
  async loadAll(offset: number,
                size: number,
                sortBy?: string,
                sortDirection?: SortDirection,
                dataFilter?: StrategyFilter,
                opts?: {
                  query?: any,
                  fetchPolicy: FetchPolicy;
                  withTotal?: boolean;
                  toEntity?: boolean;
                  debug?: boolean;
                }): Promise<LoadResult<Strategy>> {

    const variables: any = {
      offset: offset || 0,
      size: size || 100,
      sortBy: sortBy || 'label',
      sortDirection: sortDirection || 'asc',
      filter: dataFilter
    };
    const debug = this._debug && (!opts || opts.debug !== false);
    const now = debug && Date.now();
    if (debug) console.debug("[strategy-service] Loading strategies... using options:", variables);

    let loadResult: { strategies: any[], referentialsCount?: number };

    // Offline mode
    const offline = this.network.offline && (!opts || opts.fetchPolicy !== 'network-only');
    if (offline) {
// loadResult = await this.entities.loadAll('StrategyVO',
//  {
//    ...variables,
//    filter: EntityUtils.searchTextFilter('label', dataFilter.searchText)
//  }
// ).then(res => {
//  return {
//    programs: res && res.data,
//    referentialsCount: res && res.total
//  };
// });
    }

// Online mode
    else {
      const query = opts && opts.query || opts && opts.withTotal && LoadAllWithTotalQuery || LoadAllQuery;
      loadResult = await this.graphql.query<{ strategies: any[], referentialsCount?: number }>({
        query,
        variables,
        error: {code: ErrorCodes.LOAD_STRATEGIES_ERROR, message: "STRATEGY.ERROR.LOAD_STRATEGIES_ERROR"},
        fetchPolicy: opts && opts.fetchPolicy || undefined
      });
    }

    const data = (!opts || opts.toEntity !== false) ?
      (loadResult && loadResult.strategies || []).map(Strategy.fromObject) :
      (loadResult && loadResult.strategies || []) as Strategy[];
    if (debug) console.debug(`[strategy-service] Strategies loaded in ${Date.now() - now}ms`);
    return {
      data: data,
      total: loadResult.referentialsCount
    };

  }

  saveAll(data: Strategy[], options?: any): Promise<Strategy[]> {
    throw new Error('Method not implemented.');
  }

  deleteAll(data: Strategy[], options?: any): Promise<any> {
    throw new Error('Method not implemented.');
  }

  async findStrategyNextLabel(programId: number, labelPrefix?: string, nbDigit?: number): Promise<string> {
    if (this._debug) console.debug(`[strategy-service] Loading strategy next label...`);

    const res = await this.graphql.query<{ suggestedStrategyNextLabel: string }>({
      query: FindStrategyNextLabel,
      variables: {
        programId: programId,
        labelPrefix: labelPrefix,
        nbDigit: nbDigit
      },
      error: {code: ErrorCodes.LOAD_PROGRAM_ERROR, message: "PROGRAM.STRATEGY.ERROR.LOAD_STRATEGY_LABEL_ERROR"}
    });
    return res && res.suggestedStrategyNextLabel;
  }
}
