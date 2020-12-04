import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit} from '@angular/core';
import {VesselValidatorService} from "../../services/validator/vessel.validator";
import {Vessel} from "../../services/model/vessel.model";
import {LocationLevelIds} from "../../services/model/model.enum";
import {DefaultStatusList, referentialToString} from "../../../core/services/model/referential.model";
import {Moment} from 'moment/moment';
import {DateAdapter} from "@angular/material/core";
import {ReferentialRefService} from '../../services/referential-ref.service';
import {LocalSettingsService} from "../../../core/services/local-settings.service";
import {AccountService} from "../../../core/services/account.service";
import {AppForm} from "../../../core/form/form.class";
import {StatusIds} from "../../../core/services/model/model.enum";
import {AppFormUtils} from "../../../core/form/form.utils";


@Component({
  selector: 'form-vessel',
  templateUrl: './form-vessel.html',
  styleUrls: ['./form-vessel.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VesselForm extends AppForm<Vessel> implements OnInit {

  private _defaultStatus: number;

  data: Vessel;
  statusList = DefaultStatusList;
  statusById: any;

  @Input() set defaultStatus(value: number) {
    if (this._defaultStatus !== value) {
      this._defaultStatus = value;
      if (this.form) {
        this.form.get('statusId').setValue(this.defaultStatus);
      }
    }
  }

  get defaultStatus(): number {
    return this._defaultStatus;
  }

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected vesselValidatorService: VesselValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected cd: ChangeDetectorRef,
    protected settings: LocalSettingsService,
    private accountService: AccountService
  ) {

    super(dateAdapter, vesselValidatorService.getFormGroup(), settings);

    // Fill statusById
    this.statusById = {};
    this.statusList.forEach((status) => this.statusById[status.id] = status);
  }

  ngOnInit() {
    super.ngOnInit();

    // Combo location
    this.registerAutocompleteField('basePortLocation', {
      service: this.referentialRefService,
      filter: {
        entityName: 'Location',
        levelId: LocationLevelIds.PORT,
        statusId: StatusIds.ENABLE
      }
    });
    this.registerAutocompleteField('registrationLocation', {
      service: this.referentialRefService,
      filter: {
        entityName: 'Location',
        levelId: LocationLevelIds.COUNTRY,
        statusId: StatusIds.ENABLE
      }
    });
    this.registerAutocompleteField('vesselType', {
      service: this.referentialRefService,
      filter: {
        entityName: 'VesselType',
        statusId: StatusIds.ENABLE
      }
    });

    this.form.reset();

    // set default values
    if (this.defaultStatus) {
      this.form.get('statusId').setValue(this.defaultStatus);
    }

  }

  isAdmin(): boolean {
    return this.accountService.isAdmin();
  }

  referentialToString = referentialToString;
  filterNumberInput = AppFormUtils.filterNumberInput;


  /* -- protected methods -- */

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
