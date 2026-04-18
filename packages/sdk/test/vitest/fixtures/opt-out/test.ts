import { voiceOver } from '@shoki/core/vitest/browser';
import { test } from 'vitest';

test('opt-out', async () => {
  await voiceOver.start({});
});
