import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ValidationErrors, ValidatorFn } from "@angular/forms";
import { DateAdapter } from "@angular/material/core";
import * as moment from "moment";
import { Moment } from 'moment/moment';
import { DEFAULT_PLACEHOLDER_CHAR } from 'src/app/shared/constants';
import { SharedValidators } from 'src/app/shared/validator/validators';
import { LocalSettingsService } from "../../core/services/local-settings.service";
import { IReferentialRef, ReferentialRef, ReferentialUtils } from "../../core/services/model/referential.model";
import { fromDateISOString } from "../../shared/dates";
import { PmfmStrategy } from "../services/model/pmfm-strategy.model";
import { Program } from '../services/model/program.model';
import {
  AppliedPeriod,
  AppliedStrategy,
  Strategy,
  StrategyDepartment,
  TaxonNameStrategy
} from "../services/model/strategy.model";
import { TaxonNameRef } from "../services/model/taxon.model";
import { ReferentialRefService } from "../services/referential-ref.service";
import { StrategyService } from "../services/strategy.service";
import { StrategyValidatorService } from '../services/validator/strategy.validator';
import { PmfmStrategiesTable } from "../strategy/pmfm-strategies.table";
import { LocationLevelIds, ParameterLabelGroups } from '../services/model/model.enum';
import { AppForm } from "../../core/form/form.class";
import { FormArrayHelper } from "../../core/form/form.utils";
import { EntityUtils } from "../../core/services/model/entity.model";
import { PmfmUtils } from "../services/model/pmfm.model";
import { isNil, suggestFromArray } from "../../shared/functions";
import { StatusIds } from "../../core/services/model/model.enum";
import { ProgramProperties } from "../services/config/program.config";
import { BehaviorSubject, merge } from "rxjs";
import { DenormalizedStrategy, DenormalizedStrategyService } from './denormalized-strategy.service';

@Component({
  selector: 'form-simple-strategy',
  templateUrl: './simple-strategy.form.html',
  styleUrls: ['./simple-strategy.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: StrategyValidatorService }
  ],
})
export class SimpleStrategyForm extends AppForm<Strategy> implements OnInit {

  mobile: boolean;
  programSubject = new BehaviorSubject<Program>(null);

  enableTaxonNameFilter = false;
  canFilterTaxonName = true;
  taxonNameHelper: FormArrayHelper<TaxonNameStrategy>;

  enableAnalyticReferenceFilter = false;

  enableDepartmentFilter = false;
  departmentsHelper: FormArrayHelper<StrategyDepartment>;
  departmentFocusIndex = -1;

  enableAppliedStrategyFilter = false;
  appliedStrategiesHelper: FormArrayHelper<AppliedStrategy>;
  appliedStrategiesIndex = -1;

  appliedPeriodHelper: FormArrayHelper<AppliedPeriod>;
  appliedPeriodIndex = -1;

  enablePmfmStrategiesFractionFilter = false;
  pmfmStrategiesFractionHelper: FormArrayHelper<PmfmStrategy>;
  pmfmStrategiesFractionFocusIndex = -1;

  pmfmStrategiesHelper: FormArrayHelper<PmfmStrategy>;
  pmfmStrategiesFocusIndex = -1;
  label = '';

  tabIndex?: number;
  hidden?: boolean;
  appliedYear = '';

  filterEnabled = true;

  @Input() set program(value: Program) {
    this.setProgram(value);
  }

  get program(): Program {
    return this.programSubject.getValue();
  }

  @Input() showError = true;
  @Input() i18nFieldPrefix = 'PROGRAM.STRATEGY.EDIT.';

  @Input() placeholderChar: string = DEFAULT_PLACEHOLDER_CHAR;

  labelMask: (string | RegExp)[];

  get appliedStrategiesForm(): FormArray {
    return this.form.controls.appliedStrategies as FormArray;
  }

  get departmentsFormArray(): FormArray {
    return this.form.controls.departments as FormArray;
  }

  get taxonNamesForm(): FormArray {
    return this.form.controls.taxonNames as FormArray;
  }

  get appliedPeriodsForm(): FormArray {
    return this.form.controls.appliedPeriods as FormArray;
  }

  get pmfmStrategiesForm(): FormArray {
    return this.form.controls.pmfmStrategies as FormArray;
  }

  get pmfmStrategiesFractionForm(): FormArray {
    return this.form.controls.pmfmStrategiesFraction as FormArray;
  }

  @ViewChild('weightPmfmStrategiesTable', { static: true }) weightPmfmStrategiesTable: PmfmStrategiesTable;
  @ViewChild('sizePmfmStrategiesTable', { static: true }) sizePmfmStrategiesTable: PmfmStrategiesTable;
  @ViewChild('maturityPmfmStrategiesTable', { static: true }) maturityPmfmStrategiesTable: PmfmStrategiesTable;

  analyticsReferenceItems: BehaviorSubject<string[]> = new BehaviorSubject<string[]>(null);
  locationItems: BehaviorSubject<ReferentialRef[]> = new BehaviorSubject<ReferentialRef[]>(null);
  departementItems: BehaviorSubject<ReferentialRef[]> = new BehaviorSubject<ReferentialRef[]>(null);
  fractionItems: BehaviorSubject<ReferentialRef[]> = new BehaviorSubject<ReferentialRef[]>(null);
  taxonItems: BehaviorSubject<TaxonNameRef[]> = new BehaviorSubject<TaxonNameRef[]>(null);

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected validatorService: StrategyValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected strategyService: StrategyService,
    protected denormalizeStrategyService: DenormalizedStrategyService,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef,
    protected formBuilder: FormBuilder
  ) {
    super(dateAdapter, validatorService.getRowValidator(), settings);
    this.mobile = this.settings.mobile;
  }

  protected setProgram(program: Program, opts?: { emitEvent?: boolean; }) {
    if (program && this.program !== program) {
      this.i18nFieldPrefix = 'PROGRAM.STRATEGY.EDIT.';
      const i18nSuffix = program.getProperty(ProgramProperties.PROGRAM_STRATEGY_I18N_SUFFIX) || '';
      this.i18nFieldPrefix += i18nSuffix !== 'legacy' && i18nSuffix || '';
      this.loadFilteredItems(program)
      this.programSubject.next(program);

      if (!opts || opts.emitEvent !== false) {
        this.markForCheck();
      }
    }
  }

  async loadFilteredItems(program: Program): Promise<void> {
    
    const items = await this.denormalizeStrategyService.loadAll(0, 20, "label", 'asc', {
      levelId: program.id
    });

    const data = (items.data || []);

    // TODO : Voir graphQL /analyticsRefence => erreur
    const analyticReferences =  [];
    // const promises = await Promise.all(
    //   data.map((i) => this.strategyService.loadAllAnalyticReferences(0, 1, 'name', 'asc', {name: i.analyticReference}))
    // );
    // promises.map(r => analyticReferences.push(r));
    this.analyticsReferenceItems.next(analyticReferences);

    //TODO : Supprimer les doublons sur chaque listes
    // TODO : Revoir le code
    let fractions = [];
    data.map(i => i.pmfmStrategies.filter(p => !p.pmfm).forEach(fraction => fractions.push(fraction)));
    const promises = await Promise.all(
      fractions.map((i) => this.referentialRefService.loadAll(0, 1, null, null, {id: i.fractionId, entityName: 'Fraction'}))
    );
    fractions = [];
    promises.map(r => r.data.forEach(f => fractions.push(f)));
    this.fractionItems.next(fractions);

    const appliedStrategies = data.map(i => i.appliedStrategies);
    const locations = [];
    const departements = [];

    appliedStrategies.forEach(a => a.forEach(b => locations.push(b.location)));
    data.map(i => i.departments.forEach(departement => departements.push(departement.department)));
    
    const taxons = data.map(i => i.taxonNames[0]?.taxonName).filter(t => t !== undefined);

    this.locationItems.next(locations);
    this.departementItems.next(departements);
    // this.fractionItems.next(fractions);
    this.taxonItems.next(taxons);
  }

  async setPmfmStrategies() {
    const pmfms = [];

    await this.weightPmfmStrategiesTable.save();
    await this.sizePmfmStrategiesTable.save();
    await this.maturityPmfmStrategiesTable.save();

    const weights = this.weightPmfmStrategiesTable.value.filter(p => p.pmfm || p.parameterId);
    const sizes = this.sizePmfmStrategiesTable.value.filter(p => p.pmfm || p.parameterId);
    const maturities = this.maturityPmfmStrategiesTable.value.filter(p => p.pmfm || p.parameterId);

    pmfms.push(this.pmfmStrategiesHelper.at(0).value);
    pmfms.push(this.pmfmStrategiesHelper.at(1).value);
    pmfms.push(weights);
    pmfms.push(sizes);
    pmfms.push(maturities);

    if (weights.length <= 0) { this.weightPmfmStrategiesTable.value = [new PmfmStrategy()]; }
    if (sizes.length <= 0) { this.sizePmfmStrategiesTable.value = [new PmfmStrategy()]; }
    if (maturities.length <= 0) { this.maturityPmfmStrategiesTable.value = [new PmfmStrategy()]; }

    this.form.controls.pmfmStrategies.patchValue(pmfms);
    this.pmfmStrategiesForm.markAsTouched();
    this.markAsDirty();
  }

  ngOnInit() {
    super.ngOnInit();

    this.registerSubscription(
      merge(
        this.weightPmfmStrategiesTable.onCancelOrDeleteRow,
        this.sizePmfmStrategiesTable.onCancelOrDeleteRow,
        this.maturityPmfmStrategiesTable.onCancelOrDeleteRow,
        this.weightPmfmStrategiesTable.onConfirmEditCreateRow,
        this.sizePmfmStrategiesTable.onConfirmEditCreateRow,
        this.maturityPmfmStrategiesTable.onConfirmEditCreateRow
      )
        .subscribe(() => this.setPmfmStrategies())
    );


    this.form.addControl('year', new FormControl);

    // register year field changes
    this.registerSubscription(
      this.form.get('year').valueChanges.subscribe((date: Moment) => {
        this.onDateChange(date);
        this.form.markAsTouched();
      })
    );

    // taxonName autocomplete
    this.registerAutocompleteField('taxonName', {
      suggestFn: (value, filter) => this.suggestTaxonName(value, {
        ...filter, statusId: 1
      },
        'TaxonName',
        this.enableTaxonNameFilter),
      attributes: ['name'],
      columnNames: ['REFERENTIAL.NAME'],
      mobile: this.settings.mobile
    });

    // Department autocomplete
    this.registerAutocompleteField('department', {
      suggestFn: (value, filter) => this.suggestDepartements(value, {
        ...filter, statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY]
      },
        'Department',
        this.enableDepartmentFilter),
      columnSizes: [4, 8],
      mobile: this.settings.mobile
    });

    // appliedStrategy autocomplete
    this.registerAutocompleteField('location', {
      suggestFn: (value, filter) => this.suggestLocations(value, {
        ...filter,
        statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY],
        levelIds: [LocationLevelIds.ICES_DIVISION]
      },
        'Location',
        this.enableAppliedStrategyFilter),
      mobile: this.settings.mobile
    });

    // eotp combo -------------------------------------------------------------------
    this.registerAutocompleteField('analyticReference', {
      suggestFn: (value, filter) => this.suggestAnalyticReferences(value, {
        ...filter, statusIds: [0, 1]
      }),
      columnSizes: [4, 6],
      mobile: this.settings.mobile
    });

    this.registerAutocompleteField('pmfmStrategiesFraction', {
      suggestFn: (value, filter) => this.suggestPmfmStrategiesFraction(value, {
        ...filter, statusId: 1
      },
        'Fraction',
        this.enablePmfmStrategiesFractionFilter),
      attributes: ['name'],
      columnNames: ['REFERENTIAL.NAME'],
      columnSizes: [2, 10],
      mobile: this.settings.mobile
    });

    // Init array helpers
    this.initdepartmentHelper();
    this.initTaxonNameHelper();
    this.initPmfmStrategiesHelper();
    this.initAppliedStrategiesHelper();
    this.initAppliedPeriodHelper();
    this.initPmfmStrategiesFractionHelper();
  }

  /**
   * Select text that can be changed, using the text mask
   * @param input
   */
  selectMask(input: HTMLInputElement) {
    if (!this.labelMask) input.select();
    const startIndex = this.labelMask.findIndex(c => c instanceof RegExp);
    let endIndex = this.labelMask.slice(startIndex).findIndex(c => !(c instanceof RegExp), startIndex);
    endIndex = (endIndex === -1)
      ? this.labelMask.length
      : startIndex + endIndex;
    input.setSelectionRange(startIndex, endIndex, "backward");
  }

  /**
   * Suggest autocomplete values
   * @param value
   * @param filter - filters to apply
   * @param entityName - referential to request
   * @param filtered - boolean telling if we load prefilled data
   */
  protected async suggestLocations(value: string, filter: any, entityName: string, filtered: boolean): Promise<IReferentialRef[]> {
    if (this.filterEnabled && this.enableAppliedStrategyFilter) {
      const res = await suggestFromArray(this.locationItems.getValue(), null,
        {
          ...filter,
          entityName: entityName
        }
      );
      return res;
    } else {
      return this.referentialRefService.suggest(value, {
        ...filter,
        entityName: entityName
      });
    }
  }

  /**
   * Suggest autocomplete values
   * @param value
   * @param filter - filters to apply
   */
  protected async suggestAnalyticReferences(value: string, filter: any): Promise<IReferentialRef[]> {
    if (this.filterEnabled && this.enableAnalyticReferenceFilter) {
      return this.strategyService.suggestAnalyticReferences(value, filter);
    } else {
      return this.strategyService.loadAllAnalyticReferences(0, 5, null, null, filter);
    }
  }



  /**
   * Suggest autocomplete values
   * @param value
   * @param filter - filters to apply
   * @param entityName - referential to request
   * @param filtered - boolean telling if we load prefilled data
   */
  protected async suggestPmfmStrategiesFraction(value: string, filter: any, entityName: string, filtered: boolean): Promise<IReferentialRef[]> {
    if (this.filterEnabled && this.enablePmfmStrategiesFractionFilter) {
      const res = await suggestFromArray(this.fractionItems.getValue(), null,
        {
          ...filter,
          entityName: entityName
        }
      );
      return res;
    } else {
      return this.referentialRefService.suggest(value, {
        ...filter,
        entityName: entityName
      });
    }
  }

  /**
   * Suggest autocomplete values
   * @param value
   * @param filter - filters to apply
   * @param entityName - referential to request
   * @param filtered - boolean telling if we load prefilled data
   */
  protected async suggestDepartements(value: string, filter: any, entityName: string, filtered: boolean): Promise<IReferentialRef[]> {
    if (this.filterEnabled && this.enableDepartmentFilter) {
      const res = await suggestFromArray(this.departementItems.getValue(), null,
        {
          ...filter,
          entityName: entityName
        }
      );
      return res;
    } else {
      return this.referentialRefService.suggest(value, {
        ...filter,
        entityName: entityName
      });
    }
  }

  // /**
  //  * Suggest autocomplete values
  //  * @param value
  //  * @param filter - filters to apply
  //  * @param entityName - referential to request
  //  * @param filtered - boolean telling if we load prefilled data
  //  */
  // protected async suggest(value: string, filter: any, entityName: string, filtered: boolean): Promise<IReferentialRef[]> {

  //   // Special case: AnalyticReference
  //   if (entityName === "AnalyticReference") {
  //     if (filtered) {
  //       //TODO a remplacer par recuperation des donnees deja saisies
  //       return this.strategyService.loadAllAnalyticReferences(0, 5, null, null, filter);
  //     } else {
  //       return this.strategyService.suggestAnalyticReferences(value, filter);
  //     }
  //   }

  //   if (filtered) {
  //     //TODO a remplacer par recuperation des donnees deja saisies
  //     const res = await this.referentialRefService.loadAll(0, 5, null, null,
  //       {
  //         ...filter,
  //         entityName: entityName
  //       },
  //       { withTotal: false /* total not need */ }
  //     );
  //     return res.data;
  //   } else {
  //     return this.referentialRefService.suggest(value, {
  //       ...filter,
  //       entityName: entityName
  //     });
  //   }
  // }

  protected async suggestTaxonName(value: string, filter: any, entityName: string, filtered: boolean): Promise<TaxonNameRef[]> {
    if (this.filterEnabled && this.enableTaxonNameFilter) {
      const res = await suggestFromArray(this.taxonItems.getValue(), null,
        {
          ...filter,
          entityName: entityName
        }
      );
      return res;
    } else {
      return await this.referentialRefService.suggestTaxonNames(value,
        {
          ...filter,
          entityName: entityName
        },
      );
    }
  }

  setValue(data: Strategy, opts?: { emitEvent?: boolean; onlySelf?: boolean }) {
    console.debug("[simpleStrategy-form] Setting Strategy value", data);
    if (!data) return;


    this.form.get('label').setAsyncValidators([
      async (control) => {
        if (data && control.value !== data.label) {
          const exists = await this.strategyService.existLabel(control.value);
          if (exists) {
            return <ValidationErrors>{ unique: true };
          }

          SharedValidators.clearError(control, 'unique');
        }
        return null;
      }
    ]);


    // Resize strategy department array
    this.departmentsHelper.resize(Math.max(1, data.departments.length));

    // Resize strategy department array
    this.appliedStrategiesHelper.resize(Math.max(1, data.appliedStrategies.length));

    // Resize pmfm strategy array
    this.taxonNameHelper.resize(Math.max(1, data.taxonNames.length));

    // Resize pmfm strategy array
    // this.pmfmStrategiesHelper.resize(Math.max(1, data.pmfmStrategies.length));

    // Resize strategy department array
    this.appliedPeriodHelper.resize(4);

    // APPLIED_PERIODS
    // get model appliedPeriods which are stored in first applied strategy
    const appliedPeriodControl = this.appliedPeriodsForm;
    const appliedPeriods = data.appliedStrategies.length && data.appliedStrategies[0].appliedPeriods || [];
    const appliedStrategyId = data.appliedStrategies.length && data.appliedStrategies[0].strategyId || undefined;

    const year = moment().year();

    // format periods for applied conrol period in view and init default period by quarter if no set
    const quarter1 = appliedPeriods.find(period => (fromDateISOString(period.startDate).month() + 1) === 1) || {
      appliedStrategyId: appliedStrategyId,
      startDate: moment(`${year}-01-01`).utc(false),
      endDate: moment(`${year}-03-31`).utc(false),
      acquisitionNumber: undefined
    };

    const quarter2 = appliedPeriods.find(period => (fromDateISOString(period.startDate).month() + 1) === 4) || {
      appliedStrategyId: appliedStrategyId,
      startDate: moment(`${year}-04-01`).utc(false),
      endDate: moment(`${year}-06-30`).utc(false),
      acquisitionNumber: undefined
    };
    const quarter3 = appliedPeriods.find(period => (fromDateISOString(period.startDate).month() + 1) === 7) || {
      appliedStrategyId: appliedStrategyId,
      startDate: moment(`${year}-07-01`).utc(false),
      endDate: moment(`${year}-09-30`).utc(false),
      acquisitionNumber: undefined
    };
    const quarter4 = appliedPeriods.find(period => (fromDateISOString(period.startDate).month() + 1) === 10) || {
      appliedStrategyId: appliedStrategyId,
      startDate: moment(`${year}-10-01`).utc(false),
      endDate: moment(`${year}-12-31`).utc(false),
      acquisitionNumber: undefined
    };
    const formattedAppliedPeriods = [quarter1, quarter2, quarter3, quarter4];

    // patch the control value
    appliedPeriodControl.patchValue(formattedAppliedPeriods);

    super.setValue(data, opts);

    // Get fisrt period
    const period = appliedPeriods[0];
    this.form.get('year').patchValue(period ? period.startDate : moment());

    // fixme get eotp from referential by label = data.analyticReference
    this.form.patchValue({
      analyticReference: { label: data.analyticReference }
    });

    const pmfmStrategiesControl = this.pmfmStrategiesForm;
    let pmfmStrategies: any[];

    // If new
    if (!data.id) {
      pmfmStrategies = [null, null];
    } else {
      const hasAge = (data.pmfmStrategies || []).findIndex(p => PmfmUtils.hasParameterLabelIncludes(p.pmfm, ParameterLabelGroups.AGE)) !== -1;
      const hasSex = (data.pmfmStrategies || []).findIndex(p => PmfmUtils.hasParameterLabelIncludes(p.pmfm, ParameterLabelGroups.SEX)) !== -1;
      pmfmStrategies = [hasSex, hasAge];
    }

    //Weights
    // TODO BLA: revoir ces sélections: utliser PmfmUtils
    const weightPmfmStrategy = (data.pmfmStrategies || []).filter(
      p =>
        (p.pmfm && p.pmfm.parameter && ParameterLabelGroups.WEIGHT.includes(p.pmfm.parameter.label)) ||
        (p['parameter'] && ParameterLabelGroups.WEIGHT.includes(p['parameter'].label))
    );
    pmfmStrategies.push(weightPmfmStrategy.length > 0 ? weightPmfmStrategy : []);
    this.weightPmfmStrategiesTable.value = weightPmfmStrategy.length > 0 ? weightPmfmStrategy : [new PmfmStrategy()];

    //Sizes
    const sizePmfmStrategy = (data.pmfmStrategies || []).filter(
      p =>
        (p.pmfm && p.pmfm.parameter && ParameterLabelGroups.LENGTH.includes(p.pmfm.parameter.label)) ||
        (p['parameter'] && ParameterLabelGroups.LENGTH.includes(p['parameter'].label))
    );
    pmfmStrategies.push(sizePmfmStrategy.length > 0 ? sizePmfmStrategy : []);
    this.sizePmfmStrategiesTable.value = sizePmfmStrategy.length > 0 ? sizePmfmStrategy : [new PmfmStrategy()];

    //Maturities
    const maturityPmfmStrategy = (data.pmfmStrategies || []).filter(
      p =>
        (p.pmfm && p.pmfm.parameter && ParameterLabelGroups.MATURITY.includes(p.pmfm.parameter.label)) ||
        (p['parameter'] && ParameterLabelGroups.MATURITY.includes(p['parameter'].label))
    );
    pmfmStrategies.push(maturityPmfmStrategy.length > 0 ? maturityPmfmStrategy : []);
    this.maturityPmfmStrategiesTable.value = maturityPmfmStrategy.length > 0 ? maturityPmfmStrategy : [new PmfmStrategy()];

    pmfmStrategiesControl.patchValue(pmfmStrategies);

    // TODO
    this.referentialRefService.loadAll(0, 0, null, null,
      {
        entityName: 'Fraction'
      },
      { withTotal: false /* total not need */ }
    ).then(res => {
      const calcifiedTypeControl = this.pmfmStrategiesFractionForm;
      const PmfmStrategiesFraction = (data.pmfmStrategies || []).filter(p => p.fractionId && !p.pmfm);
      const fractions = PmfmStrategiesFraction.map(cal => {
        return {
          id: cal.fractionId,
          name: res.data.find(fraction => fraction.id === cal.fractionId).name,
        };
      });
      calcifiedTypeControl.clear();
      this.pmfmStrategiesFractionHelper.resize(Math.max(1, PmfmStrategiesFraction.length));
      calcifiedTypeControl.patchValue(fractions);
    });
  }

  protected async onDateChange(date: Moment) {

    const labelControl = this.form.get('label');

    //update mask
    let year;
    if (date && (typeof date === 'object') && (date.year())) {
      year = date.toDate().getFullYear().toString();
    }
    else if (date && (typeof date === 'string')) {
      const dateAsString = date as string;
      year = moment(dateAsString).toDate().getFullYear().toString();
    }
    this.labelMask = [...year.split(''), '-', 'B', 'I', 'O', '-', /\d/, /\d/, /\d/, /\d/];

    // get new label sample row code
    const updatedLabel = this.program && (await this.strategyService.computeNextLabel(this.program.id, `${year}-BIO-`, 4));

    const label = labelControl.value;
    if (isNil(label)) {
      labelControl.setValue(updatedLabel);
    } else {
      const oldYear = label.split('-').shift();
      // Update the label, if year change
      if (year && oldYear && year !== oldYear) {
        labelControl.setValue(updatedLabel);
      } else {
        labelControl.setValue(label);
      }
    }
  }

  // TaxonName Helper -----------------------------------------------------------------------------------------------
  protected initTaxonNameHelper() {
    // appliedStrategies => appliedStrategies.location ?
    this.taxonNameHelper = new FormArrayHelper<TaxonNameStrategy>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'taxonNames'),
      (ts) => this.validatorService.getTaxonNameStrategyControl(ts),
      (t1, t2) => EntityUtils.equals(t1.taxonName, t2.taxonName, 'name'),
      value => isNil(value) && isNil(value.taxonName),
      {
        allowEmptyArray: false
      }
    );
    // Create at least one fishing Area
    if (this.taxonNameHelper.size() === 0) {
      this.taxonNameHelper.resize(1);
    }
  }

  // pmfmStrategies Helper -----------------------------------------------------------------------------------------------
  protected initPmfmStrategiesHelper() {
    // appliedStrategies => appliedStrategies.location ?
    this.pmfmStrategiesHelper = new FormArrayHelper<PmfmStrategy>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'pmfmStrategies'),
      (pmfmStrategy) => this.formBuilder.control(pmfmStrategy || null),
      ReferentialUtils.equals,
      ReferentialUtils.isEmpty,
      {
        allowEmptyArray: false,
        validators: [
          this.requiredPmfmMinLength(2),
          this.requiredWeightOrSize()
        ]
      }
    );
    // Create at least one fishing Area
    if (this.pmfmStrategiesHelper.size() === 0) {
      this.pmfmStrategiesHelper.resize(5);
    }
  }

  addPmfmStrategies() {
    this.pmfmStrategiesHelper.add();
    if (!this.mobile) {
      this.pmfmStrategiesFocusIndex = this.pmfmStrategiesHelper.size() - 1;
    }
  }

  // appliedStrategies Helper -----------------------------------------------------------------------------------------------
  protected initAppliedStrategiesHelper() {
    // appliedStrategiesHelper formControl can't have common validator since quarters efforts are optional
    this.appliedStrategiesHelper = new FormArrayHelper<AppliedStrategy>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'appliedStrategies'),
      (appliedStrategy) => this.validatorService.getAppliedStrategiesControl(appliedStrategy),
      (s1, s2) => EntityUtils.equals(s1.location, s2.location, 'label'),
      value => isNil(value) && isNil(value.location),
      {
        allowEmptyArray: false
      }
    );
    // Create at least one fishing Area
    if (this.appliedStrategiesHelper.size() === 0) {
      this.appliedStrategiesHelper.resize(1);
    }
  }
  addAppliedStrategy() {
    this.appliedStrategiesHelper.add(new AppliedStrategy());
    if (!this.mobile) {
      this.appliedStrategiesIndex = this.appliedStrategiesHelper.size() - 1;
    }
  }

  // appliedStrategies Helper -----------------------------------------------------------------------------------------------
  protected initAppliedPeriodHelper() {
    // appliedStrategiesHelper formControl can't have common validator since quarters efforts are optional
    this.appliedPeriodHelper = new FormArrayHelper<AppliedPeriod>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'appliedPeriods'),
      (appliedPeriod) => this.validatorService.getAppliedPeriodsControl(appliedPeriod),
      (p1, p2) => EntityUtils.equals(p1, p2, 'startDate'),
      value => isNil(value),
      {
        allowEmptyArray: false,
        validators: [
          this.requiredPeriodMinLength(1)
        ]
      }
    );
    // Create at least one fishing Area
    if (this.appliedStrategiesHelper.size() === 0) {
      this.departmentsHelper.resize(1);
    }
  }

  // Laboratory Helper -----------------------------------------------------------------------------------------------
  protected initdepartmentHelper() {
    this.departmentsHelper = new FormArrayHelper<StrategyDepartment>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'departments'),
      (department) => this.validatorService.getStrategyDepartmentsControl(department),
      (d1, d2) => EntityUtils.equals(d1.department, d2.department, 'label'),
      value => isNil(value) && isNil(value.department),
      {
        allowEmptyArray: false
      }
    );
    // Create at least one laboratory
    if (this.departmentsHelper.size() === 0) {
      this.departmentsHelper.resize(1);
    }
  }

  addDepartment() {
    this.departmentsHelper.add(new StrategyDepartment());
    if (!this.mobile) {
      this.departmentFocusIndex = this.departmentsHelper.size() - 1;
    }
  }

  // PmfmStrategiesFractionHelper - Pièces calcifiées ------------------------------------------------------------------------------------------
  protected initPmfmStrategiesFractionHelper() {
    this.pmfmStrategiesFractionHelper = new FormArrayHelper<PmfmStrategy>(
      FormArrayHelper.getOrCreateArray(this.formBuilder, this.form, 'pmfmStrategiesFraction'),
      (pmfmStrategiesFraction) => this.formBuilder.control(pmfmStrategiesFraction || null, [SharedValidators.entity]),
      ReferentialUtils.equals,
      ReferentialUtils.isEmpty,
      {
        allowEmptyArray: false
      }
    );
    // Create at least one PmfmStrategiesFraction
    if (this.pmfmStrategiesFractionHelper.size() === 0) {
      this.pmfmStrategiesFractionHelper.resize(1);
    }
  }
  addPmfmStrategiesFraction() {
    this.pmfmStrategiesFractionHelper.add();
    if (!this.mobile) {
      this.pmfmStrategiesFractionFocusIndex = this.pmfmStrategiesFractionHelper.size() - 1;
    }
  }

  protected markForCheck() {
    if (this.cd) this.cd.markForCheck();
  }

  requiredPmfmMinLength(minLength?: number): ValidatorFn {
    minLength = minLength || 2;
    return (array: FormArray): ValidationErrors | null => {
      //Check if sex parameter check
      const data = array.value;
      if (data[0] === false) {
        // Sex = false => remove maturity
        data[4] = [];
      }
      const values = data.flat().filter(pmfm => pmfm && pmfm !== false);
      if (!values || values.length < minLength) {
        return { minLength: { minLength: minLength } };
      }
      return null;
    };
  }

  requiredPeriodMinLength(minLength?: number): ValidatorFn {
    minLength = minLength || 1;
    return (array: FormArray): ValidationErrors | null => {
      const values = array.value.flat().filter(period => period.acquisitionNumber !== undefined && period.acquisitionNumber !== null && period.acquisitionNumber >= 1);
      if (!values || values.length < minLength) {
        return { minLength: { minLength: minLength } };
      }
      return null;
    };
  }

  requiredWeightOrSize(): ValidatorFn {
    return (array: FormArray): ValidationErrors | null => {
      if (Array.isArray(array.value[2])) {
        const weight = (array.value[2] || []).filter(p => p.pmfm);
        if (weight && weight.length > 0) {
          return null;
        }
      }
      if (Array.isArray(array.value[3])) {
        const size = (array.value[3] || []).filter(p => p.pmfm);
        if (size && size.length > 0) {
          return null;
        }
      }
      return { weightOrSize: { weightOrSize: false } };
    };
  }

  ifSex(): boolean {
    const sex = this.pmfmStrategiesForm.value[0];
    return sex;
  }

  ifAge(): boolean {
    const sex = this.pmfmStrategiesForm.value[1];
    return sex;
  }

}
