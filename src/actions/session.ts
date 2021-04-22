import { createAction } from 'redux-act';
import { IProfileData } from '../types';

export const setOpenProfileSelect =
  createAction('SET_OPEN_SELECT_USERDATA_PROFILE_DIALOG', (open: boolean) => {
    return open;
  });

export const setProfileUserData = createAction('SET_USERDATA_PROFILE_DATA',
  (profileData: { [profileId: string]: IProfileData }) => profileData);

export const setUserDataFilePath = createAction('SET_USERDATA_FILEPATH',
  (filePath: string) => filePath)