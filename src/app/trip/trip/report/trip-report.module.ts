import { NgModule } from '@angular/core';
import { AppCoreModule } from '@app/core/core.module';
import { AppSharedReportModule } from '@app/shared/report/report.module';
import { TripReport } from './trip.report';


@NgModule({
  declarations: [
    TripReport,
  ],
  imports: [
    AppCoreModule,
    AppSharedReportModule,
  ],
  exports: [
    TripReport,
  ],
})
export class TripReportModule { }