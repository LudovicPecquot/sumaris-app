import {NgModule} from "@angular/core";
import {RouterModule, Routes} from "@angular/router";
import {CommonModule} from "@angular/common";
import {CoreModule}  from "@sumaris-net/ngx-components";
import {SharedModule} from "@sumaris-net/ngx-components";
import {TranslateModule} from "@ngx-translate/core";
import {TestingPage} from "@sumaris-net/ngx-components";
import { AppReferentialModule } from "./app-referential.module";
import { PmfmStrategiesTableTestPage } from "./strategy/sampling/testing/pmfm-strategies.table.test";

export const REFERENTIAL_TESTING_PAGES = [
  <TestingPage>{label: 'Pmfm Strategies Table', page: '/testing/referential/pmfmStrategiesTable'}
];

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'pmfmStrategiesTable'
  },
  {
    path: 'pmfmStrategiesTable',
    pathMatch: 'full',
    component: PmfmStrategiesTableTestPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    CoreModule,
    TranslateModule.forChild(),
    RouterModule.forChild(routes),
    AppReferentialModule,
  ],
  declarations: [
    PmfmStrategiesTableTestPage
  ],
  exports: [
    PmfmStrategiesTableTestPage
  ]
})
export class ReferentialTestingModule {

}
