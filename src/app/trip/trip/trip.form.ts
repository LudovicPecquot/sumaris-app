import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit} from '@angular/core';
import {TripValidatorService} from "../services/trip.validator";
import {LocationLevelIds, StatusIds, Trip, VesselSnapshot,} from "../services/trip.model";
import {ModalController} from "@ionic/angular";
import {Moment} from 'moment/moment';
import {DateAdapter} from "@angular/material";
import {AppForm} from '../../core/core.module';
import {ReferentialRefService, referentialToString, VesselModal} from "../../referential/referential.module";
import {UsageMode} from "../../core/services/model";
import {LocalSettingsService} from "../../core/services/local-settings.service";
import {VesselSnapshotService} from "../../referential/services/vessel-snapshot.service";

@Component({
  selector: 'form-trip',
  templateUrl: './trip.form.html',
  styleUrls: ['./trip.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripForm extends AppForm<Trip> implements OnInit {

  @Input() showComment = true;
  @Input() showError = true;
  @Input() usageMode: UsageMode;

  get value(): any {
    const json = this.form.value;

    // Add program, because if control disabled the value is missing
    json.program = this.form.get('program').value;

    return json;
  }

  set value(json: any) {
    super.setValue(json);
  }

  get isOnFieldMode(): boolean {
    return this.usageMode ? this.usageMode === 'FIELD' : this.settings.isUsageMode('FIELD');
  }

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected validatorService: TripValidatorService,
    protected vesselSnapshotService: VesselSnapshotService,
    protected referentialRefService: ReferentialRefService,
    protected modalCtrl: ModalController,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef
  ) {

    super(dateAdapter, validatorService.getFormGroup(), settings);
  }

  ngOnInit() {
    super.ngOnInit();

    this.usageMode = this.usageMode || this.settings.usageMode;

    // Combo: programs
    this.registerAutocompleteField('program', {
      service: this.referentialRefService,
      filter: {
        entityName: 'Program'
      }
    });

    // Combo: vessels
    const vesselField = this.registerAutocompleteField('vesselSnapshot', {
      service: this.vesselSnapshotService,
      attributes: this.settings.getFieldDisplayAttributes('vesselSnapshot', ['exteriorMarking', 'name']),
      filter: {
        statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY]
      }
    });
    // Add base port location
    vesselField.attributes = vesselField.attributes.concat(this.settings.getFieldDisplayAttributes('location').map(key => 'basePortLocation.' + key));

    // Combo location
    this.registerAutocompleteField('location', {
      service: this.referentialRefService,
      filter: {
        entityName: 'Location',
        levelId: LocationLevelIds.PORT
      }
    });
  }

  async addVesselModal(): Promise<any> {
    const modal = await this.modalCtrl.create({ component: VesselModal });
    modal.onDidDismiss().then(res => {
      // if new vessel added, use it
      if (res && res.data instanceof VesselSnapshot) {
        console.debug("[trip-form] New vessel added : updating form...", res.data);
        this.form.controls['vesselSnapshot'].setValue(res.data);
        this.markForCheck();
      }
      else {
        console.debug("[trip-form] No vessel added (user cancelled)");
      }
    });
    return modal.present();
  }

  referentialToString = referentialToString;

  /* -- protected methods-- */


  protected markForCheck() {
    this.cd.markForCheck();
  }
}
