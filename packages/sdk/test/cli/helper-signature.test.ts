import { describe, expect, it } from 'vitest';
import {
  checkHelperSignature,
  parseCodesignOutput,
} from '../../src/cli/checks/helper-signature.js';
import { ExitCode } from '../../src/cli/report-types.js';
import {
  CODESIGN_ADHOC,
  CODESIGN_DEVELOPER_ID,
  CODESIGN_UNSIGNED_ERROR,
} from './fixtures/codesign-output.js';

describe('parseCodesignOutput', () => {
  it('extracts the Developer ID Application authority', () => {
    const p = parseCodesignOutput(CODESIGN_DEVELOPER_ID);
    expect(p.authority).toBe(
      'Developer ID Application: Jack Shelton (TEAMIDXYZ)',
    );
    expect(p.adhoc).toBe(false);
    expect(p.unsigned).toBe(false);
    expect(p.identifier).toBe('com.shoki.runner');
    expect(p.teamIdentifier).toBe('TEAMIDXYZ');
  });

  it('detects ad-hoc signatures', () => {
    const p = parseCodesignOutput(CODESIGN_ADHOC);
    expect(p.adhoc).toBe(true);
    expect(p.unsigned).toBe(false);
    expect(p.teamIdentifier).toBeNull();
  });

  it('detects unsigned binaries', () => {
    const p = parseCodesignOutput(CODESIGN_UNSIGNED_ERROR);
    expect(p.unsigned).toBe(true);
    expect(p.authority).toBeNull();
  });
});

describe('checkHelperSignature', () => {
  it('passes for a Developer ID signed helper', async () => {
    const r = await checkHelperSignature(
      '/tmp/ShokiRunner.app',
      async () => CODESIGN_DEVELOPER_ID,
    );
    expect(r.status).toBe('pass');
    expect(r.summary).toMatch(/Developer ID Application/);
  });

  it('warns on ad-hoc signatures', async () => {
    const r = await checkHelperSignature(
      '/tmp/ShokiRunner.app',
      async () => CODESIGN_ADHOC,
    );
    expect(r.status).toBe('warn');
  });

  it('fails with HELPER_UNSIGNED on unsigned binaries', async () => {
    const r = await checkHelperSignature(
      '/tmp/ShokiRunner.app',
      async () => CODESIGN_UNSIGNED_ERROR,
    );
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.HELPER_UNSIGNED);
  });

  it('fails when codesign stderr has no Authority= line and no unsigned marker', async () => {
    const r = await checkHelperSignature(
      '/tmp/ShokiRunner.app',
      async () => 'Executable=/tmp/ShokiRunner.app\nIdentifier=com.shoki.runner\n',
    );
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.HELPER_UNSIGNED);
  });
});
