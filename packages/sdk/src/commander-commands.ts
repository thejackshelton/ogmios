// Ported from guidepup/src/macOS/VoiceOver/CommanderCommands.ts
// Source: https://github.com/guidepup/guidepup (main branch, 2026-04-17)
// DO NOT EDIT — regenerate by re-running the port script against the upstream source.
//
// VO Commander commands are dispatched by VoiceOver's own Commander UI; each
// entry's string value is the exact VO command name. Users who want to
// programmatically drive them can use VO Commander shortcuts via system
// keystrokes — Ogmios itself is observe-only. The empty `keys` array is
// intentional: the binding (mouse gesture, trackpad gesture, or a user-
// assigned keystroke) is user-configurable and not fixed by Apple.

export interface CommanderCommand {
  readonly name: string;
  readonly keys: ReadonlyArray<{ readonly key: string; readonly modifiers?: readonly string[] }>;
}

export const commanderCommands = Object.freeze({
  actions: {
    name: 'actions',
    keys: [],
  } as CommanderCommand,
  addPronunciation: {
    name: 'add pronunciation',
    keys: [],
  } as CommanderCommand,
  bringWindowToFront: {
    name: 'bring window to front',
    keys: [],
  } as CommanderCommand,
  clickMouse: {
    name: 'click mouse',
    keys: [],
  } as CommanderCommand,
  closeWindow: {
    name: 'close window',
    keys: [],
  } as CommanderCommand,
  describePositionOfWindow: {
    name: 'describe position of window',
    keys: [],
  } as CommanderCommand,
  describeSizeOfWindow: {
    name: 'describe size of window',
    keys: [],
  } as CommanderCommand,
  doubleClickMouse: {
    name: 'double click mouse',
    keys: [],
  } as CommanderCommand,
  dropMarkedItemAfterChosenHotSpot: {
    name: 'drop marked item after chosen hot spot',
    keys: [],
  } as CommanderCommand,
  dropMarkedItemAfterVoiceoverCursor: {
    name: 'drop marked item after voiceover cursor',
    keys: [],
  } as CommanderCommand,
  dropMarkedItemBeforeChosenHotSpot: {
    name: 'drop marked item before chosen hot spot',
    keys: [],
  } as CommanderCommand,
  dropMarkedItemBeforeVoiceoverCursor: {
    name: 'drop marked item before voiceover cursor',
    keys: [],
  } as CommanderCommand,
  dropMarkedItemOnChosenHotSpot: {
    name: 'drop marked item on chosen hot spot',
    keys: [],
  } as CommanderCommand,
  dropMarkedItemOnVoiceoverCursor: {
    name: 'drop marked item on voiceover cursor',
    keys: [],
  } as CommanderCommand,
  escape: {
    name: 'escape',
    keys: [],
  } as CommanderCommand,
  fastForward: {
    name: 'fast-forward',
    keys: [],
  } as CommanderCommand,
  ignoreNextKeypress: {
    name: 'ignore next keypress',
    keys: [],
  } as CommanderCommand,
  interactWithScrollBar: {
    name: 'interact with scroll bar',
    keys: [],
  } as CommanderCommand,
  itemChooser: {
    name: 'item chooser',
    keys: [],
  } as CommanderCommand,
  keyboardHelp: {
    name: 'keyboard help',
    keys: [],
  } as CommanderCommand,
  labelItem: {
    name: 'label item',
    keys: [],
  } as CommanderCommand,
  magicTap: {
    name: 'magic tap',
    keys: [],
  } as CommanderCommand,
  markItemToDragAndDrop: {
    name: 'mark item to drag and drop',
    keys: [],
  } as CommanderCommand,
  moreContent: {
    name: 'more content',
    keys: [],
  } as CommanderCommand,
  mouseDown: {
    name: 'mouse down',
    keys: [],
  } as CommanderCommand,
  mouseUp: {
    name: 'mouse up',
    keys: [],
  } as CommanderCommand,
  moveDown: {
    name: 'move down',
    keys: [],
  } as CommanderCommand,
  moveLeft: {
    name: 'move left',
    keys: [],
  } as CommanderCommand,
  moveRight: {
    name: 'move right',
    keys: [],
  } as CommanderCommand,
  moveUp: {
    name: 'move up',
    keys: [],
  } as CommanderCommand,
  openActivityChooser: {
    name: 'open activity chooser',
    keys: [],
  } as CommanderCommand,
  openApplicationChooser: {
    name: 'open application chooser',
    keys: [],
  } as CommanderCommand,
  openCommandsMenu: {
    name: 'open commands menu',
    keys: [],
  } as CommanderCommand,
  openControlCenter: {
    name: 'open control center',
    keys: [],
  } as CommanderCommand,
  openNextSpeechAttributeGuide: {
    name: 'open next speech attribute guide',
    keys: [],
  } as CommanderCommand,
  openNotificationCentre: {
    name: 'open notification centre',
    keys: [],
  } as CommanderCommand,
  openPreviousSpeechAttributeGuide: {
    name: 'open previous speech attribute guide',
    keys: [],
  } as CommanderCommand,
  openQuickStartTutorial: {
    name: 'open quick start tutorial',
    keys: [],
  } as CommanderCommand,
  openShortcutMenu: {
    name: 'open shortcut menu',
    keys: [],
  } as CommanderCommand,
  openTheAnnouncementHistoryMenu: {
    name: 'open the announcement history menu',
    keys: [],
  } as CommanderCommand,
  openTheNotificationsMenu: {
    name: 'open the notifications menu',
    keys: [],
  } as CommanderCommand,
  openVerbosityRotor: {
    name: 'open verbosity rotor',
    keys: [],
  } as CommanderCommand,
  openVoiceoverHelpMenu: {
    name: 'open voiceover help menu',
    keys: [],
  } as CommanderCommand,
  openVoiceoverUtility: {
    name: 'open voiceover utility',
    keys: [],
  } as CommanderCommand,
  openWindowChooser: {
    name: 'open window chooser',
    keys: [],
  } as CommanderCommand,
  pauseOrResumeSpeaking: {
    name: 'pause or resume speaking',
    keys: [],
  } as CommanderCommand,
  performActionForItem: {
    name: 'perform action for item',
    keys: [],
  } as CommanderCommand,
  previousActivity: {
    name: 'previous activity',
    keys: [],
  } as CommanderCommand,
  readContentsOfVoiceoverCursor: {
    name: 'read contents of voiceover cursor',
    keys: [],
  } as CommanderCommand,
  readContentsOfWindow: {
    name: 'read contents of window',
    keys: [],
  } as CommanderCommand,
  readCurrentItemAlphabetically: {
    name: 'read current item alphabetically',
    keys: [],
  } as CommanderCommand,
  readCurrentItemPhonetically: {
    name: 'read current item phonetically',
    keys: [],
  } as CommanderCommand,
  readHelpTagForItem: {
    name: 'read help tag for item',
    keys: [],
  } as CommanderCommand,
  readImageDescriptionForItem: {
    name: 'read image description for item',
    keys: [],
  } as CommanderCommand,
  readSelectedTextOrItem: {
    name: 'read selected text or item',
    keys: [],
  } as CommanderCommand,
  readVisibleText: {
    name: 'read visible text',
    keys: [],
  } as CommanderCommand,
  readVoiceoverHint: {
    name: 'read voiceover hint',
    keys: [],
  } as CommanderCommand,
  removeFromWindowSpots: {
    name: 'remove from window spots',
    keys: [],
  } as CommanderCommand,
  rewind: {
    name: 'rewind',
    keys: [],
  } as CommanderCommand,
  rightClickMouse: {
    name: 'right click mouse',
    keys: [],
  } as CommanderCommand,
  rotor: {
    name: 'rotor',
    keys: [],
  } as CommanderCommand,
  selectItem: {
    name: 'select item',
    keys: [],
  } as CommanderCommand,
  selectNextOptionDownInSpeechAttributeGuide: {
    name: 'select next option down in speech attribute guide',
    keys: [],
  } as CommanderCommand,
  selectNextOptionUpInSpeechAttributeGuide: {
    name: 'select next option up in speech attribute guide',
    keys: [],
  } as CommanderCommand,
  setAsAWindowSpot: {
    name: 'set as a window spot',
    keys: [],
  } as CommanderCommand,
  setTheSweetSpot: {
    name: 'set the sweet spot',
    keys: [],
  } as CommanderCommand,
  startInteractingWithItem: {
    name: 'start interacting with item',
    keys: [],
  } as CommanderCommand,
  stopInteractingWithItem: {
    name: 'stop interacting with item',
    keys: [],
  } as CommanderCommand,
  toggleCursorTrackingOnOrOff: {
    name: 'toggle cursor tracking on or off',
    keys: [],
  } as CommanderCommand,
  toggleDisclosureTriangleOpenOrClosed: {
    name: 'toggle disclosure triangle open or closed',
    keys: [],
  } as CommanderCommand,
  toggleKeyboardCommanderOnOrOff: {
    name: 'toggle keyboard commander on or off',
    keys: [],
  } as CommanderCommand,
  toggleMultipleSelectionOnOrOff: {
    name: 'toggle multiple selection on or off',
    keys: [],
  } as CommanderCommand,
  toggleNumpadCommanderOnOrOff: {
    name: 'toggle numpad commander on or off',
    keys: [],
  } as CommanderCommand,
  toggleQuickNavOnOrOff: {
    name: 'toggle quick nav on or off',
    keys: [],
  } as CommanderCommand,
  toggleScreenCurtainOnOrOff: {
    name: 'toggle screen curtain on or off',
    keys: [],
  } as CommanderCommand,
  toggleSingleKeyQuickNavOnOrOff: {
    name: 'toggle single-key quick nav on or off',
    keys: [],
  } as CommanderCommand,
  toggleTheVoModifierLockOnOrOff: {
    name: 'toggle the vo modifier lock on or off',
    keys: [],
  } as CommanderCommand,
  toggleTrackpadCommanderOnOrOff: {
    name: 'toggle trackpad commander on or off',
    keys: [],
  } as CommanderCommand,
  userGuide: {
    name: 'user guide',
    keys: [],
  } as CommanderCommand,
  describeItemInMousePointer: {
    name: 'describe item in mouse pointer',
    keys: [],
  } as CommanderCommand,
  describeItemInVoiceoverCursor: {
    name: 'describe item in voiceover cursor',
    keys: [],
  } as CommanderCommand,
  describeItemWithKeyboardFocus: {
    name: 'describe item with keyboard focus',
    keys: [],
  } as CommanderCommand,
  describeMousePointerLocationFromTopLeftOfScreen: {
    name: 'describe mouse pointer location (from top left of screen)',
    keys: [],
  } as CommanderCommand,
  describeMousePointerLocationFromTopLeftOfWindow: {
    name: 'describe mouse pointer location (from top left of window)',
    keys: [],
  } as CommanderCommand,
  describeOpenApplications: {
    name: 'describe open applications',
    keys: [],
  } as CommanderCommand,
  describePositionOfItemInVoiceoverCursor: {
    name: 'describe position of item in voiceover cursor',
    keys: [],
  } as CommanderCommand,
  describeSizeOfItemInVoiceoverCursor: {
    name: 'describe size of item in voiceover cursor',
    keys: [],
  } as CommanderCommand,
  describeWindow: {
    name: 'describe window',
    keys: [],
  } as CommanderCommand,
  goDownOnePage: {
    name: 'go down one page',
    keys: [],
  } as CommanderCommand,
  goLeftABit: {
    name: 'go left a bit',
    keys: [],
  } as CommanderCommand,
  goLeftOnePage: {
    name: 'go left one page',
    keys: [],
  } as CommanderCommand,
  goRightABit: {
    name: 'go right a bit',
    keys: [],
  } as CommanderCommand,
  goRightOnePage: {
    name: 'go right one page',
    keys: [],
  } as CommanderCommand,
  goToBeginning: {
    name: 'go to beginning',
    keys: [],
  } as CommanderCommand,
  goToBottomOfWindow: {
    name: 'go to bottom of window',
    keys: [],
  } as CommanderCommand,
  goToDesktop: {
    name: 'go to desktop',
    keys: [],
  } as CommanderCommand,
  goToDock: {
    name: 'go to dock',
    keys: [],
  } as CommanderCommand,
  goToEnd: {
    name: 'go to end',
    keys: [],
  } as CommanderCommand,
  goToLinkedItem: {
    name: 'go to linked item',
    keys: [],
  } as CommanderCommand,
  goToMenuBar: {
    name: 'go to menu bar',
    keys: [],
  } as CommanderCommand,
  goToPopUpItem: {
    name: 'go to pop-up item',
    keys: [],
  } as CommanderCommand,
  goToStatusMenus: {
    name: 'go to status menus',
    keys: [],
  } as CommanderCommand,
  goToTopOfWindow: {
    name: 'go to top of window',
    keys: [],
  } as CommanderCommand,
  goToVisibleBeginning: {
    name: 'go to visible beginning',
    keys: [],
  } as CommanderCommand,
  goToVisibleEnd: {
    name: 'go to visible end',
    keys: [],
  } as CommanderCommand,
  goUpOnePage: {
    name: 'go up one page',
    keys: [],
  } as CommanderCommand,
  moveDownInRotor: {
    name: 'move down in rotor',
    keys: [],
  } as CommanderCommand,
  moveKeyboardFocusToVoiceoverCursor: {
    name: 'move keyboard focus to voiceover cursor',
    keys: [],
  } as CommanderCommand,
  moveMousePointerToVoiceoverCursor: {
    name: 'move mouse pointer to voiceover cursor',
    keys: [],
  } as CommanderCommand,
  moveToAreaAfterSplitter: {
    name: 'move to area after splitter',
    keys: [],
  } as CommanderCommand,
  moveToAreaBeforeSplitter: {
    name: 'move to area before splitter',
    keys: [],
  } as CommanderCommand,
  moveToNextSection: {
    name: 'move to next section',
    keys: [],
  } as CommanderCommand,
  moveToPreviousSection: {
    name: 'move to previous section',
    keys: [],
  } as CommanderCommand,
  moveUpInRotor: {
    name: 'move up in rotor',
    keys: [],
  } as CommanderCommand,
  moveVoiceoverCursorToKeyboardFocus: {
    name: 'move voiceover cursor to keyboard focus',
    keys: [],
  } as CommanderCommand,
  moveVoiceoverCursorToMousePointer: {
    name: 'move voiceover cursor to mouse pointer',
    keys: [],
  } as CommanderCommand,
  nextContent: {
    name: 'next content',
    keys: [],
  } as CommanderCommand,
  nextRotorItem: {
    name: 'next rotor item',
    keys: [],
  } as CommanderCommand,
  previousContent: {
    name: 'previous content',
    keys: [],
  } as CommanderCommand,
  previousRotoItem: {
    name: 'previous rotor item',
    keys: [],
  } as CommanderCommand,
  rotateLeft: {
    name: 'rotate left',
    keys: [],
  } as CommanderCommand,
  rotateRight: {
    name: 'rotate right',
    keys: [],
  } as CommanderCommand,
  scrollDownOnePage: {
    name: 'scroll down one page',
    keys: [],
  } as CommanderCommand,
  scrollLeftOnePage: {
    name: 'scroll left one page',
    keys: [],
  } as CommanderCommand,
  scrollRightOnePage: {
    name: 'scroll right one page',
    keys: [],
  } as CommanderCommand,
  scrollUpOnePage: {
    name: 'scroll up one page',
    keys: [],
  } as CommanderCommand,
  speakCurrentPageInScrollArea: {
    name: 'speak current page in scroll area',
    keys: [],
  } as CommanderCommand,
  switchWindow: {
    name: 'switch window',
    keys: [],
  } as CommanderCommand,
  toggleVoiceoverCursorFollowsMouseOnOrOff: {
    name: 'toggle voiceover cursor follows mouse on or off',
    keys: [],
  } as CommanderCommand,
  readCurrentCharacter: {
    name: 'read current character',
    keys: [],
  } as CommanderCommand,
  readCurrentCharacterPhonetically: {
    name: 'read current character phonetically',
    keys: [],
  } as CommanderCommand,
  readCurrentLine: {
    name: 'read current line',
    keys: [],
  } as CommanderCommand,
  readCurrentParagraph: {
    name: 'read current paragraph',
    keys: [],
  } as CommanderCommand,
  readCurrentSentence: {
    name: 'read current sentence',
    keys: [],
  } as CommanderCommand,
  readCurrentWord: {
    name: 'read current word',
    keys: [],
  } as CommanderCommand,
  readCurrentWordAlphabetically: {
    name: 'read current word alphabetically',
    keys: [],
  } as CommanderCommand,
  readCurrentWordPhonetically: {
    name: 'read current word phonetically',
    keys: [],
  } as CommanderCommand,
  readFromBeginningToVoiceoverCursor: {
    name: 'read from beginning to voiceover cursor',
    keys: [],
  } as CommanderCommand,
  readNextCharacter: {
    name: 'read next character',
    keys: [],
  } as CommanderCommand,
  readNextLine: {
    name: 'read next line',
    keys: [],
  } as CommanderCommand,
  readNextParagraph: {
    name: 'read next paragraph',
    keys: [],
  } as CommanderCommand,
  readNextSentence: {
    name: 'read next sentence',
    keys: [],
  } as CommanderCommand,
  readNextWord: {
    name: 'read next word',
    keys: [],
  } as CommanderCommand,
  readPreviousCharacter: {
    name: 'read previous character',
    keys: [],
  } as CommanderCommand,
  readPreviousLine: {
    name: 'read previous line',
    keys: [],
  } as CommanderCommand,
  readPreviousParagraph: {
    name: 'read previous paragraph',
    keys: [],
  } as CommanderCommand,
  readPreviousSentence: {
    name: 'read previous sentence',
    keys: [],
  } as CommanderCommand,
  readPreviousWord: {
    name: 'read previous word',
    keys: [],
  } as CommanderCommand,
  readTextAttributes: {
    name: 'read text attributes',
    keys: [],
  } as CommanderCommand,
  selectAll: {
    name: 'select all',
    keys: [],
  } as CommanderCommand,
  selectLeftOfTheCursor: {
    name: 'select left of the cursor',
    keys: [],
  } as CommanderCommand,
  selectRightOfTheCursor: {
    name: 'select right of the cursor',
    keys: [],
  } as CommanderCommand,
  selectText: {
    name: 'select text',
    keys: [],
  } as CommanderCommand,
  selectTextInVoiceoverCursor: {
    name: 'select text in voiceover cursor',
    keys: [],
  } as CommanderCommand,
  toggleTextSpokenAllOrMostRecent: {
    name: 'toggle text spoken all or most recent',
    keys: [],
  } as CommanderCommand,
  unselectText: {
    name: 'unselect text',
    keys: [],
  } as CommanderCommand,
  alwaysAllowKeyboardCommandsToNavigateWebsites: {
    name: 'always allow keyboard commands to navigate websites',
    keys: [],
  } as CommanderCommand,
  findNextAutoWebSpot: {
    name: 'find next auto web spot',
    keys: [],
  } as CommanderCommand,
  findNextButton: {
    name: 'find next button',
    keys: [],
  } as CommanderCommand,
  findNextColumn: {
    name: 'find next column',
    keys: [],
  } as CommanderCommand,
  findNextFrame: {
    name: 'find next frame',
    keys: [],
  } as CommanderCommand,
  findNextLandmark: {
    name: 'find next landmark',
    keys: [],
  } as CommanderCommand,
  findNextLiveRegion: {
    name: 'find next region',
    keys: [],
  } as CommanderCommand,
  findNextRadioGroup: {
    name: 'find next group',
    keys: [],
  } as CommanderCommand,
  findNextTextField: {
    name: 'find next field',
    keys: [],
  } as CommanderCommand,
  findNextTickbox: {
    name: 'find next tickbox',
    keys: [],
  } as CommanderCommand,
  findNextWebSpot: {
    name: 'find next web spot',
    keys: [],
  } as CommanderCommand,
  findPrevious_: {
    name: 'find previous auto web spot',
    keys: [],
  } as CommanderCommand,
  findPreviousButton: {
    name: 'find previous button',
    keys: [],
  } as CommanderCommand,
  findPreviousColumn: {
    name: 'find previous column',
    keys: [],
  } as CommanderCommand,
  findPreviousFrame: {
    name: 'find previous frame',
    keys: [],
  } as CommanderCommand,
  findPreviousLandmark: {
    name: 'find previous landmark',
    keys: [],
  } as CommanderCommand,
  findPreviousRegion: {
    name: 'find previous region',
    keys: [],
  } as CommanderCommand,
  findPreviousGroup: {
    name: 'find previous group',
    keys: [],
  } as CommanderCommand,
  findPreviousField: {
    name: 'find previous field',
    keys: [],
  } as CommanderCommand,
  findPreviousTickbox: {
    name: 'find previous tickbox',
    keys: [],
  } as CommanderCommand,
  findPreviousWebSpot: {
    name: 'find previous web spot',
    keys: [],
  } as CommanderCommand,
  readLinkAddress: {
    name: 'read link address',
    keys: [],
  } as CommanderCommand,
  readWebPageStatistics: {
    name: 'read web page statistics',
    keys: [],
  } as CommanderCommand,
  removeWebSpot: {
    name: 'read web spot',
    keys: [],
  } as CommanderCommand,
  setWebSpot: {
    name: 'set web spot',
    keys: [],
  } as CommanderCommand,
  toggleInsertionPointNavigation: {
    name: 'toggle insertion point navigation',
    keys: [],
  } as CommanderCommand,
  toggleLiveRegion: {
    name: 'toggle live region',
    keys: [],
  } as CommanderCommand,
  toggleTableInteractability: {
    name: 'toggle table interactability',
    keys: [],
  } as CommanderCommand,
  toggleTableRowAndColumnIndices: {
    name: 'toggle table row and column indices',
    keys: [],
  } as CommanderCommand,
  toggleWebNavigationDomOrGroup: {
    name: 'toggle web navigation dom or group',
    keys: [],
  } as CommanderCommand,
} as const);

export type CommanderCommandName = keyof typeof commanderCommands;
