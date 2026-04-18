import { describe, expect, it } from 'vitest';
import { renderSSR } from 'vitest-browser-qwik';
import { DefaultPage } from '../src/app';

/**
 * Unique Ogmios + Qwik capability: the server-rendered HTML IS the initial
 * accessibility tree — before any JavaScript runs. This test asserts on the
 * a11y shape that VoiceOver would encounter if the user's browser had JS
 * disabled or if they're reading before hydration.
 *
 * Other framework integrations (vitest-browser-react) only show post-mount /
 * post-hydration state. Qwik's `renderSSR()` exposes the genuine SSR output,
 * which directly maps to "what the screen reader sees first."
 *
 * No VoiceOver gate here: SSR output is deterministic and synchronous; we
 * can assert on the HTML string without booting a screen reader. This keeps
 * the test green on every OS/CI combination.
 */
describe('vitest-browser-qwik SSR accessibility tree', () => {
  it('SSR-renders the Submit button with live region and correct a11y attributes', async () => {
    const screen = await renderSSR(<DefaultPage />);

    // The SSR HTML IS the initial a11y tree — test it directly, pre-hydration.
    expect(screen.container.innerHTML).toContain('role="status"');
    expect(screen.container.innerHTML).toContain('aria-live="polite"');

    // DOM queries also work against the SSR-rendered content.
    await expect.element(screen.getByRole('button', { name: 'Submit' })).toBeVisible();
    await expect.element(screen.getByRole('status')).toBeInTheDocument();
  });

  it('SSR output includes the accessible heading for context', async () => {
    const screen = await renderSSR(<DefaultPage />);
    await expect
      .element(screen.getByRole('heading', { name: /Ogmios Vitest Browser Example/ }))
      .toBeVisible();
  });
});
