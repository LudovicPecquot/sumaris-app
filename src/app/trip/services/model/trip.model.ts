import { Moment } from 'moment';
import { DataEntity, DataEntityAsObjectOptions } from '@app/data/services/model/data-entity.model';
import {IEntityWithMeasurement, Measurement, MeasurementFormValues, MeasurementModelValues, MeasurementUtils, MeasurementValuesUtils} from './measurement.model';
import {Sale} from './sale.model';
import {EntityClass, EntityUtils, fromDateISOString, isEmptyArray, isNil, isNotNil, Person, ReferentialAsObjectOptions, ReferentialRef, toDateISOString} from '@sumaris-net/ngx-components';
import {FishingArea} from './fishing-area.model';
import {DataRootVesselEntity} from '@app/data/services/model/root-vessel-entity.model';
import {IWithObserversEntity} from '@app/data/services/model/model.utils';
import {RootDataEntity} from '@app/data/services/model/root-data-entity.model';
import {Landing} from './landing.model';
import {Sample} from './sample.model';
import {Batch} from './batch.model';
import {IWithProductsEntity, Product} from './product.model';
import {IWithPacketsEntity, Packet} from './packet.model';
import {NOT_MINIFY_OPTIONS} from '@app/core/services/model/referential.model';
import {ExpectedSale} from '@app/trip/services/model/expected-sale.model';
import {VesselSnapshot} from '@app/referential/services/model/vessel-snapshot.model';
import { Metier } from "@app/referential/services/model/metier.model";
import { IPosition } from '@app/trip/services/model/position.model';

/* -- Helper function -- */


/* -- Data -- */

const sortByDateTimeFn = (n1: VesselPosition, n2: VesselPosition) => {
  return n1.dateTime.isSame(n2.dateTime) ? 0 : (n1.dateTime.isAfter(n2.dateTime) ? 1 : -1);
};

export interface OperationAsObjectOptions extends DataEntityAsObjectOptions {
  batchAsTree?: boolean;
  sampleAsTree?: boolean;
  keepTrip?: boolean; //Allow to keep trip, needed to apply filter on local storage
}

export interface OperationFromObjectOptions {
  withSamples?: boolean;
  withBatchTree?: boolean;
}

@EntityClass({typename: 'OperationVO'})
export class Operation extends DataEntity<Operation, number, OperationAsObjectOptions, OperationFromObjectOptions> {

  static fromObject: (source: any, opts?: OperationFromObjectOptions) => Operation;

  startDateTime: Moment = null;
  endDateTime: Moment = null;
  fishingStartDateTime: Moment = null;
  fishingEndDateTime: Moment = null;
  comments: string = null;
  rankOrderOnPeriod: number = null;
  hasCatch: boolean = null;
  positions: VesselPosition[] = null;
  startPosition: VesselPosition = null;
  endPosition: VesselPosition = null;

  metier: Metier = null;
  physicalGear: PhysicalGear = null;
  tripId: number = null;
  trip: Trip = null;

  measurements: Measurement[] = [];
  samples: Sample[] = null;
  catchBatch: Batch = null;
  fishingAreas: FishingArea[] = [];
  parentOperationId: number = null;
  parentOperation: Operation = null;
  qualityFlagId: number = null;
  childOperationId: number = null;
  childOperation: Operation = null;

  constructor() {
    super(Operation.TYPENAME);
  }

  asObject(opts?: OperationAsObjectOptions): any {
    const target = super.asObject(opts);
    target.startDateTime = toDateISOString(this.startDateTime);
    target.endDateTime = toDateISOString(this.endDateTime);
    target.fishingStartDateTime = toDateISOString(this.fishingStartDateTime);
    target.fishingEndDateTime = toDateISOString(this.fishingEndDateTime);

    target.endDateTime = target.endDateTime || target.startDateTime;

    // If end position is valid (has latitude AND longitude)
    if (target.endPosition && target.endPosition.latitude && target.endPosition.longitude) {

      // Fill end date, using start date (if on FIELD mode, can be null, but Pod has NOT NULL constraint)
      if (!target.endPosition.dateTime) {
        // Create a copy
        target.endPosition = target.endPosition.clone();
        target.endPosition.dateTime = target.endPosition.dateTime || target.fishingEndDateTime || target.endDateTime;
      }
    }
    // Invalid position (missing latitude or longitude - allowed in on FIELD mode): remove it
    else {
      delete target.endPosition;
    }

    // Create an array of position, instead of start/end
    target.positions = [target.startPosition, target.endPosition]
      .filter(p => p && p.dateTime)
      .map(p => p && p.asObject(opts)) || undefined;
    delete target.startPosition;
    delete target.endPosition;

    // Physical gear
    target.physicalGear = this.physicalGear.asObject({...opts, ...NOT_MINIFY_OPTIONS /*Avoid minify, to keep gear for operations tables cache*/});
    delete target.physicalGear.measurementValues;
    target.physicalGearId = this.physicalGear && this.physicalGear.id;
    if (opts && opts.keepLocalId === false && target.physicalGearId < 0) {
      delete target.physicalGearId; // Remove local id
    }

    // Metier
    target.metier = this.metier && this.metier.asObject({...opts, ...NOT_MINIFY_OPTIONS /*Always minify=false, because of operations tables cache*/}) || undefined;

    // Measurements
    target.measurements = this.measurements && this.measurements.filter(MeasurementUtils.isNotEmpty).map(m => m.asObject(opts)) || undefined;

    // Samples
    {
      // Serialize samples into a tree (will keep only children arrays, and removed parentId and parent)
      if (!opts || opts.sampleAsTree !== false) {
        target.samples = this.samples
          // Select root samples
          && this.samples.filter(s => isNil(s.parentId) && isNil(s.parent))
            .map(s => s.asObject({...opts, withChildren: true})) || undefined;
      } else {
        // Serialize as samples array (this will fill parentId, and remove children and parent properties)
        target.samples = Sample.treeAsObjectArray(this.samples, opts);
      }
    }

    // Batch
    if (target.catchBatch) {
      // Serialize batches into a tree (will keep only children arrays, and removed parentId and parent)
      if (!opts || opts.batchAsTree !== false) {
        target.catchBatch = this.catchBatch && this.catchBatch.asObject({
          ...opts,
          withChildren: true
        }) || undefined;
      }
      // Serialize as batches array (this will fill parentId, and remove children and parent properties)
      else {
        target.batches = Batch.treeAsObjectArray(target.catchBatch, opts);
        delete target.catchBatch;
      }
    }

    // Fishing areas
    target.fishingAreas = this.fishingAreas && this.fishingAreas.map(value => value.asObject(opts)) || undefined;

    //Parent Operation
    target.parentOperationId = this.parentOperationId || this.parentOperation && this.parentOperation.id;
    target.childOperationId = this.childOperationId || this.childOperation && this.childOperation.id;

    if (opts.minify) {
      delete target.operationTypeId;
      delete target.parentOperation;
      delete target.childOperation;
    } else {
      target.parentOperation = this.parentOperation && this.parentOperation.asObject(opts) || undefined;
      target.childOperation = this.childOperation && this.childOperation.asObject(opts) || undefined;
    }

    if (opts.keepTrip) {
      target.trip = this.trip && this.trip || undefined;

    } else {
      delete target.trip;
    }
    return target;
  }

  fromObject(source: any, opts?: OperationFromObjectOptions) {
    super.fromObject(source, opts);
    this.hasCatch = source.hasCatch;
    this.comments = source.comments;
    this.tripId = source.tripId;
    this.trip = source.trip && Trip.fromObject(source.trip) || undefined;
    this.physicalGear = (source.physicalGear || source.physicalGearId) ? PhysicalGear.fromObject(source.physicalGear || {id: source.physicalGearId}) : undefined;
    this.startDateTime = fromDateISOString(source.startDateTime);
    this.endDateTime = fromDateISOString(source.endDateTime);

    this.fishingStartDateTime = fromDateISOString(source.fishingStartDateTime);
    this.fishingEndDateTime = fromDateISOString(source.fishingEndDateTime);
    this.rankOrderOnPeriod = source.rankOrderOnPeriod;
    this.metier = source.metier && Metier.fromObject(source.metier, {useChildAttributes: 'TaxonGroup'}) || undefined;
    if (source.startPosition || source.endPosition) {
      this.startPosition = source.startPosition && VesselPosition.fromObject(source.startPosition);
      this.endPosition = source.endPosition && VesselPosition.fromObject(source.endPosition);
      this.positions = undefined;
    } else if (source.positions) {
      const positions = source.positions.map(VesselPosition.fromObject).sort(sortByDateTimeFn) || undefined;
      if (positions.length >= 1 && positions.length <= 2) {
        this.startPosition = positions[0];
        if (positions.length > 1) {
          this.endPosition = positions.pop(); // last
        }
        this.positions = undefined;
      } else {
        this.startPosition = undefined;
        this.endPosition = undefined;
        this.positions = positions;
      }
    }
    this.measurements = [
      ...(source.measurements && source.measurements.map(Measurement.fromObject) || []),
      ...(source.gearMeasurements && source.gearMeasurements.map(Measurement.fromObject) || [])
    ];

    // Remove fake dates (e.g. if endDateTime = startDateTime)
    if (this.endDateTime && this.endDateTime.isSameOrBefore(this.startDateTime)) {
      this.endDateTime = undefined;
    }
    if (this.fishingEndDateTime && this.fishingEndDateTime.isSameOrBefore(this.fishingStartDateTime)) {
      this.fishingEndDateTime = undefined;
    }
    if (this.endPosition && this.endPosition.dateTime && this.startPosition && this.endPosition.dateTime.isSameOrBefore(this.startPosition.dateTime)) {
      this.endPosition.dateTime = undefined;
    }

    // Fishing areas
    this.fishingAreas = source.fishingAreas && source.fishingAreas.map(FishingArea.fromObject) || undefined;

    // Samples
    if (!opts || opts.withSamples !== false) {
      this.samples = source.samples && source.samples.map(source => Sample.fromObject(source, {withChildren: true})) || undefined;
    }

    // Batches
    if (!opts || opts.withBatchTree !== false) {
      this.catchBatch = source.catchBatch && !source.batches ?
        // Reuse existing catch batch (useful for local entity)
        Batch.fromObject(source.catchBatch, {withChildren: true}) :
        // Convert list to tree (useful when fetching from a pod)
        Batch.fromObjectArrayAsTree(source.batches);
    }

    //Parent Operation
    this.parentOperationId = source.parentOperationId;
    this.parentOperation = (source.parentOperation || source.parentOperationId) ? Operation.fromObject(source.parentOperation || {id: source.parentOperationId}) : undefined;

    //Child Operation
    this.childOperationId = source.childOperationId;
    this.childOperation = (source.childOperation || source.childOperationId) ? Operation.fromObject(source.childOperation || {id: source.childOperationId}) : undefined;
  }

  equals(other: Operation): boolean {
    return super.equals(other)
      || ((this.startDateTime === other.startDateTime
          || (!this.startDateTime && !other.startDateTime && this.fishingStartDateTime === other.fishingStartDateTime))
        && ((!this.rankOrderOnPeriod && !other.rankOrderOnPeriod) || (this.rankOrderOnPeriod === other.rankOrderOnPeriod))
      );
  }
}

@EntityClass({typename: 'OperationGroupVO'})
export class OperationGroup extends DataEntity<OperationGroup>
  implements IWithProductsEntity<OperationGroup>, IWithPacketsEntity<OperationGroup> {

  static fromObject: (source: any) => OperationGroup;

  comments: string;
  rankOrderOnPeriod: number;
  hasCatch: boolean;

  metier: Metier = null;
  physicalGearId: number;
  tripId: number;
  trip: RootDataEntity<any>;

  measurements: Measurement[] = [];
  gearMeasurements: Measurement[] = [];

  // all measurements in table
  measurementValues: MeasurementModelValues | MeasurementFormValues = {};

  products: Product[] = [];
  samples: Sample[] = [];
  packets: Packet[] = [];
  fishingAreas: FishingArea[] = [];

  constructor() {
    super(OperationGroup.TYPENAME);
  }

  asObject(opts?: DataEntityAsObjectOptions & { batchAsTree?: boolean }): any {
    const target = super.asObject(opts);

    target.metier = this.metier && this.metier.asObject({...opts, ...NOT_MINIFY_OPTIONS /*Always minify=false, because of operations tables cache*/} as ReferentialAsObjectOptions) || undefined;

    // Measurements
    target.measurements = this.measurements && this.measurements.filter(MeasurementUtils.isNotEmpty).map(m => m.asObject(opts)) || undefined;
    target.gearMeasurements = this.gearMeasurements && this.gearMeasurements.filter(MeasurementUtils.isNotEmpty).map(m => m.asObject(opts)) || undefined;
    target.measurementValues = MeasurementValuesUtils.asObject(this.measurementValues, opts);
    delete target.gearMeasurementValues; // all measurements are stored only measurementValues

    // Products
    target.products = this.products && this.products.map(product => {
      const p = product.asObject(opts);
      // Affect parent link
      p.operationId = target.id;
      return p;
    }) || undefined;

    // Samples
    target.samples = this.samples && this.samples.map(sample => {
      const s = sample.asObject({...opts, withChildren: true});
      // Affect parent link
      s.operationId = target.id;
      return s;
    }) || undefined;

    // Packets
    target.packets = this.packets && this.packets.map(packet => {
      const p = packet.asObject(opts);
      // Affect parent link
      p.operationId = target.id;
      return p;
    }) || undefined;

    // Fishing areas
    target.fishingAreas = this.fishingAreas && this.fishingAreas.map(value => value.asObject(opts)) || undefined;

    return target;
  }

  fromObject(source: any): OperationGroup {
    super.fromObject(source);
    this.hasCatch = source.hasCatch;
    this.comments = source.comments;
    this.tripId = source.tripId;
    this.rankOrderOnPeriod = source.rankOrderOnPeriod;
    this.metier = source.metier && Metier.fromObject(source.metier) || undefined;
    this.physicalGearId = source.physicalGearId;

    // Measurements
    this.measurements = source.measurements && source.measurements.map(Measurement.fromObject) || [];
    this.gearMeasurements = source.gearMeasurements && source.gearMeasurements.map(Measurement.fromObject) || [];
    this.measurementValues = {
      ...MeasurementUtils.toMeasurementValues(this.measurements),
      ...MeasurementUtils.toMeasurementValues(this.gearMeasurements),
      ...source.measurementValues // important: keep at last assignment
    };
    if (Object.keys(this.measurementValues).length === 0) {
      console.warn('Source as no measurement. Should never occur! ', source);
    }

    // Products
    this.products = source.products && source.products.map(Product.fromObject) || [];
    // Affect parent
    this.products.forEach(product => {
      product.parent = this;
      product.operationId = this.id;
    });

    // Samples
    this.samples = source.samples && source.samples.map(source => Sample.fromObject(source, {withChildren: true})) || [];
    // Affect parent
    this.samples.forEach(sample => {
      sample.operationId = this.id;
    });

    // Packets
    this.packets = source.packets && source.packets.map(Packet.fromObject) || [];
    // Affect parent
    this.packets.forEach(packet => {
      packet.parent = this;
    });

    // Fishing areas
    this.fishingAreas = source.fishingAreas && source.fishingAreas.map(FishingArea.fromObject) || undefined;

    return this;
  }

  equals(other: OperationGroup): boolean {
    return super.equals(other)
      || (
        this.metier.equals(other.metier) && ((!this.rankOrderOnPeriod && !other.rankOrderOnPeriod) || (this.rankOrderOnPeriod === other.rankOrderOnPeriod))
      );
  }
}

@EntityClass({typename: 'TripVO'})
export class Trip extends DataRootVesselEntity<Trip> implements IWithObserversEntity<Trip> {

  static fromObject: (source: any, opts?: any) => Trip;

  departureDateTime: Moment = null;
  returnDateTime: Moment = null;
  departureLocation: ReferentialRef = null;
  returnLocation: ReferentialRef = null;
  sale: Sale = null;
  expectedSale: ExpectedSale = null;
  gears: PhysicalGear[] = null;
  measurements: Measurement[] = null;
  observers: Person[] = null;
  metiers: ReferentialRef[] = null;
  operations?: Operation[] = null;
  operationGroups?: OperationGroup[] = null;
  fishingAreas?: FishingArea[] = null;
  landing?: Landing = null;
  observedLocationId?: number = null;

  constructor() {
    super(Trip.TYPENAME);
  }

  asObject(options?: DataEntityAsObjectOptions & { batchAsTree?: boolean }): any {
    const target = super.asObject(options);
    target.departureDateTime = toDateISOString(this.departureDateTime);
    target.returnDateTime = toDateISOString(this.returnDateTime);
    target.departureLocation = this.departureLocation && this.departureLocation.asObject({...options, ...NOT_MINIFY_OPTIONS}) || undefined;
    target.returnLocation = this.returnLocation && this.returnLocation.asObject({...options, ...NOT_MINIFY_OPTIONS}) || undefined;
    target.sale = this.sale && this.sale.asObject(options) || undefined;
    target.expectedSale = this.expectedSale && this.expectedSale.asObject(options) || undefined;
    target.gears = this.gears && this.gears.map(p => p && p.asObject(options)) || undefined;
    target.measurements = this.measurements && this.measurements.filter(MeasurementUtils.isNotEmpty).map(m => m.asObject(options)) || undefined;
    target.observers = this.observers && this.observers.map(p => p && p.asObject({...options, ...NOT_MINIFY_OPTIONS})) || undefined;

    // Metiers
    target.metiers = this.metiers && this.metiers.filter(isNotNil).map(p => p && p.asObject({...options, ...NOT_MINIFY_OPTIONS})) || undefined;
    if (isEmptyArray(target.metiers)) delete target.metiers; // Clean is empty, for compat with previous version

    // Operations
    target.operations = this.operations && this.operations.map(o => o.asObject(options)) || undefined;

    // Operation groups
    target.operationGroups = this.operationGroups && this.operationGroups.filter(isNotNil).map(o => o.asObject(options)) || undefined;
    if (isEmptyArray(target.operationGroups)) delete target.operationGroups; // Clean if empty, for compat with previous version

    // Fishing areas
    target.fishingAreas = this.fishingAreas && this.fishingAreas.map(p => p && p.asObject(options)) || undefined;

    // Landing
    target.landing = this.landing && this.landing.asObject(options) || undefined;

    return target;
  }

  fromObject(source: any, opts?: any): Trip {
    super.fromObject(source);
    this.departureDateTime = fromDateISOString(source.departureDateTime);
    this.returnDateTime = fromDateISOString(source.returnDateTime);
    this.departureLocation = source.departureLocation && ReferentialRef.fromObject(source.departureLocation);
    this.returnLocation = source.returnLocation && ReferentialRef.fromObject(source.returnLocation);
    this.sale = source.sale && Sale.fromObject(source.sale) || undefined;
    this.expectedSale = source.expectedSale && ExpectedSale.fromObject(source.expectedSale) || undefined;

    this.gears = source.gears && source.gears.filter(isNotNil).map(PhysicalGear.fromObject)
      // Sort by rankOrder (useful for gears combo, in the operation form)
      .sort(EntityUtils.sortComparator('rankOrder')) || undefined;

    this.measurements = source.measurements && source.measurements.map(Measurement.fromObject) || [];
    this.observers = source.observers && source.observers.map(Person.fromObject) || [];
    this.metiers = source.metiers && source.metiers.map(ReferentialRef.fromObject) || [];

    if (source.operations) {
      this.operations = source.operations
        .map(Operation.fromObject)
        .map((o: Operation) => {
          o.tripId = this.id;
          // Ling to trip's gear
          o.physicalGear = o.physicalGear && (this.gears || []).find(g => o.physicalGear.equals(g));
          return o;
        });
    }

    this.operationGroups = source.operationGroups && source.operationGroups.map(OperationGroup.fromObject) || [];

    // Remove fake dates (e.g. if returnDateTime = departureDateTime)
    if (this.returnDateTime && this.returnDateTime.isSameOrBefore(this.departureDateTime)) {
      this.returnDateTime = undefined;
    }

    // Fishing areas
    this.fishingAreas = source.fishingAreas && source.fishingAreas.map(FishingArea.fromObject) || [];

    this.landing = source.landing && Landing.fromObject(source.landing) || undefined;
    this.observedLocationId = source.observedLocationId;

    this.vesselSnapshot = source.vesselSnapshot && VesselSnapshot.fromObject(source.vesselSnapshot) || undefined;

    return this;
  }

  equals(other: Trip): boolean {
    return super.equals(other)
      || (
        // Same vessel
        (this.vesselSnapshot && other.vesselSnapshot && this.vesselSnapshot.id === other.vesselSnapshot.id)
        // Same departure date (or, if not set, same return date)
        && ((this.departureDateTime === other.departureDateTime)
          || (!this.departureDateTime && !other.departureDateTime && this.returnDateTime === other.returnDateTime))
      );
  }
}

@EntityClass({typename: 'PhysicalGearVO'})
export class PhysicalGear extends RootDataEntity<PhysicalGear> implements IEntityWithMeasurement<PhysicalGear> {

  static fromObject: (source: any, opts?: any) => PhysicalGear;

  rankOrder: number = null;
  gear: ReferentialRef = null;
  measurements: Measurement[] = null;
  measurementValues: { [key: string]: string } = {};

  // Parent (used when lookup gears)
  trip: Trip = null;
  tripId: number = null;

  constructor() {
    super(PhysicalGear.TYPENAME);
  }

  copy(target: PhysicalGear) {
    target.fromObject(this);
  }

  asObject(opts?: DataEntityAsObjectOptions): any {
    const target = super.asObject(opts);
    target.gear = this.gear && this.gear.asObject({...opts, ...NOT_MINIFY_OPTIONS}) || undefined;
    // Fixme gear entityName here
    if (target.gear)
      target.gear.entityName = 'GearVO';

    target.rankOrder = this.rankOrder;

    // Measurements
    target.measurementValues = MeasurementValuesUtils.asObject(this.measurementValues, opts);
    if (isEmptyArray(target.measurements)) delete target.measurements;

    return target;
  }

  fromObject(source: any): PhysicalGear {
    super.fromObject(source);
    this.rankOrder = source.rankOrder;
    this.gear = source.gear && ReferentialRef.fromObject(source.gear);
    this.measurementValues = source.measurementValues && {...source.measurementValues} || MeasurementUtils.toMeasurementValues(source.measurements);

    // Parent trip
    if (source.trip) {
      this.trip = source.trip && Trip.fromObject(source.trip);
      this.tripId = this.trip && this.trip.id;
    } else {
      this.trip = null;
      this.tripId = null;
    }

    return this;
  }

  equals(other: PhysicalGear): boolean {
    return super.equals(other)
      || (
        // Same gear
        (this.gear && other.gear && this.gear.id === other.gear.id)
        // Same rankOrder
        && (this.rankOrder === other.rankOrder)
      );
  }
}

@EntityClass({typename: 'VesselPositionVO'})
export class VesselPosition extends DataEntity<VesselPosition> implements IPosition {

  static fromObject: (source: any, opts?: any) => VesselPosition;

  dateTime: Moment;
  latitude: number;
  longitude: number;
  operationId: number;

  constructor() {
    super();
    this.__typename = VesselPosition.TYPENAME;
  }

  asObject(options?: DataEntityAsObjectOptions): any {
    const target = super.asObject(options);
    target.dateTime = toDateISOString(this.dateTime);
    return target;
  }

  fromObject(source: any): VesselPosition {
    super.fromObject(source);
    this.latitude = source.latitude;
    this.longitude = source.longitude;
    this.operationId = source.operationId;
    this.dateTime = fromDateISOString(source.dateTime);
    return this;
  }

  equals(other: VesselPosition): boolean {
    return super.equals(other)
      || (this.dateTime === other.dateTime
        && (!this.operationId && !other.operationId || this.operationId === other.operationId));
  }
}


