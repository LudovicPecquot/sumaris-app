import {FormFieldDefinition} from '@sumaris-net/ngx-components';
import {InjectionToken} from '@angular/core';
import {RootDataSynchroService} from '@app/data/services/root-data-synchro-service.class';

// TODO Type entity (RootDataEntity<any, any>)
export const DEVICE_POSTION_ENTITY_MONITORING = new InjectionToken<RootDataSynchroService<any, any>>('entityToMonitorPositionOnSave');

export const DEVICE_POSITION_CONFIG_OPTION = Object.freeze({
  ENABLE: <FormFieldDefinition> {
    key: 'sumaris.app.service.gps.enable',
    label: 'CONFIGURATION.OPTIONS.DEVICE_POSITION_ENABLE',
    type: 'boolean',
    defaultValue: true,
  },
  CHECK_INTERVAL: <FormFieldDefinition> {
    key: 'sumaris.app.service.gps.periodMs',
    label: 'CONFIGURATION.OPTIONS.CHECK_INTERVAL',
    type: 'integer',
    defaultValue: 30000,
  },
});
