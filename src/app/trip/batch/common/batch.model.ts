import {AcquisitionLevelCodes, PmfmIds, QualitativeValueIds} from '@app/referential/services/model/model.enum';
import {DataEntity, DataEntityAsObjectOptions} from '@app/data/services/model/data-entity.model';
import {IEntityWithMeasurement, IMeasurementValue, MeasurementFormValues, MeasurementModelValues, MeasurementUtils, MeasurementValuesUtils} from '@app/data/measurement/measurement.model';
import { EntityClass, isNil, isNilOrBlank, isNotNil, isNotNilOrBlank, ITreeItemEntity, ReferentialAsObjectOptions, ReferentialUtils, toNumber } from '@sumaris-net/ngx-components';
import {TaxonGroupRef} from '@app/referential/services/model/taxon-group.model';
import {TaxonNameRef} from '@app/referential/services/model/taxon-name.model';
import {NOT_MINIFY_OPTIONS} from '@app/core/services/model/referential.utils';
import {PmfmValueUtils} from '@app/referential/services/model/pmfm-value.model';
import { SortDirection } from '@angular/material/sort';

export declare interface BatchWeight extends IMeasurementValue {
  unit?: 'kg';
}

export interface BatchAsObjectOptions extends DataEntityAsObjectOptions {
  withChildren?: boolean;
}

export interface BatchFromObjectOptions {
  withChildren?: boolean;
}

// WARN: always recreate en entity, even if source is a Batch
// because options can have changed
@EntityClass({typename: 'BatchVO', fromObjectReuseStrategy: 'clone'})
export class Batch<
  T extends Batch<T, ID> = Batch<any, any>,
  ID = number,
  O extends BatchAsObjectOptions = BatchAsObjectOptions,
  FO extends BatchFromObjectOptions = BatchFromObjectOptions
  >
  extends
    DataEntity<T, ID, O, FO>
  implements
    IEntityWithMeasurement<T, ID>,
    ITreeItemEntity<Batch> {

  static SAMPLING_BATCH_SUFFIX = '.%';
  static fromObject: (source: any, opts?: { withChildren?: boolean }) => Batch;

  static fromObjectArrayAsTree(sources: any[]): Batch {
    if (!sources) return null;
    const batches = (sources || []).map(json => this.fromObject(json));
    const catchBatch = batches.find(b => isNil(b.parentId) && (isNilOrBlank(b.label) || b.label === AcquisitionLevelCodes.CATCH_BATCH)) || undefined;
    if (!catchBatch) return undefined;
    batches.forEach(s => {
      // Link to parent
      s.parent = isNotNil(s.parentId) && batches.find(p => p.id === s.parentId) || undefined;
      s.parentId = undefined; // Avoid redundant info on parent
    });
    // Link to children
    batches.forEach(s => s.children = batches.filter(p => p.parent && p.parent === s) || []);
    // Fill catch children
    if (!catchBatch.children || !catchBatch.children.length) {
      catchBatch.children = batches.filter(b => b.parent === catchBatch);
    }
    //console.debug("[batch-model] fromObjectArrayAsTree()", this.catchBatch);
    return catchBatch;
  }

  /**
   * Transform a batch entity tree, into a array of object.
   * Parent/.children link are removed, to keep only a parentId/
   *
   * @param source
   * @param opts
   * @throw Error if a batch has no id
   */
  static treeAsObjectArray(source: Batch,
                           opts?: DataEntityAsObjectOptions & {
                             parent?: any;
                           }): any[] {
    if (!source) return null;

    // Convert entity into object, WITHOUT children (will be add later)
    const target = source.asObject ? source.asObject({...opts, withChildren: false}) : {...source, children: undefined};

    // Link target with the given parent
    const parent = opts && opts.parent;
    if (parent) {
      if (isNil(parent.id)) {
        throw new Error(`Cannot convert batch tree into array: No id found for batch ${parent.label}!`);
      }
      target.parentId = parent.id;
      delete target.parent; // not need
    }

    return (source.children || []).reduce((res, batch) => res.concat(this.treeAsObjectArray(batch, {...opts, parent: target}) || []),
      [target]) || undefined;
  }

  static equals(b1: Batch | any, b2: Batch | any): boolean {
    return b1 && b2 && ((isNotNil(b1.id) && b1.id === b2.id)
      // Or by functional attributes
      || (b1.rankOrder === b2.rankOrder
        // same operation
        && ((!b1.operationId && !b2.operationId) || b1.operationId === b2.operationId)
        // same sale
        && ((!b1.saleId && !b2.saleId) || b1.saleId === b2.saleId)
        // same label
        && ((!b1.label && !b2.label) || b1.label === b2.label)
        // Warn: compare using the parent ID is too complicated
      ));
  }

  /**
   * Sort batch, by id (if exists) or by rankOrder (if no id)
   *
   * @param sortDirection
   */
  static idOrRankOrderComparator(sortDirection: SortDirection = 'asc'): (b1: Batch, b2: Batch) => number {
    const sign = !sortDirection || sortDirection !== 'desc' ? 1 : -1;

    return (b1: Batch, b2: Batch) => {
      const id1 = toNumber(b1.id, Number.MAX_SAFE_INTEGER);
      const id2 = toNumber(b2.id, Number.MAX_SAFE_INTEGER);
      const rankOrder1 = toNumber(b1.rankOrder, Number.MAX_SAFE_INTEGER);
      const rankOrder2 = toNumber(b2.rankOrder, Number.MAX_SAFE_INTEGER);

      if (id1 !== id2) {
        return sign * (Math.abs(id1) - Math.abs(id2)); // Need ABS to make localId be positive
      } else {
        return sign * (rankOrder1 - rankOrder2);
      }
    };
  }

  label: string = null;
  rankOrder: number = null;
  exhaustiveInventory: boolean = null;
  samplingRatio: number = null;
  samplingRatioText: string = null;
  samplingRatioComputed: boolean = null;
  individualCount: number = null;
  taxonGroup: TaxonGroupRef = null;
  taxonName: TaxonNameRef = null;
  comments: string = null;
  measurementValues: MeasurementModelValues | MeasurementFormValues = {};
  weight: BatchWeight = null;
  childrenWeight: BatchWeight = null;

  operationId: number = null;
  saleId: number = null;
  parentId: number = null;
  parent: Batch = null;
  children: Batch[] = null;

  constructor(__typename?: string) {
    super(__typename || Batch.TYPENAME);
  }

  asObject(opts?: O): any {
    const parent = this.parent;
    this.parent = null; // avoid to process the parent
    const target = super.asObject(opts);
    delete target.parentBatch;
    this.parent = parent;

    target.taxonGroup = this.taxonGroup && this.taxonGroup.asObject({...opts, ...NOT_MINIFY_OPTIONS, keepEntityName: true /*fix #32*/} as ReferentialAsObjectOptions) || undefined;
    target.taxonName = this.taxonName && this.taxonName.asObject({...opts, ...NOT_MINIFY_OPTIONS, keepEntityName: true /*fix #32*/} as ReferentialAsObjectOptions) || undefined;
    target.children = this.children && (!opts || opts.withChildren !== false) && this.children.map(c => c.asObject && c.asObject(opts) || c) || undefined;
    target.parentId = this.parentId || this.parent && this.parent.id || undefined;
    target.measurementValues = MeasurementValuesUtils.asObject(this.measurementValues, opts);

    if (opts && opts.minify) {
      // Parent Id not need, as the tree batch will be used by pod
      delete target.parent;
      delete target.parentId;
      // Remove computed properties
      delete target.samplingRatioComputed;
      delete target.weight;
      delete target.childrenWeight;
      if (target.measurementValues) delete target.measurementValues.__typename;

      // Can occur on SubBatch
      delete target.parentGroup;
    }

    return target;
  }

  fromObject(source: any, opts?: FO) {
    super.fromObject(source);
    this.label = source.label;
    this.rankOrder = +source.rankOrder;
    this.exhaustiveInventory = source.exhaustiveInventory;
    this.samplingRatio = isNotNilOrBlank(source.samplingRatio) ? parseFloat(source.samplingRatio) : null;
    this.samplingRatioText = source.samplingRatioText;
    this.samplingRatioComputed = source.samplingRatioComputed;
    this.individualCount = isNotNilOrBlank(source.individualCount) ? parseInt(source.individualCount) : null;
    this.taxonGroup = source.taxonGroup && TaxonGroupRef.fromObject(source.taxonGroup) || undefined;
    this.taxonName = source.taxonName && TaxonNameRef.fromObject(source.taxonName) || undefined;
    this.comments = source.comments;
    this.operationId = source.operationId;
    this.saleId = source.saleId;
    this.parentId = source.parentId;
    this.parent = source.parent;
    this.weight = source.weight && {...source.weight} || undefined;
    this.childrenWeight = source.childrenWeight && {...source.childrenWeight} || undefined;

    if (source.measurementValues) {
      this.measurementValues = {...source.measurementValues};
    }
    // Convert measurement lists to map
    else if (source.sortingMeasurements || source.quantificationMeasurements) {
      const measurements = (source.sortingMeasurements || []).concat(source.quantificationMeasurements);
      this.measurementValues = MeasurementUtils.toMeasurementValues(measurements);
    }

    if (!opts || opts.withChildren !== false) {
      this.children = source.children && source.children.map(child => Batch.fromObject(child, opts)) || undefined;
    }
  }

  equals(other: T): boolean {
    // equals by ID
    return (super.equals(other) && isNotNil(this.id))
      // Or by functional attributes
      || (this.rankOrder === other.rankOrder
        // same operation
        && ((!this.operationId && !other.operationId) || this.operationId === other.operationId)
        // same sale
        && ((!this.saleId && !other.saleId) || this.saleId === other.saleId)
        // same label
        && ((!this.label && !other.label) || this.label === other.label)
        // Warn: compare using the parent ID is too complicated
      );
  }

  get hasTaxonNameOrGroup(): boolean {
    return (ReferentialUtils.isNotEmpty(this.taxonName) || ReferentialUtils.isNotEmpty(this.taxonGroup)) && true;
  }

  get isLanding(): boolean {
    return PmfmValueUtils.equals(this.measurementValues?.[PmfmIds.DISCARD_OR_LANDING], QualitativeValueIds.DISCARD_OR_LANDING.LANDING);
  }
}

