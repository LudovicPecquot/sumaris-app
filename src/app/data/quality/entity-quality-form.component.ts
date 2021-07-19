import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, Optional} from '@angular/core';
import {DataEntity, MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE} from '../services/model/data-entity.model';
// import fade in animation
import {
  AccountService,
  ConfigService,
  EntityUtils,
  fadeInAnimation,
  IEntityService,
  isNil,
  isNotNil,
  LocalSettingsService,
  NetworkService,
  PlatformService,
  ReferentialRef,
  ShowToastOptions,
  StatusIds,
  Toasts
} from '@sumaris-net/ngx-components';
import {IDataEntityQualityService, isDataQualityService} from '../services/data-quality-service.class';
import {QualityFlags} from '../../referential/services/model/model.enum';
import {ReferentialRefService} from '../../referential/services/referential-ref.service';
import {merge, Subscription} from 'rxjs';
import {Router} from '@angular/router';
import {ToastController} from '@ionic/angular';
import {TranslateService} from '@ngx-translate/core';
import {environment} from '@environments/environment';
import {AppRootDataEditor} from '../form/root-data-editor.class';
import {RootDataEntity} from '../services/model/root-data-entity.model';
import {qualityFlagToColor} from '../services/model/model.utils';
import {UserEventService} from '@sumaris-net/ngx-components';
import {OverlayEventDetail} from '@ionic/core';
import {isDataSynchroService, RootDataSynchroService} from '../services/root-data-synchro-service.class';
import {debounceTime} from 'rxjs/operators';
import {DATA_CONFIG_OPTIONS} from '@app/data/services/config/data.config';

@Component({
  selector: 'app-entity-quality-form',
  templateUrl: './entity-quality-form.component.html',
  styleUrls: ['./entity-quality-form.component.scss'],
  animations: [fadeInAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityQualityFormComponent<
  T extends RootDataEntity<T, ID> = RootDataEntity<any, any>,
  S extends IEntityService<T, ID> = IEntityService<any, any>,
  ID = number>
  implements OnInit, OnDestroy {

  private _debug = false;
  private _mobile: boolean;
  private _subscription = new Subscription();
  private _controlling = false;
  private _isSynchroService: boolean;
  private _enableQualityProcess = true;

  data: T;
  loading = true;
  canSynchronize: boolean;
  canControl: boolean;
  canTerminate: boolean;
  canValidate: boolean;
  canUnvalidate: boolean;
  canQualify: boolean;
  canUnqualify: boolean;

  qualityFlags: ReferentialRef[];

  @Input("value")
  set value(value: T) {
    this.data = value;
    this.updateView();
  }
  get value(): T {
    return this.data;
  }

  @Input() editor: AppRootDataEditor<T, S, ID>;

  @Input() service: IDataEntityQualityService<T, ID>;

  constructor(
    protected router: Router,
    protected accountService: AccountService,
    protected referentialRefService: ReferentialRefService,
    protected settings: LocalSettingsService,
    protected toastController: ToastController,
    protected translate: TranslateService,
    public network: NetworkService,
    protected userEventService: UserEventService,
    protected configService: ConfigService,
    protected cd: ChangeDetectorRef,
    platform: PlatformService,
    @Optional() editor: AppRootDataEditor<T, S, ID>
  ) {
    this.editor = editor;
    this.service = editor && isDataQualityService(editor.service) ? editor.service : undefined;

    this._mobile = platform.mobile;

    this._debug = !environment.production;
  }

  ngOnInit() {

    // Check editor exists
    if (!this.editor) throw new Error("Missing mandatory 'editor' input!");

    // Check data service exists
    this.service = this.service || isDataQualityService(this.editor.service) && this.editor.service || null;
    if (!this.service) throw new Error("Missing mandatory 'dataService' input!");
    this._isSynchroService = isDataSynchroService(this.service);

    // Subscribe to config
    this._subscription.add(
      this.configService.config.subscribe(config => {
        this._enableQualityProcess = config.getPropertyAsBoolean(DATA_CONFIG_OPTIONS.QUALITY_PROCESS_ENABLE);
      })
    );

    // Subscribe to refresh events
    let updateEvent$ = merge(
      this.editor.onUpdateView,
      this.accountService.onLogin,
      this.network.onNetworkStatusChanges
    );

    // Mobile: add a debounce time
    if (this._mobile) updateEvent$ = updateEvent$.pipe(debounceTime(500));

    this._subscription.add(
      updateEvent$.subscribe(() => this.updateView(this.editor.data))
    );
  }

  ngOnDestroy(): void {
    this._subscription.unsubscribe();
    this.data = null;
    this.qualityFlags = null;
    this.editor = null;
    this.service = null;
  }

  async control(event?: Event, opts?: {emitEvent?: boolean}): Promise<boolean> {

    this._controlling = true;

    let valid = false;
    try {
      // Make sure to get valid and saved data
      const data = await this.editor.saveAndGetDataIfValid();

      // no data: skip
      if (!data) return false;

      if (this._debug) console.debug(`[quality] Control ${data.constructor.name}...`);
      const errors = await this.service.control(data);
      valid = isNil(errors);

      if (!valid) {
        this.editor.setError({message: 'QUALITY.ERROR.INVALID_FORM', details: {errors} });
        this.editor.markAsTouched();
      }
      else {
        // Emit event (refresh component with the new data)
        if (!opts || opts.emitEvent !== false) {
          this.updateView(data);
        }
        else {
          this.data = data;
        }
      }
    }
    finally {
      this._controlling = false;
    }

    return valid;
  }

  async terminate(event?: Event, opts?: {emitEvent?: boolean}): Promise<boolean> {
    // Control data
    const controlled = await this.control(event, {emitEvent: false});
    if (!controlled || event && event.defaultPrevented) {

      // If mode was on field: force desk mode, to show errors
      if (this.editor.isOnFieldMode) {
        this.editor.usageMode = 'DESK';
      }
      return false;
    }

    // Disable the editor
    this.editor.disable();

    try {
      console.debug("[quality] Terminate entity input...");
      const data = await this.service.terminate(this.editor.data);

      // Emit event (refresh editor -> will refresh component also)
      if (!opts || opts.emitEvent !== false) {
        this.updateEditor(data);
      }
      else {
        this.data = data;
      }
      return true;
    }
    finally {
      this.editor.enable(opts);
    }
  }


  async synchronize(event?: Event): Promise<boolean> {

    if (!this.data || +this.data.id >= 0) throw new Error('Need a local trip');

    if (this.network.offline) {
      this.network.showOfflineToast({
        showRetryButton: true,
        onRetrySuccess: () => this.synchronize()
      });
      return;
    }

    const path = this.router.url;

    // Control data
    const controlled = await this.control(event, {emitEvent: false});
    if (!controlled || event && event.defaultPrevented) return false;

    // Disable the editor
    this.editor.disable();

    try {
      console.debug("[quality] Synchronizing entity...");
      // tslint:disable-next-line:no-unused-expression
      const synchroService = this.service as RootDataSynchroService<T, any, ID>;
      const remoteData = await synchroService.synchronize(this.editor.data);

      // Success message
      this.showToast({message: 'INFO.SYNCHRONIZATION_SUCCEED', type: 'info', showCloseButton: true});

      // Remove the page from the history (because of local id)
      await this.settings.removePageHistory(path);

      // Do a ONLINE terminate
      console.debug("[quality] Terminate entity...");
      const data = await this.service.terminate(remoteData);

      // Update the editor (Will refresh the component)
      this.updateEditor(data, {updateRoute: true});
    }
    catch (error) {
      this.editor.setError(error);
      const context = error && error.context || (() => this.data.asObject(MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE));
      this.userEventService.showToastErrorWithContext({
        error,
        context
      });

    }
    finally {
      this.editor.enable();
    }

  }

  async validate(event: Event) {
    // Control data
    const controlled = await this.control(event, {emitEvent: false});
    if (!controlled || event.defaultPrevented) return;

    console.debug("[quality] Mark entity as validated...");
    const data = await this.service.validate(this.data);
    this.updateEditor(data);
  }

  async unvalidate(event: Event) {
    const data = await this.service.unvalidate(this.data);
    this.updateEditor(data);
  }

  async qualify(event: Event, qualityFlagId: number ) {
    const data = await this.service.qualify(this.data, qualityFlagId);
    this.updateEditor(data);
  }

  getI18nQualityFlag(qualityFlagId: number, qualityFlags?: ReferentialRef[]) {
    // Get label from the input list, if any
    let qualityFlag: any = qualityFlags && qualityFlags.find(qf => qf.id === qualityFlagId);
    if (qualityFlag && qualityFlag.label) return qualityFlag.label;

    // Or try to compute a label from the model enumeration
    qualityFlag = qualityFlag || QualityFlags.find(qf => qf.id === qualityFlagId);
    return qualityFlag ? ('QUALITY.QUALITY_FLAGS.' + qualityFlag.label) : undefined;
  }

  qualityFlagToColor = qualityFlagToColor;

  /* -- protected method -- */

  protected updateView(data?: T) {
    if (this._controlling) return; // Skip

    data = data || this.data || this.editor && this.editor.data;
    this.data = data;

    this.loading = isNil(data) || isNil(data.id);

    if (this.loading) {
      this.canSynchronize = false;
      this.canControl = false;
      this.canTerminate = false;
      this.canValidate = false;
      this.canUnvalidate = false;
      this.canQualify = false;
      this.canUnqualify = false;
    }
    else if (data instanceof DataEntity) {

      // If local, avoid to check too many properties (for performance in mobile devices)
      const isLocalData = EntityUtils.isLocal(data);
      const canWrite = isLocalData || this.service.canUserWrite(data);
      const isSupervisor = !isLocalData && this.accountService.isSupervisor();

      // Quality service
      this.canControl = canWrite && (isLocalData && data.synchronizationStatus === 'DIRTY' || isNil(data.controlDate));
      this.canTerminate = this.canControl && (!isLocalData || data.synchronizationStatus === 'DIRTY');

      if (this._enableQualityProcess) {
        this.canValidate = canWrite && isSupervisor && !isLocalData && isNotNil(data.controlDate) && isNil(data.validationDate);
        this.canUnvalidate = canWrite && isSupervisor && isNotNil(data.controlDate) && isNotNil(data.validationDate);
        this.canQualify = canWrite && isSupervisor /*TODO && isQualifier */ && isNotNil(data.validationDate) && isNil(data.qualificationDate);
        this.canUnqualify = canWrite && isSupervisor && isNotNil(data.validationDate) && isNotNil(data.qualificationDate);
      } else {
        this.canValidate = false;
        this.canUnvalidate = false;
        this.canQualify = false;
        this.canUnqualify = false;
      }

      // Synchro service
      this.canSynchronize = this._isSynchroService && canWrite && isLocalData && data.synchronizationStatus === 'READY_TO_SYNC';
    }

    this.markForCheck();

    if (this.canQualify || this.canUnqualify && !this.qualityFlags) {
      this.loadQualityFlags();
    }
  }

  protected async loadQualityFlags() {
    const res = await this.referentialRefService.loadAll(0, 100, 'id', 'asc', {
      entityName: 'QualityFlag',
      statusId: StatusIds.ENABLE
    }, {
      fetchPolicy: "cache-first"
    });

    const items = res && res.data || [];

    // Try to get i18n key instead of label
    items.forEach(flag => flag.label = this.getI18nQualityFlag(flag.id) || flag.label);

    this.qualityFlags = items;
    this.markForCheck();
  }


  protected async showToast<T = any>(opts: ShowToastOptions): Promise<OverlayEventDetail<T>> {
    if (!this.toastController) throw new Error("Missing toastController in component's constructor");
    return await Toasts.show(this.toastController, this.translate, opts);
  }

  protected updateEditor(data: T, opts?: {
      emitEvent?: boolean;
      openTabIndex?: number;
      updateRoute?: boolean;
    }) {
    this.editor.updateView(data, opts);
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
