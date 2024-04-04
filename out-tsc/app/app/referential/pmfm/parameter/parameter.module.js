import { __decorate } from "tslib";
import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { AppCoreModule } from '@app/core/core.module';
import { AppReferentialFormModule } from '@app/referential/form/referential-form.module';
import { AppReferentialPipesModule } from '@app/referential/pipes/referential-pipes.module';
import { AppReferentialTableModule } from '@app/referential/table/referential-table.module';
import { ParameterPage } from '@app/referential/pmfm/parameter/parameter.page';
let AppPmfmParameterModule = class AppPmfmParameterModule {
};
AppPmfmParameterModule = __decorate([
    NgModule({
        imports: [
            CommonModule,
            TranslateModule.forChild(),
            // App modules
            AppCoreModule,
            AppReferentialFormModule,
            AppReferentialPipesModule,
            AppReferentialTableModule
        ],
        declarations: [
            // Components
            ParameterPage
        ],
        exports: [
            TranslateModule,
            // Components
            ParameterPage
        ],
    })
], AppPmfmParameterModule);
export { AppPmfmParameterModule };
//# sourceMappingURL=parameter.module.js.map