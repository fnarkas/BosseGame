// "Pokédex": the selected account's Pokemon, in three cards.
//
//   1. How many Pokemon are in the game (the `pokedex.maxPokemonId` config):
//      a number with one preset per generation. Saved like the other config
//      sections, so each child can have their own pool.
//   2. "Next up": the account's spawn queue (src/spawnQueue.js), the same
//      list the game draws its encounters from. A search box pushes any
//      Pokemon in the pool to the front of the line; slots can be removed and
//      the random part reshuffled.
//   3. The caught list as a grid of cards that toggle on click, with a search
//      box, caught / not-caught filters, a progress bar and catch all /
//      release all.
//
// Everything goes into the account state and is synced to the server like a
// catch in the game; the child's device picks it up on its next load.

import { getCaughtPokemonList, saveCaughtPokemonList, caughtIdSet } from '../../caughtPokemon.js';
import { getPokemonRarity, RARITY_TIERS } from '../../pokemonRarity.js';
import {
    getAvailablePokemon, getMaxPokemonId, setMaxPokemonId, clampMaxPokemonId, isPokemonAvailable,
    getPokemonById, TOTAL_POKEMON, GENERATIONS
} from '../../pokemonPool.js';
import {
    peekSpawnQueue, queueSpawn, queueGift, removeFromSpawnQueue, reshuffleSpawnQueue, SPAWN_QUEUE_LENGTH
} from '../../spawnQueue.js';
import { GIFT_ITEMS, normalizeGift, describeGift } from '../../gifts.js';
import { MAX_ITEM_COUNT } from '../../inventory.js';
import { saveConfig } from '../configApi.js';
import { html, raw, toHtml, flash, MESSAGE_COLORS } from '../html.js';

export const QUEUE_SEARCH_LIMIT = 12;

// Data ------------------------------------------------------------------------

function pokemonName(id) {
    const pokemon = getPokemonById(id);
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

export function countCaughtAvailable(list = getCaughtPokemonList()) {
    let count = 0;
    for (const id of caughtIdSet(list)) {
        if (isPokemonAvailable(id)) count += 1;
    }
    return count;
}

export const POKEDEX_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'caught', label: '✓ Caught' },
    { id: 'missing', label: 'Not caught' }
];

// Whether a card matches the search text ("pika", "25", "#25") and filter.
export function matchesPokedexQuery(pokemon, isCaught, query, filter) {
    if (filter === 'caught' && !isCaught) return false;
    if (filter === 'missing' && isCaught) return false;
    const q = String(query || '').trim().toLowerCase().replace(/^#/, '');
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(pokemon.id) === q || String(pokemon.id).startsWith(q);
    return pokemon.name.toLowerCase().includes(q);
}

// Pokemon in the pool matching the queue search, exact number first.
export function searchPokemon(query, limit = QUEUE_SEARCH_LIMIT) {
    const q = String(query || '').trim();
    if (!q) return [];
    const matches = getAvailablePokemon().filter(pokemon => matchesPokedexQuery(pokemon, false, q, 'all'));
    const exact = matches.filter(p => String(p.id) === q.replace(/^#/, '') || p.name.toLowerCase() === q.toLowerCase());
    const rest = matches.filter(p => !exact.includes(p));
    return [...exact, ...rest].slice(0, limit);
}

// The generation whose last Pokemon is exactly `maxId`, if any.
export function generationFor(maxId) {
    return GENERATIONS.find(g => g.lastId === maxId) || null;
}

const dexNumber = (id) => `#${String(id).padStart(3, '0')}`;

// Markup ---------------------------------------------------------------------

function renderPoolCard() {
    const max = getMaxPokemonId();
    return html`
        <div class="admin-card" id="pokedex-pool">
            <div class="admin-card-head">
                <h3>🌍 Pokémon in the game</h3>
                <span class="admin-help-inline"><strong id="pokedex-pool-count">${max}</strong> of ${TOTAL_POKEMON}</span>
            </div>
            <div class="admin-row" style="margin: 0 0 10px;">
                <label class="admin-label" for="pokedex-max" style="margin: 0;">Show and catch Pokémon #1 to</label>
                <input type="number" id="pokedex-max" class="admin-input admin-input-number" min="1" max="${TOTAL_POKEMON}" step="1" value="${max}">
                <button type="button" id="pokedex-max-save" class="admin-btn admin-btn-green">💾 Save</button>
            </div>
            <div class="admin-chips" id="pokedex-gen-presets">
                ${GENERATIONS.map(g => html`
                    <button type="button" class="admin-chip-btn ${g.lastId === max ? 'active' : ''}" data-gen-last="${g.lastId}">Gen ${g.gen} · ${g.region} · ${g.lastId}</button>`)}
            </div>
            <div class="admin-help">The child's Pokédex shows exactly these Pokémon and only they can appear in the game.
                Pokémon caught above the limit are kept and come back when the limit is raised again.</div>
            <div id="pokedex-max-message" class="admin-message"></div>
        </div>`;
}

function renderGiftSlot(entry, index) {
    return html`
        <li class="admin-queue-slot pinned gift" data-spawn-slot="${index}" data-spawn-gift="1">
            <span class="admin-queue-pos">${index + 1}</span>
            <span class="admin-queue-gift-icon">🎁</span>
            <span class="admin-pokemon-text">
                <span class="admin-pokemon-name">Present</span>
                <span class="admin-pokemon-status">${describeGift(entry.gift)}</span>
            </span>
            <button type="button" class="admin-chip-btn admin-chip-btn-muted" data-queue-remove="${index}" title="Remove from the queue" aria-label="Remove the present from the queue">✕</button>
        </li>`;
}

function renderQueueSlot(pokemon, index, caught) {
    if (pokemon.gift) return renderGiftSlot(pokemon, index);
    const stars = RARITY_TIERS[getPokemonRarity(pokemon)].icon;
    const notes = [dexNumber(pokemon.id)];
    if (stars) notes.push(stars);
    if (pokemon.pinned) notes.push('📌 chosen');
    if (caught.has(pokemon.id)) notes.push('✓ caught');
    return html`
        <li class="admin-queue-slot ${pokemon.pinned ? 'pinned' : ''}" data-spawn-slot="${index}" data-spawn-id="${pokemon.id}">
            <span class="admin-queue-pos">${index + 1}</span>
            <img src="pokemon_images/${pokemon.filename}" alt="" width="56" height="56" loading="lazy" decoding="async">
            <span class="admin-pokemon-text">
                <span class="admin-pokemon-name">${pokemon.name}</span>
                <span class="admin-pokemon-status">${notes.join(' · ')}</span>
            </span>
            <button type="button" class="admin-chip-btn admin-chip-btn-muted" data-queue-remove="${index}" title="Remove from the queue" aria-label="Remove ${pokemon.name} from the queue">✕</button>
        </li>`;
}

function renderQueueSlots() {
    const caught = caughtIdSet();
    return peekSpawnQueue().map((pokemon, index) => renderQueueSlot(pokemon, index, caught));
}

function renderQueueResults(query) {
    return searchPokemon(query).map(pokemon => html`
        <button type="button" class="admin-chip-btn" data-queue-add="${pokemon.id}">
            <img src="pokemon_images/${pokemon.filename}" alt="" width="24" height="24" loading="lazy"> ${pokemon.name} <span class="admin-help-inline">${dexNumber(pokemon.id)}</span>
        </button>`);
}

function renderQueueCard() {
    return html`
        <div class="admin-card" id="pokedex-queue">
            <div class="admin-card-head">
                <h3>⏭️ Next up</h3>
                <button type="button" id="queue-reshuffle" class="admin-btn admin-btn-sm admin-btn-blue">🎲 Reshuffle</button>
            </div>
            <p class="admin-lead">The next ${SPAWN_QUEUE_LENGTH} Pokémon the child will meet, in order. Search for a Pokémon to put it first in line.
                Pokémon you chose (📌) stay in the queue until they are met; the others are drawn at random from the ones not yet caught.</p>
            <div class="admin-toolbar">
                <input type="search" id="queue-search" class="admin-input admin-search" placeholder="🔍 Put a Pokémon next in line…" autocomplete="off">
            </div>
            <div class="admin-chips admin-queue-results" id="queue-results" hidden></div>
            <details class="admin-gift" id="queue-gift">
                <summary>🎁 Put a present next in line</summary>
                <p class="admin-help">A present shows up as a gift box instead of a Pokémon. Tapping it puts the contents in the bag. Fill in what it should hold:</p>
                <div class="admin-gift-items">
                    ${GIFT_ITEMS.map(item => html`
                        <label class="admin-gift-item">
                            <img src="${item.image}" alt="" width="40" height="40" decoding="async">
                            <span class="admin-gift-label">${item.label}</span>
                            <input type="number" class="admin-input admin-stepper-input" id="gift-${item.id}" data-gift-item="${item.id}" value="0" min="0" max="${MAX_ITEM_COUNT}" step="1" inputmode="numeric">
                        </label>`)}
                </div>
                <div class="admin-row" style="margin: 10px 0 0;">
                    <button type="button" id="queue-gift-add" class="admin-btn admin-btn-green">🎁 Add the present</button>
                    <span id="queue-gift-message" class="admin-message"></span>
                </div>
            </details>
            <ol class="admin-queue" id="spawn-queue">${renderQueueSlots()}</ol>
        </div>`;
}

function renderPokemonCard(pokemon, isCaught) {
    const stars = RARITY_TIERS[getPokemonRarity(pokemon)].icon;
    return html`
        <label class="admin-pokemon ${isCaught ? 'caught' : ''}" data-pokemon-card="${pokemon.id}" data-name="${pokemon.name.toLowerCase()}">
            <input type="checkbox" id="pokemon-${pokemon.id}" data-pokemon-id="${pokemon.id}" ${isCaught ? html`checked` : ''}>
            <img src="pokemon_images/${pokemon.filename}" alt="" width="56" height="56" loading="lazy" decoding="async">
            <span class="admin-pokemon-text">
                <span class="admin-pokemon-name">${pokemon.name}</span>
                <span class="admin-pokemon-status">${dexNumber(pokemon.id)} ${stars ? html` · ${stars}` : ''}</span>
            </span>
        </label>`;
}

export function renderPokemonSection() {
    const available = getAvailablePokemon();
    const caught = caughtIdSet();
    const count = countCaughtAvailable();
    const percent = available.length ? Math.round(count / available.length * 100) : 0;
    return toHtml(html`
        <div class="admin-section" id="admin-pokedex">
            <div class="admin-section-head">
                <h2>📖 Pokédex</h2>
                <div class="admin-row" style="margin: 0;">
                    <button type="button" id="catch-all" class="admin-btn admin-btn-sm admin-btn-green">✓ Catch all</button>
                    <button type="button" id="release-all" class="admin-btn admin-btn-sm admin-btn-red">✗ Release all</button>
                </div>
            </div>
            ${renderPoolCard()}
            ${renderQueueCard()}
            <div class="admin-progress">
                <div class="admin-progress-bar"><div class="admin-progress-fill" id="caught-bar" style="width: ${percent}%;"></div></div>
                <div class="admin-progress-text"><strong id="caught-count">${count}</strong> / ${available.length} caught</div>
            </div>
            <div class="admin-toolbar">
                <input type="search" id="pokedex-search" class="admin-input admin-search" placeholder="🔍 Search name or number" autocomplete="off">
                <div class="admin-segmented" id="pokedex-filter">
                    ${POKEDEX_FILTERS.map((option, index) => html`
                        <button type="button" class="admin-seg ${index === 0 ? 'active' : ''}" data-filter="${option.id}">${option.label}</button>`)}
                </div>
            </div>
            <div class="admin-grid admin-pokemon-grid" id="pokemon-grid">
                ${available.map(pokemon => renderPokemonCard(pokemon, caught.has(pokemon.id)))}
            </div>
            <div class="admin-empty" id="pokedex-empty" hidden>No Pokémon match.</div>
        </div>`);
}

// Behaviour --------------------------------------------------------------------

// Replace the whole section (after the pool size changed) and wire it again.
function rerenderSection(root, message) {
    const section = root.querySelector('#admin-pokedex');
    if (!section) return;
    section.outerHTML = renderPokemonSection();
    mountPokemonSection(root);
    if (message) flash(root.querySelector('#pokedex-max-message'), message.text, message.color);
}

function mountPoolCard(root) {
    const input = root.querySelector('#pokedex-max');
    const presets = root.querySelector('#pokedex-gen-presets');
    const message = root.querySelector('#pokedex-max-message');

    const markPreset = () => {
        const value = clampMaxPokemonId(input.value);
        for (const button of presets.querySelectorAll('[data-gen-last]')) {
            button.classList.toggle('active', parseInt(button.dataset.genLast, 10) === value);
        }
    };
    input.addEventListener('input', markPreset);
    presets.addEventListener('click', (event) => {
        const button = event.target.closest('[data-gen-last]');
        if (!button) return;
        input.value = button.dataset.genLast;
        markPreset();
    });

    root.querySelector('#pokedex-max-save').addEventListener('click', async () => {
        const maxPokemonId = clampMaxPokemonId(input.value);
        input.value = maxPokemonId;
        flash(message, '⏳ Saving…', MESSAGE_COLORS.busy, 0);
        try {
            await saveConfig({ pokedex: { maxPokemonId } });
            setMaxPokemonId(maxPokemonId);
            rerenderSection(root, { text: `✓ Saved: ${maxPokemonId} Pokémon in the game`, color: MESSAGE_COLORS.ok });
        } catch (error) {
            flash(message, `❌ ${error.message}`, MESSAGE_COLORS.error);
        }
    });
}

function mountQueueCard(root) {
    const list = root.querySelector('#spawn-queue');
    const search = root.querySelector('#queue-search');
    const results = root.querySelector('#queue-results');

    const refreshQueue = () => {
        list.innerHTML = toHtml(html`${renderQueueSlots()}`);
    };
    const showResults = () => {
        const matches = renderQueueResults(search.value);
        results.innerHTML = toHtml(html`${matches}`);
        results.hidden = matches.length === 0;
    };

    search.addEventListener('input', showResults);
    results.addEventListener('click', (event) => {
        const button = event.target.closest('[data-queue-add]');
        if (!button) return;
        queueSpawn(parseInt(button.dataset.queueAdd, 10));
        search.value = '';
        showResults();
        refreshQueue();
    });
    list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-queue-remove]');
        if (!button) return;
        removeFromSpawnQueue(parseInt(button.dataset.queueRemove, 10));
        refreshQueue();
    });
    root.querySelector('#queue-reshuffle').addEventListener('click', () => {
        reshuffleSpawnQueue();
        refreshQueue();
    });

    const giftInputs = [...root.querySelectorAll('[data-gift-item]')];
    const giftMessage = root.querySelector('#queue-gift-message');
    root.querySelector('#queue-gift-add').addEventListener('click', () => {
        const gift = normalizeGift(Object.fromEntries(giftInputs.map(input => [input.dataset.giftItem, parseInt(input.value, 10)])));
        if (!gift) {
            flash(giftMessage, '❌ The present is empty: give it at least one thing', MESSAGE_COLORS.error);
            return;
        }
        queueGift(gift);
        for (const input of giftInputs) input.value = 0;
        flash(giftMessage, `✓ Present queued: ${describeGift(gift)}`, MESSAGE_COLORS.ok);
        refreshQueue();
    });
    return refreshQueue;
}

export function mountPokemonSection(root) {
    const grid = root.querySelector('#pokemon-grid');
    const countEl = root.querySelector('#caught-count');
    const bar = root.querySelector('#caught-bar');
    const search = root.querySelector('#pokedex-search');
    const filterBox = root.querySelector('#pokedex-filter');
    const empty = root.querySelector('#pokedex-empty');
    const total = getAvailablePokemon().length;
    let filter = 'all';

    mountPoolCard(root);
    const refreshQueue = mountQueueCard(root);

    const applyFilter = () => {
        const caught = caughtIdSet();
        let shown = 0;
        for (const card of grid.querySelectorAll('[data-pokemon-card]')) {
            const id = parseInt(card.dataset.pokemonCard, 10);
            const visible = matchesPokedexQuery({ id, name: card.dataset.name }, caught.has(id), search.value, filter);
            card.hidden = !visible;
            if (visible) shown += 1;
        }
        empty.hidden = shown > 0;
    };

    const refresh = () => {
        const list = getCaughtPokemonList();
        const caught = caughtIdSet(list);
        const count = countCaughtAvailable(list);
        countEl.textContent = count;
        bar.style.width = `${total ? Math.round(count / total * 100) : 0}%`;
        for (const card of grid.querySelectorAll('[data-pokemon-card]')) {
            const id = parseInt(card.dataset.pokemonCard, 10);
            const isCaught = caught.has(id);
            card.classList.toggle('caught', isCaught);
            card.querySelector('input').checked = isCaught;
        }
        // A newly caught Pokemon leaves the random part of the queue.
        refreshQueue();
        // Keep a just-toggled card in view under the caught / missing filters
        // so the click does not make it vanish; re-filter on the next search.
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

    search.addEventListener('input', applyFilter);
    filterBox.addEventListener('click', (event) => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        filter = button.dataset.filter;
        for (const b of filterBox.querySelectorAll('[data-filter]')) b.classList.toggle('active', b === button);
        applyFilter();
    });

    root.querySelector('#catch-all').addEventListener('click', () => {
        if (!confirm('Mark every Pokémon as caught for this account?')) return;
        const now = new Date().toISOString();
        saveCaughtPokemonList(getAvailablePokemon().map(p => ({ id: p.id, name: p.name, caughtDate: now })));
        refresh();
        applyFilter();
    });

    root.querySelector('#release-all').addEventListener('click', () => {
        if (!confirm('Release every Pokémon for this account? The child\'s Pokédex will be empty.')) return;
        saveCaughtPokemonList([]);
        refresh();
        applyFilter();
    });
}
