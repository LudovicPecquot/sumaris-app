import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {AppReferentialModule} from '../referential/app-referential.module';
import {ConfigurationPage} from './config/configuration.page';
import {SocialModule} from '@sumaris-net/ngx-components';
import {NgxJdenticonModule} from 'ngx-jdenticon';
import {AppCoreModule} from '@app/core/core.module';

@NgModule({
  imports: [
    CommonModule,
    SocialModule,
    NgxJdenticonModule,

    // App modules
    AppCoreModule,
    AppReferentialModule
  ],
  declarations: [
    ConfigurationPage
  ],
  exports: [
    ConfigurationPage
  ]
})
export class AppAdminModule {

  constructor() {
    console.debug('[admin] Creating module');
  }
}
