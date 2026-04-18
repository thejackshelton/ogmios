import type { DoctorReport } from '../report-types.js';

export interface PrintQuietReportOptions {
  write?: (line: string) => void;
}

export function printQuietReport(
  report: DoctorReport,
  opts: PrintQuietReportOptions = {},
): void {
  const write = opts.write ?? ((l: string) => console.log(l));
  const summary = report.ok ? 'ok' : `fail(${report.exitCode})`;
  const failed = report.checks.filter((c) => c.status === 'fail').length;
  const warned = report.checks.filter((c) => c.status === 'warn').length;
  write(
    `ogmios-doctor ${summary} fails=${failed} warns=${warned} exit=${report.exitCode}`,
  );
}
