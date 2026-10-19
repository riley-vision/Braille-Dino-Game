// Drives a VoiceOver probe page in Safari and records, for each variant,
// what VoiceOver's Braille panel shows and what it speaks. Development only:
// run it only with the player's permission, with VoiceOver on, the Braille
// panel and Caption panel open, and "Allow VoiceOver to be controlled with
// AppleScript" on.
//
//   node dev/vo-probe-driver.mjs [page.html] [variants] [variant-ms]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const here = fileURLToPath(new URL('.', import.meta.url));
const page = process.argv[2] || join(here, 'vo-probe.html');
const variants = Number(process.argv[3] || 7);
const variantMs = Number(process.argv[4] || 6000);
const captureAt = (process.env.PROBE_CAPTURES || '1500,2400,4000,5600').split(',').map(Number);
const out = join(process.env.PROBE_OUT || tmpdir(), `vo-probe-${process.pid}`);
mkdirSync(out, { recursive: true });

const sh = (cmd, args) => run(cmd, args, { timeout: 8000 }).then((r) => r.stdout.trim(), (e) => `ERR ${e.message.split('\n')[0]}`);
const osa = (script) => sh('osascript', ['-e', script]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WINDOWS_JS = `ObjC.import('CoreGraphics');
function run() {
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)));
  const w = list.find((w) => w.kCGWindowOwnerName === 'AccessibilityVisualsAgent' && w.kCGWindowLayer === 3000 && w.kCGWindowBounds.Width > 400 && w.kCGWindowBounds.Height < 200);
  return w ? String(w.kCGWindowNumber) : '';
}`;
const windowsFile = join(out, 'windows.js');
writeFileSync(windowsFile, WINDOWS_JS);

async function braille(name) {
  const id = await sh('osascript', ['-l', 'JavaScript', windowsFile]);
  if (!id || id.startsWith('ERR')) return '(no Braille panel)';
  const file = join(out, `${name}.png`);
  await sh('screencapture', ['-x', '-o', '-l', id, file]);
  return sh('python3', [join(here, 'read_braille_panel.py'), file]);
}

const phrases = [];
let polling = true;
let t0 = 0;
async function poll() {
  let last = null;
  while (polling) {
    const p = await osa('tell application "VoiceOver" to get content of last phrase');
    if (p !== last) {
      phrases.push({ t: t0 ? Date.now() - t0 : null, phrase: p });
      last = p;
    }
    await sleep(80);
  }
}

// Through Safari's own scripting: \`open\` drops the query of a file URL.
const url = page.startsWith('file:') ? page : pathToFileURL(page).href;
await osa(`tell application "Safari" to open location "${url}"`);
await osa('tell application "Safari" to activate');
await sleep(4500);
const poller = poll();
t0 = Date.now();
const shots = [];
for (let i = 0; i < variants; i++) {
  // Tab to the next field, as a player would; VoiceOver follows keyboard focus.
  const wait = i * variantMs - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  await osa('tell application "System Events" to key code 48');
  if (process.env.PROBE_TYPE && process.env.AX_TYPE) {
    // A braille-style key press in the field before its changes start.
    await sleep(1500);
    await sh(process.env.AX_TYPE, [process.env.PROBE_TYPE]);
  }
  for (const at of captureAt) {
    const w = i * variantMs + at - (Date.now() - t0);
    if (w > 0) await sleep(w);
    shots.push({ variant: i, at, t: Date.now() - t0, cells: await braille(`v${i}-${at}`) });
  }
}
await sleep(1500);
polling = false;
await poller;
await osa('tell application "System Events" to keystroke "w" using command down');

const report = { page, variantMs, shots, phrases };
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
for (let i = 0; i < variants; i++) {
  console.log(`== variant ${i}`);
  for (const s of shots.filter((s) => s.variant === i)) console.log(`  braille @${s.at}: ${s.cells}`);
  for (const p of phrases.filter((p) => p.t !== null && p.t >= i * variantMs && p.t < (i + 1) * variantMs)) console.log(`  spoke @${p.t - i * variantMs}: ${p.phrase}`);
}
console.log(`files: ${out}`);
