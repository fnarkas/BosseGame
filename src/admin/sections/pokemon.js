// "Pokemon Manager": the caught list as a grid of checkboxes, catch all /
// release all, and the sync URL that carries the list to another device
// (imported from ?sync=<base64 json> when the admin page opens).

import { POKEMON_DATA, getAvailablePokemon, MAX_POKEMON_ID } from '../../pokemonData.js';
import { getCaughtPokemonList, saveCaughtPokemonList, caughtIdSet } from '../../caughtPokemon.js';
import { html, toHtml, MESSAGE_COLORS } from '../html.js';

// Data ------------------------------------------------------------------------

function pokemonName(id) {
    const pokemon = POKEMON_DATA.find(p => p.id === id);
    return pokemon ? pokemon.name : 'Unknown';
}

// Normalise one stored entry (object or legacy plain id) to { id, name, caughtDate }.
export function normalizeCaughtEntry(entry, now = () => new Date().toISOString()) {
    if (typeof entry === 'number') {
        return { id: entry, name: pokemonName(entry), caughtDate: now() };
    }
    if (entry && typeof entry === 'object' && entry.id) return entry;
    return null;
}

// Decode the ?sync= payload into a list of entries; throws on anything but a
// JSON array. Accepts the legacy id-only form.
export function decodeSyncPayload(base64) {
    const imported = JSON.parse(atob(base64));
    if (!Array.isArray(imported)) throw new Error('Invalid data format');
    return imported.map(entry => normalizeCaughtEntry(entry)).filter(Boolean);
}

export function encodeSyncPayload(list) {
    return btoa(JSON.stringify(list));
}

// Existing entries win (they keep their caught dates); imported ones are added
// when their id is new. Returns the merged list and how many were added.
export function mergeCaughtLists(existing, imported) {
    const merged = new Map();
    for (const entry of existing) {
        const normalized = normalizeCaughtEntry(entry);
        if (normalized) merged.set(normalized.id, normalized);
    }
    const before = merged.size;
    for (const entry of imported) {
        const normalized = normalizeCaughtEntry(entry);
        if (normalized && !merged.has(normalized.id)) merged.set(normalized.id, normalized);
    }
    const list = Array.from(merged.values());
    return { list, added: list.length - before };
}

export function countCaughtAvailable(list = getCaughtPokemonList()) {
    let count = 0;
    for (const id of caughtIdSet(list)) {
        if (typeof id === 'number' && id <= MAX_POKEMON_ID) count += 1;
    }
    return count;
}

// Apply a ?sync= parameter from the current URL, if present. Returns a banner
// message ({ text, color }) or null, and strips the parameter from the URL.
export function importSyncFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const payload = params.get('sync');
    if (!payload) return null;

    let message;
    try {
        const imported = decodeSyncPayload(payload);
        const { list, added } = mergeCaughtLists(getCaughtPokemonList(), imported);
        saveCaughtPokemonList(list);
        message = { text: `✓ Imported ${added} new Pokemon! (Total: ${list.length})`, color: MESSAGE_COLORS.ok };
    } catch (error) {
        console.error('Failed to import sync data:', error);
        message = { text: '❌ Failed to import Pokemon data. Invalid sync URL.', color: MESSAGE_COLORS.error };
    }
    const cleanURL = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanURL);
    return message;
}

// Markup ---------------------------------------------------------------------

function renderPokemonCard(pokemon, isCaught) {
    return html`
        <div class="admin-pokemon ${isCaught ? 'caught' : ''}" data-pokemon-card="${pokemon.id}">
            <input type="checkbox" id="pokemon-${pokemon.id}" data-pokemon-id="${pokemon.id}" ${isCaught ? html`checked` : ''}>
            <img src="pokemon_images/${pokemon.filename}" alt="${pokemon.name}" width="60" height="60" loading="lazy" decoding="async">
            <div style="flex: 1;">
                <div class="admin-pokemon-name">#${pokemon.id} ${pokemon.name}</div>
                <div class="admin-pokemon-status">${isCaught ? '✓ Caught' : 'Not caught'}</div>
            </div>
        </div>`;
}

export function renderPokemonSection() {
    const available = getAvailablePokemon();
    const caught = caughtIdSet();
    return toHtml(html`
        <div class="admin-section" id="admin-pokemon">
            <h2>Pokemon Manager</h2>
            <p style="color: #666;">Total caught: <strong id="caught-count">${countCaughtAvailable()}</strong> / ${available.length}</p>
            <div class="admin-row">
                <button type="button" id="catch-all" class="admin-btn admin-btn-green">✓ Catch All</button>
                <button type="button" id="release-all" class="admin-btn admin-btn-red">✗ Release All</button>
                <button type="button" id="generate-sync-url" class="admin-btn admin-btn-blue">🔗 Generate Sync URL</button>
            </div>
            <div id="sync-url-container" class="admin-sync-box" hidden>
                <p>📋 Sync URL (copy and paste on other device):</p>
                <input type="text" id="sync-url-input" readonly>
                <p class="admin-sync-hint">Open this URL on your iPad to sync Pokemon data</p>
            </div>
            <div id="sync-message" class="admin-sync-message" hidden></div>
        </div>
        <div class="admin-grid admin-pokemon-grid" id="pokemon-grid">
            ${available.map(pokemon => renderPokemonCard(pokemon, caught.has(pokemon.id)))}
        </div>`);
}

// Behaviour --------------------------------------------------------------------

export function mountPokemonSection(root) {
    const grid = root.querySelector('#pokemon-grid');
    const countEl = root.querySelector('#caught-count');
    const syncMessage = root.querySelector('#sync-message');
    let syncTimer = null;

    const showSyncMessage = (text, color) => {
        syncMessage.textContent = text;
        syncMessage.style.background = color;
        syncMessage.hidden = false;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => { syncMessage.hidden = true; }, 5000);
    };

    const refresh = () => {
        const list = getCaughtPokemonList();
        const caught = caughtIdSet(list);
        countEl.textContent = countCaughtAvailable(list);
        for (const card of grid.querySelectorAll('[data-pokemon-card]')) {
            const id = parseInt(card.dataset.pokemonCard, 10);
            const isCaught = caught.has(id);
            card.classList.toggle('caught', isCaught);
            card.querySelector('input').checked = isCaught;
            card.querySelector('.admin-pokemon-status').textContent = isCaught ? '✓ Caught' : 'Not caught';
        }
    };

    grid.addEventListener('change', (event) => {
        const input = event.target.closest('[data-pokemon-id]');
        if (!input) return;
        const id = parseInt(input.dataset.pokemonId, 10);
        const list = getCaughtPokemonList();
        const index = list.findIndex(entry => ((entry && typeof entry === 'object') ? entry.id : entry) === id);
        if (index > -1) {
            list.splice(index, 1);
        } else {
            list.push({ id, name: pokemonName(id), caughtDate: new Date().toISOString() });
        }
        saveCaughtPokemonList(list);
        refresh();
    });

    root.querySelector('#catch-all').addEventListener('click', () => {
        const now = new Date().toISOString();
        saveCaughtPokemonList(getAvailablePokemon().map(p => ({ id: p.id, name: p.name, caughtDate: now })));
        refresh();
    });

    root.querySelector('#release-all').addEventListener('click', () => {
        saveCaughtPokemonList([]);
        refresh();
    });

    root.querySelector('#generate-sync-url').addEventListener('click', () => {
        const list = getCaughtPokemonList();
        if (list.length === 0) {
            showSyncMessage('⚠️ No Pokemon to sync! Catch some Pokemon first.', MESSAGE_COLORS.busy);
            return;
        }
        const baseURL = window.location.origin + window.location.pathname;
        const input = root.querySelector('#sync-url-input');
        root.querySelector('#sync-url-container').hidden = false;
        input.value = `${baseURL}?sync=${encodeSyncPayload(list)}`;
        input.select();
        showSyncMessage('✓ Sync URL generated! Copy and open on your iPad.', MESSAGE_COLORS.ok);
    });

    root.querySelector('#sync-url-input').addEventListener('click', (event) => event.target.select());
}
