import {
  toHaveAnnounced,
  toHaveAnnouncedText,
  toHaveNoAnnouncement,
  toHaveStableLog,
} from '../matchers/index.js';
import { expect } from 'vitest';

// Re-export the module augmentation so `import 'shoki/vitest/setup'` is
// enough to both register the matchers AND type them on Vitest's `expect`.
import '../matchers/index.js';

expect.extend({
  toHaveAnnounced,
  toHaveAnnouncedText,
  toHaveNoAnnouncement,
  toHaveStableLog,
});
