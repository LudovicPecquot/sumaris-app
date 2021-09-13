import {FormBuilder, Validators} from "@angular/forms";
import {LocalSettingsService, SharedValidators} from '@sumaris-net/ngx-components';

import {DataRootEntityValidatorOptions, DataRootEntityValidatorService} from "./root-data-entity.validator";
import {DataRootVesselEntity} from "../model/root-vessel-entity.model";
import {Optional} from '@angular/core';

export abstract class DataRootVesselEntityValidatorService<T extends DataRootVesselEntity<T>, O extends DataRootEntityValidatorOptions = DataRootEntityValidatorOptions>
  extends DataRootEntityValidatorService<T, O> {

  protected constructor(
    formBuilder: FormBuilder,
    settings?: LocalSettingsService) {
    super(formBuilder, settings);
  }

  getFormGroupConfig(data?: T, opts?: O): {
    [key: string]: any;
  } {

    return Object.assign(
      super.getFormGroupConfig(data),
      {
        vesselSnapshot: ['', Validators.compose([Validators.required, SharedValidators.entity])]
      });
  }
}
