// "Inventory": the selected account's coins, Poké Balls and streak, editable
// in place. Every change goes straight into the account state (like a purchase
// in the game) and is synced to the server; the header's status pill shows
// when it has been saved, so there is no Save button here.

import { getCoinCount, setCoinCount } from '../../currency.js';
import { getInventory, setPokeballCount, POKEBALL_TYPES, MAX_ITEM_COUNT, clampCount } from '../../inventory.js';
import { getStreak, setStreak, MAX_STREAK } from '../../streak.js';
import { html, toHtml } from '../html.js';

const BALL_SPRITE = {
    pokeball: 'poke-ball.png', greatball: 'great-ball.png', ultraball: 'ultra-ball.png', legendaryball: 'legendary-ball.png'
};

// One row per editable item. `read`/`write` talk to the shared modules so the
// panel never touches storage keys itself.
export const INVENTORY_ITEMS = [
    {
        id: 'coins', label: 'Coins', image: 'coin.png', max: MAX_ITEM_COUNT,
        hint: 'Earned in minigames, spent in the store.',
        steps: [1, 10, 100],
        read: () => getCoinCount(),
        write: (value) => setCoinCount(value)
    },
    ...Object.entries(POKEBALL_TYPES).map(([type, ball]) => ({
        id: type, label: ball.name, image: `pokeball_sprites/${BALL_SPRITE[type]}`, max: MAX_ITEM_COUNT,
        hint: `Costs ${ball.price} coins in the store · catch rate ×${ball.catchRate}`,
        steps: [1, 5, 10],
        read: () => getInventory()[type],
        write: (value) => setPokeballCount(type, value)
    })),
    {
        id: 'streak', label: 'Streak', emoji: '🔥', max: MAX_STREAK,
        hint: `Coin multiplier for the next win, ×1 to ×${MAX_STREAK}. Expires after half a day.`,
        steps: [1],
        read: () => getStreak(),
        write: (value) => setStreak(value)
    }
];

export function inventorySnapshot() {
    return Object.fromEntries(INVENTORY_ITEMS.map(item => [item.id, item.read()]));
}

// Markup ---------------------------------------------------------------------

function renderItem(item, value) {
    const icon = item.image
        ? html`<img src="${item.image}" alt="" width="56" height="56" decoding="async">`
        : html`<span class="admin-inv-emoji">${item.emoji}</span>`;
    return html`
        <div class="admin-card admin-inv-item" data-inv-item="${item.id}">
            <div class="admin-inv-icon">${icon}</div>
            <div class="admin-inv-body">
                <div class="admin-inv-label">${item.label}</div>
                <div class="admin-help">${item.hint}</div>
                <div class="admin-stepper">
                    <button type="button" class="admin-step" data-inv-step="-1" aria-label="Remove one">−</button>
                    <input type="number" class="admin-input admin-stepper-input" id="inv-${item.id}" data-inv-input="${item.id}"
                        value="${value}" min="0" max="${item.max}" step="1" inputmode="numeric">
                    <button type="button" class="admin-step" data-inv-step="1" aria-label="Add one">+</button>
                    <span class="admin-inv-quick">
                        ${item.steps.filter(step => step > 1).map(step => html`
                            <button type="button" class="admin-chip-btn" data-inv-step="${step}">+${step}</button>`)}
                        <button type="button" class="admin-chip-btn admin-chip-btn-muted" data-inv-set="0">Clear</button>
                    </span>
                </div>
            </div>
        </div>`;
}

export function renderInventorySection() {
    const values = inventorySnapshot();
    return toHtml(html`
        <div class="admin-section" id="admin-inventory">
            <h2>🎒 Inventory</h2>
            <p class="admin-lead">What this player has right now. Changes apply immediately and show up in the game on its next screen.</p>
            <div class="admin-inv-grid">
                ${INVENTORY_ITEMS.map(item => renderItem(item, values[item.id]))}
            </div>
        </div>`);
}

// Behaviour --------------------------------------------------------------------

export function mountInventorySection(root) {
    const section = root.querySelector('#admin-inventory');
    if (!section) return;

    const apply = (item, value) => {
        const stored = item.write(clampCount(value, item.max));
        const input = section.querySelector(`[data-inv-input="${item.id}"]`);
        if (input) input.value = stored;
        return stored;
    };

    section.addEventListener('click', (event) => {
        const button = event.target.closest('[data-inv-step], [data-inv-set]');
        if (!button) return;
        const card = button.closest('[data-inv-item]');
        const item = INVENTORY_ITEMS.find(entry => entry.id === card.dataset.invItem);
        if (!item) return;
        if (button.dataset.invSet !== undefined) {
            apply(item, parseInt(button.dataset.invSet, 10));
        } else {
            apply(item, item.read() + parseInt(button.dataset.invStep, 10));
        }
    });

    // Typed values apply when the field is left or Enter is pressed, so a
    // half-typed "15" is never saved as 1.
    section.addEventListener('change', (event) => {
        const input = event.target.closest('[data-inv-input]');
        if (!input) return;
        const item = INVENTORY_ITEMS.find(entry => entry.id === input.dataset.invInput);
        if (item) apply(item, input.value);
    });
    section.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.matches('[data-inv-input]')) event.target.blur();
    });
}
