import { types, util } from 'vortex-api';

import * as actions from '../actions/settings';

const settingsReducer: types.IReducerSpec = {
  reducers: {
    [actions.setAutoFulfillDependencies as any]: (state, payload) => {
      return util.setSafe(state, ['autofulfill'], payload);
    },
    [actions.setReadNonPremiumNotif as any]: (state, payload) => {
      return util.setSafe(state, ['readNonPremiumNotification'], payload);
    },
  },
  defaults: {
    autofulfill: false,
    readNonPremiumNotification: false,
  },
};

export default settingsReducer;
