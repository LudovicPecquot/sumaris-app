import { NgModule } from '@angular/core';
import { ObservedLocationReport } from './observed-location.report';
import { AppCoreModule } from '@app/core/core.module';
import { AppDataModule } from '@app/data/data.module';
import { AppReferentialModule } from '@app/referential/referential.module';
import { AppSharedReportModule } from '@app/shared/report/report.module';
import { AppAuctionControlModule } from '@app/trip/landing/auctioncontrol/auction-control.module';
import { AppSamplingLandingModule } from '@app/trip/landing/sampling/sampling-landing.module';
import { TranslateModule } from '@ngx-translate/core';
import { AppLandingReportModule } from '@app/trip/landing/report/landing.report.module';

@NgModule({
  declarations: [
    ObservedLocationReport
  ],
  imports: [
    AppCoreModule,
    AppReferentialModule,
    AppDataModule,
    TranslateModule.forChild(),
    AppSharedReportModule,
    AppAuctionControlModule,
    AppSamplingLandingModule,
    AppLandingReportModule,
  ],
  exports: [
    ObservedLocationReport
  ],
})
export class AppObservedLocationReportModule { }
