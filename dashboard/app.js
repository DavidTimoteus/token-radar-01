(() => {
  const data = window.RADAR_DATA;
  if (!data || !Array.isArray(data.rows)) return;

  const st = { view: 'radar', search: '', category: '', chain: '', verdict: '', growth: '', sort: 'rank', dir: 'asc' };
  const $ = (id) => document.getElementById(id);
  const els = {
    pillDate: $('pillSnapshotDate'), pillWl: $('pillWatchlist'), pillModel: $('pillModelMeta'),
    kpiWl: $('kpiWatchlist'), kpiWlSub: $('kpiWatchlistSub'), kpiUniv: $('kpiUniverse'), kpiUnivSub: $('kpiUniverseSub'),
    kpiImp: $('kpiImplied'), kpiTvlSub: $('kpiTvlSub'), kpiFit: $('kpiModelFit'), kpiFitSub: $('kpiModelSub'),
    legTradedN: $('legTradedN'), chartWrap: $('compsChartWrap'),
    tabRadarCount: $('tabRadarCount'), tabWlCount: $('tabWlCount'), tabEarlyCount: $('tabEarlyCount'), tabLiveCount: $('tabLiveCount'),
    search: $('searchInput'), category: $('categorySelect'), chain: $('chainSelect'), verdict: $('verdictSelect'),
    growth: $('growthSelect'), sort: $('sortSelect'), chips: $('quickChips'), resetBtn: $('resetBtn'),
    banner: $('activeFilterBanner'), bannerText: $('activeFilterText'), bannerClear: $('bannerClearBtn'),
    benchNote: $('benchmarkNote'), thead: $('tableHead'), tbody: $('tableBody'), empty: $('emptyState'),
    footerSrc: $('footerSource'), modal: $('detailModal'), modalTitle: $('modalTitle'),
    modalChains: $('modalChains'), modalBody: $('modalBody'), modalClose: $('modalCloseBtn'),
  };

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const formatUsd = (n) => {
    if (n == null || !Number.isFinite(n)) return '--';
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${Math.round(n).toLocaleString('en-US')}`;
  };
  const formatFullUsd = (n) => (n == null || !Number.isFinite(n) ? '--' : `$${Math.round(n).toLocaleString('en-US')}`);
  const formatPct = (v) => (v == null || !Number.isFinite(v) ? '<span class="flat">N/A</span>' : `<span class="${v > 0.01 ? 'pos' : v < -0.01 ? 'neg' : 'flat'}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`);
  const formatNetEv = (v) => `<span class="${v >= 2 ? 'pos' : v >= -2 ? 'flat' : 'neg'}">${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}</span>`;
  const verdictBadgeHtml = (v) => v === 'FARM' ? '<span class="badge badge-farm">FARM</span>' : v === 'THIN' ? '<span class="badge badge-thin">THIN</span>' : '<span class="badge badge-skip">SKIP</span>';

  function buildHeaderMetrics() {
    const s = data.summary, m = data.modelStats;
    els.pillDate.textContent = s.as_of;
    els.pillWl.textContent = `${s.watchlist_covered} / ${s.watchlist_total}`;
    els.pillModel.textContent = `LOOCV N=${m.n_traded}`;
    els.kpiWl.textContent = `${s.watchlist_covered} / ${s.watchlist_total}`;
    els.kpiWlSub.textContent = `100% of floor >= ${formatUsd(s.floor_usd)} watchlist`;
    els.kpiUniv.textContent = String(data.rows.length);
    els.kpiUnivSub.textContent = `${s.farm_count} FARM · ${s.thin_count} THIN · ${s.skip_count} SKIP`;
    els.kpiImp.textContent = formatUsd(s.aggregate_implied_usd);
    els.kpiTvlSub.textContent = `Agg. Pre-Token TVL ${formatUsd(s.aggregate_tvl_usd)} (${s.early_count} <$50M)`;
    els.kpiFit.textContent = `OOS Fold ${m.oos_fold_err.toFixed(2)}x`;
    els.kpiFitSub.textContent = `Size-Curve ρ ${m.spearman_rho.toFixed(3)} · β_TVL ${m.beta_tvl.toFixed(3)} (LOOCV N=${m.n_traded})`;
    els.legTradedN.textContent = String(m.n_traded);
    els.tabRadarCount.textContent = String(data.rows.length);
    els.tabWlCount.textContent = String(s.watchlist_covered);
    els.tabEarlyCount.textContent = String(s.early_count);
    els.tabLiveCount.textContent = String(data.liveTokens.length);
    els.footerSrc.textContent = `${s.source} · Snapshot floor ${formatUsd(s.floor_usd)}`;
    for (const c of s.top_categories) els.category.add(new Option(`${c.name} (${c.count})`, c.name));
    for (const ch of s.top_chains) els.chain.add(new Option(`${ch.name} (${ch.count})`, ch.name));
  }

  function renderCompsChart() {
    const m = data.modelStats, W = 540, H = 106, pad = { l: 40, r: 10, t: 6, b: 19 };
    const xMin = 6.5, xMax = 10.6, yMin = 4.6, yMax = 10.6;
    const px = (lx) => pad.l + ((lx - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
    const py = (ly) => H - pad.b - ((ly - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
    const gridX = [[7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([g, l]) => `<line x1="${px(g).toFixed(1)}" y1="${pad.t}" x2="${px(g).toFixed(1)}" y2="${H - pad.b}" stroke="#EAE5DC"/><text x="${px(g).toFixed(1)}" y="${H - 5}" fill="#7A828E" font-size="8.5" text-anchor="middle">${l}</text>`).join('');
    const gridY = [[6, '$1M'], [8, '$100M'], [10, '$10B']].map(([g, l]) => `<line x1="${pad.l}" y1="${py(g).toFixed(1)}" x2="${W - pad.r}" y2="${py(g).toFixed(1)}" stroke="#EAE5DC"/><text x="${pad.l - 5}" y="${(py(g) + 3).toFixed(1)}" fill="#7A828E" font-size="8.5" text-anchor="end">${l}</text>`).join('');
    const ly = (lx, sh = 0) => m.intercept + m.beta_tvl * lx + sh;
    const band = [`${px(xMin).toFixed(1)},${py(ly(xMin, m.residual_q75_log10)).toFixed(1)}`, `${px(xMax).toFixed(1)},${py(ly(xMax, m.residual_q75_log10)).toFixed(1)}`, `${px(xMax).toFixed(1)},${py(ly(xMax, m.residual_q25_log10)).toFixed(1)}`, `${px(xMin).toFixed(1)},${py(ly(xMin, m.residual_q25_log10)).toFixed(1)}`].join(' ');
    const dots = data.liveTokens.map((t) => `<circle cx="${px(Math.min(xMax, Math.max(xMin, Math.log10(t.tvl_usd)))).toFixed(1)}" cy="${py(Math.min(yMax, Math.max(yMin, Math.log10(t.mcap_usd)))).toFixed(1)}" r="2.3" fill="rgba(92,100,112,0.5)"/>`).join('');
    const topPre = data.rows.filter((r) => r.in_watchlist).slice(0, 15).map((r) => {
      const cx = px(Math.min(xMax, Math.max(xMin, Math.log10(r.tvl_usd)))), cy = py(Math.min(yMax, Math.max(yMin, Math.log10(r.implied_value_usd))));
      return `<polygon points="${cx.toFixed(1)},${(cy - 3.4).toFixed(1)} ${(cx + 3.4).toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${(cy + 3.4).toFixed(1)} ${(cx - 3.4).toFixed(1)},${cy.toFixed(1)}" fill="#A66D07" stroke="#FFFFFF" stroke-width="0.7"/>`;
    }).join('');
    els.chartWrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${gridX}${gridY}<polygon points="${band}" fill="rgba(13,122,79,0.12)"/><line x1="${px(xMin).toFixed(1)}" y1="${py(ly(xMin)).toFixed(1)}" x2="${px(xMax).toFixed(1)}" y2="${py(ly(xMax)).toFixed(1)}" stroke="#0D7A4F" stroke-width="1.8"/>${dots}${topPre}</svg>`;
  }

  function applyRadarFilters() {
    const q = st.search.trim().toLowerCase(), mul = st.dir === 'asc' ? 1 : -1;
    const gOk = (ch7) => !st.growth || (st.growth === 'pos' ? (ch7 ?? -999) > 0 : st.growth === 'hot' ? (ch7 ?? -999) >= 5 : (ch7 ?? -999) >= -10);
    if (st.view === 'live') {
      return data.liveTokens.filter((t) => (!st.category || t.category === st.category) && (!st.chain || t.chains.includes(st.chain)) && gOk(t.change_7d) && (!q || `${t.name} ${t.symbol} ${t.category} ${t.chains.join(' ')}`.toLowerCase().includes(q)))
        .sort((a, b) => st.sort === 'tvl' ? (a.tvl_usd - b.tvl_usd) * mul : st.sort === 'growth' ? ((a.change_7d ?? -9999) - (b.change_7d ?? -9999)) * mul : st.sort === 'mcap' ? (a.mcap_usd - b.mcap_usd) * mul : (a.rank - b.rank) * (st.sort === 'rank' ? mul : 1));
    }
    return data.rows.filter((r) => !(st.view === 'watchlist' && !r.in_watchlist) && !(st.view === 'early' && r.tvl_usd >= data.summary.floor_usd) && (!st.category || r.category === st.category) && (!st.chain || r.chains.includes(st.chain)) && (!st.verdict || r.verdict === st.verdict) && gOk(r.change_7d) && (!q || `${r.name} ${r.slug} ${r.category} ${r.chains.join(' ')} ${r.verdict}`.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (st.sort === 'netev') return (a.net_ev_p25_usd - b.net_ev_p25_usd) * mul || a.rank - b.rank;
        if (st.sort === 'tvl') return (a.tvl_usd - b.tvl_usd) * mul || a.rank - b.rank;
        if (st.sort === 'growth') return ((a.change_7d ?? -9999) - (b.change_7d ?? -9999)) * mul || a.rank - b.rank;
        if (st.sort === 'age') return (a.age_days - b.age_days) * mul || a.rank - b.rank;
        if (st.sort === 'cost') return (a.est_cost_90d_usd - b.est_cost_90d_usd) * mul || a.rank - b.rank;
        if (st.sort === 'implied') return (a.implied_value_usd - b.implied_value_usd) * mul || a.rank - b.rank;
        return (a.rank - b.rank) * mul;
      });
  }

  function renderFilterBanner(list) {
    const parts = [];
    if (st.view === 'watchlist') parts.push('Universe = Watchlist Floor (40)');
    if (st.view === 'early') parts.push('Universe = Early <$50M');
    if (st.chain) parts.push(`Chain = ${st.chain}`);
    if (st.category) parts.push(`Sector = ${st.category}`);
    if (st.verdict) parts.push(`Verdict = ${st.verdict}`);
    if (st.growth) parts.push(`7d Growth = ${els.growth.options[els.growth.selectedIndex].text}`);
    if (st.search.trim()) parts.push(`Query = "${st.search.trim()}"`);
    if (st.sort !== 'rank' || st.dir !== 'asc') parts.push(`Sort = ${st.sort} (${st.dir.toUpperCase()})`);
    if (!parts.length) { els.banner.hidden = true; return; }
    const total = st.view === 'live' ? data.liveTokens.length : data.rows.length;
    const sumVal = st.view === 'live' ? list.reduce((a, t) => a + t.mcap_usd, 0) : list.reduce((a, r) => a + r.implied_value_usd, 0);
    const sumTvl = list.reduce((a, r) => a + r.tvl_usd, 0);
    els.bannerText.textContent = `Active: ${parts.join(' · ')} · Showing ${list.length} of ${total} · ${st.view === 'live' ? 'MCap' : 'Implied Value'}: ${formatUsd(sumVal)} · TVL: ${formatUsd(sumTvl)}`;
    els.banner.hidden = false;
  }

  const sortArrow = (col) => (st.sort === col ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const sortCls = (col) => `sortable ${st.sort === col ? 'sorted' : ''}`;

  function renderBoardTable() {
    document.querySelectorAll('.tab-btn').forEach((b) => { const on = b.dataset.view === st.view; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    els.chips.querySelectorAll('.chip[data-chain]').forEach((c) => c.classList.toggle('active', (c.dataset.chain || '') === st.chain));
    els.chain.value = st.chain; els.category.value = st.category; els.verdict.value = st.verdict; els.growth.value = st.growth;
    els.sort.value = [...els.sort.options].some((o) => o.value === st.sort) ? st.sort : 'rank';
    els.verdict.disabled = st.view === 'live'; els.benchNote.hidden = st.view !== 'live';

    const list = applyRadarFilters();
    renderFilterBanner(list);
    els.empty.hidden = list.length > 0;

    if (st.view === 'live') {
      els.thead.innerHTML = `<tr><th class="${sortCls('rank')}" data-sort="rank">Rank${sortArrow('rank')}</th><th>Protocol &amp; Ticker</th><th class="num ${sortCls('mcap')}" data-sort="mcap">Market Cap${sortArrow('mcap')}</th><th class="num ${sortCls('tvl')}" data-sort="tvl">TVL${sortArrow('tvl')}</th><th class="num">MCap / TVL</th><th class="num">Curve Pred</th><th class="num ${sortCls('growth')}" data-sort="growth">7d TVL${sortArrow('growth')}</th></tr>`;
      els.tbody.innerHTML = list.map((t) => `<tr><td class="rank-cell ${t.rank <= 10 ? 'rank-top' : ''}">#${t.rank}</td><td><div class="proto-name-row"><span class="proto-name">${esc(t.name)}</span><span class="badge badge-ticker">${esc(t.symbol)}</span></div><div class="proto-meta"><span class="cat-tag">${esc(t.category)}</span>${t.chains.slice(0, 3).map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('')}</div></td><td class="num">${formatUsd(t.mcap_usd)}</td><td class="num">${formatUsd(t.tvl_usd)}</td><td class="num">${t.mcap_to_tvl.toFixed(2)}x</td><td class="num">${formatUsd(t.model_pred_usd)}<span class="sub-line">res ${t.residual_log10 >= 0 ? '+' : ''}${t.residual_log10.toFixed(2)}</span></td><td class="num">${formatPct(t.change_7d)}</td></tr>`).join('');
      return;
    }

    els.thead.innerHTML = `<tr><th class="${sortCls('rank')}" data-sort="rank">Rank${sortArrow('rank')}</th><th>Protocol &amp; Verdict</th><th class="num ${sortCls('tvl')}" data-sort="tvl">Locked TVL${sortArrow('tvl')}</th><th class="num ${sortCls('growth')}" data-sort="growth">7d Chg${sortArrow('growth')}</th><th class="num ${sortCls('age')}" data-sort="age">Age${sortArrow('age')}</th><th class="num ${sortCls('implied')}" data-sort="implied">Size-Curve Value (P25–P75)${sortArrow('implied')}</th><th class="num ${sortCls('netev')}" data-sort="netev">P25 Net EV (Rec. Ticket)${sortArrow('netev')}</th><th class="num ${sortCls('cost')}" data-sort="cost">90d Cost / Plan${sortArrow('cost')}</th></tr>`;
    const maxV = data.rows[0]?.implied_value_usd || 1;
    els.tbody.innerHTML = list.map((r) => {
      const w = Math.max(5, Math.min(100, Math.round((Math.log10(r.implied_value_usd + 1) / Math.log10(maxV + 1)) * 100)));
      const oc = st.chain ? [st.chain, ...r.chains.filter((c) => c !== st.chain)] : r.chains;
      const ch = oc.slice(0, 3).map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('') + (oc.length > 3 ? `<span class="chain-tag">+${oc.length - 3}</span>` : '');
      const minLbl = r.min_deposit_usd >= 1000 ? `$${(r.min_deposit_usd / 1000).toFixed(1)}k` : `$${r.min_deposit_usd}`;
      return `<tr data-slug="${esc(r.slug)}"><td class="rank-cell ${r.rank <= 10 ? 'rank-top' : ''}">#${r.rank}</td><td><div class="proto-name-row"><span class="proto-name">${esc(r.name)}</span>${r.in_watchlist ? '<span class="badge badge-wl">WATCHLIST</span>' : ''}${verdictBadgeHtml(r.verdict)}</div><div class="proto-meta"><span class="cat-tag">${esc(r.category)}</span>${ch}</div></td><td class="num">${formatUsd(r.tvl_usd)}<span class="sub-line">${esc(r.farm_chain)}</span></td><td class="num">${formatPct(r.change_7d)}</td><td class="num">${r.age_days}d<span class="sub-line">${(r.age_days / 365).toFixed(1)}y</span></td><td class="num"><div class="val-box"><span class="val-main">${formatUsd(r.implied_value_usd)}</span><span class="val-track"><span class="val-fill" style="width:${w}%"></span></span><span class="sub-line">${formatUsd(r.p25_usd)} – ${formatUsd(r.p75_usd)}</span></div></td><td class="num">${formatNetEv(r.net_ev_p25_usd)}<span class="sub-line">$${(r.ticket_usd / 1000).toFixed(0)}k tkt · Min ${minLbl}</span></td><td class="num"><button type="button" class="farm-pill-btn" data-slug="${esc(r.slug)}">$${r.est_cost_90d_usd.toFixed(2)} &rarr;</button></td></tr>`;
    }).join('');
  }

  function renderProtocolDetail(slug) {
    const row = data.rows.find((r) => r.slug === slug);
    if (!row) return;
    const v = row.valuation, m = data.modelStats, tLog = Math.log10(row.tvl_usd);
    els.modalTitle.innerHTML = `<span class="mono" style="color:var(--em)">#${row.rank}</span> ${esc(row.name)} ${row.in_watchlist ? '<span class="badge badge-wl">WATCHLIST</span>' : ''} ${verdictBadgeHtml(row.verdict)} <span class="cat-tag">${esc(row.category)}</span>`;
    els.modalChains.innerHTML = row.chains.slice(0, 7).map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('') + (row.chains.length > 7 ? `<span class="chain-tag">+${row.chains.length - 7} more</span>` : '');

    const sizeComps = data.liveTokens.slice().sort((a, b) => Math.abs(Math.log10(a.tvl_usd) - tLog) - Math.abs(Math.log10(b.tvl_usd) - tLog)).slice(0, 3);
    const sectorComps = data.liveTokens.filter((t) => t.category === row.category).slice(0, 3);
    const compTbl = (arr, emptyMsg) => arr.length ? `<table class="peer-table"><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">MCap</th><th class="num">Ratio</th></tr></thead><tbody>${arr.map((p) => `<tr><td><strong>${esc(p.name)}</strong> <span class="badge badge-ticker">${esc(p.symbol)}</span></td><td class="num">${formatUsd(p.tvl_usd)}</td><td class="num">${formatUsd(p.mcap_usd)}</td><td class="num">${p.mcap_to_tvl.toFixed(2)}x</td></tr>`).join('')}</tbody></table>` : `<div class="tier-note" style="margin:0">${emptyMsg}</div>`;

    const stepsHtml = row.farm_steps.map((s, i) => {
      const meta = row.step_meta && row.step_meta[i], desc = s.replace(/\s*\(Cost:[^)]+\)\s*$/i, '').trim();
      return `<li class="step-item"><div class="step-num">${i + 1}</div><div><div class="step-desc">${esc(desc)}</div><div class="step-badges"><span class="meta-badge meta-cost">Cost: ${esc(meta ? meta.cost : '')}</span><span class="meta-badge meta-time">Time: ${esc(meta ? meta.time : '')}</span></div></div></li>`;
    }).join('');
    const minLbl = row.min_deposit_usd >= 1000 ? `$${(row.min_deposit_usd / 1000).toFixed(1)}k` : `$${row.min_deposit_usd}`;

    els.modalBody.innerHTML = `
      <div class="modal-stats">
        <div class="m-stat"><div class="m-stat-k">Locked TVL</div><div class="m-stat-v">${formatUsd(row.tvl_usd)}</div><div class="sub-line">${formatPct(row.change_7d)} 7d &middot; ${row.age_days}d age</div></div>
        <div class="m-stat"><div class="m-stat-k">Implied Value (P25–P75)</div><div class="m-stat-v" style="color:var(--em)">${formatUsd(row.implied_value_usd)}</div><div class="sub-line mono">${formatUsd(row.p25_usd)} – ${formatUsd(row.p75_usd)}</div></div>
        <div class="m-stat"><div class="m-stat-k">Rec. Ticket &amp; Min BE</div><div class="m-stat-v">$${row.ticket_usd.toLocaleString('en-US')}</div><div class="sub-line mono">Min P25 Deposit: ${minLbl}</div></div>
        <div class="m-stat"><div class="m-stat-k">Net EV (P25 / Mid)</div><div class="m-stat-v">${formatNetEv(row.net_ev_p25_usd)} <span style="font-size:11px;color:var(--muted)">/ +$${row.net_ev_mid_usd.toFixed(1)}</span></div><div class="sub-line mono">Route: ${esc(row.farm_chain)} &middot; $${row.est_cost_90d_usd.toFixed(2)} cost</div></div>
      </div>
      <div class="detail-cols">
        <div class="col-stack">
          <section class="panel"><div class="panel-head"><h3 class="panel-title">Empirical Size-Curve Valuation</h3><span class="panel-sub">OOS Fold ${m.oos_fold_err.toFixed(2)}x · ρ=${m.spearman_rho.toFixed(3)} · N=${m.n_traded}</span></div>
            <div class="arith-grid">
              <div class="arith-step"><div class="arith-k">Power-Law Size Base (β=${m.beta_tvl.toFixed(3)})</div><div class="arith-v">${formatFullUsd(v.base_size_usd)}</div></div>
              <div class="arith-step"><div class="arith-k">EB Sector Lift (n=${v.sector_traded_n}, w=${v.eb_shrink_weight.toFixed(2)})</div><div class="arith-v">&times; ${v.eb_sector_mult.toFixed(3)}x</div></div>
              <div class="arith-step"><div class="arith-k">7d Velocity Tilt</div><div class="arith-v">&times; ${v.velocity_mult.toFixed(3)}x</div></div>
              <div class="arith-step"><div class="arith-k">Tracked Age Tilt (${v.age_days}d)</div><div class="arith-v">&times; ${v.age_mult.toFixed(3)}x</div></div>
              <div class="arith-step final"><div class="arith-k">= Final Implied Value (LOOCV P25–P75: ${formatUsd(row.p25_usd)} – ${formatUsd(row.p75_usd)})</div><div class="arith-v" style="color:var(--em)">${formatFullUsd(row.implied_value_usd)}</div></div>
            </div>
          </section>
          <section class="panel"><div class="panel-head"><h3 class="panel-title">Closest Size-Tier Comps</h3><span class="panel-sub">Nearest TVL cohort (N=${m.n_traded})</span></div>${compTbl(sizeComps, 'No close size-tier comps.')}</section>
          <section class="panel"><div class="panel-head"><h3 class="panel-title">Sector Comps</h3><span class="panel-sub">${esc(row.category)}</span></div>${compTbl(sectorComps, 'No direct traded sector comp; EB shrinkage reverts 100% to size curve.')}</section>
        </div>
        <section class="panel"><div class="panel-head"><h3 class="panel-title">Dollar-Netted 90-Day Farm Plan</h3><span class="panel-sub">Route: ${esc(row.farm_chain)} · 90d Cost $${row.est_cost_90d_usd.toFixed(2)} · BE FDV ${formatUsd(row.breakeven_fdv_usd)}</span></div>
          <div class="tier-note"><strong>Verdict (${esc(row.verdict)}):</strong> ${esc(row.verdict_reason)}</div>
          <ol class="step-list">${stepsHtml}</ol>
        </section>
      </div>`;
    if (typeof els.modal.showModal === 'function') { if (!els.modal.open) els.modal.showModal(); } else els.modal.setAttribute('open', '');
  }

  const closeModal = () => (typeof els.modal.close === 'function' && els.modal.open ? els.modal.close() : els.modal.removeAttribute('open'));
  function resetAll() { Object.assign(st, { view: 'radar', search: '', category: '', chain: '', verdict: '', growth: '', sort: 'rank', dir: 'asc' }); els.search.value = ''; renderBoardTable(); }

  document.querySelector('.view-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab-btn'); if (!b) return;
    st.view = b.dataset.view || 'radar';
    if (st.view === 'live' && !['rank', 'mcap', 'tvl', 'growth'].includes(st.sort)) { st.sort = 'rank'; st.dir = 'asc'; }
    renderBoardTable();
  });
  els.search.addEventListener('input', (e) => { st.search = e.target.value; renderBoardTable(); });
  els.category.addEventListener('change', (e) => { st.category = e.target.value; renderBoardTable(); });
  els.chain.addEventListener('change', (e) => { st.chain = e.target.value; renderBoardTable(); });
  els.verdict.addEventListener('change', (e) => { st.verdict = e.target.value; renderBoardTable(); });
  els.growth.addEventListener('change', (e) => { st.growth = e.target.value; renderBoardTable(); });
  els.sort.addEventListener('change', (e) => { st.sort = e.target.value; st.dir = st.sort === 'rank' || st.sort === 'cost' ? 'asc' : 'desc'; renderBoardTable(); });
  els.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b === els.resetBtn) resetAll(); else if (b.dataset.chain !== undefined) { st.chain = b.dataset.chain; renderBoardTable(); }
  });
  els.thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]'); if (!th) return;
    const col = th.dataset.sort;
    if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = col === 'rank' || col === 'cost' ? 'asc' : 'desc'; }
    renderBoardTable();
  });
  els.bannerClear.addEventListener('click', resetAll);
  els.tbody.addEventListener('click', (e) => {
    const b = e.target.closest('.farm-pill-btn'); if (b && b.dataset.slug) { e.stopPropagation(); renderProtocolDetail(b.dataset.slug); return; }
    const row = e.target.closest('tr[data-slug]'); if (row && row.dataset.slug) renderProtocolDetail(row.dataset.slug);
  });
  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== els.search && !els.modal.open) { e.preventDefault(); els.search.focus(); }
    else if (e.key === 'Escape' && els.modal.open) closeModal();
  });

  buildHeaderMetrics(); renderCompsChart(); renderBoardTable();
})();
