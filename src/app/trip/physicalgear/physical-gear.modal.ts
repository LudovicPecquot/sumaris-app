import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, Output, ViewChild} from "@angular/core";
import {AlertController, IonContent, ModalController} from "@ionic/angular";
import {AcquisitionLevelCodes} from "../../referential/services/model/model.enum";
import {PhysicalGearForm} from "./physical-gear.form";
import {BehaviorSubject} from "rxjs";
import {TranslateService} from "@ngx-translate/core";
import {PlatformService}  from "@sumaris-net/ngx-components";
import {Alerts} from "@sumaris-net/ngx-components";
import {PhysicalGear} from "../services/model/trip.model";
import {createPromiseEventEmitter, emitPromiseEvent} from "@sumaris-net/ngx-components";
import {isNil} from "@sumaris-net/ngx-components";
import {BatchGroup} from '@app/trip/services/model/batch-group.model';

@Component({
  selector: 'app-physical-gear-modal',
  templateUrl: './physical-gear.modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhysicalGearModal implements OnInit, AfterViewInit {

  loading = false;
  originalData: PhysicalGear;
  $title = new BehaviorSubject<string>(undefined);

  @Input() acquisitionLevel: string;

  @Input() program: string;

  @Input() disabled = false;

  @Input() isNew = false;

  @Input() set value(value: PhysicalGear) {
    this.originalData = value;
  }

  @Input() mobile: boolean;

  @Input() canEditRankOrder = false;

  @Input() onInit: (instance: PhysicalGearModal) => void;

  @Input() onDelete: (event: UIEvent, data: PhysicalGear) => Promise<boolean>;

  @Output() onCopyPreviousGearClick = createPromiseEventEmitter<PhysicalGear>();

  @ViewChild('form', {static: true}) form: PhysicalGearForm;

  @ViewChild(IonContent, {static: true}) content: IonContent;

  get enabled(): boolean {
    return !this.disabled;
  }

  constructor(
    protected alertCtrl: AlertController,
    protected viewCtrl: ModalController,
    protected translate: TranslateService,
    protected platform: PlatformService,
    protected cd: ChangeDetectorRef
  ) {

    // Default values
    this.acquisitionLevel = AcquisitionLevelCodes.PHYSICAL_GEAR;
    this.mobile = platform.mobile;
  }

  ngOnInit() {
    if (this.disabled) {
      this.form.disable();
    }

    this.form.value = this.originalData || new PhysicalGear();

    // Compute the title
    this.computeTitle();

    if (this.onInit) {
      this.onInit(this);
    }
  }

  ngAfterViewInit(): void {
    // Focus on the first field, is not in mobile
     if (this.isNew && !this.mobile && this.enabled) {
       setTimeout(() => this.form.focusFirstInput(), 400);
     }
  }

  async copyPreviousGear(event?: UIEvent) {

    if (this.onCopyPreviousGearClick.observers.length === 0) return; // Skip

    // Emit event, then wait for a result
    try {
      const selectedData = await emitPromiseEvent(this.onCopyPreviousGearClick, 'copyPreviousGear');

      // No result (user cancelled): skip
      if (!selectedData) return;

      // Create a copy
      const data = PhysicalGear.fromObject({
        gear: selectedData.gear,
        rankOrder: selectedData.rankOrder,
        measurementValues: selectedData.measurementValues,
        measurements: selectedData.measurements,
      });

      if (!this.canEditRankOrder) {
        // Apply computed rankOrder
        data.rankOrder = this.originalData.rankOrder;
      }

      // Apply to form
      console.debug('[physical-gear-modal] Paste selected gear:', data);
      this.form.unload();
      this.form.reset(data);

      await this.form.ready();
      this.form.markAsDirty();
    }
    catch (err) {
      if (err === 'CANCELLED') return; // Skip
      console.error(err);
      this.form.error = err && err.message || err;
      this.scrollToTop();
    }
  }

  // async close(event?: UIEvent, opts?: {allowInvalid?: boolean; }): Promise<PhysicalGear | undefined> {
  //
  //   const physicalGear = await this.save();
  //   if (!physicalGear) return;
  //   await this.vieCtrl.dismiss(physicalGear);
  //
  //   return physicalGear;
  // }


  async cancel(event: UIEvent) {
    await this.saveIfDirtyAndConfirm(event);

    // Continue (if event not cancelled)
    if (!event.defaultPrevented) {
      await this.viewCtrl.dismiss();
    }
  }

  async save(event?: UIEvent): Promise<boolean> {
    if (!this.form.valid || this.loading) return false;
    this.loading = true;

    // Nothing to save: just leave
    if (!this.form.dirty) {
      await this.viewCtrl.dismiss();
      return false;
    }

    try {
      this.form.error = null;

      const gear = this.form.value;

      return await this.viewCtrl.dismiss(gear);
    }
    catch (err) {
      this.loading = false;
      this.form.error = err && err.message || err;
      this.scrollToTop();
      return false;
    }
  }

  async delete(event?: UIEvent) {
    if (!this.onDelete) return; // Skip
    const result = await this.onDelete(event, this.originalData);
    if (isNil(result) || (event && event.defaultPrevented)) return; // User cancelled

    if (result) {
      await this.viewCtrl.dismiss(this.originalData);
    }
  }

  /* -- protected functions -- */

  protected async saveIfDirtyAndConfirm(event: UIEvent): Promise<void> {
    if (!this.form.dirty) return; // skip, if nothing to save

    const confirmation = await Alerts.askSaveBeforeLeave(this.alertCtrl, this.translate, event);

    // User cancelled
    if (isNil(confirmation) || event && event.defaultPrevented) {
      return;
    }

    if (confirmation === false) {
      return;
    }

    // If user confirm: save
    const saved = await this.save(event);

    // Error while saving: avoid to close
    if (!saved) event.preventDefault();
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

  protected async computeTitle() {
    if (this.isNew || !this.originalData) {
      this.$title.next(await this.translate.get('TRIP.PHYSICAL_GEAR.NEW.TITLE').toPromise());
    }
    else {
      this.$title.next(await this.translate.get('TRIP.PHYSICAL_GEAR.EDIT.TITLE', this.originalData).toPromise());
    }
  }

  protected async scrollToTop(duration?: number) {
    if (this.content) {
      return this.content.scrollToTop(duration);
    }
  }
}
