import { createAction } from 'redux-act';

export const setAutoFulfillDependencies =
  createAction('SET_AUTO_FULFILL_DEPENDENCIES', (fulfill: boolean) => {
    return fulfill;
  });

export const setEnableDebugMode =
  createAction('SET_DEP_FULFILLER_DEBUG', (debug: boolean) => debug);

export const setReadNonPremiumNotif =
  createAction('SET_READ_NON_PREMIUM_NOTIFICATION', (read: boolean) => read);
