/* Shared empirical size-curve valuation, LOOCV backtest, and dollar-netted farm economics */
(function (root) {
  const EXCLUDED_CATS = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
  const EXCH_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  const WRAP_RE = /\b(wrapped|staked|staking)\b/i;
  const VER_RE = /\s+(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;
  const CHAIN_ORDER = ['Ethereum', 'Arbitrum', 'Base', 'Optimism', 'Solana', 'Sui', 'Hyperliquid L1', 'Monad', 'Polygon', 'Avalanche', 'Binance', 'Mantle', 'Starknet', 'Linea', 'Scroll', 'Berachain', 'Sonic', 'Tron', 'Bitcoin', 'TON', 'Aptos', 'Sei', 'Unichain', 'Ink', 'Plasma', 'Plume Mainnet', 'Flare', 'Bittensor', 'Provenance', 'BSquared', 'Pharos', 'Ripple', 'Stellar'];
  const CHAIN_RANK = Object.fromEntries(CHAIN_ORDER.map((c, i) => [c, i + 1]));
  const ULTRA_LOW = new Set(['Solana', 'Sui', 'Aptos', 'TON', 'Stellar', 'Ripple', 'Tron', 'Bittensor', 'Near']);
  const LIQUID_L2 = new Set(['Arbitrum', 'Base', 'Optimism', 'Polygon', 'Avalanche', 'Monad', 'Hyperliquid L1', 'Binance', 'Mantle', 'Starknet', 'Linea', 'Scroll', 'Berachain', 'Sonic', 'Unichain', 'Ink']);
  const MID_L1 = new Set(['Bitcoin', 'CORE', 'Babylon Genesis', 'BSquared', 'Provenance']);

  const roundTo = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const medianOf = (arr) => {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const quantileOf = (sorted, q) => sorted.length ? sorted[clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1)] : 0;

  function spearmanRankCorr(xs, ys) {
    const rk = (a) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach((p, i) => { r[p[1]] = i + 1; }); return r; };
    const rx = rk(xs), ry = rk(ys), mx = rx.reduce((a, b) => a + b, 0) / Math.max(1, rx.length), my = ry.reduce((a, b) => a + b, 0) / Math.max(1, ry.length);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < rx.length; i++) { const a = rx[i] - mx, b = ry[i] - my; num += a * b; dx += a * a; dy += b * b; }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  }

  function sortChainsByLiquidity(chains) {
    return (chains && chains.length ? chains.slice() : ['Ethereum']).sort((a, b) => (CHAIN_RANK[a] ?? 999) - (CHAIN_RANK[b] ?? 999) || a.localeCompare(b));
  }

  function computeAgeDays(asOf, listedAt, fallback = 180) {
    if (!listedAt) return fallback;
    const end = Date.parse(asOf), start = Date.parse(listedAt);
    return Number.isFinite(end) && Number.isFinite(start) ? Math.max(1, Math.round((end - start) / 86400000)) : fallback;
  }

  function getChainFeeProfile(chain) {
    if (chain === 'Ethereum') return { txGas: 6.0, bridge: 9.0 };
    if (ULTRA_LOW.has(chain)) return { txGas: 0.03, bridge: 1.1 };
    if (MID_L1.has(chain)) return { txGas: 2.2, bridge: 4.0 };
    return { txGas: 0.22, bridge: 1.4 };
  }

  function solveWeightedRidge(X, y, w, ridge = 0.05) {
    const n = X.length, m = X[0].length;
    const XtWX = Array.from({ length: m }, () => new Array(m).fill(0)), XtWy = new Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) { XtWy[j] += w[i] * X[i][j] * y[i]; for (let k = 0; k < m; k++) XtWX[j][k] += w[i] * X[i][j] * X[i][k]; }
    }
    for (let j = 1; j < m; j++) XtWX[j][j] += ridge;
    const aug = XtWX.map((row, i) => [...row, XtWy[i]]);
    for (let i = 0; i < m; i++) {
      let piv = i;
      for (let r = i + 1; r < m; r++) if (Math.abs(aug[r][i]) > Math.abs(aug[piv][i])) piv = r;
      [aug[i], aug[piv]] = [aug[piv], aug[i]];
      const div = Math.abs(aug[i][i]) > 1e-12 ? aug[i][i] : 1e-12;
      for (let k = i; k <= m; k++) aug[i][k] /= div;
      for (let r = 0; r < m; r++) if (r !== i) { const f = aug[r][i]; for (let k = i; k <= m; k++) aug[r][k] -= f * aug[i][k]; }
    }
    return aug.map((r) => r[m]);
  }

  function fitHuberIRLS(X, y, delta = 1.345, iters = 16, ridge = 0.05) {
    let w = new Array(X.length).fill(1), b = solveWeightedRidge(X, y, w, ridge);
    for (let it = 0; it < iters; it++) {
      const res = y.map((yi, i) => yi - (b[0] + b[1] * X[i][1]));
      const cut = delta * (medianOf(res.map(Math.abs)) / 0.6745 || 0.5);
      w = res.map((r) => (Math.abs(r) <= cut ? 1 : cut / Math.abs(r)));
      b = solveWeightedRidge(X, y, w, ridge);
    }
    return b;
  }

  /** Filters traded snapshot records down to clean, deduped token-family comps (~93 protocols). */
  function cleanTradedComps(protocols) {
    const byGecko = new Map();
    for (const p of protocols) {
      if (!p.gecko_id || !p.symbol || !(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
      if ((p.category && EXCLUDED_CATS.has(p.category)) || EXCH_RE.test(p.name) || WRAP_RE.test(p.name)) continue;
      const k = p.gecko_id.toLowerCase();
      if (!byGecko.has(k) || p.tvl_usd > byGecko.get(k).tvl_usd) byGecko.set(k, p);
    }
    return [...byGecko.values()];
  }

  /** Runs exact Leave-One-Out Cross-Validation (LOOCV) on the clean token-family comps. */
  function evaluateLooBacktest(traded, shrinkageK = 8) {
    const X = traded.map((p) => [1, Math.log10(p.tvl_usd)]), y = traded.map((p) => Math.log10(p.mcap_usd));
    const preds = [], resids = [], absErrs = [];
    for (let i = 0; i < traded.length; i++) {
      const Xi = X.filter((_, idx) => idx !== i), yi = y.filter((_, idx) => idx !== i), ti = traded.filter((_, idx) => idx !== i);
      const b = fitHuberIRLS(Xi, yi, 1.345, 12, 0.05), catRes = new Map();
      for (let j = 0; j < ti.length; j++) {
        const c = ti[j].category || 'Uncategorized', r = clamp(yi[j] - (b[0] + b[1] * Xi[j][1]), -1, 1);
        if (!catRes.has(c)) catRes.set(c, []);
        catRes.get(c).push(r);
      }
      const arr = catRes.get(traded[i].category || 'Uncategorized') || [];
      const eb = arr.length ? (arr.length / (arr.length + shrinkageK)) * (arr.reduce((a, c) => a + c, 0) / arr.length) : 0;
      const pred = b[0] + b[1] * X[i][1] + eb;
      preds.push(pred); resids.push(y[i] - pred); absErrs.push(Math.abs(y[i] - pred));
    }
    const medAbs = medianOf(absErrs), sortedRes = resids.slice().sort((a, b) => a - b);
    return {
      oos_fold_err: roundTo(10 ** medAbs, 2),
      med_abs_log10: roundTo(medAbs, 4),
      spearman_rho: roundTo(spearmanRankCorr(preds, y), 3),
      residual_q25_log10: roundTo(quantileOf(sortedRes, 0.25), 4),
      residual_q75_log10: roundTo(quantileOf(sortedRes, 0.75), 4),
    };
  }

  /** Fits the Huber-IRLS power-law size curve + Empirical-Bayes category residuals + LOO backtest. */
  function fitSizeCurveComps(traded, preTokenClean, asOf) {
    const k = 8, X = traded.map((p) => [1, Math.log10(p.tvl_usd)]), y = traded.map((p) => Math.log10(p.mcap_usd));
    const beta = fitHuberIRLS(X, y), loo = evaluateLooBacktest(traded, k);
    const catBuckets = new Map(), preCounts = new Map();
    traded.forEach((p, i) => {
      const c = p.category || 'Uncategorized';
      if (!catBuckets.has(c)) catBuckets.set(c, { res: [], ratios: [] });
      catBuckets.get(c).res.push(clamp(y[i] - (beta[0] + beta[1] * X[i][1]), -1, 1));
      catBuckets.get(c).ratios.push(p.mcap_usd / p.tvl_usd);
    });
    preTokenClean.forEach((p) => { const c = p.category || 'Uncategorized'; preCounts.set(c, (preCounts.get(c) || 0) + 1); });

    const sectorStats = {};
    for (const c of new Set([...catBuckets.keys(), ...preCounts.keys()])) {
      const b = catBuckets.get(c), n = b ? b.res.length : 0, w = n / (n + k);
      const shrunk = n ? w * (b.res.reduce((a, v) => a + v, 0) / n) : 0;
      sectorStats[c] = { category: c, traded_count: n, pre_token_count: preCounts.get(c) || 0, shrink_weight: roundTo(w, 3), shrunk_log_residual: roundTo(shrunk, 4), median_mcap_tvl: b ? roundTo(medianOf(b.ratios), 3) : null, effective_mult: roundTo(10 ** shrunk, 3) };
    }
    return { n_traded: traded.length, shrinkage_k: k, intercept: roundTo(beta[0], 4), beta_tvl: roundTo(beta[1], 4), ...loo, as_of: asOf, sectorStats };
  }

  /** Scores a pre-token protocol using the size curve, EB sector lift, 7d velocity, and age without token. */
  function scorePreTokenProtocol(p, model, asOf) {
    const stat = model.sectorStats[p.category || 'Uncategorized'];
    const ebLog = stat ? stat.shrunk_log_residual : 0;
    const baseSizeUsd = 10 ** (model.intercept + model.beta_tvl * Math.log10(p.tvl_usd));
    const baseCompUsd = baseSizeUsd * (10 ** ebLog);
    const velocityMult = 1 + clamp(((p.change_7d ?? 0) / 100) * 0.4, -0.22, 0.38);
    const ageDays = computeAgeDays(asOf, p.listed_at, 180);
    const ageMult = 0.86 + Math.min(0.28, Math.log10(ageDays + 30) * 0.09);
    const rawImplied = baseCompUsd * velocityMult * ageMult;
    const p25 = Math.max(1, Math.round(rawImplied * (10 ** model.residual_q25_log10)));
    const p75 = Math.max(p25 + 1, Math.round(rawImplied * (10 ** model.residual_q75_log10)));
    return {
      tvl_usd: p.tvl_usd, base_size_usd: Math.round(baseSizeUsd), base_comp_usd: Math.round(baseCompUsd),
      eb_sector_log10: roundTo(ebLog, 4), eb_sector_mult: roundTo(10 ** ebLog, 3), eb_shrink_weight: stat ? stat.shrink_weight : 0,
      sector_traded_n: stat ? stat.traded_count : 0, velocity_mult: roundTo(velocityMult, 3), age_days: ageDays, age_mult: roundTo(ageMult, 3),
      raw_implied_usd: Math.round(rawImplied), p25_usd: p25, p75_usd: p75, live_sector_median_ratio: stat ? stat.median_mcap_tvl : null,
    };
  }

  /** Computes dollar-netted EV per $1,000 deployed at P25 low-end, FARM/THIN/SKIP verdict, and timed steps. */
  function computeNetFarmVerdict(p, valuation, sortedChains) {
    const cat = p.category || 'DeFi';
    const farmChain = sortedChains.find((c) => ULTRA_LOW.has(c)) || sortedChains.find((c) => LIQUID_L2.has(c)) || sortedChains[0] || 'Ethereum';
    const secChain = sortedChains.find((c) => c !== farmChain) || farmChain;
    const fee = getChainFeeProfile(farmChain);
    const setupGas = roundTo(fee.txGas * 2 + (farmChain !== 'Ethereum' ? fee.bridge : 0), 2);
    const totalCost90d = roundTo(setupGas + fee.txGas * 6, 2);
    const p25Per1k = roundTo(valuation.p25_usd * 0.05 * (1000 / Math.max(p.tvl_usd, 5e6)), 2);
    const netEvP25 = roundTo(p25Per1k - totalCost90d, 2);
    const ch7 = p.change_7d ?? 0;

    let verdict = 'THIN', reason = `Marginal P25 Net EV ($${netEvP25.toFixed(2)}/$1k) on ${farmChain}; needs median outcome or larger size`;
    if (ch7 < -15) { verdict = 'SKIP'; reason = `7d TVL outflow (${ch7.toFixed(1)}%) indicates mercenary exit; wait for inflows`; }
    else if (p.tvl_usd < 8e6) { verdict = 'SKIP'; reason = `Sub-$8M TVL ($${(p.tvl_usd / 1e6).toFixed(1)}M) carries high slippage & pool depth risk`; }
    else if (netEvP25 < -5) { verdict = 'SKIP'; reason = `Negative P25 Net EV ($${netEvP25.toFixed(2)}/$1k): ${farmChain} 90d cost ($${totalCost90d.toFixed(2)}) > P25 share ($${p25Per1k.toFixed(2)})`; }
    else if (netEvP25 >= 0) { verdict = 'FARM'; reason = `Positive P25 Net EV (+$${netEvP25.toFixed(2)}/$1k) via ${farmChain} with $${totalCost90d.toFixed(2)} 90d cost`; }

    const ticket = p.tvl_usd >= 25e6 ? 1000 : 500;
    const beFdvUsd = Math.round(totalCost90d / Math.max(1e-8, (1000 / Math.max(p.tvl_usd, 5e6)) * 0.05));
    const beLabel = beFdvUsd >= 1e9 ? `$${(beFdvUsd / 1e9).toFixed(2)}B` : `$${(beFdvUsd / 1e6).toFixed(1)}M`;

    let a1 = `Deploy $${ticket.toLocaleString('en-US')} liquidity into ${p.name}'s top ${cat} pool on ${farmChain} (${((ticket / p.tvl_usd) * 100).toFixed(4)}% share)`;
    let a2 = `Maintain organic bi-weekly activity on ${p.name} (${secChain}) across 6 snapshots`;
    if (/Curator|Allocator|Yield/.test(cat)) {
      a1 = `Deposit $${ticket.toLocaleString('en-US')} USDC or LST into ${p.name}'s curated vault on ${farmChain}`;
      a2 = `Roll vault receipt across ${secChain} or compound every 14 days for epoch duration weight`;
    } else if (/Derivatives|Prediction|Options/.test(cat)) {
      a1 = `Seed $${ticket.toLocaleString('en-US')} margin on ${p.name} (${farmChain}) and post 5+ weekly maker limit orders`;
      a2 = `Hold balanced OI across 2 active ${p.name} markets over 6 weekly funding epochs`;
    } else if (/Dexs|Liquidity/.test(cat)) {
      a1 = `Provide $${ticket.toLocaleString('en-US')} tight-range (+/-2%) LP on ${p.name} (${farmChain})`;
      a2 = `Rebalance out-of-range ticks and route organic swaps bi-weekly on ${secChain}`;
    } else if (/Lending|CDP|Collateral/.test(cat)) {
      a1 = `Supply $${ticket.toLocaleString('en-US')} collateral on ${p.name} (${farmChain}) and borrow at <=45% LTV (HF > 1.85)`;
      a2 = `Monitor oracle buffer weekly and deploy borrowed liquidity into ${p.name}'s ${secChain} pool`;
    } else if (/RWA|Basis|CeDeFi|Payments/.test(cat)) {
      a1 = `Mint $${ticket.toLocaleString('en-US')} yield-bearing receipt on ${p.name} (${farmChain}) in one clean wallet`;
      a2 = `Hold uninterrupted through 3 monthly settlement cycles without early redemption`;
    }

    const steps = [];
    if (verdict === 'SKIP') steps.push({ text: `SKIP GATE: ${reason}. Cap test size at $150 or defer. (Cost: $0.00 gate | Time: 3 min check)`, cost: '$0.00 gate', time: '3 min check', gas_usd: 0 });
    steps.push({ text: `${a1}. (Cost: $${setupGas.toFixed(2)} setup | Time: 10 min setup)`, cost: `$${setupGas.toFixed(2)} setup`, time: '10 min setup', gas_usd: setupGas });
    steps.push({ text: `${a2}. (Cost: $${(fee.txGas * 5).toFixed(2)} cycles | Time: 5 min bi-weekly)`, cost: `$${(fee.txGas * 5).toFixed(2)} cycles`, time: '5 min bi-weekly', gas_usd: roundTo(fee.txGas * 5, 2) });
    steps.push({ text: `Hold 90d (${valuation.age_days}d tracked); P25 $${p25Per1k.toFixed(2)}/$1k - $${totalCost90d.toFixed(2)} cost = $${netEvP25.toFixed(2)} Net EV (BE FDV ${beLabel}). (Cost: $${fee.txGas.toFixed(2)} exit | Time: 2 min/wk)`, cost: `$${fee.txGas.toFixed(2)} exit`, time: '2 min/wk', gas_usd: fee.txGas });
    if (steps.length < 4) steps.push({ text: `Claim ${p.name} epoch badges and revoke stale approvals on ${farmChain} post-snapshot. (Cost: $${fee.txGas.toFixed(2)} revoke | Time: 4 min exit)`, cost: `$${fee.txGas.toFixed(2)} revoke`, time: '4 min exit', gas_usd: fee.txGas });

    return { farm_chain: farmChain, verdict, verdict_reason: reason, p25_airdrop_usd_per_1k: p25Per1k, est_cost_90d_usd: totalCost90d, net_ev_p25_usd: netEvP25, breakeven_fdv_usd: beFdvUsd, steps };
  }

  function buildRadarPayload(snapshot) {
    const wlSet = new Set(snapshot.watchlist);
    const preAll = snapshot.protocols.filter((p) => !p.gecko_id && !p.symbol && !p.mcap_usd);
    const preClean = preAll.filter((p) => wlSet.has(p.slug) || (!(p.category && EXCLUDED_CATS.has(p.category)) && !EXCH_RE.test(p.name) && !WRAP_RE.test(p.name) && !VER_RE.test(p.name)));
    const tradedClean = cleanTradedComps(snapshot.protocols);
    const modelStats = fitSizeCurveComps(tradedClean, preClean, snapshot.as_of);

    const scored = preClean.map((p) => {
      const chains = sortChainsByLiquidity(p.chains);
      const valuation = scorePreTokenProtocol(p, modelStats, snapshot.as_of);
      const farm = computeNetFarmVerdict(p, valuation, chains);
      return { p, cat: p.category || 'Uncategorized', chains, inWl: wlSet.has(p.slug), valuation, farm };
    }).sort((a, b) => b.valuation.raw_implied_usd - a.valuation.raw_implied_usd || a.p.slug.localeCompare(b.p.slug));

    let prev = Infinity;
    const rows = scored.map((it, idx) => {
      let val = Math.max(1, it.valuation.raw_implied_usd);
      if (val >= prev) val = Math.max(1, prev - 1);
      prev = val;
      return {
        rank: idx + 1, slug: it.p.slug, name: it.p.name, category: it.cat, chains: it.chains, farm_chain: it.farm.farm_chain,
        tvl_usd: it.p.tvl_usd, change_7d: it.p.change_7d, listed_at: it.p.listed_at, in_watchlist: it.inWl,
        verdict: it.farm.verdict, verdict_reason: it.farm.verdict_reason, implied_value_usd: val,
        p25_usd: it.valuation.p25_usd, p75_usd: it.valuation.p75_usd, p25_airdrop_usd_per_1k: it.farm.p25_airdrop_usd_per_1k,
        est_cost_90d_usd: it.farm.est_cost_90d_usd, net_ev_p25_usd: it.farm.net_ev_p25_usd, breakeven_fdv_usd: it.farm.breakeven_fdv_usd,
        age_days: it.valuation.age_days, valuation: it.valuation, farm_steps: it.farm.steps.map((s) => s.text), step_meta: it.farm.steps,
      };
    });

    const liveTokens = tradedClean.slice().sort((a, b) => b.mcap_usd - a.mcap_usd || a.slug.localeCompare(b.slug)).map((p, idx) => {
      const cat = p.category || 'Uncategorized', eb = modelStats.sectorStats[cat]?.shrunk_log_residual ?? 0;
      const logPred = modelStats.intercept + modelStats.beta_tvl * Math.log10(p.tvl_usd) + eb;
      return {
        rank: idx + 1, slug: p.slug, name: p.name, symbol: p.symbol, category: cat, chains: sortChainsByLiquidity(p.chains),
        tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, mcap_to_tvl: roundTo(p.mcap_usd / p.tvl_usd, 3),
        model_pred_usd: Math.round(10 ** logPred), residual_log10: roundTo(Math.log10(p.mcap_usd) - logPred, 3),
        change_7d: p.change_7d, listed_at: p.listed_at,
      };
    });

    const catCnt = new Map(), chCnt = new Map(), sectorMedians = {};
    for (const [k, st] of Object.entries(modelStats.sectorStats)) if (st.median_mcap_tvl !== null) sectorMedians[k] = st.median_mcap_tvl;
    let aggImp = 0, aggP25 = 0, aggP75 = 0, aggTvl = 0, wlCov = 0, earlyCnt = 0, farmCnt = 0, thinCnt = 0, skipCnt = 0;
    for (const r of rows) {
      aggImp += r.implied_value_usd; aggP25 += r.p25_usd; aggP75 += r.p75_usd; aggTvl += r.tvl_usd;
      if (r.in_watchlist) wlCov++;
      if (r.tvl_usd < snapshot.floor_usd) earlyCnt++;
      if (r.verdict === 'FARM') farmCnt++; else if (r.verdict === 'THIN') thinCnt++; else skipCnt++;
      catCnt.set(r.category, (catCnt.get(r.category) || 0) + 1);
      for (const c of r.chains) chCnt.set(c, (chCnt.get(c) || 0) + 1);
    }
    return {
      summary: {
        as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
        total_snapshot_protocols: snapshot.protocols.length, pre_token_universe_count: preAll.length,
        watchlist_total: snapshot.watchlist.length, watchlist_covered: wlCov, early_count: earlyCnt,
        farm_count: farmCnt, thin_count: thinCnt, skip_count: skipCnt, live_benchmark_count: liveTokens.length,
        aggregate_implied_usd: aggImp, aggregate_p25_usd: aggP25, aggregate_p75_usd: aggP75, aggregate_tvl_usd: aggTvl,
        top_categories: [...catCnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
        top_chains: [...chCnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
      },
      modelStats, rows, liveTokens, sectorMedians,
    };
  }

  const api = { cleanTradedComps, fitSizeCurveComps, evaluateLooBacktest, scorePreTokenProtocol, computeNetFarmVerdict, sortChainsByLiquidity, buildRadarPayload };
  if (root) root.RadarModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
