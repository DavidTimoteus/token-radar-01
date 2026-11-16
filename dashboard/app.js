(() => {
  const data = window.RADAR_DATA;
  if (!data || !Array.isArray(data.rows)) return;
  const st = { view: 'radar', search: '', category: '', chain: '', sort: 'implied', watchlistOnly: false };
  const $ = (id) => document.getElementById(id);
  const els = {
    pillDate: $('pillSnapshotDate'), pillWl: $('pillWatchlist'),
    kpiWl: $('kpiWatchlist'), kpiWlSub: $('kpiWatchlistSub'),
    kpiUniv: $('kpiUniverse'), kpiUnivSub: $('kpiUniverseSub'),
    kpiImp: $('kpiImplied'), kpiTvl: $('kpiTvl'), kpiTvlSub: $('kpiTvlSub'),
    tabRadar: $('tabRadar'), tabLive: $('tabLive'),
    tabRadarCount: $('tabRadarCount'), tabLiveCount: $('tabLiveCount'),
    search: $('searchInput'), category: $('categorySelect'),
    chain: $('chainSelect'), sort: $('sortSelect'),
    chips: $('quickChips'), wlChip: $('watchlistChip'), resetBtn: $('resetBtn'),
    banner: $('activeFilterBanner'), bannerText: $('activeFilterText'), bannerClear: $('bannerClearBtn'),
    benchNote: $('benchmarkNote'), thead: $('tableHead'), tbody: $('tableBody'),
    empty: $('emptyState'), footerSrc: $('footerSource'),
    modal: $('detailModal'), modalTitle: $('modalTitle'),
    modalChains: $('modalChains'), modalBody: $('modalBody'), modalClose: $('modalCloseBtn'),
  };
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtUsd = (n) => {
    if (n == null || !Number.isFinite(n)) return '--';
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${Math.round(n).toLocaleString('en-US')}`;
  };
  const fmtFull = (n) => (n == null || !Number.isFinite(n) ? '--' : `$${Math.round(n).toLocaleString('en-US')}`);
  const fmtPct = (v) => {
    if (v == null || !Number.isFinite(v)) return '<span class="flat">N/A</span>';
    const cls = v > 0.01 ? 'pos' : v < -0.01 ? 'neg' : 'flat';
    return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
  };
  const fmtAge = (d) => `${d}d <span class="age-sub">${(d / 365).toFixed(1)}y</span>`;

  function initHeader() {
    const s = data.summary;
    els.pillDate.textContent = s.as_of;
    els.pillWl.textContent = `${s.watchlist_covered} / ${s.watchlist_total}`;
    els.kpiWl.textContent = `${s.watchlist_covered} / ${s.watchlist_total}`;
    els.kpiWlSub.textContent = `100% of floor >= ${fmtUsd(s.floor_usd)} watchlist`;
    els.kpiUniv.textContent = String(data.rows.length);
    els.kpiUnivSub.textContent = `From ${s.pre_token_universe_count} pre-token records (${s.total_snapshot_protocols} total)`;
    els.kpiImp.textContent = fmtUsd(s.aggregate_implied_usd);
    els.kpiTvl.textContent = fmtUsd(s.aggregate_tvl_usd);
    els.kpiTvlSub.textContent = `${s.top_chains.length} tracked chains · ${s.top_categories.length} sectors`;
    els.tabRadarCount.textContent = String(data.rows.length);
    els.tabLiveCount.textContent = String(data.liveTokens.length);
    els.footerSrc.textContent = `${s.source} · Snapshot floor ${fmtUsd(s.floor_usd)}`;
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

  function filteredRadar() {
    const q = st.search.trim().toLowerCase();
    const out = data.rows.filter((r) => {
      if (st.watchlistOnly && !r.in_watchlist) return false;
      if (st.category && r.category !== st.category) return false;
      if (st.chain && !r.chains.includes(st.chain)) return false;
      return !q || `${r.name} ${r.slug} ${r.category} ${r.chains.join(' ')}`.toLowerCase().includes(q);
    });
    out.sort((a, b) => {
      if (st.sort === 'tvl') return b.tvl_usd - a.tvl_usd || a.rank - b.rank;
      if (st.sort === 'growth') return (b.change_7d ?? -9999) - (a.change_7d ?? -9999) || a.rank - b.rank;
      if (st.sort === 'age') return b.age_days - a.age_days || a.rank - b.rank;
      if (st.sort === 'gas') return a.est_gas_usd - b.est_gas_usd || a.rank - b.rank;
      return a.rank - b.rank;
    });
    return out;
  }

  function filteredLive() {
    const q = st.search.trim().toLowerCase();
    return data.liveTokens.filter((t) => {
      if (st.category && t.category !== st.category) return false;
      if (st.chain && !t.chains.includes(st.chain)) return false;
      return !q || `${t.name} ${t.symbol} ${t.slug} ${t.category} ${t.chains.join(' ')}`.toLowerCase().includes(q);
    });
  }

  function renderBanner(list) {
    const parts = [];
    if (st.chain) parts.push(`Chain = ${st.chain}`);
    if (st.category) parts.push(`Sector = ${st.category}`);
    if (st.watchlistOnly) parts.push('Watchlist Only');
    if (st.search.trim()) parts.push(`Query = "${st.search.trim()}"`);
    if (!parts.length) { els.banner.hidden = true; return; }
    const total = st.view === 'radar' ? data.rows.length : data.liveTokens.length;
    const sum = st.view === 'radar'
      ? list.reduce((a, r) => a + r.implied_value_usd, 0)
      : list.reduce((a, t) => a + t.mcap_usd, 0);
    const lbl = st.view === 'radar' ? 'Implied Value' : 'Market Cap';
    els.bannerText.textContent = `Filter Active: ${parts.join(' · ')} · Showing ${list.length} of ${total} · Aggregate ${lbl}: ${fmtUsd(sum)}`;
    els.banner.hidden = false;
  }

  function renderTable() {
    for (const b of els.chips.querySelectorAll('.chip[data-chain]')) b.classList.toggle('active', (b.dataset.chain || '') === st.chain);
    els.wlChip.classList.toggle('active', st.watchlistOnly);
    els.chain.value = st.chain;
    els.category.value = st.category;
    els.sort.value = st.sort;
    els.tabRadar.classList.toggle('active', st.view === 'radar');
    els.tabLive.classList.toggle('active', st.view === 'live');
    els.tabRadar.setAttribute('aria-selected', String(st.view === 'radar'));
    els.tabLive.setAttribute('aria-selected', String(st.view === 'live'));
    els.benchNote.hidden = st.view !== 'live';
    els.sort.disabled = st.view === 'live';

    if (st.view === 'radar') {
      els.thead.innerHTML = '<tr><th>Rank</th><th>Protocol</th><th class="num">TVL</th><th class="num">7d Change</th><th class="num">Tracked Age</th><th class="num">Implied Valuation</th><th class="num">Action</th></tr>';
      const rows = filteredRadar();
      renderBanner(rows);
      els.empty.hidden = rows.length > 0;
      const maxV = data.rows[0]?.implied_value_usd || 1;
      els.tbody.innerHTML = rows.map((r) => {
        const w = Math.max(4, Math.min(100, Math.round((Math.log10(r.implied_value_usd + 1) / Math.log10(maxV + 1)) * 100)));
        const badge = r.in_watchlist ? '<span class="badge badge-wl">WATCHLIST</span>' : '<span class="badge badge-pre">PRE-TOKEN</span>';
        const orderedChains = st.chain ? [st.chain, ...r.chains.filter((c) => c !== st.chain)] : r.chains;
        const ch = orderedChains.slice(0, 3).map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('');
        const more = orderedChains.length > 3 ? `<span class="chain-tag">+${orderedChains.length - 3}</span>` : '';
        return `<tr data-slug="${esc(r.slug)}"><td class="rank-cell ${r.rank <= 10 ? 'rank-top' : ''}">#${r.rank}</td><td><div class="proto-name-row"><span class="proto-name">${esc(r.name)}</span>${badge}</div><div class="proto-meta"><span class="cat-tag">${esc(r.category)}</span>${ch}${more}</div></td><td class="num">${fmtUsd(r.tvl_usd)}</td><td class="num">${fmtPct(r.change_7d)}</td><td class="num">${fmtAge(r.age_days)}</td><td class="num"><div class="val-box"><span class="val-main">${fmtUsd(r.implied_value_usd)}</span><span class="val-track"><span class="val-fill" style="width:${w}%"></span></span><span class="val-mult">${r.valuation.sector_mult.toFixed(2)}x sector · gas ~$${r.est_gas_usd.toFixed(2)}</span></div></td><td class="num"><button type="button" class="farm-pill-btn" data-slug="${esc(r.slug)}">Farm Plan &rarr;</button></td></tr>`;
      }).join('');
      return;
    }

    els.thead.innerHTML = '<tr><th>Rank</th><th>Protocol</th><th class="num">Market Cap</th><th class="num">TVL</th><th class="num">MCap / TVL</th><th class="num">7d TVL</th><th class="num">Listed</th></tr>';
    const live = filteredLive();
    renderBanner(live);
    els.empty.hidden = live.length > 0;
    els.tbody.innerHTML = live.map((t) => {
      const ch = t.chains.slice(0, 3).map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('');
      const ratio = t.mcap_to_tvl !== null ? `${t.mcap_to_tvl.toFixed(2)}x` : '--';
      const rCls = t.mcap_to_tvl !== null && t.mcap_to_tvl >= 1 ? 'pos' : 'flat';
      return `<tr><td class="rank-cell ${t.rank <= 10 ? 'rank-top' : ''}">#${t.rank}</td><td><div class="proto-name-row"><span class="proto-name">${esc(t.name)}</span><span class="badge badge-ticker">${esc(t.symbol)}</span></div><div class="proto-meta"><span class="cat-tag">${esc(t.category)}</span>${ch}</div></td><td class="num">${fmtUsd(t.mcap_usd)}</td><td class="num">${fmtUsd(t.tvl_usd)}</td><td class="num"><span class="${rCls}">${ratio}</span></td><td class="num">${fmtPct(t.change_7d)}</td><td class="num">${esc(t.listed_at || '--')}</td></tr>`;
    }).join('');
  }

  function parseStep(txt) {
    const m = txt.match(/\(Cost:\s*([^|]+)\|\s*Time:\s*([^)]+)\)/i);
    return m ? { desc: txt.replace(m[0], '').trim(), cost: m[1].trim(), time: m[2].trim() } : { desc: txt, cost: 'Est. gas', time: '10 min setup' };
  }

  function openDetail(slug) {
    const row = data.rows.find((r) => r.slug === slug);
    if (!row) return;
    const v = row.valuation;
    const badge = row.in_watchlist ? '<span class="badge badge-wl">WATCHLIST</span>' : '<span class="badge badge-pre">PRE-TOKEN</span>';
    els.modalTitle.innerHTML = `<span class="mono" style="color:var(--teal)">#${row.rank}</span> ${esc(row.name)} ${badge} <span class="cat-tag">${esc(row.category)}</span>`;
    els.modalChains.innerHTML = row.chains.map((c) => `<span class="chain-tag">${esc(c)}</span>`).join('');
    const benchTxt = v.live_sector_median_ratio !== null
      ? `Conservative ${(v.sector_mult / Math.max(0.01, v.live_sector_median_ratio) * 100).toFixed(0)}% of live ${row.category} median (${v.live_sector_median_ratio.toFixed(2)}x)`
      : 'Conservative 0.20x-0.36x sector cap';
    const stepsHtml = row.farm_steps.map((s, i) => {
      const m = row.step_meta && row.step_meta[i];
      const p = parseStep(s);
      return `<li class="step-item"><div class="step-num">${i + 1}</div><div class="step-content"><div class="step-desc">${esc(p.desc)}</div><div class="step-badges"><span class="meta-badge meta-cost">Cost: ${esc(m ? m.cost : p.cost)}</span><span class="meta-badge meta-time">Time: ${esc(m ? m.time : p.time)}</span></div></div></li>`;
    }).join('');

    els.modalBody.innerHTML = `<div class="modal-stats"><div class="m-stat"><div class="m-stat-k">Locked TVL</div><div class="m-stat-v">${fmtUsd(row.tvl_usd)}</div></div><div class="m-stat"><div class="m-stat-k">7d Velocity</div><div class="m-stat-v">${fmtPct(row.change_7d)}</div></div><div class="m-stat"><div class="m-stat-k">Tracked Age</div><div class="m-stat-v">${row.age_days}d (${(row.age_days / 365).toFixed(1)}y)</div></div><div class="m-stat"><div class="m-stat-k">Implied Value</div><div class="m-stat-v" style="color:var(--teal)">${fmtUsd(row.implied_value_usd)}</div></div></div><section class="panel"><div class="panel-head"><h3 class="panel-title">Implied Valuation Arithmetic</h3><span class="panel-sub">${esc(benchTxt)}</span></div><div class="arith-grid"><div class="arith-step"><div class="arith-k">1. Baseline TVL</div><div class="arith-v">${fmtFull(v.tvl_usd)}</div></div><div class="arith-step"><div class="arith-k">2. Sector Mult (${esc(row.category)})</div><div class="arith-v">&times; ${v.sector_mult.toFixed(3)}x</div></div><div class="arith-step"><div class="arith-k">3. 7d Velocity Mult</div><div class="arith-v">&times; ${v.velocity_mult.toFixed(3)}x</div></div><div class="arith-step"><div class="arith-k">4. Tracked Age Mult (${v.age_days}d)</div><div class="arith-v">&times; ${v.age_mult.toFixed(3)}x</div></div><div class="arith-step"><div class="arith-k">5. Chain Breadth (${row.chains.length} chains)</div><div class="arith-v">&times; ${v.chain_mult.toFixed(3)}x</div></div><div class="arith-step final"><div class="arith-k">= Final Implied Value</div><div class="arith-v" style="color:var(--teal)">${fmtFull(row.implied_value_usd)}</div></div></div><div class="arith-formula">${fmtFull(v.tvl_usd)} &times; ${v.sector_mult.toFixed(3)} &times; ${v.velocity_mult.toFixed(3)} &times; ${v.age_mult.toFixed(3)} &times; ${v.chain_mult.toFixed(3)} = ${fmtFull(row.implied_value_usd)}</div></section><section class="panel"><div class="panel-head"><h3 class="panel-title">Concrete Farming Plan</h3><span class="panel-sub">Total Est. Gas ~$${row.est_gas_usd.toFixed(2)} · Primary: ${esc(row.primary_chain)}</span></div><ol class="step-list">${stepsHtml}</ol></section>`;

    if (typeof els.modal.showModal === 'function') { if (!els.modal.open) els.modal.showModal(); }
    else els.modal.setAttribute('open', '');
  }

  function closeModal() {
    if (typeof els.modal.close === 'function' && els.modal.open) els.modal.close();
    else els.modal.removeAttribute('open');
  }

  function applyHash() {
    const h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    const p = new URLSearchParams(h);
    if (p.has('chain')) st.chain = p.get('chain') || '';
    if (p.has('category')) st.category = p.get('category') || '';
    if (p.has('watchlist')) st.watchlistOnly = p.get('watchlist') === '1';
    if (p.has('view') && (p.get('view') === 'live' || p.get('view') === 'radar')) st.view = p.get('view');
    const slug = p.get('protocol');
    if (slug) requestAnimationFrame(() => openDetail(slug));
  }

  function syncUrlHash() {
    const p = new URLSearchParams();
    if (st.view === 'live') p.set('view', 'live');
    if (st.chain) p.set('chain', st.chain);
    if (st.category) p.set('category', st.category);
    if (st.watchlistOnly) p.set('watchlist', '1');
    const next = p.toString();
    history.replaceState(null, '', next ? `#${next}` : window.location.pathname);
  }

  function resetAll() {
    st.search = ''; st.category = ''; st.chain = ''; st.watchlistOnly = false; st.sort = 'implied';
    els.search.value = '';
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    renderTable();
  }

  els.tabRadar.addEventListener('click', () => { st.view = 'radar'; syncUrlHash(); renderTable(); });
  els.tabLive.addEventListener('click', () => { st.view = 'live'; syncUrlHash(); renderTable(); });
  els.search.addEventListener('input', (e) => { st.search = e.target.value; renderTable(); });
  els.category.addEventListener('change', (e) => { st.category = e.target.value; syncUrlHash(); renderTable(); });
  els.chain.addEventListener('change', (e) => { st.chain = e.target.value; syncUrlHash(); renderTable(); });
  els.sort.addEventListener('change', (e) => { st.sort = e.target.value; renderTable(); });
  els.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b === els.wlChip) { st.watchlistOnly = !st.watchlistOnly; syncUrlHash(); renderTable(); return; }
    if (b === els.resetBtn) { resetAll(); return; }
    if (b.dataset.chain !== undefined) { st.chain = b.dataset.chain; syncUrlHash(); renderTable(); }
  });
  els.bannerClear.addEventListener('click', resetAll);
  els.tbody.addEventListener('click', (e) => {
    const b = e.target.closest('.farm-pill-btn');
    if (b && b.dataset.slug) { e.stopPropagation(); openDetail(b.dataset.slug); return; }
    const row = e.target.closest('tr[data-slug]');
    if (row && row.dataset.slug) openDetail(row.dataset.slug);
  });
  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== els.search && !els.modal.open) { e.preventDefault(); els.search.focus(); }
    else if (e.key === 'Escape' && els.modal.open) closeModal();
  });
  window.addEventListener('hashchange', () => { applyHash(); renderTable(); });

  initHeader();
  applyHash();
  renderTable();
})();
