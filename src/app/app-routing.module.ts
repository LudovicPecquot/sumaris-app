import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {AccountPage, HomePage} from '@sumaris-net/ngx-components';
import {SettingsPage}  from "@sumaris-net/ngx-components";
import {AuthGuardService}  from "@sumaris-net/ngx-components";
import {SHARED_ROUTE_OPTIONS, SharedRoutingModule} from "@sumaris-net/ngx-components";
import {RegisterConfirmPage}  from '@sumaris-net/ngx-components';

const routes: Routes = [
  // Core path
  {
    path: '',
    component: HomePage
  },

  {
    path: 'home/:action',
    component: HomePage
  },
  {
    path: 'confirm/:email/:code',
    component: RegisterConfirmPage
  },
  {
    path: 'account',
    pathMatch: 'full',
    component: AccountPage,
    canActivate: [AuthGuardService]
  },
  {
    path: 'settings',
    pathMatch: 'full',
    component: SettingsPage
  },

  // Admin
  {
    path: 'admin',
    canActivate: [AuthGuardService],
    loadChildren: () => import('./admin/admin-routing.module').then(m => m.AppAdminRoutingModule)
  },

  // Referential
  {
    path: 'referential',
    canActivate: [AuthGuardService],
    loadChildren: () => import('./referential/referential-routing.module').then(m => m.ReferentialRoutingModule)
  },

  // Vessel
  {
    path: 'vessels',
    canActivate: [AuthGuardService],
    loadChildren: () => import('./vessel/vessel-routing.module').then(m => m.VesselRoutingModule)
  },

  // Trips
  {
    path: 'trips',
    canActivate: [AuthGuardService],
    data: {
      profile: 'USER'
    },
    loadChildren: () => import('./trip/trip-routing.module').then(m => m.TripRoutingModule)
  },

  // Observations
  {
    path: 'observations',
    canActivate: [AuthGuardService],
    data: {
      profile: 'USER'
    },
    loadChildren: () => import('./trip/landed-trip-routing.module').then(m => m.LandedTripRoutingModule)
  },

  // Extraction path
  {
    path: 'extraction',
    canActivate: [AuthGuardService],
    data: {
      profile: 'GUEST'
    },
    loadChildren: () => import('./extraction/extraction-routing.module').then(m => m.AppExtractionRoutingModule)
  },

  // Test module (disable in menu, by default - can be enable by the Pod configuration page)
  {
    path: 'testing',
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'shared',
      },
      // Shared module
      {
        path: 'shared',
        loadChildren: () => import('@sumaris-net/ngx-components').then(m => m.SharedTestingModule)
      },
      // Trip module
      {
        path: 'trip',
        loadChildren: () => import('./trip/trip.testing.module').then(m => m.TripTestingModule)
      },
      // Referential module
      {
        path: 'referential',
        loadChildren: () => import('./referential/referential.testing.module').then(m => m.ReferentialTestingModule)
      }
    ]
  },

  // Other route redirection (should at the end of the array)
  {
    path: "**",
    redirectTo: '/'
  }
];


@NgModule({
  imports: [
    SharedRoutingModule,
    RouterModule.forRoot(routes, SHARED_ROUTE_OPTIONS)
  ],
  exports: [
    RouterModule
  ]
})
export class AppRoutingModule {
}
