export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export type TriageTier = 'Prime Target' | 'Early Alpha (<$50M)' | 'Monitor' | 'Thin / Skip';

export interface SectorStat {
  category: string;
  traded_count: number;
  pre_token_count: number;
  shrink_weight: number;
  raw_mean_log_residual: number;
  shrunk_log_residual: number;
  median_mcap_tvl: number | null;
  effective_mult: number;
}

export interface CompsRegressionModel {
  n_traded: number;
  median_traded_age_days: number;
  shrinkage_k: number;
  intercept: number;
  beta_tvl: number;
  beta_chains: number;
  four_factor_ols: {
    intercept: number;
    beta_tvl: number;
    beta_vel: number;
    beta_age: number;
    beta_chains: number;
    loocv_r2: number;
  };
  loocv_r2: number;
  loocv_med_abs_log10: number;
  loocv_mdape_pct: number;
  residual_q25_log10: number;
  residual_q75_log10: number;
  sectorStats: Record<string, SectorStat>;
}

export interface ValuationBreakdown {
  tvl_usd: number;
  base_comp_usd: number;
  eb_sector_log10: number;
  eb_sector_mult: number;
  eb_shrink_weight: number;
  sector_traded_n: number;
  chain_mult: number;
  velocity_mult: number;
  age_days: number;
  age_mult: number;
  raw_implied_usd: number;
  p25_usd: number;
  p75_usd: number;
  live_sector_median_ratio: number | null;
}

export interface FarmStepMeta {
  text: string;
  cost: string;
  time: string;
  gas_usd: number;
}

export interface FarmPlanSummary {
  ticket_usd: number;
  setup_gas_usd: number;
  carry_90d_usd: number;
  total_cost_90d_usd: number;
  breakeven_fdv_usd: number;
  cadence: string;
  steps: FarmStepMeta[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  primary_chain: string;
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  in_watchlist: boolean;
  tier: TriageTier;
  tier_reason: string;
  implied_value_usd: number;
  p25_usd: number;
  p75_usd: number;
  est_gas_usd: number;
  est_cost_90d_usd: number;
  ticket_usd: number;
  breakeven_fdv_usd: number;
  age_days: number;
  valuation: ValuationBreakdown;
  farm_steps: string[];
  step_meta: FarmStepMeta[];
}

export interface LiveTokenBenchmark {
  rank: number;
  slug: string;
  name: string;
  symbol: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  mcap_to_tvl: number | null;
  model_pred_usd: number;
  residual_log10: number;
  change_7d: number | null;
  listed_at: string | null;
}

export interface RadarSummary {
  as_of: string;
  source: string;
  floor_usd: number;
  total_snapshot_protocols: number;
  pre_token_universe_count: number;
  watchlist_total: number;
  watchlist_covered: number;
  early_alpha_count: number;
  prime_count: number;
  skip_count: number;
  live_benchmark_count: number;
  aggregate_implied_usd: number;
  aggregate_p25_usd: number;
  aggregate_p75_usd: number;
  aggregate_tvl_usd: number;
  top_categories: Array<{ name: string; count: number }>;
  top_chains: Array<{ name: string; count: number }>;
}

export interface RadarPayload {
  summary: RadarSummary;
  modelStats: CompsRegressionModel;
  rows: RadarRow[];
  liveTokens: LiveTokenBenchmark[];
  sectorMedians: Record<string, number>;
}

const EXCLUDED_PRE_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);
const EXCHANGE_NAME_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const WRAPPED_STAKED_RE = /\b(wrapped|staked|staking)\b/i;
const VERSION_SUFFIX_RE = /\s+(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;

// Prioritized by real DeFi liquidity & bridge availability so niche/app-specific chains never appear as primary farm routes
const CHAIN_LIQUIDITY_RANK: Record<string, number> = {
  Ethereum: 1,
  Arbitrum: 2,
  Base: 3,
  Optimism: 4,
  Solana: 5,
  Sui: 6,
  'Hyperliquid L1': 7,
  Monad: 8,
  Polygon: 9,
  Avalanche: 10,
  Binance: 11,
  Mantle: 12,
  Starknet: 13,
  Linea: 14,
  Scroll: 15,
  Berachain: 16,
  Sonic: 17,
  Tron: 18,
  Bitcoin: 19,
  TON: 20,
  Aptos: 21,
  Sei: 22,
  Unichain: 23,
  Ink: 24,
  Plasma: 25,
  'Plume Mainnet': 26,
  Flare: 27,
  Bittensor: 28,
  Provenance: 29,
  BSquared: 30,
  Pharos: 31,
  Ripple: 32,
  Stellar: 33,
  CORE: 34,
  'Babylon Genesis': 35,
  Katana: 36,
  Hemi: 37,
  'zkSync Era': 38,
  Mode: 39,
  Blast: 40,
};

interface ChainFeeProfile {
  txGasUsd: number;
  bridgeUsd: number;
}

const ULTRA_LOW_GAS_CHAINS = new Set([
  'Solana', 'Sui', 'Aptos', 'TON', 'Stellar', 'Ripple', 'Tron',
  'Bittensor', 'Cardano', 'Near', 'Algorand', 'XRPL EVM',
]);

const MID_L1_CHAINS = new Set([
  'Bitcoin', 'CORE', 'Babylon Genesis', 'BSquared', 'Litecoin', 'Doge', 'Provenance',
]);

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function quantileOf(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[idx]!;
}

export function sortChainsByLiquidity(chains: string[]): string[] {
  const list = chains.length > 0 ? [...chains] : ['Ethereum'];
  return list.sort(
    (a, b) => (CHAIN_LIQUIDITY_RANK[a] ?? 999) - (CHAIN_LIQUIDITY_RANK[b] ?? 999) || a.localeCompare(b),
  );
}

function getChainFeeProfile(chain: string): ChainFeeProfile {
  if (chain === 'Ethereum') return { txGasUsd: 8.5, bridgeUsd: 12.0 };
  if (ULTRA_LOW_GAS_CHAINS.has(chain)) return { txGasUsd: 0.03, bridgeUsd: 1.2 };
  if (MID_L1_CHAINS.has(chain)) return { txGasUsd: 2.6, bridgeUsd: 4.5 };
  return { txGasUsd: 0.25, bridgeUsd: 1.6 };
}

function computeAgeDays(asOf: string, listedAt: string | null, fallbackDays = 180): number {
  if (!listedAt) return fallbackDays;
  const end = Date.parse(asOf);
  const start = Date.parse(listedAt);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return fallbackDays;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function solveWeightedRidge(X: number[][], y: number[], w: number[], ridge = 0.05): number[] {
  const n = X.length;
  const m = X[0]!.length;
  const XtWX = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const XtWy = new Array<number>(m).fill(0);

  for (let i = 0; i < n; i++) {
    const wi = w[i]!;
    const xi = X[i]!;
    const yi = y[i]!;
    for (let j = 0; j < m; j++) {
      XtWy[j]! += wi * xi[j]! * yi;
      for (let k = 0; k < m; k++) {
        XtWX[j]![k]! += wi * xi[j]! * xi[k]!;
      }
    }
  }
  for (let j = 1; j < m; j++) XtWX[j]![j]! += ridge;

  const aug = XtWX.map((row, i) => [...row, XtWy[i]!]);
  for (let i = 0; i < m; i++) {
    let piv = i;
    for (let r = i + 1; r < m; r++) {
      if (Math.abs(aug[r]![i]!) > Math.abs(aug[piv]![i]!)) piv = r;
    }
    const tmp = aug[i]!;
    aug[i] = aug[piv]!;
    aug[piv] = tmp;

    const div = Math.abs(aug[i]![i]!) > 1e-12 ? aug[i]![i]! : 1e-12;
    for (let k = i; k <= m; k++) aug[i]![k]! /= div;
    for (let r = 0; r < m; r++) {
      if (r === i) continue;
      const factor = aug[r]![i]!;
      for (let k = i; k <= m; k++) {
        aug[r]![k]! -= factor * aug[i]![k]!;
      }
    }
  }
  return aug.map((row) => row[m]!);
}

function fitHuberIRLS(X: number[][], y: number[], delta = 1.345, iters = 18, ridge = 0.05): number[] {
  let w = new Array<number>(X.length).fill(1);
  let beta = solveWeightedRidge(X, y, w, ridge);
  for (let iter = 0; iter < iters; iter++) {
    const res = y.map((yi, i) => yi - beta.reduce((sum, b, k) => sum + b * X[i]![k]!, 0));
    const absSorted = res.map(Math.abs).sort((a, b) => a - b);
    const mad = medianOf(absSorted) / 0.6745 || 0.5;
    const cutoff = delta * mad;
    w = res.map((r) => (Math.abs(r) <= cutoff ? 1 : cutoff / Math.abs(r)));
    beta = solveWeightedRidge(X, y, w, ridge);
  }
  return beta;
}

function dot(beta: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < beta.length; i++) s += beta[i]! * x[i]!;
  return s;
}

/**
 * Fits an empirical cross-validated log-linear Huber-IRLS + Empirical-Bayes sector-shrinkage
 * regression directly from all traded protocols (mcap_usd > 0 && tvl_usd > 0) in the snapshot.
 */
export function fitCompsRegression(traded: SnapshotProtocol[], asOf: string, preTokenPool: SnapshotProtocol[]): CompsRegressionModel {
  const ages = traded
    .map((p) => (p.listed_at ? computeAgeDays(asOf, p.listed_at) : null))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  const medianTradedAge = ages.length > 0 ? Math.round(medianOf(ages)) : 730;
  const shrinkageK = 6;

  const y = traded.map((p) => Math.log10(p.mcap_usd!));
  const XCore = traded.map((p) => [
    1,
    Math.log10(p.tvl_usd),
    Math.log10(Math.max(1, p.chains.length)),
  ]);
  const XFull = traded.map((p) => [
    1,
    Math.log10(p.tvl_usd),
    clamp(p.change_7d ?? 0, -40, 80) / 100,
    Math.log10(computeAgeDays(asOf, p.listed_at, medianTradedAge) + 30),
    Math.log10(Math.max(1, p.chains.length)),
  ]);

  const betaCore = fitHuberIRLS(XCore, y);
  const betaFull = fitHuberIRLS(XFull, y);

  // Leave-One-Out Cross-Validation (LOOCV) for out-of-sample R^2 and MdAPE
  const loocvPredsCore: number[] = [];
  const loocvPredsFull: number[] = [];
  const loocvResiduals: number[] = [];

  for (let i = 0; i < traded.length; i++) {
    const XiCore = XCore.filter((_, idx) => idx !== i);
    const XiFull = XFull.filter((_, idx) => idx !== i);
    const yi = y.filter((_, idx) => idx !== i);
    const ti = traded.filter((_, idx) => idx !== i);

    const bC = fitHuberIRLS(XiCore, yi, 1.345, 12, 0.05);
    const bF = fitHuberIRLS(XiFull, yi, 1.345, 12, 0.05);

    const catResCore = new Map<string, number[]>();
    const catResFull = new Map<string, number[]>();
    for (let j = 0; j < ti.length; j++) {
      const cat = ti[j]!.category || 'Uncategorized';
      const rC = clamp(yi[j]! - dot(bC, XiCore[j]!), -1.0, 1.0);
      const rF = clamp(yi[j]! - dot(bF, XiFull[j]!), -1.0, 1.0);
      if (!catResCore.has(cat)) catResCore.set(cat, []);
      if (!catResFull.has(cat)) catResFull.set(cat, []);
      catResCore.get(cat)!.push(rC);
      catResFull.get(cat)!.push(rF);
    }

    const targetCat = traded[i]!.category || 'Uncategorized';
    const arrC = catResCore.get(targetCat) ?? [];
    const arrF = catResFull.get(targetCat) ?? [];
    const nCat = arrC.length;
    const wCat = nCat / (nCat + shrinkageK);
    const ebC = nCat > 0 ? wCat * (arrC.reduce((a, c) => a + c, 0) / nCat) : 0;
    const ebF = nCat > 0 ? wCat * (arrF.reduce((a, c) => a + c, 0) / nCat) : 0;

    const predC = dot(bC, XCore[i]!) + ebC;
    const predF = dot(bF, XFull[i]!) + ebF;
    loocvPredsCore.push(predC);
    loocvPredsFull.push(predF);
    loocvResiduals.push(y[i]! - predC);
  }

  const yMean = y.reduce((a, b) => a + b, 0) / Math.max(1, y.length);
  const ssTot = y.reduce((acc, yi) => acc + (yi - yMean) ** 2, 0) || 1;
  const ssResCore = y.reduce((acc, yi, i) => acc + (yi - loocvPredsCore[i]!) ** 2, 0);
  const ssResFull = y.reduce((acc, yi, i) => acc + (yi - loocvPredsFull[i]!) ** 2, 0);

  const absLogErrs = loocvResiduals.map(Math.abs).sort((a, b) => a - b);
  const medAbsLog = medianOf(absLogErrs);
  const mdapePct = (10 ** medAbsLog - 1) * 100;
  const sortedRes = [...loocvResiduals].sort((a, b) => a - b);
  const q25Res = quantileOf(sortedRes, 0.25);
  const q75Res = quantileOf(sortedRes, 0.75);

  // Build Empirical-Bayes shrunk sector statistics from full traded fit
  const catBuckets = new Map<string, { res: number[]; ratios: number[] }>();
  for (let i = 0; i < traded.length; i++) {
    const p = traded[i]!;
    const cat = p.category || 'Uncategorized';
    const pred = dot(betaCore, XCore[i]!);
    const res = clamp(y[i]! - pred, -1.0, 1.0);
    if (!catBuckets.has(cat)) catBuckets.set(cat, { res: [], ratios: [] });
    catBuckets.get(cat)!.res.push(res);
    catBuckets.get(cat)!.ratios.push(p.mcap_usd! / p.tvl_usd);
  }

  const preCatCounts = new Map<string, number>();
  for (const p of preTokenPool) {
    const cat = p.category || 'Uncategorized';
    preCatCounts.set(cat, (preCatCounts.get(cat) ?? 0) + 1);
  }

  const allCats = new Set([...catBuckets.keys(), ...preCatCounts.keys()]);
  const sectorStats: Record<string, SectorStat> = {};
  for (const cat of [...allCats].sort()) {
    const bucket = catBuckets.get(cat);
    const nTraded = bucket ? bucket.res.length : 0;
    const shrinkW = nTraded / (nTraded + shrinkageK);
    const rawMean = nTraded > 0 ? bucket!.res.reduce((a, b) => a + b, 0) / nTraded : 0;
    const shrunk = shrinkW * rawMean;
    const medRatio = bucket ? roundTo(medianOf([...bucket.ratios].sort((a, b) => a - b)), 3) : null;
    sectorStats[cat] = {
      category: cat,
      traded_count: nTraded,
      pre_token_count: preCatCounts.get(cat) ?? 0,
      shrink_weight: roundTo(shrinkW, 3),
      raw_mean_log_residual: roundTo(rawMean, 4),
      shrunk_log_residual: roundTo(shrunk, 4),
      median_mcap_tvl: medRatio,
      effective_mult: roundTo(10 ** shrunk, 3),
    };
  }

  return {
    n_traded: traded.length,
    median_traded_age_days: medianTradedAge,
    shrinkage_k: shrinkageK,
    intercept: roundTo(betaCore[0]!, 4),
    beta_tvl: roundTo(betaCore[1]!, 4),
    beta_chains: roundTo(betaCore[2]!, 4),
    four_factor_ols: {
      intercept: roundTo(betaFull[0]!, 4),
      beta_tvl: roundTo(betaFull[1]!, 4),
      beta_vel: roundTo(betaFull[2]!, 4),
      beta_age: roundTo(betaFull[3]!, 4),
      beta_chains: roundTo(betaFull[4]!, 4),
      loocv_r2: roundTo(1 - ssResFull / ssTot, 4),
    },
    loocv_r2: roundTo(1 - ssResCore / ssTot, 4),
    loocv_med_abs_log10: roundTo(medAbsLog, 4),
    loocv_mdape_pct: roundTo(mdapePct, 1),
    residual_q25_log10: roundTo(q25Res, 4),
    residual_q75_log10: roundTo(q75Res, 4),
    sectorStats,
  };
}

/**
 * Computes empirical comps valuation + pre-token momentum/age tilt + P25-P75 LOOCV band + triage tier.
 */
export function computeImpliedValuation(
  p: SnapshotProtocol,
  model: CompsRegressionModel,
  asOf: string,
  floorUsd: number,
  inWatchlist: boolean,
): { valuation: ValuationBreakdown; tier: TriageTier; tierReason: string } {
  const cat = p.category || 'Uncategorized';
  const stat = model.sectorStats[cat];
  const ebLog = stat ? stat.shrunk_log_residual : 0;
  const shrinkW = stat ? stat.shrink_weight : 0;
  const sectorTradedN = stat ? stat.traded_count : 0;
  const ebMult = 10 ** ebLog;

  const chainCount = Math.max(1, p.chains.length);
  const logBaseOnly = model.intercept + model.beta_tvl * Math.log10(p.tvl_usd);
  const logChainLift = model.beta_chains * Math.log10(chainCount);
  const baseCompUsd = 10 ** (logBaseOnly + logChainLift + ebLog);

  const ch7 = p.change_7d ?? 0;
  const velocityMult = 1 + clamp((ch7 / 100) * 0.4, -0.22, 0.38);
  const ageDays = computeAgeDays(asOf, p.listed_at, 180);
  const ageMult = 0.86 + Math.min(0.28, Math.log10(ageDays + 30) * 0.09);

  const rawImplied = baseCompUsd * velocityMult * ageMult;
  const p25Usd = Math.max(1, Math.round(rawImplied * 10 ** model.residual_q25_log10));
  const p75Usd = Math.max(p25Usd + 1, Math.round(rawImplied * 10 ** model.residual_q75_log10));

  let tier: TriageTier = 'Monitor';
  let tierReason = 'Mid-stage target pending stronger TVL velocity or multi-chain catalyst';

  if (ch7 < -15) {
    tier = 'Thin / Skip';
    tierReason = `7d TVL outflow (${ch7.toFixed(1)}%) indicates mercenary exit; cap size or wait for inflow stabilization`;
  } else if (p.tvl_usd < 10_000_000) {
    tier = 'Thin / Skip';
    tierReason = `Sub-$10M TVL ($${(p.tvl_usd / 1e6).toFixed(1)}M) carries pool depth & slippage risk; micro-farm only`;
  } else if (p.tvl_usd >= floorUsd && (inWatchlist || chainCount >= 2 || p.tvl_usd >= 100_000_000)) {
    tier = 'Prime Target';
    tierReason = inWatchlist
      ? 'Watchlist-verified pre-token leader above $50M floor with strong liquidity depth'
      : 'Institutional-scale ($50M+ TVL) pre-token module with deep liquidity comps';
  } else if (p.tvl_usd < floorUsd && p.tvl_usd >= 12_000_000 && ch7 > -10) {
    tier = 'Early Alpha (<$50M)';
    tierReason = `Below $50M watchlist radar ($${(p.tvl_usd / 1e6).toFixed(1)}M TVL) with healthy retention (${ch7 >= 0 ? '+' : ''}${ch7.toFixed(1)}% 7d)`;
  }

  return {
    valuation: {
      tvl_usd: p.tvl_usd,
      base_comp_usd: Math.round(baseCompUsd),
      eb_sector_log10: roundTo(ebLog, 4),
      eb_sector_mult: roundTo(ebMult, 3),
      eb_shrink_weight: shrinkW,
      sector_traded_n: sectorTradedN,
      chain_mult: roundTo(10 ** logChainLift, 3),
      velocity_mult: roundTo(velocityMult, 3),
      age_days: ageDays,
      age_mult: roundTo(ageMult, 3),
      raw_implied_usd: Math.round(rawImplied),
      p25_usd: p25Usd,
      p75_usd: p75Usd,
      live_sector_median_ratio: stat ? stat.median_mcap_tvl : null,
    },
    tier,
    tierReason,
  };
}

function getCalibratedTicketUsd(tvlUsd: number, tier: TriageTier): number {
  if (tier === 'Thin / Skip') return tvlUsd < 10_000_000 ? 150 : 250;
  if (tvlUsd >= 500_000_000) return 2500;
  if (tvlUsd >= 100_000_000) return 1000;
  if (tvlUsd >= 25_000_000) return 500;
  return 250;
}

/**
 * Builds concrete, chain-gas-calibrated, TVL-sized, timed farm plans with 90-day carry cost
 * and break-even FDV math, plus explicit skip/caution gates for thin or bleeding protocols.
 */
export function buildCostedFarmPlan(
  p: SnapshotProtocol,
  valuation: ValuationBreakdown,
  tier: TriageTier,
  tierReason: string,
  sortedChains: string[],
): FarmPlanSummary {
  const cat = p.category || 'DeFi';
  const primaryChain = sortedChains[0] ?? 'Ethereum';
  const secondaryChain = sortedChains[1] ?? primaryChain;
  const fee1 = getChainFeeProfile(primaryChain);
  const fee2 = getChainFeeProfile(secondaryChain);

  const ticketUsd = getCalibratedTicketUsd(p.tvl_usd, tier);
  const ticketLabel = `$${ticketUsd.toLocaleString('en-US')}`;
  const isCrossChain = sortedChains.length >= 2 && secondaryChain !== primaryChain;
  const setupGas = roundTo(fee1.txGasUsd * 2 + (isCrossChain ? fee2.bridgeUsd + fee2.txGasUsd : 0), 2);
  const cadenceCycles90d = tier === 'Thin / Skip' ? 4 : 6; // bi-weekly or 3-week checks
  const carry90d = roundTo(cadenceCycles90d * fee1.txGasUsd + fee1.txGasUsd, 2);
  const totalCost90d = roundTo(setupGas + carry90d, 2);

  // Conservative break-even FDV assuming 5% community pool pro-rata on TVL (capped 0.5x-2.0x boost)
  const userPoolShare = ticketUsd / Math.max(1_000_000, p.tvl_usd);
  const estRewardShare = userPoolShare * 0.05;
  const breakevenFdvUsd = Math.round(totalCost90d / Math.max(1e-8, estRewardShare));

  let step1Desc = `Deposit ${ticketLabel} core liquidity into ${p.name}'s deepest ${cat} pool on ${primaryChain} (${((ticketUsd / p.tvl_usd) * 100).toFixed(4)}% pool share) and confirm wallet tracking`;
  let step2Desc = `Execute bi-weekly organic rebalances or swap volume on ${p.name} (${secondaryChain}) to build multi-epoch consistency without wash flags`;
  let cadence = 'Bi-weekly rebalance (10 min setup, 5 min/2wk)';

  if (cat === 'Risk Curators' || cat === 'Onchain Capital Allocator' || cat === 'Yield' || cat === 'Yield Aggregator') {
    step1Desc = `Allocate ${ticketLabel} USDC or ETH LST into ${p.name}'s audited flagship vault on ${primaryChain}, verifying curator fee caps and withdrawal queue`;
    step2Desc = isCrossChain
      ? `Split 30% (${`$${Math.round(ticketUsd * 0.3)}`}) into ${p.name}'s ${secondaryChain} vault to qualify cross-chain curator epoch multipliers`
      : `Compound or roll vault receipt tokens into a secondary ${p.name} ${primaryChain} strategy after 30 days to establish duration weight`;
  } else if (cat === 'Derivatives' || cat === 'Prediction Market' || cat === 'Options Vault' || cat === 'Options') {
    step1Desc = `Seed ${ticketLabel} margin on ${p.name} (${primaryChain}) and place 5+ resting limit maker orders weekly to earn OI and maker fee rebates`;
    step2Desc = `Maintain delta-neutral hedges across 2 active ${p.name} markets on ${secondaryChain} over 6 consecutive weekly funding epochs`;
    cadence = 'Weekly maker cycle (12 min setup, 6 min/wk)';
  } else if (cat === 'Dexs' || cat === 'Liquidity Manager') {
    step1Desc = `Provide ${ticketLabel} concentrated LP in a +/-2% blue-chip or stable pair on ${p.name} (${primaryChain}) to capture fee APR plus epoch points`;
    step2Desc = `Rebalance out-of-range ticks and route $400+ organic swaps across ${p.name} pools on ${secondaryChain} every 14 days`;
  } else if (cat === 'Lending' || cat === 'Uncollateralized Lending' || cat === 'CDP' || cat === 'CDP Manager' || cat === 'Collateral Markets') {
    step1Desc = `Supply ${ticketLabel} collateral to ${p.name} on ${primaryChain} and borrow stablecoins at <= 45% LTV (health factor > 1.85) for two-sided points`;
    step2Desc = `Monitor oracle buffer weekly and deploy borrowed liquidity into ${p.name}'s ${secondaryChain} isolated vault or stability pool`;
  } else if (cat === 'RWA' || cat === 'Basis Trading' || cat === 'CeDeFi' || cat === 'Payments') {
    step1Desc = `Mint ${ticketLabel} yield-bearing receipt tokens on ${p.name} (${primaryChain}) in a single clean wallet and verify T+1 settlement rules`;
    step2Desc = `Hold uninterrupted balance across 3 consecutive monthly NAV settlement dates on ${secondaryChain} without early redemption`;
    cadence = 'Monthly NAV epoch (10 min setup, 3 min/mo)';
  } else if (cat === 'Restaking' || cat === 'Staking Pool' || cat === 'Stablecoin Wrapper') {
    step1Desc = `Delegate ${ticketLabel} native collateral via ${p.name} on ${primaryChain} to top-uptime operators with clean slashing records`;
    step2Desc = `Deploy minted ${p.name} receipt token into a whitelisted ${secondaryChain} lending pool for stacked points without leverage loops`;
  }

  const steps: FarmStepMeta[] = [];
  if (tier === 'Thin / Skip') {
    steps.push({
      text: `CAUTION / SKIP GATE: ${tierReason}. Keep cap <= ${ticketLabel} and require 2 positive weekly TVL snapshots before scaling. (Cost: $0.00 gate | Time: 3 min pre-check)`,
      cost: '$0.00 gate',
      time: '3 min pre-check',
      gas_usd: 0,
    });
  }

  const s1Gas = roundTo(fee1.txGasUsd * 2, 2);
  const s2Gas = roundTo(isCrossChain ? fee2.bridgeUsd + fee2.txGasUsd : fee1.txGasUsd, 2);
  const s3Gas = roundTo(fee1.txGasUsd, 2);

  steps.push({
    text: `${step1Desc}. (Cost: $${s1Gas.toFixed(2)} gas + ${ticketLabel} capital | Time: 10 min setup)`,
    cost: `$${s1Gas.toFixed(2)} gas · ${ticketLabel}`,
    time: '10 min setup',
    gas_usd: s1Gas,
  });

  steps.push({
    text: `${step2Desc}. (Cost: $${s2Gas.toFixed(2)} ${isCrossChain ? 'bridge+gas' : 'gas'} | Time: 6 min bi-weekly)`,
    cost: `$${s2Gas.toFixed(2)} ${isCrossChain ? 'bridge+gas' : 'gas'}`,
    time: '6 min bi-weekly',
    gas_usd: s2Gas,
  });

  const beLabel =
    breakevenFdvUsd >= 1e9
      ? `$${(breakevenFdvUsd / 1e9).toFixed(2)}B`
      : `$${(breakevenFdvUsd / 1e6).toFixed(1)}M`;
  steps.push({
    text: `Hold active ${p.name} receipts for 90 days across weekly snapshots (tracked ${valuation.age_days}d pre-token); break-even TGE FDV ~${beLabel} at 5% pool. (Cost: $${carry90d.toFixed(2)} 90d carry | Time: 2 min/wk check)`,
    cost: `$${carry90d.toFixed(2)} 90d carry`,
    time: '2 min/wk check',
    gas_usd: carry90d,
  });

  if (tier !== 'Thin / Skip') {
    const thirdChain = sortedChains[2];
    if (thirdChain && thirdChain !== secondaryChain) {
      const fee3 = getChainFeeProfile(thirdChain);
      const s4Gas = roundTo(fee3.bridgeUsd + fee3.txGasUsd, 2);
      steps.push({
        text: `Optional multi-chain breadth: bridge $150 into ${p.name} on ${thirdChain} and execute 1 qualifying deposit before governance snapshot. (Cost: $${s4Gas.toFixed(2)} bridge+gas | Time: 6 min one-time)`,
        cost: `$${s4Gas.toFixed(2)} bridge+gas`,
        time: '6 min one-time',
        gas_usd: s4Gas,
      });
    } else {
      steps.push({
        text: `Verify ${p.name} epoch badge claims and revoke stale token approvals after 90-day TGE window on ${primaryChain}. (Cost: $${s3Gas.toFixed(2)} exit gas | Time: 4 min exit)`,
        cost: `$${s3Gas.toFixed(2)} exit gas`,
        time: '4 min exit',
        gas_usd: s3Gas,
      });
    }
  }

  return {
    ticket_usd: ticketUsd,
    setup_gas_usd: setupGas,
    carry_90d_usd: carry90d,
    total_cost_90d_usd: totalCost90d,
    breakeven_fdv_usd: breakevenFdvUsd,
    cadence,
    steps,
  };
}

export function buildRadarPayload(snapshot: Snapshot): RadarPayload {
  const watchlistSet = new Set(snapshot.watchlist);
  const preTokenAll = snapshot.protocols.filter(
    (p) => !p.gecko_id && !p.symbol && !p.mcap_usd,
  );
  const tradedComps = snapshot.protocols.filter(
    (p) => Boolean(p.gecko_id) && Boolean(p.symbol) && (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0,
  );

  // Clean pre-token universe: 100% of watchlist + non-watchlist pre-token excluding CEX/bridges/LST/versioned/wrapped
  const preTokenClean = preTokenAll.filter(
    (p) =>
      watchlistSet.has(p.slug) ||
      (!(p.category && EXCLUDED_PRE_CATEGORIES.has(p.category)) &&
        !EXCHANGE_NAME_RE.test(p.name) &&
        !WRAPPED_STAKED_RE.test(p.name) &&
        !VERSION_SUFFIX_RE.test(p.name)),
  );

  const modelStats = fitCompsRegression(tradedComps, snapshot.as_of, preTokenClean);

  const scored = preTokenClean
    .map((p) => {
      const inWatchlist = watchlistSet.has(p.slug);
      const sortedChains = sortChainsByLiquidity(p.chains);
      const { valuation, tier, tierReason } = computeImpliedValuation(
        p,
        modelStats,
        snapshot.as_of,
        snapshot.floor_usd,
        inWatchlist,
      );
      const plan = buildCostedFarmPlan(p, valuation, tier, tierReason, sortedChains);
      return {
        protocol: p,
        catName: p.category || 'Uncategorized',
        sortedChains,
        inWatchlist,
        tier,
        tierReason,
        valuation,
        plan,
      };
    })
    .sort(
      (a, b) =>
        b.valuation.raw_implied_usd - a.valuation.raw_implied_usd ||
        a.protocol.slug.localeCompare(b.protocol.slug),
    );

  // Guarantee strict monotonic descending integer implied_value_usd across ranks 1..N
  let prevVal = Number.POSITIVE_INFINITY;
  const rows: RadarRow[] = scored.map((item, idx) => {
    let val = Math.max(1, item.valuation.raw_implied_usd);
    if (val >= prevVal) {
      val = Math.max(1, prevVal - 1);
    }
    prevVal = val;

    const p = item.protocol;
    return {
      rank: idx + 1,
      slug: p.slug,
      name: p.name,
      category: item.catName,
      chains: item.sortedChains,
      primary_chain: item.sortedChains[0]!,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      in_watchlist: item.inWatchlist,
      tier: item.tier,
      tier_reason: item.tierReason,
      implied_value_usd: val,
      p25_usd: item.valuation.p25_usd,
      p75_usd: item.valuation.p75_usd,
      est_gas_usd: item.plan.setup_gas_usd,
      est_cost_90d_usd: item.plan.total_cost_90d_usd,
      ticket_usd: item.plan.ticket_usd,
      breakeven_fdv_usd: item.plan.breakeven_fdv_usd,
      age_days: item.valuation.age_days,
      valuation: item.valuation,
      farm_steps: item.plan.steps.map((s) => s.text),
      step_meta: item.plan.steps,
    };
  });

  const liveTokens: LiveTokenBenchmark[] = tradedComps
    .slice()
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || a.slug.localeCompare(b.slug))
    .map((p, idx) => {
      const cat = p.category || 'Uncategorized';
      const ebLog = modelStats.sectorStats[cat]?.shrunk_log_residual ?? 0;
      const logPred =
        modelStats.intercept +
        modelStats.beta_tvl * Math.log10(p.tvl_usd) +
        modelStats.beta_chains * Math.log10(Math.max(1, p.chains.length)) +
        ebLog;
      const predUsd = Math.round(10 ** logPred);
      const residual = roundTo(Math.log10(p.mcap_usd!) - logPred, 3);
      return {
        rank: idx + 1,
        slug: p.slug,
        name: p.name,
        symbol: p.symbol!,
        category: cat,
        chains: sortChainsByLiquidity(p.chains),
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd!,
        mcap_to_tvl: p.tvl_usd > 0 ? roundTo(p.mcap_usd! / p.tvl_usd, 3) : null,
        model_pred_usd: predUsd,
        residual_log10: residual,
        change_7d: p.change_7d,
        listed_at: p.listed_at,
      };
    });

  const catCounts = new Map<string, number>();
  const chainCounts = new Map<string, number>();
  const sectorMedians: Record<string, number> = {};
  for (const [k, st] of Object.entries(modelStats.sectorStats)) {
    if (st.median_mcap_tvl !== null) sectorMedians[k] = st.median_mcap_tvl;
  }

  let aggImplied = 0;
  let aggP25 = 0;
  let aggP75 = 0;
  let aggTvl = 0;
  let watchlistCovered = 0;
  let earlyAlphaCount = 0;
  let primeCount = 0;
  let skipCount = 0;

  for (const r of rows) {
    aggImplied += r.implied_value_usd;
    aggP25 += r.p25_usd;
    aggP75 += r.p75_usd;
    aggTvl += r.tvl_usd;
    if (r.in_watchlist) watchlistCovered++;
    if (r.tier === 'Early Alpha (<$50M)') earlyAlphaCount++;
    if (r.tier === 'Prime Target') primeCount++;
    if (r.tier === 'Thin / Skip') skipCount++;
    catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
    for (const c of r.chains) {
      chainCounts.set(c, (chainCounts.get(c) ?? 0) + 1);
    }
  }

  return {
    summary: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      total_snapshot_protocols: snapshot.protocols.length,
      pre_token_universe_count: preTokenAll.length,
      watchlist_total: snapshot.watchlist.length,
      watchlist_covered: watchlistCovered,
      early_alpha_count: earlyAlphaCount,
      prime_count: primeCount,
      skip_count: skipCount,
      live_benchmark_count: liveTokens.length,
      aggregate_implied_usd: aggImplied,
      aggregate_p25_usd: aggP25,
      aggregate_p75_usd: aggP75,
      aggregate_tvl_usd: aggTvl,
      top_categories: [...catCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count })),
      top_chains: [...chainCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count })),
    },
    modelStats,
    rows,
    liveTokens,
    sectorMedians,
  };
}
