import '@shoki/matchers'; // side-effect: augments Vitest's Assertion with toHaveAnnounced etc.
import { type ShokiBrowserSession, voiceOver } from '@shoki/vitest/browser';
import { page } from '@vitest/browser/context';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { App } from '../src/App.js';

/**
 * Phase 7 Plan 04 — "DOM content vs Chrome URL bar" paired regression gate.
 *
 * CONTEXT.md calls this the "most important functional requirement" for
 * Phase 7: shoki captures announcements from the DOM content Vitest is
 * actually testing, NOT from Chromium's URL bar / tab title / address-bar
 * autofill / window chrome.
 *
 * The paired tests work together:
 *
 *   NEGATIVE: a magic marker string `xxyyzz-not-in-dom` is embedded in the URL
 *   path (so VO *could* announce it via chrome). The rendered component
 *   deliberately omits the marker. Assertion: the captured log does NOT
 *   contain the marker. If this test starts failing, the pid-filter or
 *   focus-first pattern regressed — chrome noise is leaking into the log.
 *
 *   POSITIVE: the same shape of magic marker IS rendered as visible DOM text
 *   (`xxyyzz-DOM-MARKER`). With VO focused on the page content, the
 *   announcement MUST contain it. If this test starts failing, the AX
 *   observer is over-filtering — we've become blind to real DOM content too.
 *
 * Both tests together pin the filter's shape: it rejects chrome, it accepts
 * DOM. A single-sided test could pass for the wrong reason (e.g. an empty
 * log passes the negative check but also proves nothing).
 *
 * Gated on SHOKI_INTEGRATION=1 + darwin; everywhere else, skip cleanly.
 */

const integrationMode = import.meta.env.SHOKI_INTEGRATION === '1';
const isDarwin = import.meta.env.SHOKI_PLATFORM === 'darwin';
const runVoTest = integrationMode && isDarwin;

/**
 * Vitest browser-mode's `page` doesn't expose goto/locator directly — it's a
 * testing-library-shaped surface. For this plan the App component reads
 * `window.location.pathname` at render time, so a direct history.pushState
 * before render is sufficient to pick the right route fixture.
 */
function navigate(path: string): void {
  window.history.pushState({}, '', path);
}

describe('DOM content vs Chrome URL bar (CONTEXT.md most-important)', () => {
  let session: ShokiBrowserSession | undefined;

  beforeAll(async () => {
    if (!runVoTest) return;
    session = await voiceOver.start({ mute: true });
  }, 30_000);

  afterAll(async () => {
    if (session) {
      await session.end();
      session = undefined;
    }
  });

  it.skipIf(!runVoTest)(
    'NEGATIVE: URL-only magic string must NOT appear in captured log',
    async () => {
      if (!session) throw new Error('session missing');

      // The magic marker lives in the URL path; the component at that path
      // deliberately does NOT render it. If VO "reads" the URL bar we'd pick
      // it up via chrome-noise paths we're trying to filter out.
      const magicInUrl = 'xxyyzz-not-in-dom';
      navigate(`/test-page-${magicInUrl}`);
      render(<App />); // component branch selects via window.location.pathname

      // Anchor VO cursor in the page content, not the window chrome: click
      // the "Click me" button (also our announcement trigger). Clicking a
      // focused element via Playwright sets focus inside the test viewport.
      await session.awaitStable({ quietMs: 500, timeoutMs: 10_000 });
      await session.reset();

      // Drive a page-content announcement so the log is non-empty (we want
      // the sanity check below to catch a silently-empty log).
      await page.getByRole('button', { name: 'Click me' }).click();
      const log = await session.awaitStable({ quietMs: 1000, timeoutMs: 10_000 });

      const haystack = log.map((e) => e.phrase).join(' | ');

      // Critical assertion: the URL-bar-only magic MUST NOT leak into the log.
      expect(haystack).not.toContain(magicInUrl);

      // Sanity: log non-empty (proves we didn't trivially pass via no capture).
      expect(log.length).toBeGreaterThan(0);
    },
    45_000,
  );

  it.skipIf(!runVoTest)(
    'POSITIVE: same magic string appears when it IS in the DOM',
    async () => {
      if (!session) throw new Error('session missing');

      navigate('/test-page-xxyyzz-DOM');
      render(<App />);

      await session.reset();

      // Focus the button adjacent to the marker; VO announces DOM content as
      // it navigates through the page. Clicking the button anchors focus in
      // page content AND triggers VO to walk nearby siblings when configured
      // to read in sequence.
      await page.getByRole('button', { name: 'Focus here' }).click();

      const log = await session.awaitStable({ quietMs: 1000, timeoutMs: 10_000 });
      const haystack = log.map((e) => e.phrase).join(' | ');

      // The marker is in the DOM; VO MUST announce it when cursor lands on
      // the page content. Failure here means we're over-filtering.
      expect(haystack).toContain('xxyyzz-DOM-MARKER');
    },
    45_000,
  );
});
