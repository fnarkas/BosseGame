// SQLite persistence for player accounts.
//
// One row per account, one row per (account, key) for its saved state. The
// values are the same strings the game used to keep in localStorage, so the
// whole game state round-trips without the server knowing anything about
// coins, streaks or caught Pokemon. Uses Node's built-in sqlite (Node >= 22.5)
// so there is no native module to build.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_NAME_LENGTH = 40;
export const MAX_KEY_LENGTH = 100;

// Trim, collapse inner whitespace, and reject anything unusable. Returns null
// for an invalid name.
export function normalizeName(name) {
    if (typeof name !== 'string') return null;
    const clean = name.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > MAX_NAME_LENGTH) return null;
    return clean;
}

export function defaultDatabasePath() {
    return process.env.POKEMON_DB_PATH || path.resolve(process.cwd(), 'data/game.db');
}

export function openDatabase(file = defaultDatabasePath()) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TEXT NOT NULL,
            last_seen TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS state (
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (account_id, key)
        );
    `);
    // `revision` counts every write batch to an account, so a device can ask
    // "anything new since N?" cheaply (see GET /api/state). Added after the
    // first release; existing databases get the column on open.
    const columns = db.prepare('PRAGMA table_info(accounts)').all().map(row => row.name);
    if (!columns.includes('revision')) {
        db.exec('ALTER TABLE accounts ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
    }
    return new GameDatabase(db);
}

function now() {
    return new Date().toISOString();
}

export class GameDatabase {
    constructor(db) {
        this.db = db;
        this.stmts = {
            list: db.prepare('SELECT id, name, created_at, last_seen, revision FROM accounts ORDER BY last_seen DESC, name COLLATE NOCASE'),
            find: db.prepare('SELECT id, name, created_at, last_seen, revision FROM accounts WHERE name = ? COLLATE NOCASE'),
            insert: db.prepare('INSERT INTO accounts (name, created_at, last_seen, revision) VALUES (?, ?, ?, 0)'),
            touch: db.prepare('UPDATE accounts SET last_seen = ? WHERE id = ?'),
            bump: db.prepare('UPDATE accounts SET last_seen = ?, revision = revision + 1 WHERE id = ?'),
            revision: db.prepare('SELECT revision FROM accounts WHERE id = ?'),
            state: db.prepare('SELECT key, value FROM state WHERE account_id = ?'),
            one: db.prepare('SELECT value FROM state WHERE account_id = ? AND key = ?'),
            upsert: db.prepare(`INSERT INTO state (account_id, key, value, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(account_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
            delete: db.prepare('DELETE FROM state WHERE account_id = ? AND key = ?'),
            clear: db.prepare('DELETE FROM state WHERE account_id = ?')
        };
    }

    // Every account, most recently played first, with the size of its Pokedex
    // so the login screen can show something a child recognises.
    listAccounts() {
        return this.stmts.list.all().map(row => ({
            name: row.name,
            createdAt: row.created_at,
            lastSeen: row.last_seen,
            pokemonCount: this.countCaught(row.id)
        }));
    }

    countCaught(accountId) {
        const row = this.stmts.one.get(accountId, 'pokemonCaughtList');
        if (!row) return 0;
        try {
            const list = JSON.parse(row.value);
            return Array.isArray(list) ? list.length : 0;
        } catch (error) {
            return 0;
        }
    }

    findAccount(name) {
        const clean = normalizeName(name);
        if (!clean) return null;
        return this.stmts.find.get(clean) || null;
    }

    // Log in by name: an unknown name becomes a fresh account. Returns the
    // account row plus whether it was just created.
    getOrCreateAccount(name) {
        const clean = normalizeName(name);
        if (!clean) throw new Error('Invalid account name');
        const existing = this.stmts.find.get(clean);
        const stamp = now();
        if (existing) {
            this.stmts.touch.run(stamp, existing.id);
            return { account: { ...existing, last_seen: stamp }, created: false };
        }
        const result = this.stmts.insert.run(clean, stamp, stamp);
        const id = Number(result.lastInsertRowid);
        return { account: { id, name: clean, created_at: stamp, last_seen: stamp }, created: true };
    }

    getState(accountId) {
        const state = {};
        for (const row of this.stmts.state.all(accountId)) state[row.key] = row.value;
        return state;
    }

    // How many write batches the account has received. Grows by one per
    // applyChanges() / clearState(), never shrinks.
    getRevision(accountId) {
        const row = this.stmts.revision.get(accountId);
        return row ? Number(row.revision) : 0;
    }

    // Apply a batch of writes in one transaction. A null value deletes the
    // key; anything else must be a string. Returns the number of keys touched
    // and the account revision before and after the batch.
    applyChanges(accountId, changes) {
        const entries = Object.entries(changes || {});
        const stamp = now();
        this.db.exec('BEGIN');
        try {
            const revisionBefore = this.getRevision(accountId);
            for (const [key, value] of entries) {
                if (value === null) this.stmts.delete.run(accountId, key);
                else this.stmts.upsert.run(accountId, key, String(value), stamp);
            }
            this.stmts.bump.run(stamp, accountId);
            this.db.exec('COMMIT');
            return { saved: entries.length, revisionBefore, revision: revisionBefore + 1 };
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    clearState(accountId) {
        this.stmts.clear.run(accountId);
        this.stmts.bump.run(now(), accountId);
    }

    close() {
        this.db.close();
    }
}
