import Bluebird from 'bluebird';
import { ILookupResult } from 'modmeta-db';
import { actions, fs, selectors, types, util } from 'vortex-api';

import { IDownloadIds, IProps } from './types';

import path from 'path';

// We _should_ just export this from vortex-api, but I guess it's not wise to make it
//  easy for users since we want to move away from bluebird in the future ?
export function toBlue<T>(func: (...args: any[]) => Promise<T>): (...args: any[]) => Bluebird<T> {
  return (...args: any[]) => Bluebird.resolve(func(...args));
}

const convertableNames = {
  skyrimspecialedition: 'skyrimse',
  newvegas: 'falloutnv',
  elderscrollsonline: 'teso',
}

export function convertGameDomain(gameId: string) {
  return (convertableNames[gameId] !== undefined)
    ? convertableNames[gameId] : gameId;
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

export async function resolveIdsUsingMD5(api: types.IExtensionApi, downloadId: string): Promise<IDownloadIds> {
  const state = api.getState();
  let ids: IDownloadIds;
  const download = util.getSafe(state, ['persistent', 'downloads', 'files', downloadId], undefined);
  if (download === undefined) {
    return undefined;
  }

  if (download.fileMD5 !== undefined) {
    const gameId = Array.isArray(download.game) ? download.game[0] : download.game;
    const downloadPath = selectors.downloadPathForGame(api.getState(), gameId);
    const modInfo: ILookupResult[] = await api.lookupModMeta({
      fileMD5: download.fileMD5,
      filePath: path.join(downloadPath, download.localPath),
      gameId,
      fileSize: download.size,
    }, true);
    if (modInfo.length > 0) {
      const info = modInfo[0].value;
      const setInfo = (key: string, value: any) => {
        if (value !== undefined) {
          api.store.dispatch(actions.setDownloadModInfo(downloadId, key, value)); }
      };

      try {
        const rgx = /\/mods\/(\d+)\/files\/(\d+)/i;
        let parsed: URL;
        try {
          parsed = new URL(info.sourceURI);
        } catch (err) {
          return undefined;
        }
        const matches = parsed.pathname.match(rgx);
        if ((parsed.protocol !== 'nxm:') || (matches === null) || (matches.length !== 3)) {
          return undefined;
        }

        const domainName = info.domainName;
        const modId = matches[1];
        const fileId = matches[2];

        ids = { gameId, modId: modId.toString(), fileId: fileId.toString() };

        // The state should have this information!
        setInfo('source', 'nexus');
        setInfo('nexus.ids.gameId', domainName);
        setInfo('nexus.ids.fileId', fileId);
        setInfo('nexus.ids.modId', modId);
      } catch (err) {
        // failed to parse the uri as an nxm link - that's not an error in this case, if
        // the meta server wasn't nexus mods this is to be expected
      }

      setInfo('meta', info);
    }
  }

  return Promise.resolve(ids);
}

export function extractIds(download: types.IDownload): IDownloadIds {
  if (download === undefined) {
    return undefined;
  }
  const isValid = (ids: IDownloadIds) => (ids?.fileId !== undefined && ids?.gameId !== undefined && ids?.modId !== undefined);
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
