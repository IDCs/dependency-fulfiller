import { types, util } from 'vortex-api';

import * as actions from '../actions/persistent';

const persistentReducer: types.IReducerSpec = {
  reducers: {
    [actions.setFulfillerSubscription as any]: (state, payload) => {
      const { profileId, subId } = payload;
      return util.setSafe(state, [profileId, 'subId'], subId);
    },
    [actions.clearFulfillerSubscription as any]: (state, payload) => {
      const { profileId } = payload;
      return util.setSafe(state, [profileId, 'subId'], undefined);
    },
  },
  defaults: {},
};

export default persistentReducer;
