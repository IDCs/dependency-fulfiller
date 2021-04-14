import { log, types, util } from 'vortex-api';

import { INexusDownloadInfo, NotPremiumError } from './types';
import { isPremium } from './util';

function genDownloadProps(api: types.IExtensionApi, archiveName: string) {
  const state = api.getState();
  const downloads: { [dlId: string]: types.IDownload } = util.getSafe(state, ['persistent', 'downloads', 'files'], {});
  const downloadId = Object.keys(downloads).find(dId => downloads[dId].localPath === archiveName);
  return { downloads, downloadId, state };
}

async function install(api: types.IExtensionApi,
                       downloadInfo: INexusDownloadInfo,
                       downloadId: string) {
  const state = api.getState();
  if (downloadInfo.allowAutoInstall && state.settings.automation?.['install'] !== true) {
    const mods: { [modId: string]: types.IMod } =
      util.getSafe(state, ['persistent', 'mods', downloadInfo.downloadIds.gameId], {});
    const ismodInstalled = Object.keys(mods).find(id =>
      mods[id].attributes?.fileId === downloadInfo.downloadIds.fileId) !== undefined;
    if (!ismodInstalled) {
      return new Promise((resolve, reject) => {
        api.events.emit('start-install-download', downloadId, true, (err, modId) => {
          if (err) {
            log('error', 'failed to install dependency', err);
            return resolve(undefined);
          }
          return resolve(modId);
        });
      })
    }
  }

  return Promise.resolve(undefined);
}

export async function downloadImpl(api: types.IExtensionApi, downloadInfo: INexusDownloadInfo) {
  const { downloadIds, archiveName, allowAutoInstall } = downloadInfo;
  const state: types.IState = api.getState();
  if (!isPremium(api)) {
    return Promise.reject(new NotPremiumError());
  }
  if (genDownloadProps(api, archiveName).downloadId !== undefined) {
    const { downloadId } = genDownloadProps(api, downloadInfo.archiveName);
    return install(api, downloadInfo, downloadId);
  }

  return api.emitAndAwait('nexus-download',
    downloadIds.gameId, downloadIds.modId, downloadIds.fileId, archiveName, allowAutoInstall)
    .then(() => {
      const { downloadId } = genDownloadProps(api, downloadInfo.archiveName);
      return install(api, downloadInfo, downloadId);
    })
    .catch(err => {
      log('error', 'failed to download from NexusMods.com',
        JSON.stringify(downloadInfo, undefined, 2));
      err['attachLogOnReport'] = true;
      api.showErrorNotification('Failed to download dependency', err);
    });
}
