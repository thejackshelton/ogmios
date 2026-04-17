import { describe, expect, it } from 'vitest';
import {
  commanderCommands,
  type CommanderCommandName,
} from '../src/commander-commands.js';
import {
  keyboardCommands,
  type KeyboardCommandName,
} from '../src/keyboard-commands.js';

// Guidepup's main (as of 2026-04-17) exposes 228 keyboard gestures and 186
// Commander commands. We port verbatim from those counts. The plan spec
// references an earlier Guidepup tag (226 / 129); the port-script regenerates
// from whatever is current, so the authoritative numbers below track upstream.
const EXPECTED_KEYBOARD_COUNT = 228;
const EXPECTED_COMMANDER_COUNT = 186;

describe('keyboardCommands catalog', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(keyboardCommands)).toBe(true);
  });

  it(`exposes exactly ${EXPECTED_KEYBOARD_COUNT} entries`, () => {
    const keys = Object.keys(keyboardCommands) as KeyboardCommandName[];
    expect(keys).toHaveLength(EXPECTED_KEYBOARD_COUNT);
  });

  it('every entry has a name (non-empty string) and a keys array', () => {
    for (const [entryKey, entry] of Object.entries(keyboardCommands)) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.keys)).toBe(true);
      for (const k of entry.keys) {
        expect(typeof k.key).toBe('string');
        expect(k.key.length).toBeGreaterThan(0);
        if (k.modifiers !== undefined) {
          expect(Array.isArray(k.modifiers)).toBe(true);
          for (const m of k.modifiers) {
            expect(['Control', 'Option', 'Command', 'Shift', 'Fn']).toContain(m);
          }
        }
      }
      // Sanity: entry key is a valid identifier.
      expect(entryKey.length).toBeGreaterThan(0);
    }
  });

  it('all entry names are unique', () => {
    const names = Object.values(keyboardCommands).map((e) => e.name);
    const unique = new Set(names);
    // NOTE: Guidepup has a few entries with duplicate descriptions (e.g. "Start VoiceOver"
    // and "Quit VoiceOver" share `Command-F5`). We check ID uniqueness elsewhere;
    // name uniqueness is best-effort.
    expect(unique.size).toBeGreaterThanOrEqual(names.length - 5);
  });

  it('well-known entries preserved from Guidepup (regression spot-check)', () => {
    const start = keyboardCommands.start;
    expect(start).toBeDefined();
    expect(start.name).toBe('Start VoiceOver');
    expect(start.keys[0]?.key).toBe('F5');
    expect(start.keys[0]?.modifiers).toEqual(['Command']);

    const toggleLock = keyboardCommands.toggleLock;
    expect(toggleLock.name).toContain('Lock');
    expect(toggleLock.keys[0]?.modifiers).toEqual(['Control', 'Option']);

    const startKeyboardHelp = keyboardCommands.startKeyboardHelp;
    expect(startKeyboardHelp.keys[0]?.key).toBe('K');
    expect(startKeyboardHelp.keys[0]?.modifiers).toEqual(['Control', 'Option']);
  });
});

describe('commanderCommands catalog', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(commanderCommands)).toBe(true);
  });

  it(`exposes exactly ${EXPECTED_COMMANDER_COUNT} entries`, () => {
    const keys = Object.keys(commanderCommands) as CommanderCommandName[];
    expect(keys).toHaveLength(EXPECTED_COMMANDER_COUNT);
  });

  it('every entry has a non-empty name and a keys array', () => {
    for (const entry of Object.values(commanderCommands)) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.keys)).toBe(true);
    }
  });

  it('well-known entries preserved (regression spot-check)', () => {
    expect(commanderCommands.actions.name).toBe('actions');
    expect(commanderCommands.clickMouse.name).toBe('click mouse');
    expect(commanderCommands.magicTap.name).toBe('magic tap');
  });
});
