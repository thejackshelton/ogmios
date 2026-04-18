import { describe, expect, it } from 'vitest';
import {
  checkMacOSVersion,
  parseMajorVersion,
} from '../../src/cli/checks/macos-version.js';
import { ExitCode } from '../../src/cli/report-types.js';
import {
  SW_VERS_FUTURE,
  SW_VERS_OLD_VENTURA,
  SW_VERS_SEQUOIA,
  SW_VERS_SONOMA,
  SW_VERS_TAHOE,
  SW_VERS_TRAILING_WHITESPACE,
} from './fixtures/sw-vers-output.js';

describe('parseMajorVersion', () => {
  it.each([
    [SW_VERS_SONOMA, 14],
    [SW_VERS_SEQUOIA, 15],
    [SW_VERS_TAHOE, 26],
    [SW_VERS_OLD_VENTURA, 13],
    [SW_VERS_FUTURE, 27],
    [SW_VERS_TRAILING_WHITESPACE, 15],
  ])('parses %j as major %i', (input, expected) => {
    expect(parseMajorVersion(input)).toBe(expected);
  });

  it('returns NaN for empty string', () => {
    expect(parseMajorVersion('')).toBeNaN();
  });

  it('returns NaN for non-numeric input', () => {
    expect(parseMajorVersion('banana')).toBeNaN();
  });
});

describe('checkMacOSVersion', () => {
  it('passes on macOS 14', async () => {
    const r = await checkMacOSVersion(async () => SW_VERS_SONOMA);
    expect(r.status).toBe('pass');
    expect(r.meta).toMatchObject({ major: 14, productVersion: '14.6.1' });
  });

  it('passes on macOS 15', async () => {
    const r = await checkMacOSVersion(async () => SW_VERS_SEQUOIA);
    expect(r.status).toBe('pass');
    expect(r.meta).toMatchObject({ major: 15 });
  });

  it('passes on macOS 26', async () => {
    const r = await checkMacOSVersion(async () => SW_VERS_TAHOE);
    expect(r.status).toBe('pass');
    expect(r.meta).toMatchObject({ major: 26 });
  });

  it('fails on macOS 13 with OS_UNSUPPORTED', async () => {
    const r = await checkMacOSVersion(async () => SW_VERS_OLD_VENTURA);
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.OS_UNSUPPORTED);
  });

  it('fails on macOS 27 (not yet tested)', async () => {
    const r = await checkMacOSVersion(async () => SW_VERS_FUTURE);
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.OS_UNSUPPORTED);
  });

  it('fails when sw_vers throws', async () => {
    const r = await checkMacOSVersion(async () => {
      throw new Error('ENOENT');
    });
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.OS_UNSUPPORTED);
  });
});
