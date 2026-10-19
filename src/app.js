// The page: the game line (what the braille display shows), braille and
// keyboard input, the step timer, speech, sounds, settings and the picture
// for sighted helpers.
(function () {
  'use strict';
  const E = DinoEngine;
  const $ = (id) => document.getElementById(id);
  const line = $('line');
  const scene = $('scene');
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');
  // NVDA and JAWS on Windows differ from VoiceOver in a few ways (the braille
  // cursor, Escape, typed words); see README.md. ?windows=1 or ?windows=0
  // overrides the guess.
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const WINDOWS = params.has('windows') ? params.get('windows') !== '0' : /^win/i.test(platform);

  // ---------- Clock: real timers, or a manual clock for tests ----------
  const clock = TEST
    ? (() => {
        let now = 0;
        let id = 0;
        const due = new Map();
        return {
          manual: true,
          now: () => now,
          after(ms, fn) {
            due.set(++id, { at: now + ms, fn });
            return id;
          },
          cancel(handle) {
            due.delete(handle);
          },
          /** Moves time on, running every timer that falls due, in order. */
          advance(ms) {
            const end = now + ms;
            for (;;) {
              let next = null;
              for (const [handle, t] of due) if (t.at <= end && (!next || t.at < next[1].at)) next = [handle, t];
              if (!next) break;
              due.delete(next[0]);
              now = Math.max(now, next[1].at);
              next[1].fn();
            }
            now = end;
          },
        };
      })()
    : {
        manual: false,
        now: () => performance.now(),
        after: (ms, fn) => setTimeout(fn, ms),
        cancel: (handle) => clearTimeout(handle),
      };

  // ---------- Settings ----------
  const onOff = (v) => (v ? 'on' : 'off');
  const OPTIONS = [
    { key: 'speed', label: 'Speed', values: [1, 2, 3, 4, 5, 6, 7, 8], text: (v) => `${v}, ${E.SPEED_NAMES[v]}, ${E.SPEEDS[v][0]} milliseconds a step` },
    { key: 'speedUp', label: 'Speed up every 100 points', values: [true, false], text: onOff },
    { key: 'width', label: 'Braille display width', values: [14, 20, 32, 40, 80], text: (v) => `${v} cells` },
    { key: 'cursorCell', label: 'Leave the last cell for the screen reader cursor, which NVDA and JAWS need', values: [false, true], text: onOff },
    // VoiceOver's Contracted and Uncontracted tables delete braille cell
    // characters, so on a Mac the game draws in print cells by default, which
    // show in all three of VoiceOver's tables (engine.js). Eight dot keeps the
    // full shapes, with dots 7 and 8, for VoiceOver's Eight dot table alone.
    // Windows always uses braille cells (NVDA's and JAWS's tables keep them),
    // with 6-dot shapes for a display without dots 7 and 8.
    WINDOWS
      ? { key: 'dots', label: 'Braille dots', values: ['8', '6'], text: (v) => (v === '8' ? '8-dot' : '6-dot, for a display without dots 7 and 8') }
      : { key: 'dots', label: 'Braille table', values: ['ueb', '8'], text: (v) => ({ ueb: 'Contracted, uncontracted or eight dot', 8: 'Eight dot, with dots 7 and 8' })[v] },
    { key: 'duckSteps', label: 'Duck length', values: [2, 3, 4, 5, 6, 0], text: (v) => (v ? `${v} steps` : 'until your next key') },
    { key: 'lateHelp', label: 'Late press help', values: [0, 100, 150, 200, 300], text: (v) => (v ? `${v} milliseconds` : 'off') },
    { key: 'birdsFrom', label: 'Birds come from', values: [450, 100, 0], text: (v) => (v ? `${v} points` : 'the start') },
    { key: 'scoreCells', label: 'Score at the end of the line, which shortens the road by 6 cells', values: [false, true], text: onOff },
    { key: 'numbers', label: 'Score numbers', values: ['computer', 'literary'], text: (v) => (settings.dots === 'ueb' ? 'set by your braille table: a number sign with Contracted or Uncontracted, computer braille digits with Eight dot' : v === 'computer' ? 'computer braille' : 'literary, with number sign') },
    { key: 'speech', label: 'Speech', values: ['off', 'voice', 'voiceover'], text: (v) => ({ off: 'off', voice: 'browser voice', voiceover: 'screen reader announcements, which may also flash on braille' })[v] },
    { key: 'sounds', label: 'Sounds', values: ['on', 'quiet', 'off'], text: (v) => v },
    { key: 'routing', label: 'Routing keys during play', values: ['off', 'duck', 'jump'], text: (v) => v },
  ];
  const DEFAULTS = {
    speed: 2, speedUp: true, width: 20, cursorCell: WINDOWS, dots: WINDOWS ? '8' : 'ueb', duckSteps: 4, lateHelp: 150, birdsFrom: 450,
    scoreCells: false, numbers: 'computer', speech: 'off', sounds: 'on', routing: 'off',
  };
  const SETTINGS_KEY = 'braille-dino:settings';
  // Version 2: print cells became the Mac default. Earlier saves hold the old
  // default, Eight dot, which nobody chose (every save stored every setting),
  // so on a Mac it is dropped once and the new default applies.
  const SETTINGS_VERSION = 2;
  const BEST_KEY = 'braille-dino:best';
  const settings = { ...DEFAULTS };
  const saved = TEST ? {} : store.get(SETTINGS_KEY, {});
  if (saved && saved.v !== SETTINGS_VERSION && !WINDOWS) delete saved.dots;
  for (const o of OPTIONS) if (saved && o.values.includes(saved[o.key])) settings[o.key] = saved[o.key];
  const bests = (TEST ? {} : store.get(BEST_KEY, {})) || {};
  const bestScore = () => bests[settings.speed] || 0;

  const speech = new Speech($('announcer'));
  const sounds = new Sounds();

  // ---------- The game line ----------
  // An editable box of two lines: a fixed first line, then the game. Tested
  // with VoiceOver's Braille panel in Safari 27 (2026-10-11): braille shows
  // only the line the caret is on, and on the second line VoiceOver puts
  // nothing in front of it (no label, no field marker). Each change rebuilds
  // both lines and puts the caret back, which VoiceOver shows on braille
  // without speaking; changing the text alone did not refresh the display.
  // Cells go with the caret at the end of the line, so VoiceOver's cursor
  // marker is past the last cell; text goes with the caret at its start, so
  // the display shows its beginning. Nothing may follow the box in the page:
  // with the caret at its end, VoiceOver read the next character after it
  // (the heading's "B", or "new line") on every redraw once a key had been
  // pressed. So the box is last in body.html.
  // NVDA (from its source, not yet tried on a display) adds a blank cell
  // after the line for its cursor and pages forward when the cursor would
  // fall past the display: a 20-cell line on a 20-cell display would show
  // only that blank. The cursorCell setting, on by default on Windows,
  // shortens every line of cells by one so the cursor fits in the last cell.
  // The caret stays at the end: at the start, NVDA's cursor (dots 7 and 8)
  // would blink over the dino.
  const FIRST_LINE = 'Dino';
  let shown = null;
  let shownCaret = 'end';
  let renderedAt = -1e9;
  const onlyCells = (text) => /^[\u2800-\u28ff]+$/.test(text);
  const row = () => line.children[1] || null;

  /** Shows text or cells on the game line. caret: 'end' or 'start'. */
  function show(text, caret = onlyCells(text) ? 'end' : 'start') {
    const top = document.createElement('div');
    top.className = 'first-line';
    top.textContent = FIRST_LINE;
    const game = document.createElement('div');
    game.textContent = text || '\u2800';
    line.replaceChildren(top, game);
    shown = text;
    shownCaret = caret;
    placeCaret();
    renderedAt = clock.now();
  }

  /** Where the caret belongs on the second line. */
  function caretSpot() {
    const node = row() && row().firstChild;
    return node ? { node, offset: shownCaret === 'end' ? node.length : 0 } : null;
  }

  function placeCaret() {
    // Only while the line has focus: a selection elsewhere could pull focus.
    if (document.activeElement !== line) return;
    const spot = caretSpot();
    if (!spot) return;
    const r = document.createRange();
    r.setStart(spot.node, spot.offset);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function caretIsPlaced() {
    const sel = getSelection();
    const spot = caretSpot();
    return !!spot && sel.rangeCount === 1 && sel.isCollapsed && sel.anchorNode === spot.node && sel.anchorOffset === spot.offset;
  }

  /** Puts the game's text back after something typed into the field. */
  function restoreLine() {
    if (shown === null) return;
    if (line.children.length !== 2 || row().textContent !== (shown || '\u2800') || line.firstChild.textContent !== FIRST_LINE) show(shown, shownCaret);
    else if (!caretIsPlaced()) placeCaret();
  }

  /** What is on the line now, and its words: a screen that shows braille
   * cells shows its words instead while the line does not have focus, so
   * VoiceOver never reads the cells aloud when focus comes back. cells: the
   * text has game cells in it (in the 'ueb' dot mode they are print
   * characters, so this cannot be told from the text); caret: where the
   * caret goes ('end' for a line of cells alone). */
  let current = { text: '', spoken: '', cells: false };
  let spokeAt = -1e9;
  const hasCells = (text) => /[\u2801-\u28ff]/.test(text);

  /** A screen of text: shown on the line and, with speech on, spoken.
   * quiet: show it without speaking (focus is moving, and VoiceOver reads
   * the line itself when it gets there). */
  function present(text, spoken = text, { quiet = false, cells = hasCells(text), caret } = {}) {
    current = { text, spoken, cells, caret };
    show(text, caret);
    if (quiet || speech.mode === 'off') speech.clear();
    else {
      speech.say(spoken);
      if (speech.mode === 'voiceover') spokeAt = clock.now();
    }
  }

  // ---------- Numbers in braille cells (the score at the end of the line) ----------
  const COMPUTER_DIGITS = '⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔'; // 0 to 9, lower cells, as 8-dot computer braille
  const LITERARY_DIGITS = '⠚⠁⠃⠉⠙⠑⠋⠛⠓⠊'; // 0 to 9 after the number sign
  const SCORE_CELLS = 6; // a blank, then up to 5 cells
  function scoreField(score) {
    const digits = String(score);
    if (settings.dots === 'ueb') return ('\u2800' + digits.slice(-4)).padEnd(SCORE_CELLS - 1, '\u2800');
    const body = settings.numbers === 'literary'
      ? '⠼' + [...digits.slice(-4)].map((d) => LITERARY_DIGITS[d]).join('')
      : [...digits.slice(-5)].map((d) => COMPUTER_DIGITS[d]).join('');
    return ('⠀' + body).padEnd(SCORE_CELLS, '⠀');
  }
  /** The cells a line may use: the display, less the screen reader's cursor cell. */
  const lineWidth = () => settings.width - (settings.cursorCell ? 1 : 0);
  const fieldWidth = () => (settings.scoreCells ? Math.max(7, lineWidth() - SCORE_CELLS) : lineWidth());

  // ---------- State ----------
  let screen = 'title';
  let run = null;
  let mode = 'play'; // or 'practice'
  let practiceKinds = null;
  let stepTimer = 0;
  let holdTimer = 0;
  let pendingHit = null;
  let lastStep = null;
  let countdown = 0;
  let nextAt = 0;
  let list = null; // a menu or the settings: { kind, title, items, index, back }
  let pager = null; // { pages, index, back }
  let lastRecord = false;
  let crashRun = null;
  let wordInputSeen = false;
  let wordInputExplained = false;
  let returnTo = null; // what the pause or game over came from, for lists

  function stopTimers() {
    clock.cancel(stepTimer);
    clock.cancel(holdTimer);
    stepTimer = holdTimer = 0;
  }

  // ---------- Text for each screen ----------
  const bestText = () => (bestScore() ? ` Best ${bestScore()} at speed ${settings.speed}, ${E.SPEED_NAMES[settings.speed]}.` : '');
  function titleText() {
    return `Dino. Space: play. Any other key: menu.${bestText()}`;
  }
  function wordNote() {
    if (!wordInputSeen || wordInputExplained) return '';
    wordInputExplained = true;
    return WINDOWS
      ? ' Your braille keys arrived as whole words. To duck, set your screen reader\'s braille input table to computer braille, which sends each key at once. In NVDA: Settings, Braille, Input table, English U.S. 8 dot computer braille.'
      : ' Your braille keys arrived as whole words, so only Space works during play, which is enough. To duck, VoiceOver\'s braille input needs its Eight dot table, which sends each key at once.';
  }
  function pausedText(reason) {
    const why = reason === 'focus' ? 'Paused, you left the game line.' : reason === 'stall' ? 'Paused, the game was held up.' : 'Paused.';
    const what = mode === 'practice' ? ` ${run.cleared} cleared, ${run.hits} ${run.hits === 1 ? 'hit' : 'hits'}.` : ` ${run.score} points.`;
    return `${why}${what} Space: go on. Any other key: menu.${wordNote()}`;
  }
  function overText() {
    const best = lastRecord ? ' New best!' : run.mixedSpeed ? ' The speed changed during the run, so no best is kept.' : bestText();
    return `Game over, ${run.score} points. ${E.explainHit(run)}${best} Space: play again. Any other key: menu.${wordNote()}`;
  }
  function practiceText() {
    return `Practice: ${run.cleared} cleared, ${run.hits} ${run.hits === 1 ? 'hit' : 'hits'}. Space: again. Any other key: menu.`;
  }

  // ---------- Pages: help, symbols, display check ----------
  /** A symbol's dots, and in print cells what VoiceOver's Eight dot table shows instead. */
  const dotsText = (s) => (s.eightDots ? `${s.dots}, or ${s.eightDots} with Eight dot` : s.dots);
  function legendOf(key) {
    return E.legend(settings.dots).find((s) => s.key === key);
  }
  /** What late press help gives at this speed: it never takes more than the
   * step time less 60 milliseconds, so a held hit settles within the beat. */
  function lateHelpWords() {
    const [start, fastest] = E.SPEEDS[settings.speed];
    const at = (ms) => Math.max(0, Math.min(settings.lateHelp, ms - 60));
    const now = at(start);
    const later = settings.speedUp ? at(fastest) : now;
    const cut = now < settings.lateHelp ? `, which is all this speed allows of your ${settings.lateHelp}` : '';
    return `at speed ${settings.speed}, a press up to ${now} milliseconds after the step that would hit you still counts${cut}${later < now ? `, down to ${later} as the game speeds up` : ''}.`;
  }
  function helpPages() {
    // The dots, and in print cells what VoiceOver's Eight dot table shows instead.
    const L = (k) => {
      const s = legendOf(k) || legendOf('top');
      return s.eightDots ? `${s.dots} (${s.eightDots} with Eight dot)` : s.dots;
    };
    const six = settings.dots !== '8';
    const ueb = settings.dots === 'ueb';
    return [
      'How to play. Space: next page. Any other key: back.',
      `You are the dino in cell 1. The road runs to the right, and things come towards you one cell at each step. When one reaches cell 1 it vanishes: you passed it, or cell 1 ${ueb ? `shows ${L('crash')}` : 'fills with all its dots'}, a hit.`,
      `Your dino is ${L('run')} when running${six ? '' : ', an o standing on the ground'}. ${ueb ? 'What decides a hit is height. Low in a jump you clear only a small cactus; high in a jump you clear the cacti; ducking passes under the high bird. With Contracted or Uncontracted the dots show those heights: something hits you when it shares a dot row with your dino. With Eight dot, the large cactus shows other dots but hits the same way.' : 'What decides a hit is height: something hits you when it shares a dot row with your dino. Left and right in the cell do not matter.'}`,
      `Space jumps, on either space bar. Your shape rises out of the cell: ${six ? `${L('low')}, then ${L('top')} high in the jump` : `${L('low')}, then ${L('high')}, then ${L('top')} at the top`}, and down again, landing 6 steps after you press.${six ? '' : ' It is your o rising out of the top of the cell, so what is left of it shows how high you are.'}`,
      'Space in the last 2 steps of a jump, as you come down, jumps again as you land. Earlier in a jump it does nothing.',
      `Any other braille key ducks${settings.duckSteps ? ` for ${settings.duckSteps} steps` : ' until your next key, which stands you up'}: ${L('duck')}, low in the cell. In the air it drops you at once, and you duck as you land. P pauses. Menu, Key check shows how each of your keys arrives.`,
      WINDOWS
        ? 'On the keyboard: Space jumps, Down arrow ducks while held, P pauses. With NVDA or JAWS, jump with Space, not the Up arrow, and duck with a letter: arrows make the screen reader read the line. Escape belongs to the screen reader, so P is the pause key.'
        : 'On a Mac keyboard: Space or Up arrow jumps, Down arrow ducks while held, Escape pauses.',
      `Cacti touch the ground. Small cactus: ${L('small')}. Large cactus: ${L('large')}. Jump when the front of a cactus is in cell 2 or 3. A single small one can be jumped from as far as cell 6.`,
      ueb
        ? `Birds. The high bird, ${L('highBird')}, flies at head height: duck under it, or jump when it is in cell 3 or 4, so the top of your jump passes over it. Low birds do not come with this Braille table setting.`
        : `Birds. The low bird, ${L('lowBird')}, ${ueb ? 'the same cell as your duck, touches the ground' : 'slants down to the ground'}: jump it. The high bird, ${L('highBird')}, flies at head height: duck under it, or jump when it is in cell 3 or 4, so the top of your jump passes over it.`,
      `Birds come from ${settings.birdsFrom ? `${settings.birdsFrom} points` : 'the start'}. Groups of 2 or 3 large cacti come from 150 points.`,
      `Your score is the cells you run. Every 100 points${[settings.sounds !== 'off' && ' a chime plays', settings.speedUp && ' the game gets a little faster'].filter(Boolean).join(' and') || ' nothing changes, with your settings'}. Best scores are kept for each speed.`,
      settings.lateHelp
        ? `Late press help: ${lateHelpWords()} Settings has it, the speed and more.`
        : 'Late press help is off, so a press must come before the step that would hit you. Settings can turn it on.',
      `${settings.scoreCells ? `The score shows at the end of the line: the road is cells 1 to ${fieldWidth()}, then a blank cell, then the score.` : 'The score shows when you pause and at game over. Settings can also show it at the end of the line.'}`,
      `Before a run starts or goes on, cell 1 counts down in place of your dino: ${ueb ? 'three dots, two, one' : 'three rows, two, one'}. Then your dino appears and the road moves. If the game line loses focus, the game pauses.`,
      ...(WINDOWS
        ? [
            'Ducking needs your screen reader\'s braille input set to computer braille, which sends each key at once. NVDA: Settings, Braille, Input table, English U.S. 8 dot computer braille. JAWS: Settings Center, Braille, input set to Computer Braille. With other tables only Space works during play, and that is enough: every course can be passed with Space alone.',
            'NVDA tips: the game needs focus mode. If NVDA says browse mode, or keys stop doing anything, press NVDA+Space. Escape, and Space with dots 1 5, switch to browse mode. To stop NVDA saying space on every jump, press NVDA+2 until typed characters are off, or NVDA+S for on-demand speech. If the blinking last cell distracts you, turn off Show cursor in Settings, Braille.',
            'JAWS tips: the game needs forms mode. If keys do nothing, press Enter, dot 8, on the game line, or Insert+Z to turn off the virtual cursor for this tab. Escape, and Space with E, leave forms mode. Insert+2 until JAWS says none stops typing echo. In Settings Center, set Placement of status cells to None.',
            'Avoid Space chords during play: NVDA and JAWS take them as arrows, Escape or Tab. Menu, Display check shows whether the line fits your display.',
          ]
        : [
            `Ducking needs braille keys sent one at a time, as VoiceOver does when its braille input table is Eight dot. With Contracted or Uncontracted input, braille keys arrive as words when you press Space, so during play only Space works, and that is enough: every course can be passed with Space alone. Dot 7 or dot 8 on its own may still duck: Key check shows what arrives.`,
            'VoiceOver tips: turn off hints (VoiceOver Utility, Verbosity, Hints), or a hint flashes over the line after you arrive. If VoiceOver says space when you jump, set typing echo to nothing. Do Not Disturb stops notifications covering the line.',
            'Sounds start after you press a key on the Mac keyboard or click the page once; braille keys alone may not start them in Safari.',
          ]),
      'End of help. Space goes back.',
    ].map((text) => ({ text }));
  }
  function symbolPages() {
    const pages = [{ text: 'Symbols. Each page names a symbol, then shows it. Space: next. Any other key: back.' }];
    for (const s of E.legend(settings.dots)) {
      const name = s.name.replace(/^./, (c) => c.toUpperCase());
      const answer = s.answer ? ` ${s.answer}` : '';
      const dots = dotsText(s);
      pages.push({ text: `${name}: ${s.text} ${dots}.${answer}`, speech: `${name}, ${dots}.${answer}`, cells: true });
    }
    const example = E.createRun({ seed: 1 });
    example.nextX = Infinity;
    example.obstacles = [
      { kind: 'small', x: 4, w: 1, passed: false },
      { kind: 'large', x: 8, w: 2, passed: false },
      { kind: 'highBird', x: 14, w: 1, passed: false },
    ];
    const words = 'An example line: you in cell 1, a small cactus in cell 5, two large cacti in cells 9 and 10, and a high bird in cell 15.';
    pages.push({ text: words, speech: words });
    pages.push({ text: E.cells(example, { dotMode: settings.dots, width: Math.min(lineWidth(), 20) }), speech: 'The example line.', cells: true, caret: 'end' });
    pages.push({ text: 'End of symbols. Space goes back.' });
    return pages;
  }
  function checkPages() {
    const eight = settings.dots === '8';
    const ueb = settings.dots === 'ueb';
    const g = (...d) => E.glyph(E.dots(...d), settings.dots);
    const w = lineWidth();
    const spare = settings.cursorCell;
    // Print cells have no full cell; their marks are dots 2 4, the same in
    // every VoiceOver table.
    const mark = ueb ? g(2, 4) : eight ? g(1, 2, 3, 4, 5, 6) : g(2, 5);
    const markWords = ueb ? 'dots 2 4' : eight ? 'the six dots 1 to 6' : 'dots 2 5';
    const cells = [];
    for (let x = 0; x < w; x++) cells.push((x + 1) % 5 === 0 ? mark : '\u2800');
    cells[0] = legendOf('run').text;
    cells[1] = legendOf('small').text;
    if (ueb) cells[2] = legendOf('duck').text;
    cells[w - 1] = ueb ? mark : eight ? g(1, 2, 3, 4, 5, 6, 7, 8) : g(1, 2, 3, 4, 5, 6);
    const last = ueb ? `the last mark, ${markWords},` : eight ? 'the cell with all 8 dots' : 'the cell with all 6 dots';
    // Braille cells vanish with VoiceOver's Contracted and Uncontracted tables.
    const blank = WINDOWS || !eight ? '' : ' If the test line is blank, VoiceOver is using its Contracted or Uncontracted table: choose Braille table, Contracted, uncontracted or eight dot, in settings.';
    const noLow = !eight ? '' : WINDOWS
      ? ' If cell 2 is empty, turn on 8-dot braille in your screen reader (JAWS: 8 Dot Braille), or choose Braille dots, 6-dot, in settings.'
      : ' If cell 2 is empty, choose Braille table, Contracted, uncontracted or eight dot, in settings.';
    return [
      { text: `Display check. Space shows a test line ${w} cells wide: the Braille display width setting${spare ? ', less the last cell, which is left for your screen reader\'s cursor' : ''}. Any other key: back.` },
      { text: cells.join(''), speech: 'The test line.', cells: true, caret: 'end' },
      { text: `Cell 1 should be your dino, ${legendOf('run').dots}, with nothing before it. Cell 2 is a small cactus, ${legendOf('small').dots}.${ueb ? ` Cell 3 is your shape when ducking, ${dotsText(legendOf('duck'))}; if it takes two cells, the braille table is not one of VoiceOver's own: choose Braille table, Eight dot, with dots 7 and 8.` : ''}${noLow}${blank}${spare ? ' If the display is blank, or the dino is not in cell 1, the line does not fit: check Braille display width in settings.' : ''}` },
      spare
        ? { text: `${last.replace(/^./, (c) => c.toUpperCase())} should be next to last on your display, and the last cell holds only your screen reader's cursor, which may blink. If not, change Braille display width in settings. Every fifth cell is ${markWords}.` }
        : { text: `${last.replace(/^./, (c) => c.toUpperCase())} should be the last cell of your display. If not, change Braille display width in settings. Every fifth cell is ${markWords}.` },
      WINDOWS
        ? { text: 'The other cells should be empty. NVDA\'s blinking cursor can be turned off with Settings, Braille, Show cursor.' }
        : { text: `The other cells should be empty. If dots 7 and 8 show under every cell, turn off Use dots 7 and 8 to indicate VoiceOver cursor in VoiceOver Utility, Braille, Layout${eight ? ', or choose Braille table, Contracted, uncontracted or eight dot' : ''}.` },
      { text: 'End of the check. Space goes back.' },
    ];
  }
  function openPages(pages, back) {
    pager = { pages, index: 0, back };
    screen = 'pager';
    showPage();
  }
  function showPage() {
    const page = pager.pages[pager.index];
    present(page.text, page.speech || page.text, page.cells ? { cells: true, caret: page.caret } : undefined);
  }
  function pageMove(dir) {
    const i = pager.index + dir;
    if (i >= pager.pages.length) return leave(pager.back);
    pager.index = Math.max(0, i);
    showPage();
  }

  // ---------- Lists: menus and settings ----------
  const remembered = {};
  function openList(kind, title, items, back) {
    const start = remembered[title] < items.length ? remembered[title] : 0;
    list = { kind, title, items, index: start, back };
    screen = 'list';
    showItem(true);
  }
  function itemText(item) {
    if (item.option) {
      const o = item.option;
      return `${o.label}: ${o.text(settings[o.key])}`;
    }
    return item.label;
  }
  function showItem(first) {
    const item = list.items[list.index];
    const help = list.kind === 'settings' ? 'Space: next. Any other key: change.' : 'Space: next. Any other key: choose.';
    const intro = first ? `${list.title}. ${help} ` : '';
    present(`${intro}${itemText(item)}, ${list.index + 1} of ${list.items.length}`);
  }
  function listMove(dir) {
    const n = list.items.length;
    list.index = (list.index + dir + n) % n;
    showItem(false);
  }
  function listChoose(dir = 1) {
    const item = list.items[list.index];
    if (item.option) {
      const o = item.option;
      const i = o.values.indexOf(settings[o.key]);
      setOption(o.key, o.values[(i + dir + o.values.length) % o.values.length]);
      showItem(false);
    } else {
      // Come back to an item that returns here (help, settings); anything
      // else (Play, Quit, Back) starts from the top next time.
      if (item.keep) remembered[list.title] = list.index;
      else delete remembered[list.title];
      item.run();
    }
  }

  /** Goes back to where a list or pages came from. */
  function leave(back) {
    list = null;
    pager = null;
    if (typeof back === 'function') back();
    else showTitle();
  }

  const helpItems = (back) => [
    { label: 'How to play', keep: true, run: () => openPages(helpPages(), back) },
    { label: 'Symbols', keep: true, run: () => openPages(symbolPages(), back) },
    { label: 'Settings', keep: true, run: () => openSettings(back) },
    { label: 'Help and settings on the page', keep: true, run: () => openPage() },
  ];
  function openMainMenu() {
    const back = openMainMenu;
    openList('menu', 'Menu', [
      { label: 'Play', run: () => startRun() },
      { label: 'Practice', keep: true, run: () => openPractice(back) },
      ...helpItems(back),
      { label: 'Display check', keep: true, run: () => openPages(checkPages(), back) },
      { label: 'Key check', keep: true, run: () => openKeyCheck(back) },
      { label: 'Start screen', run: () => showTitle() },
    ], showTitle);
  }
  function openSettings(back) {
    openList('settings', 'Settings', [...OPTIONS.map((o) => ({ option: o })), { label: 'Back', run: () => leave(back) }], back);
  }
  function openPractice(back) {
    const start = (kinds) => () => startRun({ practice: true, kinds });
    openList('menu', 'Practice', [
      { label: 'Cacti only, hits do not end the run', run: start(['small', 'large']) },
      { label: 'Birds only', run: start(['lowBird', 'highBird']) },
      { label: 'Everything', run: start(null) },
      { label: 'Back', run: () => leave(back) },
    ], back);
  }
  function openPauseMenu() {
    const back = () => {
      screen = 'paused';
      present(pausedText());
    };
    const backToMenu = openPauseMenu;
    openList('menu', 'Paused', [
      { label: 'Go on', run: () => resume() },
      ...helpItems(backToMenu),
      { label: mode === 'practice' ? 'End practice' : 'Quit this run', run: () => (mode === 'practice' ? endPractice() : showTitle()) },
    ], back);
  }
  function openOverMenu() {
    const backToMenu = openOverMenu;
    const back = () => {
      screen = 'over';
      present(overText());
    };
    openList('menu', 'Game over', [
      { label: 'Play again', run: () => startRun() },
      { label: 'Feel the crash', keep: true, run: () => showCrash(backToMenu) },
      { label: 'Practice', keep: true, run: () => openPractice(backToMenu) },
      ...helpItems(backToMenu),
      { label: 'Start screen', run: () => showTitle() },
    ], back);
  }
  function showCrash(back) {
    screen = 'crashView';
    returnTo = back;
    const words = `The line at the hit. ${E.explainHit(crashRun)} Any key goes back.`;
    present(`${E.cells(crashRun, { dotMode: settings.dots, width: fieldWidth() })} ${words}`, words, { cells: true });
    drawScene(crashRun);
  }

  function setOption(key, value) {
    settings[key] = value;
    if (!TEST) store.set(SETTINGS_KEY, { ...settings, v: SETTINGS_VERSION });
    applySettings();
    syncForm();
  }
  /** The obstacle kinds a run may bring: low birds do not come in print
   * cells (engine.js, UEB_KINDS). kinds: a practice choice, or null for all. */
  function courseKinds(kinds) {
    return settings.dots === 'ueb' ? (kinds || Object.keys(E.KINDS)).filter((k) => E.UEB_KINDS.includes(k)) : kinds;
  }

  function applySettings() {
    sounds.level = settings.sounds;
    speech.mode = settings.speech;
    if (settings.speech === 'off') speech.clear();
    if (run) {
      run.duckSteps = settings.duckSteps;
      run.birdsFrom = settings.birdsFrom;
      if (settings.speed !== run.speed) run.mixedSpeed = true;
      // Switched to print cells mid-run: no more low birds, and the ones
      // already made ahead go (a gap only grows, so every course stays fair).
      run.kinds = courseKinds(practiceKinds);
      if (settings.dots === 'ueb') run.obstacles = run.obstacles.filter((o) => o.kind !== 'lowBird' || o.passed);
    }
    fillSymbolTable();
    drawScene();
  }

  // ---------- Screens ----------
  function showTitle({ quiet = false } = {}) {
    stopTimers();
    clearPendingHit();
    list = pager = null;
    screen = 'title';
    run = null;
    present(titleText(), undefined, { quiet });
    drawScene();
  }

  function newSeed() {
    if (params.has('seed')) return Number(params.get('seed')) >>> 0;
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  }

  function startRun({ practice = false, kinds = null } = {}) {
    stopTimers();
    clearPendingHit();
    speech.clear();
    list = pager = null;
    mode = practice ? 'practice' : 'play';
    practiceKinds = kinds;
    run = E.createRun({ seed: newSeed(), practice, kinds: courseKinds(kinds), duckSteps: settings.duckSteps, birdsFrom: settings.birdsFrom });
    run.speed = settings.speed;
    lastRecord = false;
    countIn();
  }

  const BEAT_MS = 600;
  const CRASH_MS = 1200;
  /** About how long VoiceOver shows an announcement on braille. */
  const ANNOUNCEMENT_MS = 4000;

  /** Shows the line still, with a shrinking bar in cell 1 (three rows, two,
   * one), then starts moving. */
  function countIn() {
    stopTimers();
    screen = 'ready';
    countdown = 3;
    // A VoiceOver announcement may still be showing over the line.
    const wait = speech.mode === 'voiceover' ? Math.max(0, ANNOUNCEMENT_MS - (clock.now() - spokeAt)) : 0;
    const beat = () => {
      if (countdown > 0) {
        sounds.play('beat');
        render();
        holdTimer = clock.after(BEAT_MS, () => {
          countdown--;
          beat();
        });
        return;
      }
      holdTimer = 0;
      screen = 'playing';
      sounds.play('go');
      render();
      lastStep = null;
      scheduleStep(E.stepTime(run, settings.speed, settings.speedUp));
    };
    if (wait > 0) {
      render();
      holdTimer = clock.after(wait, beat);
    } else beat();
  }

  function pause(reason) {
    if (screen !== 'playing' && screen !== 'ready') return;
    stopTimers();
    countdown = 0;
    if (pendingHit) {
      commitHit();
      if (screen !== 'playing') return;
      stopTimers();
    }
    // A held Down key cannot be followed while paused: let it go.
    run.dino.duckHeld = false;
    screen = 'paused';
    sounds.play('pause');
    present(pausedText(reason), undefined, { quiet: reason === 'focus' });
    drawScene();
  }

  function resume() {
    list = pager = null;
    speech.clear();
    countIn();
  }

  function endRun() {
    stopTimers();
    sounds.play('hit');
    if (!run.mixedSpeed && run.score > bestScore()) {
      lastRecord = true;
      bests[settings.speed] = run.score;
      if (!TEST) store.set(BEST_KEY, bests);
    }
    crashRun = E.clone(run);
    screen = 'crash';
    render();
    holdTimer = clock.after(CRASH_MS, () => {
      holdTimer = 0;
      screen = 'over';
      present(overText());
    });
  }

  function endPractice() {
    stopTimers();
    list = pager = null;
    screen = 'practiceOver';
    present(practiceText());
  }

  // ---------- Steps ----------
  const lateHelp = () => Math.max(0, Math.min(settings.lateHelp, E.stepTime(run, settings.speed, settings.speedUp) - 60));

  function scheduleStep(delay) {
    nextAt = clock.now() + delay;
    stepTimer = clock.after(delay, onStep);
  }

  function onStep() {
    stepTimer = 0;
    if (screen !== 'playing') return;
    if (!clock.manual && clock.now() - nextAt > 1000) {
      // The page was held up (a busy Mac or a sleeping tab): stop rather than rush.
      pause('stall');
      return;
    }
    const before = E.clone(run);
    const events = E.step(run);
    lastStep = { before };
    const t = E.stepTime(run, settings.speed, settings.speedUp);
    // Keep to the beat, but never catch up a long stall in a rush.
    const due = Math.max(clock.now() + t / 2, nextAt + t);
    const allowance = lateHelp();
    if (events.includes('hit') && allowance > 0) {
      // Not final yet: a press that arrives in time replays this step with
      // it, as if it had come just before. The line shows the honest overlap.
      render();
      pendingHit = { events, due, timer: clock.after(allowance, commitHit) };
      return;
    }
    finishStep(events, due);
  }

  /** Plays a step's sounds, then draws it and sets the next step for due (an
   * absolute time, so a held hit does not shift the beat). */
  function finishStep(events, due) {
    play(events);
    if (run.over) {
      endRun();
      return;
    }
    render();
    scheduleStep(Math.max(0, due - clock.now()));
    nextAt = due;
  }

  function commitHit() {
    if (!pendingHit) return;
    const { events, due } = pendingHit;
    clearPendingHit();
    finishStep(events, due);
  }

  function clearPendingHit() {
    if (pendingHit) clock.cancel(pendingHit.timer);
    pendingHit = null;
  }

  /** A late press: replay the last step with the press made just before it. */
  function rescue(kind, options) {
    if (!pendingHit || !lastStep) return false;
    const trial = E.clone(lastStep.before);
    const pre = kind === 'jump' ? E.jump(trial) : E.duck(trial, options);
    if (!pre.length || pre.includes('hit') || trial.over) return false;
    const events = E.step(trial);
    if (events.includes('hit')) return false;
    const { due } = pendingHit;
    clearPendingHit();
    run = trial;
    finishStep([...pre, ...events], due);
    return true;
  }

  function play(events) {
    for (const e of events) {
      if (e === 'jump') sounds.play('jump');
      else if (e === 'milestone') sounds.play('milestone');
      else if (e === 'hit' && run.practice) sounds.play('hit');
    }
  }

  function move(kind, options) {
    if (screen !== 'playing') return;
    if (pendingHit) {
      if (kind === 'jump' || kind === 'duck') rescue(kind, options);
      else if (kind === 'stand') {
        // Down let go while a hit is held: whatever happens, it is let go.
        run.dino.duckHeld = false;
        if (lastStep) lastStep.before.dino.duckHeld = false;
      }
      return;
    }
    const events = kind === 'jump' ? E.jump(run) : kind === 'duck' ? E.duck(run, options) : E.standUp(run);
    if (!events.length) return;
    play(events);
    if (run.over) endRun();
    else render();
  }

  // ---------- Drawing ----------
  function render() {
    if (!run) return;
    let text = E.cells(run, {
      dotMode: settings.dots,
      width: fieldWidth(),
      crash: screen === 'crash',
      countdown: screen === 'ready' ? countdown : 0,
    });
    if (settings.scoreCells) text += scoreField(run.score);
    current = { text, spoken: text, cells: true, caret: 'end' };
    show(text, 'end');
    drawScene();
  }

  // The picture for sighted guides: the same world, drawn in the style of
  // the original game (sprites.js). It follows the run's state; the braille
  // line is the game.
  const CELL = 40; // canvas pixels per braille cell
  const GROUND = 124; // the desert line
  const LIFT = { run: 0, duck: 0, low: 26, high: 52, top: 74 };
  const pad5 = (n) => String(Math.min(99999, n)).padStart(5, '0');

  function drawScene(r = run) {
    const S = DinoSprites;
    const ctx = scene.getContext('2d');
    const width = fieldWidth();
    const W = width * CELL;
    scene.width = W;
    scene.height = 150;
    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue('--ink').trim() || '#535353';
    const sky = style.getPropertyValue('--sky').trim() || '#ffffff';
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, scene.height);
    const steps = r ? r.steps : 0;

    // Clouds drift slowly; the ground moves one cell a step.
    ctx.globalAlpha = 0.35;
    const span = W + 240;
    for (let i = 0; i * 260 < span; i++) {
      const x = ((((i * 260 + 120 - steps * 6) % span) + span) % span) - 120;
      S.draw(ctx, S.cloud(), x, 34 + (i % 3) * 14, 2, ink);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.fillRect(0, GROUND, W, 2);
    for (let x = 0; x < width + 1; x++) {
      const k = (x + steps) % 7;
      const left = x * CELL;
      if (k === 1) ctx.fillRect(left + 6, GROUND + 6, 4, 2);
      if (k === 3) ctx.fillRect(left + 22, GROUND + 9, 7, 2);
      if (k === 5) {
        ctx.fillRect(left + 12, GROUND - 2, 6, 2);
        ctx.fillRect(left + 30, GROUND + 5, 2, 2);
      }
    }

    // Score, top right, as the original shows it.
    ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const best = bestScore();
    ctx.globalAlpha = 0.7;
    ctx.fillText(`HI ${pad5(best)}`, W - 82, 8);
    ctx.globalAlpha = 1;
    ctx.fillText(pad5(r ? r.score : 0), W - 10, 8);

    if (r) {
      for (const o of r.obstacles) {
        const k = E.KINDS[o.kind];
        for (let i = 0; i < o.w; i++) {
          const cx = o.x + i;
          if (cx < 1 || cx >= width) continue; // things vanish into the dino's cell
          if (k.bird) {
            const map = S.bird(steps + cx);
            const { w } = S.size(map, 2);
            // The body is 8 rows from the bottom of the (padded) sprite.
            S.draw(ctx, map, cx * CELL + (CELL - w) / 2, o.kind === 'lowBird' ? GROUND + 4 : GROUND - 34, 2, ink);
          } else {
            const map = S.cactus(o.kind === 'large');
            const { w } = S.size(map, 2);
            S.draw(ctx, map, cx * CELL + (CELL - w) / 2, GROUND + 2, 2, ink);
          }
        }
      }
    }

    const crashed = screen === 'crash' || screen === 'over' || screen === 'crashView';
    const pose = r ? E.pose(r) : 'run';
    const map = crashed ? S.dead() : pose === 'duck' ? S.ducking(steps) : pose === 'run' ? S.standing(screen === 'playing' ? steps : 0) : S.jumping();
    S.draw(ctx, map, 4, GROUND + 2 - (crashed ? 0 : LIFT[pose] || 0), 2, ink, sky);

    if (crashed) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px ui-monospace, Menlo, monospace';
      ctx.fillText('G A M E   O V E R', W / 2, 44);
      // The restart arrow.
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(W / 2, 92, 13, Math.PI * 0.25, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2 + 14, 72);
      ctx.lineTo(W / 2 + 16, 88);
      ctx.lineTo(W / 2 + 1, 84);
      ctx.fill();
    } else if (r && r.practice) {
      ctx.textAlign = 'left';
      ctx.fillText('PRACTICE', 10, 8);
    }
  }

  // ---------- What a key does on each screen ----------
  // Actions: space, enter, escape, back, up, down, left, right, release,
  // routing, char (one typed character) and word (several at once, from a
  // literary braille table, sent by the space bar).
  /** A dot key during play: a duck for the set length, or with the length
   * set to "until your next key", a duck until the next dot key. */
  function brailleDuck() {
    if (settings.duckSteps === 0 && run.dino.duckHeld && run.dino.air < 0) move('stand');
    else move('duck', settings.duckSteps === 0 ? { held: true } : undefined);
  }

  // ---------- Key check: what each key sends, and what it does ----------
  let keyCount = 0;
  let checkSpaceAt = -1e9;
  let keyCheckBack = null;
  function openKeyCheck(back) {
    keyCheckBack = back;
    keyCount = 0;
    checkSpaceAt = -1e9;
    screen = 'keycheck';
    present('Key check. Press your braille keys one at a time, a second or two apart; each is described here, with what it does in the game. If a key changes nothing here, it never reached the game. Space twice quickly leaves.');
  }
  const ARROWS = { up: 'the Up arrow', down: 'the Down arrow', left: 'the Left arrow', right: 'the Right arrow' };
  function keyCheck(action, ch) {
    if (action === 'release' || action === 'routing') return;
    clock.cancel(ignoredTimer);
    if (action === 'escape') return leave(keyCheckBack);
    const now = clock.now();
    if (action === 'space') {
      if (now - checkSpaceAt < 1500) return leave(keyCheckBack);
      checkSpaceAt = now;
    } else checkSpaceAt = -1e9;
    keyCount++;
    const what = action === 'space' ? 'Space'
      : action === 'enter' ? (WINDOWS ? 'Enter' : 'Return')
      : action === 'back' ? (WINDOWS ? 'Backspace' : 'Delete')
      : action === 'word' ? `a whole word, ${ch}`
      : action === 'char' ? (ch ? `the character ${ch}` : 'a key with no character')
      : ARROWS[action] || action;
    const does = action === 'space' || action === 'up' ? 'jumps'
      : ch === 'p' ? 'pauses'
      : action === 'word' ? 'jumps, with the space that sent it'
      : 'ducks';
    const said = `${what}, as ${keySource}. In the game it ${does}. ${keyCount} so far. Space twice leaves.`;
    present(said.replace(/^./, (c) => c.toUpperCase()));
  }

  function act(action, ch) {
    sounds.unlock();
    const other = action === 'char' || action === 'word';
    switch (screen) {
      case 'title':
        if (action === 'space' || action === 'enter' || action === 'up') startRun();
        else if (other || action === 'down' || action === 'left' || action === 'right' || action === 'escape' || action === 'back') {
          delete remembered.Menu;
          openMainMenu();
        }
        break;
      case 'list':
        if (action === 'space' || action === 'down') listMove(1);
        else if (action === 'up') listMove(-1);
        else if (other || action === 'enter' || action === 'right') listChoose(1);
        else if (action === 'left') {
          if (list.items[list.index].option) listChoose(-1);
          else leave(list.back);
        } else if (action === 'escape' || action === 'back') leave(list.back);
        break;
      case 'pager':
        if (action === 'space' || action === 'down' || action === 'right' || action === 'enter') pageMove(1);
        else if (action === 'up' || action === 'left') pageMove(-1);
        else if (other || action === 'escape' || action === 'back') leave(pager.back);
        break;
      case 'ready':
        if (action === 'escape' || ch === 'p') pause();
        break;
      case 'playing':
        if (action === 'space' || action === 'up') move('jump');
        else if (action === 'down') move('duck', { held: true });
        else if (action === 'release') move('stand');
        else if (action === 'escape' || ch === 'p') pause();
        else if (action === 'routing') {
          if (settings.routing === 'jump') move('jump');
          else if (settings.routing === 'duck') move('duck');
        } else if (action === 'char' || action === 'back' || action === 'enter' || action === 'left' || action === 'right') brailleDuck();
        break;
      case 'keycheck':
        keyCheck(action, ch);
        break;
      case 'paused':
        if (action === 'space' || action === 'enter' || action === 'escape') resume();
        else if (other || action === 'back' || action === 'down' || action === 'up' || action === 'left' || action === 'right') openPauseMenu();
        break;
      case 'crash':
        break;
      case 'over':
        if (action === 'space' || action === 'enter') startRun();
        else if (other || action === 'escape' || action === 'back' || action === 'down' || action === 'up' || action === 'left' || action === 'right') openOverMenu();
        break;
      case 'practiceOver':
        if (action === 'space' || action === 'enter') startRun({ practice: true, kinds: practiceKinds });
        else if (other || action === 'escape' || action === 'back' || action === 'down' || action === 'up' || action === 'left' || action === 'right') openPractice(showTitle);
        break;
      case 'crashView':
        if (action !== 'release' && action !== 'routing') {
          drawScene();
          leave(returnTo);
        }
        break;
    }
  }

  // ---------- Braille input: text typed into the game line ----------
  // Single letters as contracted braille wordsigns, for literary tables
  // (which send "people" for p, and so on).
  const WORDSIGNS = {
    but: 'b', can: 'c', do: 'd', every: 'e', from: 'f', go: 'g', have: 'h', just: 'j', knowledge: 'k', like: 'l',
    more: 'm', not: 'n', people: 'p', quite: 'q', rather: 'r', so: 's', that: 't', us: 'u', very: 'v', will: 'w',
    it: 'x', you: 'y', as: 'z',
  };
  let lastWordAt = -1e9;
  let lastKeySpaceAt = -1e9;

  function typed(text) {
    if (!text) return;
    if (text === ' ') {
      // A word's own space, or a keyboard space already handled, is not a second press.
      const now = clock.now();
      if (now - lastWordAt < 100 || now - lastKeySpaceAt < 50) return;
      return act('space');
    }
    const chars = [...text];
    // A key with no character of its own (an accent key, an empty insert).
    if (text === '\u0000') return act('char', '');
    if (chars.length === 1) return act('char', text.toLowerCase());
    // A whole word at once: a literary braille table sends what was typed
    // when the space bar is pressed.
    wordInputSeen = true;
    lastWordAt = clock.now();
    const word = text.trim().toLowerCase();
    const letter = [...word].length === 1 ? word : WORDSIGNS[word];
    if (screen === 'playing' || screen === 'ready') {
      if (letter === 'p') act('char', 'p');
      else if (/\s$/.test(text)) act('space');
      return;
    }
    if (word) act('word', letter || word);
    else act('space');
  }

  // What delivered the key being handled, for the key check.
  let keySource = '';
  // A chord that arrives by composing (an accented character) sends a run
  // of events: it counts once, at the start, and the rest are ignored. A
  // browser can drop a composition without compositionend when the line is
  // rebuilt under it (Chrome does), and the flag would then hide every key
  // that arrives as typed text until the page is reloaded. So it also ends
  // when no composition event has come for a moment, and at any key press
  // that is not part of a composition.
  const COMPOSING_MS = 150;
  let composing = false;
  let composingAt = -1e9;
  function inComposition(e) {
    if (e.isComposing) {
      composingAt = clock.now();
      return true;
    }
    if (composing && clock.now() - composingAt > COMPOSING_MS) composing = false;
    return composing;
  }
  // Other blanks are the space bar too: a no-break space (Option-Space), a
  // blank braille cell (a Unicode braille input table), a wide space.
  const BLANKS = { '\u00a0': 'a no-break space', '\u202f': 'a narrow no-break space', '\u2800': 'a blank braille cell', '\u3000': 'a wide space' };
  function key(text, source) {
    if (BLANKS[text]) {
      source = `${source}, ${BLANKS[text]}`;
      text = ' ';
    }
    if (WINDOWS) return gather(text, source);
    keySource = source;
    typed(text);
  }

  // NVDA (and probably JAWS) types a contracted braille word as one key
  // press per letter, all at once, where VoiceOver types it in one go. On
  // Windows, characters that come within a few milliseconds of each other
  // are gathered into one word, as VoiceOver would send it. A lone Space
  // jumps at once, and the word's own space ends it.
  const BURST_MS = 25;
  let burst = '';
  let burstSource = '';
  let burstTimer = 0;
  function flushBurst() {
    clock.cancel(burstTimer);
    burstTimer = 0;
    const text = burst;
    burst = '';
    if (!text) return;
    keySource = burstSource;
    typed(text);
  }
  function gather(text, source) {
    if (text === '\u0000' || (text === ' ' && !burst)) {
      flushBurst();
      keySource = source;
      return typed(text);
    }
    burst += text;
    burstSource = source;
    clock.cancel(burstTimer);
    if (/\s$/.test(text)) flushBurst();
    else burstTimer = clock.after(BURST_MS, flushBurst);
  }

  // Editing actions that are not keys at all (undo from the Edit menu,
  // formatting): ignored. Everything else that arrives is a key.
  const NOT_KEYS = /^(history|format)/;

  let beforeInputHandled = false;
  line.addEventListener('beforeinput', (e) => {
    // The game line only ever shows the game.
    e.preventDefault();
    if (NOT_KEYS.test(e.inputType)) return;
    beforeInputHandled = true;
    setTimeout(() => (beforeInputHandled = false), 0);
    if (inComposition(e) || e.inputType === 'insertFromComposition') return;
    inputType(e.inputType, e.data, e.inputType === 'insertCompositionText' ? 'composing text' : 'typed text');
  });

  function inputType(type, data, source) {
    keySource = source;
    if (type === 'insertLineBreak' || type === 'insertParagraph') act('enter');
    else if (type === 'deleteContentBackward' || type === 'deleteWordBackward') act('back');
    else if (data && !type.startsWith('delete')) key(data, source);
    // Anything else (an insert with no text, a forward delete): still a key.
    else key('\u0000', `${source}, ${type}`);
  }

  // Some input changes the field without a cancellable beforeinput: work out
  // what was typed from the new text, act on it, and put the game back.
  line.addEventListener('input', (e) => {
    const handled = beforeInputHandled;
    beforeInputHandled = false;
    const now = line.textContent;
    const before = FIRST_LINE + (shown || '\u2800');
    restoreLine();
    if (handled || inComposition(e) || NOT_KEYS.test(e.inputType || '')) return;
    if (e.data && e.inputType && e.inputType.startsWith('insert')) return key(e.data, 'text, after the fact');
    let start = 0;
    while (start < before.length && start < now.length && before[start] === now[start]) start++;
    let end = 0;
    while (end < before.length - start && end < now.length - start && before[before.length - 1 - end] === now[now.length - 1 - end]) end++;
    const inserted = now.slice(start, now.length - end);
    if (inserted) key(inserted, 'text, after the fact');
    else if (e.inputType) inputType(e.inputType, null, 'an edit, after the fact');
  });
  line.addEventListener('compositionstart', () => {
    composing = true;
    composingAt = clock.now();
    key('\u0000', 'an accent or composed key');
    composingAt = clock.now();
  });
  line.addEventListener('compositionupdate', () => (composingAt = clock.now()));
  line.addEventListener('compositionend', () => {
    // Its last text comes in this task; ignore it, then listen again.
    composingAt = clock.now();
    setTimeout(() => {
      composing = false;
      restoreLine();
    }, 0);
  });
  for (const type of ['paste', 'drop', 'cut']) line.addEventListener(type, (e) => e.preventDefault());
  // ---------- Keyboard ----------
  const KEYS = {
    ' ': 'space', Enter: 'enter', Escape: 'escape', Backspace: 'back',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  };
  // A space bar that comes without its usual name.
  const keyName = (e) => (e.key === 'Spacebar' || (e.key === 'Unidentified' && (e.code === 'Space' || e.keyCode === 32)) ? ' ' : e.key);
  function onKeyDown(e) {
    // A key press that is not part of a composition: none is going on.
    if (!e.isComposing && e.keyCode !== 229) composing = false;
    // Tab stays on the game line: the rest of the page opens from the menu.
    if (e.key === 'Tab' && trapped) {
      e.preventDefault();
      noteIgnored(e, 'Tab stays on the game line');
      return;
    }
    // Command and Control are the browser's and the screen reader's.
    if (e.ctrlKey || e.metaKey) return noteIgnored(e, `keys with Control or ${WINDOWS ? 'the Windows key' : 'Command'} belong to the browser and the screen reader`);
    const name = keyName(e);
    const action = !e.altKey && KEYS[name];
    if (action) {
      e.preventDefault();
      if (action === 'space') lastKeySpaceAt = clock.now();
      // Held keys repeat only to move through lists and pages, never to
      // choose, change or go back.
      const moving = action === 'space' || action === 'up' || action === 'down';
      if (e.repeat && !((screen === 'list' || screen === 'pager') && moving)) return;
      keySource = name !== e.key ? `a key press named ${e.key}` : e.key === ' ' ? 'a key press' : `the ${e.key} key`;
      if (action === 'down' && !e.repeat) downAt = clock.now();
      act(action);
    } else if ([...e.key].length === 1 || e.key === 'Dead' || (e.altKey && !MODIFIERS.test(e.key))) {
      // A character, an accent key, or a key with Option: braille chords for
      // accented characters can arrive these ways. Cancelling the press stops
      // any composing that would follow.
      e.preventDefault();
      if (e.repeat) return;
      const source = e.key === 'Dead' ? 'an accent key' : e.altKey ? `a key press with ${WINDOWS ? 'Alt' : 'Option'}` : 'a key press';
      key([...e.key].length === 1 ? e.key : '\u0000', source);
    } else noteIgnored(e, /^(Unidentified|Process)$/.test(e.key) ? 'it brought no character' : 'the game does not use it');
  }
  line.addEventListener('keydown', onKeyDown);

  // Key check names keys the game does not use, so a key that seems dead can
  // be told apart from one that never reaches the page. It waits a moment,
  // since a key with no character may still bring typed text. Modifier keys
  // alone are left out: Control alone stops speech, and so on.
  const MODIFIERS = /^(Shift|Control|Alt|AltGraph|Meta|OS|CapsLock|Fn|FnLock|Hyper|Super|Symbol|SymbolLock|NumLock|ScrollLock)$/;
  let ignoredTimer = 0;
  function noteIgnored(e, why) {
    if (screen !== 'keycheck' || e.repeat || MODIFIERS.test(e.key)) return;
    const mods = [e.ctrlKey && 'Control', e.metaKey && (WINDOWS ? 'the Windows key' : 'Command'), e.altKey && (WINDOWS ? 'Alt' : 'Option'), e.shiftKey && 'Shift'].filter(Boolean);
    const named = e.key === ' ' ? 'Space' : e.key;
    const what = `The key ${named}${e.code && e.code !== e.key ? `, code ${e.code}` : ''}${mods.length ? `, with ${mods.join(' and ')}` : ''}`;
    clock.cancel(ignoredTimer);
    ignoredTimer = clock.after(50, () => {
      if (screen !== 'keycheck') return;
      keyCount++;
      checkSpaceAt = -1e9;
      present(`${what}, as a key press the game ignores: ${why}. ${keyCount} so far. Space twice leaves.`);
    });
  }
  // On the document, so letting go of Down is seen wherever focus is.
  // NVDA's caret script sends Down's press and release together and keeps
  // the real release, so a release that comes at once is a tap: a duck of
  // Duck length steps, as a braille key gives.
  let downAt = -1e9;
  document.addEventListener('keyup', (e) => {
    if (e.key !== 'ArrowDown') return;
    if (screen === 'playing' && !pendingHit && run.dino.duckHeld && clock.now() - downAt < 40) {
      if (settings.duckSteps === 0) return; // down until the next key
      run.dino.duckHeld = false;
      move('duck');
      return;
    }
    act('release');
  });

  // ---------- Routing keys: a caret move that the game did not make ----------
  // The game puts the caret back in the same task as every change, so a
  // caret anywhere else was moved by a routing key (or a click). The next
  // step puts it back; moving it here as well would fight VoiceOver.
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== line) return;
    // NVDA moves the caret to the first line when the player pans back past
    // the start, or presses the display's Up key. Put it straight back, and
    // do not count it as a routing press.
    if (WINDOWS && row() && !row().contains(getSelection().anchorNode)) {
      setTimeout(() => {
        if (document.activeElement === line && !caretIsPlaced()) placeCaret();
      }, 0);
      return;
    }
    if (screen !== 'playing') return;
    if (caretIsPlaced() || settings.routing === 'off') return;
    act('routing');
  });

  // ---------- Focus ----------
  // The game line keeps focus. The rest of the page is inert, so VoiceOver
  // has nothing else to read or move to, and focus that drifts (to the page
  // itself, or back from another window) returns to the line. The page opens
  // only from the menu (Help and settings on the page).
  const pageEl = $('page');
  let trapped = true;
  const refocus = () => {
    if (trapped && document.hasFocus() && document.activeElement !== line) line.focus();
  };

  function trap() {
    trapped = true;
    pageEl.inert = true;
    forgetPress();
  }

  /** focus: open it from the menu, with focus on Back to the game and both
   * sections open, so the page reads straight through and Tab reaches every
   * setting. Without it (a mouse press) focus and the sections are left as
   * they are, for the click to act on. */
  function openPage({ focus = true } = {}) {
    trapped = false;
    pageEl.inert = false;
    if (screen === 'playing' || screen === 'ready') pause('focus');
    if (!focus) return;
    for (const d of pageEl.querySelectorAll('details')) d.open = true;
    pageEl.querySelector('.back-to-game').focus();
  }

  function backToGame() {
    trap();
    line.focus();
  }
  for (const b of document.querySelectorAll('.back-to-game')) {
    b.addEventListener('click', () => {
      sounds.unlock();
      backToGame();
    });
  }

  // The mouse (a sighted helper's, say) can use the page at any time. While
  // the game has it locked the page is inert, so a press there lands on the
  // body. A press on one of its controls opens the page, and once the press
  // ends on that control it is passed on to it, unless the browser's own
  // click got there (browsers differ when the target changes during a
  // click). A press on its text does nothing, as before: focus comes back to
  // the line. So does a press that ends off its control, which unlocks
  // nothing in the end. A press on the game locks the page again.
  const CONTROLS = 'summary, button, select, label';
  let pressed = null;
  let passTimer = 0;
  let passed = null; // { control, at }: a click already passed on
  const under = (el, e) => {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  function forgetPress() {
    pressed = passed = null;
    clearTimeout(passTimer);
    passTimer = 0;
  }
  function passOn(control) {
    passTimer = 0;
    passed = { control, at: performance.now() };
    // Focus goes where a click of its own would put it.
    if (control.tagName === 'SUMMARY' || control.tagName === 'SELECT') control.focus({ preventScroll: true });
    if (control.tagName !== 'SELECT') return control.click();
    try {
      if (typeof control.showPicker === 'function') control.showPicker();
    } catch {
      // Focus alone: a second click opens it.
    }
  }
  document.addEventListener('pointerdown', (e) => {
    forgetPress();
    // A plain press of the main button only: no right-click (on a Mac, Control-click).
    if (e.button !== 0 || !e.isPrimary || (e.ctrlKey && !WINDOWS)) return;
    if (trapped && under(pageEl, e)) {
      // Found from the layout, before anything redraws.
      const control = [...pageEl.querySelectorAll(CONTROLS)].find((c) => c.getClientRects().length && under(c, e));
      if (!control) return;
      openPage({ focus: false });
      pressed = control;
    } else if (!trapped && under(document.querySelector('main'), e) && !line.contains(e.target)) backToGame();
  }, true);
  document.addEventListener('pointerup', (e) => {
    const control = pressed;
    pressed = null;
    if (!control || trapped) return;
    const at = document.elementFromPoint(e.clientX, e.clientY);
    if (at && control.contains(at)) passTimer = setTimeout(() => passOn(control), 0);
    // Let go somewhere else: no click, as with any button, and back to the game.
    else backToGame();
  }, true);
  document.addEventListener('pointercancel', () => {
    if (pressed && !trapped) backToGame();
    pressed = null;
  }, true);
  document.addEventListener('click', (e) => {
    if (passTimer && pageEl.contains(e.target)) {
      // The browser's click reached the page itself.
      clearTimeout(passTimer);
      passTimer = 0;
    } else if (passed && e.isTrusted && e.detail > 0 && passed.control.contains(e.target) && performance.now() - passed.at < 700) {
      // A late click (after a touch) on the control just passed on: once is
      // enough. Clicks from the keyboard (detail 0) are left alone.
      e.preventDefault();
      e.stopPropagation();
      passed = null;
    }
  }, true);

  /** Tab on the page: through its buttons, headings and settings, in order,
   * and round again. Safari's own Tab skips buttons and headings, and would
   * jump straight back to the game line. */
  function tabOnPage(dir) {
    const stops = [...pageEl.querySelectorAll('button, summary, select')].filter((el) => el.getClientRects().length);
    if (!stops.length) return;
    const i = stops.indexOf(document.activeElement);
    stops[i < 0 ? (dir > 0 ? 0 : stops.length - 1) : (i + dir + stops.length) % stops.length].focus();
  }

  // Keys pressed outside the game line.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || line.contains(e.target)) return;
    if (trapped) {
      // Focus can be off the line for a moment before it comes back: a key
      // pressed then still reaches the game.
      line.focus();
      onKeyDown(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      backToGame();
    } else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      tabOnPage(e.shiftKey ? -1 : 1);
    }
  });

  let refocusTimer = 0;
  line.addEventListener('blur', () => {
    clearTimeout(refocusTimer);
    if (screen === 'playing' || screen === 'ready') pause('focus');
    // A screen of braille cells shows its words while focus is away, so
    // VoiceOver reads words, not cells, when the player comes back.
    else if (current.cells && current.spoken !== current.text) show(current.spoken);
    setTimeout(refocus, 50);
  });
  document.addEventListener('focusin', (e) => {
    if (trapped && e.target !== line) line.focus();
  });
  window.addEventListener('focus', () => setTimeout(refocus, 0));
  document.addEventListener('pointerdown', () => setTimeout(refocus, 0));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause('focus');
  });
  line.addEventListener('focus', () => {
    if (!trapped) trap();
    if (shown === null) return;
    show(shown, shownCaret);
    // Safari selects the whole field when it is reached with Tab, after this
    // event; put the caret back once that has happened. The cells come back
    // after VoiceOver has read the words.
    clearTimeout(refocusTimer);
    setTimeout(() => {
      if (document.activeElement === line && !caretIsPlaced()) show(shown, shownCaret);
    }, 0);
    if (shown !== current.text) {
      const showing = current;
      refocusTimer = setTimeout(() => {
        if (document.activeElement === line && current === showing) show(current.text, current.caret);
      }, 1500);
    }
  });
  for (const type of ['pointerdown', 'keydown', 'click']) document.addEventListener(type, () => sounds.unlock(), { capture: true });

  // ---------- Settings form (for VoiceOver's normal reading) ----------
  const form = $('settings-form');
  for (const o of OPTIONS) {
    const p = document.createElement('p');
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.id = `opt-${o.key}`;
    label.htmlFor = select.id;
    label.textContent = o.label;
    o.values.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = o.text(v);
      select.append(opt);
    });
    select.addEventListener('change', () => {
      setOption(o.key, o.values[Number(select.value)]);
      if (screen === 'list') showItem(false);
      else if (screen === 'title') show(titleText());
    });
    p.append(label, ' ', select);
    form.append(p);
  }
  function syncForm() {
    for (const o of OPTIONS) {
      const select = $(`opt-${o.key}`);
      // Texts can depend on other settings (Score numbers on Braille table).
      o.values.forEach((v, i) => (select.options[i].textContent = o.text(v)));
      select.value = String(o.values.indexOf(settings[o.key]));
    }
  }

  // ---------- Symbol table on the page ----------
  function fillSymbolTable() {
    const body = $('symbol-rows');
    body.replaceChildren();
    for (const s of E.legend(settings.dots)) {
      const tr = document.createElement('tr');
      const c = document.createElement('td');
      c.className = 'cells';
      c.textContent = s.cell;
      c.setAttribute('aria-hidden', 'true');
      const n = document.createElement('td');
      n.textContent = s.answer ? `${s.name}. ${s.answer}` : s.name;
      const d = document.createElement('td');
      d.textContent = dotsText(s);
      tr.append(c, n, d);
      body.append(tr);
    }
  }

  // ---------- Start ----------
  applySettings();
  syncForm();
  showTitle({ quiet: true }); // VoiceOver reads the line as focus lands on it
  line.focus();

  if (TEST) {
    window.__dino = {
      clock,
      get screen() { return screen; },
      get run() { return run; },
      get pendingHit() { return !!pendingHit; },
      get list() { return list && { title: list.title, index: list.index, items: list.items.map(itemText) }; },
      get trapped() { return trapped; },
      settings,
      line: () => (row() ? row().textContent : ''),
      caretPlaced: () => caretIsPlaced(),
      setOption,
      speech,
    };
  }
})();
