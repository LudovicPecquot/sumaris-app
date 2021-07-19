import {ModuleWithProviders, NgModule} from '@angular/core';
import {IonicStorageModule} from '@ionic/storage';
import {HttpClientModule} from '@angular/common/http';
import {CacheModule} from 'ionic-cache';
import {AppGraphQLModule, CoreModule} from '@sumaris-net/ngx-components';
import {AppSharedModule} from '@app/shared/shared.module';

@NgModule({
  imports: [
    CoreModule,
    HttpClientModule,
    CacheModule,
    IonicStorageModule,

    // App modules
    AppSharedModule,
    AppGraphQLModule
  ],
  declarations: [
  ],
  exports: [
    CoreModule,
    AppSharedModule
  ]
})
export class AppCoreModule {

  static forRoot(): ModuleWithProviders<AppCoreModule> {

    return {
      ngModule: AppCoreModule,
      providers: [
        ...CoreModule.forRoot().providers
      ]
    };
  }
}
