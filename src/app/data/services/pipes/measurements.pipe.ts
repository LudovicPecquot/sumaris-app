import { Pipe, PipeTransform } from '@angular/core';
import { IEntityWithMeasurement, MeasurementValuesUtils } from '@app/trip/services/model/measurement.model';
import { PmfmValuePipe } from '@app/referential/pipes/pmfms.pipe';
import { IPmfm } from '@app/referential/services/model/pmfm.model';

@Pipe({
  name: 'isMeasurementFormValues'
})
export class IsMeasurementFormValuesPipe implements PipeTransform {

  transform = MeasurementValuesUtils.isMeasurementFormValues
}

@Pipe({
  name: 'isMeasurementModelValues'
})
export class IsMeasurementModelValuesPipe implements PipeTransform {

  transform = MeasurementValuesUtils.isMeasurementModelValues
}

@Pipe({
  name: 'measurementValueGet'
})
export class MeasurementValueGetPipe extends PmfmValuePipe {

  transform(entity: IEntityWithMeasurement<any>, opts: {
    pmfm: IPmfm;
    propertyNames?: string[];
    html?: boolean;
    hideIfDefaultValue?: boolean;
    showLabelForPmfmIds?: number[];
  }): any {
    if (!entity.measurementValues) return undefined;
    return super.transform(entity.measurementValues[opts.pmfm.id], {
      applyDisplayConversion: opts.pmfm?.displayConversion && MeasurementValuesUtils.isMeasurementModelValues(entity.measurementValues),
      ...opts
    });
  }
}