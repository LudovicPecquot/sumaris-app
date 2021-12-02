import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, forwardRef, Input, OnInit, Optional, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, FormArray, FormBuilder, FormControl, FormGroupDirective, NG_VALUE_ACCESSOR } from '@angular/forms';
import { FloatLabelType } from '@angular/material/form-field';
import { AppFormUtils, filterNumberInput, focusInput, FormArrayHelper, InputElement, isNil, LocalSettingsService, setTabIndex, toBoolean, toNumber } from '@sumaris-net/ngx-components';
import { IPmfm, PmfmUtils } from '../services/model/pmfm.model';
import { PmfmValidators } from '../services/validator/pmfm.validators';
import { PmfmLabelPatterns, UnitLabel, UnitLabelPatterns } from '../services/model/model.enum';
import { PmfmQvFormFieldStyle } from '@app/referential/pmfm/pmfm-qv.form-field.component';
import { PmfmValue, PmfmValueUtils } from '@app/referential/services/model/pmfm-value.model';

const noop = () => {
};

export declare type PmfmFormFieldStyle = PmfmQvFormFieldStyle | 'radio' | 'checkbox' ;

@Component({
  selector: 'app-pmfm-field',
  styleUrls: ['./pmfm.form-field.component.scss'],
  templateUrl: './pmfm.form-field.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PmfmFormField),
      multi: true
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PmfmFormField implements OnInit, ControlValueAccessor, InputElement {

  private _onChangeCallback: (_: any) => void = noop;
  private _onTouchedCallback: () => void = noop;

  type: string;
  numberInputStep: string;
  formArrayHelper: FormArrayHelper<PmfmValue>;

  @Input() control: FormControl|FormArray;
  @Input() controlName: string;

  @Input() set formControl(value: FormControl) {
    this.control = value;
  }

  get formControl(): FormControl {
    return this.control as FormControl;
  }

  @Input() set formControlName(value: string) {
    this.controlName = value;
  }

  get formControlName(): string {
    return this.controlName;
  }

  @Input() set formArray(value: FormArray) {
    this.control = value;
  }

  get formArray(): FormArray {
    return this.control as FormArray;
  }

  @Input() set formArrayName(value: string) {
    this.controlName = value;
  }

  get formArrayName(): string {
    return this.controlName;
  }

  @Input() pmfm: IPmfm;
  @Input() required: boolean;
  @Input() readonly = false;
  @Input() hidden = false;
  @Input() placeholder: string;
  @Input() compact = false;
  @Input() floatLabel: FloatLabelType = "auto";
  @Input() tabindex: number;
  @Input() autofocus: boolean;
  @Input() style: PmfmFormFieldStyle;
  @Input() maxVisibleButtons: number;
  @Input() acquisitionNumber: number;
  @Input() defaultLatitudeSign: '+' | '-';
  @Input() defaultLongitudeSign: '+' | '-';

  // When async validator (e.g. BatchForm), force update when error detected
  @Input() listenStatusChanges = false;

  @Output('keyup.enter')
  onPressEnter = new EventEmitter<any>();

  get value(): any {
    return this.formControl.value;
  }

  get latLongFormat(): string {
    return this.settings.settings.latLongFormat || 'DDMM';
  }

  get disabled(): boolean {
    return this.formControl.disabled;
  }

  @ViewChild('matInput') matInput: ElementRef;

  constructor(
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef,
    protected formBuilder: FormBuilder,
    @Optional() private formGroupDir: FormGroupDirective
  ) {
  }

  ngOnInit() {

    if (!this.pmfm) throw new Error("Missing mandatory attribute 'pmfm' in <app-pmfm-field>.");
    if (typeof this.pmfm !== 'object') throw new Error("Invalid attribute 'pmfm' in <app-pmfm-field>. Should be an object.");
    this.controlName = this.controlName || this.pmfm.id?.toString();

    const control = this.control || (this.controlName && this.formGroupDir?.form.get(this.controlName));
    if (!control) throw new Error("Missing mandatory attribute 'formControl' or 'formControlName' in <app-pmfm-field>.");


    if (control instanceof FormArray) {
      this.control = control;
      this.acquisitionNumber = toNumber(this.acquisitionNumber, PmfmUtils.isDenormalizedPmfm(this.pmfm) ? this.pmfm.acquisitionNumber : -1);
      this.formArrayHelper = new FormArrayHelper<PmfmValue>(
        control,
        (value) => this.formBuilder.control(value || null),
        PmfmValueUtils.equals,
        PmfmValueUtils.isEmpty,
        {
          allowEmptyArray: false
        });

      this.type = 'array';
    }
    else if (control instanceof FormControl) {
      this.control = control;
      this.acquisitionNumber = 1; // Force to 1
      control.setValidators(PmfmValidators.create(this.pmfm));

      if (this.listenStatusChanges) {
        control.statusChanges.subscribe((_) => this.cd.markForCheck());
      }
      this.placeholder = this.placeholder || PmfmUtils.getPmfmName(this.pmfm, {withUnit: !this.compact});

      this.required = toBoolean(this.required, this.pmfm.required);

      this.updateTabIndex();

      // Compute the field type (use special case for Latitude/Longitude)
      let type = this.pmfm.type;
      if (this.hidden || this.pmfm.hidden) {
        type = "hidden";
      }
      else if (type === "double") {
        if (PmfmLabelPatterns.LATITUDE.test(this.pmfm.label) ) {
          type = "latitude";
        } else if (PmfmLabelPatterns.LONGITUDE.test(this.pmfm.label)) {
          type = "longitude";
        }
        else if (this.pmfm.unitLabel === UnitLabel.DECIMAL_HOURS || UnitLabelPatterns.DECIMAL_HOURS.test(this.pmfm.unitLabel)) {
          type = "duration";
        }
        else {
          this.numberInputStep = this.computeNumberInputStep(this.pmfm);
        }
      }
      else if (type === "date") {
        if (this.pmfm.unitLabel === UnitLabel.DATE_TIME || UnitLabelPatterns.DATE_TIME.test(this.pmfm.unitLabel)) {
           type = 'dateTime';
        }
      }
      this.type = type;
    }
    else {
      throw new Error('Unknown control type: ' + control.constructor.name);
    }
  }

  writeValue(value: any): void {
    if (this.type === 'array') {
      if (Array.isArray(value) && value !== this.control.value) {
        this.control.patchValue(value, {emitEvent: false});
        this._onChangeCallback(value);
      }
    }
    else {
      // FIXME This is a hack, because some time invalid value are passed
      // Example: in the batch group table (inline edition)
      if (PmfmUtils.isNumeric(this.pmfm) && Number.isNaN(value)) {
        //console.warn("Trying to set NaN value, in a measurement field ! " + this.constructor.name);
        value = null;
        if (value !== this.control.value) {
          this.control.patchValue(value, {emitEvent: false});
          this._onChangeCallback(value);
        }
      }
    }
  }

  registerOnChange(fn: any): void {
    this._onChangeCallback = fn;
  }

  registerOnTouched(fn: any): void {
    this._onTouchedCallback = fn;
  }

  setDisabledState(isDisabled: boolean): void {

  }

  markAsTouched() {
    if (this.control?.touched) {
      this.cd.markForCheck();
      this._onTouchedCallback();
    }
  }

  filterNumberInput = filterNumberInput;

  filterAlphanumericalInput(event: KeyboardEvent) {
    // TODO: Add features (e.g. check against a regexp/pattern ?)
  }

  focus() {
    if (this.hidden) {
      console.warn("Cannot focus an hidden measurement field!")
    }
    else {
      focusInput(this.matInput);
    }
  }

  selectInputContent = AppFormUtils.selectInputContent;

  /* -- protected method -- */

  protected computeNumberInputStep(pmfm: IPmfm): string {

    if (pmfm.maximumNumberDecimals > 0) {
      let step = "0.";
      if (pmfm.maximumNumberDecimals > 1) {
        for (let i = 0; i < pmfm.maximumNumberDecimals - 1; i++) {
          step += "0";
        }
      }
      step += "1";
      return step;
    } else {
      return "1";
    }
  }

  protected updateTabIndex() {
    if (isNil(this.tabindex) || this.tabindex === -1) return;
    setTimeout(() => {
      if (!this.matInput) return;
      setTabIndex(this.matInput, this.tabindex);
      this.cd.markForCheck();
    });
  }
}
