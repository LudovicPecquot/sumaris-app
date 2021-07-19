import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnDestroy, OnInit} from '@angular/core';
import {ValidatorService} from '@e-is/ngx-material-table';
import {StrategyValidatorService} from '../services/validator/strategy.validator';
import {Strategy} from '../services/model/strategy.model';
import {AppTable, DefaultStatusList, EntitiesTableDataSource, isNotNil, LocalSettingsService, RESERVED_END_COLUMNS, RESERVED_START_COLUMNS} from '@sumaris-net/ngx-components';
import {StrategyService} from '../services/strategy.service';
import {ActivatedRoute, Router} from '@angular/router';
import {ModalController, Platform} from '@ionic/angular';
import {Location} from '@angular/common';
import {Program} from '../services/model/program.model';
import {environment} from '@environments/environment';
import {StrategyFilter} from '@app/referential/services/filter/strategy.filter';


@Component({
  selector: 'app-strategy-table',
  templateUrl: 'strategies.table.html',
  styleUrls: ['strategies.table.scss'],
  providers: [
    {provide: ValidatorService, useExisting: StrategyValidatorService}
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StrategiesTable extends AppTable<Strategy, StrategyFilter> implements OnInit, OnDestroy {

  private _program: Program;

  statusList = DefaultStatusList;
  statusById: any;

  @Input() canEdit = false;
  @Input() canDelete = false;
  @Input() showError = true;
  @Input() showPaginator = true;

  @Input() set program(program: Program) {
    if (program && isNotNil(program.id) && this._program !== program) {
      this._program = program;
      console.debug('[strategy-table] Setting program:', program);
      this.setFilter( StrategyFilter.fromObject({
        ...this.filter,
        levelId: program.id
      }));
    }
  }

  get program(): Program {
    return this._program;
  }

  constructor(
    route: ActivatedRoute,
    router: Router,
    platform: Platform,
    location: Location,
    modalCtrl: ModalController,
    localSettingsService: LocalSettingsService,
    injector: Injector,
    dataService: StrategyService,
    validatorService: ValidatorService,
    protected cd: ChangeDetectorRef
  ) {
    super(route,
      router,
      platform,
      location,
      modalCtrl,
      localSettingsService,
      // columns
      RESERVED_START_COLUMNS
        .concat([
          'label',
          'name',
          'description',
          'status',
          'comments'])
        .concat(RESERVED_END_COLUMNS),
      new EntitiesTableDataSource(Strategy, dataService, validatorService, {
        prependNewElements: false,
        suppressErrors: environment.production,
        dataServiceOptions: {
          saveOnlyDirtyRows: false
        }
      }),
      null,
      injector);

    this.inlineEdition = false
    this.i18nColumnPrefix = 'REFERENTIAL.';
    this.autoLoad = false; // waiting parent to load
    this.confirmBeforeDelete = true;

    // Fill statusById
    this.statusById = {};
    this.statusList.forEach((status) => this.statusById[status.id] = status);

    this.debug = !environment.production;
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}

