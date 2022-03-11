import { RoundWeightConversion } from './round-weight-conversion.model';
import { RoundWeightConversionFilter } from './round-weight-conversion.filter';
import { Component, Injector, Input } from '@angular/core';
import { BaseReferentialTable } from '@app/referential/table/base-referential.table';
import { RoundWeightConversionService } from './round-weight-conversion.service';
import { Validators } from '@angular/forms';
import { StatusIds } from '@sumaris-net/ngx-components';
import { RoundWeightConversionValidatorService } from './round-weight-conversion.validator';
import { TableElement } from '@e-is/ngx-material-table';
import moment from 'moment';
import { ReferentialRefFilter } from '@app/referential/services/filter/referential-ref.filter';
import { LocationLevelIds, ParameterLabelGroups } from '@app/referential/services/model/model.enum';
import { ParameterService } from '@app/referential/services/parameter.service';

@Component({
  selector: 'app-round-weight-conversion-table',
  templateUrl: '../table/base-referential.table.html',
  styleUrls: [
    '../table/base-referential.table.scss'
  ]
})
// @ts-ignore
export class RoundWeightConversionTable extends BaseReferentialTable<RoundWeightConversion, RoundWeightConversionFilter> {

   get taxonGroupIdControl() {
    return this.filterForm.get('taxonGroupId');
  }

  @Input() set taxonGroupId(value: number) {
     if (this.taxonGroupIdControl.value !== value) {
       this.taxonGroupIdControl.setValue(value);
     }
  }

  @Input() set showTaxonGroupIdColumn(show: boolean) {
    this.setShowColumn('taxonGroupId', show);
  }
  get showTaxonGroupIdColumn(): boolean {
    return this.getShowColumn('taxonGroupId');
  }

  constructor(injector: Injector,
              entityService: RoundWeightConversionService,
              validatorService: RoundWeightConversionValidatorService,
              protected parameterService: ParameterService
  ) {
    super(injector,
      RoundWeightConversion,
      RoundWeightConversionFilter,
      entityService,
      validatorService,
      {
        i18nColumnPrefix: 'REFERENTIAL.TAXON_GROUP.ROUND_WEIGHT_CONVERSION.',
        canUpload: true
      }
      );
    this.showTitle = false;
    this.showIdColumn = false;
    this.autoLoad = false; // Wait filter
    this.sticky = true;
    this.logPrefix = '[round-weight-conversion-table] ';
  }

  ngOnInit() {
    super.ngOnInit();
  }

  protected registerAutocompleteFields() {

    // Location
    const locationAttributes = this.settings.getFieldDisplayAttributes('location');
    this.registerAutocompleteField('location', {
      showAllOnFocus: false,
      suggestFn: (value, filter) => this.referentialRefService.suggest(value, {
        ...filter,
        searchAttributes: locationAttributes,
        levelIds: [LocationLevelIds.COUNTRY]
      }),
      filter: <Partial<ReferentialRefFilter>>{
        entityName: 'Location',
        statusIds: [StatusIds.TEMPORARY, StatusIds.ENABLE]
      },
      attributes: locationAttributes,
      mobile: this.mobile
    });

    // Dressing
    this.registerAutocompleteField('dressing', {
      showAllOnFocus: false,
      suggestFn: (value, filter) => this.referentialRefService.suggest(value, {
        ...filter,
        levelLabels: ParameterLabelGroups.DRESSING
      }),
      filter: <ReferentialRefFilter>{
        entityName: 'QualitativeValue',
        statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY]
      },
      mobile: this.mobile
    });

    // Preserving
    this.registerAutocompleteField('preserving', {
      showAllOnFocus: false,
      suggestFn: (value, filter) => this.referentialRefService.suggest(value, {
        ...filter,
        levelLabels: ParameterLabelGroups.PRESERVATION
      }),
      filter: <ReferentialRefFilter>{
        entityName: 'QualitativeValue',
        statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY]
      },
      mobile: this.mobile
    });
  }

  protected getFilterFormConfig(): any {
    console.debug(this.logPrefix + ' Creating filter form group...');
    return {
      taxonGroupId: [null, Validators.required]
    };
  }

  protected onDefaultRowCreated(row: TableElement<RoundWeightConversion>) {
    super.onDefaultRowCreated(row);

    const creationDate = moment(new Date());
    row.validator.patchValue({
      startDate: null,
      endDate: null,
      statusId: StatusIds.ENABLE,
      creationDate
    })
  }


}
