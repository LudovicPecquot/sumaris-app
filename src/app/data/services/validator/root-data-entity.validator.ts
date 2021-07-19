import {Person}  from "@sumaris-net/ngx-components";
import {FormBuilder, FormControl, Validators} from "@angular/forms";
import {SharedFormArrayValidators, SharedValidators} from "@sumaris-net/ngx-components";
import {RootDataEntity} from "../model/root-data-entity.model";
import {IWithObserversEntity} from "../model/model.utils";
import {Program} from "../../../referential/services/model/program.model";
import {LocalSettingsService}  from "@sumaris-net/ngx-components";
import {Optional} from "@angular/core";
import {DataEntityValidatorOptions, DataEntityValidatorService} from "./data-entity.validator";

export interface DataRootEntityValidatorOptions extends DataEntityValidatorOptions {
  withObservers?: boolean;
  program?: Program;
}

export abstract class DataRootEntityValidatorService<T extends RootDataEntity<T>, O extends DataRootEntityValidatorOptions = DataRootEntityValidatorOptions>
  extends DataEntityValidatorService<T, O> {

  protected constructor(
    protected formBuilder: FormBuilder,
    @Optional() protected settings?: LocalSettingsService
    ) {
    super(formBuilder, settings);
  }

  getFormGroupConfig(data?: T, opts?: O): {
    [key: string]: any;
  } {

    return {
      ...super.getFormGroupConfig(data),
      program: [data && data.program || null, Validators.compose([Validators.required, SharedValidators.entity])],
      creationDate: [data && data.creationDate || null],
      recorderPerson: [data && data.recorderPerson || null, SharedValidators.entity],
      comments: [data && data.comments || null, Validators.maxLength(2000)],
      synchronizationStatus: [data && data.synchronizationStatus || null]
    };
  }

  getObserversFormArray(data?: IWithObserversEntity<T>) {
    return this.formBuilder.array(
      (data && data.observers || [null]).map(observer => this.getObserverControl(observer)),
      SharedFormArrayValidators.requiredArrayMinLength(1)
    );
  }

  getObserverControl(observer?: Person): FormControl {
    return this.formBuilder.control(observer || null, [Validators.required, SharedValidators.entity]);
  }
}
