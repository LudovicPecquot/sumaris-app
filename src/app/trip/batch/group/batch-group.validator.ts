import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { BatchValidatorOptions, BatchValidators, BatchValidatorService } from '../common/batch.validator';
import { BatchGroup } from './batch-group.model';
import { LocalSettingsService, SharedAsyncValidators, SharedValidators } from '@sumaris-net/ngx-components';
import { IPmfm } from '@app/referential/services/model/pmfm.model';
import { Subscription } from 'rxjs';
import { MeasurementsValidatorService } from '@app/trip/services/validator/measurement.validator';
import { environment } from '@environments/environment';

export interface BatchGroupValidatorOptions extends BatchValidatorOptions {
}

@Injectable()
export class BatchGroupValidatorService extends BatchValidatorService<BatchGroup, BatchGroupValidatorOptions> {

  qvPmfm: IPmfm;

  constructor(
    formBuilder: FormBuilder,
    measurementsValidatorService: MeasurementsValidatorService,
    settings: LocalSettingsService
  ) {
    super(formBuilder, measurementsValidatorService, settings);
  }

  getRowValidator(): FormGroup {
    // The first level of children can be qvPmfm or samplingColumns
    return super.getFormGroup(null, {withWeight: true, withChildren: !!this.qvPmfm || this.showSamplingBatchColumns, qvPmfm: this.qvPmfm, pmfms:this.pmfms});
  }

  getFormGroup(data?: BatchGroup, opts?: BatchGroupValidatorOptions): FormGroup {
    return super.getFormGroup(data, {withWeight: true, withChildren: true, qvPmfm: this.qvPmfm, ...opts});
  }

  getFormGroupConfig(data?: BatchGroup, opts?: BatchGroupValidatorOptions): { [key: string]: any } {
    const config = super.getFormGroupConfig(data, opts);

    config.observedIndividualCount = [data && data.observedIndividualCount, SharedValidators.integer];

    return config;
  }

  enableSamplingRatioAndWeight(form: FormGroup, opts?: {
    requiredSampleWeight?: boolean;
    qvPmfm?: IPmfm,
    markForCheck?: () => void;
  }): Subscription {

    if (!form) {
      console.warn('Argument \'form\' required');
      return null;
    }

    return SharedAsyncValidators.registerAsyncValidator(form,
      BatchGroupValidators.samplingRatioAndWeight({qvPmfm: this.qvPmfm, ...opts}),
      {
        markForCheck: opts?.markForCheck,
        debug: !environment.production
      });
  }

  /* -- protected method -- */

  protected fillDefaultOptions(opts?: BatchGroupValidatorOptions): BatchGroupValidatorOptions {
    opts = super.fillDefaultOptions(opts);
    return {withWeight: true, withChildren: true, qvPmfm: this.qvPmfm, ...opts};
  }
}


export class BatchGroupValidators {
  /**
   * Same as BatchValidators.computeSamplingWeight() but for a batch group form
   * @param opts
   */
  static samplingRatioAndWeight(opts: {
    requiredSampleWeight?: boolean;
    qvPmfm?: IPmfm;
  }): ValidatorFn {
    if (!opts?.qvPmfm) {
      return (control) => BatchValidators.computeSamplingRatioAndWeight(control as FormGroup, {...opts, emitEvent: false, onlySelf: false});
    }

    return Validators.compose((opts.qvPmfm.qualitativeValues || [])
      .map((qv, qvIndex) => {
        const qvSuffix = `children.${qvIndex}.`;
        const qvOpts = {
          ...opts,
          weightPath: qvSuffix + 'weight',
          samplingWeightPath: qvSuffix + 'children.0.weight',
          samplingRatioPath: qvSuffix + 'children.0.samplingRatio',
          qvIndex
        };
        return (control) => {
          const form = control as FormGroup;
          // Enable total individual count
          if (form.get(qvSuffix + 'individualCount').disabled) {
            form.get(qvSuffix + 'individualCount').enable();
          }
          // Enable sampling individual count
          if (form.get(qvSuffix + 'children.0.individualCount').disabled) {
            form.get(qvSuffix + 'children.0.individualCount').enable();
          }
          return BatchValidators.computeSamplingRatioAndWeight(form, {...qvOpts, emitEvent: false, onlySelf: false});
        }
      }));
  }
}