// The /admin page: the parent's control panel, one account at a time.
//
// The account picker at the top logs the panel in as that player (without
// changing which player this device uses for the game), so every section
// below edits that account's own config, dictionary and Pokedex, all synced to
// the server like the game's own saves. Nothing here is shown to the child.

import { getConfig, resetConfigCache } from './configApi.js';
import { listAccounts, login, getCurrentAccount } from '../account.js';
import { ADMIN_CSS, html, raw, toHtml } from './html.js';
import { renderMinigamesSection, mountMinigamesSection } from './sections/minigames.js';
import { renderEmojiWordsSection, mountEmojiWordsSection } from './sections/emojiWords.js';
import { renderWeightsSection, mountWeightsSection } from './sections/weights.js';
import { renderPokemonSection, mountPokemonSection } from './sections/pokemon.js';

export const USER_PARAM = 'user';

function renderAccountPicker(accounts, selected) {
    return html`
        <div class="admin-section admin-account-bar">
            <label class="admin-label" for="admin-account">👤 Account</label>
            <select id="admin-account" class="admin-input" style="max-width: 320px; padding: 10px; font-size: 16px;">
                ${accounts.map(account => html`
                    <option value="${account.name}" ${raw(account.name === selected ? 'selected' : '')}>${account.name} (📖 ${account.pokemonCount || 0})</option>`)}
            </select>
            <span class="admin-help-inline">Everything below is saved for this account only.</span>
        </div>`;
}

// `accounts` is the list from the server and `selected` the name the sections
// were rendered for. `banner` ({ text, color }) is an optional notice.
export function renderAdminPage(config, { accounts = [], selected = null, banner = null } = {}) {
    return toHtml(html`
        <style>${raw(ADMIN_CSS)}</style>
        <div class="admin">
            <div class="admin-header">
                <h1>⚙️ Admin Panel</h1>
                <a href="/" class="admin-back">← Back to Game</a>
            </div>
            ${banner ? html`<div class="admin-banner" style="background: ${banner.color};">${banner.text}</div>` : ''}
            ${accounts.length ? renderAccountPicker(accounts, selected) : ''}
            ${selected ? html`
                ${raw(renderMinigamesSection(config))}
                ${raw(renderEmojiWordsSection(config))}
                ${raw(renderWeightsSection(config))}
                ${raw(renderPokemonSection())}` : ''}
        </div>`);
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

async function renderFor(name, accounts, banner) {
    let config = {};
    let selected = null;
    if (name) {
        try {
            await login(name, { remember: false });
            resetConfigCache();
            config = await getConfig();
            selected = name;
            const url = new URL(window.location.href);
            url.searchParams.set(USER_PARAM, name);
            window.history.replaceState({}, document.title, url);
        } catch (error) {
            console.error('Admin: could not open account', error);
            banner = { text: `❌ Could not open ${name}: ${error.message}`, color: '#f44336' };
        }
    }

    document.body.innerHTML = renderAdminPage(config, { accounts, selected, banner });

    const root = document.body;
    const picker = root.querySelector('#admin-account');
    if (picker) {
        picker.addEventListener('change', () => renderFor(picker.value, accounts, null));
    }
    if (!selected) return;
    mountMinigamesSection(root);
    mountEmojiWordsSection(root);
    mountWeightsSection(root);
    mountPokemonSection(root);
}
