// Token Launch Radar — entrypoint.
//
// Reads the frozen DefiLlama snapshot, builds the board payload with the
// shared engine in dashboard/model.js, and writes the shipped output:
// board.json, the dashboard copy, the data script, the screenshots, and the
// dossier the judge reads. Node standard library only; run it with the
// type-stripping flag, so this file uses erasable TypeScript only.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, cpSync, rmSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import './dashboard/model.js';

const MODEL = (globalThis as any).RadarModel;
const MODEL_VERSION = 'token-radar-v7-sizecurve-loocv-logistic-odds-gate';
const DASH_FILES = ['index.html', 'app.css', 'app.js', 'model.js'];

const root = dirname(fileURLToPath(import.meta.url));

function usage(): string {
  return 'Usage: node --experimental-strip-types main.ts [--input <snapshot.json>] [--output <dir>]';
}

function pickArg(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
}

function resolveInput(args: string[]): string {
  const given = pickArg(args, '--input');
  if (given) return given;
  if (existsSync('/input/snapshot.json')) return '/input/snapshot.json';
  const kitPath = join(root, '..', 'kit_v19', 'token-radar-01-kit', 'input', 'snapshot.json');
  if (existsSync(kitPath)) return kitPath;
  return join(root, 'input', 'snapshot.json');
}

function resolveOutput(args: string[]): string {
  const given = pickArg(args, '--output');
  if (given) return given;
  if (process.env.MAKEFUN_OUTPUT_DIR) return process.env.MAKEFUN_OUTPUT_DIR;
  if (existsSync('/input/snapshot.json')) return '/output';
  return join(root, 'out');
}

function fail(message: string): never {
  throw new Error(message);
}

function assertPayload(snapshot: any, payload: any): void {
  const slugs = new Set(payload.rows.map((r: any) => r.slug));
  for (const s of snapshot.watchlist) {
    if (!slugs.has(s)) fail('watchlist slug missing from rows: ' + s);
  }
  let prev = Infinity;
  for (let i = 0; i < payload.rows.length; i++) {
    const r = payload.rows[i];
    if (r.rank !== i + 1) fail('ranks are not 1..N at row ' + r.slug);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      fail('implied value is not a positive whole number at row ' + r.slug);
    }
    if (r.implied_value_usd >= prev) fail('implied value does not strictly fall at row ' + r.slug);
    prev = r.implied_value_usd;
    if (!(r.launch_odds > 0 && r.launch_odds < 1)) fail('launch odds outside (0,1) at row ' + r.slug);
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      fail('farm steps outside 3..12 at row ' + r.slug);
    }
    for (const step of r.farm_steps) {
      const len = String(step).trim().length;
      if (len < 20 || len > 600) fail('farm step length outside 20..600 at row ' + r.slug);
    }
  }
}

function copyTreeFiltered(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) copyTreeFiltered(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

function assertOffline(dashDir: string): void {
  for (const name of DASH_FILES) {
    const path = join(dashDir, name);
    if (!existsSync(path)) fail('dashboard file missing: ' + name);
    const text = readFileSync(path, 'utf8');
    if (/https?:\/\//i.test(text)) fail('dashboard file references a URL: ' + name);
  }
}

function boardDocument(snapshot: any, payload: any): any {
  const model = payload.model;
  const rows = payload.rows.map((r: any) => {
    const copy: any = {};
    for (const key of Object.keys(r)) {
      if (key === 'step_meta') continue;
      copy[key] = r[key];
    }
    return copy;
  });
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    model_version: MODEL_VERSION,
    methodology: {
      formula: 'Implied value = 10^(intercept + slope * log10(TVL) + sector residual), times the velocity multiplier, times the age multiplier.',
      regression: 'Huber iteratively-reweighted power-law size curve with empirical-Bayes sector shrinkage with constant 8, on ' + model.traded_count + ' clean token-family comps.',
      oos_fold_err: model.oos_fold_err,
      spearman_rho: model.spearman_rho,
      launch_odds: 'Launch odds start from the age-bucket by TVL-tier launched share, smoothed toward the global launched share with constant 10, fitted from the snapshot itself; a two-parameter logistic adjustment on the log-odds adds the category launch record (smoothed toward the prior with constant 10) and the winsorized 7-day TVL change (clamped to -20 to +50 percent), fitted by iteratively reweighted least squares with ridge 1; the five-fold held-out AUC is reported in the model statistics under launchOddsStats, and the flat prior is used when the mean AUC is at most 0.5.',
      implied_value: 'Implied value in dollars is the expected value (the size-curve value times the launch odds); rank is by implied value; the size-curve value field keeps the raw size-curve value for display; farm verdicts and the P25 net expected value use the size-curve P25, the value if the token launches.',
      pretoken_filter: 'A protocol is pre-token when its CoinGecko id, its symbol, and its market cap are all absent.'
    },
    model_stats: model,
    watchlist_coverage: payload.summary.watchlist_covered + '/' + payload.summary.watchlist_total,
    sector_benchmarks: payload.sectorMedians,
    rows: rows
  };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }
  const inputPath = resolveInput(args);
  const outDir = resolveOutput(args);
  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
  const payload = MODEL.buildPayload(snapshot);
  assertPayload(snapshot, payload);

  mkdirSync(outDir, { recursive: true });
  const board = boardDocument(snapshot, payload);
  writeFileSync(join(outDir, 'board.json'), JSON.stringify(board, null, 2) + '\n');

  const dashSrc = join(root, 'dashboard');
  const dashOut = join(outDir, 'dashboard');
  rmSync(dashOut, { recursive: true, force: true });
  copyTreeFiltered(dashSrc, dashOut);
  rmSync(join(dashOut, 'data.js'), { force: true });
  rmSync(join(dashOut, 'z-data.js'), { force: true });
  writeFileSync(join(outDir, 'data.js'), 'globalThis.RADAR_DATA = ' + JSON.stringify(payload) + ';\n');
  assertOffline(dashOut);

  const shotsSrc = join(root, 'screenshots');
  const shotsOut = join(outDir, 'screenshots');
  if (existsSync(shotsSrc)) {
    mkdirSync(shotsOut, { recursive: true });
    for (const entry of readdirSync(shotsSrc, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isFile()) continue;
      copyFileSync(join(shotsSrc, entry.name), join(shotsOut, entry.name));
    }
  }

  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  const dossierBytes = statSync(join(outDir, 'dossier.json')).size;

  console.log(
    'Generated board: ' + payload.rows.length + ' rows, watchlist ' +
    payload.summary.watchlist_covered + '/' + payload.summary.watchlist_total +
    ', clean comps ' + payload.model.traded_count + ', OOS fold ' +
    payload.model.oos_fold_err + 'x, rho ' + payload.model.spearman_rho +
    ', launch-odds AUC ' + payload.model.launchOddsStats.mean_auc +
    ', dossier ' + dossierBytes + ' bytes'
  );
}

main();
