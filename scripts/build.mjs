/**
 * Build orchestrator.
 *
 * Vite passes:
 *  1. content script  → dist/content.js  (IIFE — MV3 content scripts are not modules)
 *  2. service worker  → dist/worker.js   (ES module)
 *  3. (next stage) popup/options HTML pages
 * plus static copies: manifest, icons.
 *
 * Output: dist/ — loadable unpacked in Chrome/Edge/Brave/Arc.
 */

import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const common = {
  configFile: false,
  root,
  logLevel: 'warn',
  build: {
    outDir: dist,
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
    target: 'chrome110',
  },
};

// 1. Content script — single IIFE file.
await build({
  ...common,
  build: {
    ...common.build,
    lib: {
      entry: path.join(root, 'src/content/index.ts'),
      name: 'sawb',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});

// 2. Service worker — ES module.
await build({
  ...common,
  build: {
    ...common.build,
    lib: {
      entry: path.join(root, 'src/background/worker.ts'),
      formats: ['es'],
      fileName: () => 'worker.js',
    },
  },
});

// 3. Popup — HTML page with hashed assets (fonts referenced by CSS only;
// unused font faces are never copied).
await build({
  ...common,
  root: path.join(root, 'src/ui/popup'),
  base: './',
  build: {
    ...common.build,
    rollupOptions: {
      input: path.join(root, 'src/ui/popup/popup.html'),
    },
  },
});

// 4. Static assets.
await cp(path.join(root, 'manifest/manifest.json'), path.join(dist, 'manifest.json'));
// OFL requires the font license to accompany distributed font files.
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(dist, 'THIRD_PARTY_NOTICES.md'));
await mkdir(path.join(dist, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await cp(
    path.join(root, `assets/icons/icon-${size}.png`),
    path.join(dist, `icons/icon-${size}.png`),
  );
}

// Sanity checks: manifest parses, referenced files exist, version matches package.
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`Version mismatch: manifest ${manifest.version} != package ${pkg.version}`);
}
for (const file of ['content.js', 'worker.js', 'icons/icon-128.png', 'popup.html']) {
  await readFile(path.join(dist, file));
}
console.log(`Built SAWB v${manifest.version} → dist/`);
