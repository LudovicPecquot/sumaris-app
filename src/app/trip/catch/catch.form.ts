import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit} from '@angular/core';
import {Moment} from 'moment';
import {DateAdapter} from "@angular/material/core";
import {FormBuilder} from '@angular/forms';
import {MeasurementsValidatorService} from '../services/validator/measurement.validator';
import {MeasurementValuesForm} from '../measurement/measurement-values.form.class';
import {Subject} from 'rxjs';
import {BatchValidatorService} from '../services/validator/batch.validator';
import {LocalSettingsService}  from "@sumaris-net/ngx-components";
import {firstNotNilPromise} from "@sumaris-net/ngx-components";
import {Batch} from "../services/model/batch.model";
import {DenormalizedPmfmStrategy, PmfmStrategy} from "../../referential/services/model/pmfm-strategy.model";
import {ProgramRefService} from "../../referential/services/program-ref.service";
import {IPmfm, PmfmUtils} from "../../referential/services/model/pmfm.model";

@Component({
  selector: 'form-catch-batch',
  templateUrl: './catch.form.html',
  styleUrls: ['./catch.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatchBatchForm extends MeasurementValuesForm<Batch> implements OnInit {

  $onDeckPmfms = new Subject<IPmfm[]>();
  $sortingPmfms = new Subject<IPmfm[]>();
  $weightAndOtherPmfms = new Subject<IPmfm[]>();
  hasPmfms: boolean;

  @Input() showError = true;

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected measurementsValidatorService: MeasurementsValidatorService,
    protected formBuilder: FormBuilder,
    protected programRefService: ProgramRefService,
    protected validatorService: BatchValidatorService,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef
  ) {

    super(dateAdapter, measurementsValidatorService, formBuilder, programRefService, settings, cd, validatorService.getFormGroup());
  }

  ngOnInit() {
    super.ngOnInit();

    // Dispatch pmfms by category, using label
    firstNotNilPromise(this.$pmfms)
      .then(pmfms => {
        this.$onDeckPmfms.next(pmfms.filter(p => p.label && p.label.indexOf('ON_DECK_') === 0));
        this.$sortingPmfms.next(pmfms.filter(p => p.label && p.label.indexOf('SORTING_') === 0));
        this.$weightAndOtherPmfms.next(pmfms.filter(p =>
          p.label && p.label.indexOf('_WEIGHT') > 0
          || (p.label.indexOf('ON_DECK_') === -1 && p.label.indexOf('SORTING_') === -1)));

        this.hasPmfms = pmfms.length > 0;
      });

    // Make sure to set the label
    this.registerSubscription(
      this._onValueChanged.subscribe((_) => this.data.label = this._acquisitionLevel)
    );
  }
}
