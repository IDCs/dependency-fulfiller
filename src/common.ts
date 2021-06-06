import path from 'path';
import { util } from 'vortex-api';

export const DEP_MAN_SUFFIX = '.vdeps';
export const SUB_FILE = 'subscription' + DEP_MAN_SUFFIX;
export const MANIFESTS_PATH = path.join(util.getVortexPath('temp'), 'dependency manifests');
export const NEXUS = 'www.nexusmods.com';
export const ACTIVITY_NOTIF = 'dep-fulfiller-download-activity';