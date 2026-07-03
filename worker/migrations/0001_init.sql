CREATE TABLE IF NOT EXISTS custom_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'rejected')),
  auto_validated INTEGER NOT NULL DEFAULT 0,
  validation_notes TEXT,
  submitted_at TEXT NOT NULL,
  validated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status);
