import {Injectable, Pipe, PipeTransform} from '@angular/core';
import {MethodIds} from '../services/model/model.enum';
import {PmfmValueUtils} from '../services/model/pmfm-value.model';
import {IPmfm, PmfmUtils} from '../services/model/pmfm.model';
import { DateFormatPipe, isNotNilOrBlank, LatitudeFormatPipe, LocalSettingsService, LongitudeFormatPipe, PlatformService, TranslateContextService } from '@sumaris-net/ngx-components';
import {TranslateService} from '@ngx-translate/core';

@Pipe({
    name: 'pmfmName'
})
@Injectable({providedIn: 'root'})
export class PmfmNamePipe implements PipeTransform {

  constructor(
    protected translate: TranslateService,
    protected translateContext: TranslateContextService
  ) {

  }

  transform(pmfm: IPmfm, opts?: {
    withUnit?: boolean;
    html?: boolean;
    withDetails?: boolean;
    i18nPrefix?: string;
    i18nContext?: string;
  }): string {
    if (!pmfm) return '';
    // Try to resolve PMFM using prefix + label
    if (opts && isNotNilOrBlank(opts.i18nPrefix)) {
      const i18nKey = opts.i18nPrefix + pmfm.label;

      // I18n translation WITH context, if any
      if (opts && opts.i18nContext) {
        const contextualTranslation = this.translateContext.instant(i18nKey, opts.i18nContext);
        if (contextualTranslation !== i18nKey) return contextualTranslation;
      }

      // I18n translation without context
      const translation = this.translate.instant(i18nKey);
      if (translation !== i18nKey) return translation;
    }

    // Default name, computed from the PMFM object
    return PmfmUtils.getPmfmName(pmfm, opts);
  }
}

@Pipe({
  name: 'pmfmValue'
})
@Injectable({providedIn: 'root'})
export class PmfmValuePipe implements PipeTransform {

  constructor(
    private dateFormatPipe: DateFormatPipe,
    private latFormatPipe: LatitudeFormatPipe,
    private longFormatPipe: LongitudeFormatPipe,
    private settings: LocalSettingsService
  ) {
  }

  transform(value: any, opts: { pmfm: IPmfm; propertyNames?: string[]; html?: boolean; hideIfDefaultValue?: boolean; showLabelForPmfmIds?: number[] }): any {
    const type = PmfmUtils.getExtendedType(opts?.pmfm);
    switch (type) {
      case 'date':
        return this.dateFormatPipe.transform(value, {time: false});
      case 'dateTime':
        return this.dateFormatPipe.transform(value, {time: true});
      case 'duration':
        return value || null;
      case 'latitude':
        return this.latFormatPipe.transform(value, {pattern: this.settings.latLongFormat, placeholderChar: '0'});
      case 'longitude':
        return this.longFormatPipe.transform(value, {pattern: this.settings.latLongFormat, placeholderChar: '0'});
      default:
        return PmfmValueUtils.valueToString(value, opts);
    }
  }
}

@Pipe({
  name: 'isDatePmfm'
})
@Injectable({providedIn: 'root'})
export class IsDatePmfmPipe implements PipeTransform {

  transform(pmfm: IPmfm): any {
    return pmfm && pmfm.type === 'date';
  }
}

@Pipe({
  name: 'isComputedPmfm'
})
@Injectable({providedIn: 'root'})
export class IsComputedPmfmPipe implements PipeTransform {

  transform(pmfm: IPmfm): any {
    // DEBUG
    //if (isNil(pmfm && pmfm.methodId)) console.warn('TODO cannot check if computed - no method :', pmfm.name);

    return pmfm.type && (pmfm.methodId === MethodIds.CALCULATED);
  }
}


@Pipe({
  name: 'isMultiplePmfm'
})
@Injectable({providedIn: 'root'})
export class IsMultiplePmfmPipe implements PipeTransform {

  transform(pmfm: IPmfm): any {
    return pmfm && pmfm.isMultiple;
  }
}

@Pipe({
  name: 'pmfmFieldStyle'
})
@Injectable({providedIn: 'root'})
export class PmfmFieldStylePipe implements PipeTransform {

  private readonly _mobile: boolean;

  constructor(settings: LocalSettingsService) {
    this._mobile = settings.mobile;
  }

  transform(pmfm: IPmfm, maxVisibleButtons?: number): any {
    return pmfm && this._mobile && (
      pmfm.type === 'boolean'
      || (pmfm.isQualitative && pmfm.qualitativeValues?.length <= (maxVisibleButtons || 3))
    ) ? 'button' : undefined /*default*/;
  }
}
