import { type ShokiBrowserSession, voiceOver } from '@shoki/vitest/browser';
import { page } from '@vitest/browser/context';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { App } from '../src/App.js';

// Vite exposes only explicitly declared env vars to browser code via import.meta.env.
// Both SHOKI_INTEGRATION and the host platform are stamped into the test bundle at
// transform time (see vitest.config.ts `define`). Fallback to `false` when missing.
const integrationMode = import.meta.env.SHOKI_INTEGRATION === '1';
const isDarwin = import.meta.env.SHOKI_PLATFORM === 'darwin';
const runVoTest = integrationMode && isDarwin;

describe('vitest-browser-react canonical example (VITEST-07)', () => {
  it('renders the Submit button with the correct accessible name', async () => {
    render(<App />);
    await expect.element(page.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  describe('with real VoiceOver (SHOKI_INTEGRATION=1 on darwin)', () => {
    let session: ShokiBrowserSession | undefined;

    beforeAll(async () => {
      if (!runVoTest) return;
      session = await voiceOver.start({ mute: true });
    }, 30_000);

    afterAll(async () => {
      if (session) {
        await session.stop();
        session = undefined;
      }
    });

    it.skipIf(!runVoTest)(
      'announces the Submit button on click and shows the Form submitted status',
      async () => {
        if (!session) throw new Error('session not initialized');

        render(<App />);
        // Wait for VO to settle after the render.
        await session.awaitStable({ quietMs: 500, timeoutMs: 10_000 });
        await session.reset();

        // Focus + click the Submit button via Playwright's built-in commands.
        const submit = page.getByRole('button', { name: 'Submit' });
        await submit.click();

        // Wait for both the focus-move announcement (if any) and the live-region
        // announcement to settle.
        const log = await session.awaitStable({ quietMs: 500, timeoutMs: 10_000 });

        // Primary assertion: the Submit button was announced with its role + accessible name.
        expect(log).toHaveAnnounced({ role: 'button', name: 'Submit' });

        // Secondary assertion: the live region announced the success text.
        expect(log).toHaveAnnouncedText(/Form submitted/i);
      },
      30_000,
    );
  });
});
