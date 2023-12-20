import { __decorate } from "tslib";
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CoreModule } from '@sumaris-net/ngx-components';
import { BatchTreeTestPage } from './batch/testing/batch-tree.test';
import { AppTripModule } from './trip/trip.module';
import { SharedModule } from '@sumaris-net/ngx-components';
import { TranslateModule } from '@ngx-translate/core';
import { BatchGroupFormTestPage } from '@app/trip/batch/group/testing/batch-group.form.test';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SampleTreeTestPage } from '@app/trip/sample/testing/sample-tree.test';
import { PhysicalGearsTestPage } from '@app/trip/physicalgear/testing/physical-gears.test';
import { AppSampleModule } from '@app/trip/sample/sample.module';
import { AppBatchModule } from '@app/trip/batch/batch.module';
import { AppPhysicalGearModule } from '@app/trip/physicalgear/physical-gear.module';
import { BatchTreeContainerTestPage } from '@app/trip/batch/testing/batch-tree-container.test';
import { BatchFormTestPage } from '@app/trip/batch/common/testing/batch.form.test';
export const TRIP_TESTING_PAGES = [
    { label: 'Trip module', divider: true },
    { label: 'Physical gears', page: '/testing/trip/physicalGears' },
    { label: 'Batch form', page: '/testing/trip/batchForm' },
    { label: 'Batch group form', page: '/testing/trip/batchGroupForm' },
    { label: 'Batch tree', page: '/testing/trip/batchTree' },
    { label: 'Batch tree container', page: '/testing/trip/batchTreeContainer' },
    { label: 'Sample tree', page: '/testing/trip/sampleTree' }
];
const routes = [
    {
        path: 'batchTree',
        pathMatch: 'full',
        component: BatchTreeTestPage
    },
    {
        path: 'batchTreeContainer',
        pathMatch: 'full',
        component: BatchTreeContainerTestPage
    },
    {
        path: 'batchGroupForm',
        pathMatch: 'full',
        component: BatchGroupFormTestPage
    },
    {
        path: 'batchForm',
        pathMatch: 'full',
        component: BatchFormTestPage
    },
    {
        path: 'sampleTree',
        pathMatch: 'full',
        component: SampleTreeTestPage
    },
    {
        path: 'physicalGears',
        pathMatch: 'full',
        component: PhysicalGearsTestPage
    },
];
let TripTestingModule = class TripTestingModule {
};
TripTestingModule = __decorate([
    NgModule({
        imports: [
            CommonModule,
            SharedModule,
            CoreModule,
            TranslateModule.forChild(),
            RouterModule.forChild(routes),
            AppTripModule,
            AppSampleModule,
            AppBatchModule,
            AppPhysicalGearModule,
            MatCheckboxModule,
        ],
        declarations: [
            BatchFormTestPage,
            BatchGroupFormTestPage,
            BatchTreeTestPage,
            BatchTreeContainerTestPage,
            PhysicalGearsTestPage,
            SampleTreeTestPage,
        ],
        exports: [
            BatchFormTestPage,
            BatchGroupFormTestPage,
            BatchTreeTestPage,
            BatchTreeContainerTestPage,
            SampleTreeTestPage,
            PhysicalGearsTestPage
        ]
    })
], TripTestingModule);
export { TripTestingModule };
//# sourceMappingURL=trip.testing.module.js.map