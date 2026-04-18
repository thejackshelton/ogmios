#!/usr/bin/env node
import { execa } from 'execa';
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
import {
  DEFAULT_SNAPSHOT_PATH,
  restoreVoSettingsFromSnapshot,
} from './restore-vo-settings.js';
import { runDoctor } from './run-doctor.js';
import { resolveSetupAppPath } from './setup-app-path.js';

const require = createRequire(import.meta.url);
// Path is relative to dist/cli/main.js — climbs to packages/sdk/package.json.
const pkg = require('../../package.json') as { version: string };

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
  .description('Launch the macOS GUI setup app to grant required TCC permissions')
  .option('--dry-run', 'Print the resolved ShokiSetup.app path without opening it')
  .action(async (opts: { dryRun?: boolean }) => {
    const resolved = await resolveSetupAppPath();
    if (!resolved.path) {
      console.error(
        'ShokiSetup.app not found. Install @shoki/binding-darwin-arm64 or\n' +
          '@shoki/binding-darwin-x64, or set $SHOKI_SETUP_APP_PATH.\n' +
          `Searched:\n  - ${resolved.searched.join('\n  - ')}`,
      );
      process.exit(ExitCode.HELPER_MISSING);
    }
    if (opts.dryRun) {
      console.log(resolved.path);
      return;
    }
    try {
      await execa('/usr/bin/open', [resolved.path]);
      console.log(`Launched ${resolved.path}`);
    } catch (err) {
      console.error(
        `Failed to launch ${resolved.path}: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(ExitCode.UNKNOWN_ERROR);
    }
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

program
  .command('restore-vo-settings')
  .description(
    'Escape hatch: re-apply the VO plist snapshot written by shoki. Use this if a crash (SIGKILL, OOM, power loss) left your Mac with altered VoiceOver settings (Plan 07-05).',
  )
  .option('-p, --path <path>', 'Snapshot file path', DEFAULT_SNAPSHOT_PATH)
  .option('-f, --force', 'Apply even if the snapshot is >7 days old')
  .option('--dry-run', 'Print what would be restored without applying')
  .action(
    async (opts: {
      path: string;
      force?: boolean;
      dryRun?: boolean;
    }) => {
      if (opts.dryRun) {
        // Dry-run still reads + validates the snapshot but never calls
        // `defaults write`. We implement this by reporting what the happy
        // path would do without invoking execa — easiest way is to read the
        // file, perform the validation gates, and print the keys.
        const { readFile } = await import('node:fs/promises');
        let xml: string;
        try {
          xml = await readFile(opts.path, 'utf8');
        } catch {
          console.error(`No snapshot at ${opts.path} — nothing to restore.`);
          process.exit(1);
        }
        const hasVersion =
          /<key>_shoki_snapshot_version<\/key>\s*<integer>\d+<\/integer>/.test(
            xml,
          );
        if (!hasVersion) {
          console.error(
            `File at ${opts.path} is not a recognized shoki snapshot (missing _shoki_snapshot_version).`,
          );
          process.exit(2);
        }
        console.log(`[dry-run] Would restore VO settings from ${opts.path}`);
        const keyMatches = xml.match(/<key>([^_][^<]+)<\/key>/g) ?? [];
        for (const k of keyMatches) {
          console.log(`  - ${k.replace(/<\/?key>/g, '')}`);
        }
        process.exit(0);
      }

      const result = await restoreVoSettingsFromSnapshot({
        snapshotPath: opts.path,
        force: opts.force,
      });
      if (result.ok) {
        console.log(
          `Restored ${result.restoredKeys?.length ?? 0} keys from ${opts.path}`,
        );
        process.exit(0);
      }

      switch (result.code) {
        case 'SNAPSHOT_MISSING':
          console.error(
            `No snapshot at ${opts.path} — nothing to restore.\n` +
              `If you set $SHOKI_SNAPSHOT_PATH during the shoki run, pass --path.`,
          );
          process.exit(1);
          break;
        case 'SNAPSHOT_UNRECOGNIZED':
          console.error(
            `File at ${opts.path} is not a recognized shoki snapshot (missing _shoki_snapshot_version).`,
          );
          process.exit(2);
          break;
        case 'SNAPSHOT_STALE':
          console.error(
            `Snapshot is ${Math.floor((result.snapshotAgeSeconds ?? 0) / 86400)} days old (>7).\n` +
              `Pass --force to apply anyway, or delete ${opts.path} if you don't trust it.`,
          );
          process.exit(2);
          break;
        case 'WRITE_FAILED':
          console.error(
            `${result.failures?.length ?? 0} key(s) failed to restore:`,
          );
          for (const f of result.failures ?? []) {
            console.error(`  ${f.key}: ${f.error}`);
          }
          console.error(`${result.restoredKeys?.length ?? 0} key(s) succeeded.`);
          process.exit(2);
          break;
        default:
          console.error(`Unknown error: ${result.code}`);
          process.exit(ExitCode.UNKNOWN_ERROR);
      }
    },
  );

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(ExitCode.UNKNOWN_ERROR);
});
