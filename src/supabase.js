import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from './config.js';

// Service-role client: full DB access, RLS bypassed. The bot enforces its
// OWN authorization in code (e.g. /code is captain-gated). Never expose
// this key or run this client anywhere client-side.
//
// Created lazily via a Proxy so importing this module is side-effect free
// (lets deploy-commands.js / eslint load the command modules without a full
// .env). The real client is built on first use, after assertConfig().
let instance = null;
function getClient() {
  if (!instance) {
    instance = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Node has no global WebSocket until v22, so the realtime client can't
      // find one (this also affects the node:20 Docker image). Supply `ws`
      // explicitly so realtime works on every Node version we target.
      realtime: { transport: WebSocket, params: { eventsPerSecond: 5 } },
    });
  }
  return instance;
}

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  },
);
