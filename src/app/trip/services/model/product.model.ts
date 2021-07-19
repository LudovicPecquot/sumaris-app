import {
  ReferentialAsObjectOptions,
  ReferentialRef,
  ReferentialUtils
}  from "@sumaris-net/ngx-components";
import {DataEntity, DataEntityAsObjectOptions} from "../../../data/services/model/data-entity.model";
import {IEntityWithMeasurement, MeasurementFormValues, MeasurementValuesUtils} from "./measurement.model";
import {equalsOrNil, isNil, isNotNil, isNotNilOrBlank} from "@sumaris-net/ngx-components";
import {IEntity}  from "@sumaris-net/ngx-components";
import {Sample} from "./sample.model";
import {IWithPacketsEntity, Packet} from "./packet.model";
import {FilterFn} from "@sumaris-net/ngx-components";
import {DataEntityFilter} from "../../../data/services/model/data-filter.model";
import {NOT_MINIFY_OPTIONS} from '@app/core/services/model/referential.model';

export interface IWithProductsEntity<T, ID = number>
  extends IEntity<T, ID> {
  products: Product[];
}

export class ProductFilter extends DataEntityFilter<ProductFilter, Product> {

  static fromParent(parent: IWithProductsEntity<any, any>): ProductFilter {
    return ProductFilter.fromObject({parent});
  }

  static fromObject(source: Partial<ProductFilter>): ProductFilter {
    if (!source || source instanceof ProductFilter) return source as ProductFilter;
    const target = new ProductFilter();
    target.fromObject(source);
    return target;
  }

  parent?: IWithProductsEntity<any, any>;

  fromObject(source: any, opts?: any) {
    super.fromObject(source, opts);
    this.parent = source.parent;
  }

  buildFilter(): FilterFn<Product>[] {
    return [
      (p) => p.parent && this.parent.equals(p.parent)
    ];
  }

}

export class Product extends DataEntity<Product> implements IEntityWithMeasurement<Product> {

  static TYPENAME = 'ProductVO';

  static fromObject(source: any): Product {
    const target = new Product();
    target.fromObject(source);
    return target;
  }

  public static equals(p1: Product | any, p2: Product | any): boolean {
    return p1 && p2 && ((isNotNil(p1.id) && p1.id === p2.id)
      // Or by functional attributes
      || (p1.rankOrder === p2.rankOrder
        // same operation
        && ((!p1.operationId && !p2.operationId) || p1.operationId === p2.operationId)
        // same taxon group
        && ReferentialUtils.equals(p1.taxonGroup, p2.taxonGroup)
      ));
  }

  label: string;
  comments: string;
  rankOrder: number;
  individualCount: number;
  subgroupCount: number;
  taxonGroup: ReferentialRef;
  weight: number;
  weightCalculated: boolean;
  saleType: ReferentialRef;

  measurementValues: MeasurementFormValues;

  operationId: number;
  saleId: number;
  landingId: number;
  batchId: number;

  // used only for table column
  parent: IWithProductsEntity<any>;

  // Not serialized
  saleProducts: Product[];
  samples: Sample[];

  constructor() {
    super();
    this.__typename = Product.TYPENAME;
    this.label = null;
    this.comments = null;
    this.rankOrder = null;
    this.individualCount = null;
    this.subgroupCount = null;
    this.taxonGroup = null;
    this.weight = null;
    this.saleType = null;

    this.measurementValues = {};
    this.saleProducts = [];
    this.samples = [];
    this.operationId = null;
    this.saleId = null;
    this.landingId = null;
    this.batchId = null;

  }

  clone(): Product {
    return Product.fromObject(this.asObject());
  }

  asObject(opts?: DataEntityAsObjectOptions): any {
    const target = super.asObject(opts);

    target.taxonGroup = this.taxonGroup && this.taxonGroup.asObject({...opts, ...NOT_MINIFY_OPTIONS, keepEntityName: true} as ReferentialAsObjectOptions) || undefined;
    target.saleType = this.saleType && this.saleType.asObject({...opts, ...NOT_MINIFY_OPTIONS}) || undefined;

    target.measurementValues = MeasurementValuesUtils.asObject(this.measurementValues, opts);

    if (!opts || opts.minify !== true) {
      target.saleProducts = this.saleProducts && this.saleProducts.map(s => s.asObject(opts)) || [];
      target.samples = this.samples && this.samples.map(s => s.asObject({...opts, withChildren: false})) || [];
    } else {
      delete target.saleProducts;
      delete target.samples;
    }

    delete target.parent;
    return target;
  }

  fromObject(source: any): Product {
    super.fromObject(source);
    this.label = source.label;
    this.comments = source.comments;
    this.rankOrder = +source.rankOrder;
    this.individualCount = isNotNilOrBlank(source.individualCount) ? parseInt(source.individualCount) : null;
    this.subgroupCount = isNotNilOrBlank(source.subgroupCount) ? parseFloat(source.subgroupCount) : null;
    this.taxonGroup = source.taxonGroup && ReferentialRef.fromObject(source.taxonGroup) || undefined;
    this.weight = source.weight || undefined;
    this.weightCalculated = source.weightCalculated || false;
    this.saleType = source.saleType && ReferentialRef.fromObject(source.saleType) || undefined;

    this.parent = source.parent;
    this.operationId = source.operationId;
    this.saleId = source.saleId;
    this.landingId = source.landingId;
    this.batchId = source.batchId;

    // Get all measurements values (by copy)
    this.measurementValues = source.measurementValues && {...source.measurementValues};

    this.saleProducts = source.saleProducts && source.saleProducts.map(saleProduct => Product.fromObject(saleProduct)) || [];
    this.samples = source.samples && source.samples.map(source => Sample.fromObject(source)) || [];

    return this;
  }

  /**
   * This equals function should also works with SaleProduct
   * @param other
   */
  equals(other: Product): boolean {
    return super.equals(other)
      || (
        this.taxonGroup.equals(other.taxonGroup) && this.rankOrder === other.rankOrder
        && equalsOrNil(this.individualCount, other.individualCount) && equalsOrNil(this.weight, other.weight)
        && equalsOrNil(this.subgroupCount, other.subgroupCount) && ReferentialUtils.equals(this.saleType, other.saleType)
      );
  }
}

export class ProductUtils {

  static isSampleOfProduct(product: Product, sample: Sample): boolean {
    return product && sample
      && product.operationId === sample.operationId
      && product.taxonGroup && sample.taxonGroup
      && ReferentialUtils.equals(product.taxonGroup, sample.taxonGroup);
  }
}
