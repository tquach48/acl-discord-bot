// Registry of all slash commands. Add new command modules here.
import roles from './roles.js';
import whoami from './whoami.js';
import profile from './profile.js';
import team from './team.js';
import schedule from './schedule.js';
import mymatches from './mymatches.js';
import standings from './standings.js';
import code from './code.js';
import syncroles from './syncroles.js';

export const commands = [roles, whoami, profile, team, schedule, mymatches, standings, code, syncroles];
