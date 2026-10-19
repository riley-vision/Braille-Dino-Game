// index.html is what GitHub Pages serves: it must match a fresh build of src/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { build, output } from '../build.mjs';

test('index.html is built from the current src/ (run node build.mjs)', () => {
  assert.ok(readFileSync(output, 'utf8') === build(), 'index.html is out of date: run node build.mjs');
});
