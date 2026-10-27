CREATE TABLE IF NOT EXISTS devices (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL UNIQUE,
 reply_to TEXT NOT NULL DEFAULT '',
 enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS deliveries (
 device_id TEXT NOT NULL REFERENCES devices(id),
 job_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 status TEXT NOT NULL,
 provider_id TEXT,
 created_at INTEGER NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (device_id,job_id)
);
CREATE INDEX IF NOT EXISTS delivery_quota ON deliveries(device_id,created_at);
