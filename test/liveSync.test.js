import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    login, flush, pullChanges, onRemoteChange, startLiveSync, stopLiveSync, isLiveSyncRunning, getRevision,
    FLUSH_DELAY_MS, PULL_THROTTLE_MS, LIVE_SYNC_INTERVAL_MS
} from '../src/account.js';
import { applyRemoteState, onStorageChange, getAllValues, setInt, getInt, setJSON, loadState } from '../src/storage.js';
import { addCoins, getCoinCount, COIN_KEY } from '../src/currency.js';
import { addPokeball, getInventory, INVENTORY_KEY } from '../src/inventory.js';
import { loadMinigameConfig, CONFIG_OVERRIDE_KEY } from '../src/minigameConfig.js';
import { getMaxPokemonId, resetPokemonPool } from '../src/pokemonPool.js';
import { bindLiveUpdates } from '../src/liveUpdates.js';
import { CAUGHT_POKEMON_KEY } from '../src/caughtPokemon.js';
import { installFakeScene, flush as flushScene } from './helpers/fakeScene.js';
import { setTestConfig } from './helpers/setup.js';
import { MainGameScene } from '../src/scenes/MainGameScene.js';
import { PokeballGameScene } from '../src/scenes/PokeballGameScene.js';
import { DEFAULT_MODE_WEIGHTS, getEnabledSlices, loadModeWeights } from '../src/minigameWheel.js';
import { refreshWheel, WHEEL_TEXTURE } from '../src/wheelTexture.js';

// A fake server with a revision counter, answering like server/api.js.
function fakeServer(initial = { coinCount: '5' }) {
    const server = { state: { ...initial }, revision: 3, calls: [] };
    // The admin (another device) writes straight into the server.
    server.adminWrite = (changes) => {
        for (const [k, v] of Object.entries(changes)) {
            if (v === null) delete server.state[k]; else server.state[k] = v;
        }
        server.revision += 1;
    };
    globalThis.fetch = vi.fn(async (url, options = {}) => {
        const str = String(url);
        const body = options.body ? JSON.parse(options.body) : {};
        server.calls.push({ url: str, body });
        const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
        if (str === '/api/login') return reply(200, { name: body.name, created: false, state: server.state, revision: server.revision });
        if (str.startsWith('/api/state?')) {
            const since = parseInt(new URL(str, 'http://x').searchParams.get('since'), 10);
            if (since >= server.revision) return reply(200, { revision: server.revision, changed: false });
            return reply(200, { revision: server.revision, changed: true, state: { ...server.state } });
        }
        if (str === '/api/state') {
            const revisionBefore = server.revision;
            server.adminWrite(body.changes);
            return reply(200, { ok: true, saved: Object.keys(body.changes).length, revisionBefore, revision: server.revision });
        }
        if (str.startsWith('/config/')) return reply(404, {});
        return reply(404, { error: 'nope' });
    });
    return server;
}

describe('storage.applyRemoteState', () => {
    it('writes what differs, removes what is gone, skips unsent keys, and flags the change as remote', () => {
        loadState({ a: '1', b: '2', c: '3', d: '4' });
        const seen = [];
        onStorageChange((key, value, meta) => seen.push([key, value, meta]));
        const changed = applyRemoteState({ a: '1', b: '20', c: '30', e: '5' }, new Set(['c', 'd']));
        expect(changed.sort()).toEqual(['b', 'e']);
        expect(getAllValues()).toEqual({ a: '1', b: '20', c: '3', d: '4', e: '5' });
        expect(seen).toEqual([['b', '20', { remote: true }], ['e', '5', { remote: true }]]);
        expect(applyRemoteState({ a: '1', b: '20', c: '3', e: '5' })).toEqual(['d']);
        expect(getAllValues()).toEqual({ a: '1', b: '20', c: '3', e: '5' });
    });
});

describe('account live sync', () => {
    let originalFetch;
    beforeEach(() => {
        originalFetch = globalThis.fetch;
        vi.useFakeTimers();
        resetPokemonPool();
    });
    afterEach(() => {
        stopLiveSync();
        vi.useRealTimers();
        globalThis.fetch = originalFetch;
    });

    it('does nothing when not logged in', async () => {
        fakeServer();
        expect(await pullChanges({ force: true })).toEqual([]);
    });

    it('applies what another device wrote, without echoing it back to the server', async () => {
        const server = fakeServer();
        await login('Olle');
        expect(getRevision()).toBe(3);
        const seen = [];
        onRemoteChange(keys => seen.push(keys));

        expect(await pullChanges({ force: true })).toEqual([]);
        server.adminWrite({ coinCount: '50', streak: '2' });
        expect(await pullChanges({ force: true })).toEqual(['coinCount', 'streak']);
        expect(getCoinCount()).toBe(50);
        expect(getInt('streak')).toBe(2);
        expect(getRevision()).toBe(4);
        expect(seen).toEqual([['coinCount', 'streak']]);

        await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
        expect(server.calls.filter(c => c.url === '/api/state')).toHaveLength(0);
    });

    it('keeps this device\'s unsent changes over the server copy, then sends them on top', async () => {
        const server = fakeServer();
        await login('Olle');
        addCoins(10); // 15, queued
        server.adminWrite({ coinCount: '99', streak: '7' });
        expect(await pullChanges({ force: true })).toEqual(['streak']);
        expect(getCoinCount()).toBe(15);
        await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 1);
        expect(server.state.coinCount).toBe('15');
        expect(server.state.streak).toBe('7');
    });

    it('drops keys the server no longer has', async () => {
        const server = fakeServer({ coinCount: '5', streak: '4' });
        await login('Olle');
        server.adminWrite({ streak: null });
        expect(await pullChanges({ force: true })).toEqual(['streak']);
        expect(getInt('streak', -1)).toBe(-1);
    });

    it('re-reads the minigame config and the Pokemon pool after a remote config change', async () => {
        const server = fakeServer();
        await login('Olle');
        bindLiveUpdates({ registry: { set() {}, get() {} } });
        expect((await loadMinigameConfig()).pokedex).toBeUndefined();
        server.adminWrite({ [CONFIG_OVERRIDE_KEY]: JSON.stringify({ pokedex: { maxPokemonId: 251 } }) });
        expect(await pullChanges({ force: true })).toEqual([CONFIG_OVERRIDE_KEY]);
        expect((await loadMinigameConfig()).pokedex).toEqual({ maxPokemonId: 251 });
        await vi.advanceTimersByTimeAsync(1);
        expect(getMaxPokemonId()).toBe(251);
    });

    it('refreshes the registry copy of the caught list', async () => {
        const server = fakeServer();
        await login('Olle');
        const registry = new Map();
        bindLiveUpdates({ registry: { set: (k, v) => registry.set(k, v), get: (k) => registry.get(k) } });
        server.adminWrite({ [CAUGHT_POKEMON_KEY]: JSON.stringify([{ id: 25, name: 'Pikachu' }]) });
        await pullChanges({ force: true });
        expect(registry.get('caughtPokemon')).toEqual([{ id: 25, name: 'Pikachu' }]);
    });

    it('throttles pulls, and adopts the revision of its own uncontested save', async () => {
        const server = fakeServer();
        await login('Olle');
        await pullChanges({ force: true });
        const before = server.calls.length;
        await pullChanges();
        expect(server.calls.length).toBe(before); // throttled
        await vi.advanceTimersByTimeAsync(PULL_THROTTLE_MS + 1);
        await pullChanges();
        expect(server.calls.length).toBe(before + 1);

        addCoins(1);
        await flush();
        expect(getRevision()).toBe(4); // our own write, nothing in between
        server.adminWrite({ streak: '1' });
        addCoins(1);
        await flush();
        expect(getRevision()).toBe(4); // something happened in between: keep the old revision so the next pull fetches
        expect(await pullChanges({ force: true })).toEqual(['streak']);
        expect(getRevision()).toBe(6);
    });

    it('polls on an interval while running', async () => {
        const server = fakeServer();
        await login('Olle');
        startLiveSync({ intervalMs: 1000 });
        expect(isLiveSyncRunning()).toBe(true);
        await vi.advanceTimersByTimeAsync(1);
        const polls = () => server.calls.filter(c => c.url.startsWith('/api/state?')).length;
        expect(polls()).toBe(1);
        server.adminWrite({ coinCount: '77' });
        await vi.advanceTimersByTimeAsync(PULL_THROTTLE_MS + 1000);
        expect(polls()).toBeGreaterThanOrEqual(2);
        expect(getCoinCount()).toBe(77);
        stopLiveSync();
        expect(isLiveSyncRunning()).toBe(false);
        expect(LIVE_SYNC_INTERVAL_MS).toBeGreaterThan(PULL_THROTTLE_MS);
    });

    it('survives a server that is down', async () => {
        fakeServer();
        await login('Olle');
        globalThis.fetch = vi.fn(async () => { throw new Error('offline'); });
        expect(await pullChanges({ force: true })).toEqual([]);
        expect(getCoinCount()).toBe(5);
    });
});

describe('scenes react to remote changes', () => {
    let originalFetch;
    beforeEach(() => {
        originalFetch = globalThis.fetch;
        window.showPokedex = () => {};
        window.openStore = () => {};
        window.showPokemonCaughtPopup = vi.fn((id, done) => done());
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
        delete window.showPokedex;
        delete window.openStore;
        delete window.showPokemonCaughtPopup;
    });

    it('MainGameScene updates its HUD when coins or pokeballs arrive, and stops listening on shutdown', async () => {
        const server = fakeServer({});
        await login('Olle');
        addPokeball('pokeball');
        await flush();
        const scene = new MainGameScene();
        const fake = installFakeScene(scene, { registry: { answerMode: 'letter', caughtPokemon: [] } });
        scene.create();
        await flushScene();
        expect(scene.inventoryHUD.coinText.text).toBe('0');

        server.adminWrite({ [COIN_KEY]: '42', [INVENTORY_KEY]: JSON.stringify({ pokeball: 9 }) });
        await pullChanges({ force: true });
        expect(scene.inventoryHUD.coinText.text).toBe('42');
        expect(scene.inventoryHUD.pokeballTexts.pokeball.text).toBe('9');
        expect(getInventory().pokeball).toBe(9);

        scene.scene.start('PokeballGameScene');
        server.adminWrite({ [COIN_KEY]: '43' });
        await pullChanges({ force: true });
        expect(scene.inventoryHUD.coinText.text).toBe('42');
    });

    it('MainGameScene draws the Pokemon the admin queued on the next encounter', async () => {
        const server = fakeServer({ pokemonCaughtList: JSON.stringify([{ id: 95 }, { id: 41 }, { id: 86 }]) });
        await login('Olle');
        const scene = new MainGameScene();
        installFakeScene(scene, { registry: { answerMode: 'letter', caughtPokemon: [{ id: 95 }, { id: 41 }, { id: 86 }] } });
        addPokeball('pokeball'); addPokeball('pokeball');
        scene.create();
        await flushScene();
        // The game's own queue write reaches the server first (as it does 300 ms
        // later in real life), then the parent puts Pikachu next in line.
        await flush();
        server.adminWrite({ pokemonSpawnQueue: JSON.stringify([{ id: 25, pinned: true }]) });
        // The next encounter pulls before drawing; the throttle window from the
        // pull at create() may still be open, so pull once explicitly.
        await pullChanges({ force: true });
        scene.startNewEncounter(true);
        await flushScene();
        expect(scene.currentPokemon.id).toBe(25);
    });

    it('PokeballGameScene updates its coin counter on a remote change', async () => {
        const server = fakeServer({});
        await login('Olle');
        const scene = new PokeballGameScene();
        installFakeScene(scene, { registry: { pokeballGameMode: 'addition-only', wheelSlices: getEnabledSlices(DEFAULT_MODE_WEIGHTS) } });
        await scene.create();
        await flushScene();
        expect(scene.coinCounterText.text).toBe('0');
        server.adminWrite({ [COIN_KEY]: '12' });
        await pullChanges({ force: true });
        expect(scene.coinCounterText.text).toBe('12');
        scene.teardown();
        server.adminWrite({ [COIN_KEY]: '13' });
        await pullChanges({ force: true });
        expect(scene.coinCounterText.text).toBe('12');
    });
});

describe('wheel refresh', () => {
    afterEach(() => {
        delete window.showPokedex;
        delete window.openStore;
    });

    it('redraws the wheel only when the enabled slices changed', async () => {
        const scene = new PokeballGameScene();
        const configured = getEnabledSlices(await loadModeWeights());
        const fake = installFakeScene(scene, { registry: { pokeballGameMode: 'addition-only', wheelSlices: configured } });
        fake.textures._generated.add(WHEEL_TEXTURE);
        expect(await refreshWheel(scene)).toBe(false);
        const weights = Object.fromEntries(Object.keys(DEFAULT_MODE_WEIGHTS).map(k => [k, 0]));
        weights.addition = 10;
        weights.multiplication = 10;
        setTestConfig({ weights });
        expect(await refreshWheel(scene)).toBe(true);
        expect(scene.registry.get('wheelSlices').map(s => s.name)).toEqual(['addition', 'multiplication']);
        expect(fake.textures.exists(WHEEL_TEXTURE)).toBe(true);
        expect(await refreshWheel(scene)).toBe(false);
    });

    it('a spin after a probability change uses the new slices', async () => {
        window.showPokedex = () => {};
        window.openStore = () => {};
        const weights = Object.fromEntries(Object.keys(DEFAULT_MODE_WEIGHTS).map(k => [k, 0]));
        weights.numberBonds = 10;
        setTestConfig({ weights });
        const scene = new PokeballGameScene();
        const fake = installFakeScene(scene, { registry: { pokeballGameMode: null, wheelSlices: getEnabledSlices(DEFAULT_MODE_WEIGHTS) } });
        await scene.create();
        await flushScene();
        expect(scene.registry.get('wheelSlices').map(s => s.name)).toEqual(['numberBonds']);
        expect(fake.liveObjectsOfType('Image').find(i => i.textureKey === WHEEL_TEXTURE)).toBeTruthy();
    });
});
