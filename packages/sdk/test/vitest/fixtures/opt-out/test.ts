import { voiceOver } from 'dicta/vitest/browser';
import { test } from 'vitest';

test('opt-out', async () => {
  await voiceOver.start({});
});
