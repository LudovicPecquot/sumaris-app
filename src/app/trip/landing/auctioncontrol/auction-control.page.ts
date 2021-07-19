import {ChangeDetectionStrategy, Component, Injector, OnInit} from '@angular/core';
import {AcquisitionLevelCodes, LocationLevelIds, PmfmIds} from '../../../referential/services/model/model.enum';
import {LandingPage} from '../landing.page';
import {debounceTime, filter, map, mergeMap, startWith, switchMap, tap} from 'rxjs/operators';
import {BehaviorSubject, Observable, Subscription} from 'rxjs';
import {Landing} from '../../services/model/landing.model';
import {AuctionControlValidators} from '../../services/validator/auction-control.validators';
import {ModalController} from '@ionic/angular';
import {
  AppHelpModal,
  EntityServiceLoadOptions,
  fadeInOutAnimation,
  filterNotNil,
  firstNotNilPromise,
  HistoryPageReference,
  IReferentialRef,
  isNil,
  isNotEmptyArray,
  isNotNil,
  LoadResult,
  ReferentialUtils,
  SharedValidators,
  toNumber
} from '@sumaris-net/ngx-components';
import {ObservedLocation} from '../../services/model/observed-location.model';
import {FormBuilder, FormControl, FormGroup} from '@angular/forms';
import {TaxonGroupLabels, TaxonGroupRef} from '../../../referential/services/model/taxon.model';
import {Program} from '../../../referential/services/model/program.model';
import {IPmfm} from '../../../referential/services/model/pmfm.model';
import {AppRootDataEditor} from '../../../data/form/root-data-editor.class';

@Component({
  selector: 'app-auction-control',
  styleUrls: ['auction-control.page.scss'],
  templateUrl: './auction-control.page.html',
  animations: [fadeInOutAnimation],
  providers: [{provide: AppRootDataEditor, useExisting: AuctionControlPage}],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuctionControlPage extends LandingPage implements OnInit {

  $taxonGroupTypeId = new BehaviorSubject<number>(null);
  taxonGroupControl: FormControl;
  showOtherTaxonGroup = false;
  controlledSpeciesPmfmId: number;

  $pmfms: Observable<IPmfm[]>;
  $taxonGroupPmfm = new BehaviorSubject<IPmfm>(null);
  $taxonGroups = new BehaviorSubject<TaxonGroupRef[]>(null);
  selectedTaxonGroup$: Observable<TaxonGroupRef>;
  showSamplesTable = false;
  helpContent: string;


  constructor(
    injector: Injector,
    protected formBuilder: FormBuilder,
    protected modalCtrl: ModalController
  ) {
    super(injector, {
      pathIdAttribute: 'controlId',
      autoOpenNextTab: false,
      tabGroupAnimationDuration: '0s' // Disable tab animation
    });

    this.taxonGroupControl = this.formBuilder.control(null, [SharedValidators.entity]);
  }


  ngOnInit() {
    super.ngOnInit();

    // Default location levels ids
    this.landingForm.locationLevelIds = [LocationLevelIds.AUCTION];

    // Configure sample table
    this.samplesTable.inlineEdition = !this.mobile;

    const taxonGroupAttributes = this.settings.getFieldDisplayAttributes('taxonGroup');
    this.registerAutocompleteField('taxonGroup', {
      suggestFn: (value: any, options?: any) => this.suggestTaxonGroups(value, options),
      columnSizes: taxonGroupAttributes.map(attr => attr === 'label' ? 3 : undefined)
    });

  }

  async ngAfterViewInit() {
    super.ngAfterViewInit();

    // Get program taxon groups
    this.registerSubscription(
      this.$programLabel
        .pipe(
          filter(isNotNil),
          mergeMap((programLabel) => this.programRefService.loadTaxonGroups(programLabel))
        )
        .subscribe(taxonGroups => {
          console.debug("[control] Program taxonGroups: ", taxonGroups);
          this.$taxonGroups.next(taxonGroups);
        })
    );

    this.$pmfms = filterNotNil(this.$taxonGroups)
        .pipe(
          mergeMap(() => filterNotNil(this.landingForm.$pmfms)),
          map(pmfms => pmfms.map(pmfm => {
            // Controlled species PMFM
            if (pmfm.id === PmfmIds.CONTROLLED_SPECIES || pmfm.label === 'TAXON_GROUP') {
              console.debug(`[control] Replacing pmfm ${pmfm.label} qualitative values`);

              this.controlledSpeciesPmfmId = pmfm.id;

              const taxonGroups = this.$taxonGroups.getValue();
              if (isNotEmptyArray(taxonGroups) && isNotEmptyArray(pmfm.qualitativeValues)) {
                pmfm = pmfm.clone(); // Clone (to keep unchanged the original pmfm)

                // Replace QV.name
                pmfm.qualitativeValues = pmfm.qualitativeValues.reduce((res, qv) => {
                  const taxonGroup = taxonGroups.find(tg => tg.label === qv.label);
                  // If not found in strategy's taxonGroups: ignore
                  if (!taxonGroup) {
                    console.warn(`Ignore invalid QualitativeValue {label: ${qv.label}} (not found in taxon groups of the program ${this.landingForm.programLabel})`);
                    return res;
                  }
                  // Replace the QV name, using the taxon group name
                  qv.name = taxonGroup.name;
                  qv.entityName = taxonGroup.entityName || 'QualitativeValue';
                  return res.concat(qv);
                }, []);
              }
              else {
                console.debug(`[control] No qualitative values to replace, or no taxon groups in the strategy`);
              }

              this.$taxonGroupPmfm.next(pmfm);
            }

            // Force other Pmfm to optional (if in on field)
            else if (this.isOnFieldMode){
              pmfm = pmfm.clone(); // Skip original pmfm safe
              pmfm.required = false;
            }
            return pmfm;
          }))
        );

    // Get the taxon group control control
    this.selectedTaxonGroup$ = this.$taxonGroupPmfm
      .pipe(
        map(pmfm => pmfm && this.form.get( `measurementValues.${pmfm.id}`)),
        filter(isNotNil),
        switchMap(control => control.valueChanges
          .pipe(
            startWith<any, any>(control.value),
            debounceTime(250)
          )),
        // Update the help content
        tap(qv => {
          // TODO BLA load description, in the executeImport process
          //console.warn("TODO: update help modal with QV=", qv);
          this.helpContent = qv && qv.description || undefined;
        }),
        map(qv => {
          return ReferentialUtils.isNotEmpty(qv)
            && this.$taxonGroups.getValue().find(tg => tg.label === qv.label)
            || undefined;
        })
      );

    // Load pmfms
    this.registerSubscription(
      this.selectedTaxonGroup$
      .pipe(
        filter(isNotNil),
        mergeMap(taxonGroup => this.programRefService.watchProgramPmfms(this.$programLabel.getValue(), {
          acquisitionLevel: AcquisitionLevelCodes.SAMPLE,
          taxonGroupId: toNumber(taxonGroup && taxonGroup.id, undefined)
        })),
        tap(async (pmfms) => {
          // Save existing samples
          if (this.samplesTable.dirty) {
            await this.samplesTable.save();
          }

          // Applying new PMFMs
          console.debug('[control] Applying taxon group PMFMs:', pmfms);
          this.samplesTable.pmfms = pmfms;
        })
      ).subscribe());

    // Update sample tables
    this.registerSubscription(
      this.selectedTaxonGroup$
        .subscribe(taxonGroup => {
          if (taxonGroup && taxonGroup.label === TaxonGroupLabels.FISH) {
            this.showOtherTaxonGroup = true;
            const samples = this.samplesTable.value;
            let sameTaxonGroup = isNotEmptyArray(samples) && samples[0].taxonGroup || null;
            sameTaxonGroup = sameTaxonGroup && samples.findIndex(s => !ReferentialUtils.equals(sameTaxonGroup, s.taxonGroup)) === -1
              && sameTaxonGroup || null;
            this.taxonGroupControl.setValue(sameTaxonGroup);
            this.showSamplesTable = true;
          }
          else {
            this.showOtherTaxonGroup = false;
            this.taxonGroupControl.setValue(taxonGroup);
          }
        }));

    this.registerSubscription(
      this.taxonGroupControl.valueChanges
        .subscribe(taxonGroup => {
          const hasTaxonGroup = ReferentialUtils.isNotEmpty(taxonGroup);
          console.debug('[control] Selected taxon group:', taxonGroup);
          this.samplesTable.defaultTaxonGroup = taxonGroup;
          this.samplesTable.showTaxonGroupColumn = !hasTaxonGroup;
          this.showSamplesTable = this.showSamplesTable || hasTaxonGroup;
          this.markForCheck();
        }));
  }

  protected async setProgram(program: Program) {
    await super.setProgram(program);

    this.$taxonGroupTypeId.next(program && program.taxonGroupType ? program.taxonGroupType.id : null);
  }

  protected async onNewEntity(data: Landing, options?: EntityServiceLoadOptions): Promise<void> {

    await super.onNewEntity(data, options);

    // Define default back link
    const observedLocationId = this.parent && this.parent.id || data && data.observedLocationId;
    this.defaultBackHref = `/observations/${observedLocationId}?tab=1`;
  }

  protected async onEntityLoaded(data: Landing, options?: EntityServiceLoadOptions): Promise<void> {
    await super.onEntityLoaded(data, options);

    // Send landing date time to sample tables, but leave empty if FIELD mode (= will use current date)
    this.samplesTable.defaultSampleDate = this.isOnFieldMode ? undefined : data.dateTime;

    // Always open the second tab, when existing entity
    this.selectedTabIndex = 1;
    this.tabGroup.realignInkBar();

    // Define default back link
    const observedLocationId = this.parent && this.parent.id || data && data.observedLocationId;
    this.defaultBackHref = `/observations/${observedLocationId}?tab=1`;

    this.markForCheck();
  }

  updateView(data: Landing | null, opts?: {
    emitEvent?: boolean;
    openTabIndex?: number;
    updateRoute?: boolean;
  }) {
    // if vessel given in query params
    if (this.isNewData && this.route.snapshot.queryParams['vessel']) {
      // Open the second tab
      opts = {...opts, openTabIndex: 1};
    }

    super.updateView(data, opts);

    // Configure landing form
    this.landingForm.showLocation = false;
    this.landingForm.showDateTime = false;
    this.landingForm.showObservers = false;
  }

  async save(event?: Event, options?: any): Promise<boolean> {
    return super.save(event, options);
  }

  async openHelpModal(event?: UIEvent) {
    const modal = await this.modalCtrl.create({
      component: AppHelpModal,
      componentProps: {
        title: 'COMMON.BTN_SHOW_HELP',
        markdownContent: this.helpContent
      },
      keyboardClose: true,
      cssClass: 'modal-large'
    });

    // Open the modal
    await modal.present();

    // Wait until closed
    await modal.onDidDismiss();
  }

  protected async suggestTaxonGroups(value: any, options?: any): Promise<LoadResult<IReferentialRef>> {
    let levelId = this.$taxonGroupTypeId.getValue();
    if (isNil(levelId)) {
      console.debug('Waiting program taxon group type ids...');
      levelId = await firstNotNilPromise(this.$taxonGroupTypeId);
    }
    return this.referentialRefService.suggest(value,
      {
        entityName: 'TaxonGroup',
        levelId,
        searchAttribute: options && options.searchAttribute,
        excludedIds: (this.$taxonGroups.getValue() || []).map(tg => tg && tg.id).filter(isNotNil)
      });
  }

  /* -- protected method -- */

  protected async setValue(data: Landing): Promise<void> {
    await super.setValue(data);

    if (isNotEmptyArray(data.samples)) {
      let taxonGroup = isNotEmptyArray(data.samples) && data.samples[0].taxonGroup || null;
      taxonGroup = taxonGroup && data.samples.findIndex(s => !ReferentialUtils.equals(taxonGroup, s.taxonGroup)) === -1
        && taxonGroup || null;
      this.taxonGroupControl.setValue(taxonGroup);
    }
  }

  protected async getValue(): Promise<Landing> {
    const data = await super.getValue();

    if (this.showSamplesTable && data.samples) {
      const taxonGroup = this.taxonGroupControl.value;
      // Apply the selected taxon group, if any
      if (ReferentialUtils.isNotEmpty(taxonGroup)) {
        (data.samples || []).forEach(sample => sample.taxonGroup = taxonGroup);
      }
    }
    // Reset samples, if no taxon group
    else {
      data.samples = [];
    }

    return data;
  }

  protected async computeTitle(data: Landing): Promise<string> {
    const titlePrefix = this.parent && (this.parent instanceof ObservedLocation) &&
      await this.translate.get('AUCTION_CONTROL.TITLE_PREFIX', {
        location: (this.parent.location && (this.parent.location.name || this.parent.location.label)),
        date: this.parent.startDateTime && this.dateFormat.transform(this.parent.startDateTime) as string || ''
      }).toPromise() || '';

    // new data
    if (!data || (isNil(data.id) && ReferentialUtils.isEmpty(data.vesselSnapshot))) {
      return titlePrefix + (await this.translate.get('AUCTION_CONTROL.NEW.TITLE').toPromise());
    }

    // Existing data
    return titlePrefix + (await this.translate.get('AUCTION_CONTROL.EDIT.TITLE', {
      vessel: data.vesselSnapshot && (data.vesselSnapshot.exteriorMarking || data.vesselSnapshot.name)
    }).toPromise());
  }

  protected async computePageHistory(title: string): Promise<HistoryPageReference> {
    return {
      ... (await super.computePageHistory(title)),
      icon: 'flag'
    };
  }

  protected computePageUrl(id: number|'new') {
    const parentUrl = this.getParentPageUrl();
    return `${parentUrl}/control/${id}`;
  }

  protected computeSampleRowValidator(form: FormGroup, pmfms: IPmfm[]): Subscription {
    return AuctionControlValidators.addSampleValidators(form, pmfms, {markForCheck: () => this.markForCheck()});
  }

  protected getFirstInvalidTabIndex(): number {
    return this.landingForm.invalid && !this.landingForm.measurementValuesForm.invalid ? 0 : (
      (this.samplesTable.invalid || this.landingForm.measurementValuesForm.invalid) ? 1 : -1);
  }

}
