import {Injectable} from "@angular/core";
import {FetchPolicy, gql} from "@apollo/client/core";
import {ErrorCodes} from "./errors";
import {AccountService, BaseEntityGraphqlQueries} from '@sumaris-net/ngx-components';
import {LoadResult, SuggestService} from "@sumaris-net/ngx-components";
import {GraphqlService}  from "@sumaris-net/ngx-components";
import {Metier} from "./model/taxon.model";
import {NetworkService}  from "@sumaris-net/ngx-components";
import {EntitiesStorage}  from "@sumaris-net/ngx-components";
import {ReferentialFragments} from "./referential.fragments";
import {ReferentialUtils}  from "@sumaris-net/ngx-components";
import {StatusIds}  from "@sumaris-net/ngx-components";
import {SortDirection} from "@angular/material/sort";
import {isNil} from "@sumaris-net/ngx-components";
import {BaseGraphqlService}  from "@sumaris-net/ngx-components";
import {environment} from '@environments/environment';
import {MetierFilter} from "./filter/metier.filter";

export const METIER_DEFAULT_FILTER: Readonly<MetierFilter> = Object.freeze(MetierFilter.fromObject({
  entityName: 'Metier',
  statusId: StatusIds.ENABLE
}));

const MetierQueries: BaseEntityGraphqlQueries = {
  loadAll: gql`query Metiers($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: MetierFilterVOInput){
    data: metiers(offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection, filter: $filter){
      ...LightMetierFragment
    }
  }
  ${ReferentialFragments.lightMetier}`,

  loadAllWithTotal: gql`query Metiers($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: MetierFilterVOInput){
      data: metiers(offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection, filter: $filter){
        ...LightMetierFragment
      }
      total: metiersCount(filter: $filter)
    }
    ${ReferentialFragments.lightMetier}`,

  load: gql`query Metier($id: Int!){
    metier(id: $id){
      ...MetierFragment
    }
  }
  ${ReferentialFragments.metier}`
};

@Injectable({providedIn: 'root'})
export class MetierService extends BaseGraphqlService
  implements SuggestService<Metier, MetierFilter> {

  constructor(
    protected graphql: GraphqlService,
    protected accountService: AccountService,
    protected network: NetworkService,
    protected entities: EntitiesStorage,
  ) {
    super(graphql, environment);

    // -- For DEV only
    this._debug = !environment.production;
  }

  async load(id: number, options?: any): Promise<Metier> {
    if (isNil(id)) throw new Error("Missing argument 'id'");
    const now = this._debug && Date.now();
    if (this._debug) console.debug(`[metier-ref-service] Loading Metier #${id}...`);

    const data = await this.graphql.query<{ metier: Metier }>({
      query: MetierQueries.load,
      variables: { id },
      fetchPolicy: options && options.fetchPolicy || undefined
    });

    if (data && data.metier) {
      const metier = Metier.fromObject(data.metier, {useChildAttributes: false});
      if (metier && this._debug) console.debug(`[metier-ref-service] Metier #${id} loaded in ${Date.now() - now}ms`, metier);
      return metier;
    }
    return null;
  }

  async loadAll(offset: number,
                size: number,
                sortBy?: string,
                sortDirection?: SortDirection,
                filter?: Partial<MetierFilter>,
                opts?: {
                  [key: string]: any;
                  fetchPolicy?: FetchPolicy;
                  debug?: boolean;
                  toEntity?: boolean;
                }): Promise<LoadResult<Metier>> {

    filter = this.asFilter(filter);

    if (!filter) {
      console.error("[metier-ref-service] Missing filter");
      throw {code: ErrorCodes.LOAD_REFERENTIAL_ERROR, message: "REFERENTIAL.ERROR.LOAD_REFERENTIAL_ERROR"};
    }

    const variables: any = {
      offset: offset || 0,
      size: size || 100,
      sortBy: sortBy || filter.searchAttribute || 'label',
      sortDirection: sortDirection || 'asc'
    };

    const debug = this._debug && (!opts || opts.debug !== false);
    const now = debug && Date.now();
    if (debug) console.debug(`[metier-ref-service] Loading Metier items...`, variables, filter);

    // Offline mode: read from the entities storage
    let res: LoadResult<Metier>;
    const offline = this.network.offline && (!opts || opts.fetchPolicy !== 'network-only');
    if (offline) {
      res = await this.entities.loadAll('MetierVO',
        {
          ...variables,
          filter: filter && filter.asFilterFn()
        }
      );
    }

    // Online mode: use graphQL
    else {
      const query = (!opts || opts.withTotal !== false) ? MetierQueries.loadAllWithTotal : MetierQueries.loadAll;
      res = await this.graphql.query<LoadResult<Metier>>({
        query,
        variables: {
          ...variables,
          filter: filter && filter.asPodObject()
        },
        error: {code: ErrorCodes.LOAD_REFERENTIAL_ERROR, message: "REFERENTIAL.ERROR.LOAD_REFERENTIAL_ERROR"},
        fetchPolicy: opts && opts.fetchPolicy || 'cache-first'
      });
    }

    const entities = (!opts || opts.toEntity !== false) ?
      (res && res.data || []).map(value => Metier.fromObject(value, {useChildAttributes: false})) :
      (res && res.data || []) as Metier[];
    if (debug) console.debug(`[metier-ref-service] Metiers loaded in ${Date.now() - now}ms`);
    return {
      data: entities,
      total: res.total
    };
  }

  suggest(value: any, filter?: Partial<MetierFilter>): Promise<LoadResult<Metier>> {
    if (ReferentialUtils.isNotEmpty(value)) return Promise.resolve({ data: [value as Metier] });
    value = (typeof value === "string" && value !== '*') && value || undefined;
    return this.loadAll(0, !value ? 30 : 10, undefined, undefined,
      {...filter, searchText: value},
      {withTotal: true /* used by autocomplete */}
    );
  }

  asFilter(source: Partial<MetierFilter>): MetierFilter {
    return MetierFilter.fromObject(source);
  }
}
