import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("campus_marketplace.db");

const reqBody = {
  name: "Test Name",
  description: "Test Desc",
  price: 10,
  seller_address: "",
  image_url: "http://example.com/img.png",
  category: "Electronics"
};

const id = randomUUID();
try {
  db.prepare("INSERT INTO products (id, name, description, price, seller_address, image_url, category) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, reqBody.name, reqBody.description, reqBody.price, reqBody.seller_address, reqBody.image_url, reqBody.category);
  console.log("Success with empty string!");
} catch (error) {
  console.error("Failed to create product in DB:", error);
}

try {
  const reqBodyUndefined = {
    name: "Test Name",
    description: "Test Desc",
    price: 10,
    seller_address: undefined, // undefined simulates missing property
    image_url: "http://example.com/img.png",
    category: "Electronics"
  };
  db.prepare("INSERT INTO products (id, name, description, price, seller_address, image_url, category) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, reqBodyUndefined.name, reqBodyUndefined.description, reqBodyUndefined.price, reqBodyUndefined.seller_address, reqBodyUndefined.image_url, reqBodyUndefined.category);
  console.log("Success with undefined string!");
} catch (error) {
  console.error("Failed with undefined:", error);
}

