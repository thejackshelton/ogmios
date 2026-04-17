// Ported from guidepup/src/macOS/VoiceOver/keyCodeCommands.ts
// Source: https://github.com/guidepup/guidepup (main branch, 2026-04-17)
// DO NOT EDIT — regenerate by re-running the port script against the upstream source.

export interface KeyboardCommand {
  readonly name: string;
  readonly keys: ReadonlyArray<{ readonly key: string; readonly modifiers?: readonly string[] }>;
}

export const keyboardCommands = Object.freeze({
  start: {
    name: 'Start VoiceOver',
    keys: [{ key: 'F5', modifiers: ['Command'] }],
  } as KeyboardCommand,
  quit: {
    name: 'Quit VoiceOver',
    keys: [{ key: 'F5', modifiers: ['Command'] }],
  } as KeyboardCommand,
  toggleLock: {
    name: 'Lock and unlock the VO (Control and Option) keys',
    keys: [{ key: 'Semicolon', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  openUtilityMenu: {
    name: 'Open VoiceOver Utility',
    keys: [{ key: 'F8', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  openHelpMenu: {
    name: 'Open the VoiceOver Help menu',
    keys: [{ key: 'H', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  openQuickStart: {
    name: 'Open the VoiceOver Quick Start',
    keys: [{ key: 'F8', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  openOnlineHelp: {
    name: 'Open VoiceOver online help',
    keys: [{ key: 'Slash', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  startKeyboardHelp: {
    name: 'Start keyboard help',
    keys: [{ key: 'K', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  hearItemDescription: {
    name: 'Hear a description of the item in the VoiceOver cursor',
    keys: [{ key: 'N', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  openCommandsMenu: {
    name: 'Open the Commands menu',
    keys: [{ key: 'H', modifiers: ['Control', 'Option'] }, { key: 'H' }],
  } as KeyboardCommand,
  openFindMenu: {
    name: 'Open the Find menu',
    keys: [{ key: 'F', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  stopAction: {
    name: 'Close a menu or rotor, stop an action, or exit a mode',
    keys: [{ key: 'Escape' }],
  } as KeyboardCommand,
  ignoreNextKeyCombination: {
    name: 'Tell VoiceOver to ignore the next key combination you press',
    keys: [{ key: 'Tab', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  openVerbosityRotor: {
    name: 'Open the verbosity rotor',
    keys: [{ key: 'V', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  magnifyItem: {
    name: 'Magnify the item in the VoiceOver cursor',
    keys: [{ key: 'BracketRight', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  shrinkItem: {
    name: 'Shrink the item in the VoiceOver cursor',
    keys: [{ key: 'BracketLeft', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleCursorAndPanels: {
    name: 'Temporarily hide or show the VoiceOver cursor and the caption or braille panels',
    keys: [{ key: 'F11', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  toggleCaptionPanel: {
    name: 'Hide or show the caption panel only',
    keys: [{ key: 'F10', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  resizeOrMoveCaptionPanel: {
    name: 'Resize or move the caption panel',
    keys: [{ key: 'F10', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleBraillePanel: {
    name: 'Hide or show the braille panel only',
    keys: [{ key: 'F9', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  resizeOrMoveBraillePanel: {
    name: 'Resize or move the braille panel',
    keys: [{ key: 'F9', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  tileVisuals: {
    name: 'Tile visuals (dim the screen, highlight the caption or braille panel, and show the item in the VoiceOver cursor in the center of the screen).',
    keys: [{ key: 'F10', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  toggleKeyboardCommander: {
    name: 'Enable or disable the Keyboard Commander',
    keys: [{ key: 'K', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleScreenCurtain: {
    name: 'Turn the screen black (screen curtain)',
    keys: [{ key: 'F11', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  cycleRightThroughSpeechSettings: {
    name: 'Cycle through speech settings (rate, pitch, volume, intonation, voice)',
    keys: [{ key: 'ArrowRight', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  cycleLeftThroughSpeechSettings: {
    name: 'Cycle through speech settings (rate, pitch, volume, intonation, voice)',
    keys: [{ key: 'ArrowLeft', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  changeUpCurrentSpeechSettings: {
    name: 'Change the current speech setting (rate, pitch, volume, intonation, voice)',
    keys: [{ key: 'ArrowUp', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  changeDownCurrentSpeechSettings: {
    name: 'Change the current speech setting (rate, pitch, volume, intonation, voice)',
    keys: [{ key: 'ArrowDown', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  pressAndReleaseMouse: {
    name: 'Press and release mouse button',
    keys: [{ key: 'Space', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  interactWithItem: {
    name: 'Interact with an item',
    keys: [{ key: 'ArrowDown', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  stopInteractingWithItem: {
    name: 'Stop interacting with an item',
    keys: [{ key: 'ArrowUp', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  performDefaultActionForItem: {
    name: 'Perform the default action for the item in the VoiceOver cursor',
    keys: [{ key: 'Space', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  selectItem: {
    name: 'Select a menu or list item',
    keys: [{ key: 'Enter', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  selectMultipleItems: {
    name: 'Select multiple items',
    keys: [{ key: 'Space', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  toggleStickyMouse: {
    name: 'Perform a sticky mouse down or mouse up (for use when dragging an item from one location to drop in another location)',
    keys: [{ key: 'Space', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  doubleClick: {
    name: 'Click the item under the mouse cursor',
    keys: [{ key: 'Space', modifiers: ['Control', 'Option', 'Shift'] }, { key: 'Space' }],
  } as KeyboardCommand,
  toggleDisclosureTriangle: {
    name: 'Open or close a disclosure triangle',
    keys: [{ key: 'Backslash', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readTableRow: {
    name: 'Read a row in a table',
    keys: [{ key: 'R', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readTableColumn: {
    name: 'Read a column in a table',
    keys: [{ key: 'C', modifiers: ['Control', 'Option'] }, { key: 'C' }],
  } as KeyboardCommand,
  readTableColumnHeader: {
    name: 'Read the column header in a table',
    keys: [{ key: 'C', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readTableRowAndColumnNumbers: {
    name: 'Read row and column numbers in a table',
    keys: [{ key: 'T', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  sortTableColumn: {
    name: 'Sort a column in a table',
    keys: [{ key: 'Backslash', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  interactWithScrollbars: {
    name: 'Interact with scroll bars',
    keys: [{ key: 'S', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  resizeObject: {
    name: 'Resize a window or an object',
    keys: [{ key: 'Backquote', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveObject: {
    name: 'Move a window or an object',
    keys: [{ key: 'Backquote', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveUp: {
    name: 'Move up',
    keys: [{ key: 'ArrowUp', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveDown: {
    name: 'Move down',
    keys: [{ key: 'ArrowDown', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToPrevious: {
    name: 'Move to previous',
    keys: [{ key: 'ArrowLeft', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToNext: {
    name: 'Move to next',
    keys: [{ key: 'ArrowRight', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToVisibleAreaTop: {
    name: 'Move to the top of the visible area (such as a window or text area) where the VoiceOver cursor is located',
    keys: [{ key: 'Home', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToVisibleAreaBottom: {
    name: 'Move to the bottom of the visible area (such as a window or text area) where the VoiceOver cursor is located',
    keys: [{ key: 'End', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToAreaTop: {
    name: 'Move to the top of the area (such as a window or text area) where the VoiceOver cursor is located, scrolling if necessary',
    keys: [{ key: 'Home', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveToAreaBottom: {
    name: 'Move to the bottom of the area (such as a window or text area) where the VoiceOver cursor is located, scrolling if necessary',
    keys: [{ key: 'End', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveToFirst: {
    name: 'Move to the top of a window, the first item in the Dock, or the first item on your desktop, depending on your location',
    keys: [{ key: 'Home', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  moveToLast: {
    name: 'Move to the lower-right corner of a window, the last item in the Dock, or the last item on your desktop, depending on your location',
    keys: [{ key: 'End', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  moveToFrontWindow: {
    name: 'Move to the front the window where the VoiceOver cursor is located and make it active',
    keys: [{ key: 'F2', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  closeWindow: {
    name: 'Close the window where the VoiceOver cursor is located',
    keys: [{ key: 'F2', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  openItemChooser: {
    name: 'Open the Item Chooser',
    keys: [{ key: 'I', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToDock: {
    name: 'Move to the desktop',
    keys: [{ key: 'D', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToDesktop: {
    name: 'Move to the desktop',
    keys: [{ key: 'D', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveToMenuBar: {
    name: 'Move to the menu bar',
    keys: [{ key: 'M', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToFirstStatusMenuInMenuBar: {
    name: 'Move to the first status menu in the menu bar',
    keys: [{ key: 'M', modifiers: ['Control', 'Option'] }, { key: 'M' }],
  } as KeyboardCommand,
  openSpotlightMenu: {
    name: 'Open the Spotlight menu',
    keys: [{ key: 'M', modifiers: ['Control', 'Option'] }, { key: 'M' }, { key: 'M' }],
  } as KeyboardCommand,
  openShortcutMenu: {
    name: 'Open a shortcut menu',
    keys: [{ key: 'M', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  jumpToLinkedItem: {
    name: 'Jump to a linked item (for example, from a Mail message in the Inbox to its message text)',
    keys: [{ key: 'J', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  toggleCursorTrackingOptions: {
    name: 'Temporarily disable or enable the cursor tracking options you selected in VoiceOver Utility. The command doesn\'t change the settings in VoiceOver Utility.',
    keys: [{ key: 'F3', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveCursorToKeyboardFocus: {
    name: 'Move VoiceOver cursor to keyboard focus',
    keys: [{ key: 'F4', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveKeyboardFocusToCursor: {
    name: 'Move keyboard focus to VoiceOver cursor',
    keys: [{ key: 'F4', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  moveCursorToMouseFocus: {
    name: 'Move VoiceOver cursor to mouse cursor',
    keys: [{ key: 'F5', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveMouseFocusToCursor: {
    name: 'Move mouse cursor to VoiceOver cursor',
    keys: [{ key: 'F5', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  jumpCommand: {
    name: 'Jump command',
    keys: [{ key: 'J', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  jumpToTopEdge: {
    name: 'Jump to the top edge of an area. Used with jump command',
    keys: [{ key: 'ArrowUp', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  jumpToRightEdge: {
    name: 'Jump to the right edge of an area. Used with jump command',
    keys: [{ key: 'ArrowRight', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  jumpToBottomEdge: {
    name: 'Jump to the bottom edge of an area. Used with jump command',
    keys: [{ key: 'ArrowDown', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  jumpToLeftEdge: {
    name: 'Jump to the left edge of an area. Used with jump command',
    keys: [{ key: 'ArrowLeft', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  jumpToTopVisibleEdge: {
    name: 'Jump to the top visible edge of an area. Used with jump command',
    keys: [{ key: 'ArrowUp', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToRightVisibleEdge: {
    name: 'Jump to the right visible edge of an area. Used with jump command',
    keys: [{ key: 'ArrowRight', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToBottomVisibleEdge: {
    name: 'Jump to the bottom visible edge of an area. Used with jump command',
    keys: [{ key: 'ArrowDown', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToLeftVisibleEdge: {
    name: 'Jump to the left visible edge of an area. Used with jump command',
    keys: [{ key: 'ArrowLeft', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpBeforeSplitter: {
    name: 'Jump to the area that precedes a horizontal or vertical splitter',
    keys: [{ key: 'BracketLeft', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpAfterSplitter: {
    name: 'Jump to the area that follows a horizontal or vertical splitter',
    keys: [{ key: 'BracketRight', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  findText: {
    name: 'Find text',
    keys: [{ key: 'F', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  navigateUp: {
    name: 'Navigate in given direction, wrapping when necessary',
    keys: [{ key: 'ArrowUp', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  cycleRightThroughNavigationSettings: {
    name: 'Cycle through navigation settings (Headings, Form Controls, Landmarks, etc.)',
    keys: [{ key: 'ArrowRight', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  navigateDown: {
    name: 'Navigate in given direction, wrapping when necessary',
    keys: [{ key: 'ArrowDown', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  cycleLeftThroughNavigationSettings: {
    name: 'Cycle through navigation settings (Headings, Form Controls, Landmarks, etc.)',
    keys: [{ key: 'ArrowLeft', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  toggleHotSpot1: {
    name: 'Toggle hot spot 1',
    keys: [{ key: 'Digit1', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot2: {
    name: 'Toggle hot spot 2',
    keys: [{ key: 'Digit2', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot3: {
    name: 'Toggle hot spot 3',
    keys: [{ key: 'Digit3', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot4: {
    name: 'Toggle hot spot 4',
    keys: [{ key: 'Digit4', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot5: {
    name: 'Toggle hot spot 5',
    keys: [{ key: 'Digit5', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot6: {
    name: 'Toggle hot spot 6',
    keys: [{ key: 'Digit6', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot7: {
    name: 'Toggle hot spot 7',
    keys: [{ key: 'Digit7', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot8: {
    name: 'Toggle hot spot 8',
    keys: [{ key: 'Digit8', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot9: {
    name: 'Toggle hot spot 9',
    keys: [{ key: 'Digit9', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleHotSpot0: {
    name: 'Toggle hot spot 0',
    keys: [{ key: 'Digit0', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  jumpToHotSpot1: {
    name: 'Jump to hot spot 1',
    keys: [{ key: 'Digit1', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot2: {
    name: 'Jump to hot spot 2',
    keys: [{ key: 'Digit2', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot3: {
    name: 'Jump to hot spot 3',
    keys: [{ key: 'Digit3', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot4: {
    name: 'Jump to hot spot 4',
    keys: [{ key: 'Digit4', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot5: {
    name: 'Jump to hot spot 5',
    keys: [{ key: 'Digit5', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot6: {
    name: 'Jump to hot spot 6',
    keys: [{ key: 'Digit6', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot7: {
    name: 'Jump to hot spot 7',
    keys: [{ key: 'Digit7', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot8: {
    name: 'Jump to hot spot 8',
    keys: [{ key: 'Digit8', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot9: {
    name: 'Jump to hot spot 9',
    keys: [{ key: 'Digit9', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  jumpToHotSpot0: {
    name: 'Jump to hot spot 0',
    keys: [{ key: 'Digit0', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  describeHotSpot1: {
    name: 'Hear a description of hot spot 1',
    keys: [{ key: 'Digit1', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot2: {
    name: 'Hear a description of hot spot 2',
    keys: [{ key: 'Digit2', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot3: {
    name: 'Hear a description of hot spot 3',
    keys: [{ key: 'Digit3', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot4: {
    name: 'Hear a description of hot spot 4',
    keys: [{ key: 'Digit4', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot5: {
    name: 'Hear a description of hot spot 5',
    keys: [{ key: 'Digit5', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot6: {
    name: 'Hear a description of hot spot 6',
    keys: [{ key: 'Digit6', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot7: {
    name: 'Hear a description of hot spot 7',
    keys: [{ key: 'Digit7', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot8: {
    name: 'Hear a description of hot spot 8',
    keys: [{ key: 'Digit8', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot9: {
    name: 'Hear a description of hot spot 9',
    keys: [{ key: 'Digit9', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeHotSpot0: {
    name: 'Hear a description of hot spot 0',
    keys: [{ key: 'Digit0', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  monitorHotSpot1: {
    name: 'Monitor hot spot 1',
    keys: [{ key: 'Digit1', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot2: {
    name: 'Monitor hot spot 2',
    keys: [{ key: 'Digit2', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot3: {
    name: 'Monitor hot spot 3',
    keys: [{ key: 'Digit3', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot4: {
    name: 'Monitor hot spot 4',
    keys: [{ key: 'Digit4', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot5: {
    name: 'Monitor hot spot 5',
    keys: [{ key: 'Digit5', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot6: {
    name: 'Monitor hot spot 6',
    keys: [{ key: 'Digit6', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot7: {
    name: 'Monitor hot spot 7',
    keys: [{ key: 'Digit7', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot8: {
    name: 'Monitor hot spot 8',
    keys: [{ key: 'Digit8', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot9: {
    name: 'Monitor hot spot 9',
    keys: [{ key: 'Digit9', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  monitorHotSpot0: {
    name: 'Monitor hot spot 0',
    keys: [{ key: 'Digit0', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  jumpToParentFolder: {
    name: 'Jump back to a parent folder',
    keys: [{ key: 'Backslash', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  hearApplicationSummary: {
    name: 'Hear the application summary',
    keys: [{ key: 'F1', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  openApplicationChooser: {
    name: 'Open the Application Chooser',
    keys: [{ key: 'F1', modifiers: ['Control', 'Option'] }, { key: 'F1' }],
  } as KeyboardCommand,
  hearWindowSummary: {
    name: 'Hear the window summary',
    keys: [{ key: 'F2', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  openWindowChooser: {
    name: 'Open the Window Chooser',
    keys: [{ key: 'F2', modifiers: ['Control', 'Option'] }, { key: 'F2' }],
  } as KeyboardCommand,
  describeItem: {
    name: 'Describe the item in the VoiceOver cursor',
    keys: [{ key: 'F3', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  describeItemSize: {
    name: 'Describe the size of the item in the VoiceOver cursor',
    keys: [{ key: 'F3', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  describeItemPosition: {
    name: 'Describe the position of the item in the VoiceOver cursor',
    keys: [{ key: 'F3', modifiers: ['Control', 'Option', 'Command'] }, { key: 'F3' }],
  } as KeyboardCommand,
  describeItemWithKeyboardFocus: {
    name: 'Describe the item that has the keyboard focus',
    keys: [{ key: 'F4', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  describeLocationOfInsertionPoint: {
    name: 'Describe the location of the insertion point (from upper-left corner of screen)',
    keys: [{ key: 'F4', modifiers: ['Control', 'Option'] }, { key: 'F4' }],
  } as KeyboardCommand,
  describeItemUnderMouseCursor: {
    name: 'Describe the item under the mouse cursor',
    keys: [{ key: 'F5', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  describeLocationOfMouseInCoordinates: {
    name: 'Describe the location of the mouse in x, y coordinates (from upper-left corner of screen)',
    keys: [{ key: 'F5', modifiers: ['Control', 'Option'] }, { key: 'F5' }],
  } as KeyboardCommand,
  describeLocationOfMouse: {
    name: 'Describe the location of the mouse (from upper-left corner of window)',
    keys: [{ key: 'F5', modifiers: ['Control', 'Option'] }, { key: 'F5' }, { key: 'F5' }],
  } as KeyboardCommand,
  describeSelectedItem: {
    name: 'Describe the selected item',
    keys: [{ key: 'F6', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readCurrentSelection: {
    name: 'Read everything in the VoiceOver cursor',
    keys: [{ key: 'A', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readActiveWindow: {
    name: 'Read everything visible in the window or the Dock, or on your desktop, depending on your location',
    keys: [{ key: 'W', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  repeatLastSpokenPhrase: {
    name: 'Repeat the last spoken phrase',
    keys: [{ key: 'Z', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  copyLastSpokenPhraseToClipboard: {
    name: 'VO-Shift-C',
    keys: [{ key: 'C', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  saveLastSpokenPhraseToDesktop: {
    name: 'Save the last spoken phrase and the crash log to a file on the desktop for troubleshooting',
    keys: [{ key: 'Z', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  find: {
    name: 'Find',
    keys: [{ key: 'F', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  findNextSearchedText: {
    name: 'Find the next searched text',
    keys: [{ key: 'G', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  findPreviousSearchedText: {
    name: 'Find the previous searched text',
    keys: [{ key: 'G', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  findNextList: {
    name: 'Find the next list',
    keys: [{ key: 'X', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousList: {
    name: 'Find the previous list',
    keys: [{ key: 'X', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextBoldText: {
    name: 'Find the next bold text',
    keys: [{ key: 'B', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousBoldText: {
    name: 'Find the previous bold text',
    keys: [{ key: 'B', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextStyleChange: {
    name: 'Find the next style change',
    keys: [{ key: 'C', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousStyleChange: {
    name: 'Find the previous style change',
    keys: [{ key: 'C', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextItalicText: {
    name: 'Find the next italic text',
    keys: [{ key: 'I', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousItalicText: {
    name: 'Find the previous italic text',
    keys: [{ key: 'I', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextColorChange: {
    name: 'Find the next color change',
    keys: [{ key: 'K', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousColorChange: {
    name: 'Find the previous color change',
    keys: [{ key: 'K', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextFontChange: {
    name: 'Find the next font change',
    keys: [{ key: 'O', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousFontChange: {
    name: 'Find the previous font change',
    keys: [{ key: 'O', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextTable: {
    name: 'Find the next table',
    keys: [{ key: 'T', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousTable: {
    name: 'Find the previous table',
    keys: [{ key: 'T', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextUnderlinedText: {
    name: 'Find the next underlined text',
    keys: [{ key: 'U', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousUnderlinedText: {
    name: 'Find the previous underlined text',
    keys: [{ key: 'U', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextControl: {
    name: 'Find the next control',
    keys: [{ key: 'J', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousControl: {
    name: 'Find the previous control',
    keys: [{ key: 'J', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextDifferentItem: {
    name: 'Find the next different item',
    keys: [{ key: 'D', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousDifferentItem: {
    name: 'Find the previous different item',
    keys: [{ key: 'D', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextItemWithSameTypeAsCurrentItem: {
    name: 'Find the next item that\'s the same type as the current item',
    keys: [{ key: 'S', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousItemWithSameTypeAsCurrentItem: {
    name: 'Find the previous item that\'s the same type as the current item',
    keys: [{ key: 'S', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextGraphic: {
    name: 'Find the next graphic',
    keys: [{ key: 'G', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousGraphic: {
    name: 'Find the previous graphic',
    keys: [{ key: 'G', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextHeading: {
    name: 'Find the next heading',
    keys: [{ key: 'H', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousHeading: {
    name: 'Find the previous heading',
    keys: [{ key: 'H', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextLink: {
    name: 'Find the next link',
    keys: [{ key: 'L', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousLink: {
    name: 'Find the previous link',
    keys: [{ key: 'L', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextHeadingOfSameLevel: {
    name: 'Find the next heading of the same level',
    keys: [{ key: 'M', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousHeadingOfSameLevel: {
    name: 'Find the previous heading of the same level',
    keys: [{ key: 'M', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextPlainText: {
    name: 'Find the next plain text',
    keys: [{ key: 'P', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousPlainText: {
    name: 'Find the previous plain text',
    keys: [{ key: 'P', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextVisitedLink: {
    name: 'Find the next visited link',
    keys: [{ key: 'V', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousVisitedLink: {
    name: 'Find the previous visited link',
    keys: [{ key: 'V', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  findNextMisspelledWord: {
    name: 'Find the next misspelled word',
    keys: [{ key: 'E', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  findPreviousMisspelledWord: {
    name: 'Find the previous misspelled word',
    keys: [{ key: 'E', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  readAllText: {
    name: 'Read all text from the VoiceOver cursor to the end of the text',
    keys: [{ key: 'A', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  selectAllText: {
    name: 'Select all text in the VoiceOver cursor',
    keys: [{ key: 'A', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  toggleTextSelection: {
    name: 'Start and stop text selection in a text field (text selection tracking must be on)',
    keys: [{ key: 'Enter', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  speakTextAttributes: {
    name: 'Speak text attributes',
    keys: [{ key: 'T', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readParagraph: {
    name: 'Read paragraph in VoiceOver cursor',
    keys: [{ key: 'P', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readNextParagraph: {
    name: 'Read next paragraph',
    keys: [{ key: 'PageDown', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  readPreviousParagraph: {
    name: 'Read previous paragraph',
    keys: [{ key: 'PageUp', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  readSentence: {
    name: 'Read sentence in VoiceOver cursor',
    keys: [{ key: 'S', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readNextSentence: {
    name: 'Read next sentence',
    keys: [{ key: 'PageDown', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  readPreviousSentence: {
    name: 'Read previous sentence',
    keys: [{ key: 'PageUp', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  readLine: {
    name: 'Read line in VoiceOver cursor',
    keys: [{ key: 'L', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readNextLine: {
    name: 'Read next line',
    keys: [{ key: 'ArrowDown', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readPreviousLine: {
    name: 'Read previous line',
    keys: [{ key: 'ArrowUp', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readWord: {
    name: 'Read word in VoiceOver cursor',
    keys: [{ key: 'W', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readWordSpelled: {
    name: 'Read word spelled in VoiceOver cursor',
    keys: [{ key: 'W', modifiers: ['Control', 'Option'] }, { key: 'W' }],
  } as KeyboardCommand,
  readWordPhonetically: {
    name: 'Read word spelled phonetically in VoiceOver cursor',
    keys: [{ key: 'W', modifiers: ['Control', 'Option'] }, { key: 'W' }, { key: 'W' }],
  } as KeyboardCommand,
  readNextWord: {
    name: 'Read next word',
    keys: [{ key: 'ArrowRight', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readPreviousWord: {
    name: 'Read previous word',
    keys: [{ key: 'ArrowLeft', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readCharacter: {
    name: 'Read character in VoiceOver cursor',
    keys: [{ key: 'C', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readCharacterPhonetically: {
    name: 'Read character phonetically in VoiceOver cursor',
    keys: [{ key: 'C', modifiers: ['Control', 'Option'] }, { key: 'C' }],
  } as KeyboardCommand,
  readNextCharacter: {
    name: 'Read next character',
    keys: [{ key: 'ArrowRight', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  readPreviousCharacter: {
    name: 'Read previous character',
    keys: [{ key: 'ArrowLeft', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveToFirstVisibleWord: {
    name: 'Move to first visible word',
    keys: [{ key: 'Home', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToLastVisibleWord: {
    name: 'Move to last visible word',
    keys: [{ key: 'End', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  moveToBeginningOfText: {
    name: 'Move to beginning of text, scrolling if necessary',
    keys: [{ key: 'Home', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  moveToEndOfText: {
    name: 'Move to end of text, scrolling if necessary',
    keys: [{ key: 'End', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  readCurrentWordAndCharacter: {
    name: 'Reads the current word and character in the VoiceOver cursor',
    keys: [{ key: 'F3', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readNumberOfLines: {
    name: 'Reads the total number of lines and the number of visible lines in a document',
    keys: [{ key: 'F3', modifiers: ['Control', 'Option'] }, { key: 'F3' }],
  } as KeyboardCommand,
  moveToNextColumn: {
    name: 'Move to the next column',
    keys: [{ key: 'Y', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  moveToPreviousColumn: {
    name: 'Move to the previous column',
    keys: [{ key: 'Y', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  moveToNextFrame: {
    name: 'Move to the next frame',
    keys: [{ key: 'F', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  moveToPreviousFrame: {
    name: 'Move to the previous frame',
    keys: [{ key: 'F', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  moveToNextAutoWebSpot: {
    name: 'Move to the next auto web spot',
    keys: [{ key: 'N', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  moveToPreviousAutoWebSpot: {
    name: 'Move to the previous auto web spot',
    keys: [{ key: 'N', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  moveToNextWebSpot: {
    name: 'Move to the next web spot',
    keys: [{ key: 'BracketLeft', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  moveToPreviousWebSpot: {
    name: 'Move to the previous web spot',
    keys: [{ key: 'BracketRight', modifiers: ['Control', 'Option', 'Command'] }],
  } as KeyboardCommand,
  openWebItemRotor: {
    name: 'Open the Web Item rotor',
    keys: [{ key: 'U', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readFromBeginningToCurrent: {
    name: 'Read from the beginning of a webpage to the current location',
    keys: [{ key: 'B', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
  readLinkAddress: {
    name: 'Read a link address (URL)',
    keys: [{ key: 'U', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  readWebpageStatistics: {
    name: 'Read webpage statistics',
    keys: [{ key: 'I', modifiers: ['Control', 'Option', 'Shift'] }],
  } as KeyboardCommand,
  removeWebSpot: {
    name: 'Remove a web spot',
    keys: [{ key: 'BracketLeft', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  setWebSpot: {
    name: 'Set a web spot',
    keys: [{ key: 'BracketRight', modifiers: ['Control', 'Option', 'Command', 'Shift'] }],
  } as KeyboardCommand,
  setSweetSpot: {
    name: 'Set the sweet spot',
    keys: [{ key: 'BracketRight', modifiers: ['Control', 'Option', 'Shift'] }, { key: 'BracketRight' }],
  } as KeyboardCommand,
  toggleGroupingItemsWithinTable: {
    name: 'Turn the grouping of items within a table on or off',
    keys: [{ key: 'Equal', modifiers: ['Control', 'Option'] }],
  } as KeyboardCommand,
} as const);

export type KeyboardCommandName = keyof typeof keyboardCommands;
