import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';

// Use file-based SQLite for MVP (swap to PostgreSQL later via drizzle-orm/pg-core)
const sqlite = new Database(process.env.DATABASE_URL ?? './leadgen.db');

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Run migrations on startup for MVP
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    business_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    website_url TEXT,
    address TEXT,
    city TEXT,
    country TEXT,
    category TEXT,
    rating REAL,
    review_count INTEGER DEFAULT 0,
    hot_score REAL DEFAULT 0,
    readiness_flags TEXT DEFAULT '[]',
    status TEXT DEFAULT 'new',
    source TEXT DEFAULT 'manual',
    notes TEXT,
    tags TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_contacted TEXT
  );

  CREATE TABLE IF NOT EXISTS lead_activities (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sequences (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sequence_steps (
    id TEXT PRIMARY KEY,
    sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    delay_days INTEGER DEFAULT 0,
    step_order INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_hot_score ON leads(hot_score DESC);
  CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
  CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence_id ON sequence_steps(sequence_id);
`);

export type Database = typeof db;
