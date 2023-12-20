import { __decorate } from "tslib";
import { NgModule } from '@angular/core';
import { LandingReport } from './landing.report';
import { AppCoreModule } from '@app/core/core.module';
import { AppDataModule } from '@app/data/data.module';
import { AppReferentialModule } from '@app/referential/referential.module';
import { AppSharedReportModule } from '@app/shared/report/report.module';
import { TranslateModule } from '@ngx-translate/core';
let LandingReportModule = class LandingReportModule {
};
LandingReportModule = __decorate([
    NgModule({
        declarations: [
            LandingReport,
        ],
        imports: [
            AppCoreModule,
            AppReferentialModule,
            AppDataModule,
            TranslateModule.forChild(),
            AppSharedReportModule,
        ],
        exports: [
            LandingReport,
        ],
    })
], LandingReportModule);
export { LandingReportModule };
//# sourceMappingURL=landing.report.module.js.map