import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppReferentialModule } from '../../referential/referential.module';
import { ConfigurationPage } from './configuration.page';
import { AdminModule } from '@sumaris-net/ngx-components';
import { NgxJdenticonModule } from 'ngx-jdenticon';
import { AppCoreModule } from '@app/core/core.module';
import { AppSocialModule } from '@app/social/social.module';

@NgModule({
  imports: [
    CommonModule,
    AdminModule,
    NgxJdenticonModule,

    // App modules
    AppCoreModule,
    AppSocialModule,
    AppReferentialModule
  ],
  declarations: [
    ConfigurationPage
  ],
  exports: [
    ConfigurationPage
  ]
})
export class AppConfigurationModule {

}