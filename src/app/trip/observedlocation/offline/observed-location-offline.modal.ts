import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input} from "@angular/core";
import {ModalController} from "@ionic/angular";
import {TranslateService} from "@ngx-translate/core";
import {FormBuilder, Validators} from "@angular/forms";
import {AppFormUtils}  from "@sumaris-net/ngx-components";
import {AppForm}  from "@sumaris-net/ngx-components";
import {DateAdapter} from "@angular/material/core";
import * as momentImported from "moment";
import {Moment} from "moment";
import {LocalSettingsService}  from "@sumaris-net/ngx-components";
import {ReferentialRefService} from "../../../referential/services/referential-ref.service";
import {PlatformService}  from "@sumaris-net/ngx-components";
import {SharedValidators} from "@sumaris-net/ngx-components";
import {ProgramRefQueries, ProgramRefService} from "../../../referential/services/program-ref.service";
import {referentialsToString, referentialToString}  from "@sumaris-net/ngx-components";
import {isEmptyArray, isNotEmptyArray} from "@sumaris-net/ngx-components";
import {map} from "rxjs/operators";
import {mergeMap} from "rxjs/internal/operators";
import {ProgramProperties} from "../../../referential/services/config/program.config";
import {Program} from "../../../referential/services/model/program.model";
import DurationConstructor = moment.unitOfTime.DurationConstructor;
import {ObservedLocationOfflineFilter} from "../../services/filter/observed-location.filter";

const moment = momentImported;

@Component({
  selector: 'app-observed-location-offline-modal',
  styleUrls: [
    './observed-location-offline.modal.scss'
  ],
  templateUrl: './observed-location-offline.modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObservedLocationOfflineModal extends AppForm<ObservedLocationOfflineFilter> {

  loading = true;
  mobile: boolean;

  periodDurations: { value: number; unit: DurationConstructor; }[] = [
    { value: 1, unit: 'week' },
    { value: 15, unit: 'day' },
    { value: 1,  unit: 'month' },
    { value: 3,  unit: 'month' },
    { value: 6,  unit: 'month' }
  ];
  periodDurationLabels: { key: string; label: string; startDate: Moment; }[];

  @Input() title = 'OBSERVED_LOCATION.OFFLINE_MODAL.TITLE';

  get value(): any {
    return this.getValue();
  }

  set value(data: any) {
    this.setValue(data);
  }

  get valid(): boolean {
    return this.form.valid;
  }

  markAsLoaded() {
    if (this.loading) {
      this.loading = false;
      this.markForCheck();
    }
  }

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected viewCtrl: ModalController,
    protected translate: TranslateService,
    protected formBuilder: FormBuilder,
    protected platform: PlatformService,
    protected programRefService: ProgramRefService,
    protected referentialRefService: ReferentialRefService,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef
  ) {
    super(dateAdapter,
      formBuilder.group({
        program: [null, Validators.compose([Validators.required, SharedValidators.entity])],
        enableHistory: [true, Validators.required],
        location: [null, Validators.required],
        periodDuration: ['15day', Validators.required],
      }),
      settings);
    this._enable = false; // Disable by default
    this.mobile = platform.mobile;

    // Prepare start date items
    const datePattern = translate.instant('COMMON.DATE_PATTERN');
    this.periodDurationLabels = this.periodDurations.map(v => {
      const date = moment().utc(false)
        .add(-1 * v.value, v.unit); // Substract the period, from now
      return {
        key: `${v.value} ${v.unit}`,
        label: `${date.fromNow(true/*no suffix*/)} (${date.format(datePattern)})`,
        startDate: date.startOf('day') // Reset time
      };
    });
  }

  ngOnInit() {
    super.ngOnInit();

    // Program
    this.registerAutocompleteField('program', {
      service: this.referentialRefService,
      filter: {
        entityName: 'Program'
      },
      mobile: this.mobile
    });

    const displayAttributes = this.settings.getFieldDisplayAttributes('location');
    const locations$ = this.form.get('program').valueChanges
      .pipe(
        mergeMap(program => program && program.label && this.programRefService.loadByLabel(program.label) || Promise.resolve()),
        mergeMap(program => {
          if (!program) return Promise.resolve();
          const locationLevelIds = program.getPropertyAsNumbers(ProgramProperties.OBSERVED_LOCATION_LOCATION_LEVEL_IDS);
          return this.referentialRefService.loadAll(0, 100, displayAttributes[0],  "asc", {
            entityName: 'Location',
            levelIds: locationLevelIds
          });
        }),
        map(res => {
          if (!res || isEmptyArray(res.data)) {
            this.form.get('location').disable();
            return [];
          }
          else {
            this.form.get('location').enable();
            return res.data;
          }
        })
      );

    // Location
    this.registerAutocompleteField('location', {
      items: locations$,
      displayWith: (arg) => {
        if (arg instanceof Array) {
          return referentialsToString(arg, displayAttributes);
        }
        return referentialToString(arg, displayAttributes);
      },
      mobile: this.mobile
    });

    // Enable/disable sub controls, from the 'enable history' checkbox
    const subControls = [
      this.form.get('program'),
      this.form.get('location'),
      this.form.get('periodDuration')
    ];
    this.form.get('enableHistory').valueChanges.subscribe(enable => {
      if (enable) {
        subControls.forEach(control => {
          control.enable();
          control.setValidators(Validators.required);
        });
      }
      else {
        subControls.forEach(control => {
          control.disable();
          control.setValidators(null);
        });
      }
    });

  }

  async setValue(value: ObservedLocationOfflineFilter | any) {
    if (!value) return; // skip

    const json = {
      program: null,
      location: null,
      periodDuration: null
    };
    // Program
    if (value.programLabel) {
      json.program = await this.programRefService.loadByLabel(value.programLabel, {query: ProgramRefQueries.loadLight});
    }

    // Location
    if (isNotEmptyArray(value.locationIds)) {
      json.location = await Promise.all(value.locationIds
        .map(id => this.referentialRefService.loadById(id, 'Location')));
    }

    // Duration period
    if (value.periodDuration && value.periodDurationUnit) {
      json.periodDuration = `${value.periodDuration} ${value.periodDurationUnit}`;
    }

    this.form.patchValue(json);

    this.enable();
    this.markAsLoaded();
  }

  getValue(): ObservedLocationOfflineFilter {
    const json = this.form.value;

    // DEBUG
    console.debug("[observed-location-offline] Modal form.value:", json);

    const value = new ObservedLocationOfflineFilter();

    // Set program
    value.programLabel = json.program && json.program.label || json.program;

    // Location
    if (json.location) {
      if (json.location instanceof Array) {
        value.locationIds = json.location.map(entity => entity.id);
      }
      else {
        value.locationIds = [json.location.id];
      }
    }

    // Set start date
    if (json.enableHistory && json.periodDuration) {
      const periodDuration = this.periodDurationLabels.find(item => item.key === json.periodDuration);
      value.startDate = periodDuration && periodDuration.startDate;

      // Keep value of periodDuration (to be able to save it in local settings)
      const parts = json.periodDuration.split(' ');
      value.periodDuration = +parts[0];
      value.periodDurationUnit = parts[1] as DurationConstructor;
    }

    // DEBUG
    //console.debug("[observed-location-offline] Modal result value:", value);

    return value;
  }

  cancel() {
    this.viewCtrl.dismiss(null, 'CANCEL');
  }

  async validate(event?: UIEvent) {
    this.form.markAllAsTouched();

    if (!this.form.valid) {
      await AppFormUtils.waitWhilePending(this.form);
      if (this.form.invalid) {
        AppFormUtils.logFormErrors(this.form, '[offline-import-config] ');
        return; // stop
      }
    }

    return this.viewCtrl.dismiss(this.getValue(), 'OK');
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
