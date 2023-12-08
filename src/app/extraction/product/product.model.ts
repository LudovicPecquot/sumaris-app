/* -- Extraction -- */

import { EntityAsObjectOptions, EntityClass, fromDateISOString, isNotEmptyArray, MINIFY_ENTITY_FOR_POD, toDateISOString, toNumber } from '@sumaris-net/ngx-components';
import { Moment } from 'moment';
import { IWithRecorderDepartmentEntity, IWithRecorderPersonEntity } from '@app/data/services/model/model.utils';
import { ExtractionColumn, ExtractionFilter, ExtractionType } from '../type/extraction-type.model';
import { AggregationStrata } from '@app/extraction/strata/strata.model';
import { NOT_MINIFY_OPTIONS } from '@app/core/services/model/referential.utils';

export type StrataAreaType = 'area' | 'statistical_rectangle' | 'sub_polygon' | 'square';
export type StrataTimeType = 'year' | 'quarter' | 'month';

export const ProcessingFrequencyIds = {
  NEVER: 0,
  MANUALLY: 1,
  HOURLY: 5,
  DAILY: 2,
  WEEKLY: 3,
  MONTHLY: 4
};

export declare interface ProcessingFrequency {
  id: number;
  label: string;
}
export const ProcessingFrequencyItems = Object.freeze([
  <ProcessingFrequency>{
    id: ProcessingFrequencyIds.NEVER,
    label: 'EXTRACTION.AGGREGATION.EDIT.PROCESSING_FREQUENCY_ENUM.NEVER'
  },
  <ProcessingFrequency>{
    id: ProcessingFrequencyIds.MANUALLY,
    label: 'EXTRACTION.AGGREGATION.EDIT.PROCESSING_FREQUENCY_ENUM.MANUALLY'
  },
  <ProcessingFrequency>{
    id: ProcessingFrequencyIds.HOURLY,
    label: 'EXTRACTION.AGGREGATION.EDIT.PROCESSING_FREQUENCY_ENUM.HOURLY'
  },
  <ProcessingFrequency>{
    id: ProcessingFrequencyIds.DAILY,
    label: 'EXTRACTION.AGGREGATION.EDIT.PROCESSING_FREQUENCY_ENUM.DAILY'
  },
  <ProcessingFrequency>{
    id: ProcessingFrequencyIds.WEEKLY,
    label: 'EXTRACTION.AGGREGATION.EDIT.PROCESSING_FREQUENCY_ENUM.WEEKLY'
  },
  <ProcessingFrequency>{
    id: ProcessingFrequencyIds.MONTHLY,
    label: 'EXTRACTION.AGGREGATION.EDIT.PROCESSING_FREQUENCY_ENUM.MONTHLY'
  }
]);


@EntityClass({typename: 'ExtractionProductVO'})
export class ExtractionProduct extends ExtractionType<ExtractionProduct>
  implements IWithRecorderDepartmentEntity<ExtractionProduct>,
             IWithRecorderPersonEntity<ExtractionProduct> {

  static fromObject: (source: any, opts?: any) => ExtractionProduct;

  filterContent: string = null;
  filter: ExtractionFilter = null;

  documentation: string = null;
  creationDate: Date | Moment = null;
  stratum: AggregationStrata[] = null;

  columns: ExtractionColumn[] = null;

  parentId: number;
  parent: ExtractionType;

  constructor() {
    super(ExtractionProduct.TYPENAME);
  }

  fromObject(source: any, opts?: any) {
    super.fromObject(source, opts);
    this.documentation = source.documentation;
    this.creationDate = fromDateISOString(source.creationDate);
    this.stratum = isNotEmptyArray(source.stratum) && source.stratum.map(AggregationStrata.fromObject) || [];
    this.filter = source.filter || (typeof source.filterContent === 'string' && ExtractionFilter.fromObject(JSON.parse(source.filterContent)));
    this.parentId = toNumber(source.parentId, source.parent?.id);
    this.parent = source.parent && ExtractionType.fromObject(source.parent);
  }

  asObject(opts?: EntityAsObjectOptions): any {
    const target = super.asObject(opts);

    target.creationDate = toDateISOString(this.creationDate);
    target.stratum = this.stratum && this.stratum.map(s => s.asObject(opts)) || undefined;
    target.columns = this.columns && this.columns.map((c: any) => {
      const json = Object.assign({}, c);
      delete json.index;
      delete json.__typename;
      return json;
    }) || undefined;

    target.parent = this.parent && this.parent.asObject({...opts, ...NOT_MINIFY_OPTIONS}) || undefined;

    if (opts?.minify) {
      target.filterContent = this.filter && JSON.stringify(this.filter.asObject(MINIFY_ENTITY_FOR_POD)) || this.filterContent;
      delete target.filter;

      target.parentId = toNumber(this.parent?.id, this.parentId);
      delete target.parent;
    }

    return target;
  }
}

