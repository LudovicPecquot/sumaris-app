import { Entity, IModalDetailOptions, UsageMode } from '@sumaris-net/ngx-components';
import { Observable } from 'rxjs';
import { IPmfm } from '@app/referential/services/model/pmfm.model';

export interface IDataEntityModalOptions<T extends Entity<T>> extends IModalDetailOptions<T> {
  // Program (or PMFMs, to avoid loading PMFMs by program)
  programLabel: string;
  acquisitionLevel: string;
  pmfms: Observable<IPmfm[]> | IPmfm[];

  // UI options
  usageMode: UsageMode;
}
