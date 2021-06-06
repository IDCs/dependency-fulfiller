import { types, util } from 'vortex-api';

import * as actions from '../actions/settings';

const settingsReducer: types.IReducerSpec = {
  reducers: {
    [actions.setAutoFulfillDependencies as any]: (state, payload) => {
      return util.setSafe(state, ['autofulfill'], payload);
    },
    [actions.setEnableDebugMode as any]: (state, payload) => {
      return util.setSafe(state, ['fulfillerDebugMode'], payload);
    },
    [actions.setReadNonPremiumNotif as any]: (state, payload) => {
      return util.setSafe(state, ['readNonPremiumNotification'], payload);
    },
    [actions.setLockSub as any]: (state, payload) => {
      return util.setSafe(state, ['lockSub'], payload);
    },
    [actions.addUrlSub as any]: (state, payload) => {
      const path = ['urlSubscriptions'];
      const copy = [].concat(util.getSafe(state, path, []), [payload]);
      return util.setSafe(state, path, copy);
    },
    [actions.removeUrlSub as any]: (state, payload) => {
      const path = ['urlSubscriptions'];
      const res = util.removeValueIf(state, path, sub => sub.id === payload);
      return res;
    },
    [actions.setUrlSub as any]: (state, payload) => {
      const path = ['urlSubscriptions'];
      let copy = util.getSafe(state, path, []);
      const idx = copy.findIndex(sub => sub.id === payload.id);
      if (idx === -1) {
        return state;
      }
      copy.splice(idx, 1, payload.urlSub);
      return util.setSafe(state, path, copy);
    },
  },
  defaults: {
    autofulfill: false,
    lockSub: false,
    fulfillerDebugMode: false,
    readNonPremiumNotification: false,
    urlSubscriptions: [],
  },
};

export default settingsReducer;
