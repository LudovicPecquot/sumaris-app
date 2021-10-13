import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit} from '@angular/core';
import {ModalController} from '@ionic/angular';
import {TranslateService} from '@ngx-translate/core';
import {FormBuilder, Validators} from '@angular/forms';
import {AppForm, AppFormUtils, isEmptyArray, LocalSettingsService, PlatformService, SharedValidators, StatusIds} from '@sumaris-net/ngx-components';
import {DateAdapter} from '@angular/material/core';
import * as momentImported from 'moment';
import {Moment} from 'moment';
import {ReferentialRefService} from '../../../referential/services/referential-ref.service';
import {ProgramRefQueries, ProgramRefService} from '../../../referential/services/program-ref.service';
import {Program} from '../../../referential/services/model/program.model';
import {TripOfflineFilter} from '@app/trip/services/filter/trip.filter';
import {VesselSnapshotService} from '@app/referential/services/vessel-snapshot.service';
import {mergeMap} from 'rxjs/internal/operators';
import {map} from 'rxjs/operators';
import DurationConstructor = moment.unitOfTime.DurationConstructor;

const moment = momentImported;

@Component({
  selector: 'app-trip-offline-modal',
  styleUrls: [
    './trip-offline.modal.scss'
  ],
  templateUrl: './trip-offline.modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripOfflineModal extends AppForm<TripOfflineFilter> implements OnInit{

  loading = true;
  mobile: boolean;

  periodDurations: { value: number; unit: DurationConstructor }[] = [
    {value: 1, unit: 'week'},
    {value: 15, unit: 'day'},
    {value: 1, unit: 'month'},
    {value: 3, unit: 'month'},
    {value: 6, unit: 'month'}
  ];
  periodDurationLabels: { key: string; label: string; startDate: Moment; }[];

  @Input() title = 'TRIP.OFFLINE_MODAL.TITLE';

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
    protected vesselSnapshotService: VesselSnapshotService,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef
  ) {
    super(dateAdapter,
      formBuilder.group({
        program: [null, Validators.compose([Validators.required, SharedValidators.entity])],
        vesselSnapshot: [null, Validators.required],
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

    const displayAttributes = this.settings.getFieldDisplayAttributes('vesselSnapshot', ['exteriorMarking', 'name']);
    const vesselSnapshot$ = this.form.get('program').valueChanges
      .pipe(
        mergeMap(program => program && program.label && this.programRefService.loadByLabel(program.label) || Promise.resolve()),
        mergeMap(program => {
          if (!program) return Promise.resolve();
          return this.vesselSnapshotService.loadAll(0, 100, displayAttributes[0],  "asc", {
              program
          });
        }),
        map(res => {
          if (!res || isEmptyArray(res.data)) {
            this.form.get('vesselSnapshot').disable();
            return [];
          }
          else {
            this.form.get('vesselSnapshot').enable();
            return res.data;
          }
        })
      );

    // vesselSnapshot
    this.registerAutocompleteField('vesselSnapshot', {
      items: vesselSnapshot$,
      attributes: displayAttributes,
      mobile: this.mobile
    });

    this.registerAutocompleteField('vesselSnapshot', {
      service: this.vesselSnapshotService,
      attributes: this.settings.getFieldDisplayAttributes('vesselSnapshot', ['exteriorMarking', 'name']),
      filter: {
        statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY],
        program: this.form.get('program').value
      },
      mobile: this.mobile
    });
  }

  async setValue(value: TripOfflineFilter | any) {
    if (!value) return; // skip

    const json = {
      program: null,
      vesselSnapshot: null,
      periodDuration: null
    };
    // Program
    if (value.programLabel) {
      json.program = await this.programRefService.loadByLabel(value.programLabel, {query: ProgramRefQueries.loadLight});
    }

    if (value.vesselId){
      json.vesselSnapshot = await this.vesselSnapshotService.load(value.vesselId);
    }

    // Duration period
    if (value.periodDuration && value.periodDurationUnit) {
      json.periodDuration = `${value.periodDuration} ${value.periodDurationUnit}`;
    }

    this.form.patchValue(json);

    this.enable();
    this.markAsLoaded();
  }

  getValue(): TripOfflineFilter {
    const json = this.form.value;

    // DEBUG
    console.debug('[trip-offline] Modal form.value:', json);

    const value = new TripOfflineFilter();

    // Set program
    value.programLabel = json.program && json.program.label || json.program;

    value.vesselId = json.vesselSnapshot && json.vesselSnapshot.id || json.vesselSnapshot;

    // Set start date
    if (json.periodDuration) {
      const periodDuration = this.periodDurationLabels.find(item => item.key === json.periodDuration);
      value.startDate = periodDuration && periodDuration.startDate;

      // Keep value of periodDuration (to be able to save it in local settings)
      const parts = json.periodDuration.split(' ');
      value.periodDuration = +parts[0];
      value.periodDurationUnit = parts[1] as DurationConstructor;
    }

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
