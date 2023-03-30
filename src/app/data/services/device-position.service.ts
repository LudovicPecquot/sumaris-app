import {Inject, Injectable, Injector} from '@angular/core';
import {
  AppErrorWithDetails,
  BaseEntityGraphqlQueries,
  ConfigService,
  Configuration,
  DateUtils,
  EntitiesStorage,
  Entity,
  EntitySaveOptions,
  EntityServiceLoadOptions,
  FormErrors,
  isNil,
  isNotNil,
  LoadResult,
} from '@sumaris-net/ngx-components';
import {IPosition} from '@app/trip/services/model/position.model';
import {BehaviorSubject, interval, Subscription} from 'rxjs';
import {DEVICE_POSITION_CONFIG_OPTION, DEVICE_POSTION_ENTITY_MONITORING} from '@app/data/services/config/device-position.config';
import {environment} from '@environments/environment';
import {DevicePosition, DevicePositionFilter, ITrackPosition, ObjectType} from '@app/data/services/model/device-position.model';
import {PositionUtils} from '@app/trip/services/position.utils';
import {RootDataEntityUtils} from '@app/data/services/model/root-data-entity.model';
import {RootDataSynchroService} from '@app/data/services/root-data-synchro-service.class';
import {SynchronizationStatusEnum} from '@app/data/services/model/model.utils';
import {MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE, SAVE_AS_OBJECT_OPTIONS, SERIALIZE_FOR_OPTIMISTIC_RESPONSE} from '@app/data/services/model/data-entity.model';
import {ErrorCodes} from '@app/data/services/errors';
import {BaseRootEntityGraphqlMutations} from '@app/data/services/root-data-service.class';
import {gql} from '@apollo/client/core';
import {DataCommonFragments} from '@app/trip/services/trip.queries';
import {Trip} from '@app/trip/services/model/trip.model';
import {SortDirection} from '@angular/material/sort';

export const DevicePositionFragment = {
  devicePosition: gql`fragment DevicePositionFragment on DevicePositionVO {
    id
    dateTime
    latitude
    longitude
    objectId
    creationDate
    updateDate
    recorderPerson {
      ...LightPersonFragment
    }
  }`,
}

// TODO
const Queries: BaseEntityGraphqlQueries = {
  loadAll: gql`query DevicePosition($filter: DevicePositionFilterVOInput, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String) {
    data: devicePositions(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection) {
      ...DevicePositionFragment
    }
  }
  ${DevicePositionFragment.devicePosition}
  ${DataCommonFragments.lightPerson}
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
  save: gql`mutation saveDevicePosition($devicePosition:DevicePositionVOInput!){
    data: saveDevicePosition(devicePosition: $devicePosition){
      ...DevicePositionFragment
    }
  }
  ${DevicePositionFragment.devicePosition}
  ${DataCommonFragments.lightPerson}
  `,
};

// TODO Check class type
@Injectable({providedIn: 'root'})
export class DevicePositionService extends RootDataSynchroService<DevicePosition<any>, DevicePositionFilter, number>  {

  static ENTITY_NAME = 'DevicePosition';

  protected config:ConfigService;

  protected saveInterval = 0;
  protected lastPosition:ITrackPosition;
  protected $checkLoop: Subscription;
  protected onSaveSubscriptions:Subscription = new Subscription();
  protected entities: EntitiesStorage;

  protected loading:boolean = false;

  protected _watching:boolean = false;
  // get watching(): boolean {
  //   return this._watching;
  // };

  mustAskForEnableGeolocation:BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  constructor(
    protected injector: Injector,
    @Inject(DEVICE_POSTION_ENTITY_MONITORING) private monitorOnSave,
  ) {
    super(
      injector,
      DevicePosition,
      DevicePositionFilter,
      {
        queries: Queries,
        mutations: Mutations,
      }
    )
    this._logPrefix = '[DevicePositionService]';
    this.config = injector.get(ConfigService);
    this._debug = !environment.production;
  }

  protected ngOnStart(): Promise<void> {
    console.log(`${this._logPrefix} starting...`)
    this.onSaveSubscriptions.add(
      this.monitorOnSave.map(c => this.injector.get(c).onSave.subscribe((entities) => {
        if (this._watching) {
          entities.forEach(e => {
            const devicePosition:DevicePosition<any> = new DevicePosition<any>();
            devicePosition.objectId = e.id;
            devicePosition.objectType = ObjectType.fromObject({name: e.constructor.ENTITY_NAME});
            devicePosition.longitude = this.lastPosition.longitude;
            devicePosition.latitude = this.lastPosition.latitude;
            devicePosition.dateTime = this.lastPosition.date;
            if (RootDataEntityUtils.isLocal(e)) this.saveLocally(devicePosition);
            else this.save(devicePosition, {}); // TODO Options
          });
        }
      }))
    );
    this.config.config.subscribe((config) => this.onConfigChanged(config));
    return Promise.resolve(undefined);
  }

  protected ngOnStop(): Promise<void> | void {
    this.$checkLoop.unsubscribe();
    this.onSaveSubscriptions.unsubscribe();
    return super.ngOnStop();
  }

  getLastPostion(): IPosition {
    return this.lastPosition;
  }

  async save(entity:DevicePosition<any>, opts?:EntitySaveOptions): Promise<DevicePosition<any>> {
    console.log(`${this._logPrefix} save current device position`, {position: this.lastPosition})
    // if (!(await this.checkIfmustSaveDevicePosition((await this.getLastDevicePositionSavedRemotely())))) {
    //   console.debug(`${this._logPrefix} skip save interval is less than this provided in configuration (${this.saveInterval})`);
    //   return;
    // }
    const now = Date.now();
    this.fillDefaultProperties(entity);
    // Provide an optimistic response, if connection lost
    // TODO
    // const offlineResponse = (!opts || opts.enableOptimisticResponse !== false) ?
    const offlineResponse = (false)
      ? async (context) => {
        // Make sure to fill id, with local ids
        await this.fillOfflineDefaultProperties(entity);
        // For the query to be tracked (see tracked query link) with a unique serialization key
        context.tracked = (!entity.synchronizationStatus || entity.synchronizationStatus === 'SYNC');
        if (isNotNil(entity.id)) context.serializationKey = `${Trip.TYPENAME}:${entity.id}`;
        return {
          data: [this.asObject(entity, SERIALIZE_FOR_OPTIMISTIC_RESPONSE)]
        };
      }
      : undefined;
    //  TODO ? Provide an optimistic response, if connection lost
    const json = this.asObject(entity, SAVE_AS_OBJECT_OPTIONS);
    if (this._debug) console.debug(`[${this._logPrefix}] : Using minify object, to send:`, json);
    const variables = {
      devicePosition: json,
    };
    const mutation = this.mutations.save;
    await this.graphql.mutate<{ data:any }>({
      mutation,
      variables,
      offlineResponse,
      refetchQueries: this.getRefetchQueriesForMutation({}), // TODO option
      awaitRefetchQueries: false, // TODO option
      error: {code: ErrorCodes.SAVE_ENTITY_ERROR, message: 'ERROR.SAVE_ENTITY_ERROR'},
      update: async (cache, {data}) => {
        const savedEntity = data && data.data;
        // Local entity (optimistic response): save it
        if (savedEntity.id < 0) {
          if (this._debug) console.debug(`[${this._logPrefix}] [offline] : Saving trip locally...`, savedEntity);
          await this.entities.save<DevicePosition<any, any>>(savedEntity);
        } else {
          // Remove existing entity from the local storage
          // TODO Check this condition
          if (entity.id < 0 && (savedEntity.id > 0 || savedEntity.updateDate)) {
            if (this._debug) console.debug(`[${this._logPrefix}] Deleting trip {${entity.id}} from local storage`);
            await this.entities.delete(entity);
          }
          // Copy id and update Date
          this.copyIdAndUpdateDate(savedEntity, entity);
          // Insert into the cache
          if (RootDataEntityUtils.isNew(entity) && this.watchQueriesUpdatePolicy === 'update-cache') {
            this.insertIntoMutableCachedQueries(cache, {
              queries: this.getLoadQueries(),
              data: savedEntity
            });
          }
          if (opts && opts.update) {
            opts.update(cache, {data});
          }
          if (this._debug) console.debug(`[${this._logPrefix}] DevicePosition saved remotely in ${Date.now() - now}ms`, entity);
        }
      },
    });
    //this.onSave.next([entity]);
    return entity;
  }

  async saveLocally(entity:DevicePosition<any>, opts?:EntitySaveOptions) {
    if (!(await this.checkIfmustSaveDevicePosition((await this.getLastDevicePositionSavedLocally())))) {
      console.debug(`${this._logPrefix} skip save interval is less than this provided in configuration (${this.saveInterval})`);
      return;
    }

    console.log(`${this._logPrefix} save locally current device position`, {position: this.lastPosition})

    if (isNotNil(entity.id) && entity.id >= 0) throw new Error('Must be a local entity');
    this.fillDefaultProperties(entity);
    this.fillOfflineDefaultProperties(entity);
    entity.synchronizationStatus = SynchronizationStatusEnum.DIRTY;
    const jsonLocal = this.asObject(entity, {...MINIFY_DATA_ENTITY_FOR_LOCAL_STORAGE});
    if (this._debug) console.debug(`${this._logPrefix} [offline] Saving device position locally...`, jsonLocal);
    await this.entities.save(jsonLocal, {entityName: DevicePosition.TYPENAME});
  }

  async synchronize(entity: DevicePosition<any>, opts?: any): Promise<DevicePosition<any>> {
    const localId = entity.id;
    if (isNil(localId) || localId >= 0) {
      throw new Error('Entity must be a local entity');
    }
    if (this.network.offline) {
      throw new Error('Cannot synchronize: app is offline');
    }
    entity = entity instanceof Entity ? entity.clone() : entity;
    entity.synchronizationStatus = 'SYNC';
    entity.id = undefined;
    try {
      entity = await this.save(entity, opts);
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
    // Clean local
    try {
      if (this._debug) console.debug(`${this._logPrefix} Deleting trip {${entity.id}} from local storage`);
    } catch (err) {
      console.error(`${this._logPrefix} Failed to locally delete trip {${entity.id}} and its operations`, err);
      // Continue
    }

    // TODO : See Importing historical data in trip service

    // Clear page history
    try {
      // FIXME: find a way o clean only synchronized data ?
      await this.settings.clearPageHistory();
    }
    catch(err) { /* Continue */}

    return entity;
  }

  // TODO Need a control on this data ?
  control(entity: DevicePosition<any>, opts?: any): Promise<AppErrorWithDetails | FormErrors> {
    return Promise.resolve(undefined);
  }

  forceUpdatePosition() {
    this.mustAskForEnableGeolocation.next(false);
    this.watchGeolocation();
  }

  async loadAll(offset:number,
                size: number,
                sortBy?:string,
                sortDirection?:SortDirection,
                filter?: Partial<DevicePositionFilter>,
                opts?: EntityServiceLoadOptions):Promise<LoadResult<DevicePosition<any, any>>> {
    const offlineData = this.network.offline || (filter && filter.synchronizationStatus && filter.synchronizationStatus !== 'SYNC') || false;
    if (offlineData) {
      // TODO
    }
    return super.loadAll(offset, size, sortBy, sortDirection, filter, opts);
  }

//   async load(id:number, opts?:EntityServiceLoadOptions):Promise<DevicePosition<any, any>> {
//     if (isNil(id)) throw new Error('Missing argument \'id\'');
//
//     const now = Date.now();
//     if (this._debug) console.debug(`${this._logPrefix} : Loading {${id}}...`);
//     this.loading = false;
//
//     try {
// h
//     } catch (e) {
//     }
//   }

  protected async fillOfflineDefaultProperties(entity:DevicePosition<any>) {
  }

  protected async onConfigChanged(config:Configuration) {
    const enabled = config.getPropertyAsBoolean(DEVICE_POSITION_CONFIG_OPTION.ENABLE);
    const checkInterval = config.getPropertyAsNumbers(DEVICE_POSITION_CONFIG_OPTION.CHECK_INTERVAL)[0];
    this.saveInterval = config.getPropertyAsNumbers(DEVICE_POSITION_CONFIG_OPTION.SAVE_INTERVAL)[0];

    if (isNotNil(this.$checkLoop)) this.$checkLoop.unsubscribe();
    this._watching = (this.platform.mobile && enabled);
    if (!this._watching) {
      console.log(`${this._logPrefix} postion is not watched`, {mobile: this.platform.mobile, enabled: enabled});
      this.mustAskForEnableGeolocation.next(false);
      return;
    }
    await this.watchGeolocation();
    this.$checkLoop = interval(checkInterval).subscribe(async (_) => {
      console.debug(`${this._logPrefix} : begins to check device position each ${checkInterval}ms...`)
      this.watchGeolocation();
    });
  }

  protected async watchGeolocation() {
    if (this._debug) console.log(`${this._logPrefix} watching devices postion...`);
    let position:IPosition;
    try {
      position = await PositionUtils.getCurrentPosition(this.platform);
    } catch (e) {
      // User refuse to share its geolocation
      if (e.code == 1) this.mustAskForEnableGeolocation.next(true);
      // Other errors case
      else throw e;
      return;
    }
    this.lastPosition = {
      latitude: position.latitude,
      longitude: position.longitude,
      date: DateUtils.moment(),
    }
    console.log(`${this._logPrefix} : update last postison`, position);
    if (this.mustAskForEnableGeolocation.value === true) this.mustAskForEnableGeolocation.next(false);
    if (this._debug) console.debug(`${this._logPrefix} : ask for geolocation`, this.mustAskForEnableGeolocation.value);
  }

  protected async checkIfmustSaveDevicePosition(entity:DevicePosition<any, any>):Promise<boolean> {
    const diffTime = DateUtils.moment().diff(entity.dateTime);
    if (this._debug) console.debug(`${this._logPrefix} checkIfmustSaveDevicePosition : diff time between previous save is ${diffTime}`)
    return diffTime > this.saveInterval;
  }

  protected async getLastDevicePositionSavedLocally():Promise<DevicePosition<any, any>> {
    const currentId = await this.entities.currentValue(DevicePosition.TYPENAME);
    return this.entities.load<DevicePosition<any, any>>(currentId, DevicePosition.TYPENAME);
  }

  protected async getLastDevicePositionSavedRemotely() {
    // const result
  }

}
