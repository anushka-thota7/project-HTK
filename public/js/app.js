// SmartWare UI Controller

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function toast(msg, type = 'info') {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  const colors = { info: 'text-brand-400', success: 'text-emerald-400', warning: 'text-amber-400', error: 'text-red-400' };
  el.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : type === 'warning' ? 'alert-triangle' : type === 'error' ? 'x-circle' : 'info'}" class="w-5 h-5 ${colors[type] || colors.info}"></i>
    <span class="text-sm text-slate-200">${msg}</span>
  `;
  container.appendChild(el);
  lucide.createIcons();
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = 'all 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function openModal(title, bodyHtml) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  document.getElementById('modal').classList.add('open');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

// Navigation
function switchView(view) {
  $$('.view-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const titles = { dashboard: 'Dashboard', orders: 'Orders', inventory: 'Inventory', picking: 'Picking & Packing', analytics: 'Analytics', exceptions: 'Exceptions' };
  const pt = document.getElementById('page-title');
  if (pt) pt.textContent = titles[view] || view;
  if (view === 'dashboard') renderDashboard();
  if (view === 'orders') renderOrders();
  if (view === 'inventory') renderInventory();
  if (view === 'picking') renderPicking();
  if (view === 'analytics') renderAnalytics();
  if (view === 'exceptions') renderExceptions();
}

// ========== RENDERERS ==========

function renderKPIs() {
  const open = STATE.orders.filter(o => !['dispatched'].includes(o.status)).length;
  const urgent = STATE.orders.filter(o => o.priority === 'urgent' && o.status !== 'dispatched').length;
  const picking = STATE.orders.filter(o => o.status === 'picking').length;
  const ready = STATE.orders.filter(o => o.status === 'ready').length;
  const low = Engine.getLowStock().length;
  const ex = STATE.exceptions.filter(e => e.status === 'open').length;

  $('#kpi-open-orders').textContent = open;
  $('#kpi-urgent').textContent = urgent;
  $('#kpi-picking').textContent = picking;
  $('#kpi-ready').textContent = ready;
  $('#kpi-lowstock').textContent = low;
  $('#kpi-exceptions').textContent = ex;

  const badge = document.getElementById('exception-badge');
  if (badge) {
    badge.textContent = ex;
    if (ex > 0) badge.classList.add('show');
    else badge.classList.remove('show');
  }
}

function renderPipeline() {
  const list = $('#pipeline-list');
  const active = STATE.orders
    .filter(o => !['dispatched'].includes(o.status))
    .slice(0, 12);

  list.innerHTML = active.map(o => {
    const slaLeft = o.slaHours - (Date.now() - new Date(o.createdAt).getTime()) / 3600000;
    const slaColor = slaLeft < 0 ? 'text-red-400' : slaLeft < 2 ? 'text-amber-400' : 'text-slate-400';
    return `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-brand-500/30 transition-colors cursor-pointer order-row" data-order="${o.id}">
        <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-700/80 flex items-center justify-center text-xs font-bold text-slate-300">
          ${o.priorityScore}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-sm text-white truncate">${o.id}</span>
            <span class="status-badge priority-${o.priority}">${o.priority}</span>
          </div>
          <p class="text-xs text-slate-400 truncate">${o.customer} • ${o.items.length} item(s)</p>
        </div>
        <div class="text-right flex-shrink-0">
          <span class="status-badge status-${o.status}">${o.status}</span>
          <p class="text-[10px] ${slaColor} mt-1">${slaLeft < 0 ? 'OVERDUE' : Math.ceil(slaLeft) + 'h left'}</p>
        </div>
      </div>
    `;
  }).join('') || '<p class="text-slate-500 text-sm text-center py-8">No active orders</p>';

  list.querySelectorAll('[data-order]').forEach(el => {
    el.addEventListener('click', () => showOrderDetail(el.dataset.order));
  });
}

function renderActivity() {
  const feed = $('#activity-feed');
  feed.innerHTML = STATE.activity.slice(0, 15).map(a => {
    const icon = a.type === 'success' ? 'check-circle' : a.type === 'warning' ? 'alert-triangle' : 'info';
    const color = a.type === 'success' ? 'text-emerald-400' : a.type === 'warning' ? 'text-amber-400' : 'text-brand-400';
    return `
      <div class="flex gap-3 text-sm">
        <i data-lucide="${icon}" class="w-4 h-4 ${color} flex-shrink-0 mt-0.5"></i>
        <div>
          <p class="text-slate-300">${a.text}</p>
          <p class="text-[10px] text-slate-500">${formatRelative(a.time)}</p>
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

function renderStatusChart() {
  const ctx = $('#statusChart');
  if (!ctx) return;
  const counts = { pending: 0, allocated: 0, picking: 0, packing: 0, ready: 0, dispatched: 0, exception: 0 };
  STATE.orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });

  if (STATE.charts.status) STATE.charts.status.destroy();
  STATE.charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: [
          '#64748b', '#3b82f6', '#22d3ee', '#a855f7', '#10b981', '#059669', '#ef4444'
        ],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
      },
      cutout: '62%',
    },
  });
}

function renderInventoryChart() {
  const ctx = $('#inventoryChart');
  if (!ctx) return;
  const healthy = STATE.inventory.filter(i => i.available > i.reorderPoint).length;
  const low = STATE.inventory.filter(i => i.available > 0 && i.available <= i.reorderPoint).length;
  const out = STATE.inventory.filter(i => i.available <= 0).length;

  if (STATE.charts.inv) STATE.charts.inv.destroy();
  STATE.charts.inv = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Healthy', 'Low Stock', 'Out of Stock'],
      datasets: [{
        data: [healthy, low, out],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderRadius: 6,
        barThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#64748b', stepSize: 1 }, grid: { color: 'rgba(71,85,105,0.3)' } },
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
      },
    },
  });
}

function renderDashboard() {
  Engine.refreshPriorities();
  renderKPIs();
  renderPipeline();
  renderActivity();
  renderStatusChart();
  renderInventoryChart();

  // Auto-surface the classic decision if present
  const urgent = STATE.orders.find(o => o.id === 'ORD-DEMO-001' && o.status === 'pending');
  if (urgent) {
    const check = Engine.checkAvailability(urgent);
    if (check.some(c => c.shortfall > 0)) {
      const decision = Engine.resolveShortage(urgent, check);
      showDecisionBanner(urgent, decision);
    }
  } else {
    document.getElementById('decision-banner').classList.remove('show');
  }
}

function showDecisionBanner(order, decision) {
  const banner = $('#decision-banner');
  banner.classList.add('show');
  $('#decision-text').textContent = decision.reason +
    (decision.shortItems ? ` Shortfall: ${decision.shortItems.map(s => `${s.sku} needs ${s.needed}, has ${s.available}`).join('; ')}` : '');

  const actions = $('#decision-actions');
  actions.innerHTML = (decision.options || []).map(opt => `
    <button class="decision-btn ${opt.id === 'reallocate' || opt.id === 'partial' ? 'bg-brand-600 text-white hover:bg-brand-500' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}"
      data-action="${opt.id}" data-order="${order.id}">
      ${opt.label}
    </button>
  `).join('');

  actions.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleDecision(btn.dataset.order, btn.dataset.action, decision));
  });
}

function handleDecision(orderId, action, decision) {
  const order = STATE.orders.find(o => o.id === orderId);
  if (!order) return;

  if (action === 'reallocate') {
    // Move stock from competing lower priority
    (decision.competing || []).forEach(c => {
      Engine.reallocate(c.order.id, orderId, c.sku, c.held);
    });
    // Now allocate remaining available
    Engine.allocateOrder(order, 'full');
    toast('Stock reallocated from lower-priority orders', 'success');
  } else if (action === 'partial') {
    Engine.allocateOrder(order, 'partial');
    toast('Partial allocation done – backorder created for shortfall', 'warning');
  } else if (action === 'wait') {
    order.status = 'pending';
    Engine.createException(order, 'awaiting_stock', decision.shortItems);
    toast('Order held until stock arrives', 'info');
  } else if (action === 'split') {
    Engine.allocateOrder(order, 'partial');
    toast('Order split – partial ships now', 'success');
  } else if (action === 'cancel_item') {
    order.items = order.items.filter(i => {
      const inv = STATE.inventory.find(x => x.sku === i.sku);
      return inv && (inv.quantity - inv.reserved) >= i.qty;
    });
    if (order.items.length) Engine.allocateOrder(order, 'full');
    else order.status = 'exception';
    toast('Short items cancelled, rest allocated', 'warning');
  }

  document.getElementById('decision-banner').classList.remove('show');
  renderDashboard();
  renderOrders();
}

window.showDecision = function(order, decision) {
  showDecisionBanner(order, decision);
  switchView('dashboard');
};

function showOrderDetail(orderId) {
  const o = STATE.orders.find(x => x.id === orderId);
  if (!o) return;
  const check = Engine.checkAvailability(o);
  openModal(`Order ${o.id}`, `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div><span class="text-slate-400">Customer</span><p class="font-medium">${o.customer}</p></div>
        <div><span class="text-slate-400">Priority</span><p><span class="status-badge priority-${o.priority}">${o.priority}</span> (score ${o.priorityScore})</p></div>
        <div><span class="text-slate-400">Status</span><p><span class="status-badge status-${o.status}">${o.status}</span></p></div>
        <div><span class="text-slate-400">Created</span><p>${formatRelative(o.createdAt)}</p></div>
      </div>
      ${o.notes ? `<p class="text-sm text-amber-300/90 bg-amber-500/10 rounded-lg p-2">${o.notes}</p>` : ''}
      <div>
        <h4 class="text-sm font-semibold mb-2">Line Items</h4>
        <div class="space-y-2">
          ${o.items.map(i => {
            const c = check.find(x => x.sku === i.sku) || {};
            return `
              <div class="flex justify-between items-center text-sm bg-slate-800/60 rounded-lg px-3 py-2">
                <div>
                  <p class="font-medium">${i.name}</p>
                  <p class="text-xs text-slate-400">${i.sku} • Need ${i.qty} • Alloc ${i.allocated || 0}</p>
                </div>
                <span class="text-xs ${c.shortfall > 0 ? 'text-red-400' : 'text-emerald-400'}">
                  ${c.shortfall > 0 ? `−${c.shortfall}` : 'OK'}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="flex flex-wrap gap-2 pt-2">
        ${o.status === 'pending' ? `<button class="btn-primary text-sm" onclick="Engine.advanceOrder('${o.id}'); closeModal(); refreshAll();">Allocate / Decide</button>` : ''}
        ${['allocated','picking','packing','ready'].includes(o.status) ? `<button class="btn-primary text-sm" onclick="Engine.advanceOrder('${o.id}'); closeModal(); refreshAll();">Advance →</button>` : ''}
        <button class="btn-secondary text-sm" onclick="closeModal()">Close</button>
      </div>
    </div>
  `);
}

function renderOrders() {
  Engine.refreshPriorities();
  const filter = $('#order-filter')?.value || 'all';
  let orders = [...STATE.orders];
  if (filter !== 'all') orders = orders.filter(o => o.status === filter);

  const tbody = $('#orders-tbody');
  tbody.innerHTML = orders.map(o => {
    const age = formatRelative(o.createdAt);
    return `
      <tr class="order-row border-b border-slate-800/60">
        <td class="py-3 pr-4 font-medium text-brand-300 cursor-pointer hover:underline" data-order="${o.id}">${o.id}</td>
        <td class="py-3 pr-4 text-slate-300">${o.customer}</td>
        <td class="py-3 pr-4"><span class="status-badge priority-${o.priority}">${o.priority}</span></td>
        <td class="py-3 pr-4 text-slate-400">${o.items.length} SKUs</td>
        <td class="py-3 pr-4"><span class="status-badge status-${o.status}">${o.status}</span></td>
        <td class="py-3 pr-4 text-xs text-slate-400">${age}</td>
        <td class="py-3">
          <button class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600" data-advance="${o.id}">
            ${o.status === 'pending' ? 'Process' : o.status === 'dispatched' ? '—' : 'Advance'}
          </button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" class="py-8 text-center text-slate-500">No orders</td></tr>';

  tbody.querySelectorAll('[data-order]').forEach(el => {
    el.addEventListener('click', () => showOrderDetail(el.dataset.order));
  });
  tbody.querySelectorAll('[data-advance]').forEach(el => {
    el.addEventListener('click', () => {
      Engine.advanceOrder(el.dataset.advance);
      refreshAll();
    });
  });
}

function renderInventory() {
  const search = ($('#inv-search')?.value || '').toLowerCase();
  const filter = $('#inv-filter')?.value || 'all';
  let items = [...STATE.inventory];

  if (search) items = items.filter(i => i.sku.toLowerCase().includes(search) || i.name.toLowerCase().includes(search));
  if (filter === 'low') items = items.filter(i => i.available > 0 && i.available <= i.reorderPoint);
  if (filter === 'out') items = items.filter(i => i.available <= 0);
  if (filter === 'healthy') items = items.filter(i => i.available > i.reorderPoint);

  const grid = $('#inventory-grid');
  grid.innerHTML = items.map(i => {
    const pct = Math.min(100, (i.available / i.maxStock) * 100);
    const status = i.available <= 0 ? 'out' : i.available <= i.reorderPoint ? 'low' : '';
    const barColor = i.available <= 0 ? 'bg-red-500' : i.available <= i.reorderPoint ? 'bg-amber-500' : 'bg-emerald-500';
    return `
      <div class="inv-card ${status}">
        <div class="flex justify-between items-start mb-2">
          <div>
            <p class="text-xs text-slate-400 font-mono">${i.sku}</p>
            <p class="font-medium text-sm text-white leading-tight mt-0.5">${i.name}</p>
          </div>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">${i.location}</span>
        </div>
        <div class="flex justify-between text-xs text-slate-400 mb-1.5">
          <span>Avail: <strong class="text-white">${i.available}</strong></span>
          <span>Reserved: ${i.reserved}</span>
        </div>
        <div class="stock-bar mb-2">
          <div class="stock-bar-fill ${barColor}" style="width:${pct}%"></div>
        </div>
        <div class="flex justify-between text-[11px] text-slate-500">
          <span>ROP: ${i.reorderPoint}</span>
          <span class="${status === 'out' ? 'text-red-400 font-semibold' : status === 'low' ? 'text-amber-400 font-semibold' : 'text-emerald-400'}">
            ${status === 'out' ? 'OUT OF STOCK' : status === 'low' ? 'LOW STOCK' : 'Healthy'}
          </span>
        </div>
      </div>
    `;
  }).join('') || '<p class="text-slate-500 col-span-full text-center py-12">No matching SKUs</p>';
}

function renderPicking() {
  const waves = $('#pick-waves');
  const activeWaves = STATE.pickWaves.filter(w => w.status === 'active');
  waves.innerHTML = activeWaves.length ? activeWaves.map(w => `
    <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
      <div class="flex justify-between items-center mb-2">
        <span class="font-mono text-sm text-cyan-300">${w.id}</span>
        <span class="text-xs text-slate-400">Order ${w.orderId}</span>
      </div>
      <div class="space-y-1.5">
        ${w.items.map(i => `
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-300">${i.name} <span class="text-slate-500">@ ${i.location}</span></span>
            <div class="flex items-center gap-2">
              <span class="${i.picked >= i.qty ? 'text-emerald-400' : 'text-slate-400'}">${i.picked}/${i.qty}</span>
              ${i.picked < i.qty ? `<button class="px-1.5 py-0.5 rounded bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600/50" data-pick="${w.id}" data-sku="${i.sku}">+1</button>` : '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i>'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('') : '<p class="text-slate-500 text-sm py-6 text-center">No active pick waves. Advance allocated orders to create waves.</p>';

  waves.querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      Engine.markPicked(btn.dataset.pick, btn.dataset.sku, 1);
      renderPicking();
      renderKPIs();
      toast('Item picked', 'success');
    });
  });

  // Packing list
  const packing = STATE.orders.filter(o => o.status === 'packing' || o.status === 'ready');
  $('#packing-list').innerHTML = packing.length ? packing.map(o => `
    <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex justify-between items-center">
      <div>
        <p class="font-medium text-sm">${o.id}</p>
        <p class="text-xs text-slate-400">${o.customer} • ${o.items.reduce((s,i)=>s+i.allocated,0)} units</p>
      </div>
      <button class="btn-primary text-xs" onclick="Engine.advanceOrder('${o.id}'); refreshAll();">
        ${o.status === 'packing' ? 'QC & Pack →' : 'Dispatch →'}
      </button>
    </div>
  `).join('') : '<p class="text-slate-500 text-sm py-6 text-center">Nothing at packing station</p>';

  lucide.createIcons();
}

function renderAnalytics() {
  // Throughput chart (mock daily)
  const ctx = $('#throughputChart');
  if (ctx) {
    if (STATE.charts.tp) STATE.charts.tp.destroy();
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    STATE.charts.tp = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Orders Fulfilled',
            data: [42, 55, 48, 61, 58, 35, 28],
            borderColor: '#33a1ff',
            backgroundColor: 'rgba(51,161,255,0.1)',
            fill: true,
            tension: 0.35,
          },
          {
            label: 'Target',
            data: [50, 50, 50, 50, 50, 30, 25],
            borderColor: '#64748b',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
        scales: {
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(71,85,105,0.3)' } },
          x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        },
      },
    });
  }

  // Bottlenecks
  const bn = Engine.detectBottlenecks();
  $('#bottleneck-list').innerHTML = bn.length ? bn.map(b => `
    <div class="flex gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
      <div class="w-2 rounded-full ${b.severity === 'critical' ? 'bg-red-500' : b.severity === 'high' ? 'bg-amber-500' : 'bg-yellow-400'}"></div>
      <div>
        <p class="font-medium text-sm text-white">${b.stage}</p>
        <p class="text-xs text-slate-400 mt-0.5">${b.msg}</p>
      </div>
    </div>
  `).join('') : '<p class="text-emerald-400/90 text-sm">No major bottlenecks detected 🎉</p>';

  // Recommendations
  const recs = Engine.getReorderRecommendations().slice(0, 6);
  const extra = [
    { title: 'Optimize pick paths', desc: 'Zone A has highest travel time. Re-slot fast movers closer to packing.', type: 'ops' },
    { title: 'Add packing capacity', desc: 'Packing stage shows congestion during peak hours (2–5 PM).', type: 'ops' },
  ];
  $('#recommendations').innerHTML = [
    ...recs.map(r => `
      <div class="p-4 rounded-xl bg-slate-800/50 border border-slate-700/40">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-[10px] uppercase font-bold ${r.urgency === 'critical' ? 'text-red-400' : r.urgency === 'high' ? 'text-amber-400' : 'text-brand-400'}">${r.urgency}</span>
        </div>
        <p class="font-medium text-sm">Reorder ${r.sku}</p>
        <p class="text-xs text-slate-400 mt-1">${r.name} – only ${r.current} left. Suggest ${r.suggestedQty} units.</p>
      </div>
    `),
    ...extra.map(e => `
      <div class="p-4 rounded-xl bg-slate-800/50 border border-slate-700/40">
        <p class="font-medium text-sm text-cyan-300">${e.title}</p>
        <p class="text-xs text-slate-400 mt-1">${e.desc}</p>
      </div>
    `),
  ].join('');
}

function renderExceptions() {
  const list = $('#exceptions-list');
  const open = STATE.exceptions.filter(e => e.status === 'open');
  const resolved = STATE.exceptions.filter(e => e.status === 'resolved').slice(0, 5);

  list.innerHTML = `
    <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Open (${open.length})</h3>
    ${open.length ? open.map(ex => {
      const order = STATE.orders.find(o => o.id === ex.orderId);
      return `
        <div class="glass-panel mb-3 border-red-500/20">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="font-mono text-sm text-red-300">${ex.id}</span>
                <span class="status-badge status-exception">${ex.type.replace('_', ' ')}</span>
              </div>
              <p class="text-sm text-slate-300">Order <strong>${ex.orderId}</strong> • ${order?.customer || ''}</p>
              <p class="text-xs text-slate-400 mt-1">${formatRelative(ex.createdAt)}</p>
              ${ex.details ? `<p class="text-xs text-amber-200/80 mt-2">${JSON.stringify(ex.details).slice(0, 120)}...</p>` : ''}
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="btn-primary text-xs" onclick="Engine.resolveException('${ex.id}', 'Manual override – partial ship'); refreshAll();">Resolve Partial</button>
              <button class="btn-secondary text-xs" onclick="Engine.resolveException('${ex.id}', 'Awaiting PO'); refreshAll();">Wait for Stock</button>
              <button class="btn-danger text-xs" onclick="Engine.resolveException('${ex.id}', 'Cancelled by manager'); refreshAll();">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }).join('') : '<p class="text-slate-500 text-sm mb-6">No open exceptions 👍</p>'}

    <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 mt-6">Recently Resolved</h3>
    ${resolved.map(ex => `
      <div class="p-3 rounded-xl bg-slate-800/40 border border-slate-700/30 mb-2 text-sm">
        <span class="font-mono text-slate-400">${ex.id}</span>
        <span class="text-slate-500 mx-2">•</span>
        <span class="text-emerald-400/90">${ex.resolution || 'Resolved'}</span>
      </div>
    `).join('') || '<p class="text-slate-500 text-sm">None yet</p>'}
  `;
}

function refreshAll() {
  renderKPIs();
  const activeView = document.querySelector('.nav-btn.active')?.dataset.view || 'dashboard';
  switchView(activeView);
  lucide.createIcons();
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  // Nav
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Simulate order
  $('#simulate-btn').addEventListener('click', () => {
    Engine.createRandomOrder(Math.random() > 0.7);
    toast('New order simulated', 'info');
    refreshAll();
  });

  // Create order modal
  $('#create-order-btn')?.addEventListener('click', () => {
    Engine.createRandomOrder(false);
    toast('Order created', 'success');
    renderOrders();
    renderKPIs();
  });

  // Filters
  $('#order-filter')?.addEventListener('change', renderOrders);
  $('#inv-search')?.addEventListener('input', renderInventory);
  $('#inv-filter')?.addEventListener('change', renderInventory);

  // Modal close
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });

  // Initial priority calc
  Engine.refreshPriorities();

  // Seed some allocated/picking for demo
  STATE.orders.filter(o => o.status === 'allocated' && !STATE.pickWaves.some(w => w.orderId === o.id))
    .slice(0, 2)
    .forEach(o => {
      // Soft allocate
      o.items.forEach(item => {
        const inv = STATE.inventory.find(i => i.sku === item.sku);
        if (inv) {
          const avail = inv.quantity - inv.reserved;
          const qty = Math.min(item.qty, avail);
          inv.reserved += qty;
          inv.available = inv.quantity - inv.reserved;
          item.allocated = qty;
        }
      });
    });

  // First render
  switchView('dashboard');
  lucide.createIcons();

  // Gentle auto-refresh of relative times
  setInterval(() => {
    if ($('#view-dashboard') && $('#view-dashboard').classList.contains('active')) {
      renderActivity();
      renderPipeline();
    }
  }, 30000);

  toast('SmartWare online – Decision engine ready', 'success');
});
