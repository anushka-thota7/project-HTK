# SmartWare – Intelligent Warehouse Operations Platform

Decision-driven warehouse management system for the Smart Warehouse Operations & Order Fulfillment Hackathon.

## 🖥️ How to run in VS Code (Recommended)

1. **Open the folder in VS Code**
   - File → Open Folder → select the `warehouse-app` folder

2. **Open Terminal** in VS Code  
   (`Ctrl + `` ` or Terminal → New Terminal)

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. Browser automatically opens at `http://localhost:5173`  
   (If not, click the link shown in the terminal)

### Alternative (without Vite)
Just open `index.html` directly in any browser – also works, but `npm run dev` gives live reload and is better for development.

## 🎯 Features

- Live Dashboard with KPIs, charts & activity feed
- **Smart Decision Engine** (the competitive twist)
  - Urgent order needs 10 units, only 7 available
  - System recommends: Reallocate / Partial ship / Wait / Split
- Priority scoring (SLA + urgency + value + age)
- Inventory allocation & low-stock alerts
- Picking waves + Packing station
- Exception handling & resolution
- Analytics + bottleneck detection + reorder recommendations
- Beautiful dark UI with animations & glassmorphism

## 📁 Project Structure

```
warehouse-app/
├── index.html          ← Main app
├── css/
│   └── styles.css
├── js/
│   ├── data.js         ← Mock products & orders
│   ├── engine.js       ← Decision / allocation logic
│   └── app.js          ← UI & interactions
├── package.json
├── vite.config.js
└── README.md
```

## 🧪 Demo Flow for Judges

1. Dashboard loads → Decision banner appears for `ORD-DEMO-001`
2. Click **“Reallocate from lower priority”** or other options
3. Go to **Orders** tab → Process / Advance orders
4. **Picking** tab → Click +1 to pick items → Pack → Dispatch
5. Check **Inventory**, **Exceptions**, **Analytics**

Built for Hackathon • Pure frontend + Vite for excellent VS Code experience
