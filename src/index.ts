import { clipboard } from 'electron';
import * as _ from 'lodash';
import * as path from 'path';
import { setTimeout } from 'timers';
import turbowalk, { IEntry } from 'turbowalk';
import { fs, log, selectors, types, util } from 'vortex-api';

import { DEP_MAN_SUFFIX, NEXUS } from './common';
import { downloadImpl } from './downloader';
import settingsReducer from './reducers/settings';
import { IDownloadIds, INexusDownloadInfo, IProps } from './types';
import { compareIds, extractIds, formatTime, genIdentifier, genProps } from './util';
import Settings from './views/Settings';

// 5 minute installation timeout should be sufficient no ?
//  might make this configurable by the user in the future.
const TIMEOUT_MS = 60000 * 5;

function init(context: types.IExtensionContext) {
  context.registerReducer(['settings', 'interface'], settingsReducer);
  context.registerAction('mods-action-icons', 300, 'clone', {}, 'Export Dependencies',
    instanceIds => genDependencyManifest(context.api, instanceIds));

  context.registerAction('mods-multirow-actions', 300, 'clone', {}, 'Export Dependencies',
    instanceIds => genDependencyManifest(context.api, instanceIds));

  context.registerAction('mod-icons', 300, 'import', {}, 'Import Dependencies',
    instanceIds => queryImportType(context.api));

  context.registerSettings('Interface', Settings, undefined, undefined, 10);

  context.once(() => {
    context.api.onStateChange(['persistent', 'mods'],
      (prev, current) => onModsChange(context.api, prev, current));
  });

  return true;
}

async function onModsChange(api: types.IExtensionApi, prev: any, current: any) {
  let state = api.getState();
  const autoFulfill = util.getSafe(state, ['settings', 'interface', 'autofulfill'], false);
  if (!autoFulfill) {
    return;
  }

  const gameModes = Object.keys(current);
  for (const gameMode of gameModes) {
    const prevMods = Object.keys(prev[gameMode]);
    const currMods = Object.keys(current[gameMode]);
    if (!_.isEqual(prevMods, currMods)) {
      const stagingFolder = selectors.installPathForGame(state, gameMode);
      const tryGenFromFilePath = async (modId: string): Promise<void> => {
        state = api.getState();
        const mod: types.IMod =
          util.getSafe(state, ['persistent', 'mods', gameMode, modId], undefined);
        if (mod?.installationPath === undefined) {
          // Well if the mod is gone, no point in still trying to do this.
          log('debug', 'failed to complete dependency check - mod was removed', modId);
          return;
        }
        // Mod still installing - wait for it.
        if (mod.state === 'installing') {
          return new Promise((resolve) => setTimeout(() =>
            resolve(tryGenFromFilePath(modId)), 5000));
        } else if (mod.state === 'installed') {
          const installationPath = path.join(stagingFolder, mod.installationPath);
          return genFromFilePath(api, installationPath);
        }
      };
      const diff = _.difference(currMods, prevMods);
      await Promise.all(diff.map(async modId => {
        log('info', 'attempting to fulfill mod dependencies', modId);
        const modInstallationPath = current[gameMode]?.[modId]?.installationPath;
        if (modInstallationPath !== undefined) {
          try {
            await Promise.race([
              tryGenFromFilePath(modId),
              new Promise((resolve) => setTimeout(() => {
                log('error', 'dependency check timed out - use "Import Dependencies" '
                  + 'when mod installation finishes', modId);
                return resolve(undefined);
              }, TIMEOUT_MS)),
            ]);
          } catch (err) {
            log('error', 'failed to complete dependency check', err);
          }
        }
      }));
    }
  }
}

async function fulfillDependencies(api: types.IExtensionApi, downloads: INexusDownloadInfo[]) {
  for (const download of downloads) {
    try {
      await downloadImpl(api as any, download);
    } catch (err) {
      if (err instanceof util.ProcessCanceled) {
        api.sendNotification({
          message: 'Cannot fulfill dependencies automatically',
          type: 'warning',
          id: 'not-a-premium-account',
          actions: [
            {
              title: 'More',
              action: () => api.showDialog('info', 'Not a premium member', {
                bbcode: 'As you probably know - Nexus Mods is one of the biggest mods '
                      + 'hosting sites on the internet - this of course means that we must financially '
                      + 'support an infrastructure capable of holding a MASSIVE volume of data; '
                      + 'needless to say, this is very expensive and we wouldn\'t be able to afford '
                      + 'to maintain and support it without your help.[br][/br][br][/br]'
                      + 'Please understand that as a free user/supporter certain features will be '
                      + 'unavailable as they will actively bypass the means by which you contribute '
                      + 'to our community - in your case - by watching the ads on our website.[br][/br][br][/br]'
                      + 'Although the dependency fulfiller extension is unable to pull your mods automatically, '
                      + 'the mod pages for the required mods have been opened in your browser, please download the files from there.',
              },
              [
                { label: 'Close' },
              ]),
            },
          ],
        });
      } else {
        api.showErrorNotification('Cannot fulfill dependencies automatically', err,
          { allowReport: false });
      }

      const props: IProps = genProps(api);
      // Check if the user already has this archive.
      if (props !== undefined) {
        const userHasArc = Object.keys(props.downloads).find(dlId => {
          const dl = props.downloads[dlId];
          if (dl?.localPath === download.archiveName) {
            return true;
          }
          const ids = extractIds(dl);
          return compareIds(ids, download.downloadIds);
        }) !== undefined;

        if (userHasArc) {
          continue;
        }
      }
      const url = path.join(NEXUS, download.downloadIds.gameId,
        'mods', download.downloadIds.modId.toString())
        + `?tab=files&file_id=${download.downloadIds.fileId}&nmm=1`;
      util.opn(url).catch(err => null);
    }
  }
}

function queryImportType(api: types.IExtensionApi) {
  const t = api.translate;
  const state = api.getState();
  const activeGameId = selectors.activeGameId(state);
  const stagingFolder = selectors.installPathForGame(state, activeGameId);
  api.showDialog('question', 'Import Dependencies', {
    bbcode: t('Vortex\'s dependency fulfiller can attempt to automatically download '
            + 'and install dependencies using two methods:[br][/br][br][/br][list][*] By searching your '
            + 'game\'s staging folder for files with the "{{suffix}}" suffix. This method '
            + 'requires the mod author to include such a file alongside their mod to function '
            + 'correctly. [*] Using any data you may have copied to your clipboard. Your friend '
            + 'can select multiple mods and export their mods information on their Vortex copy '
            + 'and send you the raw data/mods information which you can then copy (CTRL + C) '
            + 'and click the "Import from Clipboard" button below.[/list][br][/br][br][/br]'
            + 'Please note: you will need a Nexus Mods premium account for this to be done automatically. '
            + 'For free/supporter accounts, Vortex will open the webpages for you and you will have to '
            + 'download the mods manually.',
          { replace: { suffix: DEP_MAN_SUFFIX } }),
  }, [
    { label: 'Close' },
    { label: 'Import from Clipboard', action: () => genFromClipboard(api) },
    { label: 'Import from Staging Folder', action: () => genFromFilePath(api, stagingFolder) },
  ]);
}

async function genFromClipboard(api: types.IExtensionApi) {
  const fromClipBoard = clipboard.readText();
  try {
    const nexusDownloads: INexusDownloadInfo[] = JSON.parse(fromClipBoard);
    await fulfillDependencies(api, nexusDownloads);
    api.sendNotification({
      message: 'All dependencies fulfilled',
      type: 'success',
      id: 'all-dependencies-fulfilled',
      displayMS: 5000,
    });
  } catch (err) {
    err.message = (err.message.indexOf('SyntaxError'))
      ? 'Invalid JSON string received - the clipboard based import expects valid JSON'
      : err.message;
    api.showErrorNotification('Failed to download dependencies', err,
      { allowReport: false });
  }
}

async function genFromFilePath(api: types.IExtensionApi, filePath: string) {
  let allManifests: IEntry[] = [];
  await turbowalk(filePath, entries => {
    const manifests = entries.filter(entry => !entry.isDirectory
      && path.basename(entry.filePath).endsWith(DEP_MAN_SUFFIX));
    allManifests = allManifests.concat(manifests);
  }, { recurse: true });

  let parsedDownloadInfo: INexusDownloadInfo[] = [];
  for (const manifest of allManifests) {
    try {
      const data = await fs.readFileAsync(manifest.filePath, { encoding: 'utf8' });
      const parsedData: INexusDownloadInfo[] = JSON.parse(data);
      parsedDownloadInfo = parsedDownloadInfo.concat(parsedData);
    } catch (err) {
      log('error', 'failed to read/parse dependency manifest', err);
      continue;
    }
  }

  const uniqueDownloads: INexusDownloadInfo[] =
    Array.from(new Set(parsedDownloadInfo.map(a => genIdentifier(a.downloadIds))))
      .map(id => parsedDownloadInfo.find(a => genIdentifier(a.downloadIds) === id));

  if (uniqueDownloads.length === 0) {
    return;
  }
  try {
    await fulfillDependencies(api, uniqueDownloads);
    api.sendNotification({
      message: 'All dependencies fulfilled',
      type: 'success',
      id: 'all-dependencies-fulfilled',
      displayMS: 5000,
    });
  } catch (err) {
    err.message = (err.message.indexOf('SyntaxError'))
      ? 'Invalid JSON string received - the clipboard based import expects valid JSON'
      : err.message;
    api.showErrorNotification('Failed to download dependencies', err,
      { allowReport: false });
  }
}

function genDependencyManifest(api: types.IExtensionApi, modIds: string[]) {
  const props: IProps = genProps(api);
  if (props === undefined) {
    api.showErrorNotification('Failed to create dependencies manifest', 'no active profile',
      { allowReport: false });
  }

  const nexusDownloads: INexusDownloadInfo[] = [];
  const mods: types.IMod[] = modIds.map(modId =>
    props.mods[modId]).filter(mod => mod !== undefined);
  const archiveIds: string[] = mods.map(mod => mod.archiveId).filter(arcId => arcId !== undefined);
  for (const arcId of archiveIds) {
    const ids: IDownloadIds = extractIds(props.downloads[arcId]);
    if (ids === undefined || props.downloads[arcId]?.localPath === undefined) {
      log('warn', 'failed to extract required information', JSON.stringify(props.downloads[arcId]));
      continue;
    }

    const nexusDownload: INexusDownloadInfo = {
      archiveName: props.downloads[arcId].localPath,
      downloadIds: ids,
      allowAutoInstall: true,
    };
    nexusDownloads.push(nexusDownload);
  }

  const timestamp = new Date();
  api.sendNotification({
    id: 'mod-dependency-manifest',
    type: 'success',
    message: 'Dependency information created',
    actions: [
      {
        title: 'Save to file', action: async () => {
          const dependencyManifestPath = path.join(util.getVortexPath('temp'), 'dependency manifests');
          await fs.ensureDirWritableAsync(dependencyManifestPath);
          const tmpPath = path.join(dependencyManifestPath, `${formatTime(timestamp)}${DEP_MAN_SUFFIX}`);
          await fs.writeFileAsync(tmpPath, JSON.stringify(nexusDownloads, undefined, 2));
          util.opn(dependencyManifestPath).catch(() => null);
        },
      },
      {
        title: 'Copy to clipboard',
        action: () => clipboard.writeText(JSON.stringify(nexusDownloads, undefined, 2)),
      },
    ],
  });
}

export default init;
