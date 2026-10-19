// Plays the real game in Safari under VoiceOver and records what the Braille
// panel shows and what VoiceOver speaks, step by step. Development only: run
// it only with the player's permission, with VoiceOver on, the Braille panel
// open, and "Allow VoiceOver to be controlled with AppleScript" on.
//
//   node dev/vo-game-driver.mjs [seconds]
//
// Braille keys are typed through the accessibility system (AX_TYPE: a build
// of dev/ax-type.swift), as VoiceOver types them; Tab is a real key press.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const here = fileURLToPath(new URL('.', import.meta.url));
const seconds = Number(process.argv[2] || 15);
const out = join(process.env.PROBE_OUT || tmpdir(), `vo-game-${process.pid}`);
mkdirSync(out, { recursive: true });

const sh = (cmd, args) => run(cmd, args, { timeout: 8000 }).then((r) => r.stdout.trim(), (e) => `ERR ${e.message.split('\n')[0]}`);
const osa = (script) => sh('osascript', ['-e', script]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const windowsFile = join(out, 'windows.js');
writeFileSync(windowsFile, `ObjC.import('CoreGraphics');
function run() {
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)));
  const w = list.find((w) => w.kCGWindowOwnerName === 'AccessibilityVisualsAgent' && w.kCGWindowLayer === 3000 && w.kCGWindowBounds.Width > 400 && w.kCGWindowBounds.Height < 200);
  return w ? String(w.kCGWindowNumber) : '';
}`);
async function braille(name) {
  const id = await sh('osascript', ['-l', 'JavaScript', windowsFile]);
  if (!id || id.startsWith('ERR')) return '(no Braille panel)';
  const file = join(out, `${name}.png`);
  await sh('screencapture', ['-x', '-o', '-l', id, file]);
  return sh('python3', [join(here, 'read_braille_panel.py'), file]);
}

const phrases = [];
let polling = true;
let t0 = Date.now();
async function poll() {
  let last = null;
  while (polling) {
    const p = await osa('tell application "VoiceOver" to get content of last phrase');
    if (p !== last) {
      phrases.push({ t: Date.now() - t0, phrase: p });
      last = p;
    }
    await sleep(80);
  }
}

const page = pathToFileURL(join(here, '..', 'index.html')).href + '?seed=7' + (process.env.PAGE_QUERY || '');
const axType = process.env.AX_TYPE || join(here, 'ax-type');
const braille_ = (text) => sh(axType, [text]);
const tab = () => osa('tell application "System Events" to key code 48');
t0 = Date.now();
const poller = poll();
await osa(`tell application "Safari" to open location "${page}"`);
await osa('tell application "Safari" to activate');
const shots = [];
const events = [];
// From the moment the page opens: what VoiceOver reads on arrival, then a
// run started, jumped and ducked with braille keys, then a Tab.
const start = Number(process.env.START_AT || 5000);
const plan = [
  [start, () => braille_(' '), 'braille Space: start'],
  [start + 6000, () => braille_(' '), 'braille Space: jump'],
  [start + 10000, () => braille_(' '), 'braille Space: jump'],
  [start + 13500, () => braille_('a'), 'braille a: duck'],
  [start + 16000, () => tab(), 'Tab key'],
];
for (let at = 300, i = 0; at < seconds * 1000; at += 450) {
  while (i < plan.length && plan[i][0] <= at) {
    const [, act, name] = plan[i++];
    const result = await act();
    events.push({ t: Date.now() - t0, name: `${name}${result ? ` (${result})` : ''}` });
  }
  const wait = at - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  shots.push({ t: Date.now() - t0, cells: await braille(`s${String(shots.length).padStart(3, '0')}`) });
}
polling = false;
await poller;
await osa('tell application "System Events" to keystroke "w" using command down');

writeFileSync(join(out, 'report.json'), JSON.stringify({ page, shots, phrases, events }, null, 1));
const timeline = [
  ...shots.map((s) => ({ t: s.t, text: `braille ${s.cells}` })),
  ...phrases.map((p) => ({ t: p.t, text: `SPOKE   ${JSON.stringify(p.phrase)}` })),
  ...events.map((e) => ({ t: e.t, text: `PRESS   ${e.name}` })),
].sort((a, b) => a.t - b.t);
for (const e of timeline) console.log(`${String(e.t).padStart(6)}  ${e.text}`);
console.log(`files: ${out}`);
