import {Pipe, Injectable, PipeTransform} from '@angular/core';
import {TranslateService} from "@ngx-translate/core";
import {toDuration} from "../dates";
import {isNilOrBlank, isNotNilOrBlank} from "../functions";

@Pipe({
  name: 'isNotNilOrBlank'
})
@Injectable({providedIn: 'root'})
export class IsNotNilOrBlankPipe implements PipeTransform {

  protected dayUnit: string;

  constructor(
    private translate: TranslateService
  ) {
    this.dayUnit = translate.instant('COMMON.DAY_UNIT');
  }

  transform(value: string): boolean {
    return isNotNilOrBlank(value);
  }
}

@Pipe({
  name: 'isNilOrBlank'
})
@Injectable({providedIn: 'root'})
export class IsNilOrBlankPipe implements PipeTransform {

  protected dayUnit: string;

  constructor(
    private translate: TranslateService
  ) {
    this.dayUnit = translate.instant('COMMON.DAY_UNIT');
  }

  transform(value: string): boolean {
    return isNilOrBlank(value);
  }
}
