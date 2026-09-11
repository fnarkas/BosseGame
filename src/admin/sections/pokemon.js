// "Pokemon Manager": the selected account's caught list as a grid of
// checkboxes, plus catch all / release all. Changes go into the account state
// and are synced to the server like a catch in the game.

import { POKEMON_DATA, getAvailablePokemon, MAX_POKEMON_ID } from '../../pokemonData.js';
import { getCaughtPokemonList, saveCaughtPokemonList, caughtIdSet } from '../../caughtPokemon.js';
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
            </div>
        </div>
        <div class="admin-grid admin-pokemon-grid" id="pokemon-grid">
            ${available.map(pokemon => renderPokemonCard(pokemon, caught.has(pokemon.id)))}
        </div>`);
}

// Behaviour --------------------------------------------------------------------

export function mountPokemonSection(root) {
    const grid = root.querySelector('#pokemon-grid');
    const countEl = root.querySelector('#caught-count');

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
}
