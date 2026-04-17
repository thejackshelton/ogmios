import { voiceOver } from '@shoki/vitest/browser';
import { test } from 'vitest';

test('x', async () => {
  await voiceOver.start({});
});
