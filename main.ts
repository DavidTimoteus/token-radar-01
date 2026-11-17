import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const require = createRequire(import.meta.url);
const RadarModel = require('./dashboard/model.js') as {
  buildRadarPayload: (snapshot: Snapshot) => RadarPayload;
};

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Array<Record<string, unknown>>;
  watchlist: string[];
}

interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  farm_chain: string;
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  in_watchlist: boolean;
  verdict: string;
  verdict_reason: string;
  implied_value_usd: number;
  p25_usd: number;
  p75_usd: number;
  ticket_usd: number;
  min_deposit_usd: number;
  p25_airdrop_rec_usd: number;
  mid_airdrop_rec_usd: number;
  est_cost_90d_usd: number;
  net_ev_p25_usd: number;
  net_ev_mid_usd: number;
  breakeven_fdv_usd: number;
  age_days: number;
  valuation: Record<string, unknown>;
  farm_steps: string[];
  step_meta: Array<Record<string, unknown>>;
}

interface RadarPayload {
  summary: {
    as_of: string;
    source: string;
    floor_usd: number;
    watchlist_covered: number;
    watchlist_total: number;
  };
  modelStats: {
    n_traded: number;
    oos_fold_err: number;
    spearman_rho: number;
  };
  rows: RadarRow[];
  liveTokens: Array<Record<string, unknown>>;
  sectorMedians: Record<string, number>;
}

interface CliArgs {
  inputPath: string;
  outputDir: string;
}

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));

function resolveDefaultInput(): string {
  const containerInput = '/input/snapshot.json';
  if (existsSync(containerInput)) return containerInput;
  const kitInput = resolve(ROOT_DIR, '../kit_v19/token-radar-01-kit/input/snapshot.json');
  if (existsSync(kitInput)) return kitInput;
  return resolve(ROOT_DIR, 'input/snapshot.json');
}

function resolveDefaultOutput(): string {
  if (process.env.MAKEFUN_OUTPUT_DIR) return resolve(process.env.MAKEFUN_OUTPUT_DIR);
  if (existsSync('/input/snapshot.json')) return '/output';
  return resolve(ROOT_DIR, 'out');
}

function parseArgs(argv: string[]): CliArgs {
  let inputPath = resolveDefaultInput();
  let outputDir = resolveDefaultOutput();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node main.ts [--input <snapshot.json>] [--output <dir>]');
      process.exit(0);
    } else if (arg === '--input' && i + 1 < argv.length) {
      inputPath = resolve(argv[++i]!);
    } else if (arg === '--output' && i + 1 < argv.length) {
      outputDir = resolve(argv[++i]!);
    }
  }

  return { inputPath, outputDir };
}

function assertBoardInvariants(snapshot: Snapshot, rows: RadarRow[]): void {
  const rowSlugs = new Set(rows.map((r) => r.slug));
  for (const wlSlug of snapshot.watchlist) {
    if (!rowSlugs.has(wlSlug)) {
      throw new Error(`Watchlist coverage failure: missing ${wlSlug}`);
    }
  }
  let prevValue = Number.POSITIVE_INFINITY;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) throw new Error(`Rank sequence error at index ${i}: got ${r.rank}`);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd >= prevValue) {
      throw new Error(`Strict descending valuation failed at ${r.slug}: ${r.implied_value_usd} vs ${prevValue}`);
    }
    prevValue = r.implied_value_usd;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      throw new Error(`Invalid farm_steps count at ${r.slug}: ${r.farm_steps.length}`);
    }
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) {
        throw new Error(`Invalid farm_step length at ${r.slug}: ${len}`);
      }
    }
  }
}

function assertOfflineDashboard(dashDir: string): void {
  for (const name of ['app.css', 'app.js', 'index.html', 'model.js']) {
    const filePath = join(dashDir, name);
    if (!existsSync(filePath)) throw new Error(`Missing required dashboard asset: ${name}`);
    const content = readFileSync(filePath, 'utf8');
    if (/https?:\/\//i.test(content)) {
      throw new Error(`Forbidden external URL detected in dashboard/${name}`);
    }
  }
}

function copyDirClean(srcDir: string, dstDir: string): void {
  if (!existsSync(srcDir)) return;
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const srcPath = join(srcDir, entry.name);
    const dstPath = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirClean(srcPath, dstPath);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, dstPath);
    }
  }
}

function main(): void {
  const { inputPath, outputDir } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(inputPath, 'utf8');
  const snapshot = JSON.parse(raw) as Snapshot;

  const payload = RadarModel.buildRadarPayload(snapshot);
  assertBoardInvariants(snapshot, payload.rows);

  mkdirSync(outputDir, { recursive: true });

  const boardDoc = {
    as_of: payload.summary.as_of,
    source: payload.summary.source,
    model_version: 'token-radar-v4-sizecurve-loocv',
    methodology: {
      formula: '10^(b0 + b_tvl*log10(tvl) + eb_sector_res) * velocity_mult * age_mult',
      regression: 'Huber-IRLS Power-Law Size Curve + Empirical-Bayes Sector Shrinkage (k=8) on 93 clean token-family comps',
      oos_fold_err: payload.modelStats.oos_fold_err,
      spearman_rho: payload.modelStats.spearman_rho,
      pre_token_filter: 'gecko_id == null && symbol == null && mcap_usd == null',
    },
    model_stats: payload.modelStats,
    watchlist_coverage: `${payload.summary.watchlist_covered}/${payload.summary.watchlist_total}`,
    sector_benchmarks: payload.sectorMedians,
    rows: payload.rows.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      farm_chain: r.farm_chain,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      in_watchlist: r.in_watchlist,
      verdict: r.verdict,
      verdict_reason: r.verdict_reason,
      implied_value_usd: r.implied_value_usd,
      p25_usd: r.p25_usd,
      p75_usd: r.p75_usd,
      ticket_usd: r.ticket_usd,
      min_deposit_usd: r.min_deposit_usd,
      p25_airdrop_rec_usd: r.p25_airdrop_rec_usd,
      mid_airdrop_rec_usd: r.mid_airdrop_rec_usd,
      est_cost_90d_usd: r.est_cost_90d_usd,
      net_ev_p25_usd: r.net_ev_p25_usd,
      net_ev_mid_usd: r.net_ev_mid_usd,
      breakeven_fdv_usd: r.breakeven_fdv_usd,
      age_days: r.age_days,
      valuation: r.valuation,
      farm_steps: r.farm_steps,
    })),
  };

  writeFileSync(join(outputDir, 'board.json'), JSON.stringify(boardDoc, null, 2) + '\n', 'utf8');

  const dashSrcDir = join(ROOT_DIR, 'dashboard');
  const dashOutDir = join(outputDir, 'dashboard');
  if (existsSync(dashOutDir)) {
    rmSync(dashOutDir, { recursive: true, force: true });
  }
  copyDirClean(dashSrcDir, dashOutDir);

  // Keep dashboard/ pure source only so buildDossier includes 100% of every file with 0 bytes cut
  for (const stale of ['data.js', 'z-data.js']) {
    const stalePath = join(dashOutDir, stale);
    if (existsSync(stalePath)) rmSync(stalePath, { force: true });
  }

  const scriptContent = `window.RADAR_DATA = ${JSON.stringify(payload)};\n`;
  writeFileSync(join(outputDir, 'data.js'), scriptContent, 'utf8');

  assertOfflineDashboard(dashOutDir);

  const shotsSrcDir = join(ROOT_DIR, 'screenshots');
  const shotsOutDir = join(outputDir, 'screenshots');
  if (existsSync(shotsOutDir)) {
    rmSync(shotsOutDir, { recursive: true, force: true });
  }
  if (existsSync(shotsSrcDir)) {
    mkdirSync(shotsOutDir, { recursive: true });
    for (const entry of readdirSync(shotsSrcDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const src = join(shotsSrcDir, entry.name);
      if (entry.isFile() && lstatSync(src).isFile()) {
        copyFileSync(src, join(shotsOutDir, entry.name));
      }
    }
  }

  const dossierBytes = buildDossier(outputDir, { text_max_bytes: 65536 });
  writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);

  console.log(
    `Generated board (${payload.rows.length} rows, watchlist ${payload.summary.watchlist_covered}/${payload.summary.watchlist_total}), cleanComps=${payload.liveTokens.length}, oosFold=${payload.modelStats.oos_fold_err}x, rho=${payload.modelStats.spearman_rho}, dossier=${dossierBytes.length} bytes`,
  );
}

main();
