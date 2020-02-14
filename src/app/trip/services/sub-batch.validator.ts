import { Injectable } from "@angular/core";
import { ValidatorService } from "angular4-material-table";
import { FormGroup, Validators, FormBuilder } from "@angular/forms";
import { SharedValidators } from "../../shared/validator/validators";
import {Batch} from "./trip.model";
import {toNumber} from "../../shared/functions";

@Injectable()
export class SubBatchValidatorService implements ValidatorService {

  constructor(
    private formBuilder: FormBuilder) {
  }

  getRowValidator(): FormGroup {
    return this.getFormGroup();
  }

  getFormGroup(data?: Batch): FormGroup {
    return this.formBuilder.group({
      __typename: [Batch.TYPENAME],
      id: [toNumber(data && data.id, null)],
      updateDate: [data && data.updateDate || null],
      rankOrder: [toNumber(data && data.rankOrder, null), Validators.required],
      label: [data && data.label || null],
      individualCount: [toNumber(data && data.individualCount, null), Validators.compose([Validators.min(1), SharedValidators.integer])],
      samplingRatio: [toNumber(data && data.samplingRatio, null), SharedValidators.empty], // Make no sense to have sampling ratio
      samplingRatioText: [data && data.samplingRatioText || null, SharedValidators.empty], // Make no sense to have sampling ratio
      taxonGroup: [data && data.taxonGroup || null, SharedValidators.entity],
      taxonName: [data && data.taxonName || null, SharedValidators.entity],
      comments: [data && data.comments || null],
      parent: [data && data.parent || null, Validators.compose([Validators.required, SharedValidators.object])],
      measurementValues: this.formBuilder.group({})
    });
  }
}
