export type {
  CheckId,
  CheckStatus,
  DoctorCheckResult,
  DoctorReport,
  FixAction,
} from './report-types.js';
export { ExitCode, resolveExitCode, EXIT_CODE_PRIORITY } from './report-types.js';

export { runDoctor, type RunDoctorOptions } from './run-doctor.js';

export {
  DoctorError,
  UnsupportedMacOSError,
  HelperNotFoundError,
  NonDarwinHostError,
} from './errors.js';
