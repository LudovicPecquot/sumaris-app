import {AfterViewInit, ChangeDetectionStrategy, Component, Injector, OnInit, ViewChild} from '@angular/core';
import {VesselService} from '../../services/vessel-service';
import {VesselForm} from '../form/form-vessel';
import {fromDateISOString, isNotNil, toDateISOString, VesselSnapshot} from '../../services/model';
import {AccountService} from "../../../core/services/account.service";
import {AppEditorPage} from "../../../core/form/editor-page.class";
import {AbstractControl, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators} from "@angular/forms";
import {DateFormatPipe, EditorDataServiceLoadOptions} from "../../../shared/shared.module";
import * as moment from "moment";
import {VesselFeaturesHistoryComponent} from "./vessel-features-history.component";
import {VesselRegistrationHistoryComponent} from "./vessel-registration-history.component";
import {SharedValidators} from "../../../shared/validator/validators";
import {Moment} from "moment";
import {control} from "leaflet";
import {DateAdapter} from "@angular/material";
import {TranslateService} from "@ngx-translate/core";

@Component({
  selector: 'page-vessel',
  templateUrl: './page-vessel.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VesselPage extends AppEditorPage<VesselSnapshot> implements OnInit, AfterViewInit {

  previousData: VesselSnapshot;
  isNewFeatures = false;
  isNewRegistration = false;
  private _editing = false;
  get editing(): boolean {
    return this._editing || this.isNewFeatures || this.isNewRegistration;
  }
  set editing(value: boolean) {
    if (!value) {
      this.isNewFeatures = false;
      this.isNewRegistration = false;
    }
    this._editing = value;
  }

  @ViewChild('vesselForm', { static: true }) private vesselForm: VesselForm;

  @ViewChild('featuresHistoryTable', { static: true }) private featuresHistoryTable: VesselFeaturesHistoryComponent;

  @ViewChild('registrationHistoryTable', { static: true }) private registrationHistoryTable: VesselRegistrationHistoryComponent;

  protected get form(): FormGroup {
    return this.vesselForm.form;
  }

  constructor(
    private injector: Injector,
    private accountService: AccountService,
    private vesselService: VesselService,
    private dateAdapter: DateFormatPipe
  ) {
    super(injector, VesselSnapshot, vesselService);
    this.idAttribute = 'vesselId';
  }

  ngOnInit() {
    // Make sure template has a form
    if (!this.form) throw "[VesselPage] no form for value setting";
    this.form.disable();

    super.ngOnInit();
  }

  ngAfterViewInit(): void {

    this.registerSubscription(
      this.onRefresh.subscribe(() => {
          this.featuresHistoryTable.setFilter({vesselId: this.data.id});
          this.registrationHistoryTable.setFilter({vesselId: this.data.id});
        }
      )
    );

  }

  protected registerFormsAndTables() {
    this.registerForm(this.vesselForm).registerTables([this.featuresHistoryTable, this.registrationHistoryTable]);
  }

  protected async onNewEntity(data: VesselSnapshot, options?: EditorDataServiceLoadOptions): Promise<void> {
    // If is on field mode, fill default values
    if (this.isOnFieldMode) {
      data.startDate = moment();
      data.registrationStartDate = moment();
    }
  }

  updateViewState(data: VesselSnapshot, opts?: { onlySelf?: boolean; emitEvent?: boolean }) {
    super.updateViewState(data, opts);

    this.form.disable();
    this.editing = false;
    this.previousData = undefined;
  }

  protected canUserWrite(data: VesselSnapshot): boolean {
    return !this.editing && this.accountService.canUserWriteDataForDepartment(data.recorderDepartment);
  }

  protected setValue(data: VesselSnapshot) {
    // Set data to form
    this.vesselForm.value = data;
  }

  protected getFirstInvalidTabIndex(): number {
    return this.vesselForm.invalid ? 0 : 0; // no other tab for now
  }

  protected async computeTitle(data: VesselSnapshot): Promise<string> {

      if (this.isNewData) {
        return await this.translate.get('VESSEL.NEW.TITLE').toPromise();
      }

      return await this.translate.get('VESSEL.EDIT.TITLE', data).toPromise();
  }

  async cancel(): Promise<void> {
    await this.reload();
  }

  async doReload(): Promise<void> {
    this.loading = true;
    await this.load(this.data && this.data.id);
  }

  editFeatures() {

    this.editing = true;
    this.previousData = undefined;
    this.form.enable();

    // disable start date
    this.form.controls["startDate"].disable();

    // disable registration controls
    this.disableRegistrationControls();
  }

  newFeatures() {

    this.isNewFeatures = true;

    const json = this.form.value;
    this.previousData = VesselSnapshot.fromObject(json);

    this.form.setValue({ ...json , ...{id: null, startDate: null, endDate: null} } );

    this.form.get("startDate").setValidators(Validators.compose([
      Validators.required,
      SharedValidators.dateIsAfter(this.previousData.startDate,
        this.dateAdapter.format(this.previousData.startDate, this.translate.instant('COMMON.DATE_PATTERN')))
    ]));
    this.form.enable();

    this.disableRegistrationControls();
  }

  editRegistration() {

    this.editing = true;
    this.previousData = undefined;
    this.form.enable();

    // disable registration start date
    this.form.controls["registrationStartDate"].disable();

    // disable features controls
    this.disableFeaturesControls();

  }

  newRegistration() {

    this.isNewRegistration = true;

    const json = this.form.value;
    this.previousData = VesselSnapshot.fromObject(json);

    this.form.setValue({ ...json , ...{registrationId: null, registrationCode: null, registrationStartDate: null, registrationEndDate: null} } );

    this.form.get("registrationStartDate").setValidators(Validators.compose([
      Validators.required,
      SharedValidators.dateIsAfter(this.previousData.registrationStartDate,
        this.dateAdapter.format(this.previousData.registrationStartDate, this.translate.instant('COMMON.DATE_PATTERN')))
    ]));
    this.form.enable();

    this.disableFeaturesControls();

  }

  editStatus() {

    this.editing = true;
    this.previousData = undefined;
    this.form.enable();

    // disable features controls
    this.disableFeaturesControls();
    this.disableRegistrationControls();

    this.form.controls["vesselStatusId"].enable();
  }

  private disableRegistrationControls() {
    this.form.controls["registrationStartDate"].disable();
    this.form.controls["registrationCode"].disable();
    this.form.controls["registrationLocation"].disable();
    this.form.controls["vesselStatusId"].disable();
  }

  private disableFeaturesControls() {
    this.form.controls["startDate"].disable();
    this.form.controls["exteriorMarking"].disable();
    this.form.controls["name"].disable();
    this.form.controls["vesselType"].disable();
    this.form.controls["basePortLocation"].disable();
    this.form.controls["lengthOverAll"].disable();
    this.form.controls["administrativePower"].disable();
    this.form.controls["grossTonnageGt"].disable();
    // this.form.controls["grossTonnageGrt"].disable();
    this.form.controls["comments"].disable();
    this.form.controls["vesselStatusId"].disable();
  }

  protected getJsonValueToSave(): Promise<any> {
    this.form.enable();
    return super.getJsonValueToSave();
  }

  async save(event): Promise<boolean> {

    // save previous form first
    if (this.previousData && (this.isNewFeatures || this.isNewRegistration)) {

      // save previous features
      if (this.isNewFeatures) {

        // set end date = new start date - 1
        const newStartDate = fromDateISOString(this.form.controls["startDate"].value);
        newStartDate.subtract(1, "d");
        this.previousData.endDate = newStartDate;

      } else if (this.isNewRegistration) {

        // set registration end date = new registration start date - 1
        const newRegistrationStartDate = fromDateISOString(this.form.controls["registrationStartDate"].value);
        newRegistrationStartDate.subtract(1, "d");
        this.previousData.registrationEndDate = newRegistrationStartDate;

      }

      this.saving = true;
      try {

        // save previous data first
        const saved = await this.vesselService.save(this.previousData);

        // copy update date to new data
        this.form.controls['updateDate'].setValue(toDateISOString(saved.updateDate));

      } catch (err) {
        console.error(err);
        this.error = err && err.message || err;
        return false;
      } finally {
        this.saving = false;
      }
    }

    // then save new data
    return super.save(event);
  }
}
