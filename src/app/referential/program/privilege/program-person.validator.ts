import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { ValidatorService } from '@e-is/ngx-material-table';
import { SharedValidators } from '@sumaris-net/ngx-components';
import { ProgramPerson } from '@app/referential/services/model/program.model';

@Injectable({providedIn: 'root'})
export class ProgramPersonValidatorService implements ValidatorService {

  constructor(
    protected formBuilder: FormBuilder
  ) {
  }

  getRowValidator(): FormGroup {
    return this.getFormGroup();
  }

  getFormGroup(data?: ProgramPerson): FormGroup {
    return this.formBuilder.group({
      id: [data && data.id || null],
      updateDate: [data && data.updateDate || null],
      programId: [data && data.programId || null],
      location: [data && data.location || null, SharedValidators.entity],
      privilege: [data && data.privilege || null, Validators.compose([Validators.required, SharedValidators.entity])],
      person: [data && data.person || null, Validators.compose([Validators.required, SharedValidators.entity])],
    });
  }
}
