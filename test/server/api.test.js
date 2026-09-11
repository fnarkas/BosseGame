import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { openDatabase, normalizeName } from '../../server/db.js';
import { createApiHandler } from '../../server/api.js';

// Drive the framework-free handler with a readable request and a response
// stub that records what was written.
function request(handler, method, url, body) {
    return new Promise(resolve => {
        const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
        req.method = method;
        req.url = url;
        const res = {
            statusCode: null,
            headers: null,
            body: '',
            writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
            end(chunk) {
                if (chunk) this.body += chunk;
                resolve({ status: this.statusCode, json: this.body ? JSON.parse(this.body) : null, nextCalled: false });
            }
        };
        handler(req, res, () => resolve({ status: null, json: null, nextCalled: true }));
    });
}

describe('server/db', () => {
    let db;
    beforeEach(() => { db = openDatabase(':memory:'); });
    afterEach(() => db.close());

    it('normalises names and rejects empty or oversized ones', () => {
        expect(normalizeName('  Olle   Landin ')).toBe('Olle Landin');
        expect(normalizeName('')).toBeNull();
        expect(normalizeName('   ')).toBeNull();
        expect(normalizeName(42)).toBeNull();
        expect(normalizeName('x'.repeat(41))).toBeNull();
    });

    it('creates an account on first login and reuses it afterwards, case-insensitively', () => {
        const first = db.getOrCreateAccount('Olle');
        expect(first.created).toBe(true);
        const again = db.getOrCreateAccount('olle');
        expect(again.created).toBe(false);
        expect(again.account.id).toBe(first.account.id);
        expect(again.account.name).toBe('Olle');
        expect(db.listAccounts().map(a => a.name)).toEqual(['Olle']);
    });

    it('stores, overwrites and deletes keys atomically', () => {
        const { account } = db.getOrCreateAccount('Olle');
        expect(db.applyChanges(account.id, { coinCount: '5', streak: '2' })).toBe(2);
        db.applyChanges(account.id, { coinCount: '7', streak: null });
        expect(db.getState(account.id)).toEqual({ coinCount: '7' });
        db.clearState(account.id);
        expect(db.getState(account.id)).toEqual({});
    });

    it('keeps each account separate and counts caught Pokemon per account', () => {
        const a = db.getOrCreateAccount('A').account;
        const b = db.getOrCreateAccount('B').account;
        db.applyChanges(a.id, { pokemonCaughtList: JSON.stringify([{ id: 1 }, { id: 4 }]) });
        db.applyChanges(b.id, { pokemonCaughtList: 'not json' });
        expect(db.getState(b.id).pokemonCaughtList).toBe('not json');
        const counts = Object.fromEntries(db.listAccounts().map(x => [x.name, x.pokemonCount]));
        expect(counts).toEqual({ A: 2, B: 0 });
    });
});

describe('server/api', () => {
    let db, handler;
    beforeEach(() => {
        db = openDatabase(':memory:');
        handler = createApiHandler(db);
    });
    afterEach(() => db.close());

    it('logs in, creating the account the first time, and returns its state', async () => {
        const first = await request(handler, 'POST', '/api/login', { name: ' Olle ' });
        expect(first.status).toBe(200);
        expect(first.json).toEqual({ name: 'Olle', created: true, state: {} });

        const saved = await request(handler, 'POST', '/api/state', { name: 'Olle', changes: { coinCount: '3' } });
        expect(saved.json).toEqual({ ok: true, saved: 1 });

        const second = await request(handler, 'POST', '/login', { name: 'olle' });
        expect(second.json).toEqual({ name: 'Olle', created: false, state: { coinCount: '3' } });
    });

    it('lists accounts, most recent first', async () => {
        await request(handler, 'POST', '/api/login', { name: 'Anna' });
        await request(handler, 'POST', '/api/login', { name: 'Bo' });
        const list = await request(handler, 'GET', '/api/accounts');
        expect(list.status).toBe(200);
        expect(list.json.map(a => a.name)).toContain('Anna');
        expect(list.json.map(a => a.name)).toContain('Bo');
        expect(list.json[0]).toMatchObject({ pokemonCount: 0 });
    });

    it('counts caught Pokemon per account in the list', async () => {
        await request(handler, 'POST', '/api/login', { name: 'Olle' });
        await request(handler, 'POST', '/api/state', { name: 'Olle', changes: { pokemonCaughtList: JSON.stringify([{ id: 25 }]) } });
        const list = await request(handler, 'GET', '/api/accounts');
        expect(list.json).toEqual([expect.objectContaining({ name: 'Olle', pokemonCount: 1 })]);
    });

    it('resets an account', async () => {
        await request(handler, 'POST', '/api/login', { name: 'Olle' });
        await request(handler, 'POST', '/api/state', { name: 'Olle', changes: { coinCount: '1' } });
        expect((await request(handler, 'POST', '/api/reset', { name: 'Olle' })).json).toEqual({ ok: true });
        const login = await request(handler, 'POST', '/api/login', { name: 'Olle' });
        expect(login.json.state).toEqual({});
        // Unknown accounts are a no-op, not an error.
        expect((await request(handler, 'POST', '/api/reset', { name: 'Nobody' })).status).toBe(200);
    });

    it('rejects bad input with 400 and unknown accounts with 404', async () => {
        expect((await request(handler, 'POST', '/api/login', { name: '' })).status).toBe(400);
        expect((await request(handler, 'POST', '/api/login', '{oops')).status).toBe(400);
        expect((await request(handler, 'POST', '/api/state', { name: 'Ghost', changes: { a: 'b' } })).status).toBe(404);
        await request(handler, 'POST', '/api/login', { name: 'Olle' });
        expect((await request(handler, 'POST', '/api/state', { name: 'Olle', changes: { a: 5 } })).status).toBe(400);
        expect((await request(handler, 'POST', '/api/state', { name: 'Olle', changes: [] })).status).toBe(400);
        expect((await request(handler, 'POST', '/api/import', { name: 'Olle', data: { a: 'b' } })).nextCalled).toBe(true);
    });

    it('passes unknown routes on to the next middleware', async () => {
        expect((await request(handler, 'GET', '/api/nope')).nextCalled).toBe(true);
        expect((await request(handler, 'POST', '/api/config/save', {})).nextCalled).toBe(true);
    });
});
