import { type ShokiBrowserSession, voiceOver } from '@shoki/vitest/browser';
import { page } from '@vitest/browser/context';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-qwik';
import { DefaultPage } from '../src/app';

// Vite exposes only explicitly declared env vars to browser code via
// import.meta.env. Both SHOKI_INTEGRATION and the host platform are stamped
// into the test bundle at transform time (see vitest.config.ts `define`).
const integrationMode = import.meta.env.SHOKI_INTEGRATION === '1';
const isDarwin = import.meta.env.SHOKI_PLATFORM === 'darwin';
const runVoTest = integrationMode && isDarwin;

describe('vitest-browser-qwik canonical CSR example', () => {
  it('renders the Submit button with the correct accessible name', async () => {
    const screen = await render(<DefaultPage />);
    await expect.element(screen.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  describe('with real VoiceOver (SHOKI_INTEGRATION=1 on darwin)', () => {
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
      'announces the Submit button on click and shows the Form submitted status',
      async () => {
        if (!session) throw new Error('session not initialized');

        await render(<DefaultPage />);
        // Wait for VO to settle after the render.
        await session.awaitStable({ quietMs: 500, timeoutMs: 10_000 });
        await session.reset();

        // Focus + click the Submit button via Playwright's built-in commands.
        const submit = page.getByRole('button', { name: 'Submit' });
        await submit.click();

        // Wait for both the focus-move announcement (if any) and the
        // live-region announcement to settle.
        const log = await session.awaitStable({ quietMs: 500, timeoutMs: 10_000 });

        // Primary assertion: the Submit button was announced with role + name.
        expect(log).toHaveAnnounced({ role: 'button', name: 'Submit' });

        // Secondary assertion: the live region announced the success text.
        expect(log).toHaveAnnouncedText(/Form submitted/i);
      },
      30_000,
    );
  });
});
