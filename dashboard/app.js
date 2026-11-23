// Token Launch Radar — dashboard behaviour: tabs, filters, sorting, modal. No network.
(function () {
  'use strict';
  var D = globalThis.RADAR_DATA;
  if (!D || !Array.isArray(D.rows)) return;
  var M = globalThis.RadarModel;
  var esc = M.escHtml, mc = M.moneyCompact, mf = M.moneyFull, m2 = M.money2, sm = M.signedMoney;
  var FLOOR = 50000000;

  function $(id) { return document.getElementById(id); }

  var state = { view: 'radar', q: '', sector: '', chain: '', verdict: '', growth: '', sort: 'rank', dir: 1 };
  var maxSize = 1;
  D.rows.forEach(function (r) { if (r.sizecurve_value_usd > maxSize) maxSize = r.sizecurve_value_usd; });
  var maxLog = Math.log10(maxSize) + 1;

  function growthOk(r) {
    var g = state.growth, c = r.change_7d;
    if (!g) return true;
    if (c === null || c === undefined) return false;
    if (g === 'pos') return c > 0;
    if (g === 'strong') return c >= 5;
    return c >= -10;
  }

  function hayPre(r) {
    return (r.name + ' ' + r.slug + ' ' + r.category + ' ' + r.chains.join(' ') + ' ' + r.verdict).toLowerCase();
  }

  function filteredPre() {
    var q = state.q.toLowerCase();
    return D.rows.filter(function (r) {
      if (state.view === 'watchlist' && !r.in_watchlist) return false;
      if (state.view === 'early' && r.tvl_usd >= FLOOR) return false;
      if (state.sector && r.category !== state.sector) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (!growthOk(r)) return false;
      if (q && hayPre(r).indexOf(q) === -1) return false;
      return true;
    });
  }

  function filteredLive() {
    var q = state.q.toLowerCase();
    return D.traded.filter(function (r) {
      if (state.sector && r.category !== state.sector) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (!growthOk(r)) return false;
      if (q && (r.name + ' ' + (r.symbol || '') + ' ' + r.category + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function sortVal(r, key) {
    if (key === 'netev') return r.net_ev_p25_usd;
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'chg') return r.change_7d === null || r.change_7d === undefined ? -9999 : r.change_7d;
    if (key === 'age') return r.age_days;
    if (key === 'cost') return r.est_cost_90d_usd;
    if (key === 'mcap') return r.mcap_usd;
    return r.implied_value_usd;
  }

  function sortRows(list, live) {
    var key = state.sort, dir = state.dir;
    list.sort(function (a, b) {
      if (key === 'rank') return dir * (a.rank - b.rank);
      if (live && key !== 'tvl' && key !== 'chg' && key !== 'mcap') return a.rank - b.rank;
      var d = (sortVal(a, key) - sortVal(b, key)) * dir;
      return d !== 0 ? d : a.rank - b.rank;
    });
    return list;
  }

  function defaultDir(key) { return (key === 'rank' || key === 'cost') ? 1 : -1; }

  function chainTags(r, max) {
    var chains = r.chains.slice();
    if (state.chain && chains.indexOf(state.chain) !== -1) {
      chains = [state.chain].concat(chains.filter(function (c) { return c !== state.chain; }));
    }
    var shown = chains.slice(0, max);
    var html = shown.map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('');
    if (chains.length > max) html += '<span class="tag">+' + (chains.length - max) + ' more</span>';
    return html;
  }

  function chgCell(c) {
    if (c === null || c === undefined) return '<td class="num flat">N/A</td>';
    var cls = c > 0.05 ? 'pos' : c < -0.05 ? 'neg' : 'flat';
    return '<td class="num ' + cls + '">' + M.pctText(c) + '</td>';
  }

  function preRow(r) {
    var barW = Math.max(5, Math.min(100, (Math.log10(r.sizecurve_value_usd) + 1) / maxLog * 100));
    var netCls = r.net_ev_p25_usd >= 2 ? 'pos' : r.net_ev_p25_usd >= -2 ? 'flat' : 'neg';
    return '<tr data-slug="' + esc(r.slug) + '"><td class="rank' + (r.rank <= 10 ? ' top10' : '') + '">#' + r.rank + '</td>' +
      '<td><span class="pname">' + esc(r.name) + '</span> ' +
      (r.in_watchlist ? '<span class="badge watch">Watchlist</span> ' : '') +
      '<span class="badge ' + r.verdict.toLowerCase() + '">' + r.verdict + '</span><br>' +
      '<span class="tag">' + esc(r.category) + '</span> ' + chainTags(r, 3) +
      '<span class="reason">' + esc(r.verdict_reason) + '</span></td>' +
      '<td class="num">' + mc(r.tvl_usd) + '<span class="sub">' + esc(r.farm_chain) + '</span></td>' +
      chgCell(r.change_7d) +
      '<td class="num">' + r.age_days + 'd<span class="sub">' + (r.age_days / 365).toFixed(1) + 'y</span></td>' +
      '<td class="num">' + mc(r.sizecurve_value_usd) + '<span class="bar"><i style="width:' + barW.toFixed(1) + '%"></i></span><span class="sub">' + mc(r.p25_usd) + '–' + mc(r.p75_usd) + '</span></td>' +
      '<td class="num">' + mc(r.implied_value_usd) + '<span class="sub">' + Math.round(r.launch_odds * 100) + '% launch odds</span></td>' +
      '<td class="num ' + netCls + '">' + sm(r.net_ev_p25_usd) + '<span class="sub">$' + (r.ticket_usd / 1000) + 'k ticket · min ' + M.depositText(r.min_deposit_usd) + '</span></td>' +
      '<td><button class="cost-btn" data-slug="' + esc(r.slug) + '">' + m2(r.est_cost_90d_usd) + ' →</button></td></tr>';
  }

  function liveRow(r) {
    var res = (r.resid_log >= 0 ? '+' : '') + r.resid_log.toFixed(2);
    return '<tr data-slug="' + esc(r.slug) + '" data-live="1"><td class="rank">#' + r.rank + '</td>' +
      '<td><span class="pname">' + esc(r.name) + '</span> ' +
      (r.symbol ? '<span class="badge ticker">' + esc(r.symbol) + '</span> ' : '') + '<br>' +
      '<span class="tag">' + esc(r.category) + '</span> ' + chainTags(r, 3) + '</td>' +
      '<td class="num">' + mc(r.mcap_usd) + '</td><td class="num">' + mc(r.tvl_usd) + '</td>' +
      '<td class="num">' + r.mcap_tvl.toFixed(2) + 'x</td>' +
      '<td class="num">' + mc(r.pred_usd) + '<span class="sub">resid ' + res + ' log10</span></td>' +
      chgCell(r.change_7d) + '</tr>';
  }

  var PRE_HEADS = [['rank', 'Rank'], ['name', 'Protocol and Verdict'], ['tvl', 'Locked TVL'], ['chg', '7d Chg'], ['age', 'Age'], ['implied', 'Size-Curve Value (P25–P75)'], ['implied', 'Expected Value (Implied × Odds)'], ['netev', 'P25 Net EV (Rec. Ticket)'], ['cost', '90d Cost / Plan']];
  var LIVE_HEADS = [['rank', 'Rank'], ['name', 'Protocol and Ticker'], ['mcap', 'Market Cap'], ['tvl', 'TVL'], ['ratio', 'MCap / TVL'], ['mcap', 'Curve Pred'], ['chg', '7d TVL']];

  function renderHead(live) {
    var heads = live ? LIVE_HEADS : PRE_HEADS;
    $('boardHead').innerHTML = '<tr>' + heads.map(function (h) {
      var cls = state.sort === h[0] ? ' class="sorted' + (state.dir < 0 ? ' desc' : '') + '"' : '';
      return '<th data-sort="' + h[0] + '"' + cls + '>' + h[1] + '</th>';
    }).join('') + '</tr>';
  }

  function activeFilters() {
    var out = [];
    if (state.view === 'watchlist') out.push('Watchlist');
    if (state.view === 'early') out.push('Early under $50M');
    if (state.view === 'live') out.push('Traded Comps');
    if (state.sector) out.push('Sector: ' + state.sector);
    if (state.chain) out.push('Chain: ' + state.chain);
    if (state.verdict) out.push(state.verdict);
    if (state.growth) out.push('Growth: ' + state.growth);
    if (state.q) out.push('Search: ' + state.q);
    return out;
  }

  function render() {
    var live = state.view === 'live';
    var list = live ? sortRows(filteredLive(), true) : sortRows(filteredPre(), false);
    renderHead(live);
    $('boardBody').innerHTML = list.map(live ? liveRow : preRow).join('');
    $('emptyState').hidden = list.length > 0;
    $('liveNote').hidden = !live;
    var filters = activeFilters();
    $('banner').hidden = filters.length === 0;
    if (filters.length > 0) {
      var total = live ? D.traded.length : D.rows.length;
      var sumVal = 0, sumTvl = 0;
      list.forEach(function (r) { sumVal += live ? r.mcap_usd : r.implied_value_usd; sumTvl += r.tvl_usd; });
      $('bannerText').textContent = filters.join(' · ') + ' — ' + list.length + ' of ' + total +
        ' · ' + mc(sumVal) + (live ? ' market cap' : ' implied') + ' · ' + mc(sumTvl) + ' TVL';
    }
    document.querySelectorAll('#tabs .tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-view') === state.view);
    });
    document.querySelectorAll('#chainChips .chip').forEach(function (c) {
      c.classList.toggle('active', (c.getAttribute('data-chain') || '') === state.chain);
    });
  }

  function statCard(t, v, s) { return '<div class="stat"><h4>' + t + '</h4><div class="v">' + v + '</div><span class="sub">' + s + '</span></div>'; }
  function valRow(k, v) { return '<span class="k">' + k + '</span><span class="v">' + v + '</span>'; }
  function panel(t, s, body) { return '<div class="panel"><h3>' + t + '</h3><p class="panel-sub">' + s + '</p>' + body + '</div>'; }

  function closestComps(row) {
    var scored = D.traded.map(function (t) {
      return { t: t, d: Math.abs(Math.log10(t.tvl_usd) - Math.log10(row.tvl_usd)) };
    });
    scored.sort(function (a, b) { return a.d - b.d; });
    return scored.slice(0, 3).map(function (s) { return s.t; });
  }

  function compTable(list) {
    return '<table class="mini"><thead><tr><th>Protocol</th><th>TVL</th><th>Market Cap</th><th>Ratio</th></tr></thead><tbody>' +
      list.map(function (t) {
        return '<tr><td>' + esc(t.name) + '</td><td class="num">' + mc(t.tvl_usd) + '</td><td class="num">' + mc(t.mcap_usd) + '</td><td class="num">' + t.mcap_tvl.toFixed(2) + 'x</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function stripTrail(text) {
    return text.replace(/\s*\([^)]*\)\s*$/, '');
  }

  function openModal(row, list) {
    var v = row.valuation, m = D.model;
    var drivers = [];
    if (v.sector_traded > 0) drivers.push('a sector lift of ' + v.sector_mult.toFixed(2) + 'x');
    if (v.velocity_mult !== 1) drivers.push('a 7d velocity of ' + v.velocity_mult.toFixed(2) + 'x');
    if (v.age_mult !== 1) drivers.push('an age tilt of ' + v.age_mult.toFixed(2) + 'x');
    var driverText = '';
    if (drivers.length === 1) driverText = ' with ' + drivers[0];
    else if (drivers.length === 2) driverText = ' with ' + drivers[0] + ' and ' + drivers[1];
    else if (drivers.length > 2) driverText = ' with ' + drivers.slice(0, -1).join(', ') + ', and ' + drivers[drivers.length - 1];
    var idx = -1;
    list.forEach(function (r, i) { if (r.slug === row.slug) idx = i; });
    var gap;
    if (idx >= 0 && idx + 1 < list.length) {
      var next = list[idx + 1];
      gap = ' It sits ' + mc(row.implied_value_usd - next.implied_value_usd) + ' above rank #' + next.rank + ' (' + next.slug + ', ' + mc(next.implied_value_usd) + ').';
    } else {
      gap = ' It is the lowest-ranked row in this view.';
    }
    var why = 'Rank #' + row.rank + ' ranks here because its implied value of ' + mc(row.implied_value_usd) +
      ' equals its size-curve value of ' + mc(row.sizecurve_value_usd) + ' (P25–P75 ' + mc(row.p25_usd) + '–' + mc(row.p75_usd) + ')' +
      ' times ' + Math.round(row.launch_odds * 100) + '% launch odds, fitted by age and TVL tier from the snapshot\u2019s launched versus pre-token record,' +
      ' from ' + mc(row.tvl_usd) + ' of TVL' + driverText + '. Verdict: ' + row.verdict + ' — ' + row.verdict_reason +
      ' P25 net EV is ' + sm(row.net_ev_p25_usd) + ' on ' + row.farm_chain + ' after ' + m2(row.est_cost_90d_usd) +
      ' of 90d cost, the P25 value if the token launches.' + gap;
    var mid1 = (row.net_ev_mid_usd < 0 ? '-' : '+') + '$' + Math.abs(row.net_ev_mid_usd).toFixed(1);
    var sectorComps = D.traded.filter(function (t) { return t.category === row.category; }).slice(0, 3);
    $('modalBody').innerHTML =
      '<h2>#' + row.rank + ' ' + esc(row.name) + ' ' +
      (row.in_watchlist ? '<span class="badge watch">Watchlist</span> ' : '') +
      '<span class="badge ' + row.verdict.toLowerCase() + '">' + row.verdict + '</span> ' +
      '<span class="tag">' + esc(row.category) + '</span></h2>' +
      '<div>' + chainTags(row, 7) + '</div>' +
      '<div class="why"><h3>Why this rank</h3><p>' + esc(why) + '</p></div>' +
      '<div class="stats4">' +
      statCard('Locked TVL', mc(row.tvl_usd), M.pctText(row.change_7d) + ' · ' + row.age_days + 'd') +
      statCard('Implied Value (P25–P75)', mc(row.implied_value_usd), mc(row.p25_usd) + '–' + mc(row.p75_usd)) +
      statCard('Rec. Ticket and Min BE', mf(row.ticket_usd), 'min ' + M.depositText(row.min_deposit_usd)) +
      statCard('Net EV (P25 / Mid)', sm(row.net_ev_p25_usd), 'mid ' + mid1 + ' · ' + esc(row.farm_chain) + ' · ' + m2(row.est_cost_90d_usd) + ' 90d') +
      '</div>' +
      '<div class="detail2"><div>' +
      panel('Empirical Size-Curve Valuation', 'LOOCV ' + m.oos_fold_err + 'x · ρ ' + m.spearman_rho + ' · N=' + m.traded_count,
        '<div class="valgrid">' +
        valRow('Power-law size base (slope ' + m.slope + ')', mc(v.size_base_usd)) +
        valRow('Sector lift — ' + esc(row.category) + ' (n=' + v.sector_traded + ', w=' + v.shrink_weight.toFixed(2) + ')', v.sector_mult.toFixed(2) + 'x') +
        valRow('7d velocity tilt', v.velocity_mult.toFixed(2) + 'x') +
        valRow('Tracked age tilt · ' + v.age_days + 'd', v.age_mult.toFixed(2) + 'x') +
        valRow('Size-curve value (P25–P75)', mc(v.raw_usd) + ' (' + mc(v.p25_usd) + '–' + mc(v.p75_usd) + ')') +
        valRow('Launch odds', row.launch_odds.toFixed(3)) +
        valRow('Implied value = expected value', mc(row.implied_value_usd)) +
        '</div>') +
      panel('Closest Size-Tier Comps', 'Nearest TVL cohort', compTable(closestComps(row))) +
      panel('Sector Comps', esc(row.category),
        sectorComps.length ? compTable(sectorComps) : '<p>No direct traded sector comp — shrinkage reverts fully to the size curve.</p>') +
      '</div><div>' +
      panel('Dollar-Netted 90-Day Farm Plan', esc(row.farm_chain) + ' · ' + m2(row.est_cost_90d_usd) + ' 90d · BE FDV ' + mc(row.breakeven_fdv_usd),
        '<p><span class="badge ' + row.verdict.toLowerCase() + '">' + row.verdict + '</span> ' + esc(row.verdict_reason) + '</p>' +
        row.step_meta.map(function (s, i) {
          return '<div class="step"><span class="n">' + (i + 1) + '</span><div><div>' + esc(stripTrail(s.text)) + '</div><div class="badges"><span class="tag">' + esc(s.cost) + '</span><span class="tag">' + esc(s.time) + '</span></div></div></div>';
        }).join('')) +
      '</div></div>';
    $('modalBackdrop').hidden = false;
  }

  function openLiveModal(row) {
    var res = (row.resid_log >= 0 ? '+' : '') + row.resid_log.toFixed(2);
    $('modalBody').innerHTML =
      '<h2>#' + row.rank + ' ' + esc(row.name) + ' ' +
      (row.symbol ? '<span class="badge ticker">' + esc(row.symbol) + '</span> ' : '') +
      '<span class="tag">' + esc(row.category) + '</span></h2>' +
      '<div>' + chainTags(row, 7) + '</div>' +
      '<div class="why"><h3>Why this comp matters</h3><p>Traded comp that fits the Huber size curve and LOOCV backtest: market cap ' + mc(row.mcap_usd) + ' on ' + mc(row.tvl_usd) + ' TVL (ratio ' + row.mcap_tvl.toFixed(2) + 'x); curve predicts ' + mc(row.pred_usd) + ', residual ' + res + ' log10.</p></div>' +
      '<div class="stats4">' +
      statCard('Market Cap', mc(row.mcap_usd), '') +
      statCard('Locked TVL', mc(row.tvl_usd), M.pctText(row.change_7d)) +
      statCard('MCap / TVL', row.mcap_tvl.toFixed(2) + 'x', '') +
      statCard('Curve Pred', mc(row.pred_usd), 'resid ' + res + ' log10') +
      '</div>';
    $('modalBackdrop').hidden = false;
  }

  function closeModal() { $('modalBackdrop').hidden = true; }

  function openBySlug(slug) {
    var list = state.view === 'live' ? sortRows(filteredLive(), true) : sortRows(filteredPre(), false);
    var row = null;
    list.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) {
      var all = state.view === 'live' ? D.traded : D.rows;
      all.forEach(function (r) { if (r.slug === slug) row = r; });
      if (row) list = [row];
    }
    if (!row) return;
    if (state.view === 'live') openLiveModal(row); else openModal(row, list);
  }

  function fillSelect(sel, items, fmt) {
    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = it.name;
      o.textContent = fmt(it);
      sel.appendChild(o);
    });
  }

  function init() {
    var s = D.summary, m = D.model, o = m.launchOddsStats;
    $('pillDate').textContent = s.as_of;
    $('pillWatch').textContent = s.watchlist_covered + '/' + s.watchlist_total;
    $('kpiWatch').textContent = s.watchlist_covered + '/' + s.watchlist_total;
    $('kpiRows').textContent = String(D.rows.length);
    $('kpiVerdicts').textContent = s.farm_count + ' FARM · ' + s.thin_count + ' THIN · ' + s.skip_count + ' SKIP';
    $('kpiValue').textContent = mc(s.agg_implied_usd);
    $('kpiTvl').textContent = mc(s.agg_tvl_usd) + ' TVL (' + s.early_count + ' under $50M)';
    $('kpiFold').textContent = m.oos_fold_err + 'x';
    $('kpiCurve').textContent = 'ρ ' + m.spearman_rho + ' · slope ' + m.slope + ' · LOOCV N=' + m.traded_count;
    $('countRadar').textContent = String(D.rows.length);
    $('countWatch').textContent = String(s.watchlist_covered);
    $('countEarly').textContent = String(s.early_count);
    $('countLive').textContent = String(D.traded.length);
    $('modelAccuracy').textContent = 'Model check: on held-out traded comps (leave-one-out cross-validation, N=' + m.traded_count + '), the size curve predicts market cap within ' + m.oos_fold_err + 'x, rank correlation ' + m.spearman_rho + ' versus TVL. Launch odds (age by TVL tier, from the snapshot\u2019s launched versus pre-token record) scored ' + o.mean_auc.toFixed(2) + ' AUC held-out.' + (o.flat ? ' No held-out signal, so a flat prior is used for every row.' : '');
    $('footer').textContent = s.source + ' · Floor ' + mc(s.floor_usd) + ' · 100% offline · Shared dashboard/model.js engine · TVL-calibrated ticket Net EV (1k / 5k / 20k dollars)';
    fillSelect($('sectorSel'), s.top_categories, function (c) { return c.name + ' (' + c.count + ')'; });
    fillSelect($('chainSel'), s.top_chains, function (c) { return c.name + ' (' + c.count + ')'; });
    var chips = ['All', 'Ethereum', 'Arbitrum', 'Base', 'Solana', 'Monad', 'Sui'];
    $('chainChips').innerHTML = chips.map(function (c) {
      return '<button class="chip' + (c === 'All' ? ' active' : '') + '" data-chain="' + (c === 'All' ? '' : c) + '">' + c + '</button>';
    }).join('');

    document.querySelectorAll('#tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.view = t.getAttribute('data-view');
        if (state.view === 'live' && ['rank', 'mcap', 'tvl', 'chg'].indexOf(state.sort) === -1) {
          state.sort = 'rank'; state.dir = 1; $('sortSel').value = 'rank';
        }
        render();
      });
    });
    $('search').addEventListener('input', function (e) { state.q = e.target.value; render(); });
    $('sectorSel').addEventListener('change', function (e) { state.sector = e.target.value; render(); });
    $('chainSel').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    $('verdictSel').addEventListener('change', function (e) { state.verdict = e.target.value; render(); });
    $('growthSel').addEventListener('change', function (e) { state.growth = e.target.value; render(); });
    $('sortSel').addEventListener('change', function (e) {
      state.sort = e.target.value;
      state.dir = defaultDir(state.sort);
      render();
    });
    $('chainChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      state.chain = b.getAttribute('data-chain') || '';
      $('chainSel').value = state.chain;
      render();
    });
    function resetAll() {
      state.view = 'radar'; state.q = ''; state.sector = ''; state.chain = '';
      state.verdict = ''; state.growth = ''; state.sort = 'rank'; state.dir = 1;
      $('search').value = ''; $('sectorSel').value = ''; $('chainSel').value = '';
      $('verdictSel').value = ''; $('growthSel').value = ''; $('sortSel').value = 'rank';
      render();
    }
    $('resetAll').addEventListener('click', resetAll);
    $('clearFilters').addEventListener('click', resetAll);
    $('boardHead').addEventListener('click', function (e) {
      var th = e.target.closest('th');
      if (!th) return;
      var key = th.getAttribute('data-sort');
      if (!key || key === 'name' || key === 'ratio') return;
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = defaultDir(key); }
      if (['rank', 'implied', 'netev', 'tvl', 'chg', 'cost', 'age'].indexOf(key) !== -1) $('sortSel').value = key;
      render();
    });
    $('boardBody').addEventListener('click', function (e) {
      var tr = e.target.closest('tr');
      if (!tr) return;
      openBySlug(tr.getAttribute('data-slug'));
    });
    $('modalClose').addEventListener('click', closeModal);
    $('modalBackdrop').addEventListener('click', function (e) { if (e.target === $('modalBackdrop')) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key === '/' && document.activeElement !== $('search') && $('modalBackdrop').hidden) {
        e.preventDefault();
        $('search').focus();
      }
    });

    var params = new URLSearchParams(window.location.search);
    if (params.get('view')) {
      var v = params.get('view');
      if (['radar', 'watchlist', 'early', 'live'].indexOf(v) !== -1) state.view = v;
    }
    render();
    if (params.get('open')) openBySlug(params.get('open'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
