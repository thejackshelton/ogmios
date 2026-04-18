import pc from 'picocolors';
import type { DoctorReport, FixAction } from '../report-types.js';

const STATUS_GLYPH = {
  pass: '✔',
  fail: '✖',
  warn: '⚠',
  skip: '·',
} as const;

const STATUS_COLOR = {
  pass: pc.green,
  fail: pc.red,
  warn: pc.yellow,
  skip: pc.gray,
} as const;

export interface PrintHumanReportOptions {
  /** Test seam: capture lines instead of writing to stdout. */
  write?: (line: string) => void;
  /** Disable color (useful for snapshot tests). */
  noColor?: boolean;
}

function id<T>(v: T): T {
  return v;
}

function renderFixActionOneLiner(a: FixAction): string | null {
  switch (a.kind) {
    case 'defaults-write':
      return `defaults write "${a.plistPath}" ${a.key} -bool ${a.value ? 'true' : 'false'}`;
    case 'open-system-settings':
      return `open "${a.url}"`;
    case 'launch-setup-app':
      // Plan 08-04: the GUI path is the recommended fix (triggers TCC
      // prompts via a bundled .app trust anchor — Phase 7 lesson).
      return a.appPath
        ? `open "${a.appPath}"  # or: shoki setup`
        : 'shoki setup  # launches ShokiSetup.app to grant TCC permissions';
    case 'manual':
      return a.instructions[0] ?? null;
  }
}

export function printHumanReport(
  report: DoctorReport,
  opts: PrintHumanReportOptions = {},
): void {
  const write = opts.write ?? ((l: string) => console.log(l));
  const color = opts.noColor
    ? { pass: id, fail: id, warn: id, skip: id, bold: id, dim: id }
    : {
        pass: pc.green,
        fail: pc.red,
        warn: pc.yellow,
        skip: pc.gray,
        bold: pc.bold,
        dim: pc.dim,
      };

  write(color.bold('shoki doctor'));
  write(
    color.dim(
      `  macOS: ${report.macOSVersion ?? '?'}   helper: ${report.helperPath ?? '<none>'}   mode: ${report.mode}`,
    ),
  );
  write('');

  for (const c of report.checks) {
    const glyph = STATUS_GLYPH[c.status];
    const glyphColor = opts.noColor ? id : STATUS_COLOR[c.status];
    write(`  ${glyphColor(glyph)} ${c.id.padEnd(22)} ${c.summary}`);
    if (c.detail) {
      for (const line of c.detail.split('\n')) {
        write(color.dim(`      ${line}`));
      }
    }
    if (c.fixActions && c.fixActions.length > 0) {
      for (const a of c.fixActions) {
        const line = renderFixActionOneLiner(a);
        if (line) write(color.dim(`      → ${line}`));
      }
    }
  }

  write('');
  if (report.ok) {
    write(color.pass('  OK — shoki is ready on this machine.'));
  } else {
    write(color.fail(`  exit=${report.exitCode} — fix the ✖ items above and rerun.`));
  }
}
