import { Directive, ElementRef, EventEmitter, OnDestroy, OnInit, Optional, Output } from '@angular/core';
import { RevealComponent } from '@app/shared/report/reveal/reveal.component';
import { filter, first, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

@Directive({
  selector: 'section',
})
export class RevealSectionDirective implements OnInit, OnDestroy {
  private logPrefix = 'reveal-section-directive';
  private _destroySubject = new Subject<void>();

  @Output() entered = new EventEmitter<{ currentSlide: HTMLElement }>();

  constructor(
    private readonly _elementRef: ElementRef,
    @Optional() private readonly _reveal: RevealComponent
  ) {}

  ngOnInit() {
    // DEBUG
    // console.debug(`[${this.logPrefix} ngOnInit]`, arguments);

    if (this._reveal) {
      this.startWorkflow(this._reveal);
    }
  }

  ngOnDestroy() {
    this._destroySubject.next();
  }

  private async startWorkflow(reveal: RevealComponent) {
    await reveal.waitIdle({ stop: this._destroySubject, stopError: false });

    // First, check classList, in case current section is the first visible
    if (this._elementRef.nativeElement.classList.contains('present' /*reveal current section style*/)) {
      this.entered.emit({ currentSlide: this._elementRef.nativeElement });
    } else {
      reveal.slideChanged
        .pipe(
          filter((event) => event.currentSlide === this._elementRef.nativeElement),
          first(),
          takeUntil(this._destroySubject)
        )
        .subscribe((event) => this.entered.emit(event));
    }
  }
}
