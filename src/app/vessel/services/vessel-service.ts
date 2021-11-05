import { Injectable, Injector } from '@angular/core';
import { gql } from '@apollo/client/core';
import { Observable } from 'rxjs';
import { QualityFlagIds } from '../../referential/services/model/model.enum';
import {
  BaseEntityGraphqlQueries,
  EntityAsObjectOptions,
  EntitySaveOptions,
  EntityUtils,
  FormErrors,
  IEntitiesService,
  IEntityService,
  isEmptyArray,
  isNil,
  isNotNil,
  LoadResult,
  MINIFY_ENTITY_FOR_LOCAL_STORAGE,
  Person, ReferentialRef,
  StatusIds,
} from '@sumaris-net/ngx-components';
import { map } from 'rxjs/operators';
import { ReferentialFragments } from '../../referential/services/referential.fragments';
import { VesselFeatureQueries, VesselFeaturesFragments, VesselFeaturesService } from './vessel-features.service';
import { VesselRegistrationFragments, VesselRegistrationService, VesselRegistrationsQueries } from './vessel-registration.service';
import { Vessel } from './model/vessel.model';
import { VesselSnapshot } from '../../referential/services/model/vessel-snapshot.model';
import { SortDirection } from '@angular/material/sort';
import { DataRootEntityUtils } from '../../data/services/model/root-data-entity.model';
import { IDataSynchroService, RootDataSynchroService } from '../../data/services/root-data-synchro-service.class';
import { BaseRootEntityGraphqlMutations } from '../../data/services/root-data-service.class';
import { VESSEL_FEATURE_NAME } from './config/vessel.config';
import { VesselFilter } from './filter/vessel.filter';
import { MINIFY_OPTIONS } from '@app/core/services/model/referential.model';
import { environment } from '@environments/environment';
import {DomEvent} from 'leaflet';
import off = DomEvent.off;
import {Moment} from 'moment';
import {SynchronizationStatus} from '@app/data/services/model/model.utils';
import {VesselSnapshotFilter} from '@app/referential/services/filter/vessel.filter';


export const VesselFragments = {
  lightVessel: gql`fragment VesselFragment on VesselVO {
      id
      comments
      statusId
      creationDate
      controlDate
      validationDate
      qualificationDate
      qualificationComments
      updateDate
      comments
      program {
        id
        label
      }
      vesselType {
        ...ReferentialFragment
      }
      vesselFeatures {
        ...VesselFeaturesFragment
      }
      vesselRegistrationPeriod {
        ...VesselRegistrationPeriodFragment
      }
      recorderDepartment {
        ...LightDepartmentFragment
      }
      recorderPerson {
        ...LightPersonFragment
      }
    }`,
    vessel: gql`fragment VesselFragment on VesselVO {
        id
        comments
        statusId
        creationDate
        controlDate
        validationDate
        qualificationDate
        qualificationComments
        updateDate
        comments
        program {
          id
          label
        }
        vesselType {
            ...ReferentialFragment
        }
        vesselFeatures {
            ...VesselFeaturesFragment
        }
        vesselRegistrationPeriod {
            ...VesselRegistrationPeriodFragment
        }
        recorderDepartment {
            ...LightDepartmentFragment
        }
        recorderPerson {
            ...LightPersonFragment
        }
    }`
};


const VesselQueries: BaseEntityGraphqlQueries = {
  load: gql`query Vessel($id: Int!) {
        data: vessel(id: $id) {
            ...VesselFragment
        }
    }
    ${VesselFragments.vessel}
    ${VesselFeaturesFragments.vesselFeatures}
    ${VesselRegistrationFragments.registration}
    ${ReferentialFragments.location}
    ${ReferentialFragments.lightDepartment}
    ${ReferentialFragments.lightPerson}
    ${ReferentialFragments.referential}`,

  loadAllWithTotal: gql`query Vessels($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: VesselFilterVOInput){
        data: vessels(offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection, filter: $filter){
            ...VesselFragment
        }
        total: vesselsCount(filter: $filter)
    }
    ${VesselFragments.vessel}
    ${VesselFeaturesFragments.vesselFeatures}
    ${VesselRegistrationFragments.registration}
    ${ReferentialFragments.location}
    ${ReferentialFragments.lightDepartment}
    ${ReferentialFragments.lightPerson}
    ${ReferentialFragments.referential}`,

  loadAll: gql`query Vessels($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: VesselFilterVOInput){
        data: vessels(offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection, filter: $filter){
            ...VesselFragment
        }
    }
    ${VesselFragments.vessel}
    ${VesselFeaturesFragments.vesselFeatures}
    ${VesselRegistrationFragments.registration}
    ${ReferentialFragments.location}
    ${ReferentialFragments.lightDepartment}
    ${ReferentialFragments.lightPerson}
    ${ReferentialFragments.referential}`
};


const VesselMutations: BaseRootEntityGraphqlMutations = {
  saveAll: gql`mutation SaveVessels($data:[VesselVOInput]!){
        data: saveVessels(vessels: $data){
            ...VesselFragment
        }
    }
    ${VesselFragments.vessel}
    ${VesselFeaturesFragments.vesselFeatures}
    ${VesselRegistrationFragments.registration}
    ${ReferentialFragments.location}
    ${ReferentialFragments.lightDepartment}
    ${ReferentialFragments.lightPerson}
    ${ReferentialFragments.referential}`,

  deleteAll: gql`mutation DeleteVessels($ids:[Int]!){
        deleteVessels(ids: $ids)
    }`
};

export interface VesselSaveOptions extends EntitySaveOptions {
  previousVessel?: Vessel;
  isNewFeatures?: boolean;
  isNewRegistration?: boolean;
}

@Injectable({providedIn: 'root'})
export class VesselService
  extends RootDataSynchroService<Vessel, VesselFilter>
  implements
    IEntitiesService<Vessel, VesselFilter>,
    IEntityService<Vessel>,
    IDataSynchroService<Vessel> {

  constructor(
    injector: Injector,
    private vesselFeatureService: VesselFeaturesService,
    private vesselRegistrationService: VesselRegistrationService,
  ) {
    super(injector, Vessel, VesselFilter, {
      queries: VesselQueries,
      mutations: VesselMutations,
      equalsFn: (e1, e2) => this.vesselEquals(e1, e2)
    });
    this._featureName = VESSEL_FEATURE_NAME;
    this._debug = !environment.production;
  }

  private vesselEquals(e1: Vessel, e2: Vessel) {
    return e1 && e2 && (
      // check id equals
      e1.id === e2.id ||
      // or exteriorMarking and registrationCode equals
      (e1.vesselFeatures?.exteriorMarking === e2.vesselFeatures?.exteriorMarking &&
        e1.vesselRegistrationPeriod?.registrationCode === e2.vesselRegistrationPeriod?.registrationCode)
    );
  }

  /**
   * Load many vessels
   * @param offset
   * @param size
   * @param sortBy
   * @param sortDirection
   * @param filter
   */
  watchAll(offset: number,
           size: number,
           sortBy?: string,
           sortDirection?: SortDirection,
           filter?: VesselFilter): Observable<LoadResult<Vessel>> {

    // Load offline
    const offline = this.network.offline || filter && filter.synchronizationStatus && filter.synchronizationStatus !== 'SYNC';
    if (offline) {
      return this.watchAllLocally(offset, size, sortBy, sortDirection, filter);
    }

    return super.watchAll(offset, size,  sortBy || 'features.exteriorMarking', sortDirection, filter);
  }

  watchAllLocally(offset: number,
                 size: number,
                 sortBy?: string,
                 sortDirection?: SortDirection,
                 filter?: Partial<VesselFilter>): Observable<LoadResult<Vessel>> {

    const vesselSnapshotFilter: Partial<VesselSnapshotFilter> = {
      date: filter && filter.date  || undefined,
      vesselId: filter && filter.vesselId || undefined,
      statusId: filter && filter.statusId || undefined,
      statusIds: filter && filter.statusIds || undefined,
      registrationLocation: filter && filter.registrationLocation || undefined,
      basePortLocation: filter && filter.basePortLocation || undefined,
      vesselType: filter && filter.vesselType || undefined
    }

    if (this._debug) console.debug("[vessel-service] Loading local vessels :");

    return  this.vesselSnapshotService.watchAllLocally(offset, size, sortBy.substr(sortBy.lastIndexOf('.') + 1), sortDirection, vesselSnapshotFilter)
      .pipe(
      map(({data, total}) => {
        const entities = (data || []).map(Vessel.fromVesselSnapshot);
        return {data: entities, total};
      }));
  }

  /**
   * Save many vessels
   * @param vessels
   */
  async saveAll(entities: Vessel[], opts?: VesselSaveOptions): Promise<Vessel[]> {

    return super.saveAll(entities, {
      ...opts,
      update: (proxy, {data}) => {
        if (isEmptyArray(data && data.data)) return; // Skip if empty

        // update features history FIXME: marche pas
        if (opts && opts.isNewFeatures) {
          const lastFeatures = entities[entities.length - 1].vesselFeatures;
          this.vesselFeatureService.insertIntoMutableCachedQueries(proxy, {
            query: VesselFeatureQueries.loadAll,
            data: lastFeatures
          });
        }

        // update registration history FIXME: marche pas
        if (opts && opts.isNewRegistration) {
          const lastRegistration = entities[entities.length - 1].vesselRegistrationPeriod;
          this.vesselRegistrationService.insertIntoMutableCachedQueries(proxy, {
            query: VesselRegistrationsQueries.loadAll,
            data: lastRegistration
          });
        }

      }
    });
  }

  /**
   * Save a vessel
   * @param entity
   * @param opts
   */
  async save(entity: Vessel, opts?: VesselSaveOptions): Promise<Vessel> {

    // prepare previous vessel to save if present
    if (opts && isNotNil(opts.previousVessel)) {

      // update previous features
      if (opts.isNewFeatures) {
        // set end date = new start date - 1
        const newStartDate = entity.vesselFeatures.startDate.clone();
        newStartDate.subtract(1, "seconds");
        opts.previousVessel.vesselFeatures.endDate = newStartDate;

      }
      // prepare previous registration period
      else if (opts.isNewRegistration) {
        // set registration end date = new registration start date - 1
        const newRegistrationStartDate = entity.vesselRegistrationPeriod.startDate.clone();
        newRegistrationStartDate.subtract(1, "seconds");
        opts.previousVessel.vesselRegistrationPeriod.endDate = newRegistrationStartDate;
      }

      // save both by calling saveAll
      const savedVessels: Vessel[] = await this.saveAll([opts.previousVessel, entity], opts);
      // then return last
      return Promise.resolve(savedVessels.pop());
    }

    // Prepare to save
    this.fillDefaultProperties(entity);

    // Save locally, when offline
    const offline = this.network.offline || EntityUtils.isLocal(entity) || (entity.synchronizationStatus && entity.synchronizationStatus !== 'SYNC');
    if (offline) {
      console.debug("[vessel-service] Saving a vessel locally...");

      // Make sure to fill id, with local ids
      await this.fillOfflineDefaultProperties(entity);

      const json = this.asObject(entity, MINIFY_ENTITY_FOR_LOCAL_STORAGE);
      if (this._debug) console.debug('[vessel-service] [offline] Saving vessel locally...', json);

      // Save vessel locally
      await this.entities.save(json);

      // Transform to vesselSnapshot, and add to offline storage
      const vesselSnapshot = VesselSnapshot.fromVessel(entity).asObject(MINIFY_ENTITY_FOR_LOCAL_STORAGE);
      await this.entities.save(vesselSnapshot);

      return entity;
    }

    // Save remotely
    return super.save(entity, opts);
  }

  /**
   * Save a vessel
   * @param entity
   * @param opts
   */
  async saveLocally(entity: Vessel, opts?: VesselSaveOptions): Promise<Vessel> {

    // prepare previous vessel to save if present
    if (opts && isNotNil(opts.previousVessel)) {

      // update previous features
      if (opts.isNewFeatures) {
        // set end date = new start date - 1
        const newStartDate = entity.vesselFeatures.startDate.clone();
        newStartDate.subtract(1, "seconds");
        opts.previousVessel.vesselFeatures.endDate = newStartDate;

      }
      // prepare previous registration period
      else if (opts.isNewRegistration) {
        // set registration end date = new registration start date - 1
        const newRegistrationStartDate = entity.vesselRegistrationPeriod.startDate.clone();
        newRegistrationStartDate.subtract(1, "seconds");
        opts.previousVessel.vesselRegistrationPeriod.endDate = newRegistrationStartDate;
      }

      // save both by calling saveAll
      const savedVessels: Vessel[] = await this.saveAll([opts.previousVessel, entity], opts);
      // then return last
      return Promise.resolve(savedVessels.pop());
    }

    // Prepare to save
    this.fillDefaultProperties(entity);

    // Save locally, when offline
    const offline = this.network.offline || EntityUtils.isLocal(entity);
    if (offline) {
      console.debug("[vessel-service] Saving a vessel locally...");

      // Make sure to fill id, with local ids
      await this.fillOfflineDefaultProperties(entity);

      const json = this.asObject(entity, MINIFY_ENTITY_FOR_LOCAL_STORAGE);
      if (this._debug) console.debug('[vessel-service] [offline] Saving vessel locally...', json);

      // Save vessel locally
      await this.entities.save(json);

      // Transform to vesselSnapshot, and add to offline storage
      const vesselSnapshot = VesselSnapshot.fromVessel(entity).asObject(MINIFY_ENTITY_FOR_LOCAL_STORAGE);
      await this.entities.save(vesselSnapshot);

      return entity;
    }

    // Save remotely
    return super.save(entity, opts);
  }

  protected async deleteAllLocally(entities: Vessel[], opts?: { trash?: boolean }): Promise<any> {
    // Delete the vessel
    await super.deleteAllLocally(entities, opts);

    // Delete the associated vessel snapshot
    const snapshots = entities.filter(DataRootEntityUtils.isLocal).map(e => e.id);
    if (isEmptyArray(snapshots)) return; // Skip
    await this.entities.deleteMany(snapshots, {entityName: VesselSnapshot.TYPENAME});
  }

  async synchronize(data: Vessel, opts?: any): Promise<Vessel> {
    console.info(`[vessel-service] Synchronizing vessel {${data.id}}...`);
    return data;
  }

  listenChanges(id: number, options?: any): Observable<Vessel> {
    throw new Error("Method not implemented.");
  }

  control(entity: Vessel, opts?: any): Promise<FormErrors> {
    return undefined; // Not implemented
  }

  async terminate(entity: Vessel): Promise<Vessel> {
    return entity; // Not implemented
  }

  /* -- protected methods -- */

  protected asObject(vessel: Vessel, opts?: EntityAsObjectOptions): any {
    return vessel.asObject({...MINIFY_OPTIONS, ...opts} as EntityAsObjectOptions);
  }

  protected fillDefaultProperties(entity: Vessel) {

    const person: Person = this.accountService.account;

    // Recorder department
    if (person && person.department && (!entity.recorderDepartment || entity.recorderDepartment.id !== person.department.id)) {
      if (!entity.recorderDepartment) {
        entity.recorderDepartment = person.department;
      }
      else {
        // Update the recorder department
        entity.recorderDepartment.id = person.department.id;
      }

      if (entity.vesselFeatures) {
        if (!entity.vesselFeatures.recorderDepartment) {
          entity.vesselFeatures.recorderDepartment = person.department;
        }
        else {
          // Update the VF recorder department
          entity.vesselFeatures.recorderDepartment.id = person.department.id;
        }
      }
    }

    // Recorder person
    if (person && (!entity.recorderPerson || entity.recorderPerson.id !== person.id)) {
      if (!entity.recorderPerson) {
        entity.recorderPerson = new Person();
      }
      entity.recorderPerson.id = person.id;
      if (entity.vesselFeatures) {
        if (!entity.vesselFeatures.recorderPerson) {
          entity.vesselFeatures.recorderPerson = new Person();
        }
        entity.vesselFeatures.recorderPerson.id = person.id;
      }
    }

    // Quality flag (set default)
    if (entity.vesselFeatures && isNil(entity.vesselFeatures.qualityFlagId)) {
      entity.vesselFeatures.qualityFlagId = QualityFlagIds.NOT_QUALIFIED;
    }

  }

  protected async fillOfflineDefaultProperties(entity: Vessel) {
    const isNew = isNil(entity.id);

    // If new, generate a local id
    if (isNew) {
      entity.id =  await this.entities.nextValue(entity);
    }

    // Force status as temporary
    entity.statusId = StatusIds.TEMPORARY;
  }

  copyIdAndUpdateDate(source: Vessel | undefined, target: Vessel) {

    EntityUtils.copyIdAndUpdateDate(source, target);
    if (source) {
      EntityUtils.copyIdAndUpdateDate(source.vesselFeatures, target.vesselFeatures);
      EntityUtils.copyIdAndUpdateDate(source.vesselRegistrationPeriod, target.vesselRegistrationPeriod);
    }

  }
}
