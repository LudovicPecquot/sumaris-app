import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input} from '@angular/core';
import {TableElement, ValidatorService} from '@e-is/ngx-material-table';
import {
  AccountService,
  AppInMemoryTable,
  DefaultStatusList,
  InMemoryEntitiesService,
  LocalSettingsService,
  Referential,
  RESERVED_END_COLUMNS,
  RESERVED_START_COLUMNS
} from '@sumaris-net/ngx-components';
import {ActivatedRoute, Router} from '@angular/router';
import {ModalController, Platform} from '@ionic/angular';
import {Location} from '@angular/common';
import {ReferentialValidatorService} from '../services/validator/referential.validator';
import {ReferentialFilter} from '../services/filter/referential.filter';
import {environment} from '@environments/environment';


@Component({
  selector: 'app-simple-referential-table',
  templateUrl: 'referential-simple.table.html',
  styleUrls: ['referential-simple.table.scss'],
  providers: [
    {provide: ValidatorService, useExisting: ReferentialValidatorService},
    {
      provide: InMemoryEntitiesService,
      useFactory: () => {
        return new InMemoryEntitiesService(Referential, ReferentialFilter);
      }
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SimpleReferentialTable extends AppInMemoryTable<Referential, Partial<ReferentialFilter>> {

  statusList = DefaultStatusList;
  statusById: any;

  @Input() set entityName(entityName: string) {
    this.setFilter({
      ...this.filter,
      entityName
    });
  }

  get entityName(): string {
    return this.filter.entityName;
  }

  @Input() canEdit = false;
  @Input() canDelete = false;
  @Input() hasRankOrder: boolean;

  @Input() set showUpdateDateColumn(value: boolean) {
    this.setShowColumn('updateDate', value);
  }


  constructor(
    protected route: ActivatedRoute,
    protected router: Router,
    protected platform: Platform,
    protected location: Location,
    protected modalCtrl: ModalController,
    protected accountService: AccountService,
    protected settings: LocalSettingsService,
    protected validatorService: ValidatorService,
    protected memoryDataService: InMemoryEntitiesService<Referential, ReferentialFilter>,
    protected cd: ChangeDetectorRef,
    protected injector: Injector
  ) {
    super(injector,
      // columns
      RESERVED_START_COLUMNS
        .concat([
          'label',
          'name',
          'description',
          'status',
          'updateDate',
          'comments'])
        .concat(RESERVED_END_COLUMNS),
      Referential,
      memoryDataService,
      validatorService,
      {
        onRowCreated: (row) => this.onRowCreated(row),
        prependNewElements: false,
        suppressErrors: true
      },
      {
        entityName: 'Program'
      });

    this.i18nColumnPrefix = 'REFERENTIAL.';
    this.autoLoad = false; // waiting parent to load
    this.inlineEdition = true;
    this.confirmBeforeDelete = true;
    this.showUpdateDateColumn = false;

    // Fill statusById
    this.statusById = {};
    this.statusList.forEach((status) => this.statusById[status.id] = status);

    this.debug = !environment.production;
  }

  ngOnInit() {
    if (this.hasRankOrder) {
      this.memoryDataService.addSortByReplacement('id', 'rankOrder');
    }

    super.ngOnInit();
  }

  protected onRowCreated(row: TableElement<Referential>) {
    const defaultValues = {
      entityName: this.entityName
    };
    if (row.validator) {
      row.validator.patchValue(defaultValues);
    }
    else {
      Object.assign(row.currentData, defaultValues);
    }
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}

