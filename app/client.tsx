/// <reference types="vite/client" />
//
// Client entry — NOTE: this file targets TanStack Start 1.168, whose
// `StartClient` no longer takes a router argument.  The exact wiring of
// `createRouter` into the runtime is set up by the `@tanstack/react-start`
// Vite plugin (`tanstackStart()` in vite.config.ts).
//
// In the current package state `npm run dev` / `npm run build` / `npm run
// deploy` are not yet verified end-to-end — see the "Status" section of
// README.md.  The non-route logic (server-fn impls, components, utils) is
// fully tested via `npm run test` regardless.
import { StartClient } from '@tanstack/react-start';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('app')!).render(<StartClient />);
