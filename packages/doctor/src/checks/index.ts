export { checkMacOSVersion, parseMajorVersion } from './macos-version.js';
export {
  checkVOPlist,
  defaultPlistReader,
  readSCREnableAppleScript,
  resolvePlistPath,
} from './vo-plist.js';
export { discoverHelper, type HelperLocation } from './helper-discovery.js';
export {
  checkHelperSignature,
  type CodesignOutput,
  parseCodesignOutput,
} from './helper-signature.js';
export {
  checkSIPStatus,
  type CsrutilParsed,
  parseCsrutilOutput,
} from './sip-status.js';
