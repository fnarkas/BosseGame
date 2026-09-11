// Login screen: pick who is playing.
//
// Shown before the game boots unless this device already has an account name
// saved. Existing accounts are big tappable cards with an avatar and the size
// of the Pokedex, so a child can find their own without reading. Typing a new
// name creates a new account.

import { getCurrentAccount, listAccounts, login } from './account.js';

const AVATARS = ['🦊', '🐢', '🐉', '🐭', '🐱', '🦋', '🐸', '🦄', '🐼', '🦁', '🐧', '🐙'];

function avatarFor(name) {
    let hash = 0;
    for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return AVATARS[hash % AVATARS.length];
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// Resolves with the account name once the player is logged in. Never rejects:
// a server that is down keeps the screen up with a retry button.
export async function ensureLoggedIn() {
    const remembered = getCurrentAccount();
    if (remembered) {
        try {
            const { name } = await login(remembered);
            return name;
        } catch (error) {
            console.warn('login: could not resume account, showing login screen', error);
        }
    }
    return showLoginScreen();
}

export function showLoginScreen() {
    return new Promise(resolve => {
        const overlay = el('div', 'login-overlay');
        overlay.id = 'login-overlay';
        const panel = el('div', 'login-panel');
        overlay.appendChild(panel);

        panel.appendChild(el('h1', 'login-title', '👤 Vem spelar?'));
        const status = el('div', 'login-status');
        panel.appendChild(status);
        const grid = el('div', 'login-grid');
        panel.appendChild(grid);

        const form = el('form', 'login-form');
        const input = el('input', 'login-input');
        input.type = 'text';
        input.maxLength = 40;
        input.placeholder = 'Nytt namn';
        input.autocomplete = 'off';
        input.setAttribute('autocapitalize', 'words');
        const submit = el('button', 'login-button login-button-ok', '✅');
        submit.type = 'submit';
        submit.setAttribute('aria-label', 'Spela');
        form.appendChild(input);
        form.appendChild(submit);
        panel.appendChild(form);

        let busy = false;
        const setBusy = (value) => {
            busy = value;
            overlay.classList.toggle('login-busy', value);
        };
        const fail = (error) => {
            console.warn('login:', error);
            status.textContent = '⚠️';
            status.classList.add('login-status-error');
            setBusy(false);
        };
        const finish = (name) => {
            overlay.remove();
            resolve(name);
        };

        const attempt = async (fn) => {
            if (busy) return;
            setBusy(true);
            status.textContent = '⏳';
            status.classList.remove('login-status-error');
            try {
                const { name } = await fn();
                finish(name);
            } catch (error) {
                fail(error);
            }
        };

        form.addEventListener('submit', event => {
            event.preventDefault();
            const name = input.value.trim();
            if (name) {
                attempt(() => login(name));
                return;
            }
            input.focus();
            input.classList.remove('login-shake');
            void input.offsetWidth; // restart the animation
            input.classList.add('login-shake');
        });

        const renderAccounts = async () => {
            grid.textContent = '';
            status.textContent = '⏳';
            status.classList.remove('login-status-error');
            try {
                const accounts = await listAccounts();
                status.textContent = '';
                for (const account of accounts) {
                    const card = el('button', 'login-card');
                    card.type = 'button';
                    card.appendChild(el('div', 'login-card-avatar', avatarFor(account.name)));
                    card.appendChild(el('div', 'login-card-name', account.name));
                    card.appendChild(el('div', 'login-card-count', `📖 ${account.pokemonCount || 0}`));
                    card.addEventListener('click', () => attempt(() => login(account.name)));
                    grid.appendChild(card);
                }
            } catch (error) {
                fail(error);
                const retry = el('button', 'login-button login-button-retry', '🔄');
                retry.type = 'button';
                retry.addEventListener('click', renderAccounts);
                grid.appendChild(retry);
            }
        };

        document.body.appendChild(overlay);
        renderAccounts();
    });
}
