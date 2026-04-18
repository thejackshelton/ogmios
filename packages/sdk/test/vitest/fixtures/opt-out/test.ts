import { voiceOver } from 'shoki/vitest/browser';
import { test } from 'vitest';

test('opt-out', async () => {
  await voiceOver.start({});
});
