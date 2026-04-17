import { describe, expect, it } from 'vitest';
import { checkSIPStatus, parseCsrutilOutput } from '../src/checks/sip-status.js';

describe('parseCsrutilOutput', () => {
  it('parses "enabled"', () => {
    const p = parseCsrutilOutput('System Integrity Protection status: enabled.\n');
    expect(p.enabled).toBe(true);
  });

  it('parses "disabled"', () => {
    const p = parseCsrutilOutput('System Integrity Protection status: disabled.\n');
    expect(p.enabled).toBe(false);
  });

  it('parses case-insensitively', () => {
    expect(
      parseCsrutilOutput('System Integrity Protection status: Enabled.\n').enabled,
    ).toBe(true);
  });

  it('handles multi-line custom configurations', () => {
    const out = `System Integrity Protection status: disabled.\n\nConfiguration:\n\tApple Internal: disabled\n`;
    expect(parseCsrutilOutput(out).enabled).toBe(false);
  });

  it('defaults to enabled on unrecognized output (safer default)', () => {
    expect(parseCsrutilOutput('something unexpected').enabled).toBe(true);
  });
});

describe('checkSIPStatus', () => {
  it('passes when SIP is enabled', async () => {
    const r = await checkSIPStatus(
      async () => 'System Integrity Protection status: enabled.\n',
    );
    expect(r.status).toBe('pass');
    expect(r.meta?.enabled).toBe(true);
  });

  it('passes when SIP is disabled (valid CI VM state)', async () => {
    const r = await checkSIPStatus(
      async () => 'System Integrity Protection status: disabled.\n',
    );
    expect(r.status).toBe('pass');
    expect(r.meta?.enabled).toBe(false);
  });

  it('warns when csrutil throws', async () => {
    const r = await checkSIPStatus(async () => {
      throw new Error('not a mac');
    });
    expect(r.status).toBe('warn');
  });
});
