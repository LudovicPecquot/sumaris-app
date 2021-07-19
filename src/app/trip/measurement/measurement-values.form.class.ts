import {ChangeDetectorRef, Directive, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Moment} from 'moment';
import {DateAdapter} from '@angular/material/core';
import {FloatLabelType} from '@angular/material/form-field';
import {BehaviorSubject, isObservable, Observable} from 'rxjs';
import {FormBuilder, FormGroup} from '@angular/forms';
import {MeasurementsValidatorService} from '../services/validator/measurement.validator';
import {filter, throttleTime} from 'rxjs/operators';
import {IEntityWithMeasurement, MeasurementValuesUtils} from '../services/model/measurement.model';
import {AppForm, filterNotNil, firstNotNilPromise, isEmptyArray, isNil, isNotEmptyArray, isNotNil, LocalSettingsService} from '@sumaris-net/ngx-components';
import {ProgramRefService} from '@app/referential/services/program-ref.service';
import {IPmfm} from '@app/referential/services/model/pmfm.model';

export interface MeasurementValuesFormOptions<T extends IEntityWithMeasurement<T>> {
  mapPmfms?: (pmfms: IPmfm[]) => IPmfm[] | Promise<IPmfm[]>;
  onUpdateControls?: (formGroup: FormGroup) => void | Promise<void>;
}

@Directive()
// tslint:disable-next-line:directive-class-suffix
export abstract class MeasurementValuesForm<T extends IEntityWithMeasurement<T>> extends AppForm<T> implements OnInit {

  protected _onValueChanged = new EventEmitter<T>();
  protected _onRefreshPmfms = new EventEmitter<any>();
  protected _gearId: number = null;
  protected _acquisitionLevel: string;
  protected _ready = false;
  protected _forceOptional = false;
  protected _measurementValuesForm: FormGroup;
  protected data: T;

  loading = false; // Important, must be false
  loadingPmfms = true; // Important, must be true
  $loadingControls = new BehaviorSubject<boolean>(true);
  applyingValue = false;
  $programLabel = new BehaviorSubject<string>(undefined);
  $strategyLabel = new BehaviorSubject<string>(undefined);
  $pmfms = new BehaviorSubject<IPmfm[]>(undefined);


  get forceOptional(): boolean {
    return this._forceOptional;
  }

  get measurementValuesForm(): FormGroup {
    // TODO: use this._measurementValuesForm instead
    return this.form.controls.measurementValues as FormGroup; // this._measurementValuesForm || (this.form.controls.measurementValues as FormGroup);
  }

  @Input() compact = false;
  @Input() floatLabel: FloatLabelType = "auto";
  @Input() requiredStrategy = false;
  @Input() requiredGear = false;

  @Input()
  set programLabel(value: string) {
    this.setProgramLabel(value);
  }

  get programLabel(): string {
    return this.$programLabel.getValue();
  }

  @Input()
  set strategyLabel(value: string) {
    this.setStrategyLabel(value);
  }

  get strategyLabel(): string {
    return this.$strategyLabel.getValue();
  }

  @Input()
  set acquisitionLevel(value: string) {
    if (this._acquisitionLevel !== value && isNotNil(value)) {
      this._acquisitionLevel = value;
      if (!this.loading) this._onRefreshPmfms.emit();
    }
  }

  get acquisitionLevel(): string {
    return this._acquisitionLevel;
  }

  @Input()
  set gearId(value: number) {
    if (this._gearId !== value && isNotNil(value)) {
      this._gearId = value;
      if (!this.loading || this.requiredGear) this._onRefreshPmfms.emit();
    }
  }

  get gearId(): number {
    return this._gearId;
  }

  @Input()
  set value(value: T) {
    this.safeSetValue(value);
  }

  get value(): T {
    return this.getValue();
  }

  @Input() set pmfms(pmfms: Observable<IPmfm[]> | IPmfm[]) {
    this.loading = true;
    this.setPmfms(pmfms);
  }

  @Input()
  set forceOptional(value: boolean) {
    if (this._forceOptional !== value) {
      this._forceOptional = value;
      if (!this.loading) this._onRefreshPmfms.emit();
    }
  }

  @Output() valueChanges = new EventEmitter<any>();
  @Output() get strategyLabelChanges(): Observable<string> {
    return this.$strategyLabel.asObservable();
  }

  protected constructor(protected dateAdapter: DateAdapter<Moment>,
                        protected measurementValidatorService: MeasurementsValidatorService,
                        protected formBuilder: FormBuilder,
                        protected programRefService: ProgramRefService,
                        protected settings: LocalSettingsService,
                        protected cd: ChangeDetectorRef,
                        form?: FormGroup,
                        protected options?: MeasurementValuesFormOptions<T>
  ) {
    super(dateAdapter, form, settings);


    this.registerSubscription(
      this._onRefreshPmfms
        .subscribe(() => this.refreshPmfms('constructor'))
    );

    // Auto update the view, when pmfms are filled
    this.registerSubscription(
      filterNotNil(this.$pmfms)
        .subscribe((pmfms) => this.updateControls('constructor', pmfms))
    );

    // TODO: DEV only
    //this.debug = true;
  }

  ngOnInit() {
    super.ngOnInit();

    // Listen form changes
    this.registerSubscription(
      this.form.valueChanges
        .pipe(
          filter(() => !this.loading && !this.loadingPmfms && isNotEmptyArray(this.valueChanges.observers))
        )
        .subscribe((_) => this.valueChanges.emit(this.value))
    );

    if (this.data) {
      this._onValueChanged.emit(this.data);
    }
  }

  setValue(data: T, opts?: {emitEvent?: boolean; onlySelf?: boolean; normalizeEntityToForm?: boolean; [key: string]: any; }) {
    if (!this.isReady() || !this.data) {
      this.safeSetValue(data, opts); // Loop
      return;
    }

    // Adapt measurement values to form (if not skip)
    if (!opts || opts.normalizeEntityToForm !== false) {
      MeasurementValuesUtils.normalizeEntityToForm(data, this.$pmfms.getValue(), this.form);
    }

    // If a program has been filled, always keep it
    const program = this.form.controls['program'] && this.form.controls['program'].value;
    if (program) {
      data.program = program;
    }

    super.setValue(data, opts);

    // Restore form status
    this.restoreFormStatus({onlySelf: true, emitEvent: opts && opts.emitEvent});
  }

  reset(data?: T, opts?: {emitEvent?: boolean; onlySelf?: boolean; normalizeEntityToForm?: boolean; [key: string]: any; }) {
    if (!this.isReady() || !this.data) {
      this.safeSetValue(data, opts); // Loop
      return;
    }

    // Adapt measurement values to form (if not skip)
    if (!opts || opts.normalizeEntityToForm !== false) {
      MeasurementValuesUtils.normalizeEntityToForm(data, this.$pmfms.getValue(), this.form);
    }

    super.reset(data, opts);

    // Restore form status
    this.restoreFormStatus({onlySelf: true, emitEvent: opts && opts.emitEvent});
  }

  isReady(): boolean {
    return this._ready || (!this.$loadingControls.getValue()  && !this.loadingPmfms);
  }

  async ready(): Promise<void> {
    // Wait pmfms load, and controls load
    if (this.$loadingControls.getValue() !== false || this.loadingPmfms !== false) {
      this._ready = false;
      if (this.debug) console.debug(`${this.logPrefix} waiting form to be ready...`);
      await firstNotNilPromise(this.$loadingControls
        .pipe(
          filter((loadingControls) => loadingControls === false && this.loadingPmfms === false)
        ));
    }
    this._ready = true;
  }

  /**
   * Reset all data to original value. Useful sometimes, to re init the component (e.g. physical gear form).
   * Note: Keep @Input() attributes unchanged
   */
  public unload() {
    this.data = null;
    this.loadingPmfms = true;
    this.applyingValue = false;
    this._measurementValuesForm = null;
    this._ready = false;
    this.$loadingControls.next(true);
    this.$pmfms.next(undefined);
  }

  /* -- protected methods -- */

  protected setProgramLabel(value: string) {
    if (isNotNil(value) && this.$programLabel.getValue() !== value) {

      this.$programLabel.next(value);

      // Reload pmfms
      if (!this.loading) this._onRefreshPmfms.emit();
    }
  }

  protected setStrategyLabel(value: string) {
    if (isNotNil(value) && this.$strategyLabel.getValue() !== value) {

      this.$strategyLabel.next(value);

      // Reload pmfms
      if (!this.loading && this.requiredStrategy) this._onRefreshPmfms.emit();
    }
  }

  /**
   * Wait form is ready, before setting the value to form
   * @param data
   * @param opts
   */
  protected async safeSetValue(data: T, opts?: {emitEvent?: boolean; onlySelf?: boolean; normalizeEntityToForm?: boolean; }) {
    if (!data) {
      console.warn("Trying to set undefined value to meas form. Skipping");
      return;
    }

    // Propagate the program
    if (data.program && data.program.label) {
      this.programLabel = data.program.label;
    }

    // Will avoid data to be set inside function updateControls()
    this.applyingValue = true;

    // This line is required by physical gear modal
    this.data = data;
    this._onValueChanged.emit(data);

    // Wait form controls ready, if need
    if (!this._ready) await this.ready();

    this.setValue(this.data, {...opts, emitEvent: true});

    this.form.markAsPristine();
    this.form.markAsUntouched();

    this.applyingValue = false;
    this.loading = false;
  }

  protected getValue(): T {
    const json = this.form.value;

    const measurementValuesForm = this.measurementValuesForm;
    if (measurementValuesForm) {
      // Find dirty pmfms, to avoid full update
      const dirtyPmfms = (this.$pmfms.getValue() || []).filter(pmfm => measurementValuesForm.controls[pmfm.id].dirty);
      if (dirtyPmfms.length) {
        json.measurementValues = Object.assign({}, this.data && this.data.measurementValues || {}, MeasurementValuesUtils.normalizeValuesToModel(measurementValuesForm.value, dirtyPmfms));
      }
    }

    if (this.data && this.data.fromObject) {
      this.data.fromObject(json);
    }
    else {
      this.data = json;
    }

    return this.data;
  }

  protected async refreshPmfms(event?: any) {
    // Skip if missing: program, acquisition (or gear, if required)
    if (isNil(this.programLabel) || (this.requiredStrategy && isNil(this.strategyLabel))
      || isNil(this._acquisitionLevel) || (this.requiredGear && isNil(this._gearId))) {
      return;
    }

    if (this.debug) console.debug(`${this.logPrefix} refreshPmfms(${event})`);

    this.loading = true;
    this.loadingPmfms = true;

    this.$pmfms.next(null);

    try {
      // Load pmfms
      let pmfms = (await this.programRefService.loadProgramPmfms(
        this.programLabel,
        {
          strategyLabel: this.strategyLabel,
          acquisitionLevel: this._acquisitionLevel,
          gearId: this._gearId
        })) || [];

      if (isEmptyArray(pmfms)) {
        if (this.debug) console.warn(`${this.logPrefix} No pmfm found, for {program: ${this.programLabel}, acquisitionLevel: ${this._acquisitionLevel}, gear: ${this._gearId}}. Make sure programs/strategies are filled`);
        pmfms = []; // Create a new array, to force refresh in components that use '!==' to filter events
      }
      else {

        // If force to optional, create a copy of each pmfms that should be forced
        if (this._forceOptional) {
          pmfms = pmfms.map(pmfm => {
            if (pmfm.required) {
              pmfm = pmfm.clone(); // Keep original entity
              pmfm.required = false;
              return pmfm;
            }
            // Return original pmfm, as not need to be overrided
            return pmfm;
          });
        }
        else {
          pmfms = pmfms.slice(); // Do a copy, to force erfresh when comparing using '===' in components
        }
      }

      // Apply
      await this.setPmfms(pmfms);
    }
    catch (err) {
      console.error(`${this.logPrefix} Error while loading pmfms: ${err && err.message || err}`, err);
      this.loadingPmfms = false;
      this.$pmfms.next(null); // Reset pmfms
    }
    finally {
      if (this.enabled) this.loading = false;
      this.markForCheck();
    }
  }

  protected async updateControls(event?: string, pmfms?: IPmfm[]) {
    //if (isNil(this.data)) return; // not ready
    pmfms = pmfms || this.$pmfms.getValue();
    const form = this.form;
    this._measurementValuesForm = form.controls.measurementValues as FormGroup;

    // Waiting end of pmfm load
    if (!pmfms || this.loadingPmfms) {
      if (this.debug) console.debug(`${this.logPrefix} updateControls(${event}): waiting pmfms...`);
      pmfms = await firstNotNilPromise(
        // groups pmfms updates event, if many updates in few duration
        this.$pmfms.pipe(throttleTime(100))
      );
    }

    if (this._measurementValuesForm && this._measurementValuesForm.enabled) {
      this._measurementValuesForm.disable({onlySelf: true, emitEvent: false});
    }

    if (this.$loadingControls.getValue() !== true) {
      this._ready = false;
      this.$loadingControls.next(true);
    }
    this.loading = true;

    if (this.debug) console.debug(`${this.logPrefix} Updating form controls {event: ${event}, force_optional: ${this._forceOptional}}, using pmfms:`, pmfms);

    // No pmfms (= empty form)
    if (!pmfms.length) {
      // Reset measurement form (if exists)
      if (this._measurementValuesForm) {
        this.measurementValidatorService.updateFormGroup(this._measurementValuesForm, {pmfms: []});
        this._measurementValuesForm.reset({}, {onlySelf: true, emitEvent: false});
      }
    }

    else {
      if (this.debug) console.debug(`${this.logPrefix} Updating form controls, using pmfms:`, pmfms);

      // Create measurementValues form group
      if (!this._measurementValuesForm) {
        this._measurementValuesForm = this.measurementValidatorService.getFormGroup(null, {pmfms});

        form.addControl('measurementValues', this._measurementValuesForm);
        this._measurementValuesForm.disable({onlySelf: true, emitEvent: false});
      }

      // Or update if already exist
      else {
        this.measurementValidatorService.updateFormGroup(this._measurementValuesForm, {pmfms});
      }
    }

    // Call options function
    if (this.options && this.options.onUpdateControls) {
      const res = this.options.onUpdateControls(form);
      if (res instanceof Promise) {
        await res;
      }
    }

    this.loading = this.applyingValue; // Keep loading status if data not apply fully
    this.$loadingControls.next(false);

    if (this.debug) console.debug(`${this.logPrefix} Form controls updated`);

    // If data has already been set, apply it again
    if (!this.applyingValue) {
      if (this.data && pmfms.length && form) {
        this.setValue(this.data, {onlySelf: true, emitEvent: false});
      }
      // No data defined yet
      else {
        // Restore enable state (because form.setValue() can change it !)
        this.restoreFormStatus({onlySelf: true, emitEvent: false});
      }
    }

    return true;
  }

  async setPmfms(value: IPmfm[] | Observable<IPmfm[]>): Promise<IPmfm[]> {
    // If no pmfms
    if (!value) {
      // If need, reset pmfms
      if (!this.loadingPmfms || isNotNil(this.$pmfms.getValue())) {
        if (this.debug && isNotNil(this.$pmfms.getValue())) console.warn(`${this.logPrefix} setPmfms(null|undefined): resetting pmfms`);
        this.loadingPmfms = true;
        this.$pmfms.next(undefined);
      }
      return undefined; // skip
    }

    // Wait loaded, if observable
    let pmfms: IPmfm[];
    if (isObservable<IPmfm[]>(value)) {
      if (this.debug) console.debug(`${this.logPrefix} setPmfms(): waiting pmfms observable to emit...`);
      pmfms = await firstNotNilPromise(value);
    }
    else {
      pmfms = value;
    }

    // Map
    if (this.options && this.options.mapPmfms) {
      const res = this.options.mapPmfms(pmfms);
      pmfms = (res instanceof Promise) ? await res : res;
    }

    if (pmfms !== this.$pmfms.getValue()) {

      // Apply
      this.loadingPmfms = false;
      this.$pmfms.next(pmfms);
    }

    return pmfms;
  }

  protected restoreFormStatus(opts?: {emitEvent?: boolean; onlySelf?: boolean; }) {
    const form = this.measurementValuesForm;
    // Restore enable state (because form.setValue() can change it !)
    if (this._enable) {
      form.enable(opts);
    } else if (form.enabled) {
      form.disable(opts);
    }
  }

  protected get logPrefix(): string {
    const acquisitionLevel = this._acquisitionLevel && this._acquisitionLevel.toLowerCase().replace(/[_]/g, '-') || '?';
    return `[meas-values-form-${acquisitionLevel}]`;
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
