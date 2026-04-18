export type {
  CheckId,
  CheckStatus,
  DoctorCheckResult,
  DoctorReport,
  FixAction,
} from './report-types.js';
export { EXIT_CODE_PRIORITY, ExitCode, resolveExitCode } from './report-types.js';

export { type RunDoctorOptions, runDoctor } from './run-doctor.js';
export {
  applyFixActions,
  type ApplyFixActionsOptions,
  type FixExecutionResult,
} from './fix-executor.js';

export { printHumanReport } from './reporters/human.js';
export { printJsonReport } from './reporters/json.js';
export { printQuietReport } from './reporters/quiet.js';

export {
  DoctorError,
  HelperNotFoundError,
  NonDarwinHostError,
  UnsupportedMacOSError,
} from './errors.js';
