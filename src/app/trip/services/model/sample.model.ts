import {
  EntityUtils,
  fromDateISOString,
  isNotNil,
  referentialToString,
  toDateISOString
} from "../../../core/core.module";
import {PmfmStrategy, ReferentialRef} from "../../../referential/referential.module";
import {Moment} from "moment/moment";
import {DataRootEntity} from "./base.model";
import {IEntityWithMeasurement, MeasurementUtils} from "./measurement.model";


export class Sample extends DataRootEntity<Sample> implements IEntityWithMeasurement<Sample> {

  static fromObject(source: any): Sample {
    const res = new Sample();
    res.fromObject(source);
    return res;
  }

  static equals(s1: Sample | any, s2: Sample | any): boolean {
    return s1 && s2 && s1.id === s2.id
      || (s1.rankOrder === s2.rankOrder
        // same operation
        && ((!s1.operationId && !s2.operationId) || s1.operationId === s2.operationId)
        // same label
        && ((!s1.label && !s2.label) || s1.label === s2.label)
        // Warn: compare using the parent ID is too complicated
      );
  }

  label: string;
  rankOrder: number;
  sampleDate: Moment;
  individualCount: number;
  taxonGroup: ReferentialRef;
  taxonName: ReferentialRef;
  measurementValues: { [key: string]: any };
  matrixId: number;
  batchId: number;
  size: number;
  sizeUnit: string;

  operationId: number;
  parentId: number;
  parent: Sample;
  children: Sample[];

  constructor() {
    super();
    this.label = null;
    this.rankOrder = null;
    this.taxonGroup = null;
    this.measurementValues = {};
    this.children = [];
    this.individualCount = null;
  }

  clone(): Sample {
    const target = new Sample();
    target.fromObject(this.asObject());
    return target;
  }

  asObject(minify?: boolean): any {
    const target = super.asObject(minify);
    target.sampleDate = toDateISOString(this.sampleDate);
    target.taxonGroup = this.taxonGroup && this.taxonGroup.asObject(false/*fix #32*/) || undefined;
    target.taxonName = this.taxonName && this.taxonName.asObject(false/*fix #32*/) || undefined;
    target.individualCount = isNotNil(this.individualCount) ? this.individualCount : null;
    target.parentId = this.parentId || this.parent && this.parent.id || undefined;
    target.children = this.children && this.children.map(c => c.asObject(minify)) || undefined;
    target.measurementValues = MeasurementUtils.measurementValuesAsObjectMap( this.measurementValues, minify);

    if (minify) {
      // Parent not need, as the tree will be used by pod
      delete target.parent;
      delete target.parentId;
    }

    return target;
  }

  fromObject(source: any): Sample {
    super.fromObject(source);
    this.label = source.label;
    this.rankOrder = source.rankOrder;
    this.sampleDate = fromDateISOString(source.sampleDate);
    this.individualCount = isNotNil(source.individualCount) && source.individualCount !== "" ? source.individualCount : null;
    this.taxonGroup = source.taxonGroup && ReferentialRef.fromObject(source.taxonGroup) || undefined;
    this.taxonName = source.taxonName && ReferentialRef.fromObject(source.taxonName) || undefined;
    this.size = source.size;
    this.sizeUnit = source.sizeUnit;
    this.matrixId = source.matrixId;
    this.parentId = source.parentId;
    this.parent = source.parent;
    this.batchId = source.batchId;
    this.operationId = source.operationId;
    this.measurementValues = source.measurementValues || MeasurementUtils.toMeasurementValues(source.measurements);

    return this;
  }

  equals(other: Sample): boolean {
    return super.equals(other)
      || (this.rankOrder === other.rankOrder
        // same operation
        && ((!this.operationId && !other.operationId) || this.operationId === other.operationId)
        // same label
        && ((!this.label && !other.label) || this.label === other.label)
        // Warn: compare using the parent ID is too complicated
      );
  }
}

export class SampleUtils {

  static parentToString(parent: Sample, opts?: {
    pmfm?: PmfmStrategy,
    taxonGroupAttributes: string[];
    taxonNameAttributes: string[];
  }) {
    if (!parent) return null;
    opts = opts || {taxonGroupAttributes: ['label', 'name'], taxonNameAttributes: ['label', 'name']};
    if (opts.pmfm && parent.measurementValues && isNotNil(parent.measurementValues[opts.pmfm.pmfmId])) {
      return parent.measurementValues[opts.pmfm.pmfmId];
    }

    const hasTaxonGroup = EntityUtils.isNotEmpty(parent.taxonGroup) ;
    const hasTaxonName = EntityUtils.isNotEmpty(parent.taxonName);
    // Display only taxon name, if no taxon group or same label
    if (hasTaxonName && (!hasTaxonGroup || parent.taxonGroup.label === parent.taxonName.label)) {
      return referentialToString(parent.taxonName, opts.taxonNameAttributes);
    }
    // Display both, if both exists
    if (hasTaxonName && hasTaxonGroup) {
      return referentialToString(parent.taxonGroup, opts.taxonGroupAttributes) + ' / '
        + referentialToString(parent.taxonName, opts.taxonNameAttributes);
    }
    // Display only taxon group
    if (hasTaxonGroup) {
      return referentialToString(parent.taxonGroup, opts.taxonGroupAttributes);
    }

    // Display rankOrder only (should never occur)
    return `#${parent.rankOrder}`;
  }
}
