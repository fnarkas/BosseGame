// "Try a game": one link per minigame (plus the main game, the random wheel
// and the store), so a parent can open any mode directly and see what the
// child sees. This used to be the /games page; the links are the same debug
// routes (/addition, /letters, ...) and every entry comes from the registry.
// Games open in a new tab as this device's own player, so the admin panel
// stays put.

import { MINIGAMES } from '../../minigameRegistry.js';
import { html, toHtml } from '../html.js';

export const GAME_LINKS = [
    { path: '/', name: '🎯 Main game', icon: null },
    { path: '/pokeballs', name: '🎲 Random mix', icon: null },
    { path: '/store', name: '🛒 Store', icon: null },
    ...MINIGAMES.map(game => ({ path: game.path, name: game.name, icon: game.iconFile }))
];

export function renderGamesSection() {
    return toHtml(html`
        <div class="admin-section" id="admin-games">
            <h2>🕹️ Try a game</h2>
            <p class="admin-lead">Open any game directly, the way the child gets it, in a new tab. The first three are the normal entry points; the rest start one minigame on repeat.</p>
            <div class="admin-grid admin-games-grid">
                ${GAME_LINKS.map(link => html`
                    <a class="admin-game-link" href="${link.path}" target="_blank" rel="noopener" data-game-link="${link.path}">
                        ${link.icon ? html`<img src="${link.icon}" alt="" width="48" height="48" loading="lazy" decoding="async">` : ''}
                        <span>${link.name}</span>
                    </a>`)}
            </div>
        </div>`);
}
