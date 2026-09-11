// Mounts the account API on the Vite dev server so `npm run dev` is all that
// is needed in-house. The database lives in data/game.db (gitignored) unless
// POKEMON_DB_PATH says otherwise.

import { openDatabase, defaultDatabasePath } from './db.js';
import { createApiHandler } from './api.js';

export function gameApiPlugin(options = {}) {
    return {
        name: 'game-api',
        configureServer(server) {
            const file = options.file || defaultDatabasePath();
            const db = openDatabase(file);
            console.log(`[game-api] account database: ${file}`);
            server.middlewares.use('/api', createApiHandler(db));
            server.httpServer?.once('close', () => db.close());
        }
    };
}
