import { types } from 'vortex-api';

export class TimeoutError extends Error {
  constructor(modId: string) {
    super(`${modId}: Dependency operation timed out`);
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
}
