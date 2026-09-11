// Standalone server for a production build: serves dist/ and the account API.
//
//   npm run build && npm run serve
//
// Environment:
//   PORT              default 8080 (443 when a certificate is given)
//   POKEMON_DB_PATH   default data/game.db
//   SSL_CERT/SSL_KEY  PEM files; when both exist the server speaks HTTPS, which
//                     browsers require for the microphone (speech games). A
//                     self-signed certificate is fine in-house: accept the
//                     warning once per device. deploy/install.sh makes one, and
//                     puts Tailscale Serve (trusted certificate) in front of it
//                     for devices on the tailnet.
//
// In development this is not needed: vite.config.js mounts the same API on the
// dev server.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, defaultDatabasePath } from './db.js';
import { createApiHandler } from './api.js';

const ROOT = path.resolve(process.cwd(), 'dist');
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error('dist/index.html not found. Run `npm run build` first.');
    process.exit(1);
}

function tlsOptions() {
    const cert = process.env.SSL_CERT;
    const key = process.env.SSL_KEY;
    if (!cert || !key) return null;
    if (!fs.existsSync(cert) || !fs.existsSync(key)) {
        console.warn(`SSL_CERT/SSL_KEY not found (${cert}, ${key}); serving plain HTTP`);
        return null;
    }
    return { cert: fs.readFileSync(cert), key: fs.readFileSync(key) };
}

const tls = tlsOptions();
const PORT = Number(process.env.PORT) || (tls ? 443 : 8080);

const db = openDatabase(defaultDatabasePath());
const api = createApiHandler(db);

function serveStatic(req, res) {
    const url = new URL(req.url, 'http://localhost');
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) {
        res.writeHead(403);
        res.end();
        return;
    }
    // Every game route (/games, /addition, ...) is the same single page.
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
}

function handle(req, res) {
    if (req.url.startsWith('/api/') || req.url === '/api') {
        api(req, res, () => { res.writeHead(404); res.end('Not found'); });
    } else {
        serveStatic(req, res);
    }
}

const server = tls ? https.createServer(tls, handle) : http.createServer(handle);

server.listen(PORT, () => {
    const scheme = tls ? 'https' : 'http';
    console.log(`Pokemon game on ${scheme}://localhost:${PORT} (database: ${defaultDatabasePath()})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        server.close();
        db.close();
        process.exit(0);
    });
}
