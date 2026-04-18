export type { AnnouncementShape, ToHaveStableLogOptions } from './types.js';
export {
  toHaveAnnounced,
  toHaveAnnouncedText,
  toHaveNoAnnouncement,
  toHaveStableLog,
} from './matchers.js';
export { makeEvent, nextTs, resetClock } from './fixtures.js';
// Re-export the side-effect module augmentation so `import '@shoki/core/matchers'`
// is enough to get typed matchers once the user also imports '@shoki/core/vitest/setup'.
import './types.js';
