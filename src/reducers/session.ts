import { types, util } from 'vortex-api';

import * as actions from '../actions/session';

const sessionReducer: types.IReducerSpec = {
  reducers: {
    [actions.setOpenProfileSelect as any]: (state, payload) => {
      return util.setSafe(state, ['open'], payload);
    },
    [actions.setProfileUserData as any]: (state, payload) => {
      return util.setSafe(state, ['userData'], payload);
    },
    [actions.setUserDataFilePath as any]: (state, payload) => {
      return util.setSafe(state, ['userDataFilePath'], payload);
    },
  },
  defaults: {
    open: false,
    userData: {},
    userDataFilePath: '',
  },
};

export default sessionReducer;
