import type { DoctorReport } from '../report-types.js';

export interface PrintJsonReportOptions {
  write?: (line: string) => void;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  // Buffers shouldn't reach here (TCC grant rows are scope-internal to tcc-grants.ts)
  // but we normalize just in case a check adds one to meta.
  if (value instanceof Uint8Array) {
    return { __type: 'Buffer', hex: Buffer.from(value).toString('hex') };
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * Stable JSON schema — DoctorReport as-is.
 * Buffer fields (none expected at this layer) would need custom handling,
 * but all report fields are JSON-native (strings, numbers, bools, arrays, plain objects).
 */
export function printJsonReport(
  report: DoctorReport,
  opts: PrintJsonReportOptions = {},
): void {
  const write = opts.write ?? ((l: string) => console.log(l));
  write(JSON.stringify(report, jsonReplacer, 2));
}
