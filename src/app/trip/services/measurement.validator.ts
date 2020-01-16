import {Injectable} from "@angular/core";
import {ValidatorService} from "angular4-material-table";
import {AbstractControl, FormBuilder, FormGroup, ValidatorFn, Validators} from "@angular/forms";
import {Measurement, PmfmStrategy} from "./trip.model";
import {SharedValidators} from "../../shared/validator/validators";

import {isNil, isNotNil, toBoolean} from '../../shared/shared.module';
import {ProgramService} from "../../referential/services/program.service";
import {LocalSettingsService} from "../../core/services/local-settings.service";

const REGEXP_INTEGER = /^[0-9]+$/;
const REGEXP_DOUBLE = /^[0-9]+(\.[0-9]+)?$/;

export interface MeasurementsValidatorOptions {
  isOnFieldMode?: boolean;
  pmfms?: PmfmStrategy[];
  protectedAttributes?: string[];
}

@Injectable()
export class MeasurementsValidatorService<T extends Measurement = Measurement, O extends MeasurementsValidatorOptions = MeasurementsValidatorOptions>
  implements ValidatorService {

  constructor(
    protected formBuilder: FormBuilder,
    protected settings: LocalSettingsService,
    protected programService: ProgramService) {
  }

  getRowValidator(opts?: O): FormGroup {
    return this.getFormGroup(null, opts);
  }

  getFormGroup(data: T[], opts?: O): FormGroup {
    opts = this.fillDefaultOptions(opts);

    return this.formBuilder.group(
      this.getFormGroupConfig(data, opts),
      this.getFormGroupOptions(data, opts)
    );
  }

  getFormGroupConfig(data: T[], opts?: O): { [key: string]: any } {
    opts = this.fillDefaultOptions(opts);

    return (opts.pmfms || []).reduce((res, pmfm) => {
      const validator = this.getPmfmValidator(pmfm);
      if (validator) {
        res[pmfm.pmfmId] = [null, validator];
      }
      else {
        res[pmfm.pmfmId] = [null];
      }
      return res;
    }, {});
  }

  getFormGroupOptions(data?: T[], opts?: O): {
    [key: string]: any;
  } {
    return {};
  }

  updateFormGroup(form: FormGroup, opts?: O) {
    opts = this.fillDefaultOptions(opts);

    const controlNamesToRemove: string[] = [];
    // tslint:disable-next-line:forin
    for (const controlName in form.controls) {
      controlNamesToRemove.push(controlName);
    }
    opts.pmfms.forEach(pmfm => {
      const controlName = pmfm.pmfmId.toString();
      let formControl: AbstractControl = form.get(controlName);
      // If new pmfm: add as control
      if (!formControl) {

        formControl = this.formBuilder.control(pmfm.defaultValue || '', this.getPmfmValidator(pmfm));
        form.addControl(controlName, formControl);
      }

      // Remove from the remove list
      const index = controlNamesToRemove.indexOf(controlName);
      if (index >= 0) controlNamesToRemove.splice(index, 1);

    });

    // Remove unused controls
    controlNamesToRemove
      .filter(controlName => !opts.protectedAttributes || !opts.protectedAttributes.includes(controlName)) // Keep protected columns
      .forEach(controlName => form.removeControl(controlName));
  }

  getPmfmValidator(pmfm: PmfmStrategy, validatorFns?: ValidatorFn[]): ValidatorFn {
    validatorFns = validatorFns || [];
    // Add required validator (if NOT in ON FIELD mode)
    if (pmfm.required && !this.settings.isFieldUsageMode()) {
      validatorFns.push(Validators.required);
    }
    if (pmfm.isAlphanumeric) {
      validatorFns.push(Validators.maxLength(40));
    }
    else if (pmfm.isNumeric) {

      if (isNotNil(pmfm.minValue)) {
        validatorFns.push(Validators.min(pmfm.minValue));
      }
      if (isNotNil(pmfm.maxValue)) {
        validatorFns.push(Validators.max(pmfm.maxValue));
      }

      // Pattern validation:
      // Integer or double with 0 decimals
      if (pmfm.type === 'integer' || pmfm.maximumNumberDecimals === 0) {
        validatorFns.push(Validators.pattern(REGEXP_INTEGER));
      }
      // Double without maximal decimals
      else if (pmfm.type === 'double' && isNil(pmfm.maximumNumberDecimals)) {
        validatorFns.push(Validators.pattern(REGEXP_DOUBLE));
      }
      // Double with a N decimal
      else if (pmfm.maximumNumberDecimals >= 1) {
        validatorFns.push(SharedValidators.double({maxDecimals: pmfm.maximumNumberDecimals}));
      }
    }
    else if (pmfm.type === 'qualitative_value') {
      validatorFns.push(SharedValidators.entity);
    }

    return validatorFns.length > 1 ? Validators.compose(validatorFns) : (validatorFns.length === 1 ? validatorFns[0] : undefined);
  }

  /* -- -- */
  protected fillDefaultOptions(opts?: O): O {
    opts = opts || {} as O;

    opts.isOnFieldMode = toBoolean(opts.isOnFieldMode, this.settings && this.settings.isUsageMode('FIELD') || false);

    opts.pmfms = opts.pmfms || [];

    opts.protectedAttributes = opts.protectedAttributes || ['id', 'rankOrder', 'comments', 'updateDate'];

    return opts;
  }
}
