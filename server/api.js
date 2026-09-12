// HTTP API for accounts and saved state. Framework-free so the same handler
// can be mounted as Vite dev-server middleware (vite.config.js) and served by
// the standalone server (server/index.js).
//
//   GET  /api/accounts          -> [{ name, pokemonCount, lastSeen, createdAt }]
//   POST /api/login   { name }  -> { name, created, state, revision }   (creates the account if new)
//   POST /api/state   { name, changes: { key: string | null } }  -> { ok, saved, revisionBefore, revision }
//   GET  /api/state?name=X&since=N  -> { revision, changed: false } when nothing was written
//                                     after revision N, else { revision, changed: true, state }
//   POST /api/reset   { name }  -> { ok }
//
// Values are opaque strings; a null in `changes` removes the key. `revision`
// grows by one per write batch, so a device that is already playing can poll
// GET /api/state cheaply and pick up what the admin panel (or another device)
// changed in the meantime.

import fs from 'node:fs';
import path from 'node:path';
import { normalizeName, MAX_KEY_LENGTH, defaultDatabasePath } from './db.js';

const MAX_BODY_BYTES = 5 * 1024 * 1024;

// Client diagnostics (src/remoteLog.js): the last few hundred events are kept
// in memory and, when a file is configured, appended as JSON lines.
//   POST /api/log  { name, ua, events: [{ t, source, event, data }] } -> { ok, stored }
//   GET  /api/log?n=100                                               -> [entries, newest last]
const LOG_RING_SIZE = 500;
const MAX_LOG_EVENTS_PER_POST = 100;
const MAX_LOG_LINE = 4000;

export function defaultClientLogPath() {
    if (process.env.POKEMON_CLIENT_LOG) return process.env.POKEMON_CLIENT_LOG;
    return path.join(path.dirname(defaultDatabasePath()), 'logs', 'client.log');
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new HttpError(413, 'Request body too large'));
                req.destroy();
                return;
            }
            body += chunk.toString();
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

async function readJson(req) {
    const body = await readBody(req);
    if (!body) return {};
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new HttpError(400, 'Expected a JSON object');
        }
        return parsed;
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, 'Invalid JSON');
    }
}

function send(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
}

function requireName(body) {
    const name = normalizeName(body.name);
    if (!name) throw new HttpError(400, 'A name is required');
    return name;
}

// Validate a { key: string | null } map from the client.
function requireChanges(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new HttpError(400, 'Expected an object of key/value pairs');
    }
    const changes = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!key || key.length > MAX_KEY_LENGTH) throw new HttpError(400, `Invalid key '${key}'`);
        if (value === null) {
            changes[key] = null;
        } else if (typeof value === 'string') {
            changes[key] = value;
        } else {
            throw new HttpError(400, `Value for '${key}' must be a string`);
        }
    }
    return changes;
}

// Vite strips the mount prefix ('/api') from req.url; the standalone server
// does not. Accept both.
function routeOf(req) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname.replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
    return { pathname, url };
}

// `clientLog`: file to append client diagnostics to (null: memory only).
export function createApiHandler(db, { clientLog = defaultClientLogPath() } = {}) {
    const ring = [];
    let logDirReady = false;

    function storeEvents(body) {
        const events = Array.isArray(body.events) ? body.events.slice(0, MAX_LOG_EVENTS_PER_POST) : [];
        const name = typeof body.name === 'string' ? body.name.slice(0, 40) : null;
        const ua = typeof body.ua === 'string' ? body.ua.slice(0, 300) : undefined;
        const received = new Date().toISOString();
        const lines = [];
        for (const event of events) {
            if (!event || typeof event !== 'object') continue;
            const entry = {
                received, name, ua,
                t: Number.isFinite(event.t) ? new Date(event.t).toISOString() : null,
                source: String(event.source || '').slice(0, 60),
                event: String(event.event || '').slice(0, 60),
                data: event.data === undefined ? null : event.data
            };
            let line = JSON.stringify(entry);
            if (line.length > MAX_LOG_LINE) {
                entry.data = String(JSON.stringify(entry.data)).slice(0, MAX_LOG_LINE / 2) + '…';
                line = JSON.stringify(entry);
            }
            ring.push(entry);
            if (ring.length > LOG_RING_SIZE) ring.shift();
            lines.push(line);
        }
        if (clientLog && lines.length > 0) {
            try {
                if (!logDirReady) {
                    fs.mkdirSync(path.dirname(clientLog), { recursive: true });
                    logDirReady = true;
                }
                fs.appendFileSync(clientLog, lines.join('\n') + '\n');
            } catch (error) {
                console.warn('api: could not write client log', error);
            }
        }
        return lines.length;
    }

    async function handle(req, res, next) {
        const { pathname, url } = routeOf(req);
        const method = req.method || 'GET';

        if (method === 'GET' && pathname === '/accounts') {
            return send(res, 200, db.listAccounts());
        }
        if (method === 'POST' && pathname === '/log') {
            const body = await readJson(req);
            return send(res, 200, { ok: true, stored: storeEvents(body) });
        }
        if (method === 'GET' && pathname === '/log') {
            const n = Math.min(LOG_RING_SIZE, Math.max(1, parseInt(url.searchParams.get('n'), 10) || 100));
            return send(res, 200, ring.slice(-n));
        }
        if (method === 'POST' && pathname === '/login') {
            const body = await readJson(req);
            const name = requireName(body);
            const { account, created } = db.getOrCreateAccount(name);
            return send(res, 200, {
                name: account.name, created, state: db.getState(account.id), revision: db.getRevision(account.id)
            });
        }
        if (method === 'GET' && pathname === '/state') {
            const name = requireName({ name: url.searchParams.get('name') });
            const account = db.findAccount(name);
            if (!account) throw new HttpError(404, `No account named '${name}'`);
            const since = parseInt(url.searchParams.get('since'), 10);
            const revision = db.getRevision(account.id);
            if (Number.isFinite(since) && since >= revision) return send(res, 200, { revision, changed: false });
            return send(res, 200, { revision, changed: true, state: db.getState(account.id) });
        }
        if (method === 'POST' && pathname === '/state') {
            const body = await readJson(req);
            const name = requireName(body);
            const changes = requireChanges(body.changes);
            const account = db.findAccount(name);
            if (!account) throw new HttpError(404, `No account named '${name}'`);
            const result = db.applyChanges(account.id, changes);
            return send(res, 200, { ok: true, ...result });
        }
        if (method === 'POST' && pathname === '/reset') {
            const body = await readJson(req);
            const name = requireName(body);
            const account = db.findAccount(name);
            if (account) db.clearState(account.id);
            return send(res, 200, { ok: true });
        }
        return next();
    }

    return (req, res, next) => {
        handle(req, res, next).catch(error => {
            const status = error instanceof HttpError ? error.status : 500;
            if (status === 500) console.error('api:', error);
            send(res, status, { error: error.message || 'Server error' });
        });
    };
}
