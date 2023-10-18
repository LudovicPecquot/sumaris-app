import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {ObservedLocationsPage} from '../table/observed-locations.page';
import {ModalController} from '@ionic/angular';
import {AcquisitionLevelCodes, AcquisitionLevelType} from '@app/referential/services/model/model.enum';
import {Observable, Subscription} from 'rxjs';
import { AppFormUtils, isNotNil, LocalSettingsService, toBoolean } from '@sumaris-net/ngx-components';
import {TableElement} from '@e-is/ngx-material-table';
import {ObservedLocation} from '@app/trip/observedlocation/observed-location.model';
import {ObservedLocationFilter} from '@app/trip/observedlocation/observed-location.filter';
import {ObservedLocationForm} from '@app/trip/observedlocation/form/observed-location.form';
import {MatTab, MatTabGroup} from '@angular/material/tabs';
import {ObservedLocationService} from '@app/trip/observedlocation/observed-location.service';

export interface ISelectObservedLocationsModalOptions {
  programLabel: string;
  showFilterProgram: boolean;
  acquisitionLevel: AcquisitionLevelType;
  filter: ObservedLocationFilter;
  allowMultipleSelection: boolean;
  allowNewObservedLocation: boolean;
  defaultNewObservedLocation: ObservedLocation;
  selectedId: number;
  mobile: boolean;
}

@Component({
  selector: 'app-select-observed-locations-modal',
  templateUrl: './select-observed-locations.modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SelectObservedLocationsModal implements OnInit, OnDestroy, ISelectObservedLocationsModalOptions {

  selectedTabIndex = 0;

  protected _subscription = new Subscription();
  protected _logPrefix = '[select-observed-location-modal]';
  protected readonly settings: LocalSettingsService;

  @ViewChild('table', { static: true }) table: ObservedLocationsPage;
  @ViewChild('form', { static: true }) form: ObservedLocationForm;
  @ViewChild('tabGroup', { static: true }) tabGroup: MatTabGroup;
  @ViewChild('tabSearch', { static: true}) tabSearch: MatTab;
  @ViewChild('tabNew', { static: true}) tabNew: MatTab;

  @Input() filter: ObservedLocationFilter|null = null;
  @Input() acquisitionLevel: AcquisitionLevelType;
  @Input() programLabel: string;
  @Input() showFilterProgram: boolean;
  @Input() allowMultipleSelection: boolean;
  @Input() allowNewObservedLocation: boolean;
  @Input() defaultNewObservedLocation: ObservedLocation;
  @Input() selectedId: number;
  @Input() mobile: boolean;

  get loadingSubject(): Observable<boolean> {
    return this.table.loadingSubject;
  }

  constructor(
    protected injector: Injector,
    protected viewCtrl: ModalController,
    protected observedLocationService: ObservedLocationService,
    protected cd: ChangeDetectorRef
  ) {
    this.settings = injector.get(LocalSettingsService);
    // default value
    this.acquisitionLevel = AcquisitionLevelCodes.OBSERVED_LOCATION;
  }

  ngOnInit() {
    // Set defaults
    this.mobile = isNotNil(this.mobile) ? this.mobile : this.settings.mobile;
    this.allowMultipleSelection = toBoolean(this.allowMultipleSelection, false);
    this.filter = this.filter || new ObservedLocationFilter();
    const programLabel = this.programLabel || this.filter.program && this.filter.program.label;
    this.table.showFilterProgram = !programLabel;
    this.table.showProgramColumn = !programLabel;
    // Avoid to register and load filter form values when we are in modal
    this.table.settingsId = null;

    setTimeout(async () => {

      await this.table.setFilter(this.filter);

      // Select the selected id
      if (!this.allowMultipleSelection && isNotNil(this.selectedId)) {
        this._subscription.add(
          this.table.dataSource.rowsSubject.subscribe(rows => {
            this.table.selectRowByData(ObservedLocation.fromObject({id: this.selectedId}));
          })
        )
        // TODO use permanent selection
        //this.table.permanentSelection?.setSelection(ObservedLocation.fromObject({id: this.selectedId}));
      }

      if (this.allowNewObservedLocation) {
        if (this.defaultNewObservedLocation) this.form.setValue(this.defaultNewObservedLocation);
        this.form.enable();
        this.form.markAsReady();
      }

      this.selectedTabIndex = 0;
      this.tabGroup.realignInkBar();
      this.markForCheck();
    }, 200);
  }

  ngOnDestroy() {
    this._subscription.unsubscribe();
  }

  selectRow(row: TableElement<ObservedLocation>) {

    if (this.allowMultipleSelection) {
      this.table.selection.toggle(row);
    }
    else {
      this.table.selection.setSelection(row);
      if (row.currentData?.id !== this.selectedId) {
        this.close();
      }
    }
  }

  async close(event?: any): Promise<boolean> {
    try {
      if (this.tabSearch.isActive) {
        if (this.hasSelection()) {
          const data = (this.table.selection.selected || [])
            .map(row => row.currentData)
            .map(ObservedLocation.fromObject)
            .filter(isNotNil);
          return this.viewCtrl.dismiss(data);
        }
      }
      else if (this.tabNew.isActive) {
        const newData = await this.createObservedLocation();
        if (newData) {
          return this.viewCtrl.dismiss([newData]);
        }
      }

      return false;
    } catch (err) {
      // nothing to do
      return false;
    }
  }

  async cancel() {
    await this.viewCtrl.dismiss();
  }

  async createObservedLocation(): Promise<ObservedLocation> {

    if (!this.form) throw Error(`${this._logPrefix} No Form`);

    console.debug(`${this._logPrefix} Saving new ObservedLocation...`);

    // Avoid multiple call
    if (this.form.disabled) return;
    this.form.error = null;

    await AppFormUtils.waitWhilePending(this.form);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      AppFormUtils.logFormErrors(this.form.form);
      return;
    }

    try {
      const json = this.form.value;
      const data = ObservedLocation.fromObject(json);

      this.form.disable();

      return await this.observedLocationService.save(data);
    }
    catch (err) {
      this.form.error = err && err.message || err;
      this.form.enable();
      return;
    }
  }

  hasSelection(): boolean {
    return this.table.selection.hasValue() && this.table.selection.selected.length === 1;
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
