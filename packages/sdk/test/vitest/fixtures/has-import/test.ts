import { voiceOver } from '@shoki/core/vitest/browser';
import { test } from 'vitest';

test('x', async () => {
  await voiceOver.start({});
});
