#!/usr/bin/env node
// Checks a room folder against the rules of Interviews by PrasangLabs, tries its checks on the starting files, and packs
// room.zip when there are no errors. Plain Node 22 or newer, no packages.
//   node validate.mjs <room-folder> [--zip <out.zip>] [--no-try]
// The platform checks everything again on upload; these rules mirror control-plane/rooms.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--zip');
const zipOut = args.includes('--zip') ? args[args.indexOf('--zip') + 1] : null;
if (!dir) { console.log('Usage: node validate.mjs <room-folder> [--zip <out.zip>] [--no-try]'); process.exit(2); }
const root = path.resolve(dir);
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

const TOOLS = ['vscode', 'chat', 'claude', 'opencode'];
const TYPES = { file_exists: ['path'], file_min_length: ['path', 'min'], file_matches: ['path', 'pattern'], file_not_matches: ['path', 'pattern'], json_field: ['path', 'field'], command: ['run'], test_count: [], csv_compare: ['path', 'truth'], sqlite_query: ['path', 'query'] };
const LIMITS = { files: 2000, totalBytes: 200 * 1024 * 1024, fileBytes: 50 * 1024 * 1024, zipBytes: 25 * 1024 * 1024 };
const SKIP = /(^|\/)(__MACOSX|\.git|\.DS_Store|Thumbs\.db)(\/|$)/;
const text = (v) => String(v ?? '').trim();
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const relOk = (p) => p && !p.startsWith('/') && !p.split('/').includes('..') && Buffer.byteLength(p) <= 150;

// ---- files ----
function walk(base) {
  const out = [];
  if (!fs.existsSync(base)) return out;
  const go = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name), rel = path.relative(base, abs).split(path.sep).join('/');
      if (SKIP.test(rel)) continue;
      if (e.isSymbolicLink()) { err(`${path.relative(root, abs)} is a symbolic link; copy the real file instead.`); continue; }
      if (e.isDirectory()) { if (e.name === 'node_modules') warn(`${path.relative(root, abs)}: node_modules makes the zip large, and rooms cannot install packages. Keep only what the room needs.`); go(abs); continue; }
      if (!e.isFile()) continue;
      const st = fs.statSync(abs);
      if (!relOk(rel) || rel.split('/').some((s) => Buffer.byteLength(s) > 100)) err(`${path.relative(root, abs)}: the path is too long (150 bytes, 100 per folder name).`);
      if (st.size > LIMITS.fileBytes) err(`${path.relative(root, abs)} is larger than 50 MB.`);
      out.push({ path: rel, abs, bytes: st.size, exec: !!(st.mode & 0o111) });
    }
  };
  go(base);
  return out;
}
if (!fs.existsSync(path.join(root, 'room.json'))) { console.log(`No room.json in ${root}.`); process.exit(1); }
for (const e of fs.readdirSync(root)) if (!['room.json', 'files', 'hidden', '.DS_Store'].includes(e)) warn(`${e} is not part of the room (only room.json, files/ and hidden/ go into the zip).`);
const files = walk(path.join(root, 'files')), hidden = walk(path.join(root, 'hidden'));
if (files.length + hidden.length > LIMITS.files) err(`Too many files (${files.length + hidden.length}); the limit is ${LIMITS.files}.`);
if ([...files, ...hidden].reduce((a, f) => a + f.bytes, 0) > LIMITS.totalBytes) err('More than 200 MB of files.');
if (files.some((f) => f.path === '.interview' || f.path.startsWith('.interview/'))) err('files/.interview is reserved by the platform.');
if (!files.length) warn('files/ is empty: the candidate starts with only PROBLEM.md and RESOURCES.md.');
if (files.some((f) => /(^|\/)\.env$|id_rsa|\.pem$/.test(f.path))) warn('files/ has something that looks like a secret (.env, a key). Make sure it is fake.');

// ---- room.json ----
let r = {};
try { r = JSON.parse(fs.readFileSync(path.join(root, 'room.json'), 'utf8')); } catch (e) { err(`room.json is not valid JSON: ${e.message}`); }
if (!r || typeof r !== 'object' || Array.isArray(r)) { err('room.json must be one JSON object.'); r = {}; }
const maxLen = { name: 80, role: 80, domain: 80, summary: 600, candidateBrief: 1200, problem: 20000, resources: 20000, handy: 300, checkStep: 400, brief: 8000 };
for (const [k, n] of Object.entries(maxLen)) if (r[k] !== undefined && text(r[k]).length > n) warn(`${k} is longer than ${n} characters and will be cut.`);
for (const k of ['name', 'role', 'summary', 'brief']) if (!filled(r[k])) err(`${k} is required.`);
if (!filled(r.problem) && !files.some((f) => f.path === 'PROBLEM.md')) err('problem is required (or files/PROBLEM.md).');
if (r.minutes !== undefined && !(Number.isInteger(Number(r.minutes)) && r.minutes >= 10 && r.minutes <= 180)) err('minutes must be a whole number from 10 to 180.');
if (r.writeup !== undefined && (!/^[\w./-]{1,60}\.md$/.test(text(r.writeup)) || text(r.writeup).includes('..'))) err('writeup must be a .md file name, like WRITEUP.md.');
if (r.deliverables !== undefined && !Array.isArray(r.deliverables)) err('deliverables must be a list of short lines.');
if (Array.isArray(r.deliverables) && r.deliverables.length > 10) warn('Only the first 10 deliverables are kept.');
if (r.tools !== undefined) { if (!Array.isArray(r.tools)) err('tools must be a list.'); else for (const t of r.tools) if (!TOOLS.includes(t)) err(`tools: ${t} is not one of ${TOOLS.join(', ')}.`); }
if (filled(r.tokenBudget)) { const n = Number(String(r.tokenBudget).replace(/[,_\s]/g, '')); if (!Number.isInteger(n) || (n !== 0 && (n < 20000 || n > 5000000))) err('tokenBudget must be from 20,000 to 5,000,000.'); }
if (!Array.isArray(r.rubric) || r.rubric.length < 3 || r.rubric.length > 10) err('rubric needs 3 to 10 skills.');
else {
  const names = r.rubric.map((x) => text(Array.isArray(x) ? x[0] : x && x.name).toLowerCase());
  if (names.some((n) => !n)) err('Every rubric skill needs a name.');
  if (new Set(names).size !== names.length) err('Rubric skills need different names.');
  r.rubric.forEach((x, i) => { const look = Array.isArray(x) ? x[1] : x && x.look; const w = Number(Array.isArray(x) ? x[2] : x && x.weight); if (!filled(look)) warn(`rubric ${i + 1}: say what to look for.`); if (x && !Array.isArray(x) && x.weight !== undefined && !(w >= 1 && w <= 3)) warn(`rubric ${i + 1}: weight is 1 to 3; it will be clamped.`); });
}
const checks = r.checks === undefined ? [] : r.checks;
if (!Array.isArray(checks) || checks.length > 30) err('checks must be a list of up to 30.');
else checks.forEach((c, i) => {
  const name = text(c && c.name) || `check ${i + 1}`;
  const need = c && TYPES[c.type];
  if (!need) return err(`${name}: type must be one of ${Object.keys(TYPES).join(', ')}.`);
  for (const k of need) if (!filled(c[k])) err(`${name}: fill in ${k}.`);
  for (const k of ['path', 'truth']) if (filled(c[k]) && !relOk(text(c[k]))) err(`${name}: ${k} must be a path inside the project, like deliverables/answer.csv.`);
  for (const k of ['pattern', 'outputMatches']) if (filled(c[k])) { try { new RegExp(c[k], 'i'); } catch { err(`${name}: ${k} is not a valid regular expression.`); } }
  for (const k of ['min', 'max', 'expectExit', 'timeout', 'minPrecision', 'minRecall', 'weight']) if (filled(c[k]) && !Number.isFinite(Number(c[k]))) err(`${name}: ${k} must be a number.`);
  if (c.type === 'sqlite_query' && filled(c.query)) { const q = text(c.query).replace(/;\s*$/, ''); if (!/^(select|with)\b/i.test(q) || q.includes(';')) err(`${name}: the query must be one SELECT statement.`); }
  if (filled(c.truth) && !hidden.some((f) => f.path === text(c.truth))) err(`${name}: hidden/${text(c.truth)} does not exist.`);
  if (c.type === 'csv_compare' && filled(c.path) && files.some((f) => f.path === text(c.path))) warn(`${name}: files/${text(c.path)} already exists at the start; the candidate should produce it.`);
});
if (!checks.length && !filled(r.script)) warn('No checks: the report will rely on the judge alone.');
if (filled(r.script)) warn('A custom script needs review by the platform team before it can run. Prefer the built-in check types.');
for (const f of files) if (/\.(md|txt|json|csv|js|mjs|ts|py|sql|log|ya?ml)$/i.test(f.path) && f.bytes < 2e6 && filled(r.brief)) {
  const t = fs.readFileSync(f.abs, 'utf8'), probe = text(r.brief).slice(0, 80);
  if (probe.length > 40 && t.includes(probe)) err(`files/${f.path} contains the answer key.`);
}
for (const h of hidden) if (files.some((f) => f.bytes === h.bytes && fs.readFileSync(f.abs).equals(fs.readFileSync(h.abs)))) err(`hidden/${h.path} is also in files/: the candidate would see the answer.`);

// ---- try the checks on the starting files ----
let tried = null;
if (!errors.length && Array.isArray(checks) && checks.length && !args.includes('--no-try')) {
  const runner = path.join(here, 'run-checks.mjs');
  if (!fs.existsSync(runner)) warn('run-checks.mjs is missing next to validate.mjs, so the checks were not tried.');
  else {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'room-try-')), v = path.join(t, 'v'), ws = path.join(t, 'ws');
    try {
      fs.mkdirSync(path.join(v, 'hidden'), { recursive: true });
      fs.copyFileSync(runner, path.join(v, 'run-checks.mjs'));
      fs.writeFileSync(path.join(v, 'checks.json'), JSON.stringify(checks));
      for (const h of hidden) { fs.mkdirSync(path.dirname(path.join(v, 'hidden', h.path)), { recursive: true }); fs.copyFileSync(h.abs, path.join(v, 'hidden', h.path)); }
      fs.mkdirSync(ws);
      for (const f of files) { fs.mkdirSync(path.dirname(path.join(ws, f.path)), { recursive: true }); fs.copyFileSync(f.abs, path.join(ws, f.path)); }
      if (filled(r.problem)) fs.writeFileSync(path.join(ws, 'PROBLEM.md'), text(r.problem) + '\n');
      const p = spawnSync(process.execPath, [path.join(v, 'run-checks.mjs'), ws], { encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
      const m = String(p.stdout || '').match(/\{[\s\S]*\}\s*$/);
      tried = m ? JSON.parse(m[0]) : null;
      if (!tried) warn(`The checks did not run: ${String(p.stderr || '').trim().split('\n').slice(-2).join(' ')}`);
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
  }
}

// ---- report ----
console.log(`Room: ${text(r.name) || '(no name)'}  ${files.length} starting files, ${hidden.length} hidden files, ${Array.isArray(checks) ? checks.length : 0} checks`);
if (tried) {
  console.log('\nChecks on the starting files (on this machine; the platform sandbox has no network):');
  for (const c of tried.checks) console.log(`  ${c.pass ? 'pass' : 'fail'}  ${c.name}: ${c.detail}`);
  const passing = tried.checks.filter((c) => c.pass).length;
  if (tried.checks.length && passing === tried.checks.length) warn('Every check passes on the starting files, so they do not show whether the candidate did anything.');
  else if (passing > tried.checks.length / 2) warn(`${passing} of ${tried.checks.length} checks already pass on the starting files. Most should fail until the candidate does the work.`);
}
if (warnings.length) console.log('\nWarnings:\n' + warnings.map((w) => '  - ' + w).join('\n'));
if (errors.length) { console.log('\nErrors (fix these, then run again):\n' + errors.map((e) => '  - ' + e).join('\n')); process.exit(1); }
console.log('\nNo errors.');

// ---- pack ----
if (zipOut) {
  const entries = [{ path: 'room.json', data: fs.readFileSync(path.join(root, 'room.json')) }, ...files.map((f) => ({ path: 'files/' + f.path, data: fs.readFileSync(f.abs), exec: f.exec })), ...hidden.map((f) => ({ path: 'hidden/' + f.path, data: fs.readFileSync(f.abs) }))];
  const zip = zipFiles(entries);
  if (zip.length > LIMITS.zipBytes) { console.log(`\nThe zip would be ${(zip.length / 1048576).toFixed(1)} MB; the limit is 25 MB. Make the data smaller.`); process.exit(1); }
  fs.writeFileSync(path.resolve(zipOut), zip);
  console.log(`Wrote ${path.resolve(zipOut)} (${(zip.length / 1024).toFixed(0)} KB). Upload it in Rooms, Create from a room package.`);
}

function zipFiles(list) {
  const locals = [], centrals = [];
  let off = 0;
  for (const f of list) {
    const name = Buffer.from(f.path), data = Buffer.from(f.data), comp = zlib.deflateRawSync(data), crc = zlib.crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(33, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(33, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((f.exec ? 0o100755 : 0o100644) << 16) >>> 0, 38); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, comp); centrals.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
