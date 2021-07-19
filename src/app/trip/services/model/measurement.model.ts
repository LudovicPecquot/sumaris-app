import {DataEntity, DataEntityAsObjectOptions} from "../../../data/services/model/data-entity.model";
import {FormGroup} from "@angular/forms";
import {arraySize, isEmptyArray, isNil, isNotNil, notNilOrDefault} from "@sumaris-net/ngx-components";
import * as momentImported from "moment";
import {isMoment} from "moment";
import {IEntity}  from "@sumaris-net/ngx-components";
import {IPmfm, Pmfm} from "../../../referential/services/model/pmfm.model";
import {DenormalizedPmfmStrategy} from "../../../referential/services/model/pmfm-strategy.model";
import {PmfmValue, PmfmValueUtils} from "../../../referential/services/model/pmfm-value.model";
import {AppFormUtils}  from "@sumaris-net/ngx-components";
import {ReferentialRef}  from "@sumaris-net/ngx-components";
import {fromDateISOString, toDateISOString} from "@sumaris-net/ngx-components";

const moment = momentImported;


export declare interface MeasurementModelValues {
  [pmfmId: string]: string;
}

export declare type MeasurementFormValue = PmfmValue;

export declare interface MeasurementFormValues {
  [id: string]: PmfmValue;
}

export declare interface IEntityWithMeasurement<
  T extends IEntity<T, ID>,
  ID = number>
  extends IEntity<T, ID> {
  measurementValues: MeasurementModelValues | MeasurementFormValues;
  rankOrder?: number;
  comments?: string;
  program?: ReferentialRef;
}

export declare interface IMeasurementValue {
  methodId: number;
  estimated: boolean;
  computed: boolean;
  value: number;

  unit?: string; // is need ?
}

export declare type MeasurementType = 'ObservedLocationMeasurement' | 'SaleMeasurement' | 'LandingMeasurement'
    | 'VesselUseMeasurement'| 'VesselPhysicalMeasurement'
    | 'GearUseMeasurement' | 'PhysicalGearUseMeasurement'
    | 'BatchQuantificationMeasurement' | 'BatchSortingMeasurement'
    | 'ProduceQuantificationMeasurement' | 'ProduceSortingMeasurement';

export class Measurement extends DataEntity<Measurement> {
  pmfmId: number;
  alphanumericalValue: string;
  numericalValue: number;
  qualitativeValue: ReferentialRef;
  digitCount: number;
  rankOrder: number;
  entityName: MeasurementType;

  static fromObject(source: any): Measurement {
    const res = new Measurement();
    res.fromObject(source);
    return res;
  }

  constructor() {
    super();
    this.__typename = 'MeasurementVO';
    this.rankOrder = null;
  }


  copy(target: Measurement) {
    target.fromObject(this);
  }

  asObject(options?: DataEntityAsObjectOptions): any {
    const target = super.asObject(options);
    target.qualitativeValue = this.qualitativeValue && this.qualitativeValue.asObject(options) || undefined;
    return target;
  }

  fromObject(source: any): Measurement {
    super.fromObject(source);
    this.pmfmId = source.pmfmId;
    this.alphanumericalValue = source.alphanumericalValue;
    this.numericalValue = source.numericalValue;
    this.digitCount = source.digitCount;
    this.rankOrder = source.rankOrder;
    this.qualitativeValue = source.qualitativeValue && ReferentialRef.fromObject(source.qualitativeValue);
    this.entityName = source.entityName as MeasurementType;

    return this;
  }

  equals(other: Measurement): boolean {
    return super.equals(other)
      || (
        // Same [pmfmId, rankOrder]
        (this.pmfmId === other.pmfmId && this.rankOrder === other.rankOrder)
      );
  }

}

export class MeasurementUtils {

  static initAllMeasurements(source: Measurement[], pmfms: IPmfm[], entityName: MeasurementType, keepRankOrder: boolean): Measurement[] {
    // Work on a copy, to be able to reduce the array
    let rankOrder = 1;
    return (pmfms || []).map(pmfm => {
      const measurement = (source || []).find(m => m.pmfmId === pmfm.id) || new Measurement();
      measurement.pmfmId = pmfm.id; // apply the pmfm (need for new object)
      measurement.rankOrder = keepRankOrder ? measurement.rankOrder : rankOrder++;

      // Need by GraphQL cache
      measurement.entityName = measurement.entityName || entityName;
      measurement.__typename = measurement.__typename || 'MeasurementVO';
      return measurement;
    });
  }

  static getMeasurementEntityValue(source: Measurement, pmfm: IPmfm): any {
    switch (pmfm.type) {
      case "qualitative_value":
        if (source.qualitativeValue && source.qualitativeValue.id) {
          return pmfm.qualitativeValues.find(qv => +qv.id === +source.qualitativeValue.id);
        }
        return null;
      case "integer":
      case "double":
        return source.numericalValue;
      case "string":
        return source.alphanumericalValue;
      case "boolean":
        return source.numericalValue === 1 ? true : (source.numericalValue === 0 ? false : undefined);
      case "date":
        return fromDateISOString(source.alphanumericalValue);
      default:
        throw new Error("Unknown pmfm.type for getting value of measurement: " + pmfm.type);
    }
  }


  static setMeasurementValue(value: any, target: Measurement, pmfm: IPmfm) {
    value = (value === null || value === undefined) ? undefined : value;
    switch (pmfm.type) {
      case "qualitative_value":
        target.qualitativeValue = value;
        break;
      case "integer":
      case "double":
        target.numericalValue = value;
        break;
      case "string":
        target.alphanumericalValue = value;
        break;
      case "boolean":
        target.numericalValue = (value === true || value === "true") ? 1 : ((value === false || value === "false") ? 0 : undefined);
        break;
      case "date":
        target.alphanumericalValue = toDateISOString(value);
        break;
      default:
        throw new Error("Unknown pmfm.type: " + pmfm.type);
    }
  }

  static toModelValue(value: any, pmfm: DenormalizedPmfmStrategy|Pmfm): string {
    return PmfmValueUtils.toModelValue(value, pmfm);
  }

  static isEmpty(source: Measurement | any): boolean {
    if (!source) return true;
    return isNil(source.alphanumericalValue)
      && isNil(source.numericalValue)
      && (!source.qualitativeValue || isNil(source.qualitativeValue.id));
  }

  static areEmpty(source: Measurement[]): boolean {
    if (isEmptyArray(source)) return true;
    return !source.some(MeasurementUtils.isNotEmpty);
  }

  static isNotEmpty(source: Measurement | any): boolean {
    return !MeasurementUtils.isEmpty(source);
  }

  static toMeasurementValues(measurements: Measurement[]): MeasurementFormValues {
    return measurements && measurements.reduce((map, m) => {
      const value = m && m.pmfmId && [m.alphanumericalValue, m.numericalValue, m.qualitativeValue && m.qualitativeValue.id].find(isNotNil);
      map[m.pmfmId] = isNotNil(value) ? value : null;
      return map;
    }, {}) || undefined;
  }

  static fromMeasurementValues(measurements: MeasurementFormValues): Measurement[] {
    return measurements && Object.getOwnPropertyNames(measurements).map(pmfmId => Measurement.fromObject({
        pmfmId,
        alphanumericalValue: measurements[pmfmId]
      })) || undefined;
  }

  // Update measurements from source values map
  static setValuesByFormValues(target: Measurement[], source: MeasurementFormValues, pmfms: IPmfm[]) {
    (target || []).forEach(m => {
      const pmfm = pmfms && pmfms.find(p => p.id === m.pmfmId);
      if (pmfm) MeasurementUtils.setMeasurementValue(source[pmfm.id], m, pmfm);
    });
  }

  static areEquals(array1: Measurement[], array2: Measurement[]): boolean {
    if (arraySize(array1) !== arraySize(array2)) return false;
    return MeasurementValuesUtils.equals(MeasurementUtils.toMeasurementValues(array1), MeasurementUtils.toMeasurementValues(array2));
  }

  static filter(measurements: Measurement[], pmfms: IPmfm[]): Measurement[] {
    const pmfmIds = (pmfms || []).map(pmfm => pmfm.id);
    return (measurements || []).filter(measurement => pmfmIds.includes(measurement.pmfmId));
  }
}

export class MeasurementValuesUtils {

  static valueEquals(v1: any,
                     v2: any): boolean {
    return (v1 === v2) || (v1 && v2 && isNotNil(v1.id) && v1.id === v2.id);
  }

  static equals(m1: MeasurementFormValues|MeasurementModelValues, m2: MeasurementFormValues|MeasurementModelValues): boolean {
    return (isNil(m1) && isNil(m2))
      || !(Object.getOwnPropertyNames(m1).find(pmfmId => !MeasurementValuesUtils.valueEquals(m1[pmfmId], m2[pmfmId])));
  }

  static equalsPmfms(m1: { [pmfmId: number]: any },
                     m2: { [pmfmId: number]: any },
                     pmfms: IPmfm[]): boolean {
    return (isNil(m1) && isNil(m2))
      || !pmfms.find(pmfm => !MeasurementValuesUtils.valueEquals(m1[pmfm.id], m2[pmfm.id]));
  }

  static valueToString(value: any, opts: {pmfm: IPmfm; propertyNames?: string[]; htmls?: boolean; }): string | undefined {
    return PmfmValueUtils.valueToString(value, opts);
  }

  static normalizeValueToModel(value: PmfmValue, pmfm: IPmfm): string {
    return PmfmValueUtils.toModelValue(value, pmfm);
  }

  static normalizeValuesToModel(source: MeasurementFormValues, pmfms: IPmfm[], opts?: {
    keepSourceObject?: boolean
  }): MeasurementModelValues {
    const target: MeasurementModelValues = opts && opts.keepSourceObject ? source as MeasurementModelValues : {};
    (pmfms || []).forEach(pmfm => {
      target[pmfm.id] = MeasurementValuesUtils.normalizeValueToModel(source[pmfm.id], pmfm);
    });
    return target;
  }

  static normalizeValueToForm(value: any, pmfm: IPmfm): MeasurementFormValue {
    return PmfmValueUtils.fromModelValue(value, pmfm);
  }

  /**
   *
   * @param source
   * @param pmfms
   * @param opts
   *  - keepSourceObject: keep existing map (useful to keep extra pmfms)
   *  - onlyExistingPmfms: Will not init all pmfms, but only those that exists in the source map
   */
  static normalizeValuesToForm(source: MeasurementModelValues|MeasurementFormValues, pmfms: IPmfm[], opts?: {
    keepSourceObject?: boolean;
    onlyExistingPmfms?: boolean; // default to false
  }): MeasurementFormValues {
    opts = opts || {};

    // Normalize only given pmfms (reduce the pmfms list)
    if (opts && opts.onlyExistingPmfms) {
      pmfms = Object.getOwnPropertyNames(source).reduce((res, pmfmId) => {
        const pmfm = pmfms && pmfms.find(p => p.id === +pmfmId);
        return pmfm && res.concat(pmfm) || res;
      }, []);
    }

    const target: MeasurementFormValues =
      // Keep existing object (useful to keep extra pmfms)
      opts.keepSourceObject ? {...source as MeasurementFormValues}
      : {};

    // Normalize all pmfms from the list
    (pmfms || []).forEach(pmfm => {
      if (isNil(pmfm.id)) {
        console.warn('Invalid pmfm instance: missing required id. Please make sure to load DenormalizedPmfmStrategy or Pmfm', pmfm);
        return;
      }
      const pmfmId = pmfm.id.toString();
      target[pmfmId] = PmfmValueUtils.fromModelValue(source[pmfmId], pmfm);
    });
    return target;
  }

  static normalizeEntityToForm(data: IEntityWithMeasurement<any>,
                               pmfms: IPmfm[],
                               form?: FormGroup,
                               opts?: {
                                 keepOtherExistingPmfms?: boolean;
                                 onlyExistingPmfms?: boolean;
                               }) {
    if (!data) return; // skip

    // If a form exists, remove extra PMFMS values (before adapt to form)
    if (form) {
      const measFormGroup = form.get('measurementValues');

      if (measFormGroup instanceof FormGroup) {
        // This will remove extra PMFM, according to the form group
        const measurementValues = AppFormUtils.getFormValueFromEntity(data.measurementValues || {}, measFormGroup);
        // This will adapt to form (e.g. transform a QV_ID into a an object)
        data.measurementValues = MeasurementValuesUtils.normalizeValuesToForm(measurementValues, pmfms, {
          keepSourceObject: opts && opts.keepOtherExistingPmfms || false,
          onlyExistingPmfms: opts && opts.onlyExistingPmfms
        });
      } else {
        throw Error("No measurementValues found in form ! Make sure you use the right validator");
      }
    }
    // No validator: just normalize values
    else {
      data.measurementValues = MeasurementValuesUtils.normalizeValuesToForm(data.measurementValues || {}, pmfms, {
        // Keep extra pmfm values (not need to remove, when no validator used)
        keepSourceObject: true,
        onlyExistingPmfms: opts && opts.onlyExistingPmfms
      });
    }

  }

  static asObject(source:  { [key: string]: any }, opts?: DataEntityAsObjectOptions): { [key: string]: any } {
    if (!opts || opts.minify !== true || !source) return source;
    return source && Object.getOwnPropertyNames(source)
      .reduce((map, pmfmId) => {
        const value = notNilOrDefault(source[pmfmId] && source[pmfmId].id, source[pmfmId]);
        if (isNotNil(value)) {
          // If moment object, then convert to ISO string- fix #157
          if (isMoment(value)) {
            map[pmfmId] = toDateISOString(value);
          }
          // If date, convert to ISO string
          else if (value instanceof Date) {
            map[pmfmId] = toDateISOString(moment(value));
          }
          // String, number
          else {
            map[pmfmId] = '' + value;
          }
        }
        return map;
      }, {}) || undefined;
  }

  static getValue(measurements: MeasurementFormValues, pmfms: IPmfm[], pmfmId: number, remove?: boolean): MeasurementFormValue {
    if (!measurements || !pmfms || !pmfmId)
      return undefined;

    const pmfm = pmfms.find(p => p.id === +pmfmId);
    if (pmfm && measurements[pmfm.id]) {
      const value = MeasurementValuesUtils.normalizeValueToForm(measurements[pmfm.id], pmfm);
      if (!!remove)
        delete measurements[pmfm.id];
      return value;
    }
    return undefined;
  }

  static setValue(measurements: MeasurementFormValues, pmfms: IPmfm[], pmfmId: number, value: MeasurementFormValue) {
    if (!measurements || !pmfms || !pmfmId)
      return undefined;

    const pmfm = pmfms.find(p => p.id === +pmfmId);
    if (pmfm) {
      measurements[pmfm.id] = MeasurementValuesUtils.normalizeValueToForm(value, pmfm);
    }
    return undefined;
  }

  static isEmpty(measurementValues: MeasurementModelValues | MeasurementFormValues) {
    return isNil(measurementValues)
      || isEmptyArray(Object.getOwnPropertyNames(measurementValues).filter(pmfmId => !PmfmValueUtils.isEmpty(measurementValues[pmfmId])));
  }
}


