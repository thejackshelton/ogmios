import { component$ } from '@qwik.dev/core';
import { App } from './app';

/**
 * Qwik's optimizer requires a `src/root.{tsx,jsx}` entry for SSR/CSR builds.
 * This file wires our `App` component into a minimal HTML document shell so
 * `vite build` succeeds. The tests import `DefaultPage` / `App` directly and
 * do not go through this entry.
 */
export const Root = component$(() => (
  <>
    <head>
      <meta charset="utf-8" />
      <title>Shoki · Vitest Browser Qwik Example</title>
    </head>
    <body>
      <App />
    </body>
  </>
));
