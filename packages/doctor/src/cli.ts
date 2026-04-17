#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { ExitCode } from './report-types.js';
import { runDoctor } from './run-doctor.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('shoki')
  .description('shoki CLI — VoiceOver/TCC diagnostics and setup')
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

      // Plan 02-04 replaces these print branches with real reporters
      // (packages/doctor/src/reporters/human.ts, json.ts, quiet.ts).
      // For Plan 02-01 we emit a placeholder so the binary is demonstrably wired.
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else if (opts.quiet) {
        console.log(`exit=${report.exitCode}`);
      } else {
        console.log('shoki doctor (Plan 02-01 scaffold — checks added in Plans 02-02/03/04)');
        console.log(`  checks run: ${report.checks.length}`);
        console.log(`  exitCode:   ${report.exitCode}`);
      }

      process.exit(report.exitCode);
    },
  );

program
  .command('setup')
  .description('Alias for `shoki doctor --fix` (discoverability)')
  .action(async () => {
    const report = await runDoctor({ fix: true });
    process.exit(report.exitCode);
  });

program
  .command('info')
  .description('Print diagnostic context (paste this in bug reports)')
  .action(async () => {
    // Plan 02-04 fleshes this out with binding paths + TCC.db status.
    console.log(`shoki v${pkg.version}`);
    console.log(`node ${process.version}`);
    console.log(`platform ${process.platform} ${process.arch}`);
    process.exit(ExitCode.OK);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(ExitCode.UNKNOWN_ERROR);
});
