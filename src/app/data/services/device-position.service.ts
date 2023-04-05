import { Inject, Injectable, Injector } from '@angular/core';
import {
  AppErrorWithDetails,
  BaseEntityGraphqlQueries,
  BaseEntityService,
  ConfigService,
  Configuration,
  DateUtils,
  EntitiesServiceWatchOptions,
  EntitiesStorage,
  EntitySaveOptions,
  EntityUtils,
  FormErrors,
  GraphqlService,
  isNil,
  isNotNil,
  LoadResult,
  LocalSettingsService,
  PlatformService,
  Referential
} from '@sumaris-net/ngx-components';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { DEVICE_POSITION_CONFIG_OPTION, DEVICE_POSITION_ENTITY_SERVICES } from '@app/data/services/config/device-position.config';
import { environment } from '@environments/environment';
import { DevicePosition, DevicePositionFilter, IPositionWithDate } from '@app/data/services/model/device-position.model';
import { PositionUtils } from '@app/trip/services/position.utils';
import { RootDataEntity, RootDataEntityUtils } from '@app/data/services/model/root-data-entity.model';
import { ISynchronizeEvent, RootDataEntitySaveOptions, RootDataSynchroService } from '@app/data/services/root-data-synchro-service.class';
import { SynchronizationStatusEnum } from '@app/data/services/model/model.utils';
import { DataEntityUtils, MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE } from '@app/data/services/model/data-entity.model';
import { BaseRootEntityGraphqlMutations } from '@app/data/services/root-data-service.class';
import { gql, WatchQueryFetchPolicy } from '@apollo/client/core';
import { DataCommonFragments } from '@app/trip/services/trip.queries';
import { SortDirection } from '@angular/material/sort';
import { distinctUntilChanged, throttleTime } from 'rxjs/operators';
import { ModelEnumUtils } from '@app/referential/services/model/model.enum';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { v4 as uuid } from 'uuid';
import { TRIP_LOCAL_SETTINGS_OPTIONS } from '@app/trip/services/config/trip.config';

export declare interface DevicePositionServiceWatchOptions extends EntitiesServiceWatchOptions {
  fullLoad?: boolean;
  fetchPolicy?: WatchQueryFetchPolicy; // Avoid the use cache-and-network, that exists in WatchFetchPolicy
  mutable?: boolean; // should be a mutable query ? true by default
  withOffline?: boolean;
}

export const DevicePositionFragment = {
  devicePosition: gql`fragment DevicePositionFragment on DevicePositionVO {
    id
    dateTime
    latitude
    longitude
    objectId
    objectType {
      ...LightReferentialFragment
    }
    creationDate
    updateDate
    recorderPerson {
      ...LightPersonFragment
    }
  }`,
}

const Queries: BaseEntityGraphqlQueries = {
  loadAll: gql`query DevicePosition($filter: DevicePositionFilterVOInput, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String) {
    data: devicePositions(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection) {
      ...DevicePositionFragment
    }
  }
  ${DevicePositionFragment.devicePosition}
  ${DataCommonFragments.lightPerson}
  ${DataCommonFragments.referential}
  `,
  loadAllWithTotal: gql`query DevicePosition($filter: DevicePositionFilterVOInput, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String) {
    data: devicePositions(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection) {
      ...DevicePositionFragment
    }
    total: devicePositionsCount(filter: $filter)
  }
  ${DevicePositionFragment.devicePosition}
  ${DataCommonFragments.lightPerson}
  ${DataCommonFragments.referential}
  `,
  // load: gql`query DevicePosition($id: Int!) {
  //   data: devicePosition(id: $id) {
  //     ...DevicePositionFragment
  //   }
  // }
  // ${DevicePositionFragment}
  // ${DataCommonFragments.lightPerson}
  // `,
};
const Mutations: Partial<BaseRootEntityGraphqlMutations> = {
  save: gql`mutation saveDevicePosition($data:DevicePositionVOInput!){
    data: saveDevicePosition(devicePosition: $data){
      ...DevicePositionFragment
    }
  }
  ${DevicePositionFragment.devicePosition}
  ${DataCommonFragments.lightPerson}
  ${DataCommonFragments.referential}
  `,
  saveAll: gql`mutation saveDevicePositions($data:[DevicePositionVOInput!]!){
    data: saveDevicePositions(devicePositions: $data){
      ...DevicePositionFragment
    }
  }
  ${DevicePositionFragment.devicePosition}
  ${DataCommonFragments.lightPerson}
  ${DataCommonFragments.referential}
  `,
  delete: gql`mutation deleteDevicePosition($id:Int!){
    deleteDevicePosition(id: $id)
  }`,
  deleteAll: gql`mutation deleteDevicePositions($ids:[Int!]!){
    deleteDevicePositions(ids: $ids)
  }`,
};

@Injectable()
export class DevicePositionService extends BaseEntityService<DevicePosition, DevicePositionFilter, number>  {

  protected loading = false;
  protected timerPeriodMs: number;
  protected settingsPositionTimeoutMs: number;
  protected mobile: boolean;
  protected lastPosition = new BehaviorSubject<IPositionWithDate>(null);

  protected enableTracking = false;
  protected trackingSubscription = new Subscription();
  protected trackingSavePeriodMs: number;
  protected trackingUpdatePositionFailed = new BehaviorSubject<boolean>(false);


  constructor(
    graphql: GraphqlService,
    platform: PlatformService,
    protected injector: Injector,
    protected config: ConfigService,
    protected settings: LocalSettingsService,
    protected entities: EntitiesStorage,
    protected alertController: AlertController,
    protected translate: TranslateService,
    @Inject(DEVICE_POSITION_ENTITY_SERVICES) private listenedDataServices:RootDataSynchroService<any, any>[]
  ) {
    super(
      graphql,
      platform,
      DevicePosition,
      DevicePositionFilter,
      {
        queries: Queries,
        mutations: Mutations,
      }
    )
    this._logPrefix = '[device-position] ';
    this._debug = !environment.production;
  }

  async save(entity: DevicePosition, opts?:RootDataEntitySaveOptions): Promise<DevicePosition> {

    // Save locally if need
    if (RootDataEntityUtils.isLocal(entity)) {
      return this.saveLocally(entity, opts);
    }

    return super.save(entity, opts);
  }

  protected async saveLocally(entity: DevicePosition, opts?:EntitySaveOptions): Promise<DevicePosition> {

    if (isNotNil(entity.id) && entity.id >= 0) throw new Error('Must be a local entity');

    console.info(`${this._logPrefix} Saving current device position locally`, entity)

    this.fillDefaultProperties(entity);
    await this.fillOfflineDefaultProperties(entity);

    const jsonLocal = this.asObject(entity, {...MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE});
    if (this._debug) console.debug(`${this._logPrefix} [offline] Saving device position locally...`, jsonLocal);
    await this.entities.save(jsonLocal, {entityName: DevicePosition.TYPENAME});

    return entity;
  }


  async synchronize(entity: DevicePosition, opts?: any): Promise<DevicePosition> {
    throw  new Error('Not implemented');
  }

  // TODO Need a control on this data ?
  control(entity: DevicePosition, opts?: any): Promise<AppErrorWithDetails | FormErrors> {
    return Promise.resolve(undefined);
  }

  asFilter(source: Partial<DevicePositionFilter>): DevicePositionFilter {
    return DevicePositionFilter.fromObject(source);
  }

  protected async ngOnStart(): Promise<void> {

    // Wait settings (e.g. mobile)
    await this.settings.ready();
    await this.platform.ready();

    console.info(`${this._logPrefix}Starting service...`)

    this.registerSubscription(
      this.settings.onChange.subscribe(_ => this.onSettingsChanged())
    );

    this.registerSubscription(
      this.config.config.subscribe((config) => this.onConfigChanged(config))
    );
  }

  protected startTracking(): Subscription {

    // Stop if already started
    this.trackingSubscription?.unsubscribe();


    const enableOnSaveListeners = this.trackingSavePeriodMs > 0;
    console.info(`${this._logPrefix}Starting tracking position...`)
    const subscription = new Subscription();

    // Start the timer
    subscription.add(
      timer(650, this.timerPeriodMs).subscribe((_) => this.updateLastPosition())
    );

    if (enableOnSaveListeners) {
      // Start to listen data services events
      subscription.add(this.listenDataServices());

      // Force user to enable geolocation, if failed
      const alertId = uuid();
      subscription.add(
        this.trackingUpdatePositionFailed
          .pipe(distinctUntilChanged())
          .subscribe(async (failed) => {
            await this.platform.ready();
            if (failed) {
              do {
                console.warn(this._logPrefix + 'Geolocation not allowed. Opening alter modal');
                const alert = await this.alertController.create({
                  id: alertId,
                  message: this.translate.instant('DEVICE_POSITION.ERROR.NEED_GEOLOCATION'),
                  buttons: [
                    {role: 'refresh', text: this.translate.instant('COMMON.BTN_REFRESH')}
                  ]
                })
                await alert.present();
                const {role} = await alert.onDidDismiss();
                if (role === 'retry') {
                  failed = !(await this.updateLastPosition());
                }
                else if (role === 'success') {
                  failed = false;
                }
              } while(failed);
            }
            // Success: hide the alert (if any)
            else {
              const alert = await this.alertController.getTop();
              if (alert?.id === alertId) {
                await alert.dismiss(null,  'success');
              }
            }
          })
      );
    }

    subscription.add(() => {
      this.unregisterSubscription(subscription);
      this.trackingSubscription = null;
    });
    this.registerSubscription(subscription);
    this.trackingSubscription = subscription;

    return this.trackingSubscription;
  }


  protected stopTracking() {
    this.trackingSubscription?.unsubscribe();
  }

  protected listenDataServices(): Subscription {
    const subscription = new Subscription();
    this.listenedDataServices.forEach(bean => {
      const service = this.injector.get(bean);

      subscription.add(
        service.onSave
          .pipe(
            throttleTime(this.trackingSavePeriodMs)
          )
          .subscribe((entities) => {
            entities.forEach(e => this.onEntitySaved(e));
          })
      );

      subscription.add(
        service.onDelete.subscribe(entities => {
          entities.forEach(e => this.onEntityDeleted(e));
        })
      );

      subscription.add(
        service.onSynchronize.subscribe(event => this.onEntitySynchronized(event))
      );
    });

    return subscription;
  }

  protected async onEntitySaved(entity:RootDataEntity<any, any>) {
    const lastPosition = this.lastPosition.value;

    // If we're not watching position or if the delay between two device position
    // saving is not reach we not save the position.
    if (!this.enableTracking || !lastPosition) return;

    if (this._debug) console.log(`${this._logPrefix} saveNewDevicePositionFromEntity`, entity);

    const devicePosition = new DevicePosition();
    devicePosition.objectId = entity.id;
    devicePosition.longitude = lastPosition.longitude;
    devicePosition.latitude = lastPosition.latitude;
    devicePosition.dateTime = lastPosition.dateTime;
    const entityName = DataEntityUtils.getEntityName(entity);
    devicePosition.objectType = Referential.fromObject({
      label: ModelEnumUtils.getObjectTypeByEntityName(entityName),
    });
    if (RootDataEntityUtils.isLocal(entity)) {
      await this.saveLocally(devicePosition);
    }
    else {
      await this.save(devicePosition);
    }
  }

  protected async onEntityDeleted(entity: RootDataEntity<any, any>) {

    const entityName = ModelEnumUtils.getObjectTypeByEntityName(DataEntityUtils.getEntityName(entity));
    const filter = DevicePositionFilter.fromObject({
      objectId: entity.id,
      objectType: {label: entityName},
    })

    if (EntityUtils.isLocal(entity)) {

      // Load local data
      const {data} = await this.entities.loadAll(DevicePosition.TYPENAME, {
        filter: filter.asFilterFn()
      });

      // Nothing to do if the synchronized entity has no liked local device position
      if (data.length === 0) return;

      const localIds = data.map(d => d.id);

      // Delete all by ids
      await this.entities.deleteMany(localIds, {entityName: DevicePosition.TYPENAME});
    }
    else {
      // Load local data
      let {data} = await this.loadAll(0, 1000, null, null, filter, {
        withTotal: false});

      // Nothing to do if the synchronized entity has no liked local device position
      if (data.length === 0) return;

      // Delete
      await super.deleteAll(data);
    }
  }

  protected async onEntitySynchronized(event: ISynchronizeEvent) {
    const localId = event.localId;
    const remoteEntity = event.remoteEntity;
    const entityName = ModelEnumUtils.getObjectTypeByEntityName(DataEntityUtils.getEntityName(remoteEntity));

    // Load local data
    let {data} = await this.entities.loadAll(DevicePosition.TYPENAME, {
      filter: DevicePositionFilter.fromObject({
        objectId: localId,
        objectType: Referential.fromObject({label: entityName}),
      }).asFilterFn()
    });

    // Nothing to do if the synchronized entity has no liked local device position
    if (data.length === 0) return;

    const localIds = data.map(d => d.id);
    const entities = data.map(json => {
      const entity = DevicePosition.fromObject({
        ...json,
        objectId: remoteEntity.id,
      });
      delete entity.id;
      return entity;
    });

    // Save
    await this.saveAll(entities);

    // clean local
    await this.entities.deleteMany(localIds, {entityName: DevicePosition.TYPENAME});
  }

//   async load(id:number, opts?:EntityServiceLoadOptions):Promise<DevicePosition> {
//     if (isNil(id)) throw new Error('Missing argument \'id\'');
//
//     const now = Date.now();
//     if (this._debug) console.debug(`${this._logPrefix}Loading {${id}}...`);
//     this.loading = false;
//
//     try {
// h
//     } catch (e) {
//     }
//   }

  protected async fillOfflineDefaultProperties(entity: DevicePosition) {
    const isNew = isNil(entity.id);

    // If new, generate a local id
    if (isNew) {
      entity.id = (await this.entities.nextValue(entity));
    }

    // Fill default synchronization status
    entity.synchronizationStatus = entity.synchronizationStatus || SynchronizationStatusEnum.DIRTY;

  }

  protected async onSettingsChanged() {
    this.settingsPositionTimeoutMs = this.settings.getPropertyAsInt(TRIP_LOCAL_SETTINGS_OPTIONS.OPERATION_GEOLOCATION_TIMEOUT) * 1000;
  }

  protected async onConfigChanged(config:Configuration) {
    this.timerPeriodMs = config.getPropertyAsInt(DEVICE_POSITION_CONFIG_OPTION.TIMER_PERIOD);

    // Tracking position
    {
      const enableTracking = this.settings.mobile && config.getPropertyAsBoolean(DEVICE_POSITION_CONFIG_OPTION.TRACKING_ENABLE);
      this.trackingSavePeriodMs = config.getPropertyAsInt(DEVICE_POSITION_CONFIG_OPTION.TRACKING_SAVE_PERIOD);

      if (enableTracking !== this.enableTracking) {
        this.enableTracking = enableTracking;
        if (this.enableTracking) this.startTracking();
        else this.stopTracking();
      }
    }
  }

  protected async updateLastPosition(): Promise<boolean> {

    try {
      if (this._debug) console.log(`${this._logPrefix}Watching device position...`);

      const timeout = this.settingsPositionTimeoutMs ? Math.min(this.settingsPositionTimeoutMs, this.timerPeriodMs) : this.timerPeriodMs;
      const position = await PositionUtils.getCurrentPosition(this.platform, {
        timeout,
        maximumAge: timeout * 2
      });

      this.lastPosition.next({
        latitude: position.latitude,
        longitude: position.longitude,
        dateTime: DateUtils.moment(),
      });

      if (this._debug) console.debug(`${this._logPrefix}Last position updated`, this.lastPosition);

      // Mark as position ok
      if (this.enableTracking) {
        this.trackingUpdatePositionFailed.next(false);
      }

      return true;
    }

    catch (e) {
      // If required bu failed (e.g. due to leak of geolocation permission)
      if (this.enableTracking && e.code == 1) {
        this.trackingUpdatePositionFailed.next(true);
      }
      // Other errors case
      else throw e;
      return false;
    }
  }

  protected async applyWatchOptions({data, total}: LoadResult<DevicePosition>,
                                    offset: number,
                                    size: number,
                                    sortBy?: string,
                                    sortDirection?: SortDirection,
                                    filter?: Partial<DevicePositionFilter>,
                                    opts?: DevicePositionServiceWatchOptions): Promise<LoadResult<DevicePosition>> {

    // Sort entities
    data = EntityUtils.sort(data, sortBy, sortDirection);

    // Transform to entities (if need)
    const entities = (!opts || opts.toEntity !== false) ?
      (data || []).map(source => DevicePosition.fromObject(source, opts))
      : (data || []) as DevicePosition[];

    return {data: entities, total};
  }

}
