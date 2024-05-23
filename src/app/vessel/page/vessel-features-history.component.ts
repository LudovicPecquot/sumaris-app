import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnInit } from '@angular/core';
import { AppTable } from '@sumaris-net/ngx-components';
import { VesselFeatures } from '../services/model/vessel.model';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController, Platform } from '@ionic/angular';
import { Location } from '@angular/common';
import { AccountService } from '@sumaris-net/ngx-components';
import { LocalSettingsService } from '@sumaris-net/ngx-components';
import { EntitiesTableDataSource } from '@sumaris-net/ngx-components';
import { VesselFeaturesService } from '../services/vessel-features.service';
import { referentialToString } from '@sumaris-net/ngx-components';
import { environment } from '@environments/environment';
import { VesselFeaturesFilter } from '../services/filter/vessel.filter';

@Component({
  selector: 'app-vessel-features-history-table',
  templateUrl: './vessel-features-history.component.html',
  styleUrls: ['./vessel-features-history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VesselFeaturesHistoryComponent extends AppTable<VesselFeatures, VesselFeaturesFilter> implements OnInit {
  referentialToString = referentialToString;
  isAdmin: boolean;
  @Input() compact: boolean;
  @Input() title: string;

  @Input()
  set showGrossTonnageGrtColumn(value: boolean) {
    this.setShowColumn('grossTonnageGrt', value);
  }

  get showGrossTonnageGrtColumn(): boolean {
    return this.getShowColumn('grossTonnageGrt');
  }

  constructor(
    injector: Injector,
    protected accountService: AccountService,
    protected settings: LocalSettingsService,
    dataService: VesselFeaturesService,
    protected cd: ChangeDetectorRef
  ) {
    super(
      injector,
      // columns
      [
        'id',
        'startDate',
        'endDate',
        'exteriorMarking',
        'name',
        'administrativePower',
        'lengthOverAll',
        'grossTonnageGrt',
        'grossTonnageGt',
        'constructionYear',
        'ircs',
        'basePortLocation',
        'comments',
      ],
      new EntitiesTableDataSource<VesselFeatures>(VesselFeatures, dataService, null, {
        prependNewElements: false,
        suppressErrors: environment.production,
        saveOnlyDirtyRows: true,
      }),
      null
    );

    this.i18nColumnPrefix = 'VESSEL.';
    this.showGrossTonnageGrtColumn = false;
    this.autoLoad = false;
    this.inlineEdition = false;
    this.confirmBeforeDelete = true;
    this.title = 'VESSEL.HISTORY.FEATURES';
    this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();
    this.isAdmin = this.accountService.isAdmin();
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
