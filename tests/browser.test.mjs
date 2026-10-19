// Page tests in headless Chrome: run with `node --test tests/`. They send the
// same events VoiceOver sends for braille keys (beforeinput with typed text),
// and use the page's manual clock (?test), so they never wait in real time.
// They never drive VoiceOver itself.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { loadPlaywright, pageUrl } from './load.mjs';

const { chromium } = await loadPlaywright();
let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser?.close();
});

const COUNT_IN = 1800;
const BURST_MS = 25;
const isCell = (c) => c >= '⠀' && c <= '⣿';

/** Opens the game. Tests use the Eight dot braille table (braille cells)
 * unless they ask for the defaults, which on a Mac are print cells. */
async function open(query = '', { defaults = false } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // As on a Mac unless the test asks for Windows (?windows=1), wherever the tests run.
  const windows = query.includes('windows=1');
  await page.goto(`${pageUrl}?test&seed=7${windows ? '' : '&windows=0'}${query}`);
  if (!defaults) await page.evaluate(() => __dino.setOption('dots', '8'));
  const g = {
    page,
    errors,
    screen: () => page.evaluate(() => __dino.screen),
    line: () => page.evaluate(() => __dino.line()),
    cells: async () => [...(await g.line())],
    caretPlaced: () => page.evaluate(() => __dino.caretPlaced()),
    /** Moves the caret to a place in the game's line, as a routing key would. */
    caretTo: (offset) =>
      page.evaluate((offset) => {
        const node = document.getElementById('line').children[1].firstChild;
        const r = document.createRange();
        r.setStart(node, offset);
        r.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      }, offset),
    advance: (ms) => page.evaluate((ms) => __dino.clock.advance(ms), ms),
    /** A braille key: the text VoiceOver types into the focused game line. */
    braille: (data, inputType = 'insertText') =>
      page.evaluate(
        ({ data, inputType }) => {
          const e = new InputEvent('beforeinput', { inputType, data, cancelable: true, bubbles: true });
          document.getElementById('line').dispatchEvent(e);
          return e.defaultPrevented;
        },
        { data, inputType },
      ),
    run: () => page.evaluate(() => JSON.parse(JSON.stringify(__dino.run))),
    pending: () => page.evaluate(() => __dino.pendingHit),
    regions: () => page.evaluate(() => [...document.querySelectorAll('#announcer [aria-live]')].map((r) => r.textContent).join('')),
    stepMs: () => page.evaluate(() => DinoEngine.stepTime(__dino.run, __dino.settings.speed, __dino.settings.speedUp)),
    set: (key, value) => page.evaluate(({ key, value }) => __dino.setOption(key, value), { key, value }),
    async start() {
      await g.braille(' ');
      await g.advance(COUNT_IN);
      assert.equal(await g.screen(), 'playing');
    },
    /** Moves on one step at a time, until the test says stop. */
    async steps(n, until) {
      for (let i = 0; i < n; i++) {
        await g.advance(await g.stepMs());
        if (until && (await until())) return true;
      }
      return false;
    },
    /** Moves through a list with Space until the item, then chooses it with a dot key. */
    async choose(label) {
      for (let i = 0; i < 20; i++) {
        if ((await g.line()).includes(`${label},`)) {
          await g.braille('a');
          // On Windows a typed letter waits a moment in case a word follows.
          if (windows) await g.advance(BURST_MS);
          return;
        }
        await g.braille(' ');
      }
      throw new Error(`no item ${label}`);
    },
  };
  return g;
}

test('the page opens on the game line with the start screen', async () => {
  const g = await open();
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line');
  assert.match(await g.line(), /^Dino\. Space: play/);
  assert.equal(await g.page.evaluate(() => document.getElementById('line').children[0].textContent), 'Dino', 'a fixed first line');
  assert.equal(await g.caretPlaced(), true);
  assert.deepEqual(g.errors, []);
  await g.page.close();
});

test('the space bar starts a countdown in cell 1, then the dino appears there and the run starts', async () => {
  const g = await open();
  assert.equal(await g.braille(' '), true, 'the typed space is cancelled');
  assert.equal(await g.screen(), 'ready');
  let cells = await g.cells();
  assert.equal(cells.length, 20);
  assert.ok(cells.every(isCell));
  assert.equal(cells[0], '⠿', 'three rows left, in place of the dino');
  await g.advance(600);
  assert.equal((await g.cells())[0], '⠶');
  await g.advance(600);
  assert.equal((await g.cells())[0], '⠤');
  await g.advance(600);
  assert.equal(await g.screen(), 'playing');
  assert.equal((await g.cells())[0], '⡢', 'you, running, dots 2 6 7 (an o on the ground), in cell 1');
  await g.steps(20);
  assert.equal(await g.screen(), 'playing');
  cells = await g.cells();
  assert.equal(cells.length, 20);
  assert.ok(cells.every(isCell));
  assert.equal(await g.caretPlaced(), true, 'the caret is at the end of the line');
  assert.deepEqual(g.errors, []);
  await g.page.close();
});

test('space jumps, any other braille key ducks, p pauses and space goes on', async () => {
  const g = await open();
  await g.start();
  await g.braille(' ');
  assert.equal((await g.run()).dino.air, 0, 'the jump starts the moment it arrives');
  assert.equal((await g.cells())[0], '⠕', 'low in the jump: dots 1 3 5, the o one row up');
  await g.steps(8);
  for (const key of ['a', 'ÿ', ',', 'ê', '1']) {
    await g.braille(key);
    assert.ok((await g.run()).dino.duck > 0, `${key} ducks`);
  }
  assert.equal((await g.cells())[0], '⣤', 'ducking: dots 3 6 7 8');
  await g.braille('p');
  assert.equal(await g.screen(), 'paused');
  assert.match(await g.line(), /^Paused\. \d+ points\. Space: go on/);
  await g.braille(' ');
  assert.equal(await g.screen(), 'ready');
  await g.advance(COUNT_IN);
  assert.equal(await g.screen(), 'playing');
  assert.deepEqual(g.errors, []);
  await g.page.close();
});

test('keyboard: Space and Up jump, Down ducks while held, Escape pauses', async () => {
  const g = await open();
  await g.page.keyboard.press('Space');
  await g.advance(COUNT_IN);
  assert.equal(await g.screen(), 'playing');
  await g.page.keyboard.press('ArrowUp');
  assert.equal((await g.run()).dino.air, 0);
  await g.steps(8);
  await g.page.keyboard.down('ArrowDown');
  assert.equal((await g.run()).dino.duckHeld, true);
  await g.steps(3);
  assert.equal((await g.run()).dino.duckHeld, true);
  await g.page.keyboard.up('ArrowDown');
  assert.equal((await g.run()).dino.duckHeld, false);
  assert.ok((await g.cells()).every(isCell), 'nothing typed got into the line');
  await g.page.keyboard.press('Escape');
  assert.equal(await g.screen(), 'paused');
  await g.page.close();
});

test('text that arrives without a cancellable beforeinput is acted on and removed', async () => {
  const g = await open();
  await g.start();
  const before = await g.cells();
  await g.page.evaluate(() => {
    const node = document.getElementById('line').children[1].firstChild;
    node.data = node.data.slice(0, 3) + 'a' + node.data.slice(3);
    document.getElementById('line').dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: null, bubbles: true }));
  });
  assert.ok((await g.run()).dino.duck > 0);
  const now = await g.cells();
  assert.ok(now.every(isCell));
  assert.equal(now.length, before.length);
  await g.page.close();
});

test('nothing is spoken during play, even with VoiceOver announcements on', async () => {
  const g = await open();
  await g.set('speech', 'voiceover');
  await g.start();
  await g.advance(200);
  await g.page.evaluate(() => __dino.speech.clear());
  const stopped = await g.steps(80, async () => (await g.screen()) !== 'playing');
  if (!stopped) assert.equal(await g.regions(), '');
  await g.page.close();
});

test('screens are spoken when speech is on', async () => {
  const g = await open();
  await g.set('speech', 'voiceover');
  await g.braille('a');
  await g.page.waitForTimeout(150);
  assert.match(await g.regions(), /^Menu\./);
  await g.page.close();
});

test('a hit: the crash cell, then the score and why; the crash can be felt again', async () => {
  const g = await open();
  await g.start();
  const hit = await g.steps(200, async () => (await g.screen()) !== 'playing');
  assert.ok(hit, 'running with no presses hits something');
  assert.equal(await g.screen(), 'crash');
  assert.equal((await g.cells())[0], '⣿', 'a hit fills cell 1');
  await g.braille(' ');
  assert.equal(await g.screen(), 'crash', 'space is ignored while the crash shows');
  await g.advance(1300);
  assert.equal(await g.screen(), 'over');
  assert.match(await g.line(), /^Game over, \d+ points\. .+: no jump\./);
  await g.braille('a');
  assert.match(await g.line(), /^Game over\. Space: next.* Play again, 1 of 8/);
  await g.choose('Feel the crash');
  const crash = await g.cells();
  assert.ok(crash.slice(0, 20).every(isCell));
  assert.notEqual(crash[0], '⣿', 'the line as it was, with the dino');
  assert.match(crash.slice(20).join(''), /^ The line at the hit\. .+ Any key goes back\.$/, 'and words after the cells');
  await g.braille('a');
  assert.match(await g.line(), /Feel the crash, 2 of 8/);
  await g.braille('ÿ', 'deleteContentBackward');
  assert.match(await g.line(), /^Game over, \d+ points/, 'Delete goes back to the score');
  await g.braille(' ');
  assert.equal(await g.screen(), 'ready');
  await g.page.close();
});

test('late press help: a jump just after the step that hit still clears it', async () => {
  const g = await open();
  await g.start();
  let rescued = false;
  for (let tries = 0; tries < 300 && !rescued; tries++) {
    await g.advance(await g.stepMs());
    if (await g.pending()) {
      await g.advance(60);
      await g.braille(' ');
      rescued = (await g.screen()) === 'playing' && !(await g.pending());
      break;
    }
  }
  assert.ok(rescued, 'the late jump was accepted');
  await g.page.close();
});

test('losing focus pauses the game', async () => {
  const g = await open();
  await g.start();
  await g.page.evaluate(() => document.getElementById('line').blur());
  assert.equal(await g.screen(), 'paused');
  assert.match(await g.line(), /you left the game line/);
  await g.page.close();
});

test('menu, help, symbols and settings on the game line', async () => {
  const g = await open();
  await g.braille('a');
  assert.match(await g.line(), /^Menu\. Space: next\. Any other key: choose\. Play, 1 of 9/);
  await g.braille(' ');
  assert.match(await g.line(), /^Practice, 2 of 9/);
  await g.choose('How to play');
  assert.match(await g.line(), /^How to play\./);
  await g.braille(' ');
  assert.match(await g.line(), /^You are the dino in cell 1\./);
  await g.braille('a');
  assert.match(await g.line(), /How to play, 3 of 9/, 'back to the menu where you were');

  await g.choose('Symbols');
  await g.braille(' ');
  assert.equal(await g.line(), 'You, running: ⡢ dots 2 6 7.', 'the name, then the symbol');
  await g.braille('a');

  await g.choose('Settings');
  assert.match(await g.line(), /^Settings\. Space: next\. Any other key: change\. Speed: 2, slow, 550 milliseconds a step, 1 of 14/);
  await g.braille('a');
  assert.match(await g.line(), /^Speed: 3, medium/);
  assert.equal(await g.page.evaluate(() => __dino.settings.speed), 3);
  assert.equal(await g.page.evaluate(() => document.getElementById('opt-speed').value), '2');
  await g.braille(' ');
  await g.braille(' ');
  assert.match(await g.line(), /^Braille display width: 20 cells/);
  for (let i = 0; i < 4; i++) await g.braille('a');
  assert.match(await g.line(), /14 cells/);
  await g.choose('Back');
  assert.match(await g.line(), /Settings, \d of 9/);
  await g.choose('Play');
  await g.advance(COUNT_IN);
  assert.equal((await g.cells()).length, 14);
  await g.page.close();
});

test('display check shows a line exactly the display width', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Display check');
  await g.braille(' ');
  const cells = await g.cells();
  assert.equal(cells.length, 20);
  assert.equal(cells[19], '⣿');
  assert.equal(cells[0], '⡢', 'the dino in cell 1');
  assert.equal(cells[1], '⣀', 'a small cactus in cell 2');
  await g.page.close();
});

test('a literary table: words arrive at once; during play the space still jumps', async () => {
  const g = await open();
  await g.braille('have ');
  assert.equal(await g.screen(), 'list', 'a word is "any other key": the menu');
  await g.braille(' ');
  assert.match(await g.line(), /Play, 1 of 9/, 'a space just after a word is its own space');
  await g.advance(200);
  await g.braille(' ');
  assert.match(await g.line(), /Practice, 2 of 9/, 'the space after a word is a second press');
  await g.choose('Play');
  await g.advance(COUNT_IN);
  await g.braille('a ');
  assert.equal((await g.run()).dino.air, 0, 'a word ends with the space bar, which jumps');
  await g.steps(8);
  await g.braille('people ');
  assert.equal(await g.screen(), 'paused', '"people" is p');
  assert.match(await g.line(), /whole words/);
  await g.page.close();
});

test('practice: hits do not end the run', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Practice');
  await g.choose('Cacti only');
  await g.advance(COUNT_IN);
  await g.steps(150);
  assert.equal(await g.screen(), 'playing');
  const run = await g.run();
  assert.equal(run.practice, true);
  assert.ok(run.hits > 0);
  assert.ok(run.obstacles.every((o) => o.kind === 'small' || o.kind === 'large'));
  await g.braille('p');
  assert.match(await g.line(), /cleared, \d+ hits/);
  await g.braille('a');
  await g.choose('End practice');
  assert.match(await g.line(), /^Practice: \d+ cleared/);
  await g.page.close();
});

test('the score can show at the end of the line, in computer braille digits', async () => {
  const g = await open();
  await g.set('scoreCells', true);
  await g.start();
  await g.steps(12);
  const line = await g.line();
  assert.equal([...line].length, 20);
  assert.ok(line.endsWith('⠀⠂⠆⠀⠀⠀'), 'a blank, then 1 and 2 as dots 2 and dots 2 3');
  await g.set('numbers', 'literary');
  await g.steps(1);
  assert.ok((await g.line()).endsWith('⠀⠼⠁⠉⠀⠀'), 'number sign, 1, 3');
  await g.page.close();
});

test('the settings form matches the options; print cells are only the eight characters', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Help and settings on the page');
  assert.equal(await g.page.evaluate(() => document.getElementById('settings').open), true, 'the page opens with its sections open');
  await g.page.selectOption('#opt-dots', { label: 'Contracted, uncontracted or eight dot' });
  assert.equal(await g.page.evaluate(() => __dino.settings.dots), 'ueb');
  await g.page.click('#settings .back-to-game');
  await g.choose('Play');
  await g.advance(COUNT_IN);
  assert.equal(await g.screen(), 'playing');
  for (let i = 0; i < 20; i++) {
    assert.equal(await g.screen(), 'playing');
    assert.match(await g.line(), /^[a'i:o!\-\u00b7\u2800]{20}$/u);
    await g.steps(1);
  }
  await g.page.close();
});

test('only the game line can be reached, and Tab stays on it', async () => {
  const g = await open();
  assert.equal(await g.page.evaluate(() => document.getElementById('page').inert), true, 'the rest of the page is inert');
  await g.page.keyboard.press('Tab');
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line');
  await g.page.keyboard.press('Shift+Tab');
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line');
  await g.page.close();
});

test('focus that drifts off the line comes back to it', async () => {
  const g = await open();
  await g.start();
  await g.page.evaluate(() => document.getElementById('line').blur());
  assert.equal(await g.screen(), 'paused', 'leaving pauses the run');
  await g.page.waitForTimeout(120);
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line', 'and focus is back on the line');
  assert.match(await g.line(), /^Paused, you left the game line/);
  await g.page.close();
});

test('the page opens from the menu, and Back to the game returns to the line', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Help and settings on the page');
  assert.equal(await g.page.evaluate(() => document.getElementById('page').inert), false);
  assert.equal(await g.page.evaluate(() => document.activeElement.className), 'back-to-game');
  await g.page.waitForTimeout(120);
  assert.equal(await g.page.evaluate(() => document.activeElement.className), 'back-to-game', 'focus is not pulled back while the page is open');
  await g.page.keyboard.press('Enter');
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line');
  assert.equal(await g.page.evaluate(() => document.getElementById('page').inert), true);
  assert.match(await g.line(), /Help and settings on the page, 6 of 9/);
  await g.page.close();
});

test('menus start from the top again after Play, Quit or Back', async () => {
  const g = await open();
  await g.start();
  await g.braille('p');
  await g.braille('a');
  await g.choose('Quit this run');
  assert.equal(await g.screen(), 'title');
  await g.start();
  await g.braille('p');
  await g.braille('a');
  assert.match(await g.line(), /Go on, 1 of 6$/);
  await g.choose('Settings');
  await g.choose('Back');
  assert.match(await g.line(), /Settings, 4 of 6$/, 'back on Settings, where you came from');
  await g.choose('Settings');
  assert.match(await g.line(), /Speed: .*, 1 of 14$/, 'Settings opens on its first item again');
  await g.page.close();
});

test('keyboard Down caught by late press help stays held until let go', async () => {
  const g = await open('&seed=3');
  await g.set('birdsFrom', 0);
  await g.start();
  // Run until a middle bird is about to arrive, then press Down just too late.
  let tried = false;
  for (let i = 0; i < 400 && !tried; i++) {
    const run = await g.run();
    const bird = run.obstacles.find((o) => o.kind === 'highBird' && o.x === 1);
    if (bird && run.dino.air < 0) {
      await g.advance(await g.stepMs());
      if (await g.pending()) {
        await g.advance(40);
        await g.page.keyboard.down('ArrowDown');
        tried = true;
        assert.equal(await g.screen(), 'playing', 'rescued');
        const after = await g.run();
        assert.equal(after.dino.duckHeld, true);
        await g.steps(2);
        assert.equal(await g.screen(), 'playing');
        assert.equal((await g.run()).dino.duckHeld, true, 'still ducking while held');
        await g.page.keyboard.up('ArrowDown');
        assert.equal((await g.run()).dino.duckHeld, false);
      } else await g.page.keyboard.press('ArrowUp');
    } else if (run.obstacles.some((o) => o.kind !== 'highBird' && o.x === 2) && run.dino.air < 0) {
      await g.braille(' ');
      await g.advance(await g.stepMs());
    } else await g.advance(await g.stepMs());
    if ((await g.screen()) !== 'playing') break;
  }
  assert.ok(tried, 'met a middle bird');
  await g.page.close();
});

test('letting go of Down while paused does not leave the dino ducking', async () => {
  const g = await open();
  await g.start();
  await g.page.keyboard.down('ArrowDown');
  await g.page.keyboard.press('Escape');
  await g.page.keyboard.up('ArrowDown');
  await g.braille(' ');
  await g.advance(COUNT_IN);
  const run = await g.run();
  assert.equal(run.dino.duckHeld, false);
  assert.equal((await g.cells())[0], '⡢');
  await g.page.close();
});

test('a held Enter does not choose twice', async () => {
  const g = await open();
  await g.braille('a');
  await g.braille(' ');
  assert.match(await g.line(), /Practice, 2 of 9/);
  await g.page.keyboard.down('Enter');
  for (let i = 0; i < 3; i++) await g.page.keyboard.down('Enter');
  await g.page.keyboard.up('Enter');
  assert.match(await g.line(), /^Practice\. Space: next/, 'the Practice list, not a practice run');
  await g.page.close();
});

test('a routing key during play: the next step puts the caret back', async () => {
  const g = await open();
  await g.start();
  await g.caretTo(7);
  await g.page.waitForTimeout(50);
  assert.equal((await g.run()).dino.air, -1, 'routing is off by default');
  await g.steps(1);
  assert.equal(await g.caretPlaced(), true, 'the next step puts the caret back');
  await g.set('routing', 'jump');
  await g.caretTo(5);
  await g.page.waitForTimeout(50);
  assert.equal((await g.run()).dino.air, 0, 'with routing set to jump, it jumps');
  assert.equal(await g.caretPlaced(), true);
  await g.page.close();
});

test('a rescued press keeps the beat', async () => {
  const g = await open();
  await g.start();
  for (let tries = 0; tries < 300; tries++) {
    const t = await g.stepMs();
    await g.advance(t);
    if (await g.pending()) {
      const steps = (await g.run()).steps;
      await g.advance(100);
      await g.braille(' ');
      assert.equal(await g.screen(), 'playing');
      await g.advance(t - 100 - 1);
      assert.equal((await g.run()).steps, steps, 'not yet');
      await g.advance(2);
      assert.equal((await g.run()).steps, steps + 1, 'one step time after the hit step, not after the press');
      await g.page.close();
      return;
    }
  }
  assert.fail('no hit to rescue');
});

test('leaving the line on a screen of cells shows its words until you come back', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Display check');
  await g.braille(' ');
  const cells = await g.line();
  await g.page.evaluate(() => document.getElementById('line').blur());
  assert.equal(await g.line(), 'The test line.');
  await g.page.evaluate(() => document.getElementById('line').focus());
  assert.equal(await g.line(), 'The test line.', 'VoiceOver reads the words as focus lands');
  await g.page.waitForTimeout(1700);
  assert.equal(await g.line(), cells, 'then the cells come back');
  await g.page.close();
});

test('nothing follows the game line in the page (VoiceOver would read past its end)', async () => {
  const g = await open();
  const last = await g.page.evaluate(() => {
    const all = [...document.body.querySelectorAll('*')].filter((el) => el.tagName !== 'SCRIPT');
    return { last: all.at(-1).closest('#line') !== null, inMain: document.getElementById('line').parentElement.tagName };
  });
  assert.equal(last.last, true, 'the last element in the page is inside the game line');
  assert.equal(last.inMain, 'MAIN');
  await g.page.close();
});

test('braille keys count however they arrive: text, an empty insert, composing, an accent key, Option, Return', async () => {
  const g = await open();
  await g.start();
  // An empty road, so the run lasts.
  await g.page.evaluate(() => {
    __dino.run.obstacles = [];
    __dino.run.nextX = 1e9;
  });
  const ducked = async () => (await g.run()).dino.duck > 0;
  const standUp = async () => {
    await g.steps(6);
    assert.equal(await ducked(), false);
  };
  const fire = (kind, init) =>
    g.page.evaluate(({ kind, init }) => {
      const el = document.getElementById('line');
      const Type = kind.startsWith('key') ? KeyboardEvent : kind.startsWith('composition') ? CompositionEvent : InputEvent;
      el.dispatchEvent(new Type(kind, { bubbles: true, cancelable: true, ...init }));
    }, { kind, init });
  await fire('beforeinput', { inputType: 'insertText', data: null });
  assert.ok(await ducked(), 'typed text with no character');
  await standUp();
  await fire('compositionstart', { data: '' });
  assert.ok(await ducked(), 'composing an accented character');
  const duck = (await g.run()).dino.duck;
  await fire('beforeinput', { inputType: 'insertCompositionText', data: 'ê' });
  await fire('compositionend', { data: 'ê' });
  await fire('beforeinput', { inputType: 'insertFromComposition', data: 'ê' });
  assert.equal((await g.run()).dino.duck, duck, 'the rest of the composing is one key');
  await g.page.waitForTimeout(20);
  await standUp();
  await fire('keydown', { key: 'Dead', code: 'KeyU', altKey: true });
  assert.ok(await ducked(), 'an accent key with Option');
  await standUp();
  await fire('keydown', { key: 'ÿ', code: 'KeyA', altKey: true });
  assert.ok(await ducked(), 'a character typed with Option');
  await standUp();
  await g.braille(null, 'insertParagraph');
  assert.ok(await ducked(), 'Return ducks during play');
  assert.equal(await g.screen(), 'playing');
  await g.page.close();
});

test('duck length "until your next key": one key ducks, the next stands you up', async () => {
  const g = await open();
  await g.set('duckSteps', 0);
  await g.start();
  await g.braille('a');
  assert.equal((await g.run()).dino.duckHeld, true);
  await g.steps(10);
  assert.equal((await g.run()).dino.duckHeld, true, 'still ducking');
  assert.equal((await g.cells())[0], '⣤');
  await g.braille('a');
  assert.equal((await g.run()).dino.duckHeld, false);
  assert.equal((await g.cells())[0], '⡢');
  await g.page.close();
});

test('key check describes each key, and Space twice leaves', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Key check');
  assert.match(await g.line(), /^Key check\./);
  await g.braille('ÿ');
  assert.equal(await g.line(), 'The character ÿ, as typed text. In the game it ducks. 1 so far. Space twice leaves.');
  await g.page.keyboard.press('KeyP');
  assert.match(await g.line(), /^The character p, as a key press\. In the game it pauses\. 2 so far/);
  await g.braille(' ');
  assert.match(await g.line(), /^Space, as typed text\. In the game it jumps\. 3 so far/);
  await g.braille(' ');
  assert.match(await g.line(), /Key check, 8 of 9$/, 'back in the menu');
  await g.page.close();
});

test('Windows: every line of cells leaves the last cell for the screen reader cursor', async () => {
  const g = await open('&windows=1');
  assert.equal(await g.page.evaluate(() => __dino.settings.cursorCell), true, 'on by default on Windows');
  await g.braille('a');
  await g.advance(BURST_MS);
  await g.choose('Display check');
  assert.match(await g.line(), /test line 19 cells wide: .*less the last cell/);
  await g.braille(' ');
  let cells = await g.cells();
  assert.equal(cells.length, 19);
  assert.equal(cells[0], '⡢', 'the dino in cell 1');
  assert.equal(cells[18], '⣿', 'the full cell is next to last on the display');
  assert.equal(await g.caretPlaced(), true, 'the caret at the end, where the cursor cell is');
  await g.braille(' ');
  await g.braille(' ');
  assert.match(await g.line(), /next to last on your display/);
  await g.page.close();

  const h = await open('&windows=1');
  await h.start();
  assert.equal((await h.cells()).length, 19);
  await h.set('cursorCell', false);
  await h.steps(1);
  assert.equal((await h.cells()).length, 20, 'the setting gives the cell back');
  await h.page.close();
});

test('Windows: letters that arrive together are one word, as NVDA types a contracted word', async () => {
  const g = await open('&windows=1');
  await g.start();
  await g.braille('a');
  assert.equal((await g.run()).dino.duck, 0, 'a letter waits a moment in case more follow');
  await g.advance(BURST_MS);
  assert.ok((await g.run()).dino.duck > 0, 'then ducks');
  await g.steps(8);
  for (const ch of 'people ') await g.braille(ch);
  assert.equal(await g.screen(), 'paused', '"people" arrives as letters and is p, once');
  assert.match(await g.line(), /whole words.*NVDA/);
  await g.advance(200);
  await g.braille(' ');
  await g.advance(COUNT_IN);
  assert.equal(await g.screen(), 'playing', 'a lone Space acts at once');
  await g.braille(' ');
  assert.equal((await g.run()).dino.air, 0, 'and jumps at once');
  assert.deepEqual(g.errors, []);
  await g.page.close();
});

test('Windows: a caret moved to the first line goes straight back, and is not a routing press', async () => {
  const g = await open('&windows=1');
  await g.set('routing', 'jump');
  await g.start();
  await g.page.evaluate(() => {
    const r = document.createRange();
    r.setStart(document.getElementById('line').firstChild.firstChild, 2);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await g.page.waitForFunction(() => __dino.caretPlaced());
  assert.equal((await g.run()).dino.air, -1, 'no jump');
  await g.page.close();
});

test('a Down arrow let go at once, as NVDA sends it, is a timed duck', async () => {
  const g = await open();
  await g.start();
  await g.page.keyboard.down('ArrowDown');
  await g.page.keyboard.up('ArrowDown');
  const run = await g.run();
  assert.equal(run.dino.duckHeld, false);
  assert.ok(run.dino.duck > 0, 'ducking for Duck length steps');
  assert.equal((await g.cells())[0], '⣤');
  await g.steps(2);
  assert.equal((await g.cells())[0], '⣤', 'still ducking');
  await g.page.close();
});

test('a composition that never ends does not block keys that arrive as typed text', async () => {
  const fire = (g, kind, init) =>
    g.page.evaluate(({ kind, init }) => {
      const Type = kind.startsWith('key') ? KeyboardEvent : kind.startsWith('composition') ? CompositionEvent : InputEvent;
      document.getElementById('line').dispatchEvent(new Type(kind, { bubbles: true, cancelable: true, ...init }));
    }, { kind, init });
  const g = await open();
  await fire(g, 'compositionstart', { data: '' });
  assert.equal(await g.screen(), 'list', 'the composed key opened the menu');
  await fire(g, 'beforeinput', { inputType: 'insertCompositionText', data: 'é', isComposing: true });
  // The browser drops the composition: no compositionend ever comes.
  await g.advance(200);
  await g.braille(' ');
  assert.match(await g.line(), /Practice, 2 of 9/, 'a typed Space works again after a moment');

  const h = await open();
  await fire(h, 'compositionstart', { data: '' });
  await h.page.keyboard.press('ArrowDown');
  await h.braille(' ');
  assert.match(await h.line(), /How to play, 3 of 9/, 'a key press outside a composition ends it at once');
  await g.page.close();
  await h.page.close();
});

test('a key pressed while focus is off the line still reaches the game', async () => {
  const g = await open();
  await g.page.evaluate(() => document.getElementById('line').blur());
  assert.notEqual(await g.page.evaluate(() => document.activeElement.id), 'line');
  await g.page.keyboard.press('KeyM');
  assert.equal(await g.screen(), 'list');
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line', 'focus is back on the line');
  await g.page.close();
});

test('Escape on the page goes back to the game and does nothing else there', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Help and settings on the page');
  await g.page.keyboard.press('Escape');
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line');
  assert.equal(await g.screen(), 'list', 'still in the menu');
  await g.page.close();
});

test('blanks and an unnamed space key count as Space', async () => {
  const g = await open();
  await g.braille('⠀');
  assert.equal(await g.screen(), 'ready', 'a blank braille cell plays');
  await g.advance(COUNT_IN);
  await g.braille(' ');
  assert.equal((await g.run()).dino.air, 0, 'a no-break space jumps');
  await g.steps(8);
  await g.page.evaluate(() =>
    document.getElementById('line').dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', code: 'Space', bubbles: true, cancelable: true })),
  );
  assert.equal((await g.run()).dino.air, 0, 'a key press named Unidentified with the Space code jumps');
  await g.page.close();
});

test('key check names a key the game ignores, but not modifier keys alone', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Key check');
  const before = await g.line();
  await g.page.keyboard.press('Shift');
  await g.page.keyboard.press('Control');
  await g.advance(100);
  assert.equal(await g.line(), before, 'Shift and Control alone are left out');
  await g.page.keyboard.press('End');
  await g.advance(100);
  assert.match(await g.line(), /^The key End, as a key press the game ignores: the game does not use it\. 1 so far/);
  await g.page.evaluate(() =>
    document.getElementById('line').dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, cancelable: true })),
  );
  await g.braille('ÿ');
  await g.advance(100);
  assert.match(await g.line(), /^The character ÿ, as typed text\. In the game it ducks\. 2 so far/, 'a key with no character followed by its text is one key');
  await g.page.evaluate(() =>
    document.getElementById('line').dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, cancelable: true })),
  );
  await g.advance(100);
  assert.match(await g.line(), /^The key Unidentified, as a key press the game ignores: it brought no character\. 3 so far/);
  await g.page.close();
});

test('on the page, Tab moves through its buttons, headings and settings, never to the game line', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Help and settings on the page');
  const focused = () => g.page.evaluate(() => {
    const el = document.activeElement;
    return el.id || (el.tagName === 'SUMMARY' ? `summary:${el.textContent.trim()}` : el.className || el.tagName);
  });
  assert.equal(await focused(), 'back-to-game');
  const seen = [];
  for (let i = 0; i < 20; i++) {
    await g.page.keyboard.press('Tab');
    seen.push(await focused());
  }
  assert.ok(!seen.includes('line'), 'Tab stays on the page');
  assert.ok(seen.includes('summary:How to play') && seen.includes('summary:Settings') && seen.includes('opt-speed'), seen.join(', '));
  await g.page.keyboard.press('Shift+Tab');
  assert.notEqual(await focused(), 'line');
  assert.equal(await g.page.evaluate(() => __dino.trapped), false);
  await g.page.keyboard.press('Escape');
  assert.equal(await focused(), 'line', 'Escape goes back to the game');
  assert.equal(await g.page.evaluate(() => __dino.trapped), true);
  assert.equal(await g.screen(), 'list', 'and does nothing else there');
  await g.page.close();
});

test('the page closes again when the game line gets focus, and Escape works from the page itself', async () => {
  const g = await open();
  await g.braille('a');
  await g.choose('Help and settings on the page');
  await g.page.evaluate(() => document.getElementById('line').focus());
  assert.equal(await g.page.evaluate(() => __dino.trapped), true);
  assert.equal(await g.page.evaluate(() => document.getElementById('page').inert), true);
  await g.braille(' ');
  await g.choose('Help and settings on the page');
  await g.page.evaluate(() => document.activeElement.blur());
  await g.page.keyboard.press('Escape');
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line');
  assert.equal(await g.page.evaluate(() => __dino.trapped), true);
  await g.page.close();
});

test('Left and Right arrows count as any other key: they duck during play and open the menu', async () => {
  const g = await open();
  await g.page.keyboard.press('ArrowRight');
  assert.equal(await g.screen(), 'list');
  const h = await open();
  await h.start();
  await h.page.keyboard.press('ArrowLeft');
  assert.ok((await h.run()).dino.duck > 0, 'ducks');
  await g.page.close();
  await h.page.close();
});

test('the mouse can use the page at any time, and a click on the game locks it again', async () => {
  const g = await open();
  const centre = (selector) => g.page.evaluate((selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 };
  }, selector);
  const clickAt = async (selector) => {
    await g.page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: 'center' }), selector);
    const { x, y } = await centre(selector);
    await g.page.mouse.click(x, y);
    await g.page.waitForTimeout(30); // a click passed on comes just after the press
  };
  assert.equal(await g.page.evaluate(() => __dino.trapped), true);
  await clickAt('#how summary');
  assert.equal(await g.page.evaluate(() => document.getElementById('how').open), true, 'one click opens How to play');
  assert.equal(await g.page.evaluate(() => __dino.trapped), false);
  await clickAt('#how summary');
  assert.equal(await g.page.evaluate(() => document.getElementById('how').open), false, 'and the next closes it');
  await clickAt('#settings summary');
  assert.equal(await g.page.evaluate(() => document.getElementById('settings').open), true);
  await clickAt('#opt-speed');
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'opt-speed', 'a setting can be chosen');
  await clickAt('#scene');
  assert.equal(await g.page.evaluate(() => __dino.trapped), true, 'a click on the game locks the page again');
  await g.page.waitForTimeout(100);
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line');

  // A click on the page during play pauses the run; Back to the game returns.
  await g.braille(' ');
  await g.advance(COUNT_IN);
  assert.equal(await g.screen(), 'playing');
  await clickAt('#how summary');
  assert.equal(await g.screen(), 'paused');
  await clickAt('#page .back-to-game');
  assert.equal(await g.page.evaluate(() => __dino.trapped), true);
  assert.equal(await g.page.evaluate(() => document.activeElement.id), 'line');
  assert.deepEqual(g.errors, []);
  await g.page.close();
});

test('the mouse on the locked page: text, right-clicks and presses dragged away change nothing', async () => {
  const g = await open();
  const point = (selector) => g.page.evaluate((selector) => {
    const el = document.querySelector(selector);
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 };
  }, selector);
  const state = () => g.page.evaluate(() => ({ trapped: __dino.trapped, how: document.getElementById('how').open, focus: document.activeElement.id || document.activeElement.tagName }));
  await g.braille(' ');
  await g.advance(COUNT_IN);
  const h1 = await point('#page h1');
  await g.page.mouse.click(h1.x, h1.y);
  await g.page.waitForTimeout(100);
  assert.deepEqual(await state(), { trapped: true, how: false, focus: 'line' }, 'a click on text leaves the page locked and focus on the line');
  assert.equal(await g.screen(), 'paused', 'the run pauses, as when focus leaves the line');
  await g.braille(' ');
  await g.advance(COUNT_IN);
  assert.equal(await g.screen(), 'playing', 'and Space goes on');

  const how = await point('#how summary');
  await g.page.mouse.click(how.x, how.y, { button: 'right' });
  await g.page.waitForTimeout(50);
  assert.equal((await state()).how, false, 'a right-click does not toggle');
  const scene = await point('#scene');
  const how2 = await point('#how summary');
  await g.page.mouse.move(how2.x, how2.y);
  await g.page.mouse.down();
  await g.page.mouse.move(scene.x, scene.y);
  await g.page.mouse.up();
  await g.page.waitForTimeout(100);
  assert.deepEqual(await state(), { trapped: true, how: false, focus: 'line' }, 'a press dragged off the heading clicks nothing, and the game keeps focus');

  const how3 = await point('#how summary');
  await g.page.mouse.click(how3.x, how3.y);
  await g.page.waitForTimeout(50);
  const s = await state();
  assert.equal(s.how, true);
  assert.equal(s.focus, 'SUMMARY', 'the clicked heading has focus');
  await g.page.keyboard.press('Enter');
  assert.equal((await state()).how, false, 'and Enter on it closes the section again');
  assert.deepEqual(g.errors, []);
  await g.page.close();
});

test('contracted-braille mode: the game line is print characters, with the caret at its end', async () => {
  const g = await open();
  await g.set('dots', 'ueb');
  await g.start();
  const caretAtEnd = () => g.page.evaluate(() => {
    const node = document.getElementById('line').children[1].firstChild;
    const sel = getSelection();
    return sel.anchorNode === node && sel.anchorOffset === node.length;
  });
  for (let i = 0; i < 40 && (await g.screen()) === 'playing'; i++) {
    const line = await g.line();
    assert.match(line, /^[a'i:o!\-\u00b7\u2800]{20}$/u, line);
    assert.ok('o\u00b7ia'.includes(line[0]), `cell 1 is the dino: ${line[0]}`);
    assert.equal(await caretAtEnd(), true, 'the caret is after the last cell');
    if (i % 9 === 3) await g.braille(' ');
    await g.steps(1);
  }
  await g.page.close();

  const h = await open();
  await h.set('dots', 'ueb');
  await h.braille('a');
  await h.choose('Display check');
  await h.braille(' ');
  assert.equal(await h.line(), 'o-\u00b7\u2800i\u2800\u2800\u2800\u2800i\u2800\u2800\u2800\u2800i\u2800\u2800\u2800\u2800i', 'dino, small cactus, your ducking shape, then the marks');
  assert.deepEqual(h.errors, []);
  await h.page.close();
});

test('How to play opens in 6-dot and contracted-braille modes', async () => {
  for (const dots of ['6', 'ueb']) {
    const g = await open();
    await g.set('dots', dots);
    await g.braille('a');
    await g.choose('How to play');
    assert.match(await g.line(), /^How to play\./);
    for (let i = 0; i < 3; i++) await g.braille(' ');
    assert.match(await g.line(), /rises out of the cell/);
    assert.deepEqual(g.errors, [], `${dots}: no errors`);
    await g.page.close();
  }
});

test('print cells: symbol pages show their words while away, and the check tells Eight dot players about blank lines', async () => {
  const g = await open();
  await g.set('dots', 'ueb');
  await g.braille('a');
  await g.choose('Symbols');
  await g.braille(' ');
  assert.equal(await g.line(), 'You, running: o dots 1 3 5.');
  await g.page.evaluate(() => document.getElementById('line').blur());
  assert.equal(await g.line(), 'You, running, dots 1 3 5.', 'the words, not the symbol, while focus is away');
  await g.page.waitForTimeout(100);
  await g.page.close();

  const h = await open();
  await h.set('dots', 'ueb');
  await h.braille('a');
  await h.choose('Display check');
  await h.braille(' ');
  await h.braille(' ');
  assert.doesNotMatch(await h.line(), /blank/, 'print cells show in every table: no blank-line advice');
  await h.page.close();

  const e = await open();
  await e.braille('a');
  await e.choose('Display check');
  await e.braille(' ');
  await e.braille(' ');
  assert.match(await e.line(), /If the test line is blank, VoiceOver is using its Contracted or Uncontracted table: choose Braille table, Contracted, uncontracted or eight dot/);
  await e.page.close();

  const w = await open('&windows=1');
  await w.braille('a');
  await w.advance(BURST_MS);
  await w.choose('Display check');
  await w.braille(' ');
  await w.braille(' ');
  assert.doesNotMatch(await w.line(), /VoiceOver/, 'no VoiceOver advice on Windows');
  await w.page.close();
});

test('the end-of-line score fits a 14-cell display with the cursor cell kept', async () => {
  const g = await open('&windows=1');
  await g.set('width', 14);
  await g.set('scoreCells', true);
  await g.start();
  assert.equal([...(await g.line())].length, 13);
  await g.page.close();
});

test('defaults: print cells on a Mac; braille cells on Windows, with 8-dot or 6-dot', async () => {
  const mac = await open('', { defaults: true });
  assert.equal(await mac.page.evaluate(() => __dino.settings.dots), 'ueb');
  await mac.start();
  assert.match(await mac.line(), /^[a'i:o!\-\u00b7\u2800]{20}$/u);
  assert.equal(await mac.page.evaluate(() => !!document.getElementById('opt-dots')), true);
  await mac.page.close();
  const win = await open('&windows=1', { defaults: true });
  assert.equal(await win.page.evaluate(() => __dino.settings.dots), '8');
  assert.deepEqual(await win.page.evaluate(() => [...document.getElementById('opt-dots').options].map((o) => o.textContent)), ['8-dot', '6-dot, for a display without dots 7 and 8']);
  await win.page.close();
});

test('a save from before print cells became the default gets the new default once; a choice made now is kept', async () => {
  const page = await browser.newPage();
  const url = `${pageUrl}?windows=0`;
  await page.goto(url);
  // As every earlier version saved it: all settings, with the old default.
  await page.evaluate(() => localStorage.setItem('braille-dino:settings', JSON.stringify({ dots: '8', width: 40, speed: 3 })));
  await page.reload();
  const form = () => page.evaluate(() => ({ dots: document.getElementById('opt-dots').value, width: document.getElementById('opt-width').selectedOptions[0].textContent }));
  assert.deepEqual(await form(), { dots: '0', width: '40 cells' }, 'print cells, and the rest of the save is kept');
  await page.evaluate(() => {
    const select = document.getElementById('opt-dots');
    select.value = '1'; // Eight dot, with dots 7 and 8
    select.dispatchEvent(new Event('change'));
  });
  await page.reload();
  assert.equal((await form()).dots, '1', 'Eight dot chosen in this version stays');
  await page.close();
});

test('print cells (the default): score at the end, the crash words while away, and the caret at the end of every line of cells', async () => {
  const g = await open('', { defaults: true });
  const caretAtEnd = (page) => page.evaluate(() => {
    const node = document.getElementById('line').children[1].firstChild;
    const sel = getSelection();
    return sel.anchorNode === node && sel.anchorOffset === node.length;
  });
  await g.set('scoreCells', true);
  await g.start();
  await g.page.evaluate(() => {
    __dino.run.obstacles = [];
    __dino.run.nextX = 1e9;
  });
  await g.steps(12);
  const score = String((await g.run()).score);
  const line = await g.line();
  assert.equal(line.length, 19, '14 road cells, then a blank and the score in print digits (the table adds the number sign)');
  assert.equal(line.slice(14), ('\u2800' + score).padEnd(5, '\u2800'));
  await g.set('scoreCells', false);
  await g.page.close();

  const h = await open('', { defaults: true });
  await h.start();
  assert.ok(await h.steps(200, async () => (await h.screen()) !== 'playing'), 'running with no presses hits something');
  assert.equal((await h.line())[0], ':', 'a hit in print cells');
  await h.advance(1300);
  await h.braille('a');
  await h.choose('Feel the crash');
  const crash = await h.line();
  assert.match(crash, /^[a'i:o!\-\u00b7\u2800]{20} The line at the hit\./u);
  await h.page.evaluate(() => document.getElementById('line').blur());
  assert.match(await h.line(), /^The line at the hit\./, 'words, not print cells, while focus is away');
  await h.page.waitForTimeout(100);
  await h.page.close();

  const k = await open('', { defaults: true });
  await k.braille('a');
  await k.choose('Display check');
  await k.braille(' ');
  assert.equal(await caretAtEnd(k.page), true, 'the test line has the caret at its end');
  await k.page.evaluate(() => document.getElementById('line').blur());
  await k.page.waitForTimeout(100); // focus comes back
  await k.page.waitForTimeout(1600); // and the cells come back after the words
  assert.match(await k.line(), /^o-\u00b7/);
  assert.equal(await caretAtEnd(k.page), true, 'still at the end after focus comes back');
  await k.page.close();
});

test('print cells (the default) bring no low birds, in play or in practice; speeds go up to 8', async () => {
  const g = await open('', { defaults: true });
  await g.set('birdsFrom', 0);
  await g.start();
  assert.deepEqual(await g.page.evaluate(() => __dino.run.kinds), ['small', 'large', 'highBird']);
  await g.page.close();
  const h = await open('', { defaults: true });
  await h.braille('a');
  await h.choose('Practice');
  await h.choose('Birds only');
  assert.deepEqual(await h.page.evaluate(() => __dino.run.kinds), ['highBird']);
  await h.page.close();
  const k = await open();
  await k.braille('a');
  await k.choose('Practice');
  await k.choose('Birds only');
  assert.ok((await k.page.evaluate(() => __dino.run.kinds)).includes('lowBird'), 'Eight dot keeps low birds');
  assert.deepEqual(await k.page.evaluate(() => [...document.getElementById('opt-speed').options].map((o) => o.textContent.split(',')[0])), ['1', '2', '3', '4', '5', '6', '7', '8']);
  await k.page.close();
});

test('switching to print cells mid-run sends the low birds away; help gives the real late press window', async () => {
  const g = await open();
  await g.set('birdsFrom', 0);
  await g.start();
  await g.steps(40);
  await g.braille('p');
  await g.set('dots', 'ueb');
  assert.ok(!(await g.run()).obstacles.some((o) => o.kind === 'lowBird' && !o.passed), 'none left ahead');
  await g.braille(' ');
  await g.advance(COUNT_IN);
  for (let i = 0; i < 300 && (await g.screen()) === 'playing'; i++) {
    if (i % 3 === 0) await g.braille(' ');
    await g.steps(1);
  }
  const run = await g.run();
  assert.ok(!run.obstacles.some((o) => o.kind === 'lowBird' && !o.passed), 'and none made after');
  await g.page.close();

  const h = await open();
  await h.set('speed', 8);
  await h.braille('a');
  await h.choose('How to play');
  let text = '';
  for (let i = 0; i < 20 && !/^Late press help/.test(text); i++) {
    await h.braille(' ');
    text = await h.line();
  }
  assert.match(text, /^Late press help: at speed 8, a press up to 70 milliseconds .*all this speed allows of your 150, down to 40 as the game speeds up\./);
  await h.page.close();
});
