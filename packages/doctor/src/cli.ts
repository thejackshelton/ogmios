#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { discoverHelper } from './checks/index.js';
import {
  openTCCDatabase,
  SYSTEM_TCC_DB_PATH,
  USER_TCC_DB_PATH,
} from './checks/index-tcc.js';
import { ExitCode } from './report-types.js';
import { printHumanReport } from './reporters/human.js';
import { printJsonReport } from './reporters/json.js';
import { printQuietReport } from './reporters/quiet.js';
import { runDoctor } from './run-doctor.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('shoki')
  .description('shoki CLI — VoiceOver/TCC diagnostics and setup for macOS 14/15/26')
  .version(pkg.version, '-v, --version');

program
  .command('doctor', { isDefault: true })
  .description('Diagnose VoiceOver, TCC, helper, and SIP state on this machine')
  .option('--fix', 'Attempt safe automated remediations (writes VO plist when SIP permits)')
  .option('--json', 'Emit machine-readable JSON instead of human-readable output')
  .option('--quiet', 'Only print summary + exit code (suitable for pre-commit hooks)')
  .option('--helper-path <path>', 'Override the ShokiRunner.app path (also: $SHOKI_HELPER_PATH)')
  .action(
    async (opts: {
      fix?: boolean;
      json?: boolean;
      quiet?: boolean;
      helperPath?: string;
    }) => {
      const report = await runDoctor({
        fix: opts.fix,
        helperPath: opts.helperPath ?? process.env.SHOKI_HELPER_PATH,
      });

      if (opts.json) {
        printJsonReport(report);
      } else if (opts.quiet) {
        printQuietReport(report);
      } else {
        printHumanReport(report);
      }

      process.exit(report.exitCode);
    },
  );

program
  .command('setup')
  .description('Alias for `shoki doctor --fix` (discoverability)')
  .action(async () => {
    const report = await runDoctor({ fix: true });
    printHumanReport(report);
    process.exit(report.exitCode);
  });

program
  .command('info')
  .description('Print diagnostic context (paste this in bug reports)')
  .action(async () => {
    const helperResult = await discoverHelper();
    const userOpen = openTCCDatabase(USER_TCC_DB_PATH);
    const systemOpen = openTCCDatabase(SYSTEM_TCC_DB_PATH);
    if (userOpen.ok) userOpen.db.close();
    if (systemOpen.ok) systemOpen.db.close();

    console.log(`shoki v${pkg.version}`);
    console.log(`node ${process.version}`);
    console.log(`platform ${process.platform} ${process.arch}`);
    console.log(
      `helper: ${helperResult.location ? `${helperResult.location.path} (${helperResult.location.source})` : '<none>'}`,
    );
    console.log(
      `tcc.user: ${userOpen.ok ? 'accessible' : `inaccessible (${!userOpen.ok ? userOpen.reason : ''})`}`,
    );
    console.log(
      `tcc.system: ${systemOpen.ok ? 'accessible' : `inaccessible (${!systemOpen.ok ? systemOpen.reason : ''})`}`,
    );
    process.exit(ExitCode.OK);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(ExitCode.UNKNOWN_ERROR);
});
