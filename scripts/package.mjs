/**
 * Store packaging.
 *
 * Zips ONLY the runtime files from dist/ (produced by scripts/build.mjs) into
 * dist-packages/sawb-chromium-v<version>.zip and writes a package-content
 * report. design-reference/, sources, tests, tooling and unused fonts are
 * never part of dist/, so they can never leak into the package.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'dist-packages');

const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
const zipName = `sawb-chromium-v${manifest.version}.zip`;
const zipPath = path.join(outDir, zipName);

// Collect every file in dist (the zip's exact contents).
async function walk(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out.sort();
}

const files = await walk(dist);

// Guard: nothing non-runtime may be present.
const forbidden = files.filter((f) =>
  /design-reference|\.map$|\.ts$|\.spec\.|README|node_modules|\.zip$/i.test(f),
);
if (forbidden.length) {
  throw new Error(`Non-runtime files in dist/: ${forbidden.join(', ')}`);
}

await mkdir(outDir, { recursive: true });
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: dist });

// Package-content report.
let report = `# Package contents — ${zipName}\n\nGenerated: ${new Date().toISOString()}\n\n`;
report += `| File | Size (bytes) |\n|---|---|\n`;
let total = 0;
for (const f of files) {
  const { size } = await stat(path.join(dist, f));
  total += size;
  report += `| ${f} | ${size} |\n`;
}
const zipSize = (await stat(zipPath)).size;
report += `\nTotal uncompressed: ${total} bytes · Zip: ${zipSize} bytes · ${files.length} files\n`;
await writeFile(path.join(outDir, 'PACKAGE-CONTENTS.md'), report);

console.log(`Packaged ${files.length} files → dist-packages/${zipName} (${(zipSize / 1024).toFixed(1)} KB)`);
console.log(`Report → dist-packages/PACKAGE-CONTENTS.md`);
