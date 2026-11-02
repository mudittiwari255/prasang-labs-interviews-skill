// Runs a room's declarative checks against a candidate workspace and prints {pass, checks:[{name, pass, detail}]}.
//   node run-checks.mjs /ws        (checks.json and the hidden files sit next to this script, read-only)
// It runs inside the sandboxed verifier container (no network, non-root, limits), so commands from the room run there too.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const ws = path.resolve(process.argv[2] || '/ws');
const checks = JSON.parse(fs.readFileSync(path.join(here, 'checks.json'), 'utf8'));
const inside = (root, rel) => { const p = path.resolve(root, String(rel || '')); if (p !== root && !p.startsWith(root + path.sep)) throw new Error('path outside the folder'); return p; };
const read = (rel) => { const p = inside(ws, rel); if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null; return fs.readFileSync(p, 'utf8'); };
const hidden = (rel) => fs.readFileSync(inside(path.join(here, 'hidden'), rel), 'utf8');
const cut = (s, n = 300) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '...' : s; };
const sh = (cmd, timeout = 60) => spawnSync('sh', ['-c', cmd], { cwd: ws, encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 8 * 1024 * 1024, env: Object.fromEntries(Object.entries({ ...process.env, CI: '1' }).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
const get = (obj, dotted) => String(dotted || '').split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
const csvRows = (text) => {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(lines[0] || '');
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
};

// node:sqlite prints an "experimental" warning on first load; keep it out of the output.
let Sqlite = null;
const sqlite = () => { if (!Sqlite) { const w = process.emitWarning; process.emitWarning = () => {}; try { Sqlite = createRequire(import.meta.url)('node:sqlite').DatabaseSync; } finally { process.emitWarning = w; } } return Sqlite; };
const inRange = (c, v) => {
  if (c.equals !== undefined && c.equals !== '') return [String(v) === String(c.equals), `${c.field || 'value'} is ${cut(JSON.stringify(v), 80)}`];
  const n = Number(v); if (v === null || v === undefined || !Number.isFinite(n)) return [false, `${c.field || 'value'} is not a number (${cut(JSON.stringify(v), 60)})`];
  return [(c.min === undefined || c.min === '' || n >= Number(c.min)) && (c.max === undefined || c.max === '' || n <= Number(c.max)), `${c.field || 'value'} is ${n}`];
};

const T = {
  file_exists: (c) => { const ok = read(c.path) !== null; return [ok, ok ? 'found' : `${c.path} is missing`]; },
  file_min_length: (c) => { const t = read(c.path); if (t === null) return [false, `${c.path} is missing`]; const n = t.trim().length; return [n >= (c.min || 1), `${n} characters (needs ${c.min || 1})`]; },
  file_matches: (c) => { const t = read(c.path); if (t === null) return [false, `${c.path} is missing`]; const ok = new RegExp(c.pattern, c.flags ?? 'i').test(t); return [ok, ok ? 'found the expected text' : 'did not find the expected text']; },
  file_not_matches: (c) => { const t = read(c.path); if (t === null) return [!c.missingFails, `${c.path} is missing`]; const ok = !new RegExp(c.pattern, c.flags ?? 'i').test(t); return [ok, ok ? 'the text is not there' : 'found text that should not be there']; },
  json_field: (c) => {
    const t = read(c.path); if (t === null) return [false, `${c.path} is missing`];
    let v; try { v = get(JSON.parse(t), c.field); } catch { return [false, `${c.path} is not valid JSON`]; }
    return inRange(c, v);
  },
  sqlite_query: (c) => {
    const p = inside(ws, c.path);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return [false, `${c.path} is missing`];
    if (!/^\s*(select|with)\b/i.test(c.query || '')) return [false, 'the query must be a SELECT'];
    const DB = sqlite(); const d = new DB(p, { readOnly: true });
    try { const row = d.prepare(c.query).get(); return inRange({ ...c, field: 'result' }, row ? Object.values(row)[0] : null); }
    catch (e) { return [false, `query failed: ${cut(e.message, 160)}`]; }
    finally { d.close(); }
  },
  command: (c) => {
    const r = sh(c.run, Math.min(300, c.timeout || 60));
    if (r.error && r.error.code === 'ETIMEDOUT') return [false, 'timed out'];
    const out = (r.stdout || '') + (r.stderr || '');
    let ok = c.expectExit === undefined || c.expectExit === '' ? r.status === 0 : r.status === Number(c.expectExit);
    if (ok && c.outputMatches) ok = new RegExp(c.outputMatches, 'i').test(out);
    return [ok, `exit ${r.status}${out.trim() ? ': ' + cut(out.trim().split('\n').slice(-3).join(' | '), 240) : ''}`];
  },
  test_count: (c) => {
    const r = sh(c.run || 'node --test', Math.min(300, c.timeout || 120));
    const out = (r.stdout || '') + (r.stderr || '');
    let pass = Number((out.match(/(?:#|ℹ) pass (\d+)/) || out.match(/(\d+) passed/) || out.match(/Tests:\s+(\d+) passed/) || [])[1] || 0);
    let fail = Number((out.match(/(?:#|ℹ) fail (\d+)/) || out.match(/(\d+) failed/) || [])[1] || 0);
    const ran = out.match(/^Ran (\d+) tests? in /m); // python3 -m unittest
    if (!pass && ran) { const f = out.match(/^(?:FAILED|OK) \(([^)]*)\)/m), n = (k) => Number(((f && f[1]) || '').match(new RegExp(`${k}=(\\d+)`))?.[1] || 0); fail = n('failures') + n('errors'); pass = Number(ran[1]) - fail - n('skipped'); }
    return [pass >= (c.min || 1) && (c.allowFailing || fail === 0), `${pass} passing, ${fail} failing (needs ${c.min || 1} passing${c.allowFailing ? '' : ' and none failing'})`];
  },
  csv_compare: (c) => {
    const t = read(c.path); if (t === null) return [false, `${c.path} is missing`];
    const key = c.key || 'id';
    const got = new Set(csvRows(t).map((r) => r[key]).filter(Boolean)), want = new Set(csvRows(hidden(c.truth)).map((r) => r[key]).filter(Boolean));
    const hit = [...got].filter((k) => want.has(k)).length;
    const precision = got.size ? hit / got.size : 0, recall = want.size ? hit / want.size : 0;
    const ok = precision >= (c.minPrecision ?? 0.9) && recall >= (c.minRecall ?? 0.9);
    return [ok, `${got.size} listed, ${hit} correct of ${want.size}: precision ${precision.toFixed(2)}, recall ${recall.toFixed(2)}`];
  },
};

// File checks look at what the candidate handed in, so they run before any command (a command runs candidate code, which
// could otherwise rewrite the files being checked). Results keep the order the room lists them in.
const RUNS = new Set(['command', 'test_count']);
const out = new Array(checks.length);
for (const phase of [false, true]) checks.forEach((c, i) => {
  if (RUNS.has(c.type) !== phase) return;
  let pass = false, detail = '';
  try { [pass, detail] = (T[c.type] || (() => [false, `unknown check type ${c.type}`]))(c); } catch (e) { detail = cut(e.message, 200); }
  out[i] = { name: c.name, pass: !!pass, detail: cut(detail), weight: c.weight || 1 };
});
// A company's own check script (approved by a platform admin): node script.mjs /ws, printing {checks:[{name, pass, detail}]}.
if (fs.existsSync(path.join(here, 'script.mjs'))) {
  const r = spawnSync('node', [path.join(here, 'script.mjs'), ws], { cwd: here, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
  const m = String(r.stdout || '').match(/\{[\s\S]*\}\s*$/);
  let got = null; try { got = m && JSON.parse(m[0]); } catch {}
  if (got && Array.isArray(got.checks)) for (const c of got.checks.slice(0, 50)) out.push({ name: cut(c.name || 'custom check', 120), pass: !!c.pass, detail: cut(c.detail), weight: Math.min(3, Math.max(1, Number(c.weight) || 1)) });
  else out.push({ name: 'custom check script', pass: false, detail: r.error && r.error.code === 'ETIMEDOUT' ? 'timed out' : cut(((t) => t.find((l) => /Error/.test(l)) || t.slice(-2).join(' | '))((r.stderr || r.stdout || 'printed no result').trim().split('\n').map((l) => l.trim()).filter(Boolean)), 240), weight: 1 });
}
console.log(JSON.stringify({ pass: out.length > 0 && out.every((x) => x.pass), checks: out }, null, 2));
