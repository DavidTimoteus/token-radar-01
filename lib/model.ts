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

export interface ValuationBreakdown {
  tvl_usd: number;
  sector_mult: number;
  velocity_mult: number;
  age_days: number;
  age_mult: number;
  chain_mult: number;
  raw_implied_usd: number;
  live_sector_median_ratio: number | null;
}

export interface FarmStepMeta {
  text: string;
  cost: string;
  time: string;
  gas_usd: number;
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
  implied_value_usd: number;
  est_gas_usd: number;
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
  live_benchmark_count: number;
  aggregate_implied_usd: number;
  aggregate_tvl_usd: number;
  top_categories: Array<{ name: string; count: number }>;
  top_chains: Array<{ name: string; count: number }>;
}

export interface RadarPayload {
  summary: RadarSummary;
  rows: RadarRow[];
  liveTokens: LiveTokenBenchmark[];
  sectorMedians: Record<string, number>;
}

const SECTOR_MULTIPLES: Record<string, number> = {
  'Derivatives': 0.36,
  'Prediction Market': 0.36,
  'Options Vault': 0.36,
  'Options': 0.36,
  'Dexs': 0.34,
  'Cross Chain Bridge': 0.34,
  'Chain': 0.34,
  'Privacy': 0.34,
  'Collateral Markets': 0.34,
  'Lending': 0.32,
  'Uncollateralized Lending': 0.32,
  'RWA': 0.32,
  'Interest Rate Derivatives': 0.32,
  'CDP': 0.30,
  'CDP Manager': 0.30,
  'Basis Trading': 0.30,
  'Indexes': 0.30,
  'Payments': 0.30,
  'Insurance': 0.30,
  'Risk Curators': 0.28,
  'Onchain Capital Allocator': 0.28,
  'Yield': 0.28,
  'Yield Aggregator': 0.28,
  'Leveraged Farming': 0.28,
  'Governance Incentives': 0.28,
  'Restaking': 0.25,
  'Liquidity Manager': 0.25,
  'CeDeFi': 0.25,
  'Farm': 0.25,
  'OTC Marketplace': 0.25,
  'Crypto Card Issuer': 0.25,
  'Dual-Token Stablecoin': 0.22,
  'Stablecoin Wrapper': 0.22,
  'Decentralized BTC': 0.22,
  'Anchor BTC': 0.22,
  'Liquid Staking': 0.20,
  'Liquid Restaking': 0.20,
  'Restaked BTC': 0.20,
  'Staking Pool': 0.20,
};

const EXCLUDED_NON_WATCHLIST_CATS = new Set(['CEX', 'Bridge', 'Canonical Bridge']);
const EXCHANGE_NAME_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const WRAPPED_STAKED_RE = /\b(wrapped|staked)\b/i;

const ULTRA_LOW_GAS_CHAINS = new Set([
  'Solana', 'Sui', 'Aptos', 'TON', 'Stellar', 'Ripple', 'Tron',
  'Bittensor', 'Cardano', 'Near', 'Algorand', 'XRPL EVM',
]);

const MID_L1_GAS_CHAINS = new Set([
  'Bitcoin', 'CORE', 'Babylon Genesis', 'BSquared', 'Litecoin', 'Doge',
]);

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function getSectorMult(category: string | null): number {
  if (!category) return 0.24;
  return SECTOR_MULTIPLES[category] ?? 0.24;
}

function getChainGasUsd(chain: string): number {
  if (chain === 'Ethereum') return 9.50;
  if (ULTRA_LOW_GAS_CHAINS.has(chain)) return 0.03;
  if (MID_L1_GAS_CHAINS.has(chain)) return 2.40;
  return 0.28;
}

function formatGasTag(gas: number): string {
  return `$${gas.toFixed(2)}`;
}

function getCapitalTier(tvlUsd: number): string {
  if (tvlUsd >= 500_000_000) return '$2,500+';
  if (tvlUsd >= 100_000_000) return '$1,000+';
  if (tvlUsd >= 25_000_000) return '$500+';
  return '$250+';
}

function computeAgeDays(asOf: string, listedAt: string | null): number {
  if (!listedAt) return 180;
  const end = Date.parse(asOf);
  const start = Date.parse(listedAt);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return 180;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function buildCategoryBenchmarkMedians(live: SnapshotProtocol[]): Record<string, number> {
  const buckets = new Map<string, number[]>();
  for (const p of live) {
    if (!p.tvl_usd || p.tvl_usd <= 0 || !p.mcap_usd) continue;
    const cat = p.category || 'Uncategorized';
    const arr = buckets.get(cat) ?? [];
    arr.push(p.mcap_usd / p.tvl_usd);
    buckets.set(cat, arr);
  }
  const medians: Record<string, number> = {};
  for (const cat of [...buckets.keys()].sort()) {
    const arr = buckets.get(cat)!.slice().sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    const med = arr.length % 2 === 1 ? arr[mid]! : (arr[mid - 1]! + arr[mid]!) / 2;
    medians[cat] = roundTo(med, 3);
  }
  return medians;
}

function buildFarmSteps(p: SnapshotProtocol, ageDays: number): FarmStepMeta[] {
  const cat = p.category || 'DeFi';
  const primaryChain = p.chains[0] || 'Ethereum';
  const secondaryChain = p.chains[1] || primaryChain;
  const gas1 = getChainGasUsd(primaryChain);
  const gas2 = getChainGasUsd(secondaryChain);
  const capTier = getCapitalTier(p.tvl_usd);
  const gasStr1 = formatGasTag(gas1);
  const gasStr2 = formatGasTag(gas2);

  let coreAction = `Supply ${capTier} core collateral into ${p.name}'s highest-TVL ${cat} pool on ${primaryChain} and enable receipt tracking`;
  let secondaryAction = `Execute 2+ weekly rebalance or swap cycles on ${p.name} via ${secondaryChain} to build multi-epoch volume consistency`;
  let durationAction = `Hold active ${p.name} vault receipts across 4+ consecutive weekly snapshots (tracked ${ageDays}d without a recorded token)`;

  if (cat === 'Risk Curators' || cat === 'Onchain Capital Allocator' || cat === 'Yield' || cat === 'Yield Aggregator') {
    coreAction = `Deposit ${capTier} USDC or LST into ${p.name}'s flagship curated vault on ${primaryChain} to accrue points and fee-share weight`;
    secondaryAction = `Split 25% of allocation across ${secondaryChain} strategy vaults on ${p.name} to capture multi-chain curator multipliers`;
  } else if (cat === 'Derivatives' || cat === 'Prediction Market' || cat === 'Options Vault' || cat === 'Options') {
    coreAction = `Seed ${capTier} margin on ${p.name} (${primaryChain}) and route 5+ limit maker orders weekly to accumulate OI and fee rebates`;
    secondaryAction = `Provide LP liquidity or market-make across two active ${p.name} markets on ${secondaryChain} over 14+ days`;
  } else if (cat === 'Dexs' || cat === 'Liquidity Manager') {
    coreAction = `Provide ${capTier} concentrated liquidity in a tight-range blue-chip pair on ${p.name} (${primaryChain}) for fee & epoch points`;
    secondaryAction = `Route weekly spot swaps >= $500 across ${p.name} pools on ${secondaryChain} to qualify active trader tiers`;
  } else if (cat === 'Lending' || cat === 'Uncollateralized Lending' || cat === 'CDP' || cat === 'CDP Manager' || cat === 'Collateral Markets') {
    coreAction = `Supply ${capTier} collateral to ${p.name} on ${primaryChain} and borrow at <= 45% LTV to unlock both supply and borrow incentives`;
    secondaryAction = `Loop or diversify collateral across ${p.name}'s ${secondaryChain} isolated markets while keeping health factor > 1.8`;
  } else if (cat === 'RWA' || cat === 'Basis Trading' || cat === 'CeDeFi' || cat === 'Payments') {
    coreAction = `Mint or hold ${capTier} yield-bearing receipt tokens on ${p.name} (${primaryChain}) inside a non-custodial wallet`;
    secondaryAction = `Maintain uninterrupted ${p.name} balance through monthly settlement epochs on ${secondaryChain} without premature redemption`;
  } else if (cat === 'Restaking' || cat === 'Liquid Restaking' || cat === 'Liquid Staking' || cat === 'Restaked BTC' || cat === 'Staking Pool') {
    coreAction = `Stake ${capTier} native LST/BTC collateral through ${p.name} on ${primaryChain} and delegate to active AVS/validator operators`;
    secondaryAction = `Deploy minted ${p.name} receipt asset into a whitelisted ${secondaryChain} DeFi collateral pool for stacked multiplier points`;
  }

  const step1Text = `${coreAction}. (Cost: ${gasStr1} gas + ${capTier} capital | Time: 10 min setup; 5 min weekly)`;
  const step2Text = `${secondaryAction}. (Cost: ${gasStr2} gas | Time: 8 min setup; 5 min weekly)`;
  const step3Text = `${durationAction}. (Cost: $0.00 hold; ${gasStr1} exit gas | Time: 2 min weekly check)`;
  const step4Text = `Verify ${p.name} on-chain activity across ${p.chains.length} tracked chain${p.chains.length === 1 ? '' : 's'} and claim epoch badges before TGE snapshot. (Cost: ${gasStr1} gas | Time: 5 min biweekly)`;

  const steps: FarmStepMeta[] = [
    { text: step1Text, cost: `${gasStr1} gas · ${capTier}`, time: '10 min setup; 5 min weekly', gas_usd: gas1 },
    { text: step2Text, cost: `${gasStr2} gas`, time: '8 min setup; 5 min weekly', gas_usd: gas2 },
    { text: step3Text, cost: `$0.00 hold · ${gasStr1} exit`, time: '2 min weekly check', gas_usd: 0 },
    { text: step4Text, cost: `${gasStr1} claim gas`, time: '5 min biweekly', gas_usd: gas1 },
  ];

  if (p.chains.length >= 3) {
    const thirdChain = p.chains[2]!;
    const gas3 = getChainGasUsd(thirdChain);
    const gasStr3 = formatGasTag(gas3);
    steps.push({
      text: `Bridge a micro-position ($100+) into ${p.name} on ${thirdChain} to lock 3-chain breadth eligibility before governance snapshot. (Cost: ${gasStr3} gas | Time: 6 min one-time)`,
      cost: `${gasStr3} gas`,
      time: '6 min one-time',
      gas_usd: gas3,
    });
  }

  return steps;
}

export function buildRadarPayload(snapshot: Snapshot): RadarPayload {
  const watchlistSet = new Set(snapshot.watchlist);
  const preTokenAll = snapshot.protocols.filter(
    (p) => !p.gecko_id && !p.symbol && !p.mcap_usd,
  );
  const liveAll = snapshot.protocols.filter(
    (p) => Boolean(p.gecko_id) && Boolean(p.symbol) && (p.mcap_usd ?? 0) > 0,
  );

  const sectorMedians = buildCategoryBenchmarkMedians(liveAll);

  const scoreProtocol = (p: SnapshotProtocol) => {
    const sectorMult = getSectorMult(p.category);
    const ch7 = p.change_7d ?? 0;
    const velocityMult = 1 + Math.max(-0.35, Math.min(1.5, (ch7 / 100) * 0.45));
    const ageDays = computeAgeDays(snapshot.as_of, p.listed_at);
    const ageMult = 0.76 + Math.min(0.64, Math.log10(ageDays + 10) * 0.24);
    const chainCount = Math.max(1, p.chains.length);
    const chainMult = 1 + Math.min(0.24, (chainCount - 1) * 0.03);
    const rawImplied = p.tvl_usd * sectorMult * velocityMult * ageMult * chainMult;
    const roundedImplied = Math.max(1, Math.round(rawImplied));
    const catName = p.category || 'Uncategorized';
    const stepMeta = buildFarmSteps(p, ageDays);
    const estGasUsd = roundTo(
      stepMeta.reduce((acc, s) => acc + s.gas_usd, 0),
      2,
    );

    return {
      protocol: p,
      catName,
      ageDays,
      sectorMult,
      velocityMult: roundTo(velocityMult, 4),
      ageMult: roundTo(ageMult, 4),
      chainMult: roundTo(chainMult, 4),
      rawImplied,
      impliedValueUsd: roundedImplied,
      estGasUsd,
      stepMeta,
    };
  };

  const watchlistEntries = preTokenAll
    .filter((p) => watchlistSet.has(p.slug))
    .map(scoreProtocol);

  const nonWatchlistPool = preTokenAll
    .filter(
      (p) =>
        !watchlistSet.has(p.slug) &&
        !(p.category && EXCLUDED_NON_WATCHLIST_CATS.has(p.category)) &&
        !EXCHANGE_NAME_RE.test(p.name) &&
        !WRAPPED_STAKED_RE.test(p.name),
    )
    .map(scoreProtocol)
    .sort((a, b) => b.impliedValueUsd - a.impliedValueUsd || a.protocol.slug.localeCompare(b.protocol.slug))
    .slice(0, 200);

  const combined = [...watchlistEntries, ...nonWatchlistPool].sort(
    (a, b) => b.impliedValueUsd - a.impliedValueUsd || a.protocol.slug.localeCompare(b.protocol.slug),
  );

  // Enforce strictly descending implied_value_usd for unambiguous ranks 1..N
  let prevVal = Number.POSITIVE_INFINITY;
  const rows: RadarRow[] = combined.map((item, idx) => {
    let val = item.impliedValueUsd;
    if (val >= prevVal) {
      val = Math.max(1, prevVal - 1);
    }
    prevVal = val;

    const p = item.protocol;
    const chains = p.chains.length > 0 ? p.chains : ['Ethereum'];
    return {
      rank: idx + 1,
      slug: p.slug,
      name: p.name,
      category: item.catName,
      chains,
      primary_chain: chains[0]!,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      in_watchlist: watchlistSet.has(p.slug),
      implied_value_usd: val,
      est_gas_usd: item.estGasUsd,
      age_days: item.ageDays,
      valuation: {
        tvl_usd: p.tvl_usd,
        sector_mult: item.sectorMult,
        velocity_mult: item.velocityMult,
        age_days: item.ageDays,
        age_mult: item.ageMult,
        chain_mult: item.chainMult,
        raw_implied_usd: Math.round(item.rawImplied),
        live_sector_median_ratio: sectorMedians[item.catName] ?? null,
      },
      farm_steps: item.stepMeta.map((s) => s.text),
      step_meta: item.stepMeta,
    };
  });

  const liveTokens: LiveTokenBenchmark[] = liveAll
    .slice()
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || a.slug.localeCompare(b.slug))
    .slice(0, 30)
    .map((p, idx) => ({
      rank: idx + 1,
      slug: p.slug,
      name: p.name,
      symbol: p.symbol!,
      category: p.category || 'Uncategorized',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      mcap_to_tvl: p.tvl_usd > 0 ? roundTo(p.mcap_usd! / p.tvl_usd, 3) : null,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
    }));

  const catCounts = new Map<string, number>();
  const chainCounts = new Map<string, number>();
  let aggregateImplied = 0;
  let aggregateTvl = 0;
  let watchlistCovered = 0;

  for (const r of rows) {
    aggregateImplied += r.implied_value_usd;
    aggregateTvl += r.tvl_usd;
    if (r.in_watchlist) watchlistCovered++;
    catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
    for (const c of r.chains) {
      chainCounts.set(c, (chainCounts.get(c) ?? 0) + 1);
    }
  }

  const topCategories = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  const topChains = [...chainCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  return {
    summary: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      total_snapshot_protocols: snapshot.protocols.length,
      pre_token_universe_count: preTokenAll.length,
      watchlist_total: snapshot.watchlist.length,
      watchlist_covered: watchlistCovered,
      live_benchmark_count: liveTokens.length,
      aggregate_implied_usd: aggregateImplied,
      aggregate_tvl_usd: aggregateTvl,
      top_categories: topCategories,
      top_chains: topChains,
    },
    rows,
    liveTokens,
    sectorMedians,
  };
}
