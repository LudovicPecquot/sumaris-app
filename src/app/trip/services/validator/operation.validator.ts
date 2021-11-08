import { Injectable } from '@angular/core';
import { ValidatorService } from '@e-is/ngx-material-table';
import { AbstractControl, AbstractControlOptions, AsyncValidatorFn, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { PositionValidatorService } from './position.validator';
import { fromDateISOString, isNotNil, LocalSettingsService, SharedFormGroupValidators, SharedValidators, toBoolean } from '@sumaris-net/ngx-components';
import { DataEntityValidatorOptions, DataEntityValidatorService } from '@app/data/services/validator/data-entity.validator';
import {AcquisitionLevelCodes, QualityFlagIds} from '@app/referential/services/model/model.enum';
import { Program } from '@app/referential/services/model/program.model';
import { MeasurementsValidatorService } from './measurement.validator';
import { Operation, Trip } from '../model/trip.model';

export interface OperationValidatorOptions extends DataEntityValidatorOptions {
  program?: Program;
  withMeasurements?: boolean;
  withParent?: boolean;
  withChild?: boolean;
  trip?: Trip;
}

export const OPERATION_MAX_TOTAL_DURATION_DAYS = 100;
export const OPERATION_MAX_SHOOTING_DURATION_HOURS = 12;

@Injectable({providedIn: 'root'})
export class OperationValidatorService<O extends OperationValidatorOptions = OperationValidatorOptions>
  extends DataEntityValidatorService<Operation, O>
  implements ValidatorService {

  constructor(
    formBuilder: FormBuilder,
    settings: LocalSettingsService,
    private positionValidator: PositionValidatorService,
    protected measurementsValidatorService: MeasurementsValidatorService
  ) {
    super(formBuilder, settings);
  }

  getRowValidator(): FormGroup {
    return this.getFormGroup();
  }

  getFormGroup(data?: Operation, opts?: O): FormGroup {
    opts = this.fillDefaultOptions(opts);

    const form = super.getFormGroup(data, opts);

    // Add measurement form
    if (opts.withMeasurements) {
      const pmfms = (opts.program && opts.program.strategies[0] && opts.program.strategies[0].denormalizedPmfms || [])
        .filter(p => p.acquisitionLevel === AcquisitionLevelCodes.OPERATION);
      form.addControl('measurements', this.measurementsValidatorService.getFormGroup(data && data.measurements, {
        isOnFieldMode: opts.isOnFieldMode,
        pmfms
      }));
    }

    return form;
  }

  getFormGroupConfig(data?: Operation, opts?: O): { [key: string]: any } {

    const formConfig = Object.assign(
      super.getFormGroupConfig(data, opts),
      {
        __typename: [Operation.TYPENAME],
        startDateTime: [data && data.startDateTime || null, Validators.required],
        fishingStartDateTime: [data && data.fishingStartDateTime || null],
        fishingEndDateTime: [data && data.fishingEndDateTime || null],
        endDateTime: [data && data.endDateTime || null, SharedValidators.copyParentErrors(['dateRange', 'dateMaxDuration'])],
        rankOrderOnPeriod: [data && data.rankOrderOnPeriod || null],
        startPosition: this.positionValidator.getFormGroup(null, {required: true}),
        endPosition: this.positionValidator.getFormGroup(null, {required: !opts.isOnFieldMode}),
        metier: [data && data.metier || null, Validators.compose([Validators.required, SharedValidators.entity])],
        physicalGear: [data && data.physicalGear || null, Validators.compose([Validators.required, SharedValidators.entity])],
        comments: [data && data.comments || null, Validators.maxLength(2000)],
        parentOperation: [data && data.parentOperation || null],
        childOperation: [data && data.childOperation || null],
        qualityFlagId: [data && data.qualityFlagId || null]
      });

    return formConfig;
  }

  getFormGroupOptions(data?: Operation, opts?: O): AbstractControlOptions {

    // Parent operation (=Filage)
    if (opts?.withChild || data?.childOperation) {
      return {
        validators: Validators.compose([
          // Make sure date range
          SharedFormGroupValidators.dateRange('startDateTime', 'fishingStartDateTime'),
          // Check shooting (=Filage) max duration
          SharedFormGroupValidators.dateMaxDuration('startDateTime', 'fishingStartDateTime', OPERATION_MAX_SHOOTING_DURATION_HOURS, 'hours')
        ])
      };
    }

    // Child operation (=Virage)
    else if (opts?.withParent || data?.parentOperation) {
      return {
        validators: Validators.compose([
          // Make sure date range
          SharedFormGroupValidators.dateRange('fishingEndDateTime', 'endDateTime'),
          // Check netting (=Relève) max duration
          SharedFormGroupValidators.dateMaxDuration('fishingEndDateTime', 'endDateTime', OPERATION_MAX_SHOOTING_DURATION_HOURS, 'hours'),
          // Check total max duration
          SharedFormGroupValidators.dateMaxDuration('startDateTime', 'endDateTime', OPERATION_MAX_TOTAL_DURATION_DAYS, 'days'),
        ])
      };

    }

    // Default case
    else {
      return {
        validators: Validators.compose([
          SharedFormGroupValidators.dateRange('startDateTime', 'endDateTime'),
          // Check total max duration
          SharedFormGroupValidators.dateMaxDuration('startDateTime', 'endDateTime', OPERATION_MAX_TOTAL_DURATION_DAYS, 'days')
        ])
      };

    }

  }

  updateFormGroup(formGroup: FormGroup, opts?: O) {

    // DEBUG
    //console.debug(`[operation-validator] Updating form group validators`);

    const parentControl = formGroup.get('parentOperation');
    const childControl = formGroup.get('childOperation');
    const qualityFlagControl = formGroup.get('qualityFlagId');
    const fishingStartDateTimeControl = formGroup.get('fishingStartDateTime');
    const fishingEndDateTimeControl = formGroup.get('fishingEndDateTime');
    const endDateTimeControl = formGroup.get('endDateTime');

    // Validator to date inside the trip
    const tripDatesValidators = opts?.trip && this.createTripDatesValidator(opts.trip) || undefined;

    // Is a parent
    if (opts?.withChild) {
      console.info('[operation-validator] Updating validator -> Parent operation');
      parentControl.clearValidators();
      parentControl.disable();

      // Set Quality flag, to mark as parent operation
      qualityFlagControl.setValidators(Validators.required);
      qualityFlagControl.patchValue(QualityFlagIds.NOT_COMPLETED, {emitEvent: false});

      // startDateTime = START
      // fishingStartDateTime = END
      const fishingStartDateTimeValidators = [
        tripDatesValidators,
        SharedValidators.dateRangeEnd('startDateTime'),
        SharedValidators.dateRangeStart('childOperation.fishingEndDateTime', 'TRIP.OPERATION.ERROR.FIELD_DATE_AFTER_CHILD_OPERATION'),

      ];
      fishingStartDateTimeControl.setValidators(opts?.isOnFieldMode
        ? Validators.compose(fishingStartDateTimeValidators)
        : Validators.compose([Validators.required, ...fishingStartDateTimeValidators]));

      // Disable unused controls
      fishingEndDateTimeControl.disable();
      fishingEndDateTimeControl.clearValidators();
      endDateTimeControl.disable();
      endDateTimeControl.clearValidators();
    }

    // Is a child
    else if (opts?.withParent) {
      console.info('[operation-validator] Updating validator -> Child operation');
      parentControl.setValidators(Validators.compose([Validators.required, SharedValidators.entity]));
      parentControl.enable();
      childControl.disable();

      // Clear quality flag
      qualityFlagControl.clearValidators();
      qualityFlagControl.patchValue(null, {emitEvent: false})

      // fishingEndDateTime = START
      fishingEndDateTimeControl.setValidators(Validators.compose([
          Validators.required,
          // Should be after parent dates
          SharedValidators.dateRangeEnd('fishingStartDateTime', 'TRIP.OPERATION.ERROR.FIELD_DATE_BEFORE_PARENT_OPERATION')
        ]));
      fishingEndDateTimeControl.enable();

      // endDateTime = END
      const endDateTimeValidators = [tripDatesValidators, SharedValidators.copyParentErrors(['dateRange', 'dateMaxDuration'])];
      endDateTimeControl.setValidators(opts?.isOnFieldMode
        ? endDateTimeValidators
        : Validators.compose([Validators.required, ...endDateTimeValidators]));
      endDateTimeControl.enable();

      // Disable unused controls
      fishingStartDateTimeControl.clearValidators();
      fishingStartDateTimeControl.updateValueAndValidity();

    }

    // Default case
    else {
      console.info('[operation-validator] Applying default validator');
      parentControl.clearValidators();
      parentControl.disable();

      childControl.clearValidators();
      childControl.disable();

      // Clear quality flag
      qualityFlagControl.clearValidators();
      qualityFlagControl.patchValue(null, {emitEvent: false})

      // = END DATE
      const endDateTimeValidators = [tripDatesValidators, SharedValidators.copyParentErrors(['dateRange', 'dateMaxDuration'])];
      endDateTimeControl.setValidators(opts?.isOnFieldMode
        ? endDateTimeValidators
        : Validators.compose([Validators.required, ...endDateTimeValidators]));

      // Disable unused controls
      fishingStartDateTimeControl.disable();
      fishingStartDateTimeControl.clearValidators();
      fishingEndDateTimeControl.disable()
      fishingEndDateTimeControl.clearValidators();
    }

    // Update form group validators
    const formValidators = this.getFormGroupOptions(null, opts)?.validators;
    formGroup.setValidators(formValidators);
  }

  /* -- protected methods -- */

  protected fillDefaultOptions(opts?: O): O {
    opts = super.fillDefaultOptions(opts);

    opts.withMeasurements = toBoolean(opts.withMeasurements,  toBoolean(!!opts.program, false));
    //console.debug("[operation-validator] Ope Validator will use options:", opts);

    return opts;
  }

  protected composeToAsync(validators: ValidatorFn[]): AsyncValidatorFn {
    return async (control) => {
      if (!control.touched && !control.dirty) return null;

      const errors: ValidationErrors = validators
        .map(validator => validator(control))
        .find(isNotNil) || null;

      // Clear unused errors
      if (!errors || !errors.msg) SharedValidators.clearError(control, 'msg');
      if (!errors || !errors.required) SharedValidators.clearError(control, 'required');
      return errors;
    };
  }

  protected createTripDatesValidator(trip): ValidatorFn {
    return (control) => {
      const dateTime = fromDateISOString(control.value);
      const tripDepartureDateTime = fromDateISOString(trip.departureDateTime);
      const tripReturnDateTime = fromDateISOString(trip.returnDateTime);

      // Make sure trip.departureDateTime < operation.endDateTime
      if (dateTime && tripDepartureDateTime && tripDepartureDateTime.isBefore(dateTime) === false) {
        console.warn(`[operation] Invalid operation: before the trip`, dateTime, tripDepartureDateTime);
        return <ValidationErrors>{msg: 'TRIP.OPERATION.ERROR.FIELD_DATE_BEFORE_TRIP'};
      }
      // Make sure operation.endDateTime < trip.returnDateTime
      else if (dateTime && tripReturnDateTime && dateTime.isBefore(tripReturnDateTime) === false) {
        console.warn(`[operation] Invalid operation: after the trip`, dateTime, tripReturnDateTime);
        return <ValidationErrors>{msg: 'TRIP.OPERATION.ERROR.FIELD_DATE_AFTER_TRIP'};
      }
    }
  }
}
