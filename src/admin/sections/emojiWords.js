// "Emoji-Word Dictionary": the letter filter toggle, the word text case (saved
// to the config file), the add-word form with the emoji reference, and the
// grouped word list with remove / reset. Words and emoji are user input and
// go through the escaping template before reaching innerHTML.

import {
    getEmojiWordDictionary, getLetterFilterEnabled, setLetterFilterEnabled,
    addEmojiWord, removeEmojiWord, resetEmojiWordDictionary
} from '../../emojiWordDictionary.js';
import { EMOJI_PALETTE } from '../emojiPalette.js';
import { saveConfig, isConfigSaveAvailable } from '../configApi.js';
import { html, toHtml, flash, MESSAGE_COLORS } from '../html.js';

export const TEXT_CASE_OPTIONS = [
    { value: 'uppercase', label: 'UPPERCASE' },
    { value: 'titlecase', label: 'Titlecase' },
    { value: 'lowercase', label: 'lowercase' }
];

// Data ------------------------------------------------------------------------

// Dictionary entries grouped by first letter, letters sorted.
export function groupWordsByLetter(dictionary) {
    const byLetter = new Map();
    for (const item of dictionary) {
        if (!byLetter.has(item.letter)) byLetter.set(item.letter, []);
        byLetter.get(item.letter).push(item);
    }
    return Array.from(byLetter.keys()).sort().map(letter => ({ letter, words: byLetter.get(letter) }));
}

export function textCaseFromConfig(config) {
    const value = config && config.emojiWord && config.emojiWord.textCase;
    return TEXT_CASE_OPTIONS.some(option => option.value === value) ? value : 'uppercase';
}

// Markup ---------------------------------------------------------------------

function renderWordList(dictionary) {
    return toHtml(html`${groupWordsByLetter(dictionary).map(group => html`
        <div style="margin-bottom: 20px;">
            <div class="admin-word-letter">${group.letter} (${group.words.length} words)</div>
            ${group.words.map(item => html`
                <div class="admin-word-row">
                    <div class="admin-word-row-main">
                        <span class="admin-word-emoji">${item.emoji}</span>
                        <span class="admin-word-text">${item.word}</span>
                        <span class="admin-word-key">(${item.letter})</span>
                    </div>
                    <button type="button" class="admin-btn admin-btn-red admin-btn-xs" data-remove-word="${item.id}">🗑️ Remove</button>
                </div>`)}
        </div>`)}`);
}

function renderEmojiPicker() {
    return html`${EMOJI_PALETTE.map(category => html`
        <div>
            <div class="admin-emoji-cat-title">${category.title}</div>
            <div class="admin-emoji-cat">
                ${category.emojis.map(emoji => html`<span class="admin-emoji" data-emoji="${emoji}" title="${emoji}">${emoji}</span>`)}
            </div>
        </div>`)}`;
}

export function renderEmojiWordsSection(config) {
    const textCase = textCaseFromConfig(config);
    return toHtml(html`
        <div class="admin-section" id="admin-emoji-words">
            <h2>📚 Emoji-Word Dictionary</h2>
            <p class="admin-lead">Manage words for emoji-word matching games (/emojiword and /words).</p>

            <div class="admin-card" style="margin-bottom: 20px;">
                <div class="admin-card-head">
                    <h3>Letter Filtering</h3>
                    <label class="admin-toggle-label">
                        <span>Only show words from same letter:</span>
                        <input type="checkbox" id="letter-filter-toggle" class="admin-checkbox" style="margin: 0;">
                    </label>
                </div>
                <div class="admin-tip">
                    When enabled, all 5 words in each round will start with the same letter (e.g., all B words: BIL, BOLL, BOK, BLOMMA, BANAN)
                </div>
            </div>

            <div class="admin-card" style="margin-bottom: 20px;">
                <div style="margin-bottom: 15px;"><h3 style="margin: 0;">Text Case</h3></div>
                <div class="admin-field">
                    <label class="admin-label" for="text-case-select">Word display format:</label>
                    <select id="text-case-select" class="admin-input admin-input-select" style="cursor: pointer;">
                        ${TEXT_CASE_OPTIONS.map(option => html`<option value="${option.value}" ${option.value === textCase ? html`selected` : ''}>${option.label}</option>`)}
                    </select>
                </div>
                <div class="admin-tip admin-tip-warm">
                    Controls how words appear in Word-Emoji and Emoji-Word matching games
                </div>
                <button type="button" id="text-case-save" class="admin-btn admin-btn-green">💾 Save Text Case</button>
                <div id="text-case-message" class="admin-message"></div>
            </div>

            <div class="admin-card">
                <h3>Add New Word</h3>
                <div class="admin-word-form">
                    <input type="text" id="new-word" placeholder="Word (e.g., ÄPPLE)" style="text-transform: uppercase;">
                    <input type="text" id="new-emoji" placeholder="Emoji (e.g., 🍎)">
                    <input type="text" id="new-letter" placeholder="Letter (e.g., Ä)" maxlength="1" style="text-transform: uppercase;">
                    <button type="button" id="add-word" class="admin-btn admin-btn-green admin-btn-sm">➕ Add</button>
                </div>
                <div id="add-word-message" style="color: #4CAF50; font-size: 14px; min-height: 1.2em;"></div>

                <div class="admin-emoji-picker-box">
                    <button type="button" id="emoji-picker-toggle" class="admin-btn admin-btn-blue admin-btn-sm" style="margin-bottom: 10px;">😀 Show Emoji Reference</button>
                    <div id="emoji-picker" hidden>
                        <div class="admin-help" style="margin: 0 0 10px 0;">Click any emoji to copy it to the form:</div>
                        <div class="admin-emoji-grid">${renderEmojiPicker()}</div>
                    </div>
                </div>
            </div>

            <div class="admin-card" style="margin-bottom: 0;">
                <div class="admin-card-head">
                    <h3>Word List (<span id="word-count">0</span> words)</h3>
                    <button type="button" id="reset-dictionary" class="admin-btn admin-btn-orange admin-btn-sm">🔄 Reset to Defaults</button>
                </div>
                <div id="emoji-word-list" class="admin-word-list"></div>
            </div>
        </div>`);
}

// Behaviour --------------------------------------------------------------------

export function mountEmojiWordsSection(root) {
    const list = root.querySelector('#emoji-word-list');
    const count = root.querySelector('#word-count');
    const addMessage = root.querySelector('#add-word-message');
    const filterToggle = root.querySelector('#letter-filter-toggle');
    const wordInput = root.querySelector('#new-word');
    const emojiInput = root.querySelector('#new-emoji');
    const letterInput = root.querySelector('#new-letter');

    const refresh = () => {
        const dictionary = getEmojiWordDictionary();
        filterToggle.checked = getLetterFilterEnabled();
        count.textContent = dictionary.length;
        list.innerHTML = renderWordList(dictionary);
    };

    filterToggle.addEventListener('change', () => {
        setLetterFilterEnabled(filterToggle.checked);
        flash(addMessage, filterToggle.checked ? '✓ Letter filtering enabled' : '✓ Letter filtering disabled', MESSAGE_COLORS.ok, 2000);
    });

    const textCaseSave = root.querySelector('#text-case-save');
    const textCaseMessage = root.querySelector('#text-case-message');
    textCaseSave.disabled = !isConfigSaveAvailable();
    textCaseSave.addEventListener('click', async () => {
        const textCase = root.querySelector('#text-case-select').value;
        flash(textCaseMessage, '⏳ Saving...', MESSAGE_COLORS.busy, 0);
        try {
            await saveConfig({ emojiWord: { textCase } });
            flash(textCaseMessage, '✓ Text case saved to minigames.json! All devices will use this setting.', MESSAGE_COLORS.ok);
        } catch (error) {
            console.error('Failed to save emoji-word config:', error);
            flash(textCaseMessage, '❌ Failed to save config. Check console for details.', MESSAGE_COLORS.error);
        }
    });

    root.querySelector('#add-word').addEventListener('click', () => {
        const word = wordInput.value.trim().toUpperCase();
        const emoji = emojiInput.value.trim();
        const letter = letterInput.value.trim().toUpperCase();
        if (!word || !emoji || !letter) {
            flash(addMessage, '⚠️ All fields are required', MESSAGE_COLORS.error, 0);
            return;
        }
        addEmojiWord(word, emoji, letter);
        wordInput.value = '';
        emojiInput.value = '';
        letterInput.value = '';
        flash(addMessage, `✓ Added: ${emoji} ${word}`, MESSAGE_COLORS.ok, 2000);
        refresh();
    });

    const picker = root.querySelector('#emoji-picker');
    root.querySelector('#emoji-picker-toggle').addEventListener('click', () => {
        picker.hidden = !picker.hidden;
    });
    picker.addEventListener('click', (event) => {
        const target = event.target.closest('[data-emoji]');
        if (!target) return;
        emojiInput.value = target.dataset.emoji;
        emojiInput.focus();
    });

    list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-remove-word]');
        if (!button) return;
        if (!confirm('Remove this word?')) return;
        removeEmojiWord(parseInt(button.dataset.removeWord, 10));
        refresh();
    });

    root.querySelector('#reset-dictionary').addEventListener('click', () => {
        if (!confirm('Reset dictionary to defaults? This will remove all custom words.')) return;
        resetEmojiWordDictionary();
        refresh();
    });

    refresh();
}
