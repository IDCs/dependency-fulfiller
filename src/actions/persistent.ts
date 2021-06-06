import { createAction } from 'redux-act';

export const setFulfillerSubscription = createAction('SET_FULFILLER_SUBSCRIPTION',
  (profileId: string, subId: string) => ({ profileId, subId }));

  export const clearFulfillerSubscription = createAction('CLEAR_FULFILLER_SUBSCRIPTION',
  (profileId: string) => ({ profileId }));