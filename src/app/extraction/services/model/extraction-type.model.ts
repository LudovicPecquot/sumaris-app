/* -- Extraction -- */

import {BaseReferential, Department, Entity, EntityAsObjectOptions, EntityClass, isNotEmptyArray, isNotNilOrBlank, Person} from '@sumaris-net/ngx-components';
import {Moment} from 'moment';
import {NOT_MINIFY_OPTIONS} from '@app/core/services/model/referential.model';

export declare type ExtractionCategoryType = 'PRODUCT' | 'LIVE';
export const ExtractionCategories = {
  PRODUCT: 'PRODUCT',
  LIVE: 'LIVE',
};

@EntityClass({typename: 'ExtractionTypeVO'})
export class ExtractionType<
  T extends ExtractionType<T, ID> = ExtractionType<any, any>,
  ID = number
  >
  extends BaseReferential<T, ID> {

  static fromObject: (source: any, opts?: any) => ExtractionType;
  static equals(o1: ExtractionType, o2: ExtractionType): boolean {
    return o1 && o2 ? o1.label === o2.label && o1.category === o2.category : o1 === o2;
  }

  category: string = null;
  version?: string = null;
  sheetNames: string[] = null;
  isSpatial: boolean = null;
  docUrl: string = null;

  recorderPerson: Person = null;
  recorderDepartment: Department = null;

  constructor(__typename?: string) {
    super(__typename || ExtractionType.TYPENAME);
    this.recorderDepartment = null;
  }

  fromObject(source: any, opts?: EntityAsObjectOptions) {
    super.fromObject(source, opts);
    this.label = source.label;
    this.category = source.category;
    this.version = source.version;
    this.sheetNames = source.sheetNames;
    this.isSpatial = source.isSpatial;
    this.docUrl = source.docUrl;
    this.recorderPerson = source.recorderPerson && Person.fromObject(source.recorderPerson) || null;
    this.recorderDepartment = source.recorderDepartment && Department.fromObject(source.recorderDepartment);
  }

  asObject(options?: EntityAsObjectOptions): any {
    const target = super.asObject({...options, ...NOT_MINIFY_OPTIONS});
    target.recorderPerson = this.recorderPerson && this.recorderPerson.asObject(options) || undefined;
    target.recorderDepartment = this.recorderDepartment && this.recorderDepartment.asObject(options) || undefined;
    return target;
  }

  get format(): string {
    if (!this.label) return undefined;
    const lastIndex = this.label.lastIndexOf('-');
    if (lastIndex === -1) return this.label;
    return this.label.substr(0, lastIndex);
  }
}

export class ExtractionResult {

  static fromObject(source: any): ExtractionResult {
    if (!source || source instanceof ExtractionResult) return source;
    const target = new ExtractionResult();
    target.fromObject(source);
    return target;
  }

  columns: ExtractionColumn[];
  rows: ExtractionRow[];
  total: number;

  fromObject(source: any): ExtractionResult {
    this.total = source.total;
    this.columns = source.columns && source.columns.map(ExtractionColumn.fromObject) || null;
    this.rows = source.rows && source.rows.slice() || null;
    return this;
  }
}


export class ExtractionColumn {
  static fromObject(source: any): ExtractionColumn {
    if (!source || source instanceof ExtractionColumn) return source;
    const target = new ExtractionColumn();
    target.fromObject(source);
    return target;
  }

  id: number;
  creationDate: Moment;
  index?: number;
  label: string;
  name: string;
  columnName: string;
  type: string;
  description?: String;
  rankOrder: number;
  values?: string[];

  fromObject(source: any): ExtractionColumn {
    this.id = source.id;
    this.creationDate = source.creationDate;
    this.index = source.index;
    this.label = source.label;
    this.name = source.name;
    this.columnName = source.columnName;
    this.type = source.type;
    this.description = source.description;
    this.rankOrder = source.rankOrder;
    this.values = source.values && source.values.slice();
    return this;
  }
}

export class ExtractionRow extends Array<any> {
  constructor(...items: any[]) {
    super(...items);
  }
}

export class ExtractionFilter {
  searchText?: string;
  criteria?: ExtractionFilterCriterion[];
  sheetName?: string;
}

export declare type CriterionOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'BETWEEN' | 'NULL' | 'NOT NULL';

export class ExtractionFilterCriterion extends Entity<ExtractionFilterCriterion> {

  static fromObject(source: any): ExtractionFilterCriterion {
    const res = new ExtractionFilterCriterion();
    res.fromObject(source);
    return res;
  }

  static isNotEmpty(criterion: ExtractionFilterCriterion): boolean {
    return criterion && (
      isNotNilOrBlank(criterion.value)
      || isNotEmptyArray(criterion.values)
      || criterion.operator === 'NULL'
      || criterion.operator === 'NOT NULL');
  }

  name?: string;
  operator: CriterionOperator;
  value?: string;
  values?: string[];
  endValue?: string;
  sheetName?: string;

  constructor() {
    super();
  }

  fromObject(source: any): ExtractionFilterCriterion {
    super.fromObject(source);
    this.name = source.name;
    this.operator = source.operator;
    this.value = source.value;
    this.endValue = source.endValue;
    this.sheetName = source.sheetName;
    return this;
  }

  asObject(options?: EntityAsObjectOptions): any {
    return super.asObject(options);
  }
}
