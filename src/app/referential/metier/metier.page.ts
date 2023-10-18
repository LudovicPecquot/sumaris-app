import { ChangeDetectionStrategy, Component, Injector, ViewChild } from '@angular/core';
import { Referential, StatusIds } from '@sumaris-net/ngx-components';
import { AppReferentialEditor } from '@app/referential/form/referential-editor.class';
import { ReferentialForm } from '@app/referential/form/referential.form';
import { MetierValidatorService } from '@app/referential/metier/metier.validator';
import { MetierService } from '@app/referential/metier/metier.service';
import { Metier } from '@app/referential/metier/metier.model';
import { ReferentialRefFilter } from '@app/referential/services/filter/referential-ref.filter';
import { TaxonGroupTypeIds } from '@app/referential/services/model/taxon-group.model';
import { GearLevelIds } from '@app/referential/services/model/model.enum';

@Component({
  selector: 'app-metier',
  templateUrl: 'metier.page.html',
  styleUrls: ['metier.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetierPage extends AppReferentialEditor<Metier, MetierService> {
  @ViewChild('referentialForm', { static: true }) referentialForm: ReferentialForm;

  constructor(injector: Injector, dataService: MetierService, validatorService: MetierValidatorService) {
    super(injector, Metier, dataService, validatorService.getFormGroup(), {
      entityName: Metier.ENTITY_NAME,
      uniqueLabel: true,
      withLevels: false,
      tabCount: 1,
    });

    this.registerFieldDefinition({
      key: 'gear',
      label: `REFERENTIAL.METIER.GEAR`,
      type: 'entity',
      autocomplete: {
        suggestFn: (value, filter) => this.referentialRefService.suggest(value, filter),
        filter: <ReferentialRefFilter>{
          entityName: 'Gear',
          statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY],
          levelIds: [GearLevelIds.FAO],
        },
      },
    });

    this.registerFieldDefinition({
      key: 'taxonGroup',
      label: `REFERENTIAL.METIER.TAXON_GROUP`,
      type: 'entity',
      autocomplete: {
        suggestLengthThreshold: 2,
        suggestFn: (value, filter) => this.referentialRefService.suggest(value, filter),
        filter: <ReferentialRefFilter>{
          entityName: 'TaxonGroup',
          statusIds: [StatusIds.ENABLE, StatusIds.TEMPORARY],
          levelIds: [TaxonGroupTypeIds.METIER_DCF_5, TaxonGroupTypeIds.METIER_NATIONAL],
        },
      },
    });
  }

  /* -- protected Metiers -- */

  protected registerForms() {
    this.addChildForms([this.referentialForm]);
  }

  protected setValue(data: Metier) {
    super.setValue(data);
  }

  protected async onEntitySaved(data: Referential): Promise<void> {}

  protected getFirstInvalidTabIndex(): number {
    if (this.referentialForm.invalid) return 0;
    return -1;
  }
}

