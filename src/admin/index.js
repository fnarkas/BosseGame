// The /admin page. Loads the config once, applies a ?sync= import of the
// caught list, renders the sections and wires their events. Nothing here is
// shown to the child; it is the parent's control panel.

import { getConfig, isConfigSaveAvailable, SAVE_UNAVAILABLE_MESSAGE } from './configApi.js';
import { ADMIN_CSS, html, raw, toHtml } from './html.js';
import { renderMinigamesSection, mountMinigamesSection } from './sections/minigames.js';
import { renderEmojiWordsSection, mountEmojiWordsSection } from './sections/emojiWords.js';
import { renderWeightsSection, mountWeightsSection } from './sections/weights.js';
import { renderPokemonSection, mountPokemonSection, importSyncFromUrl } from './sections/pokemon.js';

export function renderAdminPage(config, syncMessage) {
    return toHtml(html`
        <style>${raw(ADMIN_CSS)}</style>
        <div class="admin">
            <div class="admin-header">
                <h1>⚙️ Admin Panel</h1>
                <a href="/" class="admin-back">← Back to Game</a>
            </div>
            ${syncMessage ? html`<div class="admin-banner" style="background: ${syncMessage.color};">${syncMessage.text}</div>` : ''}
            ${isConfigSaveAvailable() ? '' : html`<div class="admin-banner" style="background: #FF9800;">⚠️ ${SAVE_UNAVAILABLE_MESSAGE}</div>`}
            ${raw(renderMinigamesSection(config))}
            ${raw(renderEmojiWordsSection(config))}
            ${raw(renderWeightsSection(config))}
            ${raw(renderPokemonSection())}
        </div>`);
}

export async function showAdminPage() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.style.display = 'none';

    const config = await getConfig();
    const syncMessage = importSyncFromUrl();

    document.body.innerHTML = renderAdminPage(config, syncMessage);
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';

    const root = document.body;
    mountMinigamesSection(root);
    mountEmojiWordsSection(root);
    mountWeightsSection(root);
    mountPokemonSection(root);
}
