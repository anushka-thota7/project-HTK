// SmartWare Mock Data & Seed
const PRODUCTS = [
  { sku: 'SKU-1001', name: 'Wireless Earbuds Pro', category: 'Electronics', location: 'A-12-03', unitCost: 45, reorderPoint: 50, maxStock: 300 },
  { sku: 'SKU-1002', name: 'USB-C Fast Charger 65W', category: 'Electronics', location: 'A-12-07', unitCost: 18, reorderPoint: 80, maxStock: 400 },
  { sku: 'SKU-1003', name: 'Laptop Stand Aluminum', category: 'Accessories', location: 'B-04-01', unitCost: 32, reorderPoint: 40, maxStock: 200 },
  { sku: 'SKU-1004', name: 'Mechanical Keyboard RGB', category: 'Electronics', location: 'A-15-02', unitCost: 89, reorderPoint: 30, maxStock: 150 },
  { sku: 'SKU-1005', name: 'Ergonomic Mouse Pad XL', category: 'Accessories', location: 'B-04-05', unitCost: 12, reorderPoint: 100, maxStock: 500 },
  { sku: 'SKU-1006', name: 'Noise Cancelling Headphones', category: 'Electronics', location: 'A-14-01', unitCost: 149, reorderPoint: 25, maxStock: 120 },
  { sku: 'SKU-1007', name: 'Portable SSD 1TB', category: 'Storage', location: 'C-02-03', unitCost: 95, reorderPoint: 35, maxStock: 180 },
  { sku: 'SKU-1008', name: 'Webcam 4K Ultra HD', category: 'Electronics', location: 'A-13-04', unitCost: 78, reorderPoint: 40, maxStock: 160 },
  { sku: 'SKU-1009', name: 'Smart LED Desk Lamp', category: 'Home', location: 'D-01-02', unitCost: 42, reorderPoint: 45, maxStock: 220 },
  { sku: 'SKU-1010', name: 'Bluetooth Speaker Mini', category: 'Audio', location: 'A-16-01', unitCost: 29, reorderPoint: 60, maxStock: 280 },
  { sku: 'SKU-1011', name: 'Phone Case MagSafe', category: 'Accessories', location: 'B-05-03', unitCost: 15, reorderPoint: 120, maxStock: 600 },
  { sku: 'SKU-1012', name: 'Cable Organizer Kit', category: 'Accessories', location: 'B-05-08', unitCost: 8, reorderPoint: 150, maxStock: 700 },
  { sku: 'SKU-1013', name: 'Monitor Arm Dual', category: 'Accessories', location: 'B-03-01', unitCost: 65, reorderPoint: 20, maxStock: 100 },
  { sku: 'SKU-1014', name: 'Gaming Mouse Wireless', category: 'Electronics', location: 'A-15-05', unitCost: 55, reorderPoint: 45, maxStock: 200 },
  { sku: 'SKU-1015', name: 'Power Bank 20000mAh', category: 'Electronics', location: 'C-01-04', unitCost: 38, reorderPoint: 50, maxStock: 250 },
];

const CUSTOMERS = [
  'TechNova Corp', 'Apex Retail', 'CloudCart Inc', 'UrbanGadgets', 'PrimeShip Logistics',
  'NextGen Electronics', 'BlueSky Commerce', 'RapidOrder Co', 'Zenith Supplies', 'Horizon Mart',
  'PixelPerfect Store', 'SwiftBuy Online', 'EcoTech Solutions', 'Metro Wholesale', 'Lumina Retail'
];

const ZONES = ['A-Electronics', 'B-Accessories', 'C-Storage', 'D-Home'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomInt(100, 999)}`;
}

function seedInventory() {
  return PRODUCTS.map(p => {
    // Some intentionally low / out of stock for demos
    let qty;
    if (p.sku === 'SKU-1001') qty = 7;      // for the classic "urgent needs 10, only 7"
    else if (p.sku === 'SKU-1006') qty = 0;
    else if (p.sku === 'SKU-1013') qty = 12;
    else qty = randomInt(p.reorderPoint - 20, p.maxStock * 0.85);
    if (qty < 0) qty = 0;
    return {
      ...p,
      quantity: qty,
      reserved: 0,
      available: qty,
      lastUpdated: new Date().toISOString(),
      damaged: 0,
    };
  });
}

function seedOrders() {
  const statuses = ['pending', 'allocated', 'picking', 'packing', 'ready', 'dispatched'];
  const priorities = ['urgent', 'high', 'normal', 'low'];
  const orders = [];

  // Classic shortage scenario
  orders.push({
    id: 'ORD-DEMO-001',
    customer: 'Apex Retail',
    priority: 'urgent',
    status: 'pending',
    items: [
      { sku: 'SKU-1001', name: 'Wireless Earbuds Pro', qty: 10, allocated: 0 },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    slaHours: 4,
    notes: 'VIP customer – same-day dispatch required',
    priorityScore: 95,
  });

  // Competing lower priority
  orders.push({
    id: 'ORD-DEMO-002',
    customer: 'UrbanGadgets',
    priority: 'normal',
    status: 'pending',
    items: [
      { sku: 'SKU-1001', name: 'Wireless Earbuds Pro', qty: 5, allocated: 0 },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    slaHours: 24,
    notes: '',
    priorityScore: 40,
  });

  for (let i = 0; i < 18; i++) {
    const itemCount = randomInt(1, 4);
    const items = [];
    const used = new Set();
    for (let j = 0; j < itemCount; j++) {
      let p;
      do { p = pick(PRODUCTS); } while (used.has(p.sku));
      used.add(p.sku);
      items.push({
        sku: p.sku,
        name: p.name,
        qty: randomInt(1, 8),
        allocated: 0,
      });
    }
    const priority = pick(priorities);
    const status = pick(statuses.slice(0, 5)); // not all dispatched
    const created = new Date(Date.now() - randomInt(10, 360) * 60 * 1000);
    orders.push({
      id: `ORD-${1000 + i}`,
      customer: pick(CUSTOMERS),
      priority,
      status,
      items,
      createdAt: created.toISOString(),
      slaHours: priority === 'urgent' ? 4 : priority === 'high' ? 8 : 24,
      notes: '',
      priorityScore: 0,
    });
  }
  return orders;
}

function seedActivity() {
  return [
    { time: new Date(Date.now() - 60000).toISOString(), type: 'info', text: 'System initialized – SmartWare engine online' },
    { time: new Date(Date.now() - 120000).toISOString(), type: 'warning', text: 'Low stock detected: SKU-1001 (7 units)' },
    { time: new Date(Date.now() - 180000).toISOString(), type: 'success', text: 'Order ORD-1005 dispatched successfully' },
  ];
}

// Global state
window.STATE = {
  inventory: seedInventory(),
  orders: seedOrders(),
  activity: seedActivity(),
  exceptions: [],
  pickWaves: [],
  charts: {},
};
