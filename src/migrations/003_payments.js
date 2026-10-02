// Phase 2: Paymob references, failure reasons, refunds and idempotent webhooks.
export default {
  version: 3,
  name: 'payments',
  up: db => db.exec(`
    ALTER TABLE orders ADD COLUMN provider_order_id TEXT;
    ALTER TABLE orders ADD COLUMN provider_txn_id TEXT;
    ALTER TABLE orders ADD COLUMN failure_reason TEXT;
    ALTER TABLE orders ADD COLUMN refunded_at TEXT;
    ALTER TABLE orders ADD COLUMN updated_at TEXT;
    UPDATE orders SET updated_at = created_at WHERE updated_at IS NULL;
    CREATE INDEX orders_provider_order ON orders(provider, provider_order_id);
    CREATE TABLE payment_events (
      id INTEGER PRIMARY KEY,
      provider TEXT NOT NULL,
      event_key TEXT NOT NULL,
      order_id INTEGER REFERENCES orders(id),
      outcome TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (provider, event_key)
    );
  `),
};
