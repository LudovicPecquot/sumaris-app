import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppReferentialModule } from '@app/referential/referential.module';
import { ConfigurationPage } from './configuration.page';
import { AdminModule } from '@sumaris-net/ngx-components';
import { AppCoreModule } from '@app/core/core.module';
import { AppSocialModule } from '@app/social/social.module';
import { AppSoftwareModule } from '@app/referential/software/software.module';
import { AppJobAdminModule } from '@app/admin/job/job-list.module';

@NgModule({
  imports: [
    CommonModule,
    AdminModule,

    // App modules
    AppCoreModule,
    AppSocialModule,
    AppReferentialModule,
    AppSoftwareModule,
    AppJobAdminModule,
  ],
  declarations: [ConfigurationPage],
  exports: [ConfigurationPage],
})
export class AppConfigurationModule {}
