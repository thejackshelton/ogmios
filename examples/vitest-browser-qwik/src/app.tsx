import { $, component$, useSignal } from '@qwik.dev/core';

/**
 * The default landing page — exercised by app.test.tsx and app-ssr.test.tsx.
 * Mirrors the Submit + aria-live live-region pattern from the legacy React
 * example: clicking Submit flips an aria-live region from empty to
 * "Form submitted" so VoiceOver announces both the button and the status.
 *
 * We clear-then-set via a microtask so repeat clicks re-announce (otherwise
 * live-region content identical to the previous tick is not re-announced).
 */
export const DefaultPage = component$(() => {
  const message = useSignal('');

  const onSubmit = $(() => {
    message.value = '';
    // Re-set on the next tick so aria-live re-announces on repeat submits.
    queueMicrotask(() => {
      message.value = 'Form submitted';
    });
  });

  return (
    <main>
      <h1>Ogmios Vitest Browser Example</h1>
      <form
        preventdefault:submit
        onSubmit$={onSubmit}
      >
        <button type="submit">Submit</button>
      </form>
      <p aria-live="polite" role="status" data-testid="status">
        {message.value}
      </p>
    </main>
  );
});

/**
 * Alias for SSR tests — the public "what the example exports as its canonical
 * component" name. Keeps imports symmetric with the docs snippets.
 */
export const SubmitButton = DefaultPage;

/**
 * Phase 7 Plan 04 negative-test fixture. The route path contains the magic
 * marker `xxyyzz-not-in-dom` — but this component deliberately does NOT render
 * that marker anywhere. If ogmios captures the marker, the only source is VO
 * reading Chromium's URL bar / tab title / chrome — exactly what the pid
 * filter is meant to suppress. See tests/dom-vs-chrome-url.test.tsx for
 * the paired assertion.
 */
export const NotInDomPage = component$(() => (
  <main>
    <h1>Ogmios Test Page — DOM must not contain the URL marker</h1>
    <button type="button">Click me</button>
    <p aria-live="polite" role="status" id="announced-after-click">
      navigated
    </p>
  </main>
));

/**
 * Phase 7 Plan 04 positive-test fixture. The same magic-marker shape IS in
 * the DOM as visible text, so when VO's cursor lands on the page content the
 * announcement MUST contain it. The paired tests confirm both sides of the
 * filter: negative rejects URL-bar noise, positive accepts DOM content.
 */
export const DomPage = component$(() => (
  <main>
    <h1>Ogmios Test Page — DOM marker visible</h1>
    <p>xxyyzz-DOM-MARKER</p>
    <button type="button">Focus here</button>
  </main>
));

/**
 * Top-level App that routes on `window.location.pathname`, mirroring the
 * React example. Qwik's SSR renders deterministically; `window.location`
 * is only accessed on the client, so SSR reads the default page.
 */
export const App = component$(() => {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path.startsWith('/test-page-xxyyzz-not-in-dom')) return <NotInDomPage />;
  if (path.startsWith('/test-page-xxyyzz-DOM')) return <DomPage />;
  return <DefaultPage />;
});
