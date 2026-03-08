import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("campus_marketplace.db");

try {
  const id = randomUUID();
  db.prepare("INSERT INTO products (id, name, description, price, seller_address, image_url, category) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, "Test Product", "Test Desc", 10.5, "SELLER_ADDRESS", "http://example.com/img.png", "Electronics");
  console.log("Success");
} catch (e) {
  console.error("Error:", e);
}
