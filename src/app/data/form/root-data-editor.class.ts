import {Directive, Injector, OnInit} from '@angular/core';

import {BehaviorSubject, merge, Subject, Subscription} from 'rxjs';
import {changeCaseToUnderscore, isNil, isNilOrBlank, isNotNil, isNotNilOrBlank} from "@sumaris-net/ngx-components";
import {distinctUntilChanged, filter, map, switchMap, tap} from "rxjs/operators";
import {Program} from "../../referential/services/model/program.model";
import {EntityServiceLoadOptions, IEntityService} from "@sumaris-net/ngx-components";
import {AppEditorOptions, AppEntityEditor}  from "@sumaris-net/ngx-components";
import {ReferentialRef, ReferentialUtils}  from "@sumaris-net/ngx-components";
import {HistoryPageReference}  from "@sumaris-net/ngx-components";
import {RootDataEntity} from "../services/model/root-data-entity.model";
import {MatAutocompleteConfigHolder, MatAutocompleteFieldAddOptions, MatAutocompleteFieldConfig} from "@sumaris-net/ngx-components";
import {AddToPageHistoryOptions}  from "@sumaris-net/ngx-components";
import {Strategy} from "../../referential/services/model/strategy.model";
import {StrategyRefService} from "../../referential/services/strategy-ref.service";
import {ProgramRefService} from "../../referential/services/program-ref.service";
import {mergeMap} from "rxjs/internal/operators";
import {Moment} from "moment";


@Directive()
// tslint:disable-next-line:directive-class-suffix
export abstract class AppRootDataEditor<
  T extends RootDataEntity<T, ID>,
  S extends IEntityService<T, ID> = IEntityService<T, any>,
  ID = number
  >
  extends AppEntityEditor<T, S, ID>
  implements OnInit {

  private _$reloadProgram = new Subject();
  private _$reloadStrategy = new Subject();

  protected programRefService: ProgramRefService;
  protected strategyRefService: StrategyRefService;
  protected autocompleteHelper: MatAutocompleteConfigHolder;

  protected remoteProgramSubscription: Subscription;
  protected remoteStrategySubscription: Subscription;

  autocompleteFields: { [key: string]: MatAutocompleteFieldConfig };

  $programLabel = new BehaviorSubject<string>(undefined);
  $program = new BehaviorSubject<Program>(undefined);
  $strategyLabel = new BehaviorSubject<string>(undefined);
  $strategy = new BehaviorSubject<Strategy>(undefined);


  set program(value: Program) {
    if (isNotNil(value) && this.$program.getValue() !== value) {
      this.$program.next(value);
    }
  }

  get program(): Program {
    return this.$program.getValue();
  }

  set strategy(value: Strategy) {
    if (isNotNil(value) && this.$strategy.getValue() !== value) {
      this.$strategy.next(value);
    }
  }

  get strategy(): Strategy {
    return this.$strategy.getValue();
  }

  protected constructor(
    injector: Injector,
    dataType: new() => T,
    dataService: S,
    options?: AppEditorOptions
  ) {
    super(injector,
      dataType,
      dataService,
      options);

    this.programRefService = injector.get(ProgramRefService);
    this.strategyRefService = injector.get(StrategyRefService);

    // Create autocomplete fields registry
    this.autocompleteHelper = new MatAutocompleteConfigHolder(this.settings && {
      getUserAttributes: (a, b) => this.settings.getFieldDisplayAttributes(a, b)
    });
    this.autocompleteFields = this.autocompleteHelper.fields;

    // FOR DEV ONLY ----
    //this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();

    // Watch program, to configure tables from program properties
    this.registerSubscription(
      merge(
        this.$programLabel
          .pipe(
            filter(isNotNilOrBlank),
            distinctUntilChanged()
          ),
        // Allow to force reload (e.g. when program remotely changes - see startListenProgramRemoteChanges() )
        this._$reloadProgram
          .pipe(
            map(() => this.$programLabel.getValue()),
            filter(isNotNilOrBlank)
          )
      )
      .pipe(
        // DEBUG --
        //tap(programLabel => console.debug('DEV - Getting programLabel=' + programLabel)),
        switchMap(programLabel => this.programRefService.watchByLabel(programLabel, {debug: this.debug})),
        tap(program => this.$program.next(program))
      )
      .subscribe());

    // Watch strategy
    this.registerSubscription(
      merge(
        this.$strategyLabel
          .pipe(
            distinctUntilChanged()
          ),
        // Allow to force reload (e.g. when program remotely changes - see startListenProgramRemoteChanges() )
        this._$reloadStrategy
          .pipe(
            map(() => this.$strategyLabel.getValue())
          )
      )
      .pipe(
        // DEBUG
        //tap(strategyLabel => console.debug("[root-data-editor] Received strategy label: ", strategyLabel)),
        mergeMap( async (strategyLabel) => isNilOrBlank(strategyLabel)
          ? undefined // Allow to have empty strategy (e.g. when user reset the strategy field)
          : this.strategyRefService.loadByLabel(strategyLabel)
        ),
        // DEBUG
        //tap(strategy => console.debug("[root-data-editor] Received strategy: ", strategy)),

        filter(strategy => strategy !== this.$strategy.getValue()),
        tap(strategy => this.$strategy.next(strategy))
      )
      .subscribe());

    this.registerSubscription(
      merge(
        this.$program.pipe(tap(program => this.setProgram(program))),
        this.$strategy.pipe(tap(strategy => this.setStrategy(strategy)))
      ).subscribe()
    );
  }

  ngOnDestroy() {
    super.ngOnDestroy();

    this.$programLabel.unsubscribe();
    this.$strategyLabel.unsubscribe();
    this.$program.unsubscribe();
    this.$strategy.unsubscribe();

    this._$reloadProgram.unsubscribe();
  }

  async load(id?: ID, options?: EntityServiceLoadOptions) {
    await super.load(id, options);

    // New data
    if (isNil(id)) {
      this.startListenProgramChanges();
    }
  }

  enable(opts?: {onlySelf?: boolean, emitEvent?: boolean; }) {
    if (!this.data || isNotNil(this.data.validationDate)) return false;

    super.enable(opts);

    // Leave program disable once saved
    if (!this.isNewData) {
      this.form.controls['program'].disable(opts);
    }

    this.markForCheck();
  }

  protected async setProgram(program: Program) {
    // Can be override by subclasses
    if (!program) return; // SKip

    if (this.debug) console.debug(`[root-data-editor] Program ${program.label} loaded, with properties: `, program.properties);

  }

  protected async setStrategy(value: Strategy) {
    // Can be override by subclasses
  }

  setError(error: any) {

    if (error) {
      // Create a details message, from errors in forms (e.g. returned by control())
      const formErrors = error && error.details && error.details.errors;
      if (formErrors) {
        const messages = Object.keys(formErrors)
          .map(field => {
            const fieldErrors = formErrors[field];
            const fieldI18nKey = changeCaseToUnderscore(field).toUpperCase();
            const fieldName = this.translate.instant(fieldI18nKey);
            const errorMsg = Object.keys(fieldErrors).map(errorKey => {
              const key = 'ERROR.FIELD_' + errorKey.toUpperCase();
              return this.translate.instant(key, fieldErrors[key]);
            }).join(', ');
            return fieldName + ": " + errorMsg;
          }).filter(isNotNil);
        if (messages.length) {
          error.details.message = `<ul><li>${messages.join('</li><li>')}</li></ul>`;
        }
      }

    }

    super.setError(error);
  }

  /* -- protected methods -- */

  protected registerAutocompleteField<T = any, F = any>(fieldName: string,
                                                        opts?: MatAutocompleteFieldAddOptions<T, F>): MatAutocompleteFieldConfig<T, F> {
    return this.autocompleteHelper.add(fieldName, opts);
  }

  protected canUserWrite(data: T): boolean {
    return isNil(data.validationDate) && this.programRefService.canUserWrite(data);
  }

  /**
   * Listen program changes (only if new data)
   * @protected
   */
  private startListenProgramChanges() {
    this.registerSubscription(
      this.form.controls.program.valueChanges
        .subscribe(program => {
          if (ReferentialUtils.isNotEmpty(program)) {
            console.debug("[root-data-editor] Propagate program change: " + program.label);
            this.$programLabel.next(program.label);
          }
        }));
  }

  protected startListenProgramRemoteChanges(program: Program) {
    if (!program || isNil(program.id)) return; // Skip

    // Remove previous listener (e.g. on a previous program id)
    this.remoteProgramSubscription?.unsubscribe();

    this.remoteProgramSubscription = this.programRefService.listenChanges(program.id)
      .pipe(
        filter(isNotNil),
        mergeMap(async (data) => {
          if (data.updateDate && (data.updateDate as Moment).isAfter(program.updateDate)) {
            if (this.debug) console.debug(`[root-data-editor] Program changes detected on server, at {${data.updateDate}}: clearing program cache...`);
            // Reload program & strategies
            await this.reloadProgram();
          }
        })
      )
      .subscribe()
      // DEBUG
      //.add(() =>  console.debug(`[root-data-editor] [WS] Stop listening to program changes on server.`))
    ;

    this.registerSubscription(this.remoteProgramSubscription);
  }

  protected startListenStrategyRemoteChanges(program: Program) {
    if (!program || isNil(program.id)) return; // Skip

    // Remove previous listener (e.g. on a previous program id)
    if (this.remoteStrategySubscription) {
      this.remoteStrategySubscription.unsubscribe();
    }

    this.remoteStrategySubscription = this.strategyRefService.listenChangesByProgram(program.id)
        .pipe(
          filter(isNotNil),
          // Reload strategies
          mergeMap((_) => this.reloadStrategy())
        )
        .subscribe()
    // DEBUG
    //.add(() =>  console.debug(`[root-data-editor] [WS] Stop listening to program changes on server.`))
    ;

    this.registerSubscription(this.remoteStrategySubscription);
  }

  /**
   * Force to reload the program
   * @protected
   */
  protected async reloadProgram() {
    if (this.debug) console.debug(`[root-data-editor] Force program reload...`);

    // Cache clear
    await this.programRefService.clearCache();

    this._$reloadProgram.next();
  }

  /**
   * Force to reload the strategy
   * @protected
   */
  protected async reloadStrategy() {
    if (this.debug) console.debug(`[root-data-editor] Force strategy reload...`);

    // Cache clear
    await this.strategyRefService.clearCache();

    this._$reloadStrategy.next();
  }

  /**
   * Override default function, to add the entity program as subtitle)
   * @param page
   */
  protected async addToPageHistory(page: HistoryPageReference, opts?: AddToPageHistoryOptions) {
    page.subtitle = page.subtitle || this.data.program.label;
    return super.addToPageHistory(page, opts);
  }

  protected async getValue(): Promise<T> {

    const data = await super.getValue();

    // Re add program, because program control can be disabled
    data.program = ReferentialRef.fromObject(this.form.controls['program'].value);

    return data;
  }

  protected computeStrategy(program: Program, data: T): Strategy {
    return null; // TODO BLA
  }
}
