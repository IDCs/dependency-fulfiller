import { types, util } from 'vortex-api';

import * as actions from '../actions/settings';

const settingsReducer: types.IReducerSpec = {
  reducers: {
    [actions.setAutoFulfillDependencies as any]: (state, payload) => {
      return util.setSafe(state, ['autofulfill'], payload);
    },
  },
  defaults: {
    autofulfill: false,
  },
};

export default settingsReducer;
