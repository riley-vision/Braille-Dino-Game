// Engine tests: run with `node --test tests/`. No browser needed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEngine } from './load.mjs';

const E = loadEngine();
const MODES = ['8', '6', 'ueb'];
const BIT = [0, 1, 2, 4, 8, 16, 32, 64, 128];
const ROW_DOTS = [0, 1 | 8, 2 | 16, 4 | 32, 64 | 128]; // dot rows 1 to 4 of an 8-dot cell
const X = E.RULES.dinoCell;
const NEEDS = { small: 'jump', large: 'jump', lowBird: 'jump', highBird: 'duck' };

/** A run with only the given obstacles, and nothing else coming. */
function course(obstacles, options = {}) {
  const run = E.createRun({ seed: 1, ...options });
  run.nextX = Infinity;
  run.obstacles = obstacles.map((o) => ({ w: 1, passed: false, ...o }));
  return run;
}

/** Distances (cells from the dino to the front of a lone obstacle) at which
 * a move made now clears it. */
function windowFor(kind, w, move) {
  const ok = [];
  for (let d = 1; d <= 10; d++) {
    const run = course([{ kind, x: X + d, w }]);
    if (move) E[move](run);
    for (let i = 0; i < 20 && !run.over; i++) E.step(run);
    if (!run.over) ok.push(d);
  }
  return ok;
}

test('every symbol is the Unicode cell of its dots', () => {
  for (const dm of MODES) {
    for (const s of E.legend(dm)) {
      const mask = s.cell.codePointAt(0) - 0x2800;
      assert.ok(mask > 0 && mask < 256, `${s.name} is a braille cell with dots`);
      const listed = s.dots.replace(/^dots? /, '').split(' ').map(Number);
      assert.equal(listed.reduce((m, n) => m | BIT[n], 0), mask, `${dm}-dot ${s.name}: ${s.dots}`);
    }
  }
});

test('the dino covers exactly the rows where it can be hit, and looks unlike anything else', () => {
  for (const [name, p] of Object.entries(E.POSES)) {
    const look = p.look[8];
    for (let r = 1; r <= 4; r++) assert.equal(!!(look & ROW_DOTS[r]), !!(p.rows & (1 << r)), `8-dot ${name}, row ${r}`);
  }
  for (const dm of MODES) {
    const legend = E.legend(dm);
    const you = legend.filter((s) => s.dino).map((s) => s.cell);
    const things = legend.filter((s) => !s.dino && s.key !== 'crash').map((s) => s.cell);
    assert.equal(new Set(you).size, you.length, `${dm}-dot dino shapes: ${you.join(' ')}`);
    assert.equal(new Set(things).size, things.length, `${dm}-dot obstacles: ${things.join(' ')}`);
    assert.ok(!things.includes(you[0]), `${dm}-dot running dino is unlike every obstacle`);
  }
  assert.equal(E.POSES.run.look[8], E.dots(2, 6, 7), 'an o standing on the ground');
  assert.deepEqual(['low', 'high', 'top'].map((k) => E.POSES[k].look[8]), [E.dots(1, 3, 5), E.dots(2, 4), E.dots(1)], 'the o rising out of the cell');
  for (const k of Object.values(E.KINDS)) assert.equal(k.rows & (1 << 1), 0, 'nothing comes in row 1, so the running o need not cover it');
  assert.equal(E.POSES.duck.look[8], E.dots(3, 6, 7, 8));
});

test('in 6 dots (and in print) every shape covers exactly its rows: 1 and 2 share dots 1 4, 3 is dots 2 5, 4 is dots 3 6', () => {
  const GROUPS = [[[1, 2], E.dots(1, 4)], [[3], E.dots(2, 5)], [[4], E.dots(3, 6)]];
  for (const dm of [6, 'ueb']) {
    for (const [name, t] of [...Object.entries(E.POSES), ...Object.entries(E.KINDS)]) {
      for (const [rows, mask] of GROUPS) {
        assert.equal(!!(t.look[dm] & mask), rows.some((r) => t.rows & (1 << r)), `${dm} ${name}, rows ${rows}`);
      }
    }
  }
});

test('print cells: the line is the eight print characters, never with a colon before a letter', () => {
  const allowed = new Set(Object.values(E.UEB_TEXT));
  for (const s of E.legend('ueb')) assert.ok(allowed.has(s.text) && s.text !== '\u2800', `${s.name}: ${s.text}`);
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const run = E.createRun({ seed, birdsFrom: 0, kinds: E.UEB_KINDS });
    for (let i = 0; i < 800 && !run.over; i++) {
      if (i % 7 === 0) E.jump(run);
      if (i % 11 === 0) E.duck(run);
      E.step(run);
      for (const opts of [{}, { countdown: 1 + (i % 3) }, { crash: run.over }]) {
        const line = E.cells(run, { dotMode: 'ueb', width: 40, ...opts });
        assert.equal([...line].length, 40);
        for (const ch of line) {
          assert.ok(allowed.has(ch), `only the nine characters and blanks: ${JSON.stringify(line)}`);
          seen.add(ch);
        }
        // A colon right before a letter would make Contracted add a cell.
        assert.doesNotMatch(line, /:[aio]/, JSON.stringify(line));
        assert.ok(![...line.slice(1)].includes('\u00b7'), 'no low birds: the middle dot is only ever you, in cell 1');
      }
    }
  }
  for (const ch of "o-!\u00b7ai:'") assert.ok(seen.has(ch), `${ch} appears in play`);
});

test('6-dot mode never uses dots 7 or 8', () => {
  for (const s of E.legend('6')) assert.equal(s.mask & 0xc0, 0, s.name);
  for (let seed = 1; seed <= 20; seed++) {
    const run = E.createRun({ seed, practice: true });
    for (let i = 0; i < 600; i++) {
      E.step(run);
      if (i % 7 === 0) E.jump(run);
      if (i % 11 === 0) E.duck(run);
      for (const m of E.masks(run, { dotMode: '6', width: 40, countdown: i % 4 })) assert.equal(m & 0xc0, 0);
      for (const m of E.masks(run, { dotMode: '6', width: 40, crash: true })) assert.equal(m & 0xc0, 0);
    }
  }
});

test('the line is the display width, with the dino in cell 1 and nothing else there', () => {
  for (const width of [14, 20, 32, 40, 80]) {
    const run = E.createRun({ seed: 3 });
    for (let i = 0; i < 40; i++) E.step(run);
    const cells = [...E.cells(run, { width })];
    assert.equal(cells.length, width);
    for (const ch of cells) assert.ok(ch.codePointAt(0) >= 0x2800 && ch.codePointAt(0) <= 0x28ff);
  }
  const dino = new Set(Object.values(E.POSES).map((p) => p.look[8]));
  const run = E.createRun({ seed: 4, practice: true });
  for (let i = 0; i < 1000; i++) {
    E.step(run);
    if (i % 9 === 0) E.jump(run);
    if (i % 13 === 0) E.duck(run);
    assert.ok(dino.has(E.masks(run, { width: 20 })[0]), `cell 1 is the dino at step ${i}`);
  }
  assert.equal(E.masks(run, { crash: true })[0], E.CRASH[8]);
  assert.equal(E.masks(run, { countdown: 3 })[0], E.COUNTDOWN[2]);
});

test('jump and duck windows', () => {
  assert.deepEqual(windowFor('small', 1), [], 'running into a small cactus is a hit');
  assert.deepEqual(windowFor('small', 1, 'jump'), [1, 2, 3, 4, 5]);
  assert.deepEqual(windowFor('small', 2, 'jump'), [1, 2, 3, 4]);
  assert.deepEqual(windowFor('small', 3, 'jump'), [1, 2, 3]);
  assert.deepEqual(windowFor('large', 1, 'jump'), [1, 2, 3, 4]);
  assert.deepEqual(windowFor('large', 2, 'jump'), [1, 2, 3]);
  assert.deepEqual(windowFor('large', 3, 'jump'), [1, 2]);
  assert.deepEqual(windowFor('lowBird', 1, 'jump'), [1, 2, 3, 4]);
  assert.deepEqual(windowFor('lowBird', 1, 'duck'), [], 'ducking does not clear a low bird');
  assert.deepEqual(windowFor('highBird', 1), [], 'running into a high bird is a hit');
  assert.deepEqual(windowFor('highBird', 1, 'duck'), [1, 2, 3, 4]);
  assert.deepEqual(windowFor('highBird', 1, 'jump'), [2, 3], 'the top of the jump passes over it: cells 3 and 4');
  // The help says: act when the front reaches cell 2 or 3 (1 or 2 cells away).
  for (const [k, w, move] of [['small', 3, 'jump'], ['large', 3, 'jump'], ['lowBird', 1, 'jump'], ['highBird', 1, 'duck']]) {
    const win = windowFor(k, w, move);
    assert.ok(win.includes(1) && win.includes(2), `${k} ${w}: cells 2 and 3 work`);
  }
  assert.equal(windowFor('small', 1, 'jump').at(-1) + 1, 6, 'a single small cactus as far as cell 6');
});

test('a jump near its end is kept for the landing', () => {
  const run = course([{ kind: 'small', x: 30 }]);
  E.jump(run);
  for (let i = 0; i < 2; i++) E.step(run);
  assert.deepEqual([...E.jump(run)], [], 'too early in the jump: ignored');
  E.step(run);
  E.step(run);
  assert.equal(run.dino.air, 4);
  assert.deepEqual([...E.jump(run)], ['buffered']);
  E.step(run);
  const landing = E.step(run);
  assert.ok(landing.includes('land') && landing.includes('jump'));
  assert.equal(E.pose(run), 'low');
});

test('a duck in the air drops the dino at once, then ducks', () => {
  const run = course([{ kind: 'small', x: 30 }]);
  E.jump(run);
  E.step(run);
  assert.equal(E.pose(run), 'high');
  assert.ok(E.duck(run).includes('fall'));
  assert.equal(E.pose(run), 'low');
  E.step(run);
  assert.equal(E.pose(run), 'duck');
});

test('a braille duck lasts its steps; the keyboard duck lasts while held', () => {
  const run = course([{ kind: 'small', x: 60 }], { duckSteps: 4 });
  E.duck(run);
  const poses = [];
  for (let i = 0; i < 6; i++) {
    E.step(run);
    poses.push(E.pose(run));
  }
  assert.deepEqual(poses, ['duck', 'duck', 'duck', 'duck', 'run', 'run']);
  E.duck(run, { held: true });
  for (let i = 0; i < 10; i++) E.step(run);
  assert.equal(E.pose(run), 'duck');
  E.standUp(run);
  assert.equal(E.pose(run), 'run');
});

test('standing up into a high bird is a hit', () => {
  const run = course([{ kind: 'highBird', x: X + 1 }]);
  E.duck(run, { held: true });
  E.step(run);
  assert.equal(run.over, false);
  E.standUp(run);
  assert.equal(run.over, true);
});

test('score counts cells, with a chime every 100', () => {
  const run = E.createRun({ seed: 5, practice: true });
  let milestones = 0;
  for (let i = 0; i < 350; i++) if (E.step(run).includes('milestone')) milestones++;
  assert.equal(run.score, 350);
  assert.equal(milestones, 3);
});

test('practice counts hits and keeps running, without speeding up', () => {
  const run = E.createRun({ seed: 9, practice: true });
  for (let i = 0; i < 400; i++) E.step(run);
  assert.equal(run.over, false);
  assert.ok(run.hits > 0);
  assert.equal(E.stepTime(run, 2), E.SPEEDS[2][0]);
});

test('practice can be limited to some kinds', () => {
  const run = E.createRun({ seed: 2, practice: true, kinds: ['lowBird', 'highBird'] });
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    E.step(run);
    for (const o of run.obstacles) seen.add(o.kind);
  }
  assert.deepEqual([...seen].sort(), ['highBird', 'lowBird']);
});

test('the step time speeds up 5 percent every 100 points, down to a floor', () => {
  const run = E.createRun({ seed: 1 });
  assert.equal(E.stepTime(run, 2), 550);
  run.score = 100;
  assert.equal(E.stepTime(run, 2), 523);
  run.score = 5000;
  assert.equal(E.stepTime(run, 2), 400);
  assert.equal(E.stepTime(run, 2, false), 550);
});

/** The score when the first obstacle matching test reaches the dino. */
function firstArrival(seed, birdsFrom, test) {
  const run = E.createRun({ seed, birdsFrom });
  const seen = new Set();
  while (run.score < 2000) {
    E.step(run);
    run.over = false; // just watching the course
    for (const o of run.obstacles) if (test(o) && o.x <= X + 1 && !seen.has('x')) return run.score + (o.x - X);
  }
  return Infinity;
}

test('birds and large groups reach you at the score the settings name', () => {
  for (const birdsFrom of [450, 100]) {
    const scores = [];
    for (let seed = 1; seed <= 60; seed++) scores.push(firstArrival(seed, birdsFrom, (o) => E.KINDS[o.kind].bird));
    assert.ok(Math.min(...scores) >= birdsFrom, `birds from ${birdsFrom}: first at ${Math.min(...scores)}`);
    scores.sort((a, b) => a - b);
    assert.ok(scores[30] < birdsFrom + 40, `birds from ${birdsFrom}: median first at ${scores[30]}`);
  }
  const groups = [];
  for (let seed = 1; seed <= 60; seed++) groups.push(firstArrival(seed, 450, (o) => o.kind === 'large' && o.w > 1));
  assert.ok(Math.min(...groups) >= 150, `first large group at ${Math.min(...groups)}`);
});

test('runs are repeatable from a seed, and clones are independent', () => {
  const a = E.createRun({ seed: 42, practice: true });
  const b = E.createRun({ seed: 42, practice: true });
  for (let i = 0; i < 300; i++) {
    E.step(a);
    E.step(b);
  }
  assert.equal(E.cells(a), E.cells(b));
  const c = E.clone(a);
  E.step(c);
  E.jump(c);
  assert.notEqual(c.steps, a.steps);
  assert.equal(E.cells(a), E.cells(b));
});

test('hits are explained', () => {
  const ran = course([{ kind: 'small', x: X + 1 }]);
  E.step(ran);
  assert.match(E.explainHit(ran), /Small cactus: no jump/);
  const early = course([{ kind: 'large', x: X + 6 }]);
  E.jump(early);
  for (let i = 0; i < 6 && !early.over; i++) E.step(early);
  assert.match(E.explainHit(early), /too early/);
  const bird = course([{ kind: 'highBird', x: X + 1 }]);
  E.step(bird);
  assert.match(E.explainHit(bird), /duck/);
});

/** Can some sequence of presses (made between steps) survive this many steps? */
function survivable(seed, steps, birdsFrom = 0, moves = [null, 'jump', 'duck']) {
  let frontier = [E.createRun({ seed, birdsFrom })];
  for (let t = 0; t < steps; t++) {
    const next = new Map();
    for (const run of frontier) {
      for (const move of moves) {
        const r = E.clone(run);
        if (move && !E[move](r).length) continue;
        if (r.over) continue;
        E.step(r);
        if (r.over) continue;
        const d = r.dino;
        next.set(`${d.air}:${d.buffered}:${d.duck}:${d.duckOnLanding}`, r);
      }
    }
    if (!next.size) return t;
    frontier = [...next.values()];
  }
  return steps;
}

test('every run can be survived', () => {
  for (let seed = 1; seed <= 60; seed++) assert.equal(survivable(seed, 1500), 1500, `seed ${seed}`);
});

test('every run can be survived with Space alone (for literary braille tables)', () => {
  for (let seed = 1; seed <= 120; seed++) assert.equal(survivable(seed, 2000, 0, [null, 'jump']), 2000, `seed ${seed}`);
});

/** A player who answers each obstacle with its standard move (jump, duck or
 * nothing) at the earliest, latest or a random good step. Returns the fewest
 * good steps any obstacle offered. */
function player(seed, choose, steps, needs = NEEDS) {
  const run = E.createRun({ seed, birdsFrom: 0 });
  const handled = new Set();
  let pressAt = null;
  let move = null;
  let fewest = Infinity;
  for (let t = 0; t < steps && !run.over; t++) {
    if (pressAt === t) {
      E[move](run);
      pressAt = null;
    }
    if (pressAt === null) {
      const o = run.obstacles.filter((o) => o.x > X && !handled.has(o.x + run.steps)).sort((a, b) => a.x - b.x)[0];
      if (o && o.x - X <= 8) {
        handled.add(o.x + run.steps);
        const need = needs[o.kind];
        if (need !== 'none') {
          const id = o.x + run.steps;
          const good = [];
          for (let k = 0; k <= o.x - X; k++) {
            const r = E.clone(run);
            let ok = true;
            for (let i = 0; i < k && ok; i++) {
              E.step(r);
              ok = !r.over;
            }
            if (!ok) break;
            E[need](r);
            while (ok && r.obstacles.some((p) => p.x + r.steps === id)) {
              ok = !r.over;
              E.step(r);
              ok = ok && !r.over;
            }
            if (ok && !r.over) good.push(k);
          }
          fewest = Math.min(fewest, good.length);
          if (!good.length) return { run, fewest: 0 };
          pressAt = t + choose(good, t);
          move = need;
          if (pressAt === t) {
            E[move](run);
            pressAt = null;
          }
        }
      }
    }
    E.step(run);
  }
  return { run, fewest };
}

test('fair: every obstacle leaves at least 2 good steps, however the last was answered', () => {
  const policies = {
    earliest: (good) => good[0],
    latest: (good) => good[good.length - 1],
    random: (good, t) => good[(t * 7919) % good.length],
  };
  for (const [name, choose] of Object.entries(policies)) {
    let fewest = Infinity;
    for (let seed = 1; seed <= 40; seed++) {
      const { run, fewest: f } = player(seed, choose, 1500);
      assert.equal(run.over, false, `${name} player, seed ${seed}: ${E.explainHit(run)} at step ${run.steps}`);
      fewest = Math.min(fewest, f);
    }
    assert.ok(fewest >= 2, `${name} player: fewest good steps ${fewest}`);
  }
});

test('fair with Space alone: high birds jumped at the earliest or latest good step', () => {
  const jumpOnly = { ...NEEDS, highBird: 'jump' };
  for (const [name, choose] of Object.entries({ earliest: (good) => good[0], latest: (good) => good[good.length - 1] })) {
    let fewest = Infinity;
    for (let seed = 1; seed <= 40; seed++) {
      const { run, fewest: f } = player(seed, choose, 1500, jumpOnly);
      assert.equal(run.over, false, `${name} player, seed ${seed}: ${E.explainHit(run)} at step ${run.steps}`);
      fewest = Math.min(fewest, f);
    }
    assert.ok(fewest >= 1, `${name} player: fewest good steps ${fewest}`);
  }
});

test('eight speeds, the fastest starting at 130 milliseconds a step', () => {
  assert.equal(E.SPEEDS.length - 1, 8);
  const run = E.createRun({ seed: 1 });
  assert.deepEqual([1, 5, 6, 7, 8].map((v) => E.stepTime(run, v)), [700, 280, 220, 170, 130]);
  run.score = 5000;
  assert.equal(E.stepTime(run, 8), 100, 'and no faster than 100');
});
