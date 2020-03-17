import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {CoreModule} from '../core/core.module';
import {TripTable} from './trip/trips.table';
import {TripPage} from './trip/trip.page';
import {TripForm} from './trip/trip.form';
import {SaleForm} from './sale/sale.form';
import {OperationForm} from './operation/operation.form';
import {OperationPage} from './operation/operation.page';
import {MeasurementsForm} from './measurement/measurements.form.component';
import {MeasurementQVFormField} from './measurement/measurement-qv.form-field.component';
import {MeasurementFormField} from './measurement/measurement.form-field.component';
import {CatchBatchForm} from './catch/catch.form';
import {PhysicalGearForm} from './physicalgear/physicalgear.form';
import {PhysicalGearTable} from './physicalgear/physicalgears.table';
import {OperationTable} from './operation/operations.table';
import {SamplesTable} from './sample/samples.table';
import {SubSamplesTable} from './sample/sub-samples.table';
import {BatchGroupsTable} from './batch/batch-groups.table';
import {BatchesTable} from './batch/batches.table';
import {SubBatchesTable} from './batch/sub-batches.table';
import {IndividualMonitoringSubSamplesTable} from './sample/individualmonitoring/individual-monitoring-samples.table';
import {MeasurementValuesForm} from './measurement/measurement-values.form.class';
import {EntityQualityFormComponent} from "./quality/entity-quality-form.component";

import {TripService} from './services/trip.service';
import {LandingService} from './services/landing.service';
import {OperationService} from './services/operation.service';

import {
  BatchGroupValidatorService,
  BatchValidatorService,
  MeasurementsValidatorService,
  OperationValidatorService,
  PhysicalGearValidatorService,
  PositionValidatorService,
  SaleValidatorService,
  SampleValidatorService,
  SubBatchValidatorService,
  SubSampleValidatorService,
  TripValidatorService
} from './services/trip.validators';
import {ObservedLocationForm} from "./observedlocation/observed-location.form";
import {ObservedLocationPage} from "./observedlocation/observed-location.page";
import {ObservedLocationsPage} from "./observedlocation/observed-locations.page";
import {ObservedLocationService} from "./services/observed-location.service";
import {ObservedLocationValidatorService} from "./services/observed-location.validator";
import {LandingsTable} from "./landing/landings.table";
import {SaleService} from "./services/sale.service";
import {LeafletModule} from "@asymmetrik/ngx-leaflet";
import {LandingValidatorService} from "./services/landing.validator";
import {LandingPage} from "./landing/landing.page";
import {LandingForm} from "./landing/landing.form";
import {SelectLandingsModal} from "./landing/select-landings.modal";
import {AuctionControlPage} from "./auctioncontrol/auction-control.page";
import {SubBatchesModal} from "./batch/sub-batches.modal";
import {SubBatchForm} from "./batch/sub-batch.form";
import {PhysicalGearModal} from "./physicalgear/physicalgear.modal";
import {BatchModal} from "./batch/batch.modal";
import {BatchForm} from "./batch/batch.form";
import {SpeciesBatchValidatorService} from "./services/validator/species-batch.validator";
import {BatchGroupPage} from "./batch/batch-group.page";
import {BatchGroupForm} from "./batch/batch-group.form";
import {BatchGroupModal} from "./batch/batch-group.modal";
import {SubBatchModal} from "./batch/sub-batch.modal";
import {FullscreenOverlayContainer, OverlayContainer} from "@angular/cdk/overlay";
import {AggregationTypeValidatorService} from "./services/validator/aggregation-type.validator";
import {ReferentialModule} from "../referential/referential.module";
import {SampleForm} from "./sample/sample.form";
import {SampleModal} from "./sample/sample.modal";
import {SelectVesselsModal} from "./observedlocation/vessels/select-vessel.modal";
import {LandedTripPage} from "./landedtrip/landed-trip.page";
import {OperationGroupTable} from "./operationgroup/operation-groups.table";
import {OperationGroupForm} from "./operationgroup/operation-group.form";
import {OperationGroupPage} from "./operationgroup/operation-group.page";
import {OperationGroupService} from "./services/operation-group.service";
import {OperationGroupValidatorService} from "./services/operation-group.validator";

export { TripTable, TripPage, MeasurementValuesForm, SaleForm, MeasurementsForm, EntityQualityFormComponent };

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    LeafletModule,
    ReferentialModule
  ],
  declarations: [
    TripTable,
    TripPage,
    TripForm,
    PhysicalGearModal,
    SaleForm,
    PhysicalGearForm,
    PhysicalGearTable,
    OperationForm,
    OperationPage,
    OperationTable,
    ObservedLocationForm,
    ObservedLocationPage,
    ObservedLocationsPage,
    MeasurementsForm,
    MeasurementQVFormField,
    MeasurementFormField,
    CatchBatchForm,
    LandingsTable,
    LandingPage,
    LandingForm,
    SelectLandingsModal,
    SamplesTable,
    SubSamplesTable,
    BatchGroupsTable,
    BatchesTable,
    SubBatchesTable,
    SubBatchForm,
    SubBatchesModal,
    BatchForm,
    BatchModal,
    BatchGroupModal,
    BatchGroupPage,
    BatchGroupForm,
    SubBatchModal,
    SampleForm,
    SampleModal,
    IndividualMonitoringSubSamplesTable,
    AuctionControlPage,
    EntityQualityFormComponent,
    SelectVesselsModal,
    LandedTripPage,
    OperationGroupTable,
    OperationGroupPage,
    OperationGroupForm
  ],
  exports: [
    TripTable,
    TripPage,
    TripForm,
    PhysicalGearModal,
    SaleForm,
    PhysicalGearForm,
    PhysicalGearTable,
    OperationForm,
    OperationPage,
    OperationTable,
    MeasurementsForm,
    MeasurementQVFormField,
    EntityQualityFormComponent,
    LandingsTable,
    LandingForm,
    LandingPage,
    SelectLandingsModal,
    SelectVesselsModal,
    AuctionControlPage,
    BatchForm,
    BatchGroupPage,
    SubBatchForm,
    SubBatchModal,
    SampleForm
  ],
  entryComponents: [
    TripTable,
    TripPage,
    PhysicalGearModal,
    PhysicalGearTable,
    OperationTable,
    OperationPage,
    ObservedLocationPage,
    ObservedLocationsPage,
    LandingPage,
    SelectLandingsModal,
    AuctionControlPage,
    SubBatchesModal,
    BatchModal,
    BatchGroupModal,
    BatchGroupPage,
    SubBatchModal,
    SampleModal,
    SelectVesselsModal
  ],
  providers: [
    TripService,
    TripValidatorService,
    PhysicalGearValidatorService,
    OperationService,
    OperationValidatorService,
    OperationGroupService,
    OperationGroupValidatorService,
    ObservedLocationService,
    ObservedLocationValidatorService,
    LandingService,
    LandingValidatorService,
    SaleService,
    SaleValidatorService,
    PositionValidatorService,
    MeasurementsValidatorService,
    BatchValidatorService,
    SubBatchValidatorService,
    BatchGroupValidatorService,
    SpeciesBatchValidatorService,
    SampleValidatorService,
    SubSampleValidatorService,
    {provide: OverlayContainer, useClass: FullscreenOverlayContainer},
    AggregationTypeValidatorService
  ]
})
export class TripModule {

}
