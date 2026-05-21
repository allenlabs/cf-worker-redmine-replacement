// Setup for the Node environment (server + pure-lib tests).
// Node already exposes TextEncoder, crypto.subtle, fetch and File globally, so
// no polyfills are needed.  We just want vitest's globals.
import 'vitest';
