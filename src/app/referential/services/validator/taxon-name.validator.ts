import {Injectable} from "@angular/core";
import {FormBuilder, FormGroup, Validators} from "@angular/forms";
import {ReferentialValidatorService} from "./referential.validator";
import {TaxonName} from "../model/taxon-name.model";
import {toBoolean} from "../../../shared/functions";
import {SharedValidators} from "../../../shared/validator/validators";

@Injectable({providedIn: 'root'})
export class TaxonNameValidatorService extends ReferentialValidatorService<TaxonName> {

  constructor(
    protected formBuilder: FormBuilder
  ) {
    super(formBuilder);
  }

  getRowValidator(): FormGroup {
    return this.getFormGroup();
  }

  getFormGroupConfig(data?: TaxonName, opts?: { withDescription?: boolean; withComments?: boolean }): { [p: string]: any } {
    const config = super.getFormGroupConfig(data, opts);
    return {
      ...config,
      isReferent: [toBoolean(data && data.isReferent, true)],
      isNaming: [toBoolean(data && data.isNaming, false)],
      isVirtual: [toBoolean(data && data.isVirtual, false)],
      useExistingReferenceTaxon: [toBoolean(data && data.useExistingReferenceTaxon, false)],
      parentTaxonName: [data && data.parentTaxonName || null, SharedValidators.entity],
      referenceTaxonId: [data && data.referenceTaxonId || null],
      taxonomicLevel: [data && data.taxonomicLevel || null, Validators.required],
      startDate: [data && data.startDate || null, Validators.required],
      endDate: [data && data.endDate || null]

    };
  }

}
