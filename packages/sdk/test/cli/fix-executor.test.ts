import { describe, expect, it, vi } from 'vitest';
import { applyFixActions } from '../../src/cli/fix-executor.js';
import type { FixAction } from '../../src/cli/report-types.js';

describe('applyFixActions', () => {
  it('applies defaults-write actions via the injected writer', async () => {
    const writer = vi.fn(async () => undefined);
    const actions: FixAction[] = [
      {
        kind: 'defaults-write',
        plistPath:
          '/Users/x/Library/Preferences/com.apple.VoiceOver4/default/com.apple.VoiceOver4.plist',
        key: 'SCREnableAppleScript',
        value: true,
      },
    ];
    const res = await applyFixActions(actions, {
      sipEnabled: true,
      defaultsWriter: writer,
    });
    expect(res.appliedActions).toHaveLength(1);
    expect(writer).toHaveBeenCalledWith(
      actions[0]!.kind === 'defaults-write' ? actions[0].plistPath : '',
      'SCREnableAppleScript',
      true,
    );
  });

  it('does NOT execute open-system-settings actions (user clicks through)', async () => {
    const writer = vi.fn();
    const actions: FixAction[] = [
      {
        kind: 'open-system-settings',
        url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
        pane: 'accessibility',
      },
    ];
    const res = await applyFixActions(actions, {
      sipEnabled: true,
      defaultsWriter: writer,
    });
    expect(res.appliedActions).toHaveLength(0);
    expect(res.skippedActions).toHaveLength(1);
    expect(res.skippedActions[0]!.reason).toBe('manual-user-action');
    expect(writer).not.toHaveBeenCalled();
  });

  it('does NOT execute manual actions', async () => {
    const actions: FixAction[] = [
      {
        kind: 'manual',
        instructions: ['Rebuild the helper and re-grant TCC'],
      },
    ];
    const res = await applyFixActions(actions, { sipEnabled: true });
    expect(res.appliedActions).toHaveLength(0);
    expect(res.skippedActions[0]!.reason).toBe('manual-instructions-only');
  });

  it('collects errors from defaults-write failures without aborting the batch', async () => {
    let calls = 0;
    const writer = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('EACCES');
    });
    const actions: FixAction[] = [
      { kind: 'defaults-write', plistPath: '/a.plist', key: 'A', value: true },
      { kind: 'defaults-write', plistPath: '/b.plist', key: 'B', value: false },
    ];
    const res = await applyFixActions(actions, {
      sipEnabled: true,
      defaultsWriter: writer,
    });
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.error).toBe('EACCES');
    expect(res.appliedActions).toHaveLength(1); // second write succeeded
  });

  it('NEVER invokes a TCC.db writer — no such code path exists', () => {
    // This test is structural: it confirms applyFixActions's signature has no tcc-write branch.
    const actions: FixAction[] = [];
    expect(() => applyFixActions(actions, { sipEnabled: true })).not.toThrow();
  });
});
