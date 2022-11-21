import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output, Self} from '@angular/core';
import {APP_IMAGE_ATTACHMENT_SERVICE} from './image-attachment.service';
import {ImageAttachment, ImageAttachmentFilter} from './image-attachment.model';
import {BehaviorSubject, of, Subscription} from 'rxjs';
import {ModalController} from '@ionic/angular';
import {EntitiesTableDataSource, EntityUtils, GalleryMode, Image, InMemoryEntitiesService, LocalSettingsService, toBoolean} from '@sumaris-net/ngx-components';
import {TableDataSource, TableElement} from '@e-is/ngx-material-table';
import {startWith, switchMap} from 'rxjs/operators';
import {environment} from '@environments/environment';

@Component({
  selector: 'app-image-attachment-gallery',
  templateUrl: './image-attachment-gallery.component.html',
  styleUrls: ['./image-attachment-gallery.component.scss'],
  providers: [
    {
      provide: APP_IMAGE_ATTACHMENT_SERVICE,
      useFactory: () => new InMemoryEntitiesService(ImageAttachment, ImageAttachmentFilter, {
        equals: EntityUtils.equals
      })
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppImageAttachmentGallery implements OnInit, OnDestroy {

  private readonly debug: boolean;
  private readonly _subscription = new Subscription();
  protected readonly dataSource = new EntitiesTableDataSource<ImageAttachment, ImageAttachmentFilter>(ImageAttachment, this.dataService, null, {
    prependNewElements: false
  });

  readySubject = new BehaviorSubject<boolean>(false);
  dirtySubject = new BehaviorSubject<boolean>(false);

  @Input() mobile: boolean;
  @Input() mode: GalleryMode;
  @Input() disabled: boolean = false;
  @Input() readOnly: boolean = false;
  @Input() showToolbar: boolean;
  @Input() showFabButton: boolean;
  @Input() showAddCardButton: boolean;
  @Input() autoLoad = true;

  @Input()
  set value(value: ImageAttachment[]) {
    // DEBUG
    console.debug('[image-gallery] Setting value', value);
    this.dataService.setValue(value);
  }

  get value(): ImageAttachment[] {
    return (this.dataService.value || []).map(ImageAttachment.fromObject);
  }

  get galleryDataSource(): TableDataSource<Image> {
    return this.dataSource as TableDataSource<Image>;
  }

  get enabled() {
    return !this.disabled;
  }

  get dirty(): boolean {
    return this.dataService.dirty || this.dirtySubject.value;
  }

  enable(opts?: {emitEvent?: boolean}) {
    if (this.disabled) {
      this.disabled = false;
      this.markForCheck();
    }
  }

  disable(opts?: {emitEvent?: boolean}) {
    if (!this.disabled) {
      this.disabled = true;
      this.markForCheck();
    }
  }

  markAsReady() {
    if (!this.readySubject.value) {
      this.readySubject.next(true);
    }
  }

  markAsDirty() {
    if (!this.dirtySubject.value) {
      this.dirtySubject.next(true);
    }
  }

  markAsPristine() {
    if (this.dirtySubject.value) {
      this.dirtySubject.next(false);
    }
  }

  @Output() onRefresh = new EventEmitter<any>();

  constructor(
    protected modalCtrl: ModalController,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef,
    @Self() @Inject(APP_IMAGE_ATTACHMENT_SERVICE) protected dataService: InMemoryEntitiesService<ImageAttachment, ImageAttachmentFilter>
  ) {

    this.debug = !environment.production;
  }

  ngOnInit() {
    // Set defaults
    this.mobile = toBoolean(this.mobile, this.settings.mobile);
    this.showToolbar = toBoolean(this.showToolbar, !this.mobile);

    // Call datasource refresh, on each refresh events
    this._subscription.add(
      this.onRefresh
        .pipe(
          startWith<any, any>((this.autoLoad ? {} : 'skip') as any),
          switchMap(event => {
            if (event === 'skip') {
              return of(undefined);
            }
            if (this.debug) console.debug('[image-attachment-gallery] Calling dataSource.watchAll()...');
            return this.dataSource.watchAll(0,100, null, null, null);
          })
        ).subscribe()
    );
  }

  ngOnDestroy() {
    this._subscription.unsubscribe();
  }

  async onAfterAddRows(rows: TableElement<ImageAttachment>[]) {
    await this.save();
    this.markAsDirty();
  }

  save(): Promise<boolean> {
    return this.dataSource.save();
  }

  markForCheck() {
    this.cd.markForCheck();
  }
}