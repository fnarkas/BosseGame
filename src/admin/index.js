// The /admin page: the parent's control panel, one account at a time.
//
// The account picker in the header logs the panel in as that player (without
// changing which player this device uses for the game), so every tab below
// edits that account's own inventory, config, dictionary and Pokedex, all
// synced to the server like the game's own saves. The status pill next to the
// picker mirrors that sync, so a parent can see a change has really landed
// before closing the tab. Nothing here is shown to the child.

import { getConfig, resetConfigCache } from './configApi.js';
import { listAccounts, login, getCurrentAccount, getSyncStatus, onSyncChange, flush } from '../account.js';
import { ADMIN_CSS, html, raw, toHtml } from './html.js';
import { renderInventorySection, mountInventorySection } from './sections/inventory.js';
import { renderMinigamesSection, mountMinigamesSection } from './sections/minigames.js';
import { renderEmojiWordsSection, mountEmojiWordsSection } from './sections/emojiWords.js';
import { renderWeightsSection, mountWeightsSection } from './sections/weights.js';
import { renderPokemonSection, mountPokemonSection } from './sections/pokemon.js';
import { renderGamesSection } from './sections/games.js';
import { applyPokedexConfig } from '../pokemonPool.js';

export const USER_PARAM = 'user';

// One entry per tab. `section` is the id of the element the tab shows.
export const ADMIN_TABS = [
    { id: 'inventory', label: '🎒 Inventory', section: 'admin-inventory' },
    { id: 'minigames', label: '🎮 Minigames', section: 'admin-minigames' },
    { id: 'weights', label: '🎲 Probabilities', section: 'admin-weights' },
    { id: 'words', label: '📚 Dictionary', section: 'admin-emoji-words' },
    { id: 'pokedex', label: '📖 Pokédex', section: 'admin-pokedex' },
    { id: 'games', label: '🕹️ Try a game', section: 'admin-games' }
];
export const DEFAULT_TAB = ADMIN_TABS[0].id;

export const SYNC_LABELS = {
    saved: { text: '✓ All changes saved', cls: 'saved' },
    pending: { text: '● Unsaved changes', cls: 'pending' },
    saving: { text: '⏳ Saving…', cls: 'pending' },
    error: { text: '⚠️ Not saved, retrying…', cls: 'error' }
};

// The tab named in the URL hash, or the first one.
export function tabFromHash(hash) {
    const id = String(hash || '').replace(/^#/, '');
    return ADMIN_TABS.some(tab => tab.id === id) ? id : DEFAULT_TAB;
}

function renderHeader(accounts, selected, syncStatus) {
    const sync = SYNC_LABELS[syncStatus] || SYNC_LABELS.saved;
    return html`
        <header class="admin-header">
            <div class="admin-header-main">
                <h1>⚙️ Admin</h1>
                ${accounts.length ? html`
                    <label class="admin-account">
                        <span class="admin-account-icon">👤</span>
                        <select id="admin-account" class="admin-input admin-account-select">
                            ${accounts.map(account => html`
                                <option value="${account.name}" ${raw(account.name === selected ? 'selected' : '')}>${account.name} (📖 ${account.pokemonCount || 0})</option>`)}
                        </select>
                    </label>` : ''}
                ${selected ? html`<span id="admin-sync" class="admin-sync ${sync.cls}">${sync.text}</span>` : ''}
            </div>
            <a href="/" class="admin-back">← Back to game</a>
        </header>`;
}

function renderTabs(active) {
    return html`
        <nav class="admin-tabs" id="admin-tabs" aria-label="Sections">
            ${ADMIN_TABS.map(tab => html`
                <a href="#${tab.id}" class="admin-tab ${tab.id === active ? 'active' : ''}" data-tab="${tab.id}" role="tab"
                    aria-selected="${tab.id === active ? 'true' : 'false'}">${tab.label}</a>`)}
        </nav>`;
}

// `accounts` is the list from the server and `selected` the name the sections
// were rendered for. `banner` ({ text, color }) is an optional notice.
export function renderAdminPage(config, { accounts = [], selected = null, banner = null, tab = DEFAULT_TAB, syncStatus = 'saved' } = {}) {
    const active = tabFromHash(tab);
    return toHtml(html`
        <style>${raw(ADMIN_CSS)}</style>
        <div class="admin">
            ${renderHeader(accounts, selected, syncStatus)}
            ${banner ? html`<div class="admin-banner" style="background: ${banner.color};">${banner.text}</div>` : ''}
            ${selected ? html`
                ${renderTabs(active)}
                <main class="admin-panels">
                    ${ADMIN_TABS.map(tab => html`
                        <div class="admin-panel" data-panel="${tab.id}" ${raw(tab.id === active ? '' : 'hidden')}>
                            ${raw(renderPanelBody(tab.id, config))}
                        </div>`)}
                </main>` : ''}
        </div>`);
}

function renderPanelBody(tabId, config) {
    switch (tabId) {
        case 'inventory': return renderInventorySection();
        case 'minigames': return renderMinigamesSection(config);
        case 'weights': return renderWeightsSection(config);
        case 'words': return renderEmojiWordsSection(config);
        case 'pokedex': return renderPokemonSection();
        case 'games': return renderGamesSection();
        default: return '';
    }
}

// Which account to open: ?user= in the URL, else the device's player, else the
// most recently played one.
export function pickAccount(accounts, requested, deviceAccount) {
    const names = accounts.map(a => a.name);
    const match = (name) => name && names.find(n => n.toLowerCase() === String(name).toLowerCase());
    return match(requested) || match(deviceAccount) || names[0] || null;
}

export async function showAdminPage() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.style.display = 'none';
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    document.body.style.background = '#eef1f5';

    let accounts = [];
    let banner = null;
    try {
        accounts = await listAccounts();
        if (accounts.length === 0) {
            banner = { text: 'No accounts yet. Open the game and enter a name first.', color: '#FF9800' };
        }
    } catch (error) {
        console.error('Admin: could not list accounts', error);
        banner = { text: `❌ Could not reach the server: ${error.message}`, color: '#f44336' };
    }

    const requested = new URLSearchParams(window.location.search).get(USER_PARAM);
    const selected = pickAccount(accounts, requested, getCurrentAccount());
    await renderFor(selected, accounts, banner);
}

let stopSyncWatch = null;

async function renderFor(name, accounts, banner) {
    // Whatever the previous account still has queued goes out before the
    // panel switches, so the status pill never lies about the new one.
    await flush();
    let config = {};
    let selected = null;
    if (name) {
        try {
            await login(name, { remember: false });
            resetConfigCache();
            config = await getConfig();
            // The Pokédex tab lists this account's pool, not the previous one's.
            await applyPokedexConfig();
            selected = name;
            const url = new URL(window.location.href);
            url.searchParams.set(USER_PARAM, name);
            window.history.replaceState({}, document.title, url);
        } catch (error) {
            console.error('Admin: could not open account', error);
            banner = { text: `❌ Could not open ${name}: ${error.message}`, color: '#f44336' };
        }
    }

    const tab = tabFromHash(window.location.hash);
    document.body.innerHTML = renderAdminPage(config, { accounts, selected, banner, tab, syncStatus: getSyncStatus() });

    const root = document.body;
    const picker = root.querySelector('#admin-account');
    if (picker) {
        picker.addEventListener('change', () => renderFor(picker.value, accounts, null));
    }
    if (!selected) return;

    mountSyncPill(root);
    mountTabs(root);
    mountInventorySection(root);
    mountMinigamesSection(root);
    mountWeightsSection(root);
    mountEmojiWordsSection(root);
    mountPokemonSection(root);
}

function mountSyncPill(root) {
    const pill = root.querySelector('#admin-sync');
    if (stopSyncWatch) stopSyncWatch();
    stopSyncWatch = onSyncChange((status) => {
        const sync = SYNC_LABELS[status] || SYNC_LABELS.saved;
        pill.textContent = sync.text;
        pill.className = `admin-sync ${sync.cls}`;
    });
}

function mountTabs(root) {
    const show = (id) => {
        for (const link of root.querySelectorAll('[data-tab]')) {
            const active = link.dataset.tab === id;
            link.classList.toggle('active', active);
            link.setAttribute('aria-selected', active ? 'true' : 'false');
        }
        for (const panel of root.querySelectorAll('[data-panel]')) {
            panel.hidden = panel.dataset.panel !== id;
        }
        // Charts drawn while hidden have no size; let them measure again.
        window.dispatchEvent(new Event('resize'));
    };
    root.querySelector('#admin-tabs').addEventListener('click', (event) => {
        const link = event.target.closest('[data-tab]');
        if (!link) return;
        event.preventDefault();
        const id = link.dataset.tab;
        window.history.replaceState({}, document.title, `#${id}`);
        show(id);
    });
    window.addEventListener('hashchange', () => show(tabFromHash(window.location.hash)));
}
