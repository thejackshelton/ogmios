import { CSREQ_DEVELOPER_ID_JACK, CSREQ_DEVELOPER_ID_OLD } from './csreq-blobs.js';

export interface TCCRowFixture {
  client: string;
  service: string;
  auth_value: number;
  csreq: Buffer;
  indirect_object_identifier: string | null;
}

// A grant for ShokiRunner to do Accessibility, signed with the current helper identity.
export const ROW_ACCESSIBILITY_GRANTED: TCCRowFixture = {
  client: 'com.shoki.runner',
  service: 'kTCCServiceAccessibility',
  auth_value: 2, // allowed
  csreq: CSREQ_DEVELOPER_ID_JACK,
  indirect_object_identifier: null,
};

// An Automation grant: client=ShokiRunner controls indirect_object=VoiceOver.
export const ROW_AUTOMATION_VOICEOVER_GRANTED: TCCRowFixture = {
  client: 'com.shoki.runner',
  service: 'kTCCServiceAppleEvents',
  auth_value: 2,
  csreq: CSREQ_DEVELOPER_ID_JACK,
  indirect_object_identifier: 'com.apple.VoiceOver',
};

// A stale Accessibility grant: csreq is from the old signature.
export const ROW_ACCESSIBILITY_STALE: TCCRowFixture = {
  client: 'com.shoki.runner',
  service: 'kTCCServiceAccessibility',
  auth_value: 2,
  csreq: CSREQ_DEVELOPER_ID_OLD,
  indirect_object_identifier: null,
};

// Denied grant.
export const ROW_ACCESSIBILITY_DENIED: TCCRowFixture = {
  client: 'com.shoki.runner',
  service: 'kTCCServiceAccessibility',
  auth_value: 0,
  csreq: CSREQ_DEVELOPER_ID_JACK,
  indirect_object_identifier: null,
};

// Unrelated grant for Terminal — should be filtered when the client-match set doesn't include Terminal.
export const ROW_UNRELATED_TERMINAL: TCCRowFixture = {
  client: 'com.apple.Terminal',
  service: 'kTCCServiceAccessibility',
  auth_value: 2,
  csreq: CSREQ_DEVELOPER_ID_JACK,
  indirect_object_identifier: null,
};

export const ROW_AUTOMATION_WRONG_TARGET: TCCRowFixture = {
  client: 'com.shoki.runner',
  service: 'kTCCServiceAppleEvents',
  auth_value: 2,
  csreq: CSREQ_DEVELOPER_ID_JACK,
  indirect_object_identifier: 'com.apple.SystemEvents', // not VoiceOver
};
