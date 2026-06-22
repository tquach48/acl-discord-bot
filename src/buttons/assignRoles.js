import { assignRoles, togglePings } from '../flows/roleSelfService.js';
import { runSyncAll, cancelSyncAll } from '../flows/adminSync.js';

// customId -> handler. index.js routes button interactions through this map.
export const buttonHandlers = {
  'acl:assign-roles': assignRoles,
  'acl:toggle-pings': togglePings,
  'acl:sync-all': runSyncAll,
  'acl:sync-cancel': cancelSyncAll,
};
