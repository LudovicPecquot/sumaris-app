import {Component, Injector, Input, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {BehaviorSubject, Observable, of, Subject} from 'rxjs';
import {debounceTime, filter, map, tap} from 'rxjs/operators';
import {TableElement, ValidatorService} from '@e-is/ngx-material-table';
import {ReferentialValidatorService} from '../services/validator/referential.validator';
import {ReferentialService} from '../services/referential.service';
import {
  AccountService,
  AppTable, changeCaseToUnderscore,
  DefaultStatusList,
  EntitiesTableDataSource, EntityUtils,
  firstNotNilPromise,
  isNil,
  isNotEmptyArray,
  isNotNil,
  isNotNilOrBlank,
  LocalSettingsService,
  Referential, ReferentialRef,
  RESERVED_END_COLUMNS,
  RESERVED_START_COLUMNS,
  slideUpDownAnimation,
  sort
} from '@sumaris-net/ngx-components';
import {ModalController, Platform} from '@ionic/angular';
import {ActivatedRoute, Router} from '@angular/router';
import {Location} from '@angular/common';
import {AbstractControl, FormBuilder, FormGroup} from '@angular/forms';
import {TranslateService} from '@ngx-translate/core';
import {environment} from '../../../environments/environment';
import {ReferentialFilter} from '../services/filter/referential.filter';
import {MatExpansionPanel} from '@angular/material/expansion';
import {AppRootTableSettingsEnum} from '@app/data/table/root-table.class';



@Component({
  selector: 'app-referential-page',
  templateUrl: 'referentials.page.html',
  styleUrls: ['referentials.page.scss'],
  providers: [
    {provide: ValidatorService, useExisting: ReferentialValidatorService}
  ],
  animations: [slideUpDownAnimation]
})
export class ReferentialsPage extends AppTable<Referential, ReferentialFilter> implements OnInit, OnDestroy {

  static DEFAULT_ENTITY_NAME = "Pmfm";
  static DEFAULT_I18N_LEVEL_NAME = 'REFERENTIAL.LEVEL';

  private _entityName: string;

  canEdit = false;
  filterForm: FormGroup;
  $selectedEntity = new BehaviorSubject<{ id: string; label: string; level?: string; levelLabel?: string }>(undefined);
  $entities = new BehaviorSubject<{ id: string; label: string; level?: string; levelLabel?: string }[]>(undefined);
  $levels = new BehaviorSubject<ReferentialRef[]>(undefined);
  i18nLevelName: string;
  statusList = DefaultStatusList;
  statusById: any;
  filterCriteriaCount = 0;

  canOpenDetail = false;
  detailsPath = {
    'Program': '/referential/programs/:id',
    'Software': '/referential/software/:id?label=:label',
    'Pmfm': '/referential/pmfm/:id?label=:label',
    'Parameter': '/referential/parameter/:id?label=:label',
    'ExtractionProduct': '/extraction/product/:id?label=:label',
    'TaxonName': '/referential/taxonName/:id?label=:label'
  };

  @Input() set showLevelColumn(value: boolean) {
    this.setShowColumn('level', value);
  }

  get showLevelColumn(): boolean {
    return this.getShowColumn('level');
  }

  @Input() canSelectEntity = true;
  @Input() title = 'REFERENTIAL.LIST.TITLE';

  @Input() set entityName(value: string) {
    if (this._entityName !== value) {
      this._entityName = value;
      if (!this.loadingSubject.getValue()) {
        this.applyEntityName(value, { skipLocationChange: true });
      }
    }
  }

  get entityName(): string {
    return this._entityName;
  }

  @ViewChild(MatExpansionPanel, {static: true}) filterExpansionPanel: MatExpansionPanel;

  constructor(
    protected injector: Injector,
    protected route: ActivatedRoute,
    protected router: Router,
    protected platform: Platform,
    protected location: Location,
    protected modalCtrl: ModalController,
    protected accountService: AccountService,
    protected settings: LocalSettingsService,
    protected validatorService: ReferentialValidatorService,
    protected referentialService: ReferentialService,
    protected formBuilder: FormBuilder,
    protected translate: TranslateService
  ) {
    super(route, router, platform, location, modalCtrl, settings,
      // columns
      RESERVED_START_COLUMNS
        .concat([
          'label',
          'name',
          'level',
          'status',
          'updateDate',
          'comments'])
        .concat(RESERVED_END_COLUMNS),
      new EntitiesTableDataSource(Referential, referentialService, validatorService, {
        prependNewElements: false,
        suppressErrors: environment.production,
        dataServiceOptions: {
          saveOnlyDirtyRows: true
        }
      }),
      null,
      injector
    );

    this.i18nColumnPrefix = 'REFERENTIAL.';
    this.allowRowDetail = false;
    this.confirmBeforeDelete = true;

    // Allow inline edition only if admin
    this.inlineEdition = accountService.isAdmin();
    this.canEdit = accountService.isAdmin();

    this.setShowColumn('updateDate', !this.mobile); // Hide by default, if mobile

    this.filterForm = formBuilder.group({
      entityName: [null],
      searchText: [null],
      level: [null],
      statusId: [null]
    });

    // Fill statusById
    this.statusById = {};
    this.statusList.forEach((status) => this.statusById[status.id] = status);
    this.autoLoad = false;

    // FOR DEV ONLY
    this.debug = true;
  }

  ngOnInit() {
    super.ngOnInit();

    // Load entities
    this.registerSubscription(
      this.referentialService.loadTypes()
        .pipe(
          map(types => types.map(type => ({
              id: type.id,
              label: this.getI18nEntityName(type.id),
              level: type.level,
              levelLabel: this.getI18nEntityName(type.level)
            }))),
          map(types => sort(types, 'label'))
        )
        .subscribe(types => this.$entities.next(types))
    );

    // Update filter when changes
    this.registerSubscription(
      this.filterForm.valueChanges
        .pipe(
          debounceTime(250),
          filter(() => this.filterForm.valid),
          tap(value => {
            const filter = this.asFilter(value);
            this.filterCriteriaCount = filter.countNotEmptyCriteria();
            this.markForCheck();
            // Applying the filter
            this.setFilter(filter, {emitEvent: false});
          }),
          // Save filter in settings (after a debounce time)
          debounceTime(500),
          tap(json => this.settings.savePageSetting(this.settingsId, json, AppRootTableSettingsEnum.FILTER_KEY))
        )
        .subscribe()
      );

    this.registerSubscription(
      this.onRefresh.subscribe(() => {
        this.filterForm.markAsUntouched();
        this.filterForm.markAsPristine();
      }));

    // Level autocomplete
    this.registerAutocompleteField('level', {
      items: this.$levels
    });

    if (this.canSelectEntity) {
      this.restoreFilterOrLoad();
    }
    else if (this._entityName) {
      this.applyEntityName(this._entityName);
    }
  }

  protected async restoreFilterOrLoad() {
    this.markAsLoading();

    const json = this.settings.getPageSettings(this.settingsId, AppRootTableSettingsEnum.FILTER_KEY);
    console.debug("[referentials] Restoring filter from settings...", json);

    if (json && json.entityName) {
      const filter = this.asFilter(json);
      this.filterForm.patchValue(json, {emitEvent: false});
      this.filterCriteriaCount = filter.countNotEmptyCriteria();
      this.markForCheck();
      return this.applyEntityName(filter.entityName);
    }

    // Check route parameters
    const {entity, q, level, status} = this.route.snapshot.queryParams;
    if (entity) {
      let levelRef: ReferentialRef;
      if (level) {
        const levels = await firstNotNilPromise(this.$levels);
        levelRef = levels.find(l => l.id === level);
      }

      this.filterForm.patchValue({
        entityName: entity,
        searchText: q || null,
        level: levelRef,
        statusId: isNotNil(status) ? +status : null
      }, {emitEvent: false});
      return this.applyEntityName(entity, {skipLocationChange: true});
    }

    // Load default entity
    await this.applyEntityName(ReferentialsPage.DEFAULT_ENTITY_NAME);
  }

  async applyEntityName(entityName: string, opts?: { emitEvent?: boolean; skipLocationChange?: boolean }) {
    opts = {emitEvent: true, skipLocationChange: false, ...opts};
    this._entityName = entityName;

    this.canOpenDetail = false;

    // Wait end of entities loading
    if (this.canSelectEntity) {
      const entities = await firstNotNilPromise(this.$entities);

      const entity = entities.find(e => e.id === entityName);
      if (!entity) {
        throw new Error(`[referential] Entity {${entityName}} not found !`);
      }

      this.$selectedEntity.next(entity);
    }

    // Load levels
    await this.loadLevels(entityName);

    this.canOpenDetail = !!this.detailsPath[entityName];
    this.inlineEdition = !this.canOpenDetail;

    // Applying the filter (will reload if emitEvent = true)
    const filter = ReferentialFilter.fromObject({
      ...this.filterForm.value,
      level: null,
      entityName
    });
    this.filterForm.patchValue({entityName, level: null}, {emitEvent: false});
    this.setFilter(filter, {emitEvent: opts.emitEvent});

    // Update route location
    if (opts.skipLocationChange !== true && this.canSelectEntity) {
      this.router.navigate(['.'], {
        relativeTo: this.route,
        skipLocationChange: false,
        queryParams: {
          entity: entityName
        }
      });
    }
  }

  async onEntityNameChange(entityName: string): Promise<any> {
    // No change: skip
    if (this._entityName === entityName) return;
    this.applyEntityName(entityName);
  }

  addRow(event?: any): boolean {
    // Create new row
    const result = super.addRow(event);
    if (!result) return result;

    const row = this.dataSource.getRow(-1);
    row.validator.controls['entityName'].setValue(this._entityName);
    return true;
  }

  async loadLevels(entityName: string): Promise<ReferentialRef[]> {
    const res = await this.referentialService.loadLevels(entityName, {
      fetchPolicy: 'network-only'
    });

    const levels = (res || []).sort(EntityUtils.sortComparator('label', 'asc'));
    this.$levels.next(levels);

    if (isNotEmptyArray(levels)) {
      const typeName = levels[0].entityName;
      const i18nLevelName = "REFERENTIAL.ENTITY." + changeCaseToUnderscore(typeName).toUpperCase();
      const levelName = this.translate.instant(i18nLevelName);
      this.i18nLevelName = (levelName !== i18nLevelName) ? levelName : ReferentialsPage.DEFAULT_I18N_LEVEL_NAME;
    }
    else {
      this.i18nLevelName = ReferentialsPage.DEFAULT_I18N_LEVEL_NAME;
    }

    if (this.canSelectEntity) {
      this.showLevelColumn = isNotEmptyArray(res);
    }

    return res;
  }

  getI18nEntityName(entityName: string, self?: ReferentialsPage): string {
    self = self || this;

    if (isNil(entityName)) return undefined;

    const tableName = entityName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
    const key = `REFERENTIAL.ENTITY.${tableName}`;
    let message = self.translate.instant(key);

    if (message !== key) return message;
    // No I18n translation: continue

    // Use tableName, but replace underscore with space
    message = tableName.replace(/[_-]+/g, " ").toUpperCase() || '';
    // First letter as upper case
    if (message.length > 1) {
      return message.substring(0, 1) + message.substring(1).toLowerCase();
    }
    return message;
  }

  async openRow(id: number, row: TableElement<Referential>): Promise<boolean> {
    const path = this.detailsPath[this._entityName];

    if (isNotNilOrBlank(path)) {
      await this.router.navigateByUrl(
        path
          // Replace the id in the path
          .replace(':id', isNotNil(row.currentData.id) ? row.currentData.id.toString() : '')
          // Replace the label in the path
          .replace(':label', row.currentData.label || '')
      );
      return true;
    }

    return super.openRow(id, row);
  }

  clearControlValue(event: UIEvent, formControl: AbstractControl): boolean {
    if (event) event.stopPropagation(); // Avoid to enter input the field
    formControl.setValue(null);
    return false;
  }

  applyFilterAndClosePanel(event?: UIEvent) {
    this.onRefresh.emit(event);
    this.filterExpansionPanel.close();
  }

  resetFilter(event?: UIEvent) {
    this.filterForm.reset({entityName: this._entityName}, {emitEvent: true});
    this.setFilter(ReferentialFilter.fromObject({entityName: this._entityName}), {emitEvent: true});
    this.filterExpansionPanel.close();
  }

  protected async openNewRowDetail(): Promise<boolean> {
    const path = this.detailsPath[this._entityName];

    if (path) {
      await this.router.navigateByUrl(path
        .replace(':id', "new")
        .replace(':label', ""));
      return true;
    }

    return super.openNewRowDetail();
  }

  protected asFilter(source?: any): ReferentialFilter {
    source = source || this.filterForm.value;

    if (this._dataSource && this._dataSource.dataService) {
      return this._dataSource.dataService.asFilter(source);
    }

    return ReferentialFilter.fromObject(source);
  }
}

