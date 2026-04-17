import { useState } from 'react';

export function App() {
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
