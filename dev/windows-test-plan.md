# Testing with NVDA and JAWS

The Windows support comes from reading NVDA's source and from JAWS documentation and bug reports (October 2026). None of it has been tried on a braille display yet. These checks go roughly in order of importance; the first three answer most of the open questions.

## Before you start

- NVDA: Preferences, Settings, Braille: Input table English (U.S.) 8 dot computer braille. Press NVDA+2 until typed characters are off.
- JAWS: Settings Center, Braille: input and output Computer Braille, 8 Dot Braille checked, Placement of status cells None. Press Insert+2 until JAWS says none.
- Without a display, NVDA's Braille Viewer (NVDA menu, Tools) shows NVDA's braille on screen; it is 40 cells with no display connected, so set the game's width to 40.

## NVDA, in Chrome

1. Open the page. Listen for NVDA's focus-mode sound, not the browse-mode one, and check that the start screen text begins in cell 1.
2. Menu, Display check, Space. Expect the dino in cell 1, the all-dots cell in cell 19, and NVDA's cursor (dots 7 and 8, blinking) in cell 20. If the display is blank or shifted, turn the setting Leave the last cell for the screen reader cursor off and on again, and try the check at width 14; note what each shows.
3. Play for 30 seconds with Space only: the display should change at every step, the dino should stay in cell 1, and NVDA should stay silent.
4. Menu, Key check: press Space (each space bar), a letter, dot 6 alone, dot 7 alone, dot 8 alone, dots 7 and 8 together, and Space with dot 4. Note how each one arrives, and whether NVDA speaks.
5. During play, press P: the game should pause. Then press Escape once on purpose: expect NVDA's browse-mode sound and keys that do nothing. Press NVDA+Space to get back.
6. On a text screen, press the left thumb key at the start of the line, and the display's Up key. The game line should come straight back (NVDA moves the caret to the first line, and the game puts it back).
7. Choose Help and settings on the page: can the arrows read it? Then Back to the game.
8. Alt+Tab away and back: the game should pause and the line should come back with focus.
9. If you use a contracted input table: on the start screen, type a word and Space. It should act once, as one key (the game gathers letters NVDA sends together).

## JAWS, in Chrome

1. Open the page. Listen for the forms-mode tone, and check that the display shows the title from cell 1. If JAWS says Virtual PC Cursor, press dot 8 (Enter) on the line, or Insert+Z.
2. Menu, Display check: as for NVDA. Note anything before the dino (a label, or "ed"), and whether the line is shifted or blank.
3. Menu, Key check: Space, one dot key, dot 7, dot 8, then P. Note how each arrives and whether JAWS speaks.
4. Play for 30 seconds: does the line move on every step without the display jumping? Does each Space jump?
5. Pause with P, resume with Space. Press Escape once: JAWS should leave forms mode; dot 8 should bring the game line back.
6. Help and settings on the page, then Back to the game: forms mode and the game line should return.

## Then

- Repeat the first three NVDA checks in Edge and Firefox, and the first four JAWS checks in Edge.
- In Firefox with JAWS, turn Speech to screen reader announcements and check that a pause is announced.

## What the game does differently on Windows

- Every line of cells is one cell shorter, so the screen reader's cursor fits in the last cell (setting: Leave the last cell for the screen reader cursor; on by default on Windows).
- Characters that arrive within 25 milliseconds of each other are taken as one word, since NVDA types a contracted word as separate key presses.
- A caret moved off the game's line (by panning back, or the display's Up key) is put back at once and never counts as a routing press.
- Help text names NVDA and JAWS settings, and P is the pause key.
- On every platform: a Down arrow released at once (NVDA sends Down's press and release together) is a timed duck, and live regions are not marked atomic in Firefox, which JAWS ignores there.
