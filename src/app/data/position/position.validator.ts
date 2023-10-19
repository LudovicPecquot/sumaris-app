import { Injectable } from '@angular/core';
import { AbstractControl, UntypedFormBuilder, UntypedFormGroup, ValidatorFn, Validators } from '@angular/forms';
import { SharedValidators, toNumber } from '@sumaris-net/ngx-components';
import { BBox } from 'geojson';
import { IPositionEntity } from '@app/data/position/position.model';

@Injectable({providedIn: 'root'})
export class PositionValidatorService {

  constructor(private formBuilder: UntypedFormBuilder) {
  }

  getFormGroup(data: IPositionEntity | undefined,
               opts: {
                 __typename: string;
                 required?: boolean;
                 boundingBox?: BBox;
               }): UntypedFormGroup {
    return this.formBuilder.group({
      __typename: [data?.__typename || opts.__typename],
      id: [toNumber(data?.id, null)],
      updateDate: [data?.updateDate || null],
      dateTime: [data?.dateTime || null],
      latitude: [toNumber(data?.latitude, null), this.getLatitudeValidator(opts)],
      longitude: [toNumber(data?.longitude, null),this.getLongitudeValidator(opts)]
    });
  }

  updateFormGroup(form: AbstractControl,
                 opts: {
                   required?: boolean;
                   boundingBox?: BBox;
                 }) {
    // Latitude
    form.get('latitude').setValidators(this.getLatitudeValidator(opts));

    // Longitude
    form.get('longitude').setValidators(this.getLongitudeValidator(opts));
  }

  getLatitudeValidator(opts?: {required?: boolean; boundingBox?: BBox}): ValidatorFn {
    let validators: ValidatorFn[] = [];
    if (opts?.required) validators = [Validators.required];
    if (opts?.boundingBox) {
      validators = [
        ...validators,
        Validators.min(Math.min(opts.boundingBox[1], opts.boundingBox[3])),
        Validators.max(Math.max(opts.boundingBox[1], opts.boundingBox[3]))
      ];
    }
    else {
      validators = [
        ...validators,
        SharedValidators.latitude
      ];
    }
    return Validators.compose(validators);
  }

  getLongitudeValidator(opts?: {required?: boolean; boundingBox?: BBox}) {
    let validators: ValidatorFn[] = [];
    if (opts?.required) validators = [Validators.required];
    if (opts?.boundingBox) {
      validators = [
        ...validators,
        Validators.min(Math.min(opts.boundingBox[0], opts.boundingBox[2])),
        Validators.max(Math.max(opts.boundingBox[0], opts.boundingBox[2]))
      ];
    }
    else {
      validators = [
        ...validators,
        SharedValidators.longitude
      ];
    }
    return Validators.compose(validators);
  }
}
