// "Pokédex": the selected account's caught list as a grid of cards that
// toggle on click, with a search box, caught / not-caught filters, a progress
// bar and catch all / release all. Changes go into the account state and are
// synced to the server like a catch in the game.

import { POKEMON_DATA, getAvailablePokemon, MAX_POKEMON_ID } from '../../pokemonData.js';
import { getCaughtPokemonList, saveCaughtPokemonList, caughtIdSet } from '../../caughtPokemon.js';
import { getPokemonRarity, RARITY_TIERS } from '../../pokemonRarity.js';
import { html, toHtml } from '../html.js';

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

export function countCaughtAvailable(list = getCaughtPokemonList()) {
    let count = 0;
    for (const id of caughtIdSet(list)) {
        if (typeof id === 'number' && id <= MAX_POKEMON_ID) count += 1;
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

// Markup ---------------------------------------------------------------------

function renderPokemonCard(pokemon, isCaught) {
    const stars = RARITY_TIERS[getPokemonRarity(pokemon)].icon;
    return html`
        <label class="admin-pokemon ${isCaught ? 'caught' : ''}" data-pokemon-card="${pokemon.id}" data-name="${pokemon.name.toLowerCase()}">
            <input type="checkbox" id="pokemon-${pokemon.id}" data-pokemon-id="${pokemon.id}" ${isCaught ? html`checked` : ''}>
            <img src="pokemon_images/${pokemon.filename}" alt="" width="56" height="56" loading="lazy" decoding="async">
            <span class="admin-pokemon-text">
                <span class="admin-pokemon-name">${pokemon.name}</span>
                <span class="admin-pokemon-status">#${String(pokemon.id).padStart(3, '0')} ${stars ? html` · ${stars}` : ''}</span>
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

export function mountPokemonSection(root) {
    const grid = root.querySelector('#pokemon-grid');
    const countEl = root.querySelector('#caught-count');
    const bar = root.querySelector('#caught-bar');
    const search = root.querySelector('#pokedex-search');
    const filterBox = root.querySelector('#pokedex-filter');
    const empty = root.querySelector('#pokedex-empty');
    const total = getAvailablePokemon().length;
    let filter = 'all';

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
