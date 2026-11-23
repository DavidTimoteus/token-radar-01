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
  var EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
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
    var idx = Math.floor((sorted.length - 1) * q);
    if (idx > sorted.length - 1) idx = sorted.length - 1;
    return sorted[idx];
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
    if (v === null || v === undefined) return 'N/A';
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function signedMoney(v) {
    return (v < 0 ? '-' : '+') + '$' + Math.abs(v).toFixed(2);
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function catOf(p) {
    return p.category === null || p.category === undefined ? 'Uncategorized' : p.category;
  }

  function startsWithExchange(name) {
    for (var i = 0; i < EXCHANGES.length; i++) {
      var re = new RegExp('^' + EXCHANGES[i] + '\\b');
      if (re.test(name)) return true;
    }
    return false;
  }

  function hasWrappedWord(name) {
    return WRAPPED_WORD.test(name);
  }

  function hasVersionTail(name) {
    var m = name.match(/ ([^ ]+)$/);
    if (!m) return false;
    return VERSION_TAIL.test(m[1]);
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
    if (chain === 'Ethereum') return { gas: 6.00, bridge: 9.00 };
    if (CHEAP_CHAINS.indexOf(chain) !== -1) return { gas: 0.03, bridge: 1.10 };
    if (MID_CHAINS.indexOf(chain) !== -1) return { gas: 2.20, bridge: 4.00 };
    return { gas: 0.22, bridge: 1.40 };
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
    var a = [[m[0][0], m[0][1], v[0]], [m[1][0], m[1][1], v[1]]];
    for (var col = 0; col < 2; col++) {
      var piv = col;
      for (var r = col + 1; r < 2; r++) {
        if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
      }
      if (piv !== col) { var tmp = a[col]; a[col] = a[piv]; a[piv] = tmp; }
      var d = a[col][col];
      if (Math.abs(d) <= 1e-12) d = 1e-12;
      for (var j = 0; j < 3; j++) a[col][j] /= d;
      for (var k = 0; k < 2; k++) {
        if (k === col) continue;
        var f = a[k][col];
        for (var q = 0; q < 3; q++) a[k][q] -= f * a[col][q];
      }
    }
    return [a[0][2], a[1][2]];
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
      var rest = [];
      for (var j = 0; j < comps.length; j++) if (j !== i) rest.push(j);
      var restPoints = rest.map(function (j) { return points[j]; });
      var coef = huberFit(restPoints, 12);
      var cat = catOf(comps[i]);
      var same = [];
      rest.forEach(function (j) {
        if (catOf(comps[j]) !== cat) return;
        var r = points[j].y - (coef[0] + coef[1] * points[j].x);
        same.push(clamp(r, -1, 1));
      });
      var shrink = 0;
      if (same.length > 0) {
        var sum = 0;
        same.forEach(function (r) { sum += r; });
        shrink = same.length / (same.length + SHRINK_K) * (sum / same.length);
      }
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
    comps.forEach(function (p) {
      var c = catOf(p);
      if (!seenCat[c]) { seenCat[c] = true; cats.push(c); }
    });
    boardRows.forEach(function (p) {
      var c = catOf(p);
      if (!seenCat[c]) { seenCat[c] = true; cats.push(c); }
    });
    var table = cats.map(function (c) {
      var inCat = comps.filter(function (p) { return catOf(p) === c; });
      var preCount = boardRows.filter(function (p) { return catOf(p) === c; }).length;
      var weight = inCat.length / (inCat.length + SHRINK_K);
      var clamped = inCat.map(function (p) {
        var pt = compPoint(p);
        return clamp(pt.y - (coef[0] + coef[1] * pt.x), -1, 1);
      });
      var meanClamped = 0;
      if (clamped.length > 0) {
        var s = 0;
        clamped.forEach(function (r) { s += r; });
        meanClamped = s / clamped.length;
      }
      var resid = clamped.length === 0 ? 0 : weight * meanClamped;
      var residR = roundTo(resid, 4);
      var ratios = inCat.map(function (p) { return p.mcap_usd / p.tvl_usd; });
      var medRatio = ratios.length === 0 ? null : roundTo(medianOf(ratios), 3);
      return {
        category: c,
        traded: inCat.length,
        pretoken: preCount,
        weight: roundTo(weight, 3),
        resid: residR,
        median: medRatio,
        mult: roundTo(Math.pow(10, residR), 3)
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
    if (age < 180) return 0;
    if (age < 365) return 1;
    if (age < 730) return 2;
    return 3;
  }

  function tvlTier(tvl) {
    if (tvl < 50000000) return 0;
    if (tvl < 300000000) return 1;
    return 2;
  }

  function cellIndex(p, asOf) {
    return ageBucket(ageDays(p.listed_at, asOf)) * 3 + tvlTier(p.tvl_usd);
  }

  function buildCells(labelled, prior) {
    var cells = [];
    for (var b = 0; b < 4; b++) {
      for (var t = 0; t < 3; t++) {
        var tc = 0, pc = 0;
        labelled.forEach(function (item) {
          if (item.cell !== b * 3 + t) return;
          if (item.launched) tc++; else pc++;
        });
        cells.push({
          bucket: b,
          tier: t,
          traded: tc,
          pretoken: pc,
          odds: roundTo((tc + prior * SMOOTH_K) / (tc + pc + SMOOTH_K), 4)
        });
      }
    }
    return cells;
  }

  function fitLaunchOdds(snapshot, comps, pretoken) {
    var asOf = snapshot.as_of;
    var prior = roundTo(comps.length / (comps.length + pretoken.length), 4);
    var labelled = [];
    comps.forEach(function (p) { labelled.push({ p: p, cell: cellIndex(p, asOf), launched: true }); });
    pretoken.forEach(function (p) { labelled.push({ p: p, cell: cellIndex(p, asOf), launched: false }); });
    var cells = buildCells(labelled, prior);

    var sorted = labelled.slice().sort(function (a, b) {
      return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
    });
    var foldScores = [];
    for (var f = 0; f < 5; f++) {
      var train = [], test = [];
      sorted.forEach(function (item, i) {
        if (i % 5 === f) test.push(item); else train.push(item);
      });
      var trainCells = buildCells(train, prior);
      var pos = [], neg = [];
      test.forEach(function (item) {
        var odds = trainCells[item.cell].odds;
        if (item.launched) pos.push(odds); else neg.push(odds);
      });
      if (pos.length === 0 || neg.length === 0) continue;
      foldScores.push(pairAuc(pos, neg));
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
        ? cells.map(function (c) { return { bucket: c.bucket, tier: c.tier, traded: 0, pretoken: 0, odds: prior }; })
        : cells
    };
  }

  function velocityMult(change7d) {
    var chg = change7d === null || change7d === undefined ? 0 : change7d;
    return 1 + clamp(chg / 100 * 0.4, -0.22, 0.38);
  }

  function ageMult(age) {
    return 0.86 + Math.min(0.28, Math.log10(age + 30) * 0.09);
  }

  function pickFarmChain(chains) {
    var sorted = chains.length > 0 ? sortChains(chains) : ['Ethereum'];
    for (var i = 0; i < sorted.length; i++) {
      if (CHEAP_CHAINS.indexOf(sorted[i]) !== -1) return sorted[i];
    }
    for (var j = 0; j < sorted.length; j++) {
      if (L2_CHAINS.indexOf(sorted[j]) !== -1) return sorted[j];
    }
    return sorted[0];
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
    if (c.indexOf('Curator') !== -1 || c.indexOf('Allocator') !== -1 || c.indexOf('Yield') !== -1) return 'vault';
    if (c.indexOf('Derivatives') !== -1 || c.indexOf('Prediction') !== -1 || c.indexOf('Options') !== -1) return 'margin';
    if (c.indexOf('Dexs') !== -1 || c.indexOf('Liquidity') !== -1) return 'lp';
    if (c.indexOf('Lending') !== -1 || c.indexOf('CDP') !== -1 || c.indexOf('Collateral') !== -1) return 'lend';
    if (c.indexOf('RWA') !== -1 || c.indexOf('Basis') !== -1 || c.indexOf('CeDeFi') !== -1 || c.indexOf('Payments') !== -1) return 'receipt';
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

  function buildFarmPlan(row, econ) {
    var steps = [], meta = [];
    var fee = feeProfile(econ.farmChain);
    if (row.verdict === 'SKIP') {
      var gateText = 'Skip gate: ' + row.verdict_reason + ' Cap any test at $150 or defer.';
      steps.push(gateText);
      meta.push({ text: gateText, cost: '$0 gate', time: '3 min check', gas: 0 });
    }
    var kind = stepPattern(row.category);
    var first = firstStepText(kind, row, econ.ticket, econ.farmChain);
    steps.push(first);
    meta.push({
      text: first,
      cost: money2(econ.setupGas) + ' setup + ' + ticketK(econ.ticket) + ' ticket',
      time: '10 min setup',
      gas: econ.setupGas
    });
    var second = secondStepText(kind, row, econ.secondChain);
    steps.push(second);
    var cycleGas = roundTo(fee.gas * 5, 2);
    meta.push({
      text: second,
      cost: money2(cycleGas) + ' cycles',
      time: '5 min bi-weekly',
      gas: cycleGas
    });
    var hold = 'Hold 90 days \u2192 tracked ' + row.age_days + 'd, ' + moneyFull(econ.ticket) +
      ' ticket, P25 rec ' + money2(econ.p25Rec) + ', mid rec ' + money2(econ.midRec) +
      ', net ' + signedMoney(econ.netEvP25) + ', min deposit ' + depositText(econ.minDeposit) +
      ', break-even FDV ' + moneyCompact(econ.breakevenFdv) + '.';
    steps.push(hold);
    meta.push({
      text: hold,
      cost: money2(fee.gas) + ' exit',
      time: '2 min / week',
      gas: fee.gas
    });
    if (steps.length < 4) {
      var close = 'Claim ' + row.name + '\u2019s epoch badges and revoke stale approvals on ' + econ.farmChain + '.';
      steps.push(close);
      meta.push({
        text: close,
        cost: money2(fee.gas) + ' revoke',
        time: '4 min exit',
        gas: fee.gas
      });
    }
    return { steps: steps, meta: meta };
  }

  function scoreProtocol(p, model, oddsModel, sectorByCat, watchSet) {
    var cat = catOf(p);
    var sec = sectorByCat[cat] || { resid: 0, weight: 0, traded: 0, median: null };
    var tvl = p.tvl_usd;
    var logTvl = Math.log10(tvl);
    var sizeBase = Math.pow(10, model.intercept + model.slope * logTvl);
    var sectorBase = sizeBase * Math.pow(10, sec.resid);
    var vel = velocityMult(p.change_7d);
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

    var econ = {
      farmChain: farmChain, secondChain: secondChain, setupGas: setupGas,
      cost90: cost90, ticket: ticket, p25Rec: p25Rec, midRec: midRec,
      netEvP25: netP25, netEvMid: netMid, minDeposit: minDeposit, breakevenFdv: breakeven
    };

    var verdict = 'THIN';
    var chg = p.change_7d === null || p.change_7d === undefined ? 0 : p.change_7d;
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

    var cellOdds = oddsModel.flat ? oddsModel.prior : oddsModel.cells[cellIndex(p, model.as_of)].odds;
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
      change_7d: p.change_7d === undefined ? null : p.change_7d,
      listed_at: p.listed_at === undefined ? null : p.listed_at,
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
    var plan = buildFarmPlan(row, econ);
    row.farm_steps = plan.steps;
    row.step_meta = plan.meta;
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
        change_7d: p.change_7d === undefined ? null : p.change_7d,
        listed_at: p.listed_at === undefined ? null : p.listed_at
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
    rows.forEach(function (r) {
      aggImplied += r.implied_value_usd;
      aggTvl += r.tvl_usd;
      if (r.verdict === 'FARM') farm++;
      else if (r.verdict === 'THIN') thin++;
      else skip++;
      if (r.tvl_usd < WATCH_FLOOR) early++;
      if (r.in_watchlist) covered++;
    });
    var chainRows = [];
    rows.forEach(function (r) {
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
    roundTo, clamp, medianOf, quartileOf, rankCorr, pairAuc,
    moneyCompact, moneyFull, money2, pctText, signedMoney, escHtml,
    groupInt, depositText, catOf, ageDays, sortChains, feeProfile,
    cleanComps, boardUniverse, oddsFitSet, huberFit, compPoint,
    looBacktest, sectorTable, fitSizeCurve, fitLaunchOdds, cellIndex,
    buildCells, scoreProtocol, rankRows, tradedList, buildSummary,
    buildPayload, CHAIN_ORDER, CHEAP_CHAINS, L2_CHAINS, MID_CHAINS
  };
})();
