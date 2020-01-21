import {EventEmitter, OnInit, ViewChild} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {isNil, isNotEmptyArray, isNotNil} from '../../shared/shared.module';
import {
  AggregationType,
  ExtractionColumn,
  ExtractionFilter,
  ExtractionType,
  ExtractionUtils
} from "../services/extraction.model";
import {FormBuilder, FormGroup, Validators} from "@angular/forms";
import {mergeMap} from "rxjs/operators";
import {AppTabPage} from "../../core/core.module";
import {firstNotNilPromise} from "../../shared/observables";
import {ExtractionCriteriaForm} from "./extraction-criteria.form";
import {TranslateService} from "@ngx-translate/core";
import {ActivatedRoute, Router} from "@angular/router";
import {ExtractionService} from "../services/extraction.service";
import {AlertController, ToastController} from "@ionic/angular";
import {capitalizeFirstLetter} from "apollo-client/util/capitalizeFirstLetter";
import {AccountService} from "../../core/services/account.service";
import {LocalSettingsService} from "../../core/services/local-settings.service";
import {isEmptyArray} from "../../shared/functions";


export const DEFAULT_CRITERION_OPERATOR = '=';

export abstract class ExtractionAbstractPage<T extends ExtractionType | AggregationType> extends AppTabPage<any> implements OnInit {

  loading = true;
  type: T;
  form: FormGroup;
  canEdit = false;

  onRefresh = new EventEmitter<any>();
  $types = new BehaviorSubject<T[]>(undefined);
  typesPopoverOptions: any = {
    showBackdrop: true
  };

  @ViewChild('criteriaForm', {static: true}) criteriaForm: ExtractionCriteriaForm;

  get sheetName(): string {
    return this.form.controls.sheetName.value;
  }

  markAsDirty(opts?: {onlySelf?: boolean}) {
    this.criteriaForm.markAsDirty(opts);
  }

  protected constructor(
    protected route: ActivatedRoute,
    protected router: Router,
    protected alertCtrl: AlertController,
    protected toastController: ToastController,
    protected translate: TranslateService,
    protected accountService: AccountService,
    protected service: ExtractionService,
    protected settings: LocalSettingsService,
    protected formBuilder: FormBuilder
  ) {
    super(route, router, alertCtrl, translate);
    // Create the main form
    this.form = formBuilder.group({
      sheetName: [null, Validators.required]
    });
  }

  ngOnInit() {
    super.ngOnInit();

    this.registerForm(this.criteriaForm);

    this.registerSubscription(
      this.translate.get('EXTRACTION.TYPE').subscribe(msg => {
        this.typesPopoverOptions.header = msg;
      }));

    // Load types
    this.registerSubscription(
      this.watchTypes()
        .subscribe(types => this.$types.next(types))
    );

    // Listen route parameters
    this.registerSubscription(
      this.route.queryParams
        .pipe(
          // Convert query params into a valid type
          mergeMap(async ({category, label, sheet}) => {
          const paramType = this.fromObject({category, label});

          // Read type
          const types = await firstNotNilPromise(this.$types);
          let selectedType;

          // If not type found in params, redirect to first one
          if (isNil(paramType.category) || isNil(paramType.label)) {
            selectedType = types && types[0];
          }

          // Select the exact type object in the filter form
          else {
            selectedType = types.find(t => this.isEquals(t, paramType)) || paramType;
          }

          const selectedSheetName = sheet || (selectedType && selectedType.sheetNames && selectedType.sheetNames.length && selectedType.sheetNames[0]);
          if (selectedSheetName && selectedType && !selectedType.sheetNames) {
            selectedType.sheetNames = [selectedSheetName];
          }

          return {selectedType, selectedSheetName};
        }))

        .subscribe(async ({selectedType, selectedSheetName}) => {
          // Set the type
          await this.setType(selectedType, {
            sheetName: selectedSheetName,
            emitEvent: false,
            skipLocationChange: true // Here, we not need an update of the location
          });

          // Execute the first load
          await this.loadData();

        }));
  }

  async setType(type: T, opts?: { emitEvent?: boolean; skipLocationChange?: boolean; sheetName?: string; }): Promise<boolean> {
    opts = opts || {};
    opts.emitEvent = isNotNil(opts.emitEvent) ? opts.emitEvent : true;
    opts.skipLocationChange = isNotNil(opts.skipLocationChange) ? opts.skipLocationChange : false;

    // If empty or same: skip
    if (!type || this.isEquals(type, this.type)) return false;

    // Replace by the full entity
    type = (await firstNotNilPromise(this.$types)).find(t => this.isEquals(t, type));
    if (!type) {
      console.warn("[extraction-form] Type not found:", type);
      return false;
    }

    console.debug(`[extraction-form] Set type to {${type.label}}`, type);
    this.type = type;
    this.criteriaForm.type = type;

    // Check if user can edit (admin or supervisor in the rec department)
    this.canEdit = this.canUserWrite(type);

    // Select the given sheet, or the first one
    const sheetName = opts.sheetName || (type.sheetNames && type.sheetNames[0]);
    this.setSheetName(sheetName || null,
      {
        emitEvent: false,
        skipLocationChange: true
      });

    // Reset criteria form
    this.criteriaForm.reset();

    // Enable form
    this.criteriaForm.enable(opts);

    // Update the window location
    if (opts.skipLocationChange === false) {
      setTimeout(() => this.updateLocationParams(type), 500);
    }

    // Refresh data
    if (opts.emitEvent === true) {
      this.onRefresh.emit();
    }

    return true;
  }


  setSheetName(sheetName: string, opts?: { emitEvent?: boolean; skipLocationChange?: boolean; }) {
    if (sheetName === this.sheetName) return; //skip

    this.form.patchValue({sheetName}, opts);
    this.criteriaForm.sheetName = sheetName;

    if (opts.skipLocationChange !== true) {
      setTimeout(() => this.updateLocationParams(this.type), 500);
    }

    if (!opts || opts.emitEvent !== false) {
      this.onRefresh.emit();
    }
  }

  /**
   * Update the URL
   */
  async updateLocationParams(type: T) {
    console.debug('[extraction-form] Updating query params', type);

    await this.router.navigate(['.'], {
      relativeTo: this.route,
      skipLocationChange: false,
      queryParams: ExtractionUtils.asQueryParams(type, this.getFilterValue())
    });
  }

  async downloadAsFile() {
    if (this.loading || isNil(this.type)) return;

    this.loading = true;

    this.error = null;
    console.debug(`[extraction-form] Downloading ${this.type.category} ${this.type.label}...`);

    const filter = this.getFilterValue();
    delete filter.sheetName; // Force to download all sheets

    this.disable();

    try {
      // Download file
      const file = await this.service.downloadFile(this.type, filter);
      if (isNotNil((file))) {
        window.open(file);
      }

    } catch (err) {
      console.error(err);
      this.error = err && err.message || err;
    } finally {
      this.loading = false;
      this.enable();
    }
  }

  getI18nTypeName(type?: T, self?: ExtractionAbstractPage<T>): string {
    self = self || this;
    if (isNil(type)) return undefined;
    const key = `EXTRACTION.${type.category}.${type.format}.TITLE`.toUpperCase();
    let message = self.translate.instant(key);

    if (message !== key) return message;
    // No I18n translation: continue

    // Use name, or label (but replace underscore with space)
    message = type.name || type.label.replace(/[_-]+/g, " ").toUpperCase();
    // First letter as upper case
    if (message.length > 1) {
      return message.substring(0, 1) + message.substring(1).toLowerCase();
    }
    return message;
  }

  async load(id?: number, options?: any): Promise<any> {
    const type = this.$types.getValue().find(t => t.id === id);
    if (type) {
      this.setType(type, {emitEvent: false});

      this.loadData();
    }
    return undefined;
  }

  async save(event): Promise<any> {
    console.warn("Not allow to save extraction filter yet!");

    return undefined;
  }

  /* -- protected method -- */

  protected abstract async loadData(type?: T);

  protected abstract watchTypes(): Observable<T[]>;

  protected abstract fromObject(type?: any): T;

  protected abstract isEquals(t1: T, t2: T): boolean;

  protected getFilterValue(): ExtractionFilter {
    const res = {
      sheetName: this.sheetName,
      criteria: this.criteriaForm.getValueAsCriteriaArray()
    };

    return this.service.prepareFilter(res);
  }

  getFilterAsQueryParams(): any {
    const params: any = {
      category: this.type && this.type.category,
      label: this.type && this.type.label
    };
    const filter = this.getFilterValue();
    if (filter.sheetName) {
      params.sheet = filter.sheetName;
    }
    if (isNotEmptyArray(filter.criteria)) {
      params.q = filter.criteria.reduce((res, criterion) => {
        if (criterion.endValue) {
          return res.concat(`${criterion.name}${criterion.operator}${criterion.value}:${criterion.endValue}`);
        } else {
          return res.concat(`${criterion.name}${criterion.operator}${criterion.value}`);
        }
      }, []).join(";");
    }
    return params;
  }

  protected canUserWrite(type: ExtractionType): boolean {
    return type.category === "product" && (
      this.accountService.isAdmin()
      || (this.accountService.isSupervisor() && this.accountService.canUserWriteDataForDepartment(type.recorderDepartment)));
  }

  getI18nSheetName(sheetName?: string, type?: T, self?: ExtractionAbstractPage<any>): string {
    self = self || this;
    type = type || self.type;
    sheetName = sheetName || this.sheetName;
    if (isNil(sheetName) || isNil(type)) return undefined;

    // Try from specific translation
    let key = `EXTRACTION.${type.category.toUpperCase()}.${type.label.toUpperCase()}.SHEET.${sheetName}`;
    let message = self.translate.instant(key);
    if (message !== key) return message;

    // Try from generic translation
    key = `EXTRACTION.SHEET.${sheetName}`;
    message = self.translate.instant(key);
    if (message !== key) return message;

    // No translation found: replace underscore with space
    return sheetName.replace(/[_-]+/g, " ").toUpperCase();
  }

  protected translateColumns(columns: ExtractionColumn[]) {
    if (isEmptyArray(columns)) return; // Skip, to avoid error when calling this.translate.instant([])

    const i19nPrefix = `EXTRACTION.TABLE.${this.type.category.toUpperCase()}.`;
    const names = columns.map(column => (column.name || column.columnName).toUpperCase());
    const i18nKeys = names.map(name => i19nPrefix + name)
      .concat(names.map(name => `EXTRACTION.COMMON.${name}`));
    const i18nMap = this.translate.instant(i18nKeys);
    columns.forEach((column, i) => {
      let key = i18nKeys[i];
      column.name = i18nMap[key];
      // No I18n translation
      if (column.name === key) {
        // Try to get common translation
        key = i18nKeys[names.length + i];
        column.name = i18nMap[key];

        if (column.name === key) {
          // Or split column name, by replacing underscore by a space
          column.name = column.columnName.replace(/[_-]+/g, " ").toLowerCase();
          // First letter as upper case
          if (column.name.length > 1) column.name = capitalizeFirstLetter(column.name);
        }
      }
   });

  }

  protected getI18nColumnName(columnName: string) {
    let key = `EXTRACTION.TABLE.${this.type.category.toUpperCase()}.${columnName.toUpperCase()}`;
    let message = this.translate.instant(key);

    // No I18n translation
    if (message === key) {

      // Try to get common translation
      key = `EXTRACTION.COMMON.${columnName.toUpperCase()}`;
      message = this.translate.instant(key);

      // Or split column name
      if (message === key) {
        // Replace underscore with space
        message = columnName.replace(/[_-]+/g, " ").toUpperCase();
        if (message.length > 1) {
          // First letter as upper case
          message = message.substring(0, 1) + message.substring(1).toLowerCase();
        }
      }
    }
    return message;
  }
  protected hasFilterCriteria(sheetName: string) {
    return this.criteriaForm.hasFilterCriteria(sheetName);
  }
}
