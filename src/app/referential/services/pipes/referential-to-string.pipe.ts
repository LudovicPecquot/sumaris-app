import {Injectable, Pipe, PipeTransform} from '@angular/core';
import {
  isArray,
  Referential,
  ReferentialRef,
  referentialsToString,
  referentialToString
} from '@sumaris-net/ngx-components';

@Pipe({
  name: 'referentialToString'
})
@Injectable({providedIn: 'root'})
export class ReferentialToStringPipe implements PipeTransform {

  constructor(
  ) {
  }

  transform(value: Referential | ReferentialRef | any, opts?: string[] | {properties?: string[]; separator?: string}): string {
    const properties = isArray(opts) ? opts : opts && opts.properties;
    if (value instanceof Array) return referentialsToString(value, properties, opts && opts['separator']);
    return referentialToString(value, properties);
  }
}
