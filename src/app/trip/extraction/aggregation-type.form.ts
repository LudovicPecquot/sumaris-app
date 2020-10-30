import {ChangeDetectionStrategy, Component, Input, OnInit, ViewChild} from "@angular/core";
import {AppForm, EntityUtils, FormArrayHelper, StatusIds} from "../../core/core.module";
import {
  AggregationStrata,
  AggregationType,
  ExtractionColumn,
  ExtractionUtils
} from "../services/model/extraction.model";
import {FormArray, FormBuilder, FormControl, FormGroup} from "@angular/forms";
import {AggregationTypeValidatorService} from "../services/validator/aggregation-type.validator";
import {ReferentialForm} from "../../referential/form/referential.form";
import {BehaviorSubject} from "rxjs";
import {arraySize, isNotEmptyArray} from "../../shared/functions";
import {DateAdapter} from "@angular/material/core";
import {Moment} from "moment";
import {LocalSettingsService} from "../../core/services/local-settings.service";
import {ReferentialUtils} from "../../core/services/model/referential.model";
import {ExtractionService} from "../services/extraction.service";
import {CommandMap} from "@ionic/cli/lib/namespace";

declare type ColumnMap = {[sheetName: string]: ExtractionColumn[] };

@Component({
  selector: 'app-aggregation-type-form',
  styleUrls: ['./aggregation-type.form.scss'],
  templateUrl: './aggregation-type.form.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AggregationTypeForm extends AppForm<AggregationType> implements OnInit {

  $sheetNames = new BehaviorSubject<String[]>(undefined);
  $timeColumns = new BehaviorSubject<ColumnMap>(undefined);
  $spatialColumns = new BehaviorSubject<ColumnMap>(undefined);
  $aggColumns = new BehaviorSubject<ColumnMap>(undefined);
  $techColumns = new BehaviorSubject<ColumnMap>(undefined);
  aggFunctions = [
    {
      value: 'SUM',
      name: 'EXTRACTION.AGGREGATION.EDIT.AGG_FUNCTION.SUM'
    },
    {
      value: 'AVG',
      name: 'EXTRACTION.AGGREGATION.EDIT.AGG_FUNCTION.AVG'
    }
  ];

  stratumHelper: FormArrayHelper<AggregationStrata>;

  form: FormGroup;
  stratumFormArray: FormArray;

  @Input()
  showError = true;

  @ViewChild('referentialForm', {static: true}) referentialForm: ReferentialForm;

  get value(): any {
    const json = this.form.value;

    // Re add label, because missing when field disable
    json.label = this.form.get('label').value;

    return json;
  }

  set value(value: any) {
    this.setValue(value);
  }

  get strataForms(): FormGroup[] {
    return this.stratumFormArray.controls as FormGroup[];
  }

  constructor(protected dateAdapter: DateAdapter<Moment>,
              protected formBuilder: FormBuilder,
              protected settings: LocalSettingsService,
              protected validatorService: AggregationTypeValidatorService,
              protected extractionService: ExtractionService) {
    super(dateAdapter,
      validatorService.getFormGroup(),
      settings);

    // Stratum
    this.stratumFormArray = this.form.controls.stratum as FormArray;
    this.stratumHelper = new FormArrayHelper<AggregationStrata>(
      this.stratumFormArray,
      (strata) => validatorService.getStrataFormGroup(strata),
      (v1, v2) => EntityUtils.equals(v1, v2, 'id'),
      ReferentialUtils.isEmpty,
      {
        allowEmptyArray: false
      }
    );


  }

  async updateLists(type: AggregationType) {

    // If spatial, load columns
    if (type.isSpatial) {

      const sheetNames = type.sheetNames || [];
      this.$sheetNames.next(sheetNames);

      const map: {[key: string]: ColumnMap} = {};
      await Promise.all(sheetNames.map(sheetName => {
        return this.extractionService.loadColumns(type, sheetName)
          .then(columns => {
            columns = columns || [];
            const columnMap = ExtractionUtils.dispatchColumns(columns);
            Object.keys(columnMap).forEach(key => {
              const m: ColumnMap = map[key] ||  <ColumnMap>{};
              m[sheetName] = columnMap[key];
              map[key] = m;
            });
          })
      }));

      console.debug('[aggregation-type] Columns map:', map);
      this.$timeColumns.next(map.timeColumns);
      this.$spatialColumns.next(map.spatialColumns);
      this.$aggColumns.next(map.aggColumns);
      this.$techColumns.next(map.techColumns);
    }
  }

  ngOnInit(): void {
    super.ngOnInit();

    // Set entity name (required for referential form validator)
    this.referentialForm.entityName = 'AggregationType';

    // Override status list i18n
    this.referentialForm.statusList = [
      {
        id: StatusIds.ENABLE,
        icon: 'eye',
        label: 'EXTRACTION.AGGREGATION.EDIT.STATUS_ENUM.PUBLIC'
      },
      {
        id: StatusIds.TEMPORARY,
        icon: 'eye-off',
        label: 'EXTRACTION.AGGREGATION.EDIT.STATUS_ENUM.PRIVATE'
      },
      {
        id: StatusIds.DISABLE,
        icon: 'close',
        label: 'EXTRACTION.AGGREGATION.EDIT.STATUS_ENUM.DISABLE'
      }
    ];
  }

  /* -- protected -- */

  setValue(data: AggregationType, opts?: { emitEvent?: boolean; onlySelf?: boolean }) {

    // If spatial, load columns
    if (data && data.isSpatial) {
      // If spatial product, make sure there is one strata
      this.stratumHelper.resize(Math.max(1, arraySize(data.stratum)));
    }
    else {
      this.stratumHelper.resize(0);
    }

    super.setValue(data, opts);
  }


}
