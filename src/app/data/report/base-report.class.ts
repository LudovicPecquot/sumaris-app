import { AfterViewInit, ChangeDetectorRef, Directive, Injector, Input, OnDestroy, OnInit, Optional, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProgramRefService } from '@app/referential/services/program-ref.service';
import { IRevealExtendedOptions, RevealComponent } from '@app/shared/report/reveal/reveal.component';
import { environment } from '@environments/environment';
import { TranslateService } from '@ngx-translate/core';
import {
  AppErrorWithDetails,
  DateFormatService,
  firstFalsePromise, isNil,
  isNotNil,
  isNotNilOrBlank, isNumber,
  LatLongPattern,
  LocalSettingsService,
  PlatformService,
  WaitForOptions
} from '@sumaris-net/ngx-components';
import { BehaviorSubject, Subject } from 'rxjs';
import { ModalController } from '@ionic/angular';

export interface BaseReportOptions {
  pathIdAttribute?: string;
  pathParentIdAttribute?: string;
}

@Directive()
export abstract class AppBaseReport<
  T = any,
  ID = number,
  S = any>
  implements OnInit, AfterViewInit, OnDestroy {

  protected readonly route: ActivatedRoute;
  protected readonly cd: ChangeDetectorRef;
  protected readonly dateFormat: DateFormatService;
  protected readonly settings: LocalSettingsService;
  protected readonly modalCtrl: ModalController;

  protected readonly platform: PlatformService;
  protected readonly translate: TranslateService;
  protected readonly programRefService: ProgramRefService;

  protected readonly destroySubject = new Subject();
  protected readonly readySubject = new BehaviorSubject<boolean>(false);
  protected readonly loadingSubject = new BehaviorSubject<boolean>(true);

  protected _autoLoad = true;
  protected _autoLoadDelay = 0;
  protected _pathIdAttribute: string;
  protected _pathParentIdAttribute: string;

  error: string;
  revealOptions: Partial<IRevealExtendedOptions>;
  // NOTE: Interface for this ?
  i18nContext = {
    prefix: '',
    suffix: '',
  }

  $defaultBackHref = new Subject<string>();
  $title = new Subject<string>();

  @Input() modal: boolean;
  @Input() showError = true;
  @Input() showToolbar = true;
  @Input() debug = !environment.production;

  @Input() data: T;
  @Input() stats: S = <S>{};

  @ViewChild('reveal', {read: RevealComponent, static: false}) protected reveal: RevealComponent;

  get loaded(): boolean { return !this.loadingSubject.value; }

  get modalName(): string {
    return this.constructor.name;
  }

  get latLongFormat(): LatLongPattern{
    return this.settings?.latLongFormat;
  }

  protected constructor(
    injector: Injector,
    @Optional() options?: BaseReportOptions,
  ) {
    console.debug(`[${this.constructor.name}.constructor]`, arguments);

    this.cd = injector.get(ChangeDetectorRef);
    this.route = injector.get(ActivatedRoute);
    this.dateFormat = injector.get(DateFormatService);
    this.settings = injector.get(LocalSettingsService);
    this.modalCtrl = injector.get(ModalController);

    this.platform = injector.get(PlatformService);
    this.translate = injector.get(TranslateService);
    this.programRefService = injector.get(ProgramRefService);

    this._pathParentIdAttribute = options?.pathParentIdAttribute;
    // NOTE: In route.snapshot data is optional. On which case it may be not set ???
    this._pathIdAttribute = this.route.snapshot.data?.pathIdParam || options?.pathIdAttribute || 'id';
  }

  async ngOnInit() {
    this.modal = isNotNil(this.modal) ? this.modal : !!(await this.modalCtrl.getTop());
  }

  ngAfterViewInit() {
    console.debug(`[${this.constructor.name}.ngAfterViewInit]`);
    if (this._autoLoad) {
      setTimeout(() => this.start(), this._autoLoadDelay);
    }
  }

  ngOnDestroy() {
    console.debug(`[${this.constructor.name}.ngOnDestroy]`);
    this.destroySubject.next();
  }

  async start(opts?: any) {
    console.debug(`[${this.constructor.name}.start]`);
    await this.platform.ready();
    try {
      // Load data
      this.data = await this.ngOnStart(opts);

      this.$defaultBackHref.next(this.computeDefaultBackHref(this.data, this.stats));
      this.$title.next(await this.computeTitle(this.data, this.stats));
      this.revealOptions = this.computeSlidesOptions(this.data, this.stats);

      this.markAsLoaded();

      // Update the view: initialise reveal
      await this.updateView();

    } catch (err) {
      console.error(err);
      this.setError(err);
    }
  };

  async reload(opts?: any) {
    if (!this.loaded) return; // skip

    console.debug(`[${this.constructor.name}.reload]`);
    this.markAsLoading();
    return this.start(opts);
  }

  cancel() {
    if (this.modal) {
      this.modalCtrl.dismiss();
    }
  }

  protected abstract ngOnStart(opts: any): Promise<T>;

  // NOTE : Can have parent. Can take param from interface ?
  protected abstract computeTitle(data: T, stats: S): Promise<string>;

  // NOTE : Can have parent. Can take param from interface ?
  protected abstract computeDefaultBackHref(data: T, stats: S): string;

  protected abstract computePrintHref(data: T, stats: S): string;

  protected getIdFromPathIdAttribute<ID>(pathIdAttribute: string): ID {
    const route = this.route.snapshot;
    const id = route.params[pathIdAttribute] as ID;
    if (isNotNil(id)) {
      if (typeof id === 'string' && isNumber(id)) {
        return (+id) as any as ID;
      }
      return id;
    }
    return undefined;
  }

  protected computeSlidesOptions(data: T, stats: S): Partial<IRevealExtendedOptions> {
    console.debug(`[${this.constructor.name}.computeSlidesOptions]`);
    const mobile = this.settings.mobile;
    return {
      // Custom reveal options
      autoInitialize: false,
      autoPrint: false,
      // Reveal options
      pdfMaxPagesPerSlide: 1,
      disableLayout: mobile,
      touch: mobile,
      printHref: this.computePrintHref(this.data, this.stats)
    };
  }

  async updateView() {
    console.debug(`[${this.constructor.name}.updateView]`);

    this.cd.detectChanges();
    await this.reveal.initialize();
  }

  markAsReady() {
    console.debug(`[${this.constructor.name}.markAsReady]`, arguments);
    if (!this.readySubject.value) {
      this.readySubject.next(true);
    }
  }

  protected markForCheck() {
    console.debug(`[${this.constructor.name}.markForCheck]`);
    this.cd.markForCheck();
  }

  protected markAsLoading() {
    console.debug(`[${this.constructor.name}.markAsLoading]`);
    if (!this.loadingSubject.value) {
      this.loadingSubject.next(true);
    }
  }

  protected markAsLoaded() {
    console.debug(`[${this.constructor.name}.markAsLoaded]`);
    if (this.loadingSubject.value) {
      this.loadingSubject.next(false);
    }
  }

  protected async waitIdle(opts: WaitForOptions) {
    console.debug(`[${this.constructor.name}.waitIdle]`);
    if (this.loaded) return;
    await firstFalsePromise(this.loadingSubject, { stop: this.destroySubject, ...opts });
  }

  setError(err: string | AppErrorWithDetails, opts?: {
    detailsCssClass?: string;
    emitEvent?: boolean;
  }) {
    if (!err) {
      this.error = undefined;
    } else if (typeof err === 'string') {
      this.error = err as string;
    } else {
      // NOTE: Case when `|| err` is possible ?
      let userMessage: string = err.message && this.translate.instant(err.message) || err;
      // NOTE: replace || by && ???
      const detailMessage: string = (!err.details || typeof (err.message) === 'string')
        ? err.details as string
        : err.details.message;
      // NOTE: !isNotNilOrBlank ??? (invert the test)
      if (isNotNilOrBlank(detailMessage)) {
        const cssClass = opts?.detailsCssClass || 'hidden-xs hidden-sm';
        userMessage += `<br/><small class="${cssClass}" title="${detailMessage}">`;
        userMessage += detailMessage.length < 70
          ? detailMessage
          : detailMessage.substring(0, 67) + '...';
        userMessage += '</small>';
      }
      this.error = userMessage;
      if (!opts || opts.emitEvent !== false) this.markForCheck();
    }
  }
}