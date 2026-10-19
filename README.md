# Braille Dino

The Chrome dino game (the T-Rex runner), made to be read and played on a single-line refreshable braille display with a screen reader. It is tested with VoiceOver on a Mac. NVDA and JAWS on Windows are supported from how they are documented to work, but have not yet been tried on a display (see [Testing with NVDA and JAWS](dev/windows-test-plan.md)). It is one HTML file, `index.html`, that runs in Safari, Chrome, Edge or Firefox. It is slower than the original so a braille display can keep up, and the space bars of the display are the jump keys.

It was designed for the HumanWare NLS eReader (20 cells, 8-dot) and also works at 14, 32, 40 and 80 cells, and with any of VoiceOver's quick-choice braille tables: Contracted, Uncontracted and Eight dot (see below).

## Starting

Play it online at the project's GitHub Pages address, or download the repository and open `index.html`.

On a Mac:

1. Open the game in Safari (double-click `index.html`, or drag it onto Safari).
2. Turn on VoiceOver with your braille display connected. Focus lands on the game line, which shows the start screen.
3. Press either space bar to play.

On Windows:

1. Start NVDA or JAWS with your braille display connected, and set its braille input to computer braille (see below).
2. Open the game in Chrome, Edge or Firefox. Focus lands on the game line; NVDA should switch to focus mode, JAWS to forms mode. If keys do nothing, press NVDA+Space in NVDA, or Enter (dot 8) on the game line in JAWS.
3. Choose Display check from the menu first, to check that the line fits your display, then press either space bar to play.

Everything is on the game line: press any braille key other than Space on the start screen for the menu, with How to play, Symbols, Practice, Settings, a Display check and a Key check (press your braille keys one at a time and it tells you how each one arrived and what it does in the game; a key the game ignores is named as such, and a key that changes nothing there never reached the page).

While you play, the game line is the only thing on the page your screen reader can reach, and Tab stays on it, so you cannot drift off it; if focus does leave (to another window, say), the game pauses and focus returns to the line when you come back. The page also has a How to play section and a Settings section for your screen reader's normal reading: choose Help and settings on the page from the menu. Tab then moves through the page's buttons, headings and settings (in Safari too, where Tab normally skips buttons), and Back to the game (or Escape) returns you. With a mouse, a sighted helper can click the page's headings and settings at any time; clicking the game picture or the game line goes back to the game.

## How to play

You are the dino in cell 1, the first cell of your display. Things come from the right, one cell at each step, and vanish as they reach you, or hit you and end the run. Each cell's dot rows are heights: dots 1 and 4 are high in the sky, and the bottom row is the ground. On a Mac the game draws with print characters by default, so it shows with any of VoiceOver's braille tables; see [Braille tables](#braille-tables-contracted-uncontracted-and-eight-dot) for those shapes.

Your dino's shape covers exactly the rows where it can be hit. Something hits you when it shares a dot row with your dino; left and right in the cell do not matter.

| Key | During play | Elsewhere |
|---|---|---|
| Space (either space bar) | Jump | Play, go on, next item or page |
| Any other braille key | Duck (in the air: drop at once) | Choose, change a setting, go back from a page |
| P | Pause | (same as any other key) |

On a Mac keyboard: Space or Up arrow jumps, Down arrow ducks while held, Escape pauses; in menus the arrows move and Enter chooses. With NVDA or JAWS, jump with Space rather than the Up arrow and duck with a letter (arrows make the screen reader read the line aloud), and pause with P: Escape belongs to the screen reader there, which uses it to leave focus mode or forms mode.

### Symbols with Eight dot, with dots 7 and 8

This is the setting for VoiceOver's Eight dot table, and Windows always uses it. A hit fills cell 1 with all 8 dots, and dots 7 and 8 are the ground.

| Cell | What it is | What to do |
|---|---|---|
| ⡢ dots 2 6 7 | You, running: an o standing on the ground | |
| ⣤ dots 3 6 7 8 | You, ducking | |
| ⠕ ⠊ ⠁ | You in a jump: the same o rises out of the top of the cell, dots 1 3 5, then 2 4, then 1 at the top (the print shapes o, i, a) | |
| ⣀ dots 7 8 | Small cactus | Jump |
| ⣤ dots 3 6 7 8 | Large cactus | Jump |
| ⢄ dots 3 8 | Low bird, slanting down to the ground | Jump |
| ⠒ dots 2 5 | High bird, at head height | Duck, or jump when it is in cell 3 or 4 |
| ⣿ all 8 dots | A hit, in cell 1 | |

Jump when the front of a cactus reaches cell 2 or 3. Space in the last 2 steps of a jump jumps again as you land. Birds come from 450 points (a setting can bring them sooner). When you hit something, the game over line says why, and the menu's Feel the crash shows the line at the hit.

### Timing help

- Eight speeds, from 700 to 130 milliseconds a step (the default, slow, is 550). The game speeds up 5 percent every 100 points, to a floor for each speed (100 at the fastest).
- Late press help: a jump or duck that arrives up to 150 milliseconds after the step that would have hit you still counts. You can set it from off to 300, but it is never more than the step time less 60 milliseconds, so at the fastest speeds it is much shorter (at speed 8, 70 milliseconds, then 40 as the game speeds up). How to play gives the figure for your speed.
- A braille duck lasts 4 steps; Settings, Duck length, can make it 2 to 6 steps, or "until your next key": one dot key ducks and the next stands you up.
- Before every start and resume, cell 1 counts down in place of your dino (three dots, two, one in print cells; three rows, two, one with Eight dot, with dots 7 and 8), then the dino appears and the road moves.
- The game pauses when the game line loses focus.

## VoiceOver settings that help

- Braille input: computer braille, which sends each key at once. Ducking needs it. With a literary table, keys arrive only when you press the space bar, so only jumping works during play; every course can still be passed with Space alone.
- VoiceOver Utility, Braille, Layout: turn off Show multiple items, so the game line fills the display.
- If dots 7 and 8 show under every cell, turn off Use dots 7 and 8 to indicate VoiceOver cursor, or keep the default Braille table, which has no dots 7 and 8 under the road.
- Turn off hints (VoiceOver Utility, Verbosity, Hints), or a hint ("actions available…") flashes over the line a few seconds after you arrive on it.
- If VoiceOver says "space" when you jump, set typing echo to nothing (VoiceOver Utility, Verbosity, Text).
- Turn on Do Not Disturb: notifications flash over the braille line.
- Speech is off by default. Settings can turn on the browser's own voice (it does not touch the braille display) or screen reader announcements (these also flash on braille for a few seconds). Nothing is ever spoken during play.

## Braille tables: Contracted, Uncontracted and Eight dot

VoiceOver's quick choice of braille table offers Contracted, Uncontracted and Eight dot. Contracted and Uncontracted (VoiceOver's own "System" English (Unified) tables) leave out braille cell characters, so a game line drawn with them would go blank. So on a Mac the game draws, by default, with eight print characters that all three tables turn into exactly one cell each (Settings, Braille table, **Contracted, uncontracted or eight dot**):

| Print | Contracted and Uncontracted | Eight dot | What |
|---|---|---|---|
| o | dots 1 3 5 | the same | you, running |
| · (middle dot) | dots 2 5 6 | dots 3 6 8 | you, ducking |
| i | dots 2 4 | the same | you, low in a jump |
| a | dot 1 | the same | you, high in a jump; the high bird |
| - | dots 3 6 | the same | small cactus |
| ! | dots 2 3 5 | dots 2 3 4 6 | large cactus |
| : | dots 2 5 | dots 1 5 6 | a hit, in cell 1 (print has no full cell) |
| ' | dot 3 | the same | the count-in: three dots (·), two (-), one (') |

So the game works whichever of the three you pick, with no change in the game. With Eight dot the differing shapes still hit at the same heights: low in a jump you clear only a small cactus, high in a jump you clear the cacti. Low birds do not come with this setting: no print symbol for them stays low in all three tables and still feels like a bird. The high bird and both cacti do. This was checked by running VoiceOver's own translators on over 6,000 game lines (`dev/check-ueb.mjs`). Only five print characters come out the same in all three tables, too few for the shapes, so the Eight dot column differs in three places; the help and the Symbols pages give both.

With VoiceOver's Eight dot table you can instead choose **Eight dot, with dots 7 and 8**, braille cells with the ground on dots 7 and 8: the same o for your dino, one row lower, and both birds (low birds come only with this setting) (in Contracted or Uncontracted that one goes blank, and the Display check says so).

With a Contracted or Uncontracted braille input table, braille keys arrive as words when you press Space, so during play only Space works, which is enough: every course can be passed with Space alone. Dot 7 or dot 8 on its own may still duck; Key check shows what arrives. An Eight dot input table sends each key at once, so every key ducks.

On Windows the game always uses braille cells: NVDA's and JAWS's tables keep them (and write the middle dot as two cells). Its setting there is Braille dots: 8-dot, or 6-dot for a display without dots 7 and 8.

## NVDA settings that help (not yet tried on a display)

- The game needs focus mode. NVDA should switch to it by itself when the page opens. If NVDA says browse mode, or keys stop doing anything, press NVDA+Space. Escape, and Space with dots 1 5 on the display, switch to browse mode.
- Braille input table: English (U.S.) 8 dot computer braille (NVDA menu, Preferences, Settings, Braille), so each key is sent at once. Ducking needs it.
- To stop NVDA saying "space" on every jump, press NVDA+2 until typed characters are off, or NVDA+S for on-demand speech while you play.
- NVDA pages the braille display forward when its cursor would fall past the last cell, so on Windows the game leaves the last cell of the line for the cursor (Settings, Leave the last cell for the screen reader cursor) and the dino stays in cell 1. If the blinking cursor distracts you, turn off Show cursor in NVDA's Braille settings.
- Avoid Space chords during play: NVDA takes them as arrows, Escape or Tab.
- If, after Help and settings on the page, the arrows do not read the page, press NVDA+Space once.
- For a sighted helper, or to try it without a display: NVDA menu, Tools, Braille Viewer (40 cells when no display is connected, so set the game's width to 40).

## JAWS settings that help (not yet tried on a display)

- The game needs forms mode. If keys do nothing, press Enter (dot 8) on the game line, or Insert+Z to turn off the virtual cursor for this tab. Escape, and Space with E on the display, leave forms mode.
- Settings Center, Braille: input and output Computer Braille, 8 Dot Braille checked, Placement of status cells None.
- To stop typing echo, press Insert+2 until JAWS says none.
- If something comes before the dino in the Display check, try Line mode (on HumanWare displays such as the NLS eReader, Space with dots 2 5 cycles the braille mode).
- After Help and settings on the page, if JAWS cannot find the headings, press Insert+Escape to refresh.
- To connect the NLS eReader: Options, Braille, Add Braille Display, HumanWare Brailliant BI 20X, then restart JAWS.

## Publishing on GitHub Pages

The game is the single file `index.html` at the top of the repository (with an empty `.nojekyll` beside it), so GitHub Pages can serve it as it is. On the repository's page: Settings, Pages, Build and deployment, Source: Deploy from a branch; Branch: main, folder: / (root); Save. After a minute the game is at `https://YOUR-NAME.github.io/REPOSITORY/`.

After any change in `src/`, run `node build.mjs`, then commit and push; the tests fail if `index.html` is out of date.

## For developers

The game is built from the files in `src/`:

| File | What it holds |
|---|---|
| `src/engine.js` | The game without the page: world, moves, obstacles and the braille picture. Deterministic from a seed. |
| `src/app.js` | The page: game line, braille and keyboard input, step timer, menus, settings, speech, sounds and the picture for sighted helpers. |
| `src/infra.js` | Storage, speech and sounds. |
| `src/body.html`, `src/style.css` | The page itself. |

Build `index.html` after any change:

```bash
node build.mjs
```

Run the tests (engine tests in Node; page tests in headless Google Chrome through Playwright). Install Playwright once, then run them; Google Chrome must be installed:

```bash
npm install
```

```bash
npm test
```

Open `index.html?test&seed=7` for a manual clock and a fixed course; the tests use this.

The game line is an editable box with two lines, a fixed first line and the game on the second, because VoiceOver's Braille panel showed that this is the one layout where the display starts with the game itself and refreshes silently. See [dev/voiceover-findings.md](dev/voiceover-findings.md). Braille keys are read from key presses and `beforeinput` events, however they arrive.

On Windows, NVDA adds a blank cell after the line for its cursor and pages the display forward when the cursor would fall past the last cell, which would leave a 20-cell line on a 20-cell display showing only that blank. So on Windows every line of cells is one cell shorter (the `cursorCell` setting), and the caret stays at the end so NVDA's cursor never covers the dino. `?windows=1` or `?windows=0` overrides the platform guess. Other Windows differences (Escape, arrows, words typed as separate letters) are handled in `src/app.js`; [dev/windows-test-plan.md](dev/windows-test-plan.md) lists what to check on real hardware.

The box must stay the last thing in the page: with something after it, VoiceOver read the next character past the line's end on every redraw (a test checks this). `dev/` also has the tools behind those findings: `vo-probe.html` (test fields), `vo-probe-driver.mjs` and `vo-game-driver.mjs` (drive Safari under VoiceOver and record its Braille panel and speech), `read_braille_panel.py` (turns a screenshot of the Braille panel back into braille characters), and `ax-type.swift` (types the way VoiceOver delivers braille keys). Run them only with the player's permission: they take over VoiceOver. `braille-translate.m` runs VoiceOver's own braille translators (System and Liblouis) on any text without VoiceOver, and `check-ueb.mjs` uses it to check the contracted-braille mode.

## Licence and credits

MIT licence; see [LICENSE](LICENSE). Braille Dino is a fan-made accessible version of the offline dinosaur game in Google Chrome. It is not affiliated with or endorsed by Google, and its pictures are drawn for this project.
