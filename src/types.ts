import { types } from 'vortex-api';

export class TimeoutError extends Error {
  constructor(modId: string) {
    super(`${modId}: Dependency operation timed out`);
    this.name = 'TimeoutError';
  }
}

export class NotPremiumError extends Error {
  constructor() {
    super('Only available to premium users');
    this.name = 'NotPremiumError';
  }
}

export interface IProps {
  state: types.IState;
  profile: types.IProfile;
  mods: { [modId: string]: types.IMod };
  downloads: { [dlId: string]: types.IDownload };
}

export interface IDownloadIds {
  gameId: string;
  fileId: string;
  modId: string;
}

export interface INexusDownloadInfo {
  downloadIds: IDownloadIds;
  archiveName: string;
  allowAutoInstall?: boolean;
  rules: types.IModRule[];
}

export interface IExtractedModData {
  modId: string;
  archiveId: string;
  rules: types.IModRule[];
}

export interface IProfileData {
  id: string;
  gameId: string;
  enabledModIds: string[];
}
