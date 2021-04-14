import Bluebird from 'bluebird';
import { fs, selectors, types, util } from 'vortex-api';

import { IDownloadIds, IProps } from './types';

// We _should_ just export this from vortex-api, but I guess it's not wise to make it
//  easy for users since we want to move away from bluebird in the future ?
export function toBlue<T>(func: (...args: any[]) => Promise<T>): (...args: any[]) => Bluebird<T> {
  return (...args: any[]) => Bluebird.resolve(func(...args));
}

export function genProps(api: types.IExtensionApi, profileId?: string): IProps {
  const state = api.getState();
  const profile = (profileId !== undefined)
    ? selectors.profileById(state, profileId)
    : selectors.activeProfile(state);
  if (profile?.gameId === undefined) {
    return undefined;
  }
  const mods = util.getSafe(state, ['persistent', 'mods', profile.gameId], {});
  const downloads = util.getSafe(state, ['persistent', 'downloads', 'files'], {});
  return { state, profile, mods, downloads };
}

export function extractIds(download: types.IDownload): IDownloadIds {
  if (download === undefined) {
    return undefined;
  }
  const isValid = (ids: IDownloadIds) => (ids?.fileId !== undefined || ids?.gameId !== undefined || ids?.modId !== undefined);
  let ids: IDownloadIds = util.getSafe(download.modInfo, ['nexus', 'ids'], undefined);
  if (isValid(ids)) {
    return ids;
  }
  const meta = util.getSafe(download.modInfo, ['meta', 'details'], undefined);
  if (meta?.fileId !== undefined) {
    ids = { fileId: meta.fileId, modId: meta.modId, gameId: download.game[0] };
    if (isValid(ids)) {
      return ids;
    }
  }

  return undefined;
}

export function isPremium(api: types.IExtensionApi) {
  const state: types.IState = api.getState();
  return util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false);
}

export function formatTime(input: Date): string {
  return [
    input.getFullYear(),
    util.pad(input.getMonth(), '0', 2),
    util.pad(input.getDay(), '0', 2),
    util.pad(input.getHours(), '0', 2),
    util.pad(input.getMinutes(), '0', 2),
  ].join('-');
}

export function compareIds(lhs: IDownloadIds, rhs: IDownloadIds): boolean {
  if (lhs?.fileId === undefined || rhs?.fileId === undefined) {
    return false;
  }

  if (genIdentifier(lhs) === genIdentifier(rhs)) {
    return true;
  }

  return false;
}

export function genIdentifier(ids: IDownloadIds): string {
  if (ids === undefined) {
    return undefined;
  }

  return `${ids.fileId}_${ids.modId}_${ids.gameId}`;
}
