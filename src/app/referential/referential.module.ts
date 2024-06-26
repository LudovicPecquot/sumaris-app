import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { CommonModule } from '@angular/common';
import { AppCoreModule } from '@app/core/core.module';
import { AppStrategyModule } from '@app/referential/strategy/strategy.module';
import { AppTranscribingModule } from '@app/referential/transcribing/transcribing.module';
import { AppReferentialFormModule } from '@app/referential/form/referential-form.module';
import { AppReferentialPipesModule } from '@app/referential/pipes/referential-pipes.module';
import { AppProgramModule } from '@app/referential/program/program.module';
import { AppReferentialTableModule } from '@app/referential/table/referential-table.module';

@NgModule({
  imports: [
    CommonModule,
    TranslateModule.forChild(),

    AppCoreModule,

    // Sub modules
    AppReferentialFormModule,
    AppReferentialTableModule,
    AppReferentialPipesModule,
    AppProgramModule,
    AppStrategyModule,
    AppTranscribingModule,
  ],
  declarations: [],
  exports: [
    TranslateModule,

    // Sub Modules
    AppReferentialPipesModule,
    AppReferentialFormModule,
    AppReferentialTableModule,
    AppProgramModule,
    AppStrategyModule,
    AppTranscribingModule,
  ],
})
export class AppReferentialModule {}
