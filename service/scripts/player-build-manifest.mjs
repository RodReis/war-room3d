import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [buildDirectory, outputPath] = process.argv.slice(2);
if (!buildDirectory || !outputPath) throw new Error('Uso: node player-build-manifest.mjs <build> <manifest.json>');
const root = path.resolve(buildDirectory);
const files = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.includes('BurstDebugInformation_DoNotShip')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (entry.isFile()) files.push(absolute);
  }
}
visit(root);
files.sort((a, b) => a.localeCompare(b, 'en'));
const entries = [];
for (const absolute of files) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolute)) hash.update(chunk);
  entries.push({ path: path.relative(root, absolute).replaceAll('\\', '/'),
    bytes: statSync(absolute).size, sha256: hash.digest('hex') });
}
if (!entries.some(item => item.path === 'WarRoom3D.exe') ||
    !entries.some(item => item.path.endsWith('/WarRoom3D.Runtime.dll')))
  throw new Error('Build Windows incompleto');
const tree = createHash('sha256');
for (const entry of entries) tree.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
const manifest = { format: 'wr3d-player-build-manifest-v1',
  excluded: 'BurstDebugInformation_DoNotShip', fileCount: entries.length,
  totalBytes: entries.reduce((sum, item) => sum + item.bytes, 0),
  treeSha256: tree.digest('hex'), files: entries };
writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ outputPath, fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes, treeSha256: manifest.treeSha256 }));
