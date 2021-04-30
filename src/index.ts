import { clipboard } from 'electron';
import * as _ from 'lodash';
import * as path from 'path';
import { setTimeout } from 'timers';
import turbowalk, { IEntry } from 'turbowalk';
import { actions, fs, log, selectors, types, util } from 'vortex-api';
import { setReadNonPremiumNotif } from './actions/settings';
import { setOpenProfileSelect, setProfileUserData, setUserDataFilePath } from './actions/session';
import { ACTIVITY_NOTIF, DEP_MAN_SUFFIX, NEXUS } from './common';
import { downloadImpl } from './downloader';
import settingsReducer from './reducers/settings';
import sessionReducer from './reducers/session';
import { IDownloadIds, IExtractedModData, INexusDownloadInfo, IProfileData, IProps, NotPremiumError } from './types';
import { convertGameDomain, compareIds, extractIds, formatTime,
  genIdentifier, genProps, isPremium, resolveIdsUsingMD5 } from './util';
import Settings from './views/Settings';
import ProfileSelectionDialog from './views/ProfileSelectionDialog';

// 5 minute installation timeout should be sufficient no ?
//  might make this configurable by the user in the future.
const TIMEOUT_MS = 60000 * 5;

function init(context: types.IExtensionContext) {
  context.registerReducer(['settings', 'interface'], settingsReducer);
  context.registerReducer(['session', 'depfulfiller'], sessionReducer);

  context.registerAction('mods-action-icons', 300, 'clone', {}, 'Export Dependencies',
    instanceIds => { genDependencyManifest(context.api, instanceIds); });

  context.registerAction('mods-multirow-actions', 300, 'clone', {}, 'Export Dependencies',
    instanceIds => { genDependencyManifest(context.api, instanceIds); });

  context.registerAction('mod-icons', 300, 'import', {}, 'Import From Dependencies Dialog',
    instanceIds => queryImportType(context.api));

  context.registerAction('mod-icons', 300, 'import', {}, 'Import From Application State',
    instanceIds => { genFromUserData(context.api) }, () => {
      const state = context.api.getState();
      return util.getSafe(state, ['settings', 'interface', 'fulfillerDebugMode'], false);
    });

  context.registerSettings('Interface', Settings, undefined, undefined, 10);

  context.registerDialog('depfulfiller-select-profile-dialog', ProfileSelectionDialog, () => ({
    onSelectProfile: (profileData: IProfileData) => onProfileSelect(context.api, profileData),
  }));

  context.once(() => {
    context.api.onStateChange(['persistent', 'mods'],
      (prev, current) => onModsChange(context.api, prev, current));
  });

  return true;
}

async function onProfileSelect(api: types.IExtensionApi, profileData: IProfileData) {
  const state = api.getState();
  const filePath = util.getSafe(state, ['session', 'depfulfiller', 'userDataFilePath'], undefined);
  if (filePath === undefined) {
    api.showErrorNotification('Invalid userdata filepath', new util.NotFound('User data file'));
    return;
  }

  try {
    const data = await fs.readFileAsync(filePath, { encoding: 'utf8' });
    let persistent = JSON.parse(data);
    persistent = persistent.persistent !== undefined
      ? persistent.persistent
      : persistent;
    if (persistent.downloads.files === undefined
     || persistent.mods?.[profileData.gameId] === undefined
     || persistent.profiles === undefined) {
      throw new util.DataInvalid('Selected file does not contain required data');
    }

    const nexusDownloads: INexusDownloadInfo[] = [];
    const mods: types.IMod[] = profileData.enabledModIds.map(modId =>
      persistent.mods[profileData.gameId][modId]).filter(mod => mod !== undefined);
    const modsData: IExtractedModData[] = mods.map(mod => ({
      modId: mod.id,
      archiveId: mod.archiveId,
      rules: mod.rules || [],
    })).filter(modData => modData.archiveId !== undefined);

    const includedModIds = modsData.map(mod => mod.modId);
    for (const modData of modsData) {
      const arcId: string = modData.archiveId;
      const ids: IDownloadIds = extractIds(persistent.downloads.files[arcId]);
      if (ids === undefined || persistent.downloads.files[arcId]?.localPath === undefined) {
        if (persistent.downloads.files[arcId] !== undefined) {
          log('warn', 'failed to extract required information', JSON.stringify(persistent.downloads.files[arcId]));
        } else {
          log('warn', 'failed to extract required information - download archive missing', arcId);
        }
        continue;
      }

      const nexusDownload: INexusDownloadInfo = {
        archiveName: persistent.downloads.files[arcId].localPath,
        downloadIds: ids,
        allowAutoInstall: true,
        rules: modData.rules.filter(rule =>
          includedModIds.includes(rule.reference.id)),
      };
      nexusDownloads.push(nexusDownload);
    }

    await fulfillDependencies(api, nexusDownloads);
    api.sendNotification({
      message: 'All dependencies fulfilled',
      type: 'success',
      id: 'all-dependencies-fulfilled',
      displayMS: 5000,
    });
    raiseRulesNotification(api, nexusDownloads);
  } catch (err) {
    api.showErrorNotification('Failed to generate dependencies from user data', err,
      { allowReport: false });
  }
}

async function genFromUserData(api: types.IExtensionApi): Promise<void> {
  const selectedFile = await api.selectFile({
    title: 'User Persistent Data',
    filters: [{ name: 'JSON file', extensions: ['json'] }]
  });

  if (selectedFile === undefined) {
    // Must've canceled.
    return;
  }
  try {
    const data = await fs.readFileAsync(selectedFile, { encoding: 'utf8' });
    let persistent = JSON.parse(data);
    persistent = persistent.persistent !== undefined
      ? persistent.persistent
      : persistent;
    if (persistent.downloads === undefined
     || persistent.mods === undefined
     || persistent.profiles === undefined) {
      throw new util.DataInvalid('Selected file does not contain required data');
    }

    api.store.dispatch(setUserDataFilePath(selectedFile));
    const profileData: { [profileId: string]: IProfileData } = Object.keys(persistent.profiles).reduce((accum, iter) => {
      const profile = persistent.profiles[iter];
      const modState = util.getSafe(profile, ['modState'], {});
      accum[iter] = {
        id: iter,
        gameId: profile.gameId,
        enabledModIds: Object.keys(modState).filter(modId => util.getSafe(modState, [modId, 'enabled'], false)),
      };
      return accum;
    }, {});

    api.store.dispatch(setProfileUserData(profileData));
    api.store.dispatch(setOpenProfileSelect(true));
  } catch (err) {
    api.showErrorNotification('Failed to generate dependencies from user data', err,
      { allowReport: false });
  }
}

async function onModsChange(api: types.IExtensionApi, prev: any, current: any) {
  let state = api.getState();
  const autoFulfill = util.getSafe(state, ['settings', 'interface', 'autofulfill'], false);
  if (!autoFulfill) {
    return;
  }

  const gameModes = Object.keys(current);
  for (const gameMode of gameModes) {
    if (prev[gameMode] === undefined) {
      continue;
    }
    const prevMods = Object.keys(prev[gameMode]);
    const currMods = Object.keys(current[gameMode]);
    if (!_.isEqual(prevMods, currMods)) {
      const stagingFolder = selectors.installPathForGame(state, gameMode);
      const tryGenFromFilePath = async (modId: string): Promise<void> => {
        state = api.getState();
        const mod: types.IMod = util.getSafe(state, ['persistent', 'mods', gameMode, modId], undefined);
        if (mod?.installationPath === undefined) {
          // Well if the mod is gone, no point in still trying to do this.
          log('debug', 'failed to complete dependency check - mod was removed', modId);
          return Promise.resolve();
        }
        // Mod still installing - wait for it.
        if (mod.state === 'installing') {
          return new Promise((resolve) => setTimeout(() => resolve(tryGenFromFilePath(modId)), 5000));
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

function raiseRulesNotification(api: types.IExtensionApi, downloads: INexusDownloadInfo[]) {
  const hasRules = downloads.find(down => down.rules !== undefined && down.rules.length > 0) !== undefined;
  if (!hasRules) {
    return;
  }

  const t = api.translate;
  api.sendNotification({
    id: 'import-conflict-rules',
    type: 'info',
    message: t('Imported dependencies contained conflict rules'),
    allowSuppress: false,
    noDismiss: false,
    actions: [
      { title: 'More', action: (dismiss) => api.showDialog('question', t('Import conflict rules'), {
        bbcode: t('The imported dependencies contain pre-defined rule metadata - if you would like to try '
                + 'to import these, please make sure that all the dependencies have finished downloading '
                + 'and are installed before clicking the "Import Rules" button.')
      }, [
        { label: 'Do This Later' },
        {
          label: 'Import Rules',
          action: () => {
            fulfillRules(api, downloads);
            dismiss();
          }
        }
      ])
      }
    ]
  })
}

function fulfillRules(api: types.IExtensionApi, downloads: INexusDownloadInfo[]) {
  const props: IProps = genProps(api);
  if (props === undefined) {
    return;
  }

  // const reverseType = (rule: IModRule) => rule.type === 'before' ? 'after' : 'before';
  const hasRule = (rule: types.IModRule, modId: string) => util.testModReference(props.mods[modId], rule.reference);

  // const refMod = (rule: IModRule) => Object.keys(props.mods)
  //   .map(iter => props.mods[iter])
  //   .find(iter => util.testModReference(iter, rule.reference)
  //               && iter.rules !== undefined
  //               && (iter.rules.find(rule => findRule(rule, iter.id)) !== undefined));

  const mod = (fileName) => path.basename(fileName, path.extname(fileName));
  const match = (modId) => downloads.find(dwnl => mod(dwnl.archiveName) === modId) !== undefined;
  const installed = Object.keys(props.mods).filter(match);
  for (const download of downloads) {
    if (download.rules === undefined) {
      continue;
    }

    for (const rule of download.rules) {
      if (installed.includes(rule.reference?.id) && !hasRule(rule, mod(download.archiveName))) {
        api.store.dispatch(actions.addModRule(convertGameDomain(download.downloadIds.gameId), mod(download.archiveName), rule));
      }
    }
  }
}

async function fulfillDependencies(api: types.IExtensionApi, downloads: INexusDownloadInfo[]) {
  const totalDownloads = downloads.length;
  let idx = 0;
  const progress = (archiveName: string) => {
    api.sendNotification({
      id: ACTIVITY_NOTIF,
      type: 'activity',
      title: 'Downloading dependencies - this can take a while!',
      message: archiveName,
      noDismiss: true,
      allowSuppress: false,
      progress: (idx * 100) / totalDownloads,
    });
    ++idx;
  };

  for (const download of downloads) {
    try {
      await downloadImpl(api as any, download, progress);
    } catch (err) {
      const state = api.getState();
      if (err instanceof NotPremiumError) {
        const readNotif = util.getSafe(state, ['settings', 'interface', 'readNonPremiumNotification'], false);
        if (!readNotif) {
          api.sendNotification({
            message: 'Cannot fulfill dependencies automatically',
            type: 'warning',
            id: 'not-a-premium-account',
            actions: [
              {
                title: 'More',
                action: (dismiss) => api.showDialog('info', 'Not a premium member', {
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
                  {
                    label: 'Close',
                    action: () => {
                      api.store.dispatch(setReadNonPremiumNotif(true));
                      dismiss();
                    }
                  },
                ]),
              },
            ],
          });
        }
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

  api.dismissNotification(ACTIVITY_NOTIF);
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
    raiseRulesNotification(api, nexusDownloads);
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
    raiseRulesNotification(api, uniqueDownloads);
    return Promise.resolve();
  } catch (err) {
    api.showErrorNotification('Failed to download dependencies', err,
      { allowReport: false });
  }
}

async function genDependencyManifest(api: types.IExtensionApi, modIds: string[]) {
  const props: IProps = genProps(api);
  if (props === undefined) {
    api.showErrorNotification('Failed to create dependencies manifest', 'no active profile',
      { allowReport: false });
  }

  const nexusDownloads: INexusDownloadInfo[] = [];
  const mods: types.IMod[] = modIds.map(modId =>
    props.mods[modId]).filter(mod => mod !== undefined);
  const modsData: IExtractedModData[] = mods.map(mod => ({
    modId: mod.id,
    archiveId: mod.archiveId,
    rules: mod.rules || [],
  })).filter(modData => modData.archiveId !== undefined);

  const includedModIds = modsData.map(mod => mod.modId);
  for (const modData of modsData) {
    const arcId: string = modData.archiveId;
    let ids: IDownloadIds = extractIds(props.downloads[arcId]);
    if (ids === undefined && props.downloads[arcId]?.fileMD5 !== undefined) {
      ids = await resolveIdsUsingMD5(api, arcId);
    }
    if (ids === undefined || props.downloads[arcId]?.localPath === undefined) {
      if (props.downloads[arcId] !== undefined) {
        log('warn', 'failed to extract required information', JSON.stringify(props.downloads[arcId]));
      } else {
        log('warn', 'failed to extract required information - download archive missing', arcId);
      }
      continue;
    }

    const nexusDownload: INexusDownloadInfo = {
      archiveName: props.downloads[arcId].localPath,
      downloadIds: ids,
      allowAutoInstall: true,
      rules: modData.rules.filter(rule =>
        includedModIds.includes(rule.reference.id)),
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
