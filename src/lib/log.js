// Minimal structured-ish logger. Keeps a consistent prefix + timestamp so
// host log viewers (Fly/Koyeb/journalctl) stay readable.
function ts() {
  return new Date().toISOString();
}

export const log = {
  info: (...a) => console.log(`[${ts()}] [info]`, ...a),
  warn: (...a) => console.warn(`[${ts()}] [warn]`, ...a),
  error: (...a) => console.error(`[${ts()}] [error]`, ...a),
};
