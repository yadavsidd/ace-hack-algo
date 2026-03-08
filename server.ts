import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import algosdk from "algosdk";

const app = express();
const PORT = 3000;
const dbPath = process.env.VERCEL ? "/tmp/campus_marketplace.db" : "campus_marketplace.db";
const db = new Database(dbPath);

// Algorand Client for Verification
const ALGOD_SERVER = "https://testnet-api.algonode.cloud";
const ALGOD_PORT = "";
const ALGOD_TOKEN = "";
const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    seller_address TEXT NOT NULL,
    image_url TEXT,
    category TEXT,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    buyer_address TEXT NOT NULL,
    seller_address TEXT NOT NULL,
    amount REAL NOT NULL,
    tx_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    reward REAL NOT NULL,
    deadline DATETIME,
    creator_address TEXT NOT NULL,
    worker_address TEXT,
    status TEXT DEFAULT 'open', -- open, claimed, submitted, completed
    proof_url TEXT,
    tx_id TEXT, -- Escrow deposit tx
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expense_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_participants (
    group_id INTEGER,
    address TEXT NOT NULL,
    FOREIGN KEY(group_id) REFERENCES expense_groups(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    payer_address TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES expense_groups(id)
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    expense_id INTEGER,
    address TEXT NOT NULL,
    share REAL NOT NULL,
    FOREIGN KEY(expense_id) REFERENCES expenses(id)
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount REAL NOT NULL,
    tx_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES expense_groups(id)
  );
`);

app.use(express.json());

// API Routes
app.get("/api/products", (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC").all();
  res.json(products);
});

app.post("/api/products", (req, res) => {
  const { name, description, price, seller_address, image_url, category } = req.body;
  if (!name || price === undefined || !seller_address) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const id = randomUUID();
  try {
    db.prepare("INSERT INTO products (id, name, description, price, seller_address, image_url, category) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, name, description || "", price, seller_address, image_url || "", category || "Electronics");
    res.json({ id, status: "success" });
  } catch (error) {
    console.error("Failed to create product in DB:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

app.get("/api/my-listings/:address", (req, res) => {
  const listings = db.prepare("SELECT * FROM products WHERE seller_address = ? ORDER BY created_at DESC").all(req.params.address);
  res.json(listings);
});

app.get("/api/my-orders/:address", (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, p.name as product_name, p.image_url 
    FROM orders o 
    JOIN products p ON o.product_id = p.id 
    WHERE o.buyer_address = ? OR o.seller_address = ?
    ORDER BY o.created_at DESC
  `).all(req.params.address, req.params.address);
  res.json(orders);
});

app.post("/api/orders", async (req, res) => {
  const { product_id, buyer_address, seller_address, amount, tx_id } = req.body;
  const id = randomUUID();
  
  try {
    // 1. Verify Transaction on Algorand Network
    console.log(`Verifying transaction ${tx_id} on-chain...`);
    const txInfo = await algodClient.pendingTransactionInformation(tx_id).do();
    
    // Basic verification: check if it's a payment, correct sender/receiver, and amount
    const txn = txInfo.txn.txn as any;
    const isPayment = txn.type === "pay";
    const correctSender = algosdk.encodeAddress(txn.from.publicKey) === buyer_address;
    const correctReceiver = algosdk.encodeAddress(txn.to.publicKey) === seller_address;
    const correctAmount = Number(txn.amount) === Math.round(Number(amount) * 1_000_000);

    if (!isPayment || !correctSender || !correctReceiver || !correctAmount) {
      console.error("Transaction verification failed:", { 
        isPayment, 
        correctSender, 
        correctReceiver, 
        correctAmount,
        txAmount: typeof txn.amount === 'bigint' ? txn.amount.toString() : txn.amount
      });
      return res.status(400).json({ error: "On-chain transaction verification failed. Details mismatch." });
    }

    // 2. Commit to Database
    const transaction = db.transaction(() => {
      db.prepare("INSERT INTO orders (id, product_id, buyer_address, seller_address, amount, tx_id, status) VALUES (?, ?, ?, ?, ?, ?, 'paid')")
        .run(id, product_id, buyer_address, seller_address, amount, tx_id);
      db.prepare("UPDATE products SET status = 'sold' WHERE id = ?").run(product_id);
    });
    transaction();
    
    console.log(`Order ${id} successfully processed for transaction ${tx_id}`);
    res.json({ id, status: "success" });
  } catch (error: any) {
    console.error("Failed to process order:", error);
    res.status(500).json({ error: error.message || "Failed to process order" });
  }
});

app.post("/api/orders/:id/confirm", (req, res) => {
  const { id } = req.params;
  const { address } = req.body; // To verify the buyer is the one confirming
  
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.buyer_address !== address) return res.status(403).json({ error: "Only the buyer can confirm receipt" });
    
    db.prepare("UPDATE orders SET status = 'received' WHERE id = ?").run(id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to confirm order" });
  }
});

// Campus Gigs API
app.get("/api/tasks", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks WHERE status = 'open' ORDER BY created_at DESC").all();
  res.json(tasks);
});

app.post("/api/tasks", async (req, res) => {
  const { title, description, reward, deadline, creator_address } = req.body;
  const id = randomUUID();
  
  try {
    // Save to DB without escrow verification
    db.prepare("INSERT INTO tasks (id, title, description, reward, deadline, creator_address) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, title, description, reward, deadline, creator_address);
    
    res.json({ id, status: "success" });
  } catch (error: any) {
    console.error("Failed to post gig:", error);
    res.status(500).json({ error: error.message || "Failed to post gig" });
  }
});

app.post("/api/tasks/:id/claim", (req, res) => {
  const { id } = req.params;
  const { worker_address } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.status !== 'open') return res.status(400).json({ error: "Task is no longer available" });
    if (task.creator_address === worker_address) return res.status(400).json({ error: "You cannot claim your own task" });

    db.prepare("UPDATE tasks SET worker_address = ?, status = 'claimed' WHERE id = ?").run(worker_address, id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to claim task" });
  }
});

app.post("/api/tasks/:id/submit", (req, res) => {
  const { id } = req.params;
  const { proof_url, worker_address } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.worker_address !== worker_address) return res.status(403).json({ error: "Only the claimant can submit proof" });

    db.prepare("UPDATE tasks SET proof_url = ?, status = 'submitted' WHERE id = ?").run(proof_url, id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit proof" });
  }
});

app.post("/api/tasks/:id/approve", async (req, res) => {
  const { id } = req.params;
  const { creator_address, tx_id } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.creator_address !== creator_address) return res.status(403).json({ error: "Only the creator can approve" });
    if (!tx_id) return res.status(400).json({ error: "Payment transaction ID is required for approval" });

    // Verify Payment Transaction (Funds sent directly to worker)
    console.log(`Verifying gig payment ${tx_id} on-chain for task ${id}...`);
    const txInfo = await algodClient.pendingTransactionInformation(tx_id).do();
    const info = txInfo as any;
    console.log("Transaction Info:", JSON.stringify(info, (k, v) => typeof v === 'bigint' ? v.toString() : v).substring(0, 200) + "...");
    const signedTxn = info.txn || info.transaction;
    const txn = (signedTxn ? (signedTxn.txn || signedTxn) : info) as any;
    
    const type = txn.type || txn.ty;
    const isPayment = type === "pay" || (type instanceof Uint8Array && new TextDecoder().decode(type) === "pay");
    
    const getAddr = (val: any) => {
      if (!val) return "";
      if (typeof val === "string") return val;
      try { return algosdk.encodeAddress(val.publicKey || val); } catch (e) { return ""; }
    };

    const sender = getAddr(txn.snd || txn.from);
    const receiver = getAddr(txn.rcv || txn.to);
    const txAmount = txn.amt || txn.amount || 0;

    const correctSender = sender === creator_address;
    const correctReceiver = receiver === task.worker_address;
    const expectedMicroAlgos = Math.round(Number(task.reward) * 1_000_000);
    const correctAmount = Math.abs(Number(txAmount) - expectedMicroAlgos) < 10;

    if (!isPayment || !correctSender || !correctReceiver || !correctAmount) {
      return res.status(400).json({ error: "Payment transaction verification failed." });
    }

    db.prepare("UPDATE tasks SET status = 'completed', tx_id = ? WHERE id = ?").run(tx_id, id);
    res.json({ status: "success" });
  } catch (error: any) {
    console.error("Failed to approve task:", error);
    res.status(500).json({ error: error.message || "Failed to approve task" });
  }
});

app.get("/api/my-tasks/:address", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks WHERE creator_address = ? OR worker_address = ? ORDER BY created_at DESC").all(req.params.address, req.params.address);
  res.json(tasks);
});

// Split Expenses API
app.get("/api/groups/:address", (req, res) => {
  const { address } = req.params;
  try {
    const groups = db.prepare(`
      SELECT g.* FROM expense_groups g
      JOIN group_participants p ON g.id = p.group_id
      WHERE p.address = ?
      ORDER BY g.created_at DESC
    `).all(address);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

app.post("/api/groups", (req, res) => {
  const { name, participants } = req.body;
  try {
    const createGroup = db.transaction(() => {
      const result = db.prepare("INSERT INTO expense_groups (name) VALUES (?)").run(name);
      const groupId = result.lastInsertRowid;
      const insertParticipant = db.prepare("INSERT INTO group_participants (group_id, address) VALUES (?, ?)");
      for (const address of participants) {
        insertParticipant.run(groupId, address);
      }
      return { id: groupId, name, created_at: new Date().toISOString() };
    });
    const newGroup = createGroup();
    res.json(newGroup);
  } catch (error) {
    console.error("Failed to create group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
});

app.get("/api/groups/:id/details", (req, res) => {
  const { id } = req.params;
  try {
    const group = db.prepare("SELECT * FROM expense_groups WHERE id = ?").get(id);
    if (!group) return res.status(404).json({ error: "Group not found" });
    
    const participants = db.prepare("SELECT address FROM group_participants WHERE group_id = ?").all(id);
    const expenses = db.prepare("SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC").all(id);
    const settlements = db.prepare("SELECT * FROM settlements WHERE group_id = ? ORDER BY created_at DESC").all(id);
    
    for (const expense of expenses as any[]) {
      expense.splits = db.prepare("SELECT address, share FROM expense_splits WHERE expense_id = ?").all(expense.id);
    }
    
    res.json({ group, participants, expenses, settlements });
  } catch (error) {
    console.error("Failed to fetch group details:", error);
    res.status(500).json({ error: "Failed to fetch group details" });
  }
});

app.post("/api/expenses", (req, res) => {
  const { groupId, description, amount, payerAddress, splits } = req.body;
  try {
    const addExpense = db.transaction(() => {
      const result = db.prepare("INSERT INTO expenses (group_id, description, amount, payer_address) VALUES (?, ?, ?, ?)")
        .run(groupId, description, amount, payerAddress);
      const expenseId = result.lastInsertRowid;
      const insertSplit = db.prepare("INSERT INTO expense_splits (expense_id, address, share) VALUES (?, ?, ?)");
      for (const split of splits) {
        insertSplit.run(expenseId, split.address, split.share);
      }
    });
    addExpense();
    res.json({ status: "success" });
  } catch (error) {
    console.error("Failed to add expense:", error);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

app.post("/api/settlements", (req, res) => {
  const { groupId, fromAddress, toAddress, amount, txId } = req.body;
  try {
    db.prepare("INSERT INTO settlements (group_id, from_address, to_address, amount, tx_id) VALUES (?, ?, ?, ?, ?)")
      .run(groupId, fromAddress, toAddress, amount, txId);
    res.json({ status: "success" });
  } catch (error) {
    console.error("Failed to record settlement:", error);
    res.status(500).json({ error: "Failed to record settlement" });
  }
});

app.get("/api/history/:address", async (req, res) => {
  const { address } = req.params;
  const INDEXER_SERVER = "https://testnet-idx.algonode.cloud";
  try {
    const response = await fetch(`${INDEXER_SERVER}/v2/accounts/${address}/transactions?limit=10`);
    if (!response.ok) return res.json({ transactions: [] });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error proxying history:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
