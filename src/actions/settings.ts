import { createAction } from 'redux-act';

import { IUrlSub } from '../types';

export const setAutoFulfillDependencies =
  createAction('SET_AUTO_FULFILL_DEPENDENCIES', (fulfill: boolean) => fulfill);

export const setLockSub =
  createAction('SET_DEP_FULFILLER_LOCK_SUB', (lock: boolean) => lock);

export const setEnableDebugMode =
  createAction('SET_DEP_FULFILLER_DEBUG', (debug: boolean) => debug);

export const setReadNonPremiumNotif =
  createAction('SET_READ_NON_PREMIUM_NOTIFICATION', (read: boolean) => read);

export const addUrlSub =
  createAction('ADD_URL_SUB', (urlSub: IUrlSub) => urlSub);

export const removeUrlSub =
  createAction('REMOVE_URL_SUB', (id: string) => id);

export const setUrlSub =
  createAction('SET_URL_SUB', (id: string, urlSub: IUrlSub) => ({ id, urlSub }));
