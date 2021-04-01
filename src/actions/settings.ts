import { createAction } from 'redux-act';

export const setAutoFulfillDependencies =
  createAction('SET_AUTO_FULFILL_DEPENDENCIES', (fulfill: boolean) => {
    return fulfill;
  });
