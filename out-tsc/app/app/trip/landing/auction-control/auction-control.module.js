import { __decorate, __metadata } from "tslib";
import { NgModule } from '@angular/core';
import { AuctionControlPage } from './auction-control.page';
import { AppDataModule } from '@app/data/data.module';
import { TranslateModule } from '@ngx-translate/core';
import { VesselModule } from '@app/vessel/vessel.module';
import { AppReferentialModule } from '@app/referential/referential.module';
import { AppCoreModule } from '@app/core/core.module';
import { AppMeasurementModule } from '@app/data/measurement/measurement.module';
import { AppSampleModule } from '@app/trip/sample/sample.module';
import { AppLandingModule } from '@app/trip/landing/landing.module';
let AppAuctionControlModule = class AppAuctionControlModule {
    constructor() {
        console.debug('[auction-control] Creating module...');
    }
};
AppAuctionControlModule = __decorate([
    NgModule({
        imports: [
            AppCoreModule,
            AppDataModule,
            TranslateModule.forChild(),
            // Functional modules
            VesselModule,
            AppReferentialModule,
            AppMeasurementModule,
            AppSampleModule,
            AppLandingModule,
        ],
        declarations: [
            AuctionControlPage,
        ],
        exports: [
            // Components
            AuctionControlPage,
        ]
    }),
    __metadata("design:paramtypes", [])
], AppAuctionControlModule);
export { AppAuctionControlModule };
//# sourceMappingURL=auction-control.module.js.map