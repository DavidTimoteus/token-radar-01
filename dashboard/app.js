(() => {
  const data = window.RADAR_DATA;
  if (!data || !Array.isArray(data.rows)) return;

  const st = {
    view: 'radar',
    search: '',
    category: '',
    chain: '',
    tier: '',
    growth: '',
    sort: 'rank',
    dir: 'asc',
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    pillDate: $('pillSnapshotDate'),
    pillWl: $('pillWatchlist'),
    pillModel: $('pillModelMeta'),
    kpiWl: $('kpiWatchlist'),
    kpiWlSub: $('kpiWatchlistSub'),
    kpiUniv: $('kpiUniverse'),
    kpiUnivSub: $('kpiUniverseSub'),
    kpiImp: $('kpiImplied'),
    kpiImpSub: $('kpiImpliedSub'),
    kpiFit: $('kpiModelFit'),
    kpiFitSub: $('kpiModelSub'),
    legTradedN: $('legTradedN'),
    chartWrap: $('compsChartWrap'),
    tabRadarCount: $('tabRadarCount'),
    tabWlCount: $('tabWlCount'),
    tabEarlyCount: $('tabEarlyCount'),
    tabLiveCount: $('tabLiveCount'),
    search: $('searchInput'),
    category: $('categorySelect'),
    chain: $('chainSelect'),
    tier: $('tierSelect'),
    growth: $('growthSelect'),
    sort: $('sortSelect'),
    chips: $('quickChips'),
    resetBtn: $('resetBtn'),
    banner: $('activeFilterBanner'),
    bannerText: $('activeFilterText'),
    bannerClear: $('bannerClearBtn'),
    benchNote: $('benchmarkNote'),
    thead: $('tableHead'),
    tbody: $('tableBody'),
    empty: $('emptyState'),
    footerSrc: $('footerSource'),
    modal: $('detailModal'),
    modalTitle: $('modalTitle'),
    modalChains: $('modalChains'),
    modalBody: $('modalBody'),
    modalClose: $('modalCloseBtn'),
  };

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function formatUsd(n) {
    if (n == null || !Number.isFinite(n)) return '--';
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${Math.round(n).toLocaleString('en-US')}`;
  }

  function formatFullUsd(n) {
    return n == null || !Number.isFinite(n) ? '--' : `$${Math.round(n).toLocaleString('en-US')}`;
  }

  function formatPct(v) {
    if (v == null || !Number.isFinite(v)) return '<span class="flat">N/A</span>';
    const cls = v > 0.01 ? 'pos' : v < -0.01 ? 'neg' : 'flat';
    return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
  }

  function tierBadgeHtml(tier) {
    if (tier === 'Prime Target') return '<span class="badge badge-prime">PRIME</span>';
    if (tier === 'Early Alpha (<$50M)') return '<span class="badge badge-early">EARLY ALPHA</span>';
    if (tier === 'Thin / Skip') return '<span class="badge badge-skip">THIN / SKIP</span>';
    return '<span class="badge badge-monitor">MONITOR</span>';
  }

  function buildHeaderMetrics() {
    const s = data.summary;
    const m = data.modelStats;
    els.pillDate.textContent = s.as_of;
    els.pillWl.textContent = `${s.watchlist_covered} / ${s.watchlist_total}`;
    els.pillModel.textContent = `Huber+EB (N=${m.n_traded})`;
    els.kpiWl.textContent = `${s.watchlist_covered} / ${s.watchlist_total}`;
    els.kpiWlSub.textContent = `100% of floor >= ${formatUsd(s.floor_usd)} watchlist`;
    els.kpiUniv.textContent = String(data.rows.length);
    els.kpiUnivSub.textContent = `${s.prime_count} Prime · ${s.early_alpha_count} Early <$50M · ${s.skip_count} Skip`;
    els.kpiImp.textContent = formatUsd(s.aggregate_implied_usd);
    els.kpiImpSub.textContent = `P25–P75 band: ${formatUsd(s.aggregate_p25_usd)} – ${formatUsd(s.aggregate_p75_usd)}`;
    els.kpiFit.textContent = `R² ${m.loocv_r2.toFixed(3)}`;
    els.kpiFitSub.textContent = `β_TVL ${m.beta_tvl.toFixed(3)} · LOOCV MdAPE ${m.loocv_mdape_pct.toFixed(0)}% (N=${m.n_traded})`;

    els.legTradedN.textContent = String(m.n_traded);
    els.tabRadarCount.textContent = String(data.rows.length);
    els.tabWlCount.textContent = String(s.watchlist_covered);
    els.tabEarlyCount.textContent = String(s.early_alpha_count);
    els.tabLiveCount.textContent = String(data.liveTokens.length);
    els.footerSrc.textContent = `${s.source} · Snapshot floor ${formatUsd(s.floor_usd)}`;

    for (const c of s.top_categories) {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = `${c.name} (${c.count})`;
      els.category.appendChild(o);
    }
    for (const ch of s.top_chains) {
      const o = document.createElement('option');
      o.value = ch.name;
      o.textContent = `${ch.name} (${ch.count})`;
      els.chain.appendChild(o);
    }
  }

  function renderCompsChart() {
    const m = data.modelStats;
    const W = 540;
    const H = 132;
    const pad = { l: 42, r: 12, t: 8, b: 22 };
    const xMin = 6.5;
    const xMax = 10.6;
    const yMin = 4.6;
    const yMax = 10.6;
    const px = (lx) => pad.l + ((lx - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
    const py = (ly) => H - pad.b - ((ly - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

    const gridX = [7, 8, 9, 10]
      .map((gx) => {
        const x = px(gx).toFixed(1);
        const lbl = gx === 7 ? '$10M' : gx === 8 ? '$100M' : gx === 9 ? '$1B' : '$10B';
        return `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${H - pad.b}" stroke="rgba(148,163,184,0.12)"/><text x="${x}" y="${H - 6}" fill="#64748b" font-size="9" text-anchor="middle">${lbl}</text>`;
      })
      .join('');

    const gridY = [6, 8, 10]
      .map((gy) => {
        const y = py(gy).toFixed(1);
        const lbl = gy === 6 ? '$1M' : gy === 8 ? '$100M' : '$10B';
        return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="rgba(148,163,184,0.12)"/><text x="${pad.l - 5}" y="${Number(y) + 3}" fill="#64748b" font-size="9" text-anchor="end">${lbl}</text>`;
      })
      .join('');

    const lineY = (lx, shift = 0) => m.intercept + m.beta_tvl * lx + shift;
    const x1 = xMin;
    const x2 = xMax;
    const bandPts = [
      `${px(x1).toFixed(1)},${py(lineY(x1, m.residual_q75_log10)).toFixed(1)}`,
      `${px(x2).toFixed(1)},${py(lineY(x2, m.residual_q75_log10)).toFixed(1)}`,
      `${px(x2).toFixed(1)},${py(lineY(x2, m.residual_q25_log10)).toFixed(1)}`,
      `${px(x1).toFixed(1)},${py(lineY(x1, m.residual_q25_log10)).toFixed(1)}`,
    ].join(' ');

    const tradedDots = data.liveTokens
      .map((t) => {
        const cx = px(Math.min(xMax, Math.max(xMin, Math.log10(t.tvl_usd)))).toFixed(1);
        const cy = py(Math.min(yMax, Math.max(yMin, Math.log10(t.mcap_usd)))).toFixed(1);
        return `<circle cx="${cx}" cy="${cy}" r="2.5" fill="rgba(148,163,184,0.52)"/>`;
      })
      .join('');

    const topPre = data.rows
      .filter((r) => r.in_watchlist)
      .slice(0, 15)
      .map((r) => {
        const cx = px(Math.min(xMax, Math.max(xMin, Math.log10(r.tvl_usd))));
        const cy = py(Math.min(yMax, Math.max(yMin, Math.log10(r.implied_value_usd))));
        return `<polygon points="${cx.toFixed(1)},${(cy - 3.6).toFixed(1)} ${(cx + 3.6).toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${(cy + 3.6).toFixed(1)} ${(cx - 3.6).toFixed(1)},${cy.toFixed(1)}" fill="#f59e0b" stroke="#0a0e17" stroke-width="0.7"/>`;
      })
      .join('');

    els.chartWrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${gridX}${gridY}<polygon points="${bandPts}" fill="rgba(16,185,129,0.11)"/><line x1="${px(x1).toFixed(1)}" y1="${py(lineY(x1)).toFixed(1)}" x2="${px(x2).toFixed(1)}" y2="${py(lineY(x2)).toFixed(1)}" stroke="#10b981" stroke-width="1.8"/>${tradedDots}${topPre}</svg>`;
  }

  function applyRadarFilters() {
    const q = st.search.trim().toLowerCase();
    if (st.view === 'live') {
      const liveOut = data.liveTokens.filter((t) => {
        if (st.category && t.category !== st.category) return false;
        if (st.chain && !t.chains.includes(st.chain)) return false;
        if (st.growth === 'pos' && (t.change_7d ?? -999) <= 0) return false;
        if (st.growth === 'hot' && (t.change_7d ?? -999) < 5) return false;
        if (st.growth === 'stable' && (t.change_7d ?? -999) < -10) return false;
        return !q || `${t.name} ${t.symbol} ${t.slug} ${t.category} ${t.chains.join(' ')}`.toLowerCase().includes(q);
      });
      const mul = st.dir === 'asc' ? 1 : -1;
      liveOut.sort((a, b) => {
        if (st.sort === 'tvl') return (a.tvl_usd - b.tvl_usd) * mul;
        if (st.sort === 'growth') return ((a.change_7d ?? -9999) - (b.change_7d ?? -9999)) * mul;
        if (st.sort === 'mcap') return (a.mcap_usd - b.mcap_usd) * mul;
        return (a.rank - b.rank) * (st.sort === 'rank' ? mul : 1);
      });
      return liveOut;
    }

    const out = data.rows.filter((r) => {
      if (st.view === 'watchlist' && !r.in_watchlist) return false;
      if (st.view === 'early' && r.tier !== 'Early Alpha (<$50M)') return false;
      if (st.category && r.category !== st.category) return false;
      if (st.chain && !r.chains.includes(st.chain)) return false;
      if (st.tier && r.tier !== st.tier) return false;
      if (st.growth === 'pos' && (r.change_7d ?? -999) <= 0) return false;
      if (st.growth === 'hot' && (r.change_7d ?? -999) < 5) return false;
      if (st.growth === 'stable' && (r.change_7d ?? -999) < -10) return false;
      return !q || `${r.name} ${r.slug} ${r.category} ${r.chains.join(' ')} ${r.tier}`.toLowerCase().includes(q);
    });

    const mul = st.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      if (st.sort === 'tvl') return (a.tvl_usd - b.tvl_usd) * mul || a.rank - b.rank;
      if (st.sort === 'growth') return ((a.change_7d ?? -9999) - (b.change_7d ?? -9999)) * mul || a.rank - b.rank;
      if (st.sort === 'age') return (a.age_days - b.age_days) * mul || a.rank - b.rank;
      if (st.sort === 'cost') return (a.est_cost_90d_usd - b.est_cost_90d_usd) * mul || a.rank - b.rank;
      if (st.sort === 'breakeven') return (a.breakeven_fdv_usd - b.breakeven_fdv_usd) * mul || a.rank - b.rank;
      if (st.sort === 'implied') return (a.implied_value_usd - b.implied_value_usd) * mul || a.rank - b.rank;
      return (a.rank - b.rank) * mul;
    });
    return out;
  }

  function renderFilterBanner(list) {
    const parts = [];
    if (st.view === 'watchlist') parts.push('Universe = Watchlist Floor (40)');
    if (st.view === 'early') parts.push('Universe = Early Alpha <$50M');
    if (st.chain) parts.push(`Chain = ${st.chain}`);
    if (st.category) parts.push(`Sector = ${st.category}`);
    if (st.tier) parts.push(`Tier = ${st.tier}`);
    if (st.growth) parts.push(`7d Growth = ${els.growth.options[els.growth.selectedIndex].text}`);
    if (st.search.trim()) parts.push(`Query = "${st.search.trim()}"`);
    if (st.sort !== 'rank' || st.dir !== 'asc') parts.push(`Sort = ${st.sort} (${st.dir.toUpperCase()})`);

    if (!parts.length) {
      els.banner.hidden = true;
      return;
    }
    const total = st.view === 'live' ? data.liveTokens.length : data.rows.length;
    const sumVal =
      st.view === 'live'
        ? list.reduce((a, t) => a + t.mcap_usd, 0)
        : list.reduce((a, r) => a + r.implied_value_usd, 0);
    const sumTvl = list.reduce((a, r) => a + r.tvl_usd, 0);
    const lbl = st.view === 'live' ? 'MCap' : 'Implied Value';
    els.bannerText.textContent = `Active: ${parts.join(' · ')} · Showing ${list.length} of ${total} · ${lbl}: ${formatUsd(sumVal)} · TVL: ${formatUsd(sumTvl)}`;
    els.banner.hidden = false;
  }

  function sortIndicator(col) {
    if (st.sort !== col) return '';
    return st.dir === 'asc' ? ' ▲' : ' ▼';
  }

  function renderBoardTable() {
    for (const b of document.querySelectorAll('.tab-btn')) {
      const on = b.dataset.view === st.view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    }
    for (const c of els.chips.querySelectorAll('.chip[data-chain]')) {
      c.classList.toggle('active', (c.dataset.chain || '') === st.chain);
    }
    els.chain.value = st.chain;
    els.category.value = st.category;
    els.tier.value = st.tier;
    els.growth.value = st.growth;
    els.sort.value = [...els.sort.options].some((o) => o.value === st.sort) ? st.sort : 'rank';
    els.tier.disabled = st.view === 'live';
    els.benchNote.hidden = st.view !== 'live';

    const list = applyRadarFilters();
    renderFilterBanner(list);
    els.empty.hidden = list.length > 0;

    if (st.view === 'live') {
      els.thead.innerHTML = `<tr>
        <th class="sortable ${st.sort === 'rank' ? 'sorted' : ''}" data-sort="rank">Rank${sortIndicator('rank')}</th>
        <th>Protocol &amp; Ticker</th>
        <th class="num sortable ${st.sort === 'mcap' ? 'sorted' : ''}" data-sort="mcap">Market Cap${sortIndicator('mcap')}</th>
        <th class="num sortable ${st.sort === 'tvl' ? 'sorted' : ''}" data-sort="tvl">TVL${sortIndicator('tvl')}</th>
        <th class="num">MCap / TVL</th>
        <th class="num">Model Pred</th>
        <th class="num sortable ${st.sort === 'growth' ? 'sorted' : ''}" data-sort="growth">7d TVL${sortIndicator('growth')}</th>
      </tr>`;
      els.tbody.innerHTML = list
        .map((t) => {
          const ch = t.chains.slice(0, 3).map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('');
          const ratio = t.mcap_to_tvl !== null ? `${t.mcap_to_tvl.toFixed(2)}x` : '--';
          return `<tr>
            <td class="rank-cell ${t.rank <= 10 ? 'rank-top' : ''}">#${t.rank}</td>
            <td><div class="proto-name-row"><span class="proto-name">${esc(t.name)}</span><span class="badge badge-ticker">${esc(t.symbol)}</span></div><div class="proto-meta"><span class="cat-tag">${esc(t.category)}</span>${ch}</div></td>
            <td class="num">${formatUsd(t.mcap_usd)}</td>
            <td class="num">${formatUsd(t.tvl_usd)}</td>
            <td class="num">${ratio}</td>
            <td class="num">${formatUsd(t.model_pred_usd)}<span class="sub-line">res ${t.residual_log10 >= 0 ? '+' : ''}${t.residual_log10.toFixed(2)}</span></td>
            <td class="num">${formatPct(t.change_7d)}</td>
          </tr>`;
        })
        .join('');
      return;
    }

    els.thead.innerHTML = `<tr>
      <th class="sortable ${st.sort === 'rank' ? 'sorted' : ''}" data-sort="rank">Rank${sortIndicator('rank')}</th>
      <th>Protocol &amp; Triage</th>
      <th class="num sortable ${st.sort === 'tvl' ? 'sorted' : ''}" data-sort="tvl">Locked TVL${sortIndicator('tvl')}</th>
      <th class="num sortable ${st.sort === 'growth' ? 'sorted' : ''}" data-sort="growth">7d Change${sortIndicator('growth')}</th>
      <th class="num sortable ${st.sort === 'age' ? 'sorted' : ''}" data-sort="age">Age${sortIndicator('age')}</th>
      <th class="num sortable ${st.sort === 'implied' || st.sort === 'rank' ? 'sorted' : ''}" data-sort="implied">Implied Value (P25–P75)${sortIndicator('implied')}</th>
      <th class="num sortable ${st.sort === 'cost' ? 'sorted' : ''}" data-sort="cost">90d Farm Cost / Plan${sortIndicator('cost')}</th>
    </tr>`;

    const maxV = data.rows[0]?.implied_value_usd || 1;
    els.tbody.innerHTML = list
      .map((r) => {
        const w = Math.max(5, Math.min(100, Math.round((Math.log10(r.implied_value_usd + 1) / Math.log10(maxV + 1)) * 100)));
        const wlBadge = r.in_watchlist ? '<span class="badge badge-wl">WATCHLIST</span>' : '';
        const orderedChains = st.chain ? [st.chain, ...r.chains.filter((c) => c !== st.chain)] : r.chains;
        const chTags = orderedChains.slice(0, 3).map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('');
        const more = orderedChains.length > 3 ? `<span class="chain-tag">+${orderedChains.length - 3}</span>` : '';
        return `<tr data-slug="${esc(r.slug)}">
          <td class="rank-cell ${r.rank <= 10 ? 'rank-top' : ''}">#${r.rank}</td>
          <td><div class="proto-name-row"><span class="proto-name">${esc(r.name)}</span>${wlBadge}${tierBadgeHtml(r.tier)}</div><div class="proto-meta"><span class="cat-tag">${esc(r.category)}</span>${chTags}${more}</div></td>
          <td class="num">${formatUsd(r.tvl_usd)}<span class="sub-line">${esc(r.primary_chain)}</span></td>
          <td class="num">${formatPct(r.change_7d)}</td>
          <td class="num">${r.age_days}d<span class="sub-line">${(r.age_days / 365).toFixed(1)}y</span></td>
          <td class="num"><div class="val-box"><span class="val-main">${formatUsd(r.implied_value_usd)}</span><span class="val-track"><span class="val-fill" style="width:${w}%"></span></span><span class="sub-line">${formatUsd(r.p25_usd)} – ${formatUsd(r.p75_usd)}</span></div></td>
          <td class="num"><button type="button" class="farm-pill-btn" data-slug="${esc(r.slug)}">$${r.est_cost_90d_usd.toFixed(0)} / $${r.ticket_usd} &rarr;</button></td>
        </tr>`;
      })
      .join('');
  }

  function renderProtocolDetail(slug) {
    const row = data.rows.find((r) => r.slug === slug);
    if (!row) return;
    const v = row.valuation;
    const m = data.modelStats;
    const wlBadge = row.in_watchlist ? '<span class="badge badge-wl">WATCHLIST</span>' : '';
    els.modalTitle.innerHTML = `<span class="mono" style="color:var(--emerald)">#${row.rank}</span> ${esc(row.name)} ${wlBadge} ${tierBadgeHtml(row.tier)} <span class="cat-tag">${esc(row.category)}</span>`;
    els.modalChains.innerHTML = row.chains.map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('');

    const peers = data.liveTokens.filter((t) => t.category === row.category).slice(0, 4);
    const peersHtml = peers.length
      ? `<table class="peer-table"><thead><tr><th>Traded Peer</th><th class="num">MCap</th><th class="num">TVL</th><th class="num">Ratio</th></tr></thead><tbody>${peers
          .map(
            (p) =>
              `<tr><td><strong>${esc(p.name)}</strong> <span class="badge badge-ticker">${esc(p.symbol)}</span></td><td class="num">${formatUsd(p.mcap_usd)}</td><td class="num">${formatUsd(p.tvl_usd)}</td><td class="num">${p.mcap_to_tvl !== null ? p.mcap_to_tvl.toFixed(2) + 'x' : '--'}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<div class="tier-note" style="margin:0">No direct traded comp in this exact category; Empirical-Bayes shrinkage falls back 100% to the global TVL-elasticity curve.</div>';

    const stepsHtml = row.farm_steps
      .map((s, i) => {
        const meta = row.step_meta && row.step_meta[i];
        const desc = s.replace(/\s*\(Cost:[^)]+\)\s*$/i, '').trim();
        return `<li class="step-item"><div class="step-num">${i + 1}</div><div><div class="step-desc">${esc(desc)}</div><div class="step-badges"><span class="meta-badge meta-cost">Cost: ${esc(meta ? meta.cost : '')}</span><span class="meta-badge meta-time">Time: ${esc(meta ? meta.time : '')}</span></div></div></li>`;
      })
      .join('');

    els.modalBody.innerHTML = `
      <div class="modal-stats">
        <div class="m-stat"><div class="m-stat-k">Locked TVL</div><div class="m-stat-v">${formatUsd(row.tvl_usd)}</div></div>
        <div class="m-stat"><div class="m-stat-k">7d Velocity</div><div class="m-stat-v">${formatPct(row.change_7d)}</div></div>
        <div class="m-stat"><div class="m-stat-k">Tracked Age</div><div class="m-stat-v">${row.age_days}d (${(row.age_days / 365).toFixed(1)}y)</div></div>
        <div class="m-stat"><div class="m-stat-k">Implied Value (P25–P75)</div><div class="m-stat-v" style="color:var(--emerald)">${formatUsd(row.implied_value_usd)}</div><div class="sub-line mono">${formatUsd(row.p25_usd)} – ${formatUsd(row.p75_usd)}</div></div>
      </div>
      <div class="detail-cols">
        <div class="col-stack">
          <section class="panel">
            <div class="panel-head"><h3 class="panel-title">Empirical Regression Valuation</h3><span class="panel-sub">LOOCV R²=${m.loocv_r2.toFixed(3)} · N=${m.n_traded}</span></div>
            <div class="arith-grid">
              <div class="arith-step"><div class="arith-k">TVL + Chain Base Fit</div><div class="arith-v">${formatFullUsd(Math.round(v.base_comp_usd / Math.max(0.01, v.eb_sector_mult)))}</div></div>
              <div class="arith-step"><div class="arith-k">EB Sector Lift (n=${v.sector_traded_n}, w=${v.eb_shrink_weight.toFixed(2)})</div><div class="arith-v">&times; ${v.eb_sector_mult.toFixed(3)}x</div></div>
              <div class="arith-step"><div class="arith-k">7d Velocity Tilt</div><div class="arith-v">&times; ${v.velocity_mult.toFixed(3)}x</div></div>
              <div class="arith-step"><div class="arith-k">Tracked Age Tilt (${v.age_days}d)</div><div class="arith-v">&times; ${v.age_mult.toFixed(3)}x</div></div>
              <div class="arith-step final"><div class="arith-k">= Final Implied Value (Empirical Band: ${formatUsd(row.p25_usd)} – ${formatUsd(row.p75_usd)})</div><div class="arith-v" style="color:var(--emerald)">${formatFullUsd(row.implied_value_usd)}</div></div>
            </div>
            <div class="sub-line mono" style="margin-top:6px">Model: log10(MCap) = ${m.intercept.toFixed(3)} + ${m.beta_tvl.toFixed(3)}&middot;logTVL + ${m.beta_chains.toFixed(3)}&middot;logChains + EB(${v.eb_sector_log10 >= 0 ? '+' : ''}${v.eb_sector_log10.toFixed(3)})</div>
          </section>
          <section class="panel">
            <div class="panel-head"><h3 class="panel-title">Closest Traded Sector Peers</h3><span class="panel-sub">${esc(row.category)}</span></div>
            ${peersHtml}
          </section>
        </div>
        <section class="panel">
          <div class="panel-head"><h3 class="panel-title">Costed &amp; Timed 90-Day Farm Plan</h3><span class="panel-sub">Ticket $${row.ticket_usd.toLocaleString('en-US')} · 90d Cost $${row.est_cost_90d_usd.toFixed(2)} · BE FDV ${formatUsd(row.breakeven_fdv_usd)}</span></div>
          <div class="tier-note"><strong>Triage (${esc(row.tier)}):</strong> ${esc(row.tier_reason)}</div>
          <ol class="step-list">${stepsHtml}</ol>
        </section>
      </div>`;

    if (typeof els.modal.showModal === 'function') {
      if (!els.modal.open) els.modal.showModal();
    } else {
      els.modal.setAttribute('open', '');
    }
  }

  function closeModal() {
    if (typeof els.modal.close === 'function' && els.modal.open) els.modal.close();
    else els.modal.removeAttribute('open');
  }

  function resetAll() {
    st.view = 'radar';
    st.search = '';
    st.category = '';
    st.chain = '';
    st.tier = '';
    st.growth = '';
    st.sort = 'rank';
    st.dir = 'asc';
    els.search.value = '';
    els.sort.value = 'rank';
    renderBoardTable();
  }

  document.querySelector('.view-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab-btn');
    if (!b) return;
    st.view = b.dataset.view || 'radar';
    if (st.view === 'live' && !['rank', 'mcap', 'tvl', 'growth'].includes(st.sort)) {
      st.sort = 'rank';
      st.dir = 'asc';
    }
    renderBoardTable();
  });

  els.search.addEventListener('input', (e) => {
    st.search = e.target.value;
    renderBoardTable();
  });
  els.category.addEventListener('change', (e) => {
    st.category = e.target.value;
    renderBoardTable();
  });
  els.chain.addEventListener('change', (e) => {
    st.chain = e.target.value;
    renderBoardTable();
  });
  els.tier.addEventListener('change', (e) => {
    st.tier = e.target.value;
    renderBoardTable();
  });
  els.growth.addEventListener('change', (e) => {
    st.growth = e.target.value;
    renderBoardTable();
  });
  els.sort.addEventListener('change', (e) => {
    st.sort = e.target.value;
    st.dir = st.sort === 'rank' || st.sort === 'cost' || st.sort === 'breakeven' ? 'asc' : 'desc';
    renderBoardTable();
  });

  els.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b === els.resetBtn) {
      resetAll();
      return;
    }
    if (b.dataset.chain !== undefined) {
      st.chain = b.dataset.chain;
      renderBoardTable();
    }
  });

  els.thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    if (st.sort === col) {
      st.dir = st.dir === 'asc' ? 'desc' : 'asc';
    } else {
      st.sort = col;
      st.dir = col === 'rank' || col === 'cost' ? 'asc' : 'desc';
    }
    renderBoardTable();
  });

  els.bannerClear.addEventListener('click', resetAll);
  els.tbody.addEventListener('click', (e) => {
    const b = e.target.closest('.farm-pill-btn');
    if (b && b.dataset.slug) {
      e.stopPropagation();
      renderProtocolDetail(b.dataset.slug);
      return;
    }
    const row = e.target.closest('tr[data-slug]');
    if (row && row.dataset.slug) renderProtocolDetail(row.dataset.slug);
  });

  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== els.search && !els.modal.open) {
      e.preventDefault();
      els.search.focus();
    } else if (e.key === 'Escape' && els.modal.open) {
      closeModal();
    }
  });

  buildHeaderMetrics();
  renderCompsChart();
  renderBoardTable();
})();
