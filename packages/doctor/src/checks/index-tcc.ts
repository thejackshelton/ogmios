export {
  openTCCDatabase,
  SYSTEM_TCC_DB_PATH,
  type TCCOpenResult,
  USER_TCC_DB_PATH,
} from './tcc-db-paths.js';

export {
  compareCSReq,
  type CSReqCompareResult,
  parseCSReqBlob,
} from './csreq-compare.js';

export {
  checkTCCAccessibility,
  checkTCCAutomation,
  checkTCCStaleEntries,
  type EnumerateTCCGrantsOptions,
  type EnumerateTCCGrantsResult,
  enumerateTCCGrants,
  type TCCGrantRow,
} from './tcc-grants.js';
