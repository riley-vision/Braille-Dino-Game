// Checks print cells (the 'ueb' dot mode, the Mac default) against
// VoiceOver's own translators: plays many runs with the engine, collects
// every game line it would show (with crashes, count-ins on resume and the
// score at the end), and runs them through VoiceOver's three quick-choice
// braille tables: Contracted, Uncontracted and Eight dot. Each line must come
// out as exactly the cells the game means: for Eight dot, with the three
// differences listed in E.UEB_EIGHT_DOT. macOS only.
//
//   clang -fobjc-arc -framework Foundation dev/braille-translate.m -o dev/braille-translate
//   node dev/check-ueb.mjs [runs]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEngine } from '../tests/load.mjs';

const E = loadEngine();
const tool = fileURLToPath(new URL('braille-translate', import.meta.url));
const runs = Number(process.argv[2] || 300);
const BLANK = '⠀';
const UEB_DIGITS = '⠚⠁⠃⠉⠙⠑⠋⠛⠓⠊'; // after the number sign
const EIGHT_DOT_DIGITS = '⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔'; // computer braille

// What each print character should become.
const want = new Map(Object.entries(E.UEB_TEXT).map(([mask, ch]) => [ch, E.cell(Number(mask))]));
function expected(line, eightDot) {
  const m = line.match(/^(.*?)(⠀(\d+)⠀*)?$/u);
  const road = m[1];
  const score = m[3]
    ? line.slice(road.length).replace(/\d+/, (d) => (eightDot
      ? [...d].map((c) => EIGHT_DOT_DIGITS[c]).join('')
      : '⠼' + [...d].map((c) => UEB_DIGITS[c]).join('')))
    : '';
  const cell = (c) => (eightDot && E.UEB_EIGHT_DOT[c] ? E.cell(E.UEB_EIGHT_DOT[c]) : want.get(c) ?? '?');
  return [...road].map(cell).join('') + score;
}

let seed = 1;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const lines = new Set();
for (let r = 0; r < runs; r++) {
  const width = [14, 20, 32, 40][r % 4];
  const run = E.createRun({ seed: r + 1, birdsFrom: r % 3 ? 0 : 450, kinds: E.UEB_KINDS }); // as the page plays print cells
  const add = (opts) => {
    let text = E.cells(run, { dotMode: 'ueb', width, ...opts });
    // The score at the end of the line, as the page writes it in print cells.
    if (r % 5 === 0) text = text.slice(0, -6) + (BLANK + String(run.score).slice(-4)).padEnd(5, BLANK);
    lines.add(text);
  };
  for (let step = 0; step < 600 && !run.over; step++) {
    const p = random();
    if (p < 0.08) E.jump(run);
    else if (p < 0.12) E.duck(run);
    E.step(run);
    if (run.over) add({ crash: true });
    else {
      add({});
      if (p > 0.97) for (const countdown of [1, 2, 3]) add({ countdown }); // a pause and resume here
    }
  }
}

const list = [...lines];
let bad = 0;
for (const table of ['eng-xueb_g2', 'eng-xueb_g1', 'eng-8dot']) {
  const eightDot = table === 'eng-8dot';
  let wrong = 0;
  for (let i = 0; i < list.length; i += 300) {
    const batch = list.slice(i, i + 300);
    const out = execFileSync(tool, ['system', table, ...batch], { encoding: 'utf8' }).split('\n');
    batch.forEach((line, j) => {
      const want = expected(line, eightDot);
      if (out[j] !== want && wrong++ < 5) console.log(`  ${table}: ${JSON.stringify(line)} -> ${out[j]} (wanted ${want})`);
    });
  }
  console.log(`${table}: ${list.length} lines, ${wrong} wrong`);
  bad += wrong;
}
process.exit(bad ? 1 : 0);
