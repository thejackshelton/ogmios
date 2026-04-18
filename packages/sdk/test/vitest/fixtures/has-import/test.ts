import { voiceOver } from 'ogmios/vitest/browser';
import { test } from 'vitest';

test('x', async () => {
  await voiceOver.start({});
});
