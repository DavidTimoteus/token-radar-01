/**
 * Token Launch Radar - Frontend Application Logic
 * 100% Offline Vanilla JS - Reads window.RADAR_DATA
 */

(function () {
  'use strict';

  // State Management
  let allRows = [];
  let boardMeta = null;
  let activeModalRow = null;

  // DOM Elements
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const categoryFilter = document.getElementById('categoryFilter');
  const chainFilter = document.getElementById('chainFilter');
  const sortFilter = document.getElementById('sortFilter');
  const radarTableBody = document.getElementById('radarTableBody');
  const emptyState = document.getElementById('emptyState');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');

  // Header Stats Elements
  const statTotalTargets = document.getElementById('statTotalTargets');
  const statWatchlist = document.getElementById('statWatchlist');
  const statTotalValuation = document.getElementById('statTotalValuation');
  const statAvgGas = document.getElementById('statAvgGas');
  const footerSnapshotDate = document.getElementById('footerSnapshotDate');

  // Modal Elements
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalRank = document.getElementById('modalRank');
  const modalName = document.getElementById('modalName');
  const modalCategory = document.getElementById('modalCategory');
  const modalChains = document.getElementById('modalChains');
  const modalWatchlistBadge = document.getElementById('modalWatchlistBadge');
  const modalTvl = document.getElementById('modalTvl');
  const modalGrowth = document.getElementById('modalGrowth');
  const modalImplied = document.getElementById('modalImplied');
  const modalScore = document.getElementById('modalScore');
  const modalBacking = document.getElementById('modalBacking');
  const modalGas = document.getElementById('modalGas');
  const modalStepsCount = document.getElementById('modalStepsCount');
  const modalFarmSteps = document.getElementById('modalFarmSteps');

  // Currency & Number Formatters
  function formatUsd(amount) {
    if (amount == null || isNaN(amount)) return '$0';
    const val = Number(amount);
    if (val >= 1e12) return '$' + (val / 1e12).toFixed(2) + 'T';
    if (val >= 1e9) return '$' + (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
    if (val >= 1e3) return '$' + (val / 1e3).toFixed(0) + 'K';
    return '$' + val.toLocaleString('en-US');
  }

  function formatPercent(pct) {
    if (pct == null || isNaN(pct)) return '0.0%';
    const val = Number(pct);
    const sign = val > 0 ? '+' : '';
    return sign + val.toFixed(1) + '%';
  }

  // Load Data Source
  function initData() {
    if (window.RADAR_DATA && Array.isArray(window.RADAR_DATA.rows)) {
      boardMeta = window.RADAR_DATA;
      allRows = window.RADAR_DATA.rows;
      renderApp();
    } else {
      // Fallback local fetch for board.json
      fetch('../board.json')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && Array.isArray(data.rows)) {
            boardMeta = data;
            allRows = data.rows;
            renderApp();
          }
        })
        .catch(function (err) {
          console.error('Failed to load local radar data:', err);
        });
    }
  }

  function renderApp() {
    updateHeaderStats();
    applyFiltersAndRender();
  }

  function updateHeaderStats() {
    if (!boardMeta || !allRows.length) return;

    statTotalTargets.textContent = allRows.length.toString();
    const wlCount = allRows.filter(function (r) { return r.is_watchlist; }).length;
    statWatchlist.textContent = wlCount + ' / 40 (100%)';

    const totalVal = allRows.reduce(function (sum, r) { return sum + (r.implied_value_usd || 0); }, 0);
    statTotalValuation.textContent = formatUsd(totalVal);

    const avgGas = allRows.reduce(function (sum, r) { return sum + (r.gas_estimate_usd || 0.35); }, 0) / allRows.length;
    statAvgGas.textContent = '$' + avgGas.toFixed(2);

    if (boardMeta.as_of && footerSnapshotDate) {
      footerSnapshotDate.textContent = 'As of Snapshot: ' + boardMeta.as_of;
    }
  }

  function getFilteredAndSortedRows() {
    const searchVal = (searchInput.value || '').trim().toLowerCase();
    const catVal = categoryFilter.value;
    const chainVal = chainFilter.value;
    const sortVal = sortFilter.value;

    let filtered = allRows.filter(function (r) {
      // Search term
      if (searchVal) {
        const matchName = (r.name || '').toLowerCase().includes(searchVal);
        const matchSlug = (r.slug || '').toLowerCase().includes(searchVal);
        const matchCat = (r.category || '').toLowerCase().includes(searchVal);
        const matchChains = (r.chains || []).some(function (c) { return c.toLowerCase().includes(searchVal); });
        if (!matchName && !matchSlug && !matchCat && !matchChains) return false;
      }

      // Category filter
      if (catVal !== 'ALL') {
        const cat = (r.category || '').toLowerCase();
        if (catVal === 'DEX' && !cat.includes('dex') && !cat.includes('amm')) return false;
        if (catVal === 'LENDING' && !cat.includes('lend') && !cat.includes('borrow')) return false;
        if (catVal === 'PERPS' && !cat.includes('perp') && !cat.includes('derivative')) return false;
        if (catVal === 'RESTAKING' && !cat.includes('restak') && !cat.includes('liquid')) return false;
        if (catVal === 'AI' && !cat.includes('ai') && !cat.includes('depin') && !cat.includes('compute')) return false;
        if (catVal === 'RWA' && !cat.includes('rwa') && !cat.includes('real')) return false;
      }

      // Chain filter
      if (chainVal !== 'ALL') {
        const hasChain = (r.chains || []).some(function (c) {
          return c.toLowerCase().includes(chainVal.toLowerCase());
        });
        if (!hasChain) return false;
      }

      return true;
    });

    // Sorting
    filtered.sort(function (a, b) {
      if (sortVal === 'implied_desc') return (b.implied_value_usd || 0) - (a.implied_value_usd || 0);
      if (sortVal === 'rank_asc') return (a.rank || 0) - (b.rank || 0);
      if (sortVal === 'tvl_desc') return (b.tvl_usd || 0) - (a.tvl_usd || 0);
      if (sortVal === 'growth_desc') return (b.change_7d || 0) - (a.change_7d || 0);
      if (sortVal === 'score_desc') return (b.score || 0) - (a.score || 0);
      if (sortVal === 'gas_asc') return (a.gas_estimate_usd || 0) - (b.gas_estimate_usd || 0);
      return 0;
    });

    return filtered;
  }

  function applyFiltersAndRender() {
    const rows = getFilteredAndSortedRows();
    radarTableBody.innerHTML = '';

    if (rows.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    const fragment = document.createDocumentFragment();

    rows.forEach(function (row) {
      const tr = document.createElement('tr');

      // Rank
      const rankClass = row.rank <= 3 ? 'col-rank rank-top' : 'col-rank';
      const rankHtml = '<td class="' + rankClass + '">#' + row.rank + '</td>';

      // Protocol & Slug
      const wlBadge = row.is_watchlist ? '<span class="badge-watchlist-sm">WATCHLIST</span>' : '';
      const protoHtml = '<td class="col-protocol">' +
        '<div class="proto-title-cell">' +
          '<div class="proto-name-row">' +
            '<span class="proto-name">' + escapeHtml(row.name) + '</span>' +
            wlBadge +
          '</div>' +
          '<span class="proto-slug">' + escapeHtml(row.slug) + '</span>' +
        '</div>' +
      '</td>';

      // Category
      const catHtml = '<td class="col-category"><span class="category-tag">' + escapeHtml(row.category || 'DeFi') + '</span></td>';

      // Chains
      const chainPills = (row.chains || ['Ethereum']).slice(0, 3).map(function (c) {
        return '<span class="chain-pill">' + escapeHtml(c) + '</span>';
      }).join('');
      const chainsHtml = '<td class="col-chains"><div class="chain-pills">' + chainPills + '</div></td>';

      // TVL
      const tvlHtml = '<td class="col-tvl text-right mono-num">' + formatUsd(row.tvl_usd) + '</td>';

      // 7d Growth
      let changeClass = 'change-neutral';
      if (row.change_7d > 0.05) changeClass = 'change-positive';
      else if (row.change_7d < -0.05) changeClass = 'change-negative';
      const growthHtml = '<td class="col-growth text-right"><span class="change-pill ' + changeClass + '">' + formatPercent(row.change_7d) + '</span></td>';

      // Implied Valuation
      const impliedHtml = '<td class="col-implied text-right mono-num text-cyan">' + formatUsd(row.implied_value_usd) + '</td>';

      // Score
      const scoreHtml = '<td class="col-score text-center"><span class="score-badge">' + (row.score || 85) + '</span></td>';

      // Est. Gas
      const gasHtml = '<td class="col-gas text-right mono-num text-amber">$' + (row.gas_estimate_usd ? row.gas_estimate_usd.toFixed(2) : '0.25') + '</td>';

      // Action
      const actionHtml = '<td class="col-action text-center"><button class="action-btn" data-slug="' + escapeHtml(row.slug) + '">View Plan</button></td>';

      tr.innerHTML = rankHtml + protoHtml + catHtml + chainsHtml + tvlHtml + growthHtml + impliedHtml + scoreHtml + gasHtml + actionHtml;

      // Event listener for opening detail modal
      tr.addEventListener('click', function (e) {
        openModal(row);
      });

      fragment.appendChild(tr);
    });

    radarTableBody.appendChild(fragment);
  }

  function openModal(row) {
    activeModalRow = row;

    modalRank.textContent = '#' + row.rank;
    modalName.textContent = row.name || row.slug;
    modalCategory.textContent = row.category || 'DeFi';
    modalChains.textContent = (row.chains || []).join(', ');

    if (row.is_watchlist) {
      modalWatchlistBadge.style.display = 'inline-block';
    } else {
      modalWatchlistBadge.style.display = 'none';
    }

    modalTvl.textContent = formatUsd(row.tvl_usd);

    const growthVal = row.change_7d || 0;
    modalGrowth.textContent = formatPercent(growthVal);
    modalGrowth.className = 'metric-val ' + (growthVal >= 0 ? 'text-emerald' : 'text-rose');

    modalImplied.textContent = formatUsd(row.implied_value_usd);
    modalScore.textContent = (row.score || 85) + ' / 100';
    modalBacking.textContent = row.backing_tier || 'Tier 1';
    modalGas.textContent = '$' + (row.gas_estimate_usd ? row.gas_estimate_usd.toFixed(2) : '0.35');

    // Farm Steps
    const steps = row.farm_steps || [];
    modalStepsCount.textContent = steps.length + ' Steps Strategy';
    modalFarmSteps.innerHTML = '';

    steps.forEach(function (stepText, idx) {
      const stepItem = document.createElement('div');
      stepItem.className = 'farm-step-item';
      stepItem.innerHTML =
        '<div class="step-num-badge">' + (idx + 1) + '</div>' +
        '<div class="step-text">' + escapeHtml(stepText) + '</div>';
      modalFarmSteps.appendChild(stepItem);
    });

    modalBackdrop.style.display = 'flex';
  }

  function closeModal() {
    modalBackdrop.style.display = 'none';
    activeModalRow = null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Setup Event Listeners
  searchInput.addEventListener('input', function () {
    clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
    applyFiltersAndRender();
  });

  clearSearchBtn.addEventListener('click', function () {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    applyFiltersAndRender();
    searchInput.focus();
  });

  categoryFilter.addEventListener('change', applyFiltersAndRender);
  chainFilter.addEventListener('change', applyFiltersAndRender);
  sortFilter.addEventListener('change', applyFiltersAndRender);

  resetFiltersBtn.addEventListener('click', function () {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    categoryFilter.value = 'ALL';
    chainFilter.value = 'ALL';
    sortFilter.value = 'implied_desc';
    applyFiltersAndRender();
  });

  modalCloseBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', function (e) {
    if (e.target === modalBackdrop) {
      closeModal();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalBackdrop.style.display !== 'none') {
      closeModal();
    }
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // Initialize
  initData();
})();
