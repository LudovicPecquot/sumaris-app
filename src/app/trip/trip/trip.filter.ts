import { RootDataEntityFilter } from '@app/data/services/model/root-data-filter.model';
import {
  EntityAsObjectOptions,
  EntityClass,
  FilterFn,
  fromDateISOString,
  isNil,
  isNotEmptyArray,
  isNotNil,
  Person,
  ReferentialRef,
  ReferentialUtils,
} from '@sumaris-net/ngx-components';
import { Moment } from 'moment';
import { Trip } from './trip.model';
import { VesselSnapshot } from '@app/referential/services/model/vessel-snapshot.model';
import { OperationFilter } from '@app/trip/operation/operation.filter';
import { PhysicalGearFilter } from '@app/trip/physicalgear/physical-gear.filter';
import { DataSynchroImportFilter } from '@app/data/services/root-data-synchro-service.class';
import { BBox } from 'geojson';

@EntityClass({ typename: 'TripFilterVO' })
export class TripFilter extends RootDataEntityFilter<TripFilter, Trip> {
  static fromObject: (source: any, opts?: any) => TripFilter;

  static toPhysicalGearFilter(f: Partial<TripFilter>): PhysicalGearFilter {
    if (!f) return undefined;
    return PhysicalGearFilter.fromObject({
      program: f.program,
      vesselId: f.vesselId,
      startDate: f.startDate,
      endDate: f.endDate,
    });
  }

  static toOperationFilter(f: Partial<TripFilter>): OperationFilter {
    if (!f) return undefined;
    return OperationFilter.fromObject({
      programLabel: f.program?.label,
      vesselId: f.vesselId,
      startDate: f.startDate,
      endDate: f.endDate,
      boundingBox: f.boundingBox,
    });
  }

  vesselId: number = null;
  vesselSnapshot: VesselSnapshot = null;
  location: ReferentialRef = null;
  startDate: Moment = null;
  endDate: Moment = null;
  observers?: Person[];
  includedIds: number[];
  excludedIds: number[];
  boundingBox?: BBox;
  observedLocationId: number;
  hasScientificCruise: boolean;
  hasObservedLocation: boolean;

  constructor() {
    super();
    this.dataQualityStatus = 'VALIDATED';
  }

  fromObject(source: any, opts?: any) {
    super.fromObject(source, opts);
    this.vesselId = source.vesselId;
    this.vesselSnapshot = source.vesselSnapshot && VesselSnapshot.fromObject(source.vesselSnapshot);
    this.startDate = fromDateISOString(source.startDate);
    this.endDate = fromDateISOString(source.endDate);
    this.location = ReferentialRef.fromObject(source.location);
    this.observers = source.observers && source.observers.map(Person.fromObject).filter(isNotNil) || [];
    this.includedIds = source.includedIds;
    this.excludedIds = source.excludedIds;
    this.boundingBox = source.boundingBox;
    this.observedLocationId = source.observedLocationId;
    this.hasScientificCruise = source.hasScientificCruise;
    this.hasObservedLocation = source.hasObservedLocation;
  }

  asObject(opts?: EntityAsObjectOptions): any {
    const target = super.asObject(opts);

    if (opts && opts.minify) {
      // Vessel
      target.vesselId = isNotNil(this.vesselId) ? this.vesselId : this.vesselSnapshot?.id;
      delete target.vesselSnapshot;

      // Location
      target.locationId = (this.location && this.location.id) || undefined;
      delete target.location;

      // Observers
      target.observerPersonIds = (isNotEmptyArray(this.observers) && this.observers.map((o) => o && o.id).filter(isNotNil)) || undefined;
      delete target.observers;

      // Exclude scientific cruise by default
      if (isNil(target.hasScientificCruise)) {
        target.hasScientificCruise = false;
      }
    } else {
      target.vesselSnapshot = (this.vesselSnapshot && this.vesselSnapshot.asObject(opts)) || undefined;
      target.location = (this.location && this.location.asObject(opts)) || undefined;
      target.observers = (this.observers && this.observers.map((o) => o && o.asObject(opts)).filter(isNotNil)) || [];
    }
    return target;
  }

  buildFilter(): FilterFn<Trip>[] {
    const filterFns = super.buildFilter();

    // Filter excluded ids
    if (isNotEmptyArray(this.excludedIds)) {
      filterFns.push((t) => isNil(t.id) || !this.excludedIds.includes(t.id));
    }

    // Filter included ids
    if (isNotEmptyArray(this.includedIds)) {
      filterFns.push((t) => isNotNil(t.id) && this.includedIds.includes(t.id));
    }

    // Vessel
    const vesselId = isNotNil(this.vesselId) ? this.vesselId : this.vesselSnapshot?.id;
    if (isNotNil(vesselId)) {
      filterFns.push((t) => t.vesselSnapshot?.id === vesselId);
    }

    // Location
    if (ReferentialUtils.isNotEmpty(this.location)) {
      const locationId = this.location.id;
      filterFns.push(
        (t) => (t.departureLocation && t.departureLocation.id === locationId) || (t.returnLocation && t.returnLocation.id === locationId)
      );
    }

    // Start/end period
    if (this.startDate) {
      const startDate = this.startDate.clone();
      filterFns.push((t) => (t.returnDateTime ? startDate.isSameOrBefore(t.returnDateTime) : startDate.isSameOrBefore(t.departureDateTime)));
    }
    if (this.endDate) {
      const endDate = this.endDate.clone().add(1, 'day').startOf('day');
      filterFns.push((t) => t.departureDateTime && endDate.isAfter(t.departureDateTime));
    }

    // Observers
    const observerIds = this.observers?.map((o) => o.id).filter(isNotNil);
    if (isNotEmptyArray(observerIds)) {
      filterFns.push((t) => t.observers?.some((o) => o && observerIds.includes(o.id)));
    }

    // has scientific cruise
    if (isNotNil(this.hasScientificCruise)) {
      filterFns.push((t) => isNotNil(t.scientificCruiseId) === this.hasScientificCruise);
    }

    // has observed location
    if (isNotNil(this.hasObservedLocation)) {
      filterFns.push((t) => isNotNil(t.landing?.id) === this.hasObservedLocation);
    }

    return filterFns;
  }

  protected isCriteriaNotEmpty(key: string, value: any): boolean {
    if (key === 'hasScientificCruise') return false; // Do not count hasScientificCruise
    return super.isCriteriaNotEmpty(key, value);
  }
}

export class TripSynchroImportFilter extends DataSynchroImportFilter {


  static toTripFilter(f: TripSynchroImportFilter): TripFilter {
    if (!f) return undefined;
    return TripFilter.fromObject({
      program: {label: f.programLabel},
      vesselId: f.vesselId,
      startDate: f.startDate,
      endDate: f.endDate
    });
  }

}
