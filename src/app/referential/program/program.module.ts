import { NgModule } from '@angular/core';
import { ProgramPage } from './program.page';
import { TranslateModule } from '@ngx-translate/core';

import { CommonModule } from '@angular/common';
import { ProgramsPage } from './programs.page';
import { AppCoreModule } from '@app/core/core.module';
import { PersonPrivilegesTable } from './privilege/person-privileges.table';
import { AppReferentialFormModule } from '@app/referential/form/referential-form.module';
import { AppReferentialPipesModule } from '@app/referential/pipes/referential-pipes.module';
import { AppStrategyModule } from '@app/referential/strategy/strategy.module';
import { AppReferentialTableModule } from '@app/referential/table/referential-table.module';
import { SelectProgramModal } from '@app/referential/program/select-program.modal';
import { AppSharedModule } from '@app/shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    TranslateModule.forChild(),

    AppSharedModule,
    AppCoreModule,

    // Sub modules
    AppReferentialFormModule,
    AppReferentialTableModule,
    AppReferentialPipesModule,
    AppStrategyModule,
  ],
  declarations: [
    // Components
    ProgramsPage,
    ProgramPage,
    PersonPrivilegesTable,
    SelectProgramModal,
  ],
  exports: [
    TranslateModule,

    // Components
    ProgramsPage,
    ProgramPage,
    PersonPrivilegesTable,
    SelectProgramModal,
  ],
})
export class AppProgramModule {}
