import {
  EntityClass,
  FilterFn,
  fromDateISOString,
  isEmptyArray,
  isNil,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrNaN,
  toDateISOString,
  toNumber,
} from '@sumaris-net/ngx-components';
import { DataEntityFilter } from '@app/data/services/model/data-filter.model';
import { Operation } from '@app/trip/trip/trip.model';
import { DataEntityAsObjectOptions } from '@app/data/services/model/data-entity.model';
import { Moment } from 'moment';
import { DataQualityStatusIdType, SynchronizationStatus } from '@app/data/services/model/model.utils';
import { BBox } from 'geojson';
import { Geometries } from '@app/shared/geometries.utils';
import { PositionUtils } from '@app/data/position/position.utils';
import { FishingAreaUtils } from '@app/data/fishing-area/fishing-area.model';

@EntityClass({ typename: 'OperationFilterVO' })
export class OperationFilter extends DataEntityFilter<OperationFilter, Operation> {
  tripId?: number;
  vesselId?: number;
  vesselIds?: number[];
  excludeId?: number;
  includedIds?: number[];
  excludedIds?: number[];
  programLabel?: string;
  excludeChildOperation?: boolean;
  hasNoChildOperation?: boolean;
  startDate?: Moment;
  endDate?: Moment;
  gearIds?: number[];
  physicalGearIds?: number[];
  taxonGroupLabels?: string[];
  synchronizationStatus?: SynchronizationStatus[];
  dataQualityStatus?: DataQualityStatusIdType;
  boundingBox?: BBox;
  parentOperationIds?: number[];

  static fromObject: (source: any, opts?: any) => OperationFilter;

  fromObject(source: any, opts?: any) {
    super.fromObject(source, opts);
    this.tripId = source.tripId;
    this.vesselId = source.vesselId;
    this.vesselIds = source.vesselIds;
    this.excludeId = source.excludeId;
    this.includedIds = source.includedIds;
    this.excludedIds = source.excludedIds;
    this.programLabel = source.programLabel || source.program?.label;
    this.excludeChildOperation = source.excludeChildOperation;
    this.hasNoChildOperation = source.hasNoChildOperation;
    this.startDate = fromDateISOString(source.startDate);
    this.endDate = fromDateISOString(source.endDate);
    this.gearIds = source.gearIds;
    this.physicalGearIds = source.physicalGearIds;
    this.taxonGroupLabels = source.taxonGroupLabels;
    this.dataQualityStatus = source.dataQualityStatus;
    this.boundingBox = source.boundingBox;
    this.excludedIds = source.excludedIds;
    this.parentOperationIds = source.parentOperationIds;
  }

  asObject(opts?: DataEntityAsObjectOptions): any {
    const target = super.asObject(opts);
    target.startDate = toDateISOString(this.startDate);
    target.endDate = toDateISOString(this.endDate);
    if (opts?.minify) {
      // Vessel (prefer single vessel, for compatibility with pod < 2.9)
      target.vesselId = isNotNilOrNaN(this.vesselId) ? this.vesselId : this.vesselIds?.length === 1 ? this.vesselIds[0] : undefined;
      target.vesselIds = isNil(target.vesselId) ? this.vesselIds?.filter(isNotNil) : undefined;
      if (isEmptyArray(target.vesselIds)) delete target.vesselIds;

      delete target.program;
      delete target.excludeId; // Not include in Pod
      delete target.synchronizationStatus;
    }
    return target;
  }

  buildFilter(): FilterFn<Operation>[] {
    const filterFns = super.buildFilter();

    // DEBUG
    //console.debug('filtering operations...', this);

    // Included ids
    if (isNotEmptyArray(this.includedIds)) {
      const includedIds = this.includedIds.slice();
      filterFns.push((o) => includedIds.includes(o.id));
    }

    // Exclude id
    if (isNotNil(this.excludeId)) {
      const excludeId = this.excludeId;
      filterFns.push((o) => o.id !== +excludeId);
    }

    // ExcludedIds
    if (isNotEmptyArray(this.excludedIds)) {
      const excludedIds = this.excludedIds.slice();
      filterFns.push((o) => !excludedIds.includes(o.id));
    }

    // Only operation with no parents
    if (isNotNil(this.excludeChildOperation) && this.excludeChildOperation) {
      filterFns.push((o) => isNil(o.parentOperationId) && isNil(o.parentOperation));
    }

    // Only operation with no child
    if (isNotNil(this.hasNoChildOperation) && this.hasNoChildOperation) {
      filterFns.push((o) => isNil(o.childOperationId) && isNil(o.childOperation));
    }

    // StartDate
    if (isNotNil(this.startDate)) {
      const startDate = this.startDate;
      filterFns.push(
        (o) =>
          (o.endDateTime && startDate.isSameOrBefore(o.endDateTime)) || (o.fishingStartDateTime && startDate.isSameOrBefore(o.fishingStartDateTime))
      );
    }

    // EndDate
    if (isNotNil(this.endDate)) {
      const endDate = this.endDate;
      filterFns.push(
        (o) => (o.endDateTime && endDate.isSameOrAfter(o.endDateTime)) || (o.fishingStartDateTime && endDate.isSameOrAfter(o.fishingStartDateTime))
      );
    }

    // GearIds;
    if (isNotEmptyArray(this.gearIds) || (!Array.isArray(this.gearIds) && isNotNilOrNaN(this.gearIds))) {
      const gearIds = Array.isArray(this.gearIds) ? this.gearIds : [this.gearIds as number];
      filterFns.push((o) => isNotNil(o.physicalGear?.gear) && gearIds.indexOf(o.physicalGear.gear.id) !== -1);
    }

    // PhysicalGearIds;
    if (isNotEmptyArray(this.physicalGearIds)) {
      const physicalGearIds = this.physicalGearIds.slice();
      filterFns.push((o) => isNotNil(o.physicalGear?.id) && physicalGearIds.indexOf(o.physicalGear.id) !== -1);
    }

    // taxonGroupIds
    if (isNotEmptyArray(this.taxonGroupLabels)) {
      const targetSpecieLabels = this.taxonGroupLabels;
      filterFns.push((o) => isNotNil(o.metier?.taxonGroup) && targetSpecieLabels.indexOf(o.metier.taxonGroup.label) !== -1);
    }

    // Filter on dataQualityStatus
    if (isNotNil(this.dataQualityStatus)) {
      if (this.dataQualityStatus === 'MODIFIED') {
        filterFns.push((o) => isNil(o.controlDate));
      }
      if (this.dataQualityStatus === 'CONTROLLED') {
        filterFns.push((o) => isNotNil(o.controlDate));
      }
    }

    // Filter on position
    if (Geometries.checkBBox(this.boundingBox)) {
      const positionFilter = PositionUtils.createBBoxFilter(this.boundingBox);
      const fishingAreaFilter = FishingAreaUtils.createBBoxFilter(this.boundingBox);
      filterFns.push((o) => (o.positions || []).some(positionFilter) || (o.fishingAreas || []).some(fishingAreaFilter));
    }

    // Filter on parent trip
    {
      // Trip
      if (isNotNil(this.tripId)) {
        const tripId = this.tripId;
        filterFns.push((o) => o.tripId === tripId);
      }

      // Vessel
      if (isNotNil(this.vesselId)) {
        const vesselId = this.vesselId;
        filterFns.push((o) => isNil(o.vesselId) || o.vesselId === vesselId);
      } else if (isNotEmptyArray(this.vesselIds)) {
        const vesselIds = this.vesselIds;
        filterFns.push((o) => isNil(o.vesselId) || vesselIds.includes(o.vesselId));
      }

      // Program label
      if (isNotNil(this.programLabel)) {
        const programLabel = this.programLabel;
        filterFns.push((o) => isNil(o.programLabel) || o.programLabel === programLabel);
      }
    }

    // Filter on parent operation
    if (isNotEmptyArray(this.parentOperationIds)) {
      const parentOperationIds = this.parentOperationIds.slice();
      filterFns.push((o) => parentOperationIds.includes(toNumber(o.parentOperationId, o.parentOperation?.id)));
    }

    return filterFns;
  }

  protected isCriteriaNotEmpty(key: string, value: any): boolean {
    switch (key) {
      case 'tripId':
        return false; // Ignore tripId
      default:
        return super.isCriteriaNotEmpty(key, value);
    }
  }
}
