// Token Launch Radar — shared valuation engine (Node module + browser global RadarModel).
(function () {
  'use strict';

  var CHAIN_ORDER = [
    'Ethereum', 'Arbitrum', 'Base', 'Optimism', 'Solana', 'Sui',
    'Hyperliquid L1', 'Monad', 'Polygon', 'Avalanche', 'Binance', 'Mantle',
    'Starknet', 'Linea', 'Scroll', 'Berachain', 'Sonic', 'Tron', 'Bitcoin',
    'TON', 'Aptos', 'Sei', 'Unichain', 'Ink', 'Plasma', 'Plume Mainnet',
    'Flare', 'Bittensor', 'Provenance', 'BSquared', 'Pharos', 'Ripple',
    'Stellar'
  ];

  var CHEAP_CHAINS = ['Solana', 'Sui', 'Aptos', 'TON', 'Stellar', 'Ripple', 'Tron', 'Bittensor', 'Near'];
  var L2_CHAINS = ['Arbitrum', 'Base', 'Optimism', 'Polygon', 'Avalanche', 'Monad', 'Hyperliquid L1', 'Binance', 'Mantle', 'Starknet', 'Linea', 'Scroll', 'Berachain', 'Sonic', 'Unichain', 'Ink'];
  var MID_CHAINS = ['Bitcoin', 'CORE', 'Babylon Genesis', 'BSquared', 'Provenance'];

  var EXCLUDED_CATS = ['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC'];
  var EXCHANGE_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
  var VERSION_TAIL = /(?:[Vv]\d+|\d+(?:\.\d+)+)$/;
  var WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

  var SHRINK_K = 8;
  var RIDGE = 0.05;
  var SMOOTH_K = 10;
  var WATCH_FLOOR = 50000000;

  function roundTo(v, places) {
    var f = Math.pow(10, places);
    return Math.round(v * f) / f;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function medianOf(list) {
    if (list.length === 0) return 0;
    var s = list.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    if (s.length % 2 === 1) return s[mid];
    return (s[mid - 1] + s[mid]) / 2;
  }

  function quartileOf(sorted, q) {
    if (sorted.length === 0) return 0;
    return sorted[Math.floor((sorted.length - 1) * q)];
  }

  function ranksOf(values) {
    var order = values.map(function (_, i) { return i; });
    order.sort(function (a, b) {
      if (values[a] !== values[b]) return values[a] - values[b];
      return a - b;
    });
    var ranks = new Array(values.length);
    for (var k = 0; k < order.length; k++) ranks[order[k]] = k + 1;
    return ranks;
  }

  function pearson(xs, ys) {
    var n = xs.length;
    if (n === 0) return 0;
    var mx = 0, my = 0;
    for (var i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var cov = 0, vx = 0, vy = 0;
    for (var j = 0; j < n; j++) {
      var dx = xs[j] - mx, dy = ys[j] - my;
      cov += dx * dy; vx += dx * dx; vy += dy * dy;
    }
    if (vx === 0 || vy === 0) return 0;
    return cov / (Math.sqrt(vx) * Math.sqrt(vy));
  }

  function rankCorr(xs, ys) {
    return pearson(ranksOf(xs), ranksOf(ys));
  }

  function pairAuc(pos, neg) {
    if (pos.length === 0 || neg.length === 0) return 0;
    var wins = 0;
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < neg.length; j++) {
        if (pos[i] > neg[j]) wins += 1;
        else if (pos[i] === neg[j]) wins += 0.5;
      }
    }
    return roundTo(wins / (pos.length * neg.length), 4);
  }

  function groupInt(v) {
    return Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function moneyFull(v) {
    return (v < 0 ? '-' : '') + '$' + groupInt(v);
  }

  function money2(v) {
    return (v < 0 ? '-' : '') + '$' + Math.abs(v).toFixed(2);
  }

  function moneyCompact(v) {
    var a = Math.abs(v);
    var sign = v < 0 ? '-' : '';
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(1) + 'K';
    return sign + '$' + groupInt(v);
  }

  function pctText(v) {
    if (v == null) return 'N/A';
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function signedMoney(v) {
    return (v < 0 ? '-' : '+') + '$' + Math.abs(v).toFixed(2);
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function catOf(p) {
    return p.category == null ? 'Uncategorized' : p.category;
  }

  function startsWithExchange(name) {
    return EXCHANGE_RE.test(name);
  }

  function hasWrappedWord(name) {
    return WRAPPED_WORD.test(name);
  }

  function hasVersionTail(name) {
    var m = name.match(/ ([^ ]+)$/);
    return !!m && VERSION_TAIL.test(m[1]);
  }

  function isExcludedCat(cat) {
    return EXCLUDED_CATS.indexOf(cat) !== -1;
  }

  function parseDay(s) {
    if (typeof s !== 'string') return null;
    var t = Date.parse(s + 'T00:00:00Z');
    return Number.isNaN(t) ? null : t;
  }

  function ageDays(listedAt, asOf) {
    var snap = parseDay(asOf);
    var listed = parseDay(listedAt);
    if (snap === null || listed === null) return 180;
    return Math.max(1, Math.round((snap - listed) / 86400000));
  }

  function chainRank(chain) {
    var i = CHAIN_ORDER.indexOf(chain);
    return i < 0 ? 1e9 : i;
  }

  function sortChains(chains) {
    return chains.slice().sort(function (a, b) {
      var ra = chainRank(a), rb = chainRank(b);
      if (ra !== rb) return ra - rb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  function feeProfile(chain) {
    if (chain === 'Ethereum') return { gas: 6, bridge: 9 };
    if (CHEAP_CHAINS.indexOf(chain) !== -1) return { gas: 0.03, bridge: 1.1 };
    if (MID_CHAINS.indexOf(chain) !== -1) return { gas: 2.2, bridge: 4 };
    return { gas: 0.22, bridge: 1.4 };
  }

  function isPreToken(p) {
    return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
  }

  function cleanComps(snapshot) {
    var kept = [];
    var seen = {};
    var order = snapshot.protocols;
    for (var i = 0; i < order.length; i++) {
      var p = order[i];
      if (!p.gecko_id || !p.symbol || !(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
      if (isExcludedCat(p.category)) continue;
      if (startsWithExchange(p.name)) continue;
      if (hasWrappedWord(p.name)) continue;
      var key = String(p.gecko_id).toLowerCase();
      if (seen[key] === undefined) {
        seen[key] = kept.length;
        kept.push(p);
      } else if (p.tvl_usd > kept[seen[key]].tvl_usd) {
        kept[seen[key]] = p;
      }
    }
    return kept;
  }

  function passesBoardFilter(p) {
    if (isExcludedCat(p.category)) return false;
    if (startsWithExchange(p.name)) return false;
    if (hasWrappedWord(p.name)) return false;
    if (hasVersionTail(p.name)) return false;
    return true;
  }

  function boardUniverse(snapshot) {
    var watch = {};
    snapshot.watchlist.forEach(function (s) { watch[s] = true; });
    var out = [];
    snapshot.protocols.forEach(function (p) {
      if (!isPreToken(p)) return;
      if (watch[p.slug] || passesBoardFilter(p)) out.push(p);
    });
    return out;
  }

  function oddsFitSet(snapshot) {
    var out = [];
    snapshot.protocols.forEach(function (p) {
      if (isPreToken(p) && passesBoardFilter(p)) out.push(p);
    });
    return out;
  }

  function solve2(m, v) {
    // Cramer's rule for a 2x2 system. Both callers ridge-regularize,
    // so the determinant is always positive; the floor only guards a singular input.
    var det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
    if (Math.abs(det) <= 1e-12) det = 1e-12;
    return [(v[0] * m[1][1] - v[1] * m[0][1]) / det, (m[0][0] * v[1] - m[1][0] * v[0]) / det];
  }

  function ridgeSolve(points, weights) {
    var s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
    for (var i = 0; i < points.length; i++) {
      var w = weights[i], x = points[i].x, y = points[i].y;
      s0 += w; s1 += w * x; s2 += w * x * x; t0 += w * y; t1 += w * x * y;
    }
    return solve2([[s0, s1], [s1, s2 + RIDGE]], [t0, t1]);
  }

  function huberFit(points, iterations) {
    var weights = points.map(function () { return 1; });
    var coef = ridgeSolve(points, weights);
    for (var it = 0; it < iterations; it++) {
      var absRes = points.map(function (pt) {
        return Math.abs(pt.y - (coef[0] + coef[1] * pt.x));
      });
      var med = medianOf(absRes);
      var cut = med === 0 ? 0.5 : 1.345 * med / 0.6745;
      weights = absRes.map(function (r) { return r <= cut ? 1 : cut / r; });
      coef = ridgeSolve(points, weights);
    }
    return coef;
  }

  function compPoint(p) {
    return { x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd) };
  }

  function looBacktest(comps) {
    var points = comps.map(compPoint);
    var preds = [], resids = [], absRes = [];
    for (var i = 0; i < comps.length; i++) {
      var restPoints = points.filter(function (_, j) { return j !== i; });
      var coef = huberFit(restPoints, 12);
      var cat = catOf(comps[i]);
      var same = [];
      comps.forEach(function (q, j) {
        if (j === i || catOf(q) !== cat) return;
        same.push(clamp(points[j].y - (coef[0] + coef[1] * points[j].x), -1, 1));
      });
      var shrink = same.length
        ? same.reduce(function (a, b) { return a + b; }, 0) / (same.length + SHRINK_K)
        : 0;
      var pred = coef[0] + coef[1] * points[i].x + shrink;
      var resid = points[i].y - pred;
      preds.push(pred);
      resids.push(resid);
      absRes.push(Math.abs(resid));
    }
    var medAbs = medianOf(absRes);
    var sortedRes = resids.slice().sort(function (a, b) { return a - b; });
    var ys = points.map(function (pt) { return pt.y; });
    return {
      med_abs_log_err: roundTo(medAbs, 4),
      oos_fold_err: roundTo(Math.pow(10, medAbs), 2),
      spearman_rho: roundTo(rankCorr(preds, ys), 3),
      resid_p25: roundTo(quartileOf(sortedRes, 0.25), 4),
      resid_p75: roundTo(quartileOf(sortedRes, 0.75), 4)
    };
  }

  function sectorTable(comps, boardRows, coef) {
    var cats = [];
    var seenCat = {};
    comps.concat(boardRows).forEach(function (p) {
      var c = catOf(p);
      if (!seenCat[c]) { seenCat[c] = true; cats.push(c); }
    });
    var table = cats.map(function (c) {
      var inCat = comps.filter(function (p) { return catOf(p) === c; });
      var weight = inCat.length / (inCat.length + SHRINK_K);
      var clamped = inCat.map(function (p) {
        var pt = compPoint(p);
        return clamp(pt.y - (coef[0] + coef[1] * pt.x), -1, 1);
      });
      var meanClamped = clamped.length
        ? clamped.reduce(function (a, b) { return a + b; }, 0) / clamped.length
        : 0;
      var resid = clamped.length === 0 ? 0 : weight * meanClamped;
      var residR = roundTo(resid, 4);
      var ratios = inCat.map(function (p) { return p.mcap_usd / p.tvl_usd; });
      var medRatio = ratios.length === 0 ? null : roundTo(medianOf(ratios), 3);
      return {
        category: c,
        traded: inCat.length,
        weight: roundTo(weight, 3),
        resid: residR,
        median: medRatio
      };
    });
    return table;
  }

  function fitSizeCurve(snapshot, comps, boardRows) {
    var points = comps.map(compPoint);
    var coef = huberFit(points, 16);
    var intercept = roundTo(coef[0], 4);
    var slope = roundTo(coef[1], 4);
    var loo = looBacktest(comps);
    var sectors = sectorTable(comps, boardRows, coef);
    return {
      traded_count: comps.length,
      shrink_k: SHRINK_K,
      intercept: intercept,
      slope: slope,
      oos_fold_err: loo.oos_fold_err,
      med_abs_log_err: loo.med_abs_log_err,
      spearman_rho: loo.spearman_rho,
      resid_p25: loo.resid_p25,
      resid_p75: loo.resid_p75,
      as_of: snapshot.as_of,
      sectors: sectors
    };
  }

  function ageBucket(age) {
    return age < 180 ? 0 : age < 365 ? 1 : age < 730 ? 2 : 3;
  }

  function tvlTier(tvl) {
    return tvl < 50000000 ? 0 : tvl < 300000000 ? 1 : 2;
  }

  function cellIndex(p, asOf) {
    return ageBucket(ageDays(p.listed_at, asOf)) * 3 + tvlTier(p.tvl_usd);
  }

  function buildCells(labelled, prior) {
    var cells = [];
    for (var i = 0; i < 12; i++) {
      cells.push({ bucket: Math.floor(i / 3), tier: i % 3, traded: 0, pretoken: 0, odds: 0 });
    }
    labelled.forEach(function (item) {
      var c = cells[item.cell];
      if (item.launched) c.traded++; else c.pretoken++;
    });
    cells.forEach(function (c) {
      c.odds = roundTo((c.traded + prior * SMOOTH_K) / (c.traded + c.pretoken + SMOOTH_K), 4);
    });
    return cells;
  }

  function sigmoid(z) {
    var c = Math.max(-30, Math.min(30, z));
    return 1 / (1 + Math.exp(-c));
  }

  function logit(p) {
    var c = Math.max(0.001, Math.min(0.999, p));
    return Math.log(c / (1 - c));
  }

  // Smoothed launch rate per category, train-only, single pass:
  // (launched + prior*10) / (n + 10), rounded to 4 decimals.
  function ratesFor(labelled, prior) {
    var counts = {};
    labelled.forEach(function (item) {
      var c = catOf(item.p);
      if (counts[c] === undefined) counts[c] = [0, 0];
      counts[c][0]++;
      if (item.launched) counts[c][1]++;
    });
    var rates = {};
    Object.keys(counts).forEach(function (c) {
      rates[c] = roundTo((counts[c][1] + prior * SMOOTH_K) / (counts[c][0] + SMOOTH_K), 4);
    });
    return rates;
  }

  function chgOf(p) {
    var c = p.change_7d;
    return c == null ? 0 : c;
  }

  // Two-parameter logistic adjustment on top of the cell odds:
  // logit(p) = logit(cell odds) + b1*(category rate - prior)
  //            + b2*(winsorized 7d change / 10), IRLS 30 rounds, ridge 1.
  // Cells carry the age x TVL interaction; the adjustment adds what cells
  // cannot see (category launch record, TVL momentum). Change is
  // winsorized to [-20, +50]: one frenzy (+4448% exists) cannot zero a row.
  function fitAdjust(labelled, cells, rates, prior) {
    var b = [0, 0];
    var rows = labelled.map(function (item) {
      return [logit(cells[item.cell].odds), rates[catOf(item.p)] - prior, clamp(chgOf(item.p), -20, 50) / 10, item.launched ? 1 : 0];
    });
    for (var it = 0; it < 30; it++) {
      var s00 = 0, s01 = 0, s11 = 0, t0 = 0, t1 = 0;
      rows.forEach(function (r) {
        var xb = r[0] + b[0] * r[1] + b[1] * r[2];
        var pr = sigmoid(xb);
        var w = Math.max(pr * (1 - pr), 1e-6);
        var z = xb + clamp((r[3] - pr) / w, -30, 30);
        var d = z - r[0];
        s00 += w * r[1] * r[1];
        s01 += w * r[1] * r[2];
        s11 += w * r[2] * r[2];
        t0 += w * r[1] * d;
        t1 += w * r[2] * d;
      });
      b = solve2([[s00 + 1, s01], [s01, s11 + 1]], [t0, t1]);
    }
    return [roundTo(b[0], 4), roundTo(b[1], 4)];
  }

  // Same formula as fitAdjust, scored with the rounded coefficients and
  // full-set rates, so the board shows what the model reports.
  function adjustedOdds(p, cells, adjust, rates, prior, asOf) {
    var rate = rates[catOf(p)];
    if (rate === undefined) rate = prior;
    return sigmoid(logit(cells[cellIndex(p, asOf)].odds)
      + adjust[0] * (rate - prior)
      + adjust[1] * clamp(chgOf(p), -20, 50) / 10);
  }

  function fitOddsModel(labelled, prior, asOf) {
    var cells = buildCells(labelled, prior);
    var rates = ratesFor(labelled, prior);
    return { cells: cells, adjust: fitAdjust(labelled, cells, rates, prior), rates: rates };
  }

  function oddsAuc(model, test, prior, asOf) {
    var pos = [], neg = [];
    test.forEach(function (item) {
      var odds = adjustedOdds(item.p, model.cells, model.adjust, model.rates, prior, asOf);
      if (item.launched) pos.push(odds); else neg.push(odds);
    });
    if (pos.length === 0 || neg.length === 0) return null;
    return pairAuc(pos, neg);
  }

  function fitLaunchOdds(snapshot, comps, pretoken) {
    var asOf = snapshot.as_of;
    var prior = roundTo(comps.length / (comps.length + pretoken.length), 4);
    var labelled = [];
    comps.forEach(function (p) { labelled.push({ p: p, cell: cellIndex(p, asOf), launched: true }); });
    pretoken.forEach(function (p) { labelled.push({ p: p, cell: cellIndex(p, asOf), launched: false }); });
    var full = fitOddsModel(labelled, prior, asOf);
    var sorted = labelled.slice().sort(function (a, b) {
      return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
    });
    var foldScores = [];
    for (var f = 0; f < 5; f++) {
      var train = [], test = [];
      sorted.forEach(function (item, i) {
        if (i % 5 === f) test.push(item); else train.push(item);
      });
      var auc = oddsAuc(fitOddsModel(train, prior, asOf), test, prior, asOf);
      if (auc !== null) foldScores.push(auc);
    }
    var meanAuc = 0;
    if (foldScores.length > 0) {
      var s = 0;
      foldScores.forEach(function (v) { s += v; });
      meanAuc = roundTo(s / foldScores.length, 4);
    }
    var flat = meanAuc <= 0.5;
    return {
      prior: prior,
      mean_auc: meanAuc,
      fold_aucs: foldScores,
      flat: flat,
      traded: comps.length,
      pretoken: pretoken.length,
      cells: flat
        ? full.cells.map(function (c) { return { bucket: c.bucket, tier: c.tier, traded: 0, pretoken: 0, odds: prior }; })
        : full.cells,
      adjust: flat ? [0, 0] : full.adjust,
      categoryRates: full.rates
    };
  }

  function velocityMult(p) {
    return 1 + clamp(chgOf(p) / 100 * 0.4, -0.22, 0.38);
  }

  function ageMult(age) {
    return 0.86 + Math.min(0.28, Math.log10(age + 30) * 0.09);
  }

  function pickFarmChain(chains) {
    var sorted = chains.length > 0 ? sortChains(chains) : ['Ethereum'];
    var l2 = null;
    for (var i = 0; i < sorted.length; i++) {
      if (CHEAP_CHAINS.indexOf(sorted[i]) !== -1) return sorted[i];
      if (l2 === null && L2_CHAINS.indexOf(sorted[i]) !== -1) l2 = sorted[i];
    }
    return l2 || sorted[0];
  }

  function ticketFor(tvl) {
    if (tvl > 300000000) return 20000;
    if (tvl >= 50000000) return 5000;
    return 1000;
  }

  function ticketK(ticket) {
    return '$' + Math.round(ticket / 1000) + 'k';
  }

  function depositText(minDeposit) {
    if (minDeposit >= 1000) return (minDeposit / 1000).toFixed(1) + 'k';
    return '$' + groupInt(minDeposit);
  }

  function stepPattern(category) {
    var c = category || '';
    if (/Curator|Allocator|Yield/.test(c)) return 'vault';
    if (/Derivatives|Prediction|Options/.test(c)) return 'margin';
    if (/Dexs|Liquidity/.test(c)) return 'lp';
    if (/Lending|CDP|Collateral/.test(c)) return 'lend';
    if (/RWA|Basis|CeDeFi|Payments/.test(c)) return 'receipt';
    return 'default';
  }

  function firstStepText(kind, row, ticket, farmChain) {
    var name = row.name, cat = row.category === 'Uncategorized' ? 'DeFi' : row.category;
    var money = moneyFull(ticket);
    if (kind === 'vault') return 'Deposit ' + money + ' in USDC or LST into the protocol\u2019s curated vault on ' + farmChain + '.';
    if (kind === 'margin') return 'Seed ' + money + ' as margin on ' + name + ' on ' + farmChain + ' and post 5+ weekly maker limit orders.';
    if (kind === 'lp') return 'Provide ' + money + ' as tight-range (\u00B12%) liquidity on ' + name + ' on ' + farmChain + '.';
    if (kind === 'lend') return 'Supply ' + money + ' as collateral on ' + name + ' on ' + farmChain + ' and borrow at no more than 45% loan-to-value, with a health factor above 1.85.';
    if (kind === 'receipt') return 'Mint ' + money + ' as a yield-bearing receipt on ' + name + ' on ' + farmChain + ' in one clean wallet.';
    var share = (ticket / row.tvl_usd * 100).toFixed(4);
    return 'Deploy ' + money + ' as liquidity into ' + name + '\u2019s top ' + cat + ' pool on ' + farmChain + ' (' + share + '% of pool).';
  }

  function secondStepText(kind, row, secondChain) {
    var name = row.name;
    if (kind === 'vault') return 'Roll the vault receipt across ' + secondChain + ', or compound every 14 days.';
    if (kind === 'margin') return 'Balance open interest across two of ' + name + '\u2019s markets over six weekly funding epochs.';
    if (kind === 'lp') return 'Rebalance out-of-range ticks, and route swaps bi-weekly on ' + secondChain + '.';
    if (kind === 'lend') return 'Monitor the oracle buffer weekly, and deploy the borrowed liquidity into ' + name + '\u2019s pool on ' + secondChain + '.';
    if (kind === 'receipt') return 'Hold through three monthly settlement cycles, with no early redemption.';
    return 'Bi-weekly organic activity on ' + name + ' on ' + secondChain + ' across six snapshots.';
  }

  function pushStep(steps, meta, text, cost, time, gas) {
    steps.push(text);
    meta.push({ text: text, cost: cost, time: time, gas: gas });
  }

  function scoreProtocol(p, model, oddsModel, sectorByCat, watchSet) {
    var cat = catOf(p);
    var sec = sectorByCat[cat] || { resid: 0, weight: 0, traded: 0, median: null };
    var tvl = p.tvl_usd;
    var logTvl = Math.log10(tvl);
    var sizeBase = Math.pow(10, model.intercept + model.slope * logTvl);
    var sectorBase = sizeBase * Math.pow(10, sec.resid);
    var vel = velocityMult(p);
    var age = ageDays(p.listed_at, model.as_of);
    var aMult = ageMult(age);
    var raw = sectorBase * vel * aMult;
    var rawR = Math.round(raw);
    var p25v = Math.max(1, Math.round(raw * Math.pow(10, model.resid_p25)));
    var p75v = Math.max(p25v + 1, Math.round(raw * Math.pow(10, model.resid_p75)));

    var chains = p.chains && p.chains.length > 0 ? sortChains(p.chains) : ['Ethereum'];
    var farmChain = pickFarmChain(chains);
    var secondChain = farmChain;
    for (var i = 0; i < chains.length; i++) {
      if (chains[i] !== farmChain) { secondChain = chains[i]; break; }
    }
    var fee = feeProfile(farmChain);
    var setupGas = roundTo(fee.gas * 2 + (farmChain !== 'Ethereum' ? fee.bridge : 0), 2);
    var cost90 = roundTo(setupGas + fee.gas * 6, 2);
    var ticket = ticketFor(tvl);
    var floor = Math.max(tvl, 5000000);
    var p25Rec = roundTo(p25v * 0.05 * ticket / floor, 2);
    var midRec = roundTo(rawR * 0.05 * ticket / floor, 2);
    var netP25 = roundTo(p25Rec - cost90, 2);
    var netMid = roundTo(midRec - cost90, 2);
    var minDeposit = Math.ceil(cost90 * floor / Math.max(1, p25v * 0.05));
    var breakeven = Math.round(cost90 * floor / (ticket * 0.05));

    var verdict = 'THIN';
    var chg = chgOf(p);
    var reason = 'P25 net EV ' + signedMoney(netP25) + ' on a ' + ticketK(ticket) +
      ' ticket via ' + farmChain + '; min deposit ' + moneyFull(minDeposit) + '.';
    if (chg < -10) {
      verdict = 'SKIP';
      reason = chg.toFixed(1) + '% 7d TVL outflow \u2014 mercenary exit; wait for two positive weekly snapshots.';
    } else if (tvl < 8000000) {
      verdict = 'SKIP';
      reason = 'TVL $' + (tvl / 1e6).toFixed(1) + 'M \u2014 pool too shallow; slippage risk outweighs any farm.';
    } else if (netP25 < -2) {
      verdict = 'SKIP';
      reason = 'P25 net EV ' + signedMoney(netP25) + ' on ' + farmChain + ' \u2014 ' + money2(cost90) +
        ' 90d cost eats the ' + money2(p25Rec) + ' P25 share on a ' + ticketK(ticket) + ' ticket.';
    } else if (cat === 'CDP' || cat === 'Stablecoin Wrapper') {
      verdict = 'THIN';
      reason = cat + ' \u2014 verify canonical token overlap before scaling; ' + ticketK(ticket) +
        ' ticket, P25 net EV ' + signedMoney(netP25) + '.';
    } else if (netP25 >= 2) {
      verdict = 'FARM';
      reason = 'P25 net EV ' + signedMoney(netP25) + ' (mid ' + signedMoney(netMid) + ') on a ' +
        ticketK(ticket) + ' ticket via ' + farmChain + ' after ' + money2(cost90) + ' 90d cost.';
    }

    var cellOdds = oddsModel.flat ? oddsModel.prior
      : adjustedOdds(p, oddsModel.cells, oddsModel.adjust, oddsModel.categoryRates, oddsModel.prior, model.as_of);
    var odds4 = clamp(cellOdds, 0.02, 0.95);
    var expected = Math.max(1, Math.round(rawR * odds4));
    var expectedP25 = Math.max(1, Math.round(p25v * odds4));

    var row = {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: cat,
      chains: chains,
      farm_chain: farmChain,
      tvl_usd: tvl,
      change_7d: p.change_7d == null ? null : p.change_7d,
      listed_at: p.listed_at == null ? null : p.listed_at,
      in_watchlist: !!watchSet[p.slug],
      verdict: verdict,
      verdict_reason: reason,
      implied_value_usd: expected,
      expected_value_usd: expected,
      sizecurve_value_usd: Math.max(1, rawR),
      launch_odds: roundTo(odds4, 3),
      expected_p25_usd: expectedP25,
      p25_usd: p25v,
      p75_usd: p75v,
      ticket_usd: ticket,
      min_deposit_usd: minDeposit,
      p25_airdrop_rec_usd: p25Rec,
      mid_airdrop_rec_usd: midRec,
      est_cost_90d_usd: cost90,
      net_ev_p25_usd: netP25,
      net_ev_mid_usd: netMid,
      breakeven_fdv_usd: breakeven,
      age_days: age,
      valuation: {
        tvl_usd: tvl,
        size_base_usd: Math.round(sizeBase),
        sector_base_usd: Math.round(sectorBase),
        sector_resid: sec.resid,
        sector_mult: roundTo(Math.pow(10, sec.resid), 3),
        shrink_weight: sec.weight,
        sector_traded: sec.traded,
        velocity_mult: roundTo(vel, 3),
        age_days: age,
        age_mult: roundTo(aMult, 3),
        raw_usd: rawR,
        p25_usd: p25v,
        p75_usd: p75v,
        sector_median: sec.median
      },
      farm_steps: [],
      step_meta: []
    };
    // Farm plan (SPEC section 10): numbered steps, each with cost and time.
    var steps = [], meta = [];
    if (verdict === 'SKIP') {
      pushStep(steps, meta, 'Skip gate: ' + reason + ' Cap any test at $150 or defer.', '$0 gate', '3 min check', 0);
    }
    var kind = stepPattern(cat);
    var first = firstStepText(kind, row, ticket, farmChain);
    pushStep(steps, meta, first, money2(setupGas) + ' setup + ' + ticketK(ticket) + ' ticket', '10 min setup', setupGas);
    var second = secondStepText(kind, row, secondChain);
    var cycleGas = roundTo(fee.gas * 5, 2);
    pushStep(steps, meta, second, money2(cycleGas) + ' cycles', '5 min bi-weekly', cycleGas);
    var hold = 'Hold 90 days \u2192 tracked ' + age + 'd, ' + moneyFull(ticket) +
      ' ticket, P25 rec ' + money2(p25Rec) + ', mid rec ' + money2(midRec) +
      ', net ' + signedMoney(netP25) + ', min deposit ' + depositText(minDeposit) +
      ', break-even FDV ' + moneyCompact(breakeven) + '.';
    pushStep(steps, meta, hold, money2(fee.gas) + ' exit', '2 min / week', fee.gas);
    if (verdict !== 'SKIP') {
      pushStep(steps, meta, 'Risk check: if 7d TVL drops 10% or the verdict flips to SKIP, halve the ' + moneyFull(ticket) + ' ticket and exit the rest within a week.', money2(fee.gas) + ' exit', '5 min weekly', fee.gas);
      pushStep(steps, meta, 'Claim ' + p.name + '\u2019s epoch badges and revoke stale approvals on ' + farmChain + '.', money2(fee.gas) + ' revoke', '4 min exit', fee.gas);
    }
    row.farm_steps = steps;
    row.step_meta = meta;
    row._ev = expected;
    return row;
  }

  function rankRows(scored) {
    scored.sort(function (a, b) {
      if (b._ev !== a._ev) return b._ev - a._ev;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    var prev = Infinity;
    scored.forEach(function (row, i) {
      var enforced = Math.max(1, row._ev);
      if (enforced >= prev) enforced = Math.max(1, prev - 1);
      row.implied_value_usd = enforced;
      row.expected_value_usd = enforced;
      row.rank = i + 1;
      prev = enforced;
      delete row._ev;
    });
    return scored;
  }

  function tradedList(comps, model, sectorByCat) {
    var sorted = comps.slice().sort(function (a, b) {
      if (b.mcap_usd !== a.mcap_usd) return b.mcap_usd - a.mcap_usd;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    return sorted.map(function (p, i) {
      var sec = sectorByCat[catOf(p)] || { resid: 0 };
      var logPred = model.intercept + model.slope * Math.log10(p.tvl_usd) + sec.resid;
      return {
        rank: i + 1,
        slug: p.slug,
        name: p.name,
        symbol: p.symbol,
        category: catOf(p),
        chains: p.chains && p.chains.length > 0 ? sortChains(p.chains) : ['Ethereum'],
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd,
        mcap_tvl: roundTo(p.mcap_usd / p.tvl_usd, 3),
        pred_usd: Math.round(Math.pow(10, logPred)),
        resid_log: roundTo(Math.log10(p.mcap_usd) - logPred, 3),
        change_7d: p.change_7d == null ? null : p.change_7d,
        listed_at: p.listed_at == null ? null : p.listed_at
      };
    });
  }

  function countBy(items, keyFn) {
    var counts = {};
    items.forEach(function (item) {
      var k = keyFn(item);
      counts[k] = (counts[k] || 0) + 1;
    });
    var out = Object.keys(counts).map(function (k) { return { name: k, count: counts[k] }; });
    out.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return out;
  }

  function buildSummary(snapshot, rows) {
    var aggImplied = 0, aggTvl = 0;
    var farm = 0, thin = 0, skip = 0, early = 0, covered = 0;
    var chainRows = [];
    rows.forEach(function (r) {
      aggImplied += r.implied_value_usd;
      aggTvl += r.tvl_usd;
      if (r.verdict === 'FARM') farm++;
      else if (r.verdict === 'THIN') thin++;
      else skip++;
      if (r.tvl_usd < WATCH_FLOOR) early++;
      if (r.in_watchlist) covered++;
      r.chains.forEach(function (c) { chainRows.push(c); });
    });
    return {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      watchlist_total: snapshot.watchlist.length,
      watchlist_covered: covered,
      early_count: early,
      farm_count: farm,
      thin_count: thin,
      skip_count: skip,
      agg_implied_usd: aggImplied,
      agg_tvl_usd: aggTvl,
      top_categories: countBy(rows, function (r) { return r.category; }),
      top_chains: countBy(chainRows, function (c) { return c; })
    };
  }

  function buildPayload(snapshot) {
    var comps = cleanComps(snapshot);
    var boardSet = boardUniverse(snapshot);
    var fitSet = oddsFitSet(snapshot);
    var model = fitSizeCurve(snapshot, comps, boardSet);
    var sectorByCat = {};
    model.sectors.forEach(function (s) { sectorByCat[s.category] = s; });
    var odds = fitLaunchOdds(snapshot, comps, fitSet);
    model.launchOddsStats = odds;
    var watchSet = {};
    snapshot.watchlist.forEach(function (s) { watchSet[s] = true; });
    var scored = boardSet.map(function (p) {
      return scoreProtocol(p, model, odds, sectorByCat, watchSet);
    });
    var rows = rankRows(scored);
    var traded = tradedList(comps, model, sectorByCat);
    var medians = {};
    model.sectors.forEach(function (s) {
      if (s.median !== null) medians[s.category] = s.median;
    });
    return {
      summary: buildSummary(snapshot, rows),
      model: model,
      rows: rows,
      traded: traded,
      sectorMedians: medians
    };
  }

  globalThis.RadarModel = {
    buildPayload, fitLaunchOdds, fitSizeCurve, cleanComps, boardUniverse,
    oddsFitSet, escHtml, moneyCompact, moneyFull, money2, pctText,
    signedMoney, depositText,
    // Helpers the backtest experiments use (kept exported so the
    // experiment scripts stay runnable against this file).
    roundTo, clamp, medianOf, quartileOf, rankCorr, pairAuc, catOf,
    ageDays, cellIndex, buildCells, scoreProtocol
  };
})();
