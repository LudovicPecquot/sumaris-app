import {DataEntity, DataEntityAsObjectOptions} from '../../../data/services/model/data-entity.model';
import {equalsOrNil, FilterFn, IEntity, isNil, isNotNilOrNaN, ReferentialAsObjectOptions, ReferentialRef, referentialToString, ReferentialUtils} from '@sumaris-net/ngx-components';
import {Product} from './product.model';
import {DataEntityFilter} from '../../../data/services/model/data-filter.model';
import {NOT_MINIFY_OPTIONS} from '@app/core/services/model/referential.model';

export interface IWithPacketsEntity<T, ID = number>
  extends IEntity<T, ID> {
  packets: Packet[];
}

export class PacketFilter extends DataEntityFilter<PacketFilter, Packet> {

  static fromParent(parent: IWithPacketsEntity<any, any>): PacketFilter {
    return PacketFilter.fromObject({parent});
  }

  static fromObject(source: Partial<PacketFilter>): PacketFilter {
    if (!source || source instanceof PacketFilter) return source as PacketFilter;
    const target = new PacketFilter();
    target.fromObject(source);
    return target;
  }

  static searchFilter(source: Partial<PacketFilter>): FilterFn<Packet>{
    return source && PacketFilter.fromObject(source).asFilterFn();
  }

  parent?: IWithPacketsEntity<any, any>;

  fromObject(source: any, opts?: any) {
    super.fromObject(source, opts);
    this.parent = source.parent;
  }

  asFilterFn<E extends Packet>(): FilterFn<E> {
    if (isNil(this.parent)) return undefined;
    return (p) => p.parent && this.parent.equals(p.parent);
  }

}

export class Packet extends DataEntity<Packet> {

  static fromObject(source: any): Packet {
    const target = new Packet();
    target.fromObject(source);
    return target;
  }

  static TYPENAME = 'PacketVO';

  rankOrder: number;
  number: number;
  weight: number;
  sampledWeight1: number;
  sampledWeight2: number;
  sampledWeight3: number;
  sampledWeight4: number;
  sampledWeight5: number;
  sampledWeight6: number;
  composition: PacketComposition[];

  // used to compute packet's ratio from composition
  sampledRatio1: number;
  sampledRatio2: number;
  sampledRatio3: number;
  sampledRatio4: number;
  sampledRatio5: number;
  sampledRatio6: number;

  parent: IWithPacketsEntity<any, any>;
  operationId: number;

  // Not serialized
  saleProducts: Product[];

  constructor() {
    super();
    this.rankOrder = null;
    this.number = null;
    this.weight = null;
    this.composition = [];
    this.saleProducts = [];
    this.parent = null;
    this.operationId = null;
  }

  asObject(opts?: DataEntityAsObjectOptions): any {
    const target = super.asObject(opts);
    target.sampledWeights = [this.sampledWeight1, this.sampledWeight2, this.sampledWeight3, this.sampledWeight4, this.sampledWeight5, this.sampledWeight6];
    delete target.sampledWeight1;
    delete target.sampledWeight2;
    delete target.sampledWeight3;
    delete target.sampledWeight4;
    delete target.sampledWeight5;
    delete target.sampledWeight6;

    target.composition = this.composition && this.composition.map(c => c.asObject(opts)) || undefined;

    if (!opts || opts.minify !== true) {
      target.saleProducts = this.saleProducts && this.saleProducts.map(saleProduct => {
        const s = saleProduct.asObject(opts);
        // Affect batchId (=packet.id)
        s.batchId = this.id;
        return s;
      }) || [];
    } else {
      delete target.saleProducts;
    }

    delete target.parent;
    return target;
  }

  fromObject(source: any): DataEntity<Packet> {
    super.fromObject(source);
    this.rankOrder = source.rankOrder;
    this.number = source.number;
    this.weight = source.weight;
    this.sampledWeight1 = source.sampledWeights && source.sampledWeights[0] || source.sampledWeight1;
    this.sampledWeight2 = source.sampledWeights && source.sampledWeights[1] || source.sampledWeight2;
    this.sampledWeight3 = source.sampledWeights && source.sampledWeights[2] || source.sampledWeight3;
    this.sampledWeight4 = source.sampledWeights && source.sampledWeights[3] || source.sampledWeight4;
    this.sampledWeight5 = source.sampledWeights && source.sampledWeights[4] || source.sampledWeight5;
    this.sampledWeight6 = source.sampledWeights && source.sampledWeights[5] || source.sampledWeight6;
    this.composition = source.composition && source.composition.map(c => PacketComposition.fromObject(c));

    this.saleProducts = source.saleProducts && source.saleProducts.map(saleProduct => Product.fromObject(saleProduct)) || [];

    this.operationId = source.operationId;
    this.parent = source.parent;
    return this;
  }

  equals(other: Packet): boolean {
    return super.equals(other)
      || (
        this.rankOrder === other.rankOrder && equalsOrNil(this.number, other.number) && equalsOrNil(this.weight, other.weight)
      );
  }

}

export class PacketComposition extends DataEntity<PacketComposition> {

  static TYPENAME = 'PacketCompositionVO';
  static indexes = [1, 2, 3, 4, 5, 6];

  rankOrder: number;
  taxonGroup: ReferentialRef;
  ratio1: number;
  ratio2: number;
  ratio3: number;
  ratio4: number;
  ratio5: number;
  ratio6: number;
  weight: number;

  constructor() {
    super();
    this.rankOrder = null;
    this.taxonGroup = null;
    this.weight = null;
  }

  asObject(options?: DataEntityAsObjectOptions): any {
    const target = super.asObject(options);

    target.taxonGroup = this.taxonGroup && this.taxonGroup.asObject({...options, ...NOT_MINIFY_OPTIONS, keepEntityName: true} as ReferentialAsObjectOptions) || undefined;
    target.ratios = [this.ratio1, this.ratio2, this.ratio3, this.ratio4, this.ratio5, this.ratio6];
    delete target.ratio1;
    delete target.ratio2;
    delete target.ratio3;
    delete target.ratio4;
    delete target.ratio5;
    delete target.ratio6;
    delete target.weight;

    return target;
  }

  fromObject(source: any): PacketComposition {
    super.fromObject(source);
    this.rankOrder = source.rankOrder || undefined;
    this.taxonGroup = source.taxonGroup && ReferentialRef.fromObject(source.taxonGroup) || undefined;
    this.ratio1 = source.ratios && source.ratios[0] || source.ratio1;
    this.ratio2 = source.ratios && source.ratios[1] || source.ratio2;
    this.ratio3 = source.ratios && source.ratios[2] || source.ratio3;
    this.ratio4 = source.ratios && source.ratios[3] || source.ratio4;
    this.ratio5 = source.ratios && source.ratios[4] || source.ratio5;
    this.ratio6 = source.ratios && source.ratios[5] || source.ratio6;
    return this;
  }

  equals(other: PacketComposition): boolean {
    return super.equals(other)
      || (
        this.taxonGroup.equals(other.taxonGroup) && this.rankOrder === other.rankOrder
      );
  }

  static fromObject(source: any) {
    if (isNil(source)) return null;
    const res = new PacketComposition();
    res.fromObject(source);
    return res;
  }

}

export class PacketUtils {

  static isPacketEmpty(packet: Packet): boolean {
    return !packet || isNil(packet.number);
  }

  static isPacketCompositionEmpty(composition: PacketComposition): boolean {
    return !composition || isNil(composition.taxonGroup);
  }

  static isPacketCompositionEquals(composition1: PacketComposition, composition2: PacketComposition): boolean {
    return (composition1 === composition2) || (isNil(composition1) && isNil(composition2)) || (
      composition1 && composition2 && ReferentialUtils.equals(composition1.taxonGroup, composition2.taxonGroup)
      && composition1.ratio1 === composition2.ratio1
      && composition1.ratio2 === composition2.ratio2
      && composition1.ratio3 === composition2.ratio3
      && composition1.ratio4 === composition2.ratio4
      && composition1.ratio5 === composition2.ratio5
      && composition1.ratio6 === composition2.ratio6
    );
  }

  static getComposition(packet: Packet) {
    return packet && packet.composition && packet.composition.map(composition => referentialToString(composition.taxonGroup)).join('\n') || "";
  }

  static getCompositionAverageRatio(composition: PacketComposition): number {
    const ratios: number[] = [];
    for (const i of PacketComposition.indexes) {
      const ratio = composition['ratio' + i];
      if (isNotNilOrNaN(ratio))
        ratios.push(ratio);
    }
    const sum = ratios.reduce((a, b) => a + b, 0);
    const avg = (sum / ratios.length) || 0;
    return avg / 100;
  }

}
