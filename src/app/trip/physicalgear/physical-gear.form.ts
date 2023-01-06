import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Injector, Input, OnInit, Output, QueryList, ViewChildren } from '@angular/core';
import { PhysicalGearValidatorService } from './physicalgear.validator';
import { filter, mergeMap } from 'rxjs/operators';
import { MeasurementValuesForm, MeasurementValuesState } from '../measurement/measurement-values.form.class';
import { MeasurementsValidatorService } from '../services/validator/measurement.validator';
import { UntypedFormBuilder } from '@angular/forms';
import {
  focusNextInput,
  getFocusableInputElements,
  GetFocusableInputOptions,
  isNotNil,
  isNotNilOrBlank,
  ReferentialRef,
  ReferentialUtils,
  selectInputContent,
  toBoolean,
  toNumber,
  waitFor
} from '@sumaris-net/ngx-components';
import { AcquisitionLevelCodes } from '@app/referential/services/model/model.enum';
import { ReferentialRefService } from '@app/referential/services/referential-ref.service';
import { environment } from '@environments/environment';
import { ProgramRefService } from '@app/referential/services/program-ref.service';
import { OperationService } from '@app/trip/services/operation.service';
import { PhysicalGear } from '@app/trip/physicalgear/physical-gear.model';

interface PhysicalGearFormState extends MeasurementValuesState {
  gears: ReferentialRef[];
}

@Component({
  selector: 'app-physical-gear-form',
  templateUrl: './physical-gear.form.html',
  styleUrls: ['./physical-gear.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhysicalGearForm extends MeasurementValuesForm<PhysicalGear, PhysicalGearFormState> implements OnInit {

  gears$ = this._state.select('gears');

  @Input() tabindex: number;
  @Input() canEditRankOrder = false;
  @Input() canEditGear = true;
  @Input() maxItemCountForButtons: number = 12;
  @Input() maxVisibleButtons: number;
  @Input() showGear = true;
  @Input() showError = false;
  @Input() showComment: boolean;
  @Input() i18nSuffix: string = null;
  @Input() mobile: boolean;

  @Input() set gears(value: ReferentialRef[]) {
    this._state.set('gears', (_) => value);
  }
  get gears(): ReferentialRef[] {
    return this._state.get('gears');
  }

  @Output() onSubmit = new EventEmitter<any>();

  @ViewChildren('matInput') matInputs: QueryList<ElementRef>;

  constructor(
    injector: Injector,
    protected measurementValidatorService: MeasurementsValidatorService,
    protected formBuilder: UntypedFormBuilder,
    protected programRefService: ProgramRefService,
    protected validatorService: PhysicalGearValidatorService,
    protected operationService: OperationService,
    protected referentialRefService: ReferentialRefService,
  ) {
    super(injector, measurementValidatorService, formBuilder, programRefService, validatorService.getFormGroup());
    this._enable = true;

    // Set defaults
    this.acquisitionLevel = AcquisitionLevelCodes.PHYSICAL_GEAR;
    this.requiredGear = true;
    this.i18nPmfmPrefix = 'TRIP.PHYSICAL_GEAR.PMFM.';

    // Load gears from program
    this._state.connect('gears', this.programLabel$
      .pipe(
        mergeMap(programLabel => this.programRefService.loadGears(programLabel))
      ));

    this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();
    this.mobile = toBoolean(this.mobile, this.settings.mobile);
    this.tabindex = toNumber(this.tabindex, 1);
    this.showComment = !this.mobile || isNotNilOrBlank(this.data?.comments);

    // Combo: gears
    this.registerAutocompleteField('gear', {
      items: this.gears$,
      mobile: this.mobile,
      showAllOnFocus: true
    });

    // Disable gear field
    const gearControl = this.form.get('gear');
    if (!this.canEditGear && gearControl.enabled) {
      gearControl.disable();
    }

    // Propagate data.gear into gearId
    this.registerSubscription(
      this.form.get('gear').valueChanges
        .pipe(
          filter(ReferentialUtils.isNotEmpty)
        )
        .subscribe(gear => {
          this.data = this.data || new PhysicalGear();
          this.data.gear = gear;
          this.gearId = gear.id;
          this.markForCheck();
        })
    );
  }


  enable(opts?: { onlySelf?: boolean; emitEvent?: boolean }) {
    super.enable(opts);
    if (!this.canEditGear) {
      this.form.get('gear').disable(opts);
    }
  }

  async focusFirstInput() {
    await waitFor(() => this.enabled, {timeout: 2000});

    const inputElements = getFocusableInputElements(this.matInputs);
    if (inputElements.length) inputElements[0].focus();
  }

  focusNextInput(event: Event, opts?: Partial<GetFocusableInputOptions>): boolean {

    // DEBUG
    //return focusNextInput(event, this.inputFields, opts{debug: this.debug, ...opts});

    return focusNextInput(event, this.matInputs, opts);
  }

  async setValue(data: PhysicalGear, opts?: { emitEvent?: boolean; onlySelf?: boolean; normalizeEntityToForm?: boolean; [p: string]: any; waitIdle?: boolean }) {
    // For ce to clean previous gearId (to for pmfms recomputation)
    if (isNotNil(this.gearId)) {
      this.gearId = null;
    }

    // Can edite only if not used yet, in any operation
    if (isNotNil(data?.tripId) && this.canEditGear) {
      this.canEditGear =  await this.operationService.areUsedPhysicalGears(data.tripId,[data.id]);
    }

    this.showComment = this.showComment || isNotNilOrBlank(data.comments);

    await super.setValue(data, opts);
  }

  protected getValue(): PhysicalGear {
    const target = super.getValue();

    // Re Add gear, if control has been disabled
    const jsonGear = this.form.get('gear').value;
    target.gear = jsonGear && ReferentialRef.fromObject(jsonGear);

    return target;
  }

  toggleComment() {
    if (this.disabled) return;

    this.showComment = !this.showComment;
    if (!this.showComment) {
      this.form.get('comments').setValue(null);
    }
    this.markForCheck();
  }

  /* -- protected methods -- */

  protected onApplyingEntity(data: PhysicalGear, opts?: {[key: string]: any;}) {

    if (!data) return; // Skip

    super.onApplyingEntity(data, opts);

    // Propagate the gear
    if (ReferentialUtils.isNotEmpty(data.gear)) {
      this.gearId = data.gear.id;
    }
  }

  selectInputContent = selectInputContent;
}
