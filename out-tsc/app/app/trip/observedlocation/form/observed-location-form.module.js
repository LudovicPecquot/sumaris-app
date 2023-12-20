import { __decorate } from "tslib";
import { NgModule } from '@angular/core';
import { AppCoreModule } from '@app/core/core.module';
import { TranslateModule } from '@ngx-translate/core';
import { ObservedLocationForm } from '@app/trip/observedlocation/form/observed-location.form';
import { AppPmfmFormFieldModule } from '@app/referential/pmfm/field/pmfm.form-field.module';
import { AppReferentialPipesModule } from '@app/referential/pipes/referential-pipes.module';
let AppObservedLocationFormModule = class AppObservedLocationFormModule {
};
AppObservedLocationFormModule = __decorate([
    NgModule({
        imports: [
            AppCoreModule,
            TranslateModule.forChild(),
            AppReferentialPipesModule,
            AppPmfmFormFieldModule
        ],
        declarations: [
            ObservedLocationForm,
        ],
        exports: [
            ObservedLocationForm,
        ]
    })
], AppObservedLocationFormModule);
export { AppObservedLocationFormModule };
//# sourceMappingURL=observed-location-form.module.js.map