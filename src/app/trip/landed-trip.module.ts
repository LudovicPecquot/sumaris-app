import {NgModule} from '@angular/core';
import {ObservedLocationForm} from "./observedlocation/observed-location.form";
import {ObservedLocationPage} from "./observedlocation/observed-location.page";
import {ObservedLocationsPage} from "./observedlocation/observed-locations.page";
import {LandingsTable} from "./landing/landings.table";
import {LandingPage} from "./landing/landing.page";
import {LandingForm} from "./landing/landing.form";
import {SelectLandingsModal} from "./landing/select-landings.modal";
import {AuctionControlPage} from "./landing/auctioncontrol/auction-control.page";
import {LandedTripPage} from "./landedtrip/landed-trip.page";
import {OperationGroupTable} from "./operationgroup/operation-groups.table";
import {ProductsTable} from "./product/products.table";
import {LandedSaleForm} from "./sale/landed-sale.form";
import {PacketsTable} from "./packet/packets.table";
import {PacketForm} from "./packet/packet.form";
import {PacketModal} from "./packet/packet.modal";
import {ProductSaleForm} from "./sale/product-sale.form";
import {ProductSaleModal} from "./sale/product-sale.modal";
import {PacketSaleModal} from "./sale/packet-sale.modal";
import {PacketSaleForm} from "./sale/packet-sale.form";
import {ExpenseForm} from "./expense/expense.form";
import {TypedExpenseForm} from "./expense/typed-expense.form";
import {FishingAreaForm} from "./fishing-area/fishing-area.form";
import {AggregatedLandingForm} from "./aggregated-landing/aggregated-landing.form";
import {AggregatedLandingsTable} from "./aggregated-landing/aggregated-landings.table";
import {VesselActivityForm} from "./aggregated-landing/vessel-activity.form";
import {AggregatedLandingModal} from "./aggregated-landing/aggregated-landing.modal";
import {TripModule} from "./trip.module";
import {CoreModule}  from "@sumaris-net/ngx-components";
import {AppReferentialModule} from "../referential/app-referential.module";
import {SelectVesselsModal} from "./observedlocation/vessels/select-vessel.modal";
import {AppDataModule} from "../data/app-data.module";
import {TranslateModule} from "@ngx-translate/core";
import {SamplesModal} from "./sample/samples.modal";
import {SamplingLandingPage} from "./landing/sampling/sampling-landing.page";
import {ObservedLocationOfflineModal} from "./observedlocation/offline/observed-location-offline.modal";
import {VesselModule} from "../vessel/vessel.module";


@NgModule({
  imports: [
    CoreModule,
    AppDataModule,
    TripModule,
    AppReferentialModule,
    VesselModule,
    TranslateModule.forChild()
  ],
  declarations: [
    ObservedLocationForm,
    ObservedLocationPage,
    ObservedLocationsPage,
    ObservedLocationOfflineModal,
    LandingsTable,
    LandingForm,
    LandingPage,
    SamplingLandingPage,
    SelectLandingsModal,
    AggregatedLandingsTable,
    AggregatedLandingModal,
    AggregatedLandingForm,
    VesselActivityForm,
    AuctionControlPage,
    LandedTripPage,
    OperationGroupTable,
    ProductsTable,
    ProductSaleForm,
    ProductSaleModal,
    LandedSaleForm,
    ExpenseForm,
    TypedExpenseForm,
    PacketsTable,
    PacketForm,
    PacketModal,
    PacketSaleForm,
    PacketSaleModal,
    FishingAreaForm,
    SelectVesselsModal,
    SamplesModal
  ],
  exports: [
    // Modules
    TranslateModule,
    TripModule,

    // Components
    ObservedLocationOfflineModal,
    LandingsTable,
    LandingForm,
    LandingPage,
    SamplingLandingPage,
    SelectLandingsModal,
    AuctionControlPage
  ]
})
export class LandedTripModule {

  constructor() {
    console.debug('[landed-trip] Creating module...');
  }
}
