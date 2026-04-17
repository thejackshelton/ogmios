export type { AnnouncementShape, ToHaveStableLogOptions } from './types.js';
export {
  toHaveAnnounced,
  toHaveAnnouncedText,
  toHaveNoAnnouncement,
  toHaveStableLog,
} from './matchers.js';
// Re-export the side-effect module augmentation so `import '@shoki/matchers'`
// is enough to get typed matchers once the user also imports /setup.
import './types.js';
