import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DevicePositionMapPage } from '@app/extraction/position/device-position-map-page.component';
import { AuthGuardService } from '@sumaris-net/ngx-components';
import { DevicePositionModule } from '@app/extraction/position/device-position.module';

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: DevicePositionMapPage,
    canActivate: [AuthGuardService],
    data: {
      profile: 'ADMIN',
    },
  },
];

@NgModule({
  imports: [
    DevicePositionModule,
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule]
})
export class DevicePositionRoutingModule { }
