import {BehaviorSubject, isObservable, Observable} from "rxjs";
import {filter, first, map, switchMap, tap} from "rxjs/operators";
import {IEntityWithMeasurement, MeasurementValuesUtils} from "../services/model/measurement.model";
import {EntityUtils}  from "@sumaris-net/ngx-components";
import {Directive, EventEmitter, Injector, Input, Optional} from "@angular/core";
import {firstNotNilPromise} from "@sumaris-net/ngx-components";
import {IPmfm, PMFM_ID_REGEXP} from "../../referential/services/model/pmfm.model";
import {SortDirection} from "@angular/material/sort";
import {IEntitiesService, LoadResult} from "@sumaris-net/ngx-components";
import {isNil, isNotNil} from "@sumaris-net/ngx-components";
import {ProgramRefService} from "../../referential/services/program-ref.service";

@Directive()
// tslint:disable-next-line:directive-class-suffix
export class MeasurementsDataService<T extends IEntityWithMeasurement<T>, F>
    implements IEntitiesService<T, F> {

  private readonly _debug: boolean;
  private _programLabel: string;
  private _acquisitionLevel: string;
  private _strategyLabel: string;
  private _requiredStrategy: boolean;
  private _onRefreshPmfms = new EventEmitter<any>();
  private _delegate: IEntitiesService<T, F>;

  protected programRefService: ProgramRefService;

  loadingPmfms = false;
  $pmfms = new BehaviorSubject<IPmfm[]>(undefined);
  hasRankOrder = false;

  @Input()
  set programLabel(value: string) {
    if (this._programLabel !== value && isNotNil(value)) {
      this._programLabel = value;
      if (!this.loadingPmfms) this._onRefreshPmfms.emit('set program');
    }
  }

  get programLabel(): string {
    return this._programLabel;
  }

  @Input()
  set acquisitionLevel(value: string) {
    if (this._acquisitionLevel !== value && isNotNil(value)) {
      this._acquisitionLevel = value;
      if (!this.loadingPmfms) this._onRefreshPmfms.emit();
    }
  }

  get acquisitionLevel(): string {
    return this._acquisitionLevel;
  }

  @Input()
  set strategyLabel(value: string) {
    if (this._strategyLabel !== value && isNotNil(value)) {
      this._strategyLabel = value;
      if (!this.loadingPmfms) this._onRefreshPmfms.emit();
    }
  }

  get strategyLabel(): string {
    return this._strategyLabel;
  }

  @Input() set requiredStrategy(value: boolean) {
    if (this._requiredStrategy !== value && isNotNil(value)) {
      this._requiredStrategy = value;
      if (!this.loadingPmfms) this._onRefreshPmfms.emit('set required strategy');
    }
  }

  get requiredStrategy(): boolean {
    return this._requiredStrategy;
  }

  @Input()
  set pmfms(pmfms: Observable<IPmfm[]> | IPmfm[]) {
    this.applyPmfms(pmfms);
  }

  @Input() set delegate(value: IEntitiesService<T, F>) {
    this._delegate = value;
  }

  get delegate(): IEntitiesService<T, F> {
    return this._delegate;
  }

  constructor(
    injector: Injector,
    protected dataType: new() => T,
    delegate?: IEntitiesService<T, F>,
    @Optional() protected options?: {
      mapPmfms: (pmfms: IPmfm[]) => IPmfm[] | Promise<IPmfm[]>;
      requiredStrategy?: boolean;
      debug?: boolean;
    }) {

    this._delegate = delegate;
    this.programRefService = injector.get(ProgramRefService);
    this._requiredStrategy = options && options.requiredStrategy || false;
    this._debug = options && options.debug;

    // Detect rankOrder on the entity class
    this.hasRankOrder = Object.getOwnPropertyNames(new dataType()).findIndex(key => key === 'rankOrder') !== -1;

    this._onRefreshPmfms
      .pipe(
        filter(() => this.canWatchPmfms()),
        switchMap(() => this.watchProgramPmfms())
      )
      .subscribe(pmfms => this.applyPmfms(pmfms));
  }

  ngOnDestroy() {
    this.$pmfms.complete();
    this.$pmfms.unsubscribe();
    this._onRefreshPmfms.complete();
    this._onRefreshPmfms.unsubscribe();
    this._delegate = null;
  }

  watchAll(
    offset: number,
    size: number,
    sortBy?: string,
    sortDirection?: SortDirection,
    selectionFilter?: any,
    options?: any
  ): Observable<LoadResult<T>> {

    return this.$pmfms
      .pipe(
        filter(isNotNil),
        first(),
        switchMap((pmfms) => {
          let cleanSortBy = sortBy;

          // Do not apply sortBy to delegated service, when sort on a pmfm
          let sortPmfm: IPmfm;
          if (cleanSortBy && PMFM_ID_REGEXP.test(cleanSortBy)) {
            sortPmfm = pmfms.find(pmfm => pmfm.id === parseInt(sortBy));
            // A pmfm was found, do not apply the sort here
            if (sortPmfm) cleanSortBy = undefined;
          }

          return this.delegate.watchAll(offset, size, cleanSortBy, sortDirection, selectionFilter, options)
            .pipe(
              map((res) => {

                // Prepare measurement values for reactive form
                res.data = (res.data || []).slice();
                res.data.forEach(entity => MeasurementValuesUtils.normalizeEntityToForm(entity, pmfms));

                // Apply sort on pmfm
                if (sortPmfm) {
                  // Compute attributes path
                  cleanSortBy = 'measurementValues.' + sortBy;
                  if (sortPmfm.type === 'qualitative_value') {
                    cleanSortBy += '.label';
                  }
                  // Execute a simple sort
                  res.data = EntityUtils.sort(res.data, cleanSortBy, sortDirection);
                }

                return res;
              })
            );
        })
      );
  }

  async saveAll(data: T[], options?: any): Promise<T[]> {

    if (this._debug) console.debug("[meas-service] converting measurement values before saving...");
    const pmfms = this.$pmfms.getValue() || [];
    const dataToSaved = data.map(json => {
      const entity = new this.dataType() as T;
      entity.fromObject(json);
      // Adapt measurementValues to entity, but :
      // - keep the original JSON object measurementValues, because may be still used (e.g. in table without validator, in row.currentData)
      // - keep extra pmfm's values, because table can have filtered pmfms, to display only mandatory PMFM (e.g. physical gear table)
      entity.measurementValues = Object.assign({}, json.measurementValues, MeasurementValuesUtils.normalizeValuesToModel(json.measurementValues, pmfms));
      return entity;
    });

    return this.delegate.saveAll(dataToSaved, options);
  }

  deleteAll(data: T[], options?: any): Promise<any> {
    return this.delegate.deleteAll(data, options);
  }

  asFilter(filter: Partial<F>): F {
    return this.delegate.asFilter(filter);
  }

  /* -- private methods -- */

  private canWatchPmfms(): boolean {
    if (isNil(this._programLabel) || isNil(this._acquisitionLevel)) {
      return false;
    }

    if (this._requiredStrategy && isNil(this._strategyLabel)) {
      if (this._debug) console.debug("[meas-service] Cannot watch Pmfms yet. Missing required 'strategyLabel'.");
      return false;
    }

    return true;
  }

  private watchProgramPmfms(): Observable<IPmfm[]> {
    this.loadingPmfms = true;

    // Watch pmfms
    let res = this.programRefService.watchProgramPmfms(this._programLabel, {
        acquisitionLevel: this._acquisitionLevel,
        strategyLabel: this._strategyLabel || undefined,
      });

    // DEBUG log
    if (this._debug) {
      res = res.pipe(
        tap(pmfms => {
          if (!pmfms.length) {
            console.debug(`[meas-service] No pmfm found for {program: '${this.programLabel}', acquisitionLevel: '${this._acquisitionLevel}', strategyLabel: '${this._strategyLabel}'}. Please fill program's strategies !`);
          } else {
            console.debug(`[meas-service] Pmfm found for {program: '${this.programLabel}', acquisitionLevel: '${this._acquisitionLevel}', strategyLabel: '${this._strategyLabel}'}`, pmfms);
          }
        })
      );
    }

    return res;
  }

  private async applyPmfms(pmfms: IPmfm[] | Observable<IPmfm[]>) {
    if (!pmfms) return undefined; // skip

    // Wait loaded
    if (isObservable<IPmfm[]>(pmfms)) {
      if (this._debug) console.debug("[meas-service] setPmfms(): waiting pmfms observable to emit...");
      pmfms = await firstNotNilPromise(pmfms);
    }

    // Map
    if (this.options && this.options.mapPmfms) {
      const res = this.options.mapPmfms(pmfms);
      pmfms = (res instanceof Promise) ? await res : res;
    }

    if (pmfms instanceof Array && pmfms !== this.$pmfms.getValue()) {

      // DEBUG log
      if (this._debug) console.debug(`[meas-service] Pmfms loaded for {program: '${this.programLabel}', acquisitionLevel: '${this._acquisitionLevel}', strategyLabel: '${this._strategyLabel}'}`, pmfms);

      // Apply
      this.loadingPmfms = false;
      this.$pmfms.next(pmfms);
    }
  }
}

