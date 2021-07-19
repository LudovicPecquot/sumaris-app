import {ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, forwardRef, Input, OnInit, Optional, Output, ViewChild} from '@angular/core';
import {ControlValueAccessor, FormControl, FormGroupDirective, NG_VALUE_ACCESSOR} from '@angular/forms';
import {FloatLabelType} from '@angular/material/form-field';
import {AppFormUtils, filterNumberInput, focusInput, InputElement, isNil, LocalSettingsService, setTabIndex, toBoolean} from '@sumaris-net/ngx-components';
import {IPmfm, PmfmUtils} from '../services/model/pmfm.model';
import {PmfmValidators} from '../services/validator/pmfm.validators';
import {PmfmLabelPatterns, UnitLabel, UnitLabelPatterns} from '../services/model/model.enum';

const noop = () => {
};

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

  @Input() pmfm: IPmfm;
  @Input() required: boolean;
  @Input() readonly = false;
  @Input() hidden = false;
  @Input() formControl: FormControl;
  @Input() formControlName: string;
  @Input() placeholder: string;
  @Input() compact = false;
  @Input() floatLabel: FloatLabelType = "auto";
  @Input() tabindex: number;
  @Input() autofocus: boolean;

  // When async validator (e.g. BatchForm), force update when error detected
  @Input() listenStatusChanges: boolean;

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
    @Optional() private formGroupDir: FormGroupDirective
  ) {

  }

  ngOnInit() {

    if (!this.pmfm) throw new Error("Missing mandatory attribute 'pmfm' in <app-pmfm-field>.");
    if (typeof this.pmfm !== 'object') throw new Error("Invalid attribute 'pmfm' in <app-pmfm-field>. Should be an object.");

    this.formControl = this.formControl || (this.formControlName && this.formGroupDir && this.formGroupDir.form.get(this.formControlName) as FormControl);
    if (!this.formControl) throw new Error("Missing mandatory attribute 'formControl' or 'formControlName' in <app-pmfm-field>.");

    this.formControl.setValidators(PmfmValidators.create(this.pmfm));

    if (this.listenStatusChanges) {
      this.formControl.statusChanges.subscribe((_) => this.cd.markForCheck());
    }
    this.placeholder = this.placeholder || PmfmUtils.getPmfmName(this.pmfm, {withUnit: !this.compact});
    this.required = toBoolean(this.required, this.pmfm.required);

    this.updateTabIndex();

    // Compute the field type (use special case for Latitude/Longitude)
    let type = this.pmfm.type;
    if (this.hidden) {
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

  writeValue(value: any): void {
    // FIXME This is a hack, because some time invalid value are passed
    // Example: in the batch group table (inline edition)
    if (PmfmUtils.isNumeric(this.pmfm) && Number.isNaN(value)) {
      //console.warn("Trying to set NaN value, in a measurement field ! " + this.constructor.name);
      value = null;
      if (value !== this.formControl.value) {
        this.formControl.patchValue(value, {emitEvent: false});
        this._onChangeCallback(value);
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
    if (this.formControl.touched) {
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
