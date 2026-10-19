// Builds index.html, the whole game in one file, from the parts in src/.
// Run with `node build.mjs` after changing anything in src/; the tests check
// that index.html is up to date.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const part = (name) => readFileSync(new URL(`src/${name}`, import.meta.url), 'utf8').trimEnd();

export function build() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Braille Dino</title>
<meta name="description" content="The Chrome dino game for refreshable braille displays: play it entirely in braille.">
<!-- Built from src/ by build.mjs. Edit those files, not this one. -->
<style>
${part('style.css')}
</style>
</head>
<body>
${part('body.html')}
<script id="engine">
${part('engine.js')}
</script>
<script>
${part('sprites.js')}
</script>
<script>
${part('infra.js')}

${part('app.js')}
</script>
</body>
</html>
`;
}

export const output = fileURLToPath(new URL('index.html', import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = build();
  writeFileSync(output, html);
  console.log(`index.html: ${html.length} characters`);
}
