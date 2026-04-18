import { useState } from 'react';

/**
 * The default landing page — exercised by app.test.tsx. Unchanged from the
 * pre-Plan-04 component: a simple aria-live status update on Submit.
 */
function DefaultPage() {
  const [message, setMessage] = useState('');

  const onSubmit = () => {
    // Clear then set after a tick so the aria-live region re-announces even on repeat clicks.
    setMessage('');
    requestAnimationFrame(() => setMessage('Form submitted'));
  };

  return (
    <main>
      <h1>Shoki Vitest Browser Example</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <button type="submit">Submit</button>
      </form>
      <p aria-live="polite" role="status" data-testid="status">
        {message}
      </p>
    </main>
  );
}

/**
 * Phase 7 Plan 04 negative-test fixture. The route path contains the magic
 * marker `xxyyzz-not-in-dom` — but this component deliberately does NOT render
 * that marker anywhere. If shoki captures the marker, the only source is VO
 * reading Chromium's URL bar / tab title / chrome — exactly what we want to
 * filter out. See tests/dom-vs-chrome-url.test.tsx for the assertion.
 */
function NotInDomPage() {
  return (
    <main>
      <h1>Shoki Test Page — DOM must not contain the URL marker</h1>
      <button type="button">Click me</button>
      <p aria-live="polite" role="status" id="announced-after-click">
        navigated
      </p>
    </main>
  );
}

/**
 * Phase 7 Plan 04 positive-test fixture. The same magic marker shape IS in
 * the DOM as visible text, so when VO's cursor lands on the page content the
 * announcement MUST contain it. The paired tests confirm both sides of the
 * filter: negative rejects URL-bar noise, positive accepts DOM content.
 */
function DomPage() {
  return (
    <main>
      <h1>Shoki Test Page — DOM marker visible</h1>
      <p>xxyyzz-DOM-MARKER</p>
      <button type="button">Focus here</button>
    </main>
  );
}

export function App() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path.startsWith('/test-page-xxyyzz-not-in-dom')) return <NotInDomPage />;
  if (path.startsWith('/test-page-xxyyzz-DOM')) return <DomPage />;
  return <DefaultPage />;
}
