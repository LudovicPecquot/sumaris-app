import { BehaviorSubject, isObservable, mergeMap, Observable } from 'rxjs';
import {distinctUntilChanged, filter, map, switchMap, takeUntil, tap} from 'rxjs/operators';
import {IEntityWithMeasurement, MeasurementValuesUtils} from './measurement.model';
import {
  EntityUtils,
  firstNotNil, firstNotNilPromise,
  IEntitiesService,
  IEntityFilter,
  InMemoryEntitiesService,
  isNil,
  isNotNil,
  LoadResult,
  StartableService,
  waitForFalse,
  WaitForOptions
} from '@sumaris-net/ngx-components';
import {Directive, EventEmitter, Injector, Optional} from '@angular/core';
import {IPmfm, PMFM_ID_REGEXP} from '@app/referential/services/model/pmfm.model';
import {SortDirection} from '@angular/material/sort';
import {ProgramRefService} from '@app/referential/services/program-ref.service';
import {equals} from '@app/shared/functions';

@Directive()
// tslint:disable-next-line:directive-class-suffix
export class MeasurementsTableEntitiesService<
  T extends IEntityWithMeasurement<T, ID>,
  F extends IEntityFilter<any, T, any>,
  S extends IEntitiesService<T, F> = IEntitiesService<T, F>,
  ID = number
  >
  extends StartableService<IPmfm[]>
  implements IEntitiesService<T, F> {

  private _programLabel: string;
  private _acquisitionLevel: string;
  private _requiredStrategy: boolean;
  private _strategyLabel: string;
  private _requiredGear: boolean;
  private _gearId: number;
  private _onRefreshPmfms = new EventEmitter<any>();
  private _delegate: S;
  private _$pmfms = new BehaviorSubject<IPmfm[]>(undefined);
  private loadingSubject = new BehaviorSubject<boolean>(false);

  protected programRefService: ProgramRefService;

  hasRankOrder = false;

  set programLabel(value: string) {
    if (this._programLabel !== value && isNotNil(value)) {
      this._programLabel = value;
      if (!this.loading) this._onRefreshPmfms.emit('set program');
    }
  }

  get programLabel(): string {
    return this._programLabel;
  }

  set acquisitionLevel(value: string) {
    if (this._acquisitionLevel !== value && isNotNil(value)) {
      this._acquisitionLevel = value;
      if (!this.loading) this._onRefreshPmfms.emit();
    }
  }

  get acquisitionLevel(): string {
    return this._acquisitionLevel;
  }

  set strategyLabel(value: string) {
    if (this._strategyLabel !== value && isNotNil(value)) {
      this._strategyLabel = value;
      if (!this.loading) this._onRefreshPmfms.emit();
    }
  }

  get strategyLabel(): string {
    return this._strategyLabel;
  }

  set requiredStrategy(value: boolean) {
    if (this._requiredStrategy !== value && isNotNil(value)) {
      this._requiredStrategy = value;
      if (!this.loading) this._onRefreshPmfms.emit('set required strategy');
    }
  }

  get requiredStrategy(): boolean {
    return this._requiredStrategy;
  }

  set gearId(value: number) {
    if (this._gearId !== value) {
      this._gearId = value;
      if (!this.loading) this._onRefreshPmfms.emit('set gear id');
    }
  }

  get gearId(): number {
    return this._gearId;
  }

  set requiredGear(value: boolean) {
    if (this._requiredGear !== value && isNotNil(value)) {
      this._requiredGear = value;
      if (!this.loading) this._onRefreshPmfms.emit('set required gear');
    }
  }

  get requiredGear(): boolean {
    return this._requiredGear;
  }

  set $pmfms(pmfms: Observable<IPmfm[]>) {
    this.applyPmfms(pmfms);
  }

  get $pmfms(): Observable<IPmfm[]> {
    return this._$pmfms;
  }

  get pmfms(): IPmfm[] {
    return this._$pmfms.value;
  }

  set pmfms(pmfms: IPmfm[]) {
    this.applyPmfms(pmfms);
  }

  set delegate(value: S) {
    this._delegate = value;
  }

  get delegate(): S {
    return this._delegate;
  }

  get loading(): boolean {
    return this.loadingSubject.value;
  }

  get stopped(): boolean {
    return super.stopped || this._$pmfms?.closed || false;
  }

  constructor(
    injector: Injector,
    protected dataType: new() => T,
    delegate?: S,
    @Optional() protected options?: {
      mapPmfms: (pmfms: IPmfm[]) => IPmfm[] | Promise<IPmfm[]>;
      requiredStrategy?: boolean;
      debug?: boolean;
    }) {
    super(null);
    this._delegate = delegate;
    this.programRefService = injector.get(ProgramRefService);
    this._requiredStrategy = options && options.requiredStrategy || false;
    this._debug = options && options.debug;

    // Detect rankOrder on the entity class
    this.hasRankOrder = Object.getOwnPropertyNames(new dataType()).some(key => key === 'rankOrder');

    this.registerSubscription(
      this._onRefreshPmfms
        .pipe(
          map(() => this.generatePmfmWatchKey()),
          filter(isNotNil),
          distinctUntilChanged(),
          switchMap(() => this.watchProgramPmfms()),
          tap(pmfms => this.applyPmfms(pmfms))
        )
        .subscribe()
    );
  }

  protected async ngOnStart(): Promise<IPmfm[]> {
    if (this.stopped) throw Error('MeasurementService is not restartable!');
    if (!this.loading) this._onRefreshPmfms.emit('start');
    try {
      return await firstNotNil(this._$pmfms).toPromise();
    }
    catch(err) {
      if (this.stopped) {
        // Service stopped: silent
      }
      else {
        console.error(err);
      }
    }
  }

  protected async ngOnStop() {
    this._$pmfms.complete();
    this._$pmfms.unsubscribe();
    this._onRefreshPmfms.complete();
    this._onRefreshPmfms.unsubscribe();
    this.loadingSubject.unsubscribe();
    if (this._delegate instanceof InMemoryEntitiesService) {
      await this._delegate.stop();
    }
  }

  watchAll(
    offset: number,
    size: number,
    sortBy?: string,
    sortDirection?: SortDirection,
    selectionFilter?: any,
    options?: any
  ): Observable<LoadResult<T>> {

    if (!this.started) this.start();

    return this._$pmfms
      .pipe(
        filter(isNotNil),
        switchMap(pmfms => {
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

    if (this._debug) console.debug('[meas-service] converting measurement values before saving...');
    const pmfms = this._$pmfms.getValue() || [];
    const dataToSaved = data.map(json => {
      const entity = new this.dataType() as T;
      entity.fromObject(json);
      // Adapt measurementValues to entity, but :
      // - keep the original JSON object measurementValues, because may be still used (e.g. in table without validator, in row.currentData)
      // - keep extra pmfm's values, because table can have filtered pmfms, to display only mandatory PMFM (e.g. physical gear table)
      entity.measurementValues = Object.assign({}, json.measurementValues, MeasurementValuesUtils.normalizeValuesToModel(json.measurementValues as any, pmfms));
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

  async waitIdle(opts: WaitForOptions): Promise<void> {
    await waitForFalse(this.loadingSubject, opts);
  }

  /* -- private methods -- */

  private generatePmfmWatchKey(): string | undefined {
    if (isNil(this._programLabel) || isNil(this._acquisitionLevel)) {
      return;
    }

    if (this._requiredStrategy && isNil(this._strategyLabel)) {
      if (this._debug) console.debug('[meas-service] Cannot watch Pmfms yet. Missing required \'strategyLabel\'.');
      return;
    }

    if (this._requiredGear && isNil(this._gearId)) {
      if (this._debug) console.debug('[meas-service] Cannot watch Pmfms yet. Missing required \'gearId\'.');
      return;
    }

    return `${this._programLabel}|${this._acquisitionLevel}|${this._strategyLabel}|${this._gearId}`;
  }

  private watchProgramPmfms(): Observable<IPmfm[]> {
    this.markAsLoading();

    // DEBUG
    if (this._debug) console.debug(`[meas-service] Loading pmfms... {program: '${this.programLabel}', acquisitionLevel: '${this._acquisitionLevel}', strategyLabel: '${this._strategyLabel}'}̀̀`);

    // Watch pmfms
    let pmfm$ = this.programRefService.watchProgramPmfms(this._programLabel, {
        acquisitionLevel: this._acquisitionLevel,
        strategyLabel: this._strategyLabel || undefined,
        gearId: this._gearId || undefined
      })
      .pipe(
        takeUntil(this.stopSubject)
      );

    // DEBUG log
    if (this._debug) {
      pmfm$ = pmfm$.pipe(
        tap(pmfms => {
          if (!pmfms.length) {
            console.debug(`[meas-service] No pmfm found for {program: '${this.programLabel}', acquisitionLevel: '${this._acquisitionLevel}', strategyLabel: '${this._strategyLabel}'}. Please fill program's strategies !`);
          } else {
            console.debug(`[meas-service] Pmfm found for {program: '${this.programLabel}', acquisitionLevel: '${this._acquisitionLevel}', strategyLabel: '${this._strategyLabel}'}`, pmfms);
          }
        })
      );
    }

    return pmfm$;
  }

  private async applyPmfms(pmfms: IPmfm[] | Observable<IPmfm[]>): Promise<boolean> {
    if (!pmfms) return false; // skip

    this.markAsLoading();

    try {
      // Wait loaded
      if (isObservable(pmfms)) {
        if (this._debug) console.debug(`[meas-service] setPmfms(): waiting pmfms observable...`);
        pmfms = await firstNotNilPromise(pmfms, {stop: this.stopSubject});
        if (this._debug) console.debug(`[meas-service] setPmfms(): waiting pmfms observable [OK]`);
      }

      // Map
      if (this.options && this.options.mapPmfms) {
        pmfms = await this.options.mapPmfms(pmfms);
      }

      // Make pmfms is an array
      if (!Array.isArray(pmfms)) {
        console.error(`[meas-service] Invalid pmfms. Should be an array:`, pmfms);
        return false;
      }

      // Check if changes
      if (equals(pmfms, this._$pmfms.value)) return false; // Skip if same

      // DEBUG log
      //if (this._debug) console.debug(`[meas-service] Pmfms to applied: `, pmfms);

      this._$pmfms.next(pmfms);
      return true;
    } catch (err) {
      if (!this.stopped) {
        console.error(`[meas-service] Error while applying pmfms: ${err && err.message || err}`, err);
      }
    }
    finally {
      // Mark as loaded
      this.markAsLoaded();
    }
  }

  private markAsLoading() {
    if (!this.loadingSubject.value) {
      this.loadingSubject.next(true);
    }
  }

  private markAsLoaded() {
    if (this.loadingSubject.value) {
      this.loadingSubject.next(false);
    }
  }
}

