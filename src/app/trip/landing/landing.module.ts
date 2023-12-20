import { NgModule } from '@angular/core';
import { LandingsTable } from './landings.table';
import { LandingPage } from './landing.page';
import { LandingForm } from './landing.form';
import { SelectLandingsModal } from './select-landings.modal';
import { AppDataModule } from '@app/data/data.module';
import { TranslateModule } from '@ngx-translate/core';
import { VesselModule } from '../../vessel/vessel.module';
import { AppReferentialModule } from '@app/referential/referential.module';
import { AppCoreModule } from '@app/core/core.module';
import { AppMeasurementModule } from '@app/data/measurement/measurement.module';
import { AppSampleModule } from '@app/trip/sample/sample.module';
import { LandingsPage } from '@app/trip/landing/landings.page';
import { AppObservedLocationOfflineModule } from '@app/trip/observedlocation/offline/observed-location-offline.module';
import { AppSelectObservedLocationsModalModule } from '@app/trip/observedlocation/select-modal/select-observed-locations.module';
import { AppBatchModule } from '@app/trip/batch/batch.module';

@NgModule({
  imports: [
    AppCoreModule,
    AppDataModule,
    VesselModule,
    AppReferentialModule,
    TranslateModule.forChild(),

    // Functional modules
    AppMeasurementModule,
    AppSampleModule,
    AppObservedLocationOfflineModule,
    AppSelectObservedLocationsModalModule,
    AppBatchModule,
  ],
  declarations: [LandingsTable, LandingForm, LandingPage, SelectLandingsModal, LandingsPage],
  exports: [
    // Components
    LandingsTable,
    LandingForm,
    LandingPage,
    SelectLandingsModal,
    LandingsPage,
  ],
})
export class AppLandingModule {
  constructor() {
    console.debug('[landing] Creating module...');
  }
}
