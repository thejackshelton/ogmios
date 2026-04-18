import { voiceOver } from 'dicta/vitest/browser';
import { test } from 'vitest';

test('x', async () => {
  await voiceOver.start({});
});
