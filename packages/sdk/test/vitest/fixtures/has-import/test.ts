import { voiceOver } from 'munadi/vitest/browser';
import { test } from 'vitest';

test('x', async () => {
  await voiceOver.start({});
});
