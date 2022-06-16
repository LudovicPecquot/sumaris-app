import { EntityClass, isEmptyArray, isNil, isNilOrBlank, isNotEmptyArray, isNotNil, ITreeItemEntity, ReferentialRef } from '@sumaris-net/ngx-components';
import { IRootDataEntity, RootDataEntity } from '@app/data/services/model/root-data-entity.model';
import { IEntityWithMeasurement, Measurement, MeasurementFormValues, MeasurementModelValues, MeasurementUtils, MeasurementValuesUtils } from '@app/trip/services/model/measurement.model';
import { SortDirection } from '@angular/material/sort';
import { DataEntityAsObjectOptions, IDataEntity } from '@app/data/services/model/data-entity.model';
import { NOT_MINIFY_OPTIONS } from '@app/core/services/model/referential.utils';
import { Moment } from 'moment';
import { TripRef } from '@app/trip/trip/trip-ref.model';
import { AcquisitionLevelCodes } from '@app/referential/services/model/model.enum';

export interface PhysicalGearAsObjectOptions extends DataEntityAsObjectOptions {
  withChildren?: boolean;
}
export interface PhysicalGearFromObjectOptions {
  withChildren?: boolean;
}

@EntityClass({ typename: 'PhysicalGearVO' })
export class PhysicalGear extends RootDataEntity<PhysicalGear, number, PhysicalGearAsObjectOptions, PhysicalGearFromObjectOptions>
  implements IEntityWithMeasurement<PhysicalGear>, ITreeItemEntity<PhysicalGear> {

  static fromObject: (source: any, opts?: any) => PhysicalGear;

  static equals(s1: PhysicalGear, s2: PhysicalGear) {
    return s1 && s2 && s1.id === s2.id
      // Or
      || (
        // Same gear
        (s1.gear && s2.gear && s1.gear.id === s2.gear.id)
        // Same rankOrder
        && (s1.rankOrder === s2.rankOrder)
        // WARN: compare parent (e.g. same trip) is to complicated, because it can be not set yet, before saving
      );
  }

  static computeSameAsScore(reference: PhysicalGear, source?: PhysicalGear): number {
    if (!source) return -1;
    return (reference.gear?.id === source.gear?.id ? 1 : 0) * 100
      + (reference.rankOrder === source.rankOrder ? 1 : 0) * 10
      + (reference.tripId === source.tripId ? 1 : 0) * 1;
  }

  static sameAsComparator(gear: PhysicalGear, sortDirection?: SortDirection): (g1: PhysicalGear, g2: PhysicalGear) => number {
    const direction = !sortDirection || sortDirection === 'desc' ? -1 : 1;
    return (g1, g2) => {
      const score1 = this.computeSameAsScore(gear, g1);
      const score2 = this.computeSameAsScore(gear, g2);
      return score1 === score2 ? 0 : (score1 > score2 ? direction : -direction);
    };

  }

  static fromObjectArrayAsTree(sources: any[], opts?: PhysicalGearFromObjectOptions): PhysicalGear[] {
    if (!sources) return null;
    const gears = (sources || [])
      .filter(isNotNil)
      .map(json => PhysicalGear.fromObject(json, opts));
    const root = gears.filter(g => isNil(g.parentId) && isNil(g.parent));
    // Link to parent
    gears.forEach(s => {
      s.parent = isNotNil(s.parentId) && root.find(p => p.id === s.parentId) || undefined;
      s.parentId = undefined; // Avoid redundant info on parent
    });
    // Link to children
    root.forEach(s => s.children = gears.filter(p => p.parent && p.parent === s) || []);

    console.debug("[physical-gear-model] fromObjectArrayAsTree() :", root);
    return root;
  }

  /**
   * Transform an entities tree, into an array of objects.
   * children.parent are removed, to keep only a parentId
   * @param source
   * @param opts
   * @throw Error if a batch has no id
   */
  static treeAsObjectArray(sources: PhysicalGear[],
                           opts?: PhysicalGearAsObjectOptions & {
                             parent?: any;
                           }): any[] {
    return sources && sources
      // Reduce to array
      .reduce((res, source) => {
        // Convert entity into object, WITHOUT children (will be set later)
        const target = source.asObject ? source.asObject({...opts, withChildren: false}) : {...source, children: undefined};

        // Link target with the given parent
        const parent = opts && opts.parent;
        if (parent) {
          if (isNil(parent.id)) {
            throw new Error(`Cannot convert physicalGears tree into array: No id found for the physicalGear with rankOrder=${parent.rankOrder}!`);
          }
          target.parentId = parent.id;
          delete target.parent; // not need
        }

        if (isNotEmptyArray(source.children)) {
          return res.concat(target)
            .concat(...this.treeAsObjectArray(source.children, {...opts, parent: target}));
        }
        return res.concat(target);
      }, []) || undefined;
  }

  rankOrder: number = null;
  gear: ReferentialRef = null;
  measurements: Measurement[] = null;
  measurementValues: MeasurementModelValues | MeasurementFormValues = {};

  // Parent (e.g. sub gears - see APASE program)
  parent: PhysicalGear = null;
  parentId: number = null;
  children: PhysicalGear[] = null;

  // Parent trip (used when lookup gears)
  trip: TripRef = null;
  tripId: number = null;

  constructor() {
    super(PhysicalGear.TYPENAME);
  }

  copy(target: PhysicalGear) {
    target.fromObject(this);
  }

  fromObject(source: any, opts?: PhysicalGearFromObjectOptions): PhysicalGear {
    super.fromObject(source);
    this.rankOrder = source.rankOrder;
    this.gear = source.gear && ReferentialRef.fromObject(source.gear);
    this.measurementValues = source.measurementValues && { ...source.measurementValues } || MeasurementUtils.toMeasurementValues(source.measurements);

    // Parent / children
    this.parentId = source.parentId;
    this.parent = source.parent && PhysicalGear.fromObject(source.parent);
    if (source.children && (!opts || opts.withChildren !== false)) {
      this.children = source.children.map(child => PhysicalGear.fromObject(child, opts));
    }

    // Trip
    if (source.trip) {
      this.trip = source.trip && TripRef.fromObject(source.trip);
      this.tripId = this.trip && this.trip.id;
    } else {
      this.trip = null;
      this.tripId = source.tripId || null; // to keep tripId on clone even if source.trip is null.
    }

    return this;
  }

  asObject(opts?: PhysicalGearAsObjectOptions): any {
    const target = super.asObject(opts);
    target.gear = this.gear && this.gear.asObject({ ...opts, ...NOT_MINIFY_OPTIONS }) || undefined;
    // Fixme gear entityName here
    if (target.gear) target.gear.entityName = 'GearVO';

    target.rankOrder = this.rankOrder;

    // Measurements
    target.measurementValues = MeasurementValuesUtils.asObject(this.measurementValues, opts);
    if (isEmptyArray(target.measurements)) delete target.measurements;

    // Parent / children
    target.children = this.children && (!opts || opts.withChildren !== false) && this.children.map(c => c.asObject(opts)) || undefined;
    target.parentId = this.parentId || this.parent && this.parent.id || undefined;

    if (opts && opts.minify) {
      // Parent not need, as the tree will be used by pod
      delete target.parent;
      delete target.parentId;
    }

    return target;
  }


  equals(other: PhysicalGear): boolean {
    return (super.equals(other) && isNotNil(this.id))
      || (
        // Same gear
        (this.gear && other.gear && this.gear.id === other.gear.id)
        // Same rankOrder
        && (this.rankOrder === other.rankOrder)
      );
  }
}
