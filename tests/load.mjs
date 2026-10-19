// Test helpers: load the game engine out of index.html into Node, and find
// Playwright (installed here, or in the Pokémon Red A11y project next door).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const pageFile = fileURLToPath(new URL('../index.html', import.meta.url));
export const pageUrl = pathToFileURL(pageFile).href;

/** The engine script (the one with id="engine"), run on its own, without a page. */
export function loadEngine() {
  const html = readFileSync(pageFile, 'utf8');
  const match = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('index.html has no <script id="engine">');
  const context = vm.createContext({});
  vm.runInContext(match[1], context, { filename: 'index.html#engine' });
  return context.DinoEngine;
}

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const sibling = new URL('../Pokemon%20Red%20A11y/web/node_modules/playwright/index.mjs', import.meta.url);
    return await import(sibling.href);
  }
}
