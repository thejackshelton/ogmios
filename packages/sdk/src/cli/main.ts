#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { discoverHelper } from './checks/index.js';
import {
  openTCCDatabase,
  SYSTEM_TCC_DB_PATH,
  USER_TCC_DB_PATH,
} from './checks/index-tcc.js';
import { warnOnLegacyStateDir } from './legacy-state.js';
import { ExitCode } from './report-types.js';
import { printHumanReport } from './reporters/human.js';
import { printJsonReport } from './reporters/json.js';
import { printQuietReport } from './reporters/quiet.js';
import {
  DEFAULT_SNAPSHOT_PATH,
  restoreVoSettingsFromSnapshot,
} from './restore-vo-settings.js';
import { runDoctor } from './run-doctor.js';
import {
  resolveReleaseBaseUrlFromPackageJson,
  runSetup,
  SETUP_EXIT,
  type SetupResult,
} from './setup-command.js';

const require = createRequire(import.meta.url);
// Path is relative to dist/cli/main.js — climbs to packages/sdk/package.json.
const pkg = require('../../package.json') as {
  version: string;
  compatibleAppVersion?: string;
  repository?: { url?: string } | string;
};

const program = new Command();

program
  .name('ogmios')
  .description('ogmios CLI — VoiceOver/TCC diagnostics and setup for macOS 14/15/26')
  .version(pkg.version, '-v, --version');

program
  .command('doctor', { isDefault: true })
  .description('Diagnose VoiceOver, TCC, helper, and SIP state on this machine')
  .option('--fix', 'Attempt safe automated remediations (writes VO plist when SIP permits)')
  .option('--json', 'Emit machine-readable JSON instead of human-readable output')
  .option('--quiet', 'Only print summary + exit code (suitable for pre-commit hooks)')
  .option('--helper-path <path>', 'Override the OgmiosRunner.app path (also: $OGMIOS_HELPER_PATH)')
  .action(
    async (opts: {
      fix?: boolean;
      json?: boolean;
      quiet?: boolean;
      helperPath?: string;
    }) => {
      // CONTEXT.md D-05: announce surviving shoki/dicta/munadi state dirs on
      // stderr before any structured output is produced (keeps --json/--quiet
      // stdout contracts clean).
      if (!opts.json) {
        warnOnLegacyStateDir();
      }

      const report = await runDoctor({
        fix: opts.fix,
        helperPath: opts.helperPath ?? process.env.OGMIOS_HELPER_PATH,
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
  .description(
    'Download Ogmios.app + Ogmios Setup.app from GitHub Releases, install into ~/Applications, and launch the TCC-prompt setup GUI',
  )
  .option('--force', 'Redownload + reinstall even if apps are already present')
  .option(
    '--no-download',
    'Fail if apps are missing (never make a network request) — use for pre-seeded CI',
  )
  .option(
    '--install-dir <path>',
    'Override the install directory (default: ~/Applications)',
  )
  .option('--skip-launch', 'Download + install but do not auto-open Ogmios Setup.app')
  .option('--json', 'Emit structured JSON output (SetupResult) for CI pipelines')
  .option(
    '--version <ver>',
    "Download a specific Ogmios.app version (default: SDK's compatibleAppVersion)",
  )
  .option(
    '--dry-run',
    'Print the resolved download URL + install dir without touching the network or filesystem',
  )
  .action(
    async (opts: {
      force?: boolean;
      download?: boolean; // commander inverts --no-download into download:false
      installDir?: string;
      skipLaunch?: boolean;
      json?: boolean;
      version?: string;
      dryRun?: boolean;
    }) => {
      // CONTEXT.md D-05: same legacy-state notice as `doctor`, suppressed
      // under --json to preserve the machine-readable stdout contract.
      if (!opts.json) {
        warnOnLegacyStateDir();
      }

      const releaseBaseUrl = (() => {
        try {
          return resolveReleaseBaseUrlFromPackageJson(pkg);
        } catch {
          return 'https://github.com/thejackshelton/ogmios/releases/download';
        }
      })();

      let result: SetupResult;
      try {
        result = await runSetup({
          force: opts.force,
          noDownload: opts.download === false,
          installDir: opts.installDir,
          skipLaunch: opts.skipLaunch,
          json: opts.json,
          version: opts.version,
          dryRun: opts.dryRun,
          compatibleAppVersion: pkg.compatibleAppVersion,
          releaseBaseUrl,
        });
      } catch (err) {
        const exitCode =
          (err as { exitCode?: number } | null)?.exitCode ?? SETUP_EXIT.GENERIC;
        const message = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          process.stdout.write(
            `${JSON.stringify({ ok: false, error: message, exitCode })}\n`,
          );
        } else {
          console.error(message);
        }
        process.exit(exitCode);
      }

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } else if (opts.dryRun) {
        console.log(`Would download: ${result.downloadedFromUrl}`);
        console.log(`Would install to: ${result.installDir}`);
      } else {
        switch (result.action) {
          case 'downloaded':
            console.log(
              `Installed Ogmios.app + Ogmios Setup.app into ${result.installDir}`,
            );
            break;
          case 'reinstalled':
            console.log(
              `Reinstalled Ogmios.app + Ogmios Setup.app into ${result.installDir}`,
            );
            break;
          case 'launched-only':
            console.log(
              `Ogmios.app already installed at ${result.installDir}; launched Ogmios Setup.app`,
            );
            break;
          case 'noop':
            console.log('No action taken.');
            break;
        }
        if (result.launched) {
          console.log('Ogmios Setup.app has exited.');
        }
      }
      process.exit(result.exitCode);
    },
  );

program
  .command('info')
  .description('Print diagnostic context (paste this in bug reports)')
  .action(async () => {
    const helperResult = await discoverHelper();
    const userOpen = openTCCDatabase(USER_TCC_DB_PATH);
    const systemOpen = openTCCDatabase(SYSTEM_TCC_DB_PATH);
    if (userOpen.ok) userOpen.db.close();
    if (systemOpen.ok) systemOpen.db.close();

    console.log(`ogmios v${pkg.version}`);
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
    'Escape hatch: re-apply the VO plist snapshot written by ogmios. Use this if a crash (SIGKILL, OOM, power loss) left your Mac with altered VoiceOver settings (Plan 07-05).',
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
          /<key>_ogmios_snapshot_version<\/key>\s*<integer>\d+<\/integer>/.test(
            xml,
          );
        if (!hasVersion) {
          console.error(
            `File at ${opts.path} is not a recognized ogmios snapshot (missing _ogmios_snapshot_version).`,
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
              `If you set $OGMIOS_SNAPSHOT_PATH during the ogmios run, pass --path.`,
          );
          process.exit(1);
          break;
        case 'SNAPSHOT_UNRECOGNIZED':
          console.error(
            `File at ${opts.path} is not a recognized ogmios snapshot (missing _ogmios_snapshot_version).`,
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
