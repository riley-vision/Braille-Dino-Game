// The game itself, without the page: the world, the dino's moves, the
// obstacles and the braille picture. Given the same seed and the same
// presses it always plays the same way, so it can be tested in Node.
var DinoEngine = (function () {
  'use strict';

  // ---------- Dots and cells ----------
  const BIT = [0, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];
  const dots = (...numbers) => numbers.reduce((mask, n) => mask | BIT[n], 0);
  const cell = (mask) => String.fromCharCode(0x2800 + mask);
  const dotList = (mask) => {
    const on = [];
    for (let n = 1; n <= 8; n++) if (mask & BIT[n]) on.push(n);
    return on;
  };
  const dotWords = (mask) => {
    const on = dotList(mask);
    return on.length ? `dot${on.length > 1 ? 's' : ''} ${on.join(' ')}` : 'blank';
  };

  // Heights. The game has four rows, 1 at the top and 4 on the ground. In
  // 8-dot braille they are the four dot rows of a cell (row 4 is dots 7 and
  // 8); 6-dot braille draws the same four rows in three. A hit is decided by
  // rows alone: something hits you when it shares a row with you.
  const rowSet = (...r) => r.reduce((bits, n) => bits | (1 << n), 0);

  // Print cells, for every VoiceOver braille table. VoiceOver's Contracted
  // and Uncontracted English tables ("System", from Duxbury) delete braille
  // cell characters (U+2800 to U+28FF), so a line of them shows as blanks;
  // only its Eight dot table keeps them. Measured on macOS 27 by running
  // VoiceOver's translators themselves (dev/braille-translate.m). These
  // eight print characters come out as exactly one cell in all three, as
  // long as a colon is never right before a letter (the line never has
  // that). Contracted and Uncontracted give the dots below (6-dot shapes);
  // Eight dot gives the same, except for the three in UEB_EIGHT_DOT. The
  // Liblouis tables (NVDA's, on Windows) write the middle dot as two cells,
  // so Windows keeps braille cells.
  const UEB_TEXT = {
    [BIT[1]]: 'a', [BIT[3]]: "'", [BIT[2] | BIT[4]]: 'i', [BIT[2] | BIT[5]]: ':', [BIT[1] | BIT[3] | BIT[5]]: 'o',
    [BIT[2] | BIT[3] | BIT[5]]: '!', [BIT[3] | BIT[6]]: '-', [BIT[2] | BIT[5] | BIT[6]]: '\u00b7',
    0: '\u2800',
  };
  /** The obstacles that come in print cells. No print symbol for the low bird
   * stays low in all three tables (the middle dot, dots 2 5 6, does not feel
   * like one), so it does not come; the high bird and the cacti do. */
  const UEB_KINDS = ['small', 'large', 'highBird'];
  /** What VoiceOver's Eight dot table shows instead, where it differs. */
  const UEB_EIGHT_DOT = {
    '!': BIT[2] | BIT[3] | BIT[4] | BIT[6],
    ':': BIT[1] | BIT[5] | BIT[6],
    '\u00b7': BIT[3] | BIT[6] | BIT[8],
  };
  /** A cell as the game line writes it: a braille character, or in the
   * 'ueb' mode the print character that becomes that cell. */
  const glyph = (mask, dotMode) => (dotMode === 'ueb' && UEB_TEXT[mask] !== undefined ? UEB_TEXT[mask] : cell(mask));
  /** Which looks a dot mode uses: 8, 6, or 'ueb' (print cells). */
  const lookKey = (dotMode) => (dotMode === '6' ? 6 : dotMode === 'ueb' ? 'ueb' : 8);

  // ---------- Design data ----------
  // The dino has cell 1 to itself; things vanish into it as they reach it.
  // Its shape covers exactly the rows where it can be hit. Running it is an
  // o standing on the ground (8 dots: 2 6 7, rows 2 to 4; nothing ever comes
  // in row 1 alone), ducking the bottom two rows, and in a jump the same o
  // rises out of the top of the cell: in print cells o, i, a; in 8 dots the
  // same o one row lower, standing on dots 7 8 (2 6 7, then 1 3 5, 2 4, 1).
  const POSES = {
    run: { rows: rowSet(2, 3, 4), name: 'you, running', look: { 8: dots(2, 6, 7), 6: dots(2, 3, 4, 6), ueb: dots(1, 3, 5) } },
    duck: { rows: rowSet(3, 4), name: 'you, ducking', look: { 8: dots(3, 6, 7, 8), 6: dots(2, 3, 5, 6), ueb: dots(2, 5, 6) } },
    low: { rows: rowSet(1, 2, 3), name: 'you, low in a jump', look: { 8: dots(1, 3, 5), 6: dots(1, 2, 5), ueb: dots(2, 4) } },
    high: { rows: rowSet(1, 2), name: 'you, high in a jump', look: { 8: dots(2, 4), 6: dots(1, 4), ueb: dots(1) } },
    top: { rows: rowSet(1), name: 'you, at the top of a jump', look: { 8: dots(1), 6: dots(1, 4), ueb: dots(1) } },
  };
  /** The jump, one pose per step. The first pose comes the moment the jump
   * key arrives; the dino lands on the step after the last. */
  const JUMP = ['low', 'high', 'top', 'top', 'high', 'low'];
  /** A jump pressed in these last poses is kept and made on landing. */
  const BUFFER_FROM = 4;

  // Obstacles: their rows (what hits) and how they look. Cacti touch the
  // ground; the low bird is a slant touching the ground; the high bird flies
  // at head height, above a ducking dino and below the top of a jump.
  const KINDS = {
    small: { name: 'small cactus', plural: 'small cacti', rows: rowSet(4), look: { 8: dots(7, 8), 6: dots(3, 6), ueb: dots(3, 6) }, answer: 'Jump.' },
    large: { name: 'large cactus', plural: 'large cacti', rows: rowSet(3, 4), look: { 8: dots(3, 6, 7, 8), 6: dots(2, 3, 5, 6), ueb: dots(2, 3, 5) }, answer: 'Jump.' },
    lowBird: { name: 'low bird', rows: rowSet(3, 4), look: { 8: dots(3, 8), 6: dots(2, 6), ueb: dots(2, 5, 6) }, bird: true, answer: 'Jump.' },
    highBird: { name: 'high bird', rows: rowSet(2), look: { 8: dots(2, 5), 6: dots(1, 4), ueb: dots(1) }, bird: true, answer: 'Duck, or jump so the top of your jump passes over it.' },
  };
  // With no full cell in print, a hit in print cells is dots 2 5.
  const CRASH = { 8: dots(1, 2, 3, 4, 5, 6, 7, 8), 6: dots(1, 2, 3, 4, 5, 6), ueb: dots(2, 5) };
  /** Cell 1 before the world moves: a shrinking bar in place of the dino
   * (three rows, two, one), then the dino appears and the run starts. */
  const COUNTDOWN = [dots(3, 6), dots(2, 3, 5, 6), dots(1, 2, 3, 4, 5, 6)]; // 1, 2, 3 beats left
  /** The same in print cells: three dots, two, one, in every table. None is
   * a colon, which could not come before a high bird's letter. */
  const COUNTDOWN_UEB = [dots(3), dots(3, 6), dots(2, 5, 6)];

  const RULES = {
    dinoCell: 0, // cell 1
    firstAt: 24, // cells ahead of the dino for the first obstacle
    duckSteps: 4, // a braille duck stays down this many steps, then stands
    milestone: 100,
    largeGroupsFrom: 150,
    birdsFrom: 450,
    speedUpEvery: 100,
    speedUp: 0.95,
  };

  // Step time per speed setting, in milliseconds: at the start, and the
  // fastest it speeds up to (5 percent every 100 points).
  const SPEEDS = [null, [700, 500], [550, 400], [450, 330], [360, 260], [280, 200], [220, 160], [170, 125], [130, 100]];
  const SPEED_NAMES = [null, 'very slow', 'slow', 'medium', 'fast', 'very fast', 'super fast', 'ultra fast', 'top speed'];

  // ---------- Random numbers (mulberry32, state kept in the run) ----------
  function random(run) {
    run.rng = (run.rng + 0x6d2b79f5) >>> 0;
    let t = run.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (run, lo, hi) => lo + Math.floor(random(run) * (hi - lo + 1));

  // ---------- A run ----------
  /** kinds: which obstacle kinds may come (practice); null for all. */
  function createRun({ seed = 1, practice = false, kinds = null, duckSteps = RULES.duckSteps, birdsFrom = RULES.birdsFrom } = {}) {
    return {
      rng: seed >>> 0,
      seed: seed >>> 0,
      practice,
      kinds,
      duckSteps,
      birdsFrom,
      steps: 0,
      score: 0,
      hits: 0,
      cleared: 0,
      over: false,
      hit: null, // what the last hit was: { kind, w, pose, phase, fell }
      dino: { air: -1, buffered: false, duck: 0, duckHeld: false, duckOnLanding: false, fell: false, landed: -99, duckEnded: -99 },
      obstacles: [],
      nextX: RULES.dinoCell + RULES.firstAt,
      last: null, // { kind, w } of the last obstacle placed
      sameType: 0,
    };
  }

  function clone(run) {
    return {
      ...run,
      dino: { ...run.dino },
      obstacles: run.obstacles.map((o) => ({ ...o })),
      last: run.last && { ...run.last },
      hit: run.hit && { ...run.hit },
    };
  }

  function pose(run) {
    const d = run.dino;
    if (d.air >= 0) return JUMP[d.air];
    if (d.duck > 0 || d.duckHeld) return 'duck';
    return 'run';
  }
  const dinoRows = (run) => POSES[pose(run)].rows;

  /** The obstacle in the dino's cell that shares a row with it, if any. */
  function hitter(run) {
    const x = RULES.dinoCell;
    const mine = dinoRows(run);
    return run.obstacles.find((o) => !o.passed && o.x <= x && x < o.x + o.w && KINDS[o.kind].rows & mine) || null;
  }

  /** Ends the run on a hit, or in practice counts it and lets the dino through. */
  function checkHit(run, events) {
    const o = hitter(run);
    if (!o) return;
    run.hits++;
    run.hit = { kind: o.kind, w: o.w, pose: pose(run), phase: run.dino.air, fell: run.dino.fell, sinceLanding: run.steps - run.dino.landed, sinceDuck: run.steps - run.dino.duckEnded };
    events.push('hit');
    if (run.practice) o.passed = true;
    else run.over = true;
  }

  // ---------- The dino's moves ----------
  /** Space: jump now if on the ground (or ducking); near the end of a jump,
   * keep it for the landing. */
  function jump(run) {
    const events = [];
    if (run.over) return events;
    const d = run.dino;
    if (d.air >= 0) {
      if (d.air >= BUFFER_FROM && !d.buffered) {
        d.buffered = true;
        events.push('buffered');
      }
      return events;
    }
    d.air = 0;
    d.duck = 0;
    d.duckOnLanding = false;
    d.fell = false;
    events.push('jump');
    checkHit(run, events);
    return events;
  }

  /** A dot key: duck now, for a few steps. In the air: drop at once, and
   * duck on landing. held: the keyboard's Down key, which ducks while held. */
  function duck(run, { held = false } = {}) {
    const events = [];
    if (run.over) return events;
    const d = run.dino;
    if (held) d.duckHeld = true;
    if (d.air >= 0) {
      d.buffered = false;
      if (!d.duckOnLanding) events.push('duckOnLanding');
      d.duckOnLanding = true;
      if (d.air < JUMP.length - 1) {
        d.air = JUMP.length - 1;
        d.fell = true;
        events.push('fall');
        checkHit(run, events);
      }
      return events;
    }
    if (!held) d.duck = run.duckSteps + 1;
    events.push('duck');
    return events;
  }

  /** The keyboard's Down key was let go: stand up now. */
  function standUp(run) {
    const events = [];
    if (run.over) return events;
    const d = run.dino;
    if (!d.duckHeld) return events;
    d.duckHeld = false;
    d.duck = 0;
    d.duckOnLanding = false;
    events.push('stand');
    checkHit(run, events);
    return events;
  }

  // ---------- Obstacles ----------
  const typeOf = (kind) => (KINDS[kind].bird ? 'bird' : kind);
  const allowed = (run, kind) => !run.kinds || run.kinds.includes(kind);

  function chooseNext(run) {
    // The score when this obstacle will reach the dino: birds and groups
    // start at their score there, not when they are made far ahead.
    const at = run.score + run.nextX - RULES.dinoCell;
    // Types as in the original: small cactus, large cactus, bird.
    let types = [];
    if (allowed(run, 'small')) types.push('small');
    if (allowed(run, 'large')) types.push('large');
    const birds = ['lowBird', 'highBird'].filter((k) => allowed(run, k));
    if (birds.length && (run.practice || at >= run.birdsFrom)) types.push('bird');
    // Never three of a type in a row, as in the original.
    if (run.sameType >= 2 && types.length > 1) types = types.filter((t) => t !== typeOf(run.last.kind));
    const type = types[int(run, 0, types.length - 1)];
    if (type === 'bird') return { kind: birds[int(run, 0, birds.length - 1)], w: 1 };
    const groups = type === 'small' || run.practice || at >= RULES.largeGroupsFrom;
    return { kind: type, w: groups ? int(run, 1, 3) : 1 };
  }

  /** The least gap (empty cells) after one obstacle before the next, so that
   * however the first was answered, the next still has at least 2 good steps
   * to press on (3 for most), and so that Space alone can pass every course
   * however a middle bird was jumped: it needs 4 cells after it, and 5
   * before another middle bird. */
  function minGap(prev, next) {
    if (prev.kind === 'highBird') return next.kind === 'highBird' ? 5 : 4;
    const w = Math.min(3, prev.w);
    if (next.kind === 'large' && next.w === 3) return [5, 4, 3][w - 1];
    return [6, 5, 4][w - 1];
  }

  function place(run) {
    const next = chooseNext(run);
    if (run.last) {
      let gap = minGap(run.last, next);
      if (run.practice) gap *= 2;
      run.nextX += gap + int(run, 0, Math.floor(gap / 2));
    }
    run.obstacles.push({ kind: next.kind, x: run.nextX, w: next.w, passed: false });
    run.sameType = run.last && typeOf(run.last.kind) === typeOf(next.kind) ? run.sameType + 1 : 1;
    run.last = next;
    run.nextX += next.w;
  }

  /** Obstacles are made this far ahead, whatever the display width, so a
   * seed gives the same course on every display. */
  const AHEAD = 90;

  // ---------- One step ----------
  function step(run) {
    const events = [];
    if (run.over) return events;
    run.steps++;
    const d = run.dino;
    if (d.air >= 0) {
      d.air++;
      if (d.air >= JUMP.length) {
        d.air = -1;
        d.fell = false;
        d.landed = run.steps;
        events.push('land');
        if (d.buffered) {
          d.buffered = false;
          d.air = 0;
          d.duckOnLanding = false;
          events.push('jump');
        } else if (d.duckOnLanding) {
          d.duckOnLanding = false;
          if (!d.duckHeld) d.duck = run.duckSteps + 1;
        }
      }
    } else if (d.duck > 0) {
      d.duck--;
      if (d.duck === 0) d.duckEnded = run.steps;
    }

    for (const o of run.obstacles) {
      o.x -= 1;
      if (o.x + o.w === RULES.dinoCell && !o.passed) run.cleared++;
    }
    run.obstacles = run.obstacles.filter((o) => o.x + o.w > RULES.dinoCell);
    run.nextX -= 1;
    while (run.nextX <= RULES.dinoCell + AHEAD) place(run);

    const before = run.score;
    run.score++;
    if (Math.floor(run.score / RULES.milestone) > Math.floor(before / RULES.milestone)) events.push('milestone');
    checkHit(run, events);
    return events;
  }

  /** Milliseconds per step: the speed setting's start time, 5 percent
   * faster every 100 points down to its fastest. */
  function stepTime(run, speed, speedUp = true) {
    const [start, fastest] = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(1, speed))];
    if (!speedUp || run.practice) return start;
    const times = Math.floor(run.score / RULES.speedUpEvery);
    return Math.max(fastest, Math.round(start * Math.pow(RULES.speedUp, times)));
  }

  // ---------- The braille picture ----------
  /** The cells of the line. options: dotMode, width, crash (show the crash
   * cell), countdown (beats left, 1 to 3, shown in the dino's cell). */
  function masks(run, { dotMode = '8', width = 20, crash = false, countdown = 0 } = {}) {
    const dm = lookKey(dotMode);
    const x0 = RULES.dinoCell;
    const out = new Array(width).fill(0);
    for (const o of run.obstacles) {
      const k = KINDS[o.kind];
      // In print a cell is one character, so looks replace rather than add.
      for (let x = Math.max(x0 + 1, o.x); x < Math.min(width, o.x + o.w); x++) out[x] = dm === 'ueb' ? k.look[dm] : out[x] | k.look[dm];
    }
    if (width > 0) {
      if (crash) out[x0] = CRASH[dm];
      else if (countdown > 0) out[x0] = (dm === 'ueb' ? COUNTDOWN_UEB : COUNTDOWN)[Math.min(3, countdown) - 1];
      else out[x0] = POSES[pose(run)].look[dm];
    }
    return out;
  }

  function cells(run, options = {}) {
    return masks(run, options).map((m) => glyph(m, options.dotMode)).join('');
  }

  // ---------- Words ----------
  /** Why the last hit happened, in a few words. */
  function explainHit(run) {
    const h = run.hit;
    if (!h) return '';
    const k = KINDS[h.kind];
    const what = h.w > 1 ? `${h.w} ${k.plural}` : k.name.replace(/^./, (c) => c.toUpperCase());
    const it = h.w > 1 ? 'them' : 'it';
    if (h.fell) return `${what}: you dropped onto ${it}.`;
    if (h.kind === 'highBird') {
      if (h.pose === 'run' && h.sinceDuck <= 2) return `${what}: your duck ended too soon. Duck a step later.`;
      if (h.pose === 'run') return `${what}: duck under it with any dot key.`;
      return `${what}: your jump met it. Duck under it, or jump when it is in cell 3 or 4.`;
    }
    if (h.sinceLanding === 0 && h.pose !== 'duck') return `${what}: you jumped too early and landed on ${it}.`;
    if (h.pose === 'duck') return `${what}: you were ducking. Jump ${it}.`;
    if (h.pose === 'run') return `${what}: no jump.`;
    if (h.phase >= 3) return `${what}: you jumped too early.`;
    return `${what}: you jumped too late.`;
  }

  /** Every symbol, for the help and the symbol pages. */
  /** cell: the braille character (for pictures); text: what the game line
   * writes for it in this dot mode. */
  function legend(dotMode = '8') {
    const dm = lookKey(dotMode);
    const items = [];
    for (const [key, p] of Object.entries(POSES)) {
      if (dm !== 8 && key === 'high') continue; // the same as the top in 6 dots
      items.push({ key, dino: true, name: dm !== 8 && key === 'top' ? 'you, high in a jump' : p.name, mask: p.look[dm] });
    }
    for (const [key, k] of Object.entries(KINDS)) {
      if (dm === 'ueb' && key === 'lowBird') continue; // low birds do not come in print cells
      items.push({ key, name: k.name, mask: k.look[dm], answer: k.answer });
    }
    items.push({ key: 'crash', name: 'a hit, in your cell', mask: CRASH[dm] });
    return items.map((it) => {
      const text = glyph(it.mask, dotMode);
      const eight = dm === 'ueb' && UEB_EIGHT_DOT[text];
      // eightDots: the dots VoiceOver's Eight dot table shows, where they differ.
      return { ...it, cell: cell(it.mask), text, dots: dotWords(it.mask), eightDots: eight ? dotWords(eight).replace(/^dots? /, '') : '' };
    });
  }

  return {
    BIT, POSES, JUMP, BUFFER_FROM, KINDS, CRASH, COUNTDOWN, COUNTDOWN_UEB, UEB_TEXT, UEB_EIGHT_DOT, UEB_KINDS, RULES, SPEEDS, SPEED_NAMES, AHEAD,
    dots, cell, glyph, lookKey, dotList, dotWords, rowSet,
    createRun, clone, pose, dinoRows, hitter, jump, duck, standUp, step, stepTime, minGap,
    masks, cells, explainHit, legend, random,
  };
})();
