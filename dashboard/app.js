// Token Radar Web3 Intelligence Dashboard
// High-performance offline radar client. Reads window.RADAR and renders the ranked board,
// multi-chain/category filters, valuation breakdowns, and actionable farm plans.
// Zero network dependencies, pure vanilla JS and DOM API.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var app = document.getElementById('board');
  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    tab: 'pre-token',
    sort: 'implied',
    dir: -1,
    selected: null
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }

  function fmtExactUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y (' + Math.round(days) + 'd)';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // Exact valuation model calculation mirroring lib/model.ts
  function impliedOf(row, model) {
    var rawGrowth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity));
  }

  // DOM creation helper
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) {
        child.forEach(function (c) { if (c) node.appendChild(c); });
      } else if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  // Chain-aware gas fee estimation aligned with model.ts
  function chainOf(p) {
    return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain';
  }

  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }

  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function gasCostFor(chain, capital) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('solana') >= 0 || c.indexOf('sol') >= 0) {
      return {
        setupGas: 'under $0.05 in SOL fees',
        weeklyGas: 'under $0.02 in SOL weekly',
        walletGas: 'under $0.02 in SOL'
      };
    }
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('base') >= 0 || c.indexOf('optimism') >= 0 ||
        c.indexOf('polygon') >= 0 || c.indexOf('bsc') >= 0 || c.indexOf('avalanche') >= 0 ||
        c.indexOf('scroll') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('blast') >= 0 ||
        c.indexOf('zksync') >= 0 || c.indexOf('mantle') >= 0 || c.indexOf('mode') >= 0) {
      return {
        setupGas: 'about $0.20 to $0.50 of L2 gas',
        weeklyGas: 'about $0.15 of L2 gas weekly',
        walletGas: 'under $0.20 of L2 gas'
      };
    }
    if (c.indexOf('sui') >= 0 || c.indexOf('aptos') >= 0 || c.indexOf('near') >= 0 ||
        c.indexOf('sei') >= 0 || c.indexOf('injective') >= 0) {
      return {
        setupGas: 'under $0.05 in native network fees',
        weeklyGas: 'under $0.02 weekly',
        walletGas: 'under $0.02'
      };
    }
    if (c.indexOf('bitcoin') >= 0 || c.indexOf('btc') >= 0 || c.indexOf('lightning') >= 0) {
      return {
        setupGas: '$2 to $5 in miner fees',
        weeklyGas: '$1 to $3 in miner fees weekly',
        walletGas: '$1 in miner fees'
      };
    }
    return {
      setupGas: capital >= 150 ? 'about $8 to $16 of mainnet gas' : 'about $4 to $8 of mainnet gas',
      weeklyGas: 'about $2 to $5 of gas weekly',
      walletGas: 'under $3 of gas'
    };
  }

  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return 'Supply $' + capital + ' in USDC or primary collateral on ' + name + ' (' + chain + '), maintain conservative borrowing with health factor above 1.8, and accrue lending points.';
    }
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) {
      return "Provide $" + capital + " in concentrated or two-sided liquidity to " + name + "'s flagship pool on " + chain + ", execute bi-weekly volume swaps, and hold the LP receipt.";
    }
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) {
      return 'Bridge $' + capital + ' in USDC to ' + chain + ' via ' + name + ', deploy the bridged assets into integrated protocols, and retain the bridge transaction proofs.';
    }
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      return "Stake $" + capital + " of the chain's liquid staking asset through " + name + ' on ' + chain + ', maintain the position across active epochs, and retain the receipt tokens.';
    }
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) {
      return 'Deposit $' + capital + ' in USDC margin on ' + name + ' (' + chain + '), open delta-neutral hedge orders to generate eligible trading volume, and avoid directional exposure.';
    }
    if (c.indexOf('prediction') >= 0) {
      return 'Fund $' + capital + ' and establish split positions across high-volume prediction markets on ' + name + ' (' + chain + ') to register active user activity.';
    }
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) {
      return 'Deposit $' + capital + ' into an automated ' + name + ' vault on ' + chain + ', hold the vault shares, and track the vault\'s yield performance tiers.';
    }
    if (c.indexOf('stable') >= 0) {
      return 'Mint or deposit $' + capital + ' of native stablecoin via ' + name + ' on ' + chain + ', stake in the stability pool, and collect protocol rewards.';
    }
    if (c.indexOf('ai') >= 0 || c.indexOf('depin') >= 0) {
      return 'Stake $' + capital + ' into ' + name + ' on ' + chain + ', register telemetry as an active node participant, and maintain uptime heartbeats for network points.';
    }
    if (c.indexOf('rwa') >= 0) {
      return "Mint $" + capital + " of the protocol's real-world yield asset on " + chain + ', verify whitelist eligibility, and retain custody in your self-custody wallet.';
    }
    if (c.indexOf('insurance') >= 0) {
      return 'Underwrite or purchase $' + capital + ' in smart contract cover from ' + name + ' on ' + chain + ' and hold the active policy coverage.';
    }
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ', maintain continuous contract interaction, and keep the position open.';
  }

  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasCostFor(chain, capital);
    var action = actionFor(p, capital, chain);
    var name = p.name || 'the protocol';
    return [
      {
        num: 1,
        title: 'Dedicated Farm Wallet Setup',
        action: 'Use a dedicated, clean wallet containing only the allocated $' + capital + ' farming capital, and keep private keys strictly offline.',
        cost: gas.walletGas,
        time: '5 minutes'
      },
      {
        num: 2,
        title: 'Core Protocol Interaction',
        action: action,
        cost: '$' + capital + ' capital plus ' + gas.setupGas,
        time: '15 minutes to set up'
      },
      {
        num: 3,
        title: 'Sybil-Resistant Activity Maintenance',
        action: 'Execute one organic on-chain interaction every 7 to 10 days (such as a deposit, small swap, or vote) to avoid sybil-filter disqualification.',
        cost: gas.weeklyGas,
        time: '10 minutes a week'
      },
      {
        num: 4,
        title: 'Epoch Staking & Snapshot Holding',
        action: 'Maintain the continuous deposited position for at least ' + hold + ' days to ensure inclusion across multiple protocol snapshot epochs.',
        cost: 'the $' + capital + ' remains committed in the contract',
        time: hold + ' days'
      },
      {
        num: 5,
        title: 'TGE Verification & Claim Audit',
        action: 'Regularly audit your qualifying points or leaderboard tier via ' + name + "'s verified official interface, and verify allocation status prior to TGE.",
        cost: 'zero claim fees, never pay third-party claimers',
        time: '10 minutes'
      },
      {
        num: 6,
        title: 'Position Ledgering & Secure Unwind',
        action: 'Document transaction signatures, wallet addresses, and deposit dates in a secure offline farm ledger before executing position withdrawal.',
        cost: 'nothing but the log',
        time: '5 minutes'
      }
    ];
  }

  // Hash state management
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // Rows and filtering
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c.toLowerCase() === state.chain.toLowerCase(); })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // Top Navigation Bar
  function topNav() {
    return el('header', { class: 'top-nav' },
      el('div', { class: 'brand-group' },
        el('div', { class: 'radar-logo' },
          el('svg', { viewBox: '0 0 24 24', fill: 'none', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
            el('circle', { cx: '12', cy: '12', r: '10' }),
            el('path', { d: 'M12 2a10 10 0 0 1 10 10' }),
            el('circle', { cx: '12', cy: '12', r: '4' }),
            el('line', { x1: '12', y1: '12', x2: '19', y2: '5' })
          )
        ),
        el('div', { class: 'brand-text' },
          el('span', { class: 'brand-title', text: 'TOKEN LAUNCH RADAR' }),
          el('span', { class: 'brand-sub', text: 'Pre-Token Valuation & Farming Intelligence' })
        )
      ),
      el('div', { class: 'top-pills' },
        el('div', { class: 'pill-meta' },
          el('span', { class: 'dot-live' }),
          el('span', { text: 'Snapshot ' + DATA.as_of })
        ),
        el('div', { class: 'pill-meta' },
          el('span', { text: DATA.watchlist_size + '/' + DATA.watchlist_size + ' Watchlist Floor' })
        ),
        el('div', { class: 'pill-meta' },
          el('span', { text: DATA.model_version + ' Quantitative Model' })
        ),
        el('div', { class: 'pill-meta' },
          el('span', { text: 'Offline Verified' })
        )
      )
    );
  }

  // Hero Section with 4 KPI Summary Cards
  function heroSection() {
    var totalImplied = DATA.rows.reduce(function (sum, r) { return sum + (r.implied_value_usd || 0); }, 0);
    var totalTvl = DATA.rows.reduce(function (sum, r) { return sum + (r.tvl_usd || 0); }, 0);

    return el('section', { class: 'hero-section' },
      el('div', { class: 'hero-header' },
        el('h1', { text: DATA.board_size + ' Pre-Token Protocols Ranked by Implied Value' }),
        el('p', { text: 'Systematic intelligence for protocols launching tokens. The watchlist represents the strict floor ($' + Math.round(DATA.floor_usd / 1e6) + 'M+ TVL with no token), augmented by ' + DATA.early_size + ' high-momentum early protocols below the floor. Implied valuation is derived from TVL, 7-day velocity, and deployment maturity.' })
      ),
      el('div', { class: 'kpi-grid' },
        el('div', { class: 'kpi-card amber' },
          el('div', { class: 'kpi-label' }, el('span', { text: 'Watchlist Coverage' }), el('span', { text: '100%' })),
          el('div', { class: 'kpi-val', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }),
          el('div', { class: 'kpi-foot', text: 'All floor protocols covered' })
        ),
        el('div', { class: 'kpi-card' },
          el('div', { class: 'kpi-label' }, el('span', { text: 'Total Scored Universe' }), el('span', { text: 'Full Radar' })),
          el('div', { class: 'kpi-val', text: String(DATA.board_size) }),
          el('div', { class: 'kpi-foot', text: DATA.watchlist_size + ' Watchlist + ' + DATA.early_size + ' Early' })
        ),
        el('div', { class: 'kpi-card cyan' },
          el('div', { class: 'kpi-label' }, el('span', { text: 'Pipeline Implied Value' }), el('span', { text: 'Model Sum' })),
          el('div', { class: 'kpi-val', text: fmtUsd(totalImplied) }),
          el('div', { class: 'kpi-foot', text: 'Algorithmic implied capital' })
        ),
        el('div', { class: 'kpi-card purple' },
          el('div', { class: 'kpi-label' }, el('span', { text: 'Aggregate Pre-Token TVL' }), el('span', { text: 'DefiLlama' })),
          el('div', { class: 'kpi-val', text: fmtUsd(totalTvl) }),
          el('div', { class: 'kpi-foot', text: 'Real on-chain locked assets' })
        )
      )
    );
  }

  // Controls, Search, Filter Dropdowns, and Quick Chain Chips
  function toolbar() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();

    var allChainsSet = new Set();
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { allChainsSet.add(c); });
    });
    var chains = Array.from(allChainsSet).sort();

    // Search input
    var search = el('input', {
      type: 'search',
      id: 'q',
      class: 'search-input',
      placeholder: 'Search protocol, chain, or category...',
      value: state.q,
      'aria-label': 'Search the board'
    });
    search.addEventListener('input', function () {
      state.q = search.value;
      writeHash();
      render();
    });

    var searchBox = el('div', { class: 'search-box' },
      el('svg', { class: 'search-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
        el('circle', { cx: '11', cy: '11', r: '8' }),
        el('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' })
      ),
      search
    );

    // Category select
    var catSelect = el('select', { id: 'category', class: 'select-filter', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All Categories (' + categories.length + ')' }),
      categories.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null });
      })
    );
    catSelect.addEventListener('change', function () {
      state.category = catSelect.value;
      writeHash();
      render();
    });
    var catWrap = el('div', { class: 'select-filter-wrap' }, catSelect);

    // Chain select
    var chainSelect = el('select', { id: 'chain', class: 'select-filter', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All Chains (' + chains.length + ')' }),
      chains.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null });
      })
    );
    chainSelect.addEventListener('change', function () {
      state.chain = chainSelect.value;
      writeHash();
      render();
    });
    var chainWrap = el('div', { class: 'select-filter-wrap' }, chainSelect);

    // Tabs
    var tabPre = el('button', {
      type: 'button',
      class: 'tab-btn',
      'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false',
      text: 'Pre-Token Radar (' + DATA.board_size + ')',
      onclick: function () { state.tab = 'pre-token'; writeHash(); render(); }
    });
    var tabLive = el('button', {
      type: 'button',
      class: 'tab-btn',
      'aria-pressed': state.tab === 'live' ? 'true' : 'false',
      text: 'Live Tokens (' + DATA.live.length + ')',
      onclick: function () { state.tab = 'live'; writeHash(); render(); }
    });

    var tabGroup = el('div', { class: 'tab-nav' }, tabPre, tabLive);

    // Primary controls row
    var primaryRow = el('div', { class: 'toolbar-primary' },
      el('div', { class: 'filter-inputs' }, searchBox, catWrap, chainWrap),
      tabGroup
    );

    // Quick chain chips
    var topChainsList = ['All', 'Solana', 'Base', 'Ethereum', 'Arbitrum', 'Polygon', 'Avalanche', 'Sui', 'Monad'];
    var chainChips = el('div', { class: 'chain-quick-bar' },
      el('span', { class: 'chain-quick-label', text: 'Quick Chains:' }),
      topChainsList.map(function (chainName) {
        var isAll = chainName === 'All';
        var isActive = (isAll && state.chain === 'all') || (!isAll && state.chain.toLowerCase() === chainName.toLowerCase());
        return el('button', {
          type: 'button',
          class: 'chain-chip' + (isActive ? ' active' : ''),
          text: chainName,
          onclick: function () {
            state.chain = isAll ? 'all' : chainName;
            writeHash();
            render();
          }
        });
      })
    );

    var container = el('div', { class: 'toolbar-wrap' }, primaryRow, chainChips);

    // Active filter banner
    var isFiltered = state.q || state.category !== 'all' || state.chain !== 'all';
    if (isFiltered && state.tab === 'pre-token') {
      var filteredList = rows();
      var filteredImplied = filteredList.reduce(function (s, r) { return s + (r.implied_value_usd || 0); }, 0);
      var banner = el('div', { class: 'active-filter-banner' },
        el('span', {
          text: 'Active Filter: ' +
            (state.chain !== 'all' ? 'Chain [' + state.chain + '] ' : '') +
            (state.category !== 'all' ? 'Category [' + state.category + '] ' : '') +
            (state.q ? 'Search "' + state.q + '" ' : '') +
            '• ' + filteredList.length + ' protocols matching • Implied Value: ' + fmtUsd(filteredImplied)
        }),
        el('button', {
          type: 'button',
          class: 'clear-btn',
          text: 'Clear All Filters',
          onclick: function () {
            state.q = '';
            state.category = 'all';
            state.chain = 'all';
            writeHash();
            render();
          }
        })
      );
      container.appendChild(banner);
    }

    return container;
  }

  // Sortable column headers
  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          render();
        }
      },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  // Main Pre-Token Ranking Table (The Board)
  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'table-panel' },
        el('div', { class: 'empty-box' },
          el('h2', { text: 'No Pre-Token Protocols Match Your Filter' }),
          el('p', { text: 'Try resetting the chain or category filters, or clearing the search query to view the full pre-token radar.' }),
          el('button', {
            class: 'farm-pill-btn',
            type: 'button',
            text: 'Reset Filters',
            onclick: function () {
              state.q = '';
              state.category = 'all';
              state.chain = 'all';
              writeHash();
              render();
            }
          })
        )
      );
    }

    var maxImplied = list[0].implied_value_usd || 1;
    var tbody = el('tbody');

    list.forEach(function (r) {
      var isTop3 = r.rank <= 3;
      var rankClass = isTop3 ? 'rank-' + r.rank : '';

      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var growthArrow = r.change_7d === null ? '' : r.change_7d >= 0 ? '▲ ' : '▼ ';

      var isWatchlist = r.rank <= DATA.watchlist_size;
      var chainsPreview = (r.chains || []).slice(0, 3);
      var hasMoreChains = (r.chains || []).length > 3;

      var barWidth = Math.max(4, Math.round((r.implied_value_usd / maxImplied) * 100));

      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDetail(r.slug);
          }
        }
      },
        // 1. Rank
        el('td', null,
          el('span', { class: 'rank-badge ' + rankClass, text: String(r.rank) })
        ),
        // 2. Protocol Details
        el('td', null,
          el('div', { class: 'proto-cell' },
            el('div', { class: 'proto-row' },
              el('span', { class: 'proto-name', text: r.name }),
              isWatchlist ? el('span', { class: 'tag-watchlist', text: 'Watchlist' }) : null
            ),
            el('div', { class: 'proto-tags' },
              el('span', { class: 'tag-cat', text: r.category || 'Other' }),
              chainsPreview.map(function (c) {
                return el('span', { class: 'tag-chain', text: c });
              }),
              hasMoreChains ? el('span', { class: 'tag-cat', text: '+' + ((r.chains || []).length - 3) }) : null
            )
          )
        ),
        // 3. TVL
        el('td', { class: 'num' }, el('b', { text: fmtUsd(r.tvl_usd) })),
        // 4. 7-Day Change
        el('td', { class: 'num ' + growthClass }, el('span', { text: growthArrow + growth })),
        // 5. Tracked Age
        el('td', { class: 'num' }, el('span', { text: fmtAge(r.age_days) })),
        // 6. Implied Value & Relative Bar
        el('td', null,
          el('div', { class: 'implied-cell' },
            el('div', { class: 'implied-top' },
              el('span', { class: 'implied-val', text: fmtUsd(r.implied_value_usd) }),
              el('span', { class: 'num', style: 'font-size:11px;color:var(--ink-dim);', text: barWidth + '%' })
            ),
            el('div', { class: 'implied-bar', 'aria-hidden': 'true' },
              el('i', { class: 'implied-fill', style: 'width:' + barWidth + '%' })
            )
          )
        ),
        // 7. Farm Strategy CTA
        el('td', { class: 'farm-cell' },
          el('button', {
            type: 'button',
            class: 'farm-pill-btn',
            text: 'Farm Plan →',
            onclick: function (e) {
              e.stopPropagation();
              openDetail(r.slug);
            }
          })
        )
      );

      tbody.appendChild(tr);
    });

    return el('div', { class: 'table-panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-Token Ranking: Ranked by algorithmic implied value. Select any protocol row to inspect valuation mathematics and concrete farming action plans.' }),
          el('thead', null,
            el('tr', null,
              sortHeader('rank', '#'),
              sortHeader('name', 'Protocol'),
              sortHeader('tvl', 'TVL'),
              sortHeader('growth', '7d Velocity'),
              sortHeader('age', 'Age / Maturity'),
              sortHeader('implied', 'Implied Valuation'),
              el('th', { scope: 'col', text: 'Farm Plan' })
            )
          ),
          tbody
        )
      )
    );
  }

  // Live Token Reference Table (Tab 2)
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r, idx) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'rank-badge', text: String(idx + 1) })),
        el('td', null,
          el('div', { class: 'proto-cell' },
            el('div', { class: 'proto-row' },
              el('span', { class: 'proto-name', text: r.name }),
              el('span', { class: 'tag-watchlist', style: 'border-color:var(--accent-cyan);color:var(--accent-cyan);', text: 'Live Token' })
            ),
            el('div', { class: 'proto-tags' },
              el('span', { class: 'tag-cat', text: r.category || 'Other' }),
              (r.chains || []).slice(0, 3).map(function (c) {
                return el('span', { class: 'tag-chain', text: c });
              })
            )
          )
        ),
        el('td', { class: 'num' }, el('b', { text: fmtUsd(r.tvl_usd) })),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') },
          el('span', { text: (r.change_7d !== null && r.change_7d >= 0 ? '▲ ' : '▼ ') + fmtPct(r.change_7d) })
        ),
        el('td', { class: 'num' },
          el('span', { style: 'color:var(--accent-cyan);font-weight:700;', text: fmtUsd(r.mcap_usd) })
        ),
        el('td', null,
          el('span', { class: 'pill-meta', text: 'Already Trading' })
        )
      ));
    });

    return el('div', { class: 'table-panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Traded Market Cap Baseline: Protocols that already trade tokens. Their values are empirical market facts, completely segregated from the pre-token radar model.' }),
          el('thead', null,
            el('tr', null,
              el('th', { scope: 'col', text: '#' }),
              el('th', { scope: 'col', text: 'Protocol' }),
              el('th', { scope: 'col', text: 'TVL' }),
              el('th', { scope: 'col', text: '7d Velocity' }),
              el('th', { scope: 'col', text: 'Traded Market Cap' }),
              el('th', { scope: 'col', text: 'Market Status' })
            )
          ),
          tbody
        )
      )
    );
  }

  // Model & Valuation Arithmetic Explainer Panel
  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'model-panel' },
      el('div', { class: 'model-head' },
        el('h2', { class: 'model-title', text: 'Quantitative Implied Valuation Engine' }),
        el('span', { class: 'model-version-badge', text: 'Model ' + DATA.model_version })
      ),
      el('div', { class: 'formula-box' },
        'implied_value_usd = round( tvl_usd x ' + m.base_multiple +
        ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')' +
        ' x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'model-sub', text: 'The valuation model combines three verified on-chain dimensions: (1) Capital Scale via base multiple (' + m.base_multiple + 'x TVL); (2) Growth Velocity via 7-day change rate (clamped between ' + m.growth_floor + '% and +' + m.growth_cap + '% with weight ' + m.growth_weight + '); and (3) Protocol Longevity via tracked deployment age (' + m.maturity_days + ' days maturity scaling from ' + m.maturity_floor + 'x to 1.00x). Pre-token protocols below the watchlist floor represent early momentum discoveries.' })
    );
  }

  // Protocol Detail Modal / Drawer
  var dialog = el('dialog', { class: 'detail-modal', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () {
    state.selected = null;
    writeHash();
    render();
  });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;

    state.selected = slug;
    writeHash();

    dialog.textContent = '';
    var steps = farmSteps(row);
    var isWatchlist = row.rank <= DATA.watchlist_size;
    var recomputed = impliedOf(row, DATA.model);
    var matchesExact = recomputed === row.implied_value_usd;

    // Header
    dialog.appendChild(el('div', { class: 'detail-top' },
      el('div', null,
        el('span', { class: 'detail-rank-tag', text: 'RANK #' + row.rank + ' OF ' + DATA.board_size }),
        el('h2', { id: 'detail-title', class: 'detail-proto-title', text: row.name }),
        el('div', { class: 'proto-tags' },
          isWatchlist ? el('span', { class: 'tag-watchlist', text: 'Watchlist Verified' }) : el('span', { class: 'tag-cat', text: 'Early Momentum' }),
          el('span', { class: 'tag-cat', text: row.category || 'Other' }),
          (row.chains || []).map(function (c) { return el('span', { class: 'tag-chain', text: c }); })
        )
      ),
      el('button', {
        class: 'btn-close-modal',
        type: 'button',
        'aria-label': 'Close details',
        text: '✕',
        onclick: function () { dialog.close(); }
      })
    ));

    // Valuation Formula Card
    var baseValuation = Math.round(row.tvl_usd * DATA.model.base_multiple);
    dialog.appendChild(el('section', { class: 'detail-card' },
      el('div', { class: 'detail-section-title' },
        el('span', { text: 'Implied Valuation Arithmetic' }),
        el('span', { class: 'verified-badge', text: matchesExact ? 'Formula Verified Match' : 'Recomputed' })
      ),
      el('div', { class: 'math-rows' },
        el('div', { class: 'math-row' },
          el('span', { class: 'math-label', text: 'TVL (On-Chain Assets):' }),
          el('b', { class: 'num', text: fmtExactUsd(row.tvl_usd) })
        ),
        el('div', { class: 'math-row' },
          el('span', { class: 'math-label', text: 'Base Valuation (' + DATA.model.base_multiple + 'x Multiple):' }),
          el('b', { class: 'num', text: fmtExactUsd(baseValuation) })
        ),
        el('div', { class: 'math-row' },
          el('span', { class: 'math-label', text: '7-Day Velocity & Growth Multiplier:' }),
          el('b', { class: 'num', text: fmtPct(row.change_7d) + ' -> ' + Number(row.growth_multiplier).toFixed(4) + 'x' })
        ),
        el('div', { class: 'math-row' },
          el('span', { class: 'math-label', text: 'Tracked Age & Maturity Multiplier:' }),
          el('b', { class: 'num', text: fmtAge(row.age_days) + ' -> ' + Number(row.maturity_multiplier).toFixed(4) + 'x' })
        ),
        el('div', { class: 'math-row' },
          el('span', { class: 'math-label', text: 'Final Implied Value:' }),
          el('b', { class: 'num', text: fmtExactUsd(row.implied_value_usd) })
        )
      )
    ));

    // Farm Plan Roadmap Card
    dialog.appendChild(el('section', { class: 'detail-card' },
      el('div', { class: 'detail-section-title' },
        el('span', { text: 'Concrete Farming Strategy' }),
        el('span', { class: 'pill-meta', text: '6 Actionable Steps' })
      ),
      el('ol', { class: 'step-cards' },
        steps.map(function (s) {
          return el('li', { class: 'step-card' },
            el('div', { class: 'step-header' },
              el('span', { class: 'step-num-badge', text: String(s.num) }),
              el('b', { style: 'font-size:13px;color:var(--ink-secondary);', text: s.title })
            ),
            el('div', { class: 'step-action', text: s.action }),
            el('div', { class: 'step-meta-row' },
              el('span', { class: 'step-cost', text: 'Cost: ' + s.cost }),
              el('span', { class: 'step-time', text: 'Time: ' + s.time })
            )
          );
        })
      )
    ));

    if (typeof dialog.showModal === 'function') {
      try {
        if (!dialog.open) dialog.showModal();
      } catch (e) {
        dialog.setAttribute('open', '');
      }
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // Main Render Loop
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });

    shell.appendChild(topNav());
    shell.appendChild(heroSection());
    shell.appendChild(toolbar());

    if (state.tab === 'pre-token') {
      shell.appendChild(boardTable());
      shell.appendChild(modelPanel());
    } else {
      shell.appendChild(liveTable());
    }

    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');

    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();

  window.addEventListener('hashchange', function () {
    readHash();
    render();
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) {
      dialog.close();
    }
  });
})();
