# VoiceOver braille findings

Measured on 2026-10-11 on the player's Mac: macOS 27, Safari 27, VoiceOver with 8-dot computer braille, a 20-cell display, word wrap on. Each result comes from `vo-probe.html` driven by `vo-probe-driver.mjs`: the driver captured VoiceOver's Braille panel (window of AccessibilityVisualsAgent) with `screencapture -l`, decoded it with `read_braille_panel.py`, and polled VoiceOver's last spoken phrase through AppleScript. Each field was reached with Tab and then changed every 550 to 800 milliseconds.

## What VoiceOver shows for a text field

- A single-line `input` or `textarea` is shown as the label in round brackets, a space, then the value after VoiceOver's cursor marker: for `aria-label="Dino"` the display starts with 8 cells before the value. This is what the player read as "Sdine".
- Without a label it shows the role instead, "ed txt", in the same brackets. A one-cell `aria-braillelabel` still leaves 5 cells. A long braille label is cut short with an ellipsis.
- With the caret at the end of the value, VoiceOver pans to the part of the line that holds the caret.
- With word wrap on, VoiceOver treats the blank braille cell (U+2800) as a space: a line longer than the display is broken at blank cells, and runs of blank cells can be squashed. Padding the value to line it up does not work.

## Other elements

- A focused `div`, `button` or list option shows exactly its text from cell 1 (its role goes after the text), but VoiceOver does not refresh the display when the text or the label changes.
- `role="application"` and `role="img"` show the label and role, not the text.

## What works: the game on line 2 of an editable box

- An editable `div` (`role="textbox"`, `aria-multiline="true"`, `contenteditable`) with two lines: a fixed first line and the game on the second.
- On every change, rebuild both lines and put the caret at the end of line 2 (in the same task).
- The display then shows line 2 alone, from cell 1, with nothing in front of it; VoiceOver's cursor marker falls just past the last cell. It refreshed on all 22 changes at 550 milliseconds a step, and none of them was spoken.
- Changing only the text of line 2, without rebuilding, did not refresh the display.
- Text screens use the same box with the caret at the start of line 2, so the display shows the beginning of the text (VoiceOver flashes dot 8 in cell 1 there).

## Speech

- A single-line `input` whose value is changed (value, then the caret to the start) is sometimes read aloud, cell by cell; because 20 braille cells take seconds to say, this keeps VoiceOver talking. This is what the player heard on every refresh.
- VoiceOver's hints ("You are currently on a text area...") are spoken a few seconds after focus and also flash over the braille line. Players can turn hints off in VoiceOver Utility, Verbosity, Hints.

## Playing the real game (2026-10-12)

Measured with `vo-game-driver.mjs`, which opens the game, then sends braille-style keys with `ax-type.swift`: a key press carrying the typed character (key code 0 with a Unicode string; Space with the space bar's code), the shape the player's own logs showed. Inserting text through the accessibility system (setting the focused element's selected text) did not reach the page at all.

- After the first key press, VoiceOver spoke one character on every redraw, and the display flipped between the box's first line and the game. The character was whatever came after the end of the box in the page: the "B" of the heading that followed it (for the player, "new line"). With the caret at the end of the box, VoiceOver reads past it.
- Fix: the box is the last thing in the page (moved to the top with CSS), and the rest of the page is inert while playing. Then 26 seconds of play, with jumps, a crash, a restart and a duck, were silent apart from one hint and single echoes at screen changes (a blank cell, or the first letter of the game over text).
- On load, VoiceOver reads the box aloud in chunks, moving its caret through the text; the display follows for about two seconds, then settles on the start of the line. With the rest of the page inert there is nothing else to read.
- Tab is kept on the box; drifting focus returns to it.
- Changing only the text of line 2, or replacing only line 2, did not help; nor did setting the caret again in a later task.

## Contracted and uncontracted braille (2026-10-18)

The player found the display went blank as soon as a run started with VoiceOver's braille output set to contracted or uncontracted English. Measured with `braille-translate.m`, which loads VoiceOver's own translators and runs them on text (macOS 27):

- VoiceOver's default English (Unified) tables come from the Duxbury translator, which VoiceOver calls "System": `eng-xueb_g1` (uncontracted) and `eng-xueb_g2` (contracted). Both delete braille cell characters: "⠮⠀⠀⠤" comes out as two blank cells. The eight-dot table (`eng-8dot`) and the plain `eng-xueb` keep them.
- The Liblouis translator's English (Unified) tables, contracted and uncontracted, keep braille cells, even 8-dot ones.
- Nine print characters come out as exactly one cell in all four contracted and uncontracted tables, System and Liblouis: a (1), comma (2), apostrophe (3), i (2 4), colon (2 5), o (1 3 5), exclamation mark (2 3 5), hyphen (3 6) and full stop (2 5 6). In contracted braille, other letters standing alone get a grade 1 indicator. Exceptions: a full stop or colon right before a letter (contracted), and punctuation between two letters (Liblouis).
- No print line can be exact in all three of VoiceOver's quick-choice tables (Contracted, Uncontracted, Eight dot): only a ' i o - give the same cell in all three, and no character that Eight dot leaves out shows in the other two. The middle dot (U+00B7) is the useful find: dots 2 5 6 in Contracted and Uncontracted, dots 3 6 8 in Eight dot, both a low shape touching the ground (the Liblouis tables write it as two cells).
- The game's print cells, the Mac default, use o ' i a - ! : and the middle dot. `check-ueb.mjs` played 300 runs and ran all of its over 6,000 different lines (crashes, count-ins on resume, the score at the end) through VoiceOver's Contracted, Uncontracted and Eight dot tables: every one came out as the intended cells, Eight dot with its three differences (middle dot 3 6 8, ! 2 3 4 6, : 1 5 6).

## Still to check on the player's hardware

- That real braille keys behave like the key presses the driver sends. The player's logs showed both those key presses and `beforeinput` text, and the game handles both.
