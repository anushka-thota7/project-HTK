// SmartWare Decision Engine – prioritization, allocation, exceptions

const Engine = {
  // Priority score: higher = more important
  calculatePriorityScore(order) {
    let score = 0;
    const ageHours = (Date.now() - new Date(order.createdAt).getTime()) / 3600000;
    const slaLeft = order.slaHours - ageHours;

    // Base by priority tag
    const base = { urgent: 70, high: 50, normal: 30, low: 15 };
    score += base[order.priority] || 30;

    // SLA pressure
    if (slaLeft < 0) score += 40;           // overdue
    else if (slaLeft < 2) score += 25;
    else if (slaLeft < 4) score += 15;

    // Order value proxy (qty * rough cost)
    const value = order.items.reduce((s, i) => {
      const p = STATE.inventory.find(x => x.sku === i.sku);
      return s + (i.qty * (p?.unitCost || 20));
    }, 0);
    if (value > 500) score += 15;
    else if (value > 200) score += 8;

    // Age bonus
    score += Math.min(ageHours * 2, 20);

    order.priorityScore = Math.round(Math.min(score, 100));
    return order.priorityScore;
  },

  // Recalculate all pending/allocated scores
  refreshPriorities() {
    STATE.orders
      .filter(o => !['dispatched'].includes(o.status))
      .forEach(o => this.calculatePriorityScore(o));
    STATE.orders.sort((a, b) => b.priorityScore - a.priorityScore);
  },

  // Check stock availability for an order
  checkAvailability(order) {
    const results = [];
    for (const item of order.items) {
      const inv = STATE.inventory.find(i => i.sku === item.sku);
      if (!inv) {
        results.push({ sku: item.sku, needed: item.qty, available: 0, shortfall: item.qty, status: 'missing' });
        continue;
      }
      const avail = inv.quantity - inv.reserved;
      const shortfall = Math.max(0, item.qty - avail);
      results.push({
        sku: item.sku,
        name: item.name,
        needed: item.qty,
        available: Math.max(0, avail),
        shortfall,
        status: shortfall === 0 ? 'ok' : shortfall < item.qty ? 'partial' : 'none',
      });
    }
    return results;
  },

  // Smart allocation decision when shortage exists
  // Returns recommendation object
  resolveShortage(order, check) {
    const shortItems = check.filter(c => c.shortfall > 0);
    if (shortItems.length === 0) return { action: 'allocate', reason: 'Full stock available' };

    // Find competing lower-priority orders that hold the same SKUs
    const competing = [];
    for (const si of shortItems) {
      const holders = STATE.orders.filter(o =>
        o.id !== order.id &&
        ['allocated', 'pending'].includes(o.status) &&
        o.priorityScore < order.priorityScore &&
        o.items.some(i => i.sku === si.sku && i.allocated > 0)
      );
      holders.forEach(h => {
        const held = h.items.find(i => i.sku === si.sku);
        competing.push({ order: h, sku: si.sku, held: held.allocated });
      });
    }

    // Classic scenario: urgent needs more, lower priority has some
    if (order.priority === 'urgent' || order.priorityScore >= 80) {
      if (competing.length > 0) {
        return {
          action: 'reallocate',
          reason: `Urgent order ${order.id} needs stock currently reserved by lower-priority orders. Recommend partial reallocation.`,
          competing,
          shortItems,
          options: [
            { id: 'reallocate', label: 'Reallocate from lower priority', impact: 'May delay lower-priority orders' },
            { id: 'partial', label: 'Ship partial now + backorder rest', impact: 'Customer gets some stock faster' },
            { id: 'wait', label: 'Wait for inbound stock', impact: 'Risk SLA breach' },
            { id: 'split', label: 'Split order & expedite partial', impact: 'Two shipments, higher cost' },
          ],
        };
      }
      return {
        action: 'partial_or_wait',
        reason: `Insufficient stock for ${order.id}. No reallocatable inventory from lower-priority orders.`,
        shortItems,
        options: [
          { id: 'partial', label: 'Allocate available & create backorder', impact: 'Immediate partial fulfill' },
          { id: 'wait', label: 'Hold until full stock', impact: 'May miss SLA' },
          { id: 'cancel_item', label: 'Cancel short items & fulfill rest', impact: 'Partial order' },
        ],
      };
    }

    // Normal priority – just partial or wait
    return {
      action: 'partial_or_wait',
      reason: `Stock shortage for ${order.id}.`,
      shortItems,
      options: [
        { id: 'partial', label: 'Partial allocate', impact: 'Fulfill what is available' },
        { id: 'wait', label: 'Queue until stock arrives', impact: 'Delay' },
      ],
    };
  },

  // Execute allocation
  allocateOrder(order, mode = 'full') {
    const check = this.checkAvailability(order);
    let allOk = true;

    for (const c of check) {
      const inv = STATE.inventory.find(i => i.sku === c.sku);
      if (!inv) continue;
      const toAlloc = mode === 'full' ? c.needed : Math.min(c.needed, c.available);
      if (toAlloc < c.needed) allOk = false;

      inv.reserved += toAlloc;
      inv.available = inv.quantity - inv.reserved;
      const item = order.items.find(i => i.sku === c.sku);
      if (item) item.allocated = toAlloc;
    }

    order.status = allOk ? 'allocated' : 'exception';
    if (!allOk) {
      this.createException(order, 'stock_shortage', check.filter(c => c.shortfall > 0));
    }

    this.log(`Allocated ${mode} stock for ${order.id}`, allOk ? 'success' : 'warning');
    return { success: allOk, check };
  },

  // Reallocate from lower priority to urgent
  reallocate(fromOrderId, toOrderId, sku, qty) {
    const from = STATE.orders.find(o => o.id === fromOrderId);
    const to = STATE.orders.find(o => o.id === toOrderId);
    if (!from || !to) return false;

    const fromItem = from.items.find(i => i.sku === sku);
    const toItem = to.items.find(i => i.sku === sku);
    if (!fromItem || !toItem) return false;

    const move = Math.min(qty, fromItem.allocated);
    fromItem.allocated -= move;
    toItem.allocated = (toItem.allocated || 0) + move;

    // If from order now has zero allocated on all, mark exception
    const stillHas = from.items.some(i => i.allocated > 0);
    if (!stillHas && from.status === 'allocated') {
      from.status = 'exception';
      this.createException(from, 'reallocated_away', [{ sku, qty: move }]);
    }

    this.log(`Reallocated ${move}× ${sku} from ${fromOrderId} → ${toOrderId}`, 'warning');
    return true;
  },

  createException(order, type, details) {
    const existing = STATE.exceptions.find(e => e.orderId === order.id && e.status === 'open');
    if (existing) return existing;

    const ex = {
      id: generateId('EX'),
      orderId: order.id,
      type,
      details,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolution: null,
    };
    STATE.exceptions.unshift(ex);
    order.status = 'exception';
    this.log(`Exception created for ${order.id}: ${type}`, 'warning');
    return ex;
  },

  resolveException(exId, resolution) {
    const ex = STATE.exceptions.find(e => e.id === exId);
    if (!ex) return;
    ex.status = 'resolved';
    ex.resolution = resolution;
    ex.resolvedAt = new Date().toISOString();
    const order = STATE.orders.find(o => o.id === ex.orderId);
    if (order && order.status === 'exception') {
      // Move forward if possible
      const check = this.checkAvailability(order);
      if (check.every(c => c.shortfall === 0 || c.available > 0)) {
        order.status = 'allocated';
      }
    }
    this.log(`Exception ${exId} resolved: ${resolution}`, 'success');
  },

  // Advance order through workflow
  advanceOrder(orderId) {
    const order = STATE.orders.find(o => o.id === orderId);
    if (!order) return;

    const flow = {
      pending: 'allocated',
      allocated: 'picking',
      picking: 'packing',
      packing: 'ready',
      ready: 'dispatched',
    };

    if (order.status === 'pending') {
      // Auto try allocate
      const check = this.checkAvailability(order);
      if (check.every(c => c.shortfall === 0)) {
        this.allocateOrder(order, 'full');
      } else {
        // Trigger decision
        const decision = this.resolveShortage(order, check);
        window.showDecision(order, decision);
        return;
      }
    } else if (order.status === 'allocated') {
      order.status = 'picking';
      this.createPickWave(order);
      this.log(`${orderId} moved to picking`, 'info');
    } else if (order.status === 'picking') {
      order.status = 'packing';
      this.log(`${orderId} moved to packing`, 'info');
    } else if (order.status === 'packing') {
      order.status = 'ready';
      this.log(`${orderId} ready for dispatch`, 'success');
    } else if (order.status === 'ready') {
      // Deduct inventory
      order.items.forEach(item => {
        const inv = STATE.inventory.find(i => i.sku === item.sku);
        if (inv) {
          inv.quantity -= item.allocated;
          inv.reserved -= item.allocated;
          inv.available = inv.quantity - inv.reserved;
          inv.lastUpdated = new Date().toISOString();
        }
      });
      order.status = 'dispatched';
      this.log(`${orderId} dispatched – inventory updated`, 'success');
    }
  },

  createPickWave(order) {
    const wave = {
      id: generateId('WAVE'),
      orderId: order.id,
      status: 'active',
      items: order.items.map(i => {
        const inv = STATE.inventory.find(x => x.sku === i.sku);
        return {
          sku: i.sku,
          name: i.name,
          qty: i.allocated,
          location: inv?.location || '?',
          picked: 0,
        };
      }),
      createdAt: new Date().toISOString(),
    };
    STATE.pickWaves.unshift(wave);
  },

  markPicked(waveId, sku, qty) {
    const wave = STATE.pickWaves.find(w => w.id === waveId);
    if (!wave) return;
    const item = wave.items.find(i => i.sku === sku);
    if (item) {
      item.picked = Math.min(item.qty, (item.picked || 0) + qty);
    }
    if (wave.items.every(i => i.picked >= i.qty)) {
      wave.status = 'complete';
      const order = STATE.orders.find(o => o.id === wave.orderId);
      if (order && order.status === 'picking') {
        order.status = 'packing';
        this.log(`Wave ${waveId} complete → packing`, 'success');
      }
    }
  },

  // Low stock detection
  getLowStock() {
    return STATE.inventory.filter(i => i.available <= i.reorderPoint);
  },

  getOutOfStock() {
    return STATE.inventory.filter(i => i.available <= 0);
  },

  // Reorder recommendations
  getReorderRecommendations() {
    return this.getLowStock().map(i => ({
      sku: i.sku,
      name: i.name,
      current: i.available,
      reorderPoint: i.reorderPoint,
      suggestedQty: Math.max(i.maxStock - i.available, i.reorderPoint * 2),
      urgency: i.available === 0 ? 'critical' : i.available < i.reorderPoint * 0.5 ? 'high' : 'medium',
    }));
  },

  // Bottleneck detection
  detectBottlenecks() {
    const counts = { pending: 0, allocated: 0, picking: 0, packing: 0, ready: 0, exception: 0 };
    STATE.orders.forEach(o => {
      if (counts[o.status] !== undefined) counts[o.status]++;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const bottlenecks = [];
    if (counts.pending / total > 0.3) bottlenecks.push({ stage: 'Order Intake / Allocation', severity: 'high', msg: 'Many orders waiting for stock allocation' });
    if (counts.picking / total > 0.25) bottlenecks.push({ stage: 'Picking', severity: 'medium', msg: 'Picking queue building up – consider more pickers or better pathing' });
    if (counts.packing / total > 0.2) bottlenecks.push({ stage: 'Packing', severity: 'medium', msg: 'Packing station congestion' });
    if (counts.exception > 3) bottlenecks.push({ stage: 'Exceptions', severity: 'high', msg: `${counts.exception} open exceptions blocking fulfillment` });
    if (this.getOutOfStock().length > 2) bottlenecks.push({ stage: 'Inventory', severity: 'critical', msg: 'Multiple SKUs out of stock' });
    return bottlenecks;
  },

  log(text, type = 'info') {
    STATE.activity.unshift({
      time: new Date().toISOString(),
      type,
      text,
    });
    if (STATE.activity.length > 50) STATE.activity.pop();
  },

  // Simulate new order
  createRandomOrder(forceUrgent = false) {
    const itemCount = randomInt(1, 3);
    const items = [];
    const used = new Set();
    for (let j = 0; j < itemCount; j++) {
      let p;
      do { p = pick(PRODUCTS); } while (used.has(p.sku));
      used.add(p.sku);
      items.push({ sku: p.sku, name: p.name, qty: randomInt(1, 6), allocated: 0 });
    }
    const priority = forceUrgent ? 'urgent' : pick(['urgent', 'high', 'normal', 'normal', 'low']);
    const order = {
      id: generateId('ORD'),
      customer: pick(CUSTOMERS),
      priority,
      status: 'pending',
      items,
      createdAt: new Date().toISOString(),
      slaHours: priority === 'urgent' ? 4 : priority === 'high' ? 8 : 24,
      notes: forceUrgent ? 'Rush order' : '',
      priorityScore: 0,
    };
    this.calculatePriorityScore(order);
    STATE.orders.unshift(order);
    this.log(`New order ${order.id} created (${priority})`, 'info');
    return order;
  },
};
