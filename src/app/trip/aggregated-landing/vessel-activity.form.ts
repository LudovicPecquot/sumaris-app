import {ChangeDetectorRef, Component, EventEmitter, Input, OnInit} from '@angular/core';
import {DateAdapter} from "@angular/material/core";
import {Moment} from "moment";
import {FormArray, FormBuilder} from "@angular/forms";
import {ReferentialRefService} from "../../referential/services/referential-ref.service";
import {ModalController} from "@ionic/angular";
import {LocalSettingsService}  from "@sumaris-net/ngx-components";
import {NetworkService}  from "@sumaris-net/ngx-components";
import {AggregatedLandingService} from "../services/aggregated-landing.service";
import {VesselActivity} from "../services/model/aggregated-landing.model";
import {MeasurementValuesForm} from "../measurement/measurement-values.form.class";
import {VesselActivityValidatorService} from "../services/validator/vessel-activity.validator";
import {MeasurementsValidatorService} from "../services/validator/measurement.validator";
import {METIER_DEFAULT_FILTER} from "../../referential/services/metier.service";
import {ReferentialRef, ReferentialUtils}  from "@sumaris-net/ngx-components";
import {FormArrayHelper}  from "@sumaris-net/ngx-components";
import {ProgramRefService} from "../../referential/services/program-ref.service";
import {IPmfm} from "../../referential/services/model/pmfm.model";
import {MetierFilter} from "../../referential/services/filter/metier.filter";

@Component({
  selector: 'app-vessel-activity-form',
  templateUrl: './vessel-activity.form.html',
  styleUrls: ['./vessel-activity.form.scss'],
})
export class VesselActivityForm extends MeasurementValuesForm<VesselActivity> implements OnInit {


  @Input() showError = true;

  mobile: boolean;
  onRefresh = new EventEmitter<any>();
  dates: Moment[];

  get metiersForm(): FormArray {
    return this.form.controls.metiers as FormArray;
  }

  metierFilter: MetierFilter = MetierFilter.fromObject(METIER_DEFAULT_FILTER);
  metiersHelper: FormArrayHelper<ReferentialRef>;
  metierFocusIndex = -1;
  enableMetierFilter = false;


  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected formBuilder: FormBuilder,
    protected dataService: AggregatedLandingService,
    protected programRefService: ProgramRefService,
    protected validatorService: VesselActivityValidatorService,
    protected measurementValidatorService: MeasurementsValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected modalCtrl: ModalController,
    protected settings: LocalSettingsService,
    public network: NetworkService,
    protected cd: ChangeDetectorRef
  ) {
    super(dateAdapter, measurementValidatorService, formBuilder, programRefService, settings, cd, null,
      {
        mapPmfms: (pmfms) => this.mapPmfms(pmfms)
      });
    this._enable = true;
    this.mobile = this.settings.mobile;

  }

  ngOnInit() {
    super.ngOnInit();

    // Combo: metiers
    const metierAttributes = this.settings.getFieldDisplayAttributes('metier');
    this.registerAutocompleteField<ReferentialRef>('metier', {
      service: this.referentialRefService,
      // Increase default column size, for 'label'
      columnSizes: metierAttributes.map(a => a === 'label' ? 3 : undefined/*auto*/),
      mobile: this.mobile
    });
    this.initMetiersHelper();

  }

  setValue(data: VesselActivity, opts?: { emitEvent?: boolean; onlySelf?: boolean; normalizeEntityToForm?: boolean; [p: string]: any }) {

    // Make sure to have (at least) one metier
    data.metiers = data.metiers && data.metiers.length ? data.metiers : [null];
    // Resize metiers array
    this.metiersHelper.resize(Math.max(1, data.metiers.length));

    super.setValue(data, opts);
  }

  protected initMetiersHelper() {

    this.metiersHelper = new FormArrayHelper<ReferentialRef>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'metiers'),
      (metier) => this.validatorService.getMetierFormControl(metier),
      ReferentialUtils.equals,
      ReferentialUtils.isEmpty,
      {
        allowEmptyArray: false
      }
    );

    // Create at least one metier
    if (this.metiersHelper.size() === 0) {
      this.metiersHelper.resize(1);

    }
  }

  addMetier() {
    this.metiersHelper.add();
    if (!this.mobile) {
      this.metierFocusIndex = this.metiersHelper.size() - 1;
    }
  }

  removeMetier(index: number) {
    // TODO add confirmation if tripId != null
    this.metiersHelper.removeAt(index);
  }

  protected mapPmfms(pmfms: IPmfm[]): IPmfm[] {
    return pmfms.filter(p => p.required);
  }
}
