import { assignRoles, togglePings } from '../flows/roleSelfService.js';

// customId -> handler. index.js routes button interactions through this map.
export const buttonHandlers = {
  'acl:assign-roles': assignRoles,
  'acl:toggle-pings': togglePings,
};
