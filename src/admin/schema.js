// Declarative description of the per-minigame config panels in the admin
// panel, plus the pure (DOM-free) helpers that turn a config file into form
// values and form values back into a config section.
//
// One entry per panel:
//   id           value of the panel selector (and the DOM id suffix)
//   key          section key in public/config/minigames.json
//   option       label in the panel selector
//   title        heading of the panel
//   saveLabel    text on the Save button
//   fields       [{ id, key, label, type, default, ... }] see below
//   fixed        extra constant keys written with every save (optional)
//   about        { title, body, warn } information box under the fields (optional)
//   preview      (values) => html string shown in a preview box (optional)
//
// Field properties:
//   id           unique field id across all sections (used for the DOM id)
//   key          property name inside the config section (defaults to id)
//   type         'text' | 'number' | 'checkbox' | 'select'
//   default      value used when the config omits the key
//   options      [{ value, label }] for selects
//   min/max/step number constraints
//   help         help text (plain text, or { html } for markup with <code>)
//   helpInline   show the help beside the input instead of under it
//   width        input width override (CSS)
//   preview      (value) => { error: string|null, html: string } live preview
//                under the input; a non-null error also blocks Save.

import { parseLetterRange } from '../letterData.js';
import { parseNumberRange } from '../utils/parseNumberRange.js';
import { parseClusterRules, markHardParts, DEFAULT_HARD_CLUSTERS } from '../hardSpellings.js';
import { SPELLING_WORDS } from '../spellingWords.js';
import { escapeHtml, html, toHtml } from './html.js';

// Previews -----------------------------------------------------------------

function chipList(items, chipClass, summary) {
    return toHtml(html`
        <div style="margin-bottom: 8px; font-weight: bold; color: #333;">${summary}</div>
        <div class="admin-chips">${items.map(item => html`<span class="admin-chip ${chipClass}">${item}</span>`)}</div>
    `);
}

function plural(count, word) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function lettersPreview(value) {
    const letters = parseLetterRange(String(value ?? ''));
    if (letters === null || letters.length === 0) {
        return { error: '❌ Invalid format! Please use format like: a-z,B,C,Ä,Ö', html: '' };
    }
    return { error: null, html: chipList(letters, 'admin-chip-letter', `✓ ${plural(letters.length, 'letter')} configured`) };
}

export function numbersPreview(value) {
    const numbers = parseNumberRange(value);
    if (numbers.length === 0) {
        return { error: '❌ Invalid format! Please use format like: 0,1,3,4-9,15-20', html: '' };
    }
    return { error: null, html: chipList(numbers, '', `✓ ${plural(numbers.length, 'number')} configured`) };
}

export function legendaryNumbersPreview(value) {
    const numbers = parseNumberRange(value);
    if (numbers.length === 0) {
        return { error: '❌ Invalid format! Please use format like: 0-20,30,40,50-59', html: '' };
    }
    if (numbers.some(n => n < 0 || n > 99)) {
        return { error: '❌ All numbers must be between 0 and 99', html: '' };
    }
    const summary = `✓ ${numbers.length} active number${numbers.length === 1 ? '' : 's'} (${100 - numbers.length} inactive)`;
    return { error: null, html: chipList(numbers, '', summary) };
}

export function pokemonCatchingPreview(values) {
    const name = values.nameCase === 'uppercase' ? 'PIKACHU' : 'pikachu';
    const keyboard = values.alphabetCase === 'uppercase' ? 'A B C D E' : 'a b c d e';
    return toHtml(html`
        <div class="admin-note-title">Preview:</div>
        <div class="admin-note-body">
            Pokemon name: <span class="admin-mono">${name}</span><br>
            Keyboard: <span class="admin-mono">${keyboard}</span>
        </div>
    `);
}

export function hardClustersPreview(value) {
    const rules = parseClusterRules(String(value ?? ''));
    if (rules.length === 0) {
        return { error: '❌ No valid rules. Example: ' + DEFAULT_HARD_CLUSTERS.join(','), html: '' };
    }
    const marked = SPELLING_WORDS.map(word => markHardParts(word, rules)).filter(m => m.includes('['));
    const summary = `✓ ${rules.length} rule${rules.length === 1 ? '' : 's'} — ${marked.length} of ${SPELLING_WORDS.length} words get letters filled in (brackets):`;
    return { error: null, html: chipList(marked, 'admin-chip-letter', summary) };
}

// Field shorthands ---------------------------------------------------------

const number = (id, label, def, min, max, help, extra = {}) =>
    ({ id, label, type: 'number', default: def, min, max, help, ...extra });
const checkbox = (id, label, def, help, extra = {}) =>
    ({ id, label, type: 'checkbox', default: def, help, ...extra });
const hearts = (id, def, max, help) =>
    number(id, 'Max Errors (Hearts):', def, 1, max, help, { key: 'maxErrors' });

// The schema -----------------------------------------------------------------

export const MINIGAME_CONFIG_SCHEMA = [
    {
        id: 'letters',
        key: 'letters',
        option: '🔊 Letter Listening',
        title: 'Letter Listening Configuration',
        saveLabel: '💾 Save Letter Config',
        fields: [
            {
                id: 'letters', label: 'Available Letters:', type: 'text', default: 'A-Z,Å,Ä,Ö',
                help: { html: 'Format: <code>a-z,B,C,Ä,Ö</code> (uppercase and lowercase letters are different)<br>' +
                    'Examples: <code>A-Z</code> (all uppercase), <code>a-z</code> (all lowercase), <code>A,B,C,a,b,c</code> (mix)' },
                preview: lettersPreview
            }
        ]
    },
    {
        id: 'numbers',
        key: 'numbers',
        option: '🔢 Number Listening',
        title: 'Number Listening Configuration',
        saveLabel: '💾 Save Number Config',
        fields: [
            number('required', 'Numbers to Clear Before Gift:', 1, 1, 25,
                'How many correct answers needed to get the Pokemon', { width: '100px' }),
            {
                id: 'numbers', label: 'Available Numbers:', type: 'text', default: '10-99',
                help: { html: 'Format: <code>0,1,3,4-9,15-20</code> (ranges and individual numbers separated by commas)' },
                preview: numbersPreview
            }
        ]
    },
    {
        id: 'pokemon-catching',
        key: 'pokemonCatching',
        option: '🎯 Pokemon Catching (Letter Match)',
        title: 'Pokemon Catching Configuration',
        saveLabel: '💾 Save Catching Config',
        fields: [
            {
                id: 'nameCase', label: 'Pokemon Name Case:', type: 'select', default: 'uppercase',
                options: [
                    { value: 'lowercase', label: 'Lowercase (pikachu)' },
                    { value: 'uppercase', label: 'Uppercase (PIKACHU)' }
                ],
                help: 'How the Pokemon name is displayed'
            },
            {
                id: 'alphabetCase', label: 'Keyboard Letter Case:', type: 'select', default: 'lowercase',
                options: [
                    { value: 'lowercase', label: 'Lowercase (a b c)' },
                    { value: 'uppercase', label: 'Uppercase (A B C)' }
                ],
                help: 'How the letter buttons are displayed'
            }
        ],
        preview: pokemonCatchingPreview
    },
    {
        id: 'legendary',
        key: 'legendary',
        option: '👑 Legendary Challenge',
        title: 'Legendary Challenge Configuration',
        saveLabel: '💾 Save Legendary Config',
        fields: [
            number('legendaryCoinReward', 'Coin Reward:', 100, 1, 10000,
                '🎁 Coins earned for completing the challenge', { key: 'coinReward' }),
            hearts('legendaryMaxErrors', 3, 10, '❤️ Number of mistakes allowed before game over')
        ],
        about: {
            warn: true,
            title: 'ℹ️ About Legendary Challenge:',
            body: 'Players must match all uppercase letters (A-Z,Å,Ä,Ö) with their lowercase counterparts.<br>' +
                'Drag and drop all 29 letters to complete the challenge and earn the coin reward.<br>' +
                'Each incorrect match loses one heart. Running out of hearts restarts the challenge.'
        }
    },
    {
        id: 'legendary-numbers',
        key: 'legendaryNumbers',
        option: '🔢👑 Legendary Numbers',
        title: 'Legendary Numbers Configuration',
        saveLabel: '💾 Save Legendary Numbers Config',
        fields: [
            {
                id: 'legendaryNumbers', key: 'numbers', label: 'Active Numbers:', type: 'text', default: '0-99',
                help: { html: 'Format: <code>0-20,30,40,50-59</code> (ranges and individual numbers separated by commas)<br>' +
                    'Example: <code>0-20,30,40,50,60,70,80,90</code> for easier gameplay' },
                preview: legendaryNumbersPreview
            },
            number('legendaryNumbersCoinReward', 'Coin Reward:', 200, 1, 10000,
                '🎁 Coins earned for completing all active numbers', { key: 'coinReward' }),
            hearts('legendaryNumbersMaxErrors', 5, 20, '❤️ Number of mistakes allowed before game over')
        ],
        about: {
            title: 'ℹ️ About Legendary Numbers:',
            body: 'Players must correctly identify all active numbers by dragging digits to form each number.<br>' +
                'Numbers are played via audio. Speaker button (🔊) replays the current number.<br>' +
                'Progress is tracked with a visual matrix showing cleared numbers (green) and remaining numbers (gray).<br>' +
                'Inactive numbers are shown in dark gray and are not part of the challenge.<br>' +
                'Each wrong answer loses one heart. Running out of hearts restarts from scratch.'
        }
    },
    {
        id: 'word-spelling',
        key: 'wordSpelling',
        option: '⌨️ Word Spelling',
        title: 'Word Spelling Configuration',
        saveLabel: '💾 Save Word Spelling Config',
        fields: [
            number('requiredWords', 'Words Required for Gift:', 3, 1, 10,
                'How many words player must spell correctly to earn coins'),
            number('spellingWordCount', 'Size of Word Pool:', 447, 5, 447,
                'Draw from the N most common words (5–447). Lower it to drill the very commonest.', { key: 'wordCount' }),
            checkbox('prefillHard', 'Prefill hard letter groups', false,
                'Fill in the parts of a word that cannot be sounded out (sj/tj-sounds, ck, ng ...) so the child only spells the rest. They show in blue.'),
            {
                id: 'hardClusters', label: 'Hard letter groups:', type: 'text', default: DEFAULT_HARD_CLUSTERS.join(','),
                help: { html: 'Comma separated. <code>ck</code> anywhere; <code>sk*</code> only before a soft vowel (e i y ä ö); ' +
                    '<code>^k*</code> only at the start of the word and before a soft vowel; <code>^hj</code> only at the start. ' +
                    'Add <code>rs,rt,rd,rn,rl</code> for the r-blends (först, bort, barn) if those are hard too.' },
                preview: hardClustersPreview
            },
            checkbox('prefillDoubles', 'Also prefill double consonants', false,
                'Fill in the second letter of tt, ll, mm, nn, ss ... (boll → bol[l]). Applies only when prefilling is on.'),
            {
                id: 'keyboardLetters', label: 'Keyboard shows:', type: 'select', default: 'all',
                options: [
                    { value: 'all', label: 'The whole alphabet (A–Ö)' },
                    { value: 'word', label: 'Only the letters in the word' }
                ],
                help: 'With only the word\'s letters shown, the child picks the order rather than hunting through 29 keys.'
            }
        ],
        about: {
            title: 'ℹ️ About Word Spelling:',
            body: 'Players hear Swedish words and must spell them using a letter keyboard.<br>' +
                'The words are the 447 most common Swedish words, in frequency order. Words that would ' +
                'teach the wrong thing are filtered out — subtitle junk, spoken forms (nåt, dom, va), ' +
                'words that cannot be sounded out (och, är, jag, mig, säger) and silent opening ' +
                'consonants (hjälp, gjorde, själv). See generate_spelling_words.py to change the list.<br>' +
                'With "Prefill hard letter groups" on, the letters the rules mark are filled in (blue) and the child spells the rest.<br>' +
                'Each word allows 2 mistakes (❤️❤️) before showing the correct answer and restarting.<br>' +
                'Progress is shown with balls (○ ○ ○ → 🎁) representing completed words.<br>' +
                'Running out of hearts resets word progress back to 0.'
        }
    },
    {
        id: 'dayofweek',
        key: 'dayMatch',
        option: '📅 Day of Week',
        title: 'Day of Week Configuration',
        saveLabel: '💾 Save Day of Week Config',
        fields: [
            hearts('dayMatchMaxErrors', 3, 10, '❤️ Number of mistakes allowed before restarting')
        ],
        about: {
            title: 'ℹ️ About Day of Week:',
            body: 'Players drag Swedish day names (Måndag, Tisdag, etc.) to their matching numbers (1-7).<br>' +
                'Each wrong match loses a heart (❤️). When all hearts are lost, the game restarts with a new scrambled layout.'
        }
    },
    {
        id: 'addition',
        key: 'addition',
        option: '➕ Addition',
        title: 'Addition Configuration',
        saveLabel: '💾 Save Addition Config',
        fields: [
            number('numberOfTerms', 'Number of Terms:', 2, 2, 5,
                'How many numbers to add together (e.g., 2 = a+b, 3 = a+b+c)'),
            number('maxSum', 'Maximum Sum:', 99, 10, 999,
                'The highest possible answer (e.g., 99 for numbers under 100)'),
            checkbox('onlyOneMultiDigit', 'Only One Multi-Digit Term', true,
                { html: 'When checked, only one number can have multiple digits (e.g., 45 + 3 + 2 ✓, but not 45 + 23 ✗)<br>' +
                    'Makes problems easier to solve mentally' })
        ],
        about: {
            title: 'ℹ️ About Addition:',
            body: 'Players solve simple addition problems and select the correct answer from 4 choices.<br>' +
                'Each problem is randomly generated based on your settings.<br>' +
                'Progress is shown with balls (○ ○ ○ → 🎁). Players need 3 correct answers to earn a Pokemon.'
        }
    },
    {
        id: 'multiplication',
        key: 'multiplication',
        option: '✖️ Multiplication',
        title: 'Multiplication Configuration',
        saveLabel: '💾 Save Multiplication Config',
        fields: [
            {
                id: 'tables', label: 'Tables to Practise:', type: 'text', default: '2,5,10',
                help: 'Comma-separated, ranges allowed (e.g. "2,5,10" or "2-5"). The table is the group size.',
                helpInline: true, width: '300px', mono: false
            },
            number('maxFactor', 'Highest Factor:', 10, 2, 10,
                'How many groups at most, i.e. the number of rows in the array (2-10).'),
            number('multiplicationRequired', 'Correct Answers Needed:', 3, 1, 10,
                'Problems to solve before the reward. A miss does not reset progress.', { key: 'required' }),
            checkbox('showCommutativity', 'Show Commutativity', true,
                { html: 'After a correct answer the array rotates so 3 × 10 becomes 10 × 3 with the same balls.<br>' +
                    'Turn off to make each round about 1.3 seconds shorter.' })
        ],
        // The answer only has a tens and a ones slot, so the product cap is fixed.
        fixed: { maxProduct: 99 },
        about: {
            title: 'ℹ️ About Multiplication:',
            body: 'The problem is drawn as an array of pokeballs — 3 × 10 is 3 rows of 10 — so the answer can always be counted by hand.<br>' +
                'After every answer, right or wrong, the rows light up one at a time while the voice skip-counts (10, 20, 30).<br>' +
                'The answer is given by dragging digits into the tens and ones slots, as in Addition.<br>' +
                'Answers are capped below 100 because there are only two slots, so 10 × 10 never appears.'
        }
    },
    {
        id: 'numberbonds',
        key: 'numberBonds',
        option: '🤝 Number Bonds',
        title: 'Number Bonds Configuration',
        saveLabel: '💾 Save Number Bonds Config',
        fields: [
            number('sum', 'The Whole:', 10, 5, 20, '10 for tiokompisar. Raise it later for larger bonds (5–20).'),
            number('numberBondsDuration', 'Time Limit (seconds):', 60, 15, 180, 'How long the round lasts.',
                { key: 'durationSeconds', step: 5 }),
            number('targetCount', 'Answers for Full Reward:', 20, 5, 100,
                'Reaching this many pays the max coins and ends the round.'),
            number('numberBondsMaxCoins', 'Max Coins:', 100, 1, 200,
                'Reward at the target. Fewer answers pay less, on an accelerating curve.', { key: 'maxCoins' }),
            checkbox('showTenFrame', 'Show the Ten-Frame', true,
                'Ten slots, some filled with pokeballs, the rest empty — the answer can be counted ' +
                'instead of recalled. Turn it off once the facts are memorised, so the round becomes ' +
                'pure recall and the score rewards speed.')
        ],
        about: {
            title: 'ℹ️ About Number Bonds:',
            body: 'How many more to reach ten? The child taps the answer on a 0–10 keypad, and the empty ' +
                'slots fill in to complete the frame.<br>' +
                'Scored on time, exactly like Speed Reading: coins = maxCoins × (answers / target)², so ' +
                'the last answers are worth far more than the first. A wrong tap costs nothing but the ' +
                'seconds it took — the same challenge stays up.'
        }
    },
    {
        id: 'vowellength',
        key: 'vowelLength',
        option: '🔤 Vowel Length',
        title: 'Vowel Length Configuration',
        saveLabel: '💾 Save Vowel Length Config',
        fields: [
            number('vowelLengthRequired', 'Correct Answers Needed:', 3, 1, 9,
                'Tasks per round. The two task types alternate: spelling, consonants, spelling, …', { key: 'required' }),
            checkbox('vowelLengthListenHelp', 'Listen Help on the Answer Cards', true,
                'Puts a 🔊 badge on each answer card, so the child can hear both options and compare ' +
                'before choosing. That turns task 1 into a comparison rather than a memory test — ' +
                'the right scaffold at first, but it makes it easier. Turn off once the rule has landed.',
                { key: 'showListenHelp' })
        ],
        about: {
            title: 'ℹ️ About Vowel Length:',
            body: 'Swedish has complementary quantity: in a stressed syllable either the vowel is long and the ' +
                'following consonant short (tak = ta:k), or the vowel is short and the consonant long ' +
                '(tack = tak:). The doubled consonant in writing marks which one it is.<br><br>' +
                '27 minimal pairs, one pair per round, seen from two angles in turn:<br>' +
                '1. Hear the word → pick the written form (glas / glass)<br>' +
                '2. Hear the word → pick one or two consonants (s / ss)<br><br>' +
                'After every answer the word is spelled out and the vowel visibly stretches or snaps together. ' +
                'The vowel letter is tappable and plays that vowel sound alone, long or short. ' +
                'A miss does not reset progress. Edit the pairs in src/vowelLengthPairs.js, then run ' +
                'generate_vowel_audio.py.'
        }
    },
    {
        id: 'vowelsounds',
        key: 'vowelSounds',
        option: '🔊 Vowel Sounds (long or short?)',
        title: 'Vowel Sounds Configuration',
        saveLabel: '💾 Save Vowel Sounds Config',
        fields: [
            {
                id: 'stage', label: 'Stage:', type: 'select', default: 'sounds',
                options: [
                    { value: 'sounds', label: '1. Hear a vowel → long or short?' },
                    { value: 'letters', label: '2. Long or short → one or two letters?' },
                    { value: 'mixed', label: 'Mixed: alternate 1 and 2' }
                ],
                help: 'Start on stage 1. Move to stage 2 once the child reliably tells long from short by ear.',
                width: 'auto'
            },
            number('vowelSoundsRequired', 'Correct Answers Needed:', 4, 1, 9,
                'Tasks per round. A miss does not reset progress.', { key: 'required' }),
            checkbox('vowelSoundsListenHelp', 'Listen Help on the Answer Cards', true,
                'Puts a 🔊 badge on each answer card that plays the long or short version of the same ' +
                'vowel, so the child can compare before choosing. Turn off once the difference is heard ' +
                'without help.', { key: 'showListenHelp' })
        ],
        about: {
            title: 'ℹ️ About Vowel Sounds:',
            body: 'The two steps that come before Vowel Length, drilled on their own.<br><br>' +
                'Stage 1: a vowel is played on its own (a, e, i, o, u, y, å, ä, ö - long or short). ' +
                'The child picks the wide letter over a long bar (lååång) or the narrow letter over a ' +
                'short bar (kort). The reveal shows the letter stretching or snapping while the sound ' +
                'plays again.<br><br>' +
                'Stage 2: the vowel is shown already long or short, and played. The child picks one ' +
                'consonant (T) or two (TT). The reveal spells out a real word from the minimal-pair list ' +
                '(mat / matt) and reads it aloud. Only plain doublings are used here; ck pairs are left ' +
                'for Vowel Length.<br><br>' +
                'Long is always the left card and short the right, in both stages, so the position ' +
                'itself becomes a cue that carries over.'
        }
    },
    {
        id: 'piano',
        key: 'pianoLearning',
        option: '🎹 Piano Learning',
        title: 'Piano Learning Configuration',
        saveLabel: '💾 Save Piano Config',
        fields: [
            number('measuresPerPattern', 'Measures Per Pattern:', 1, 1, 8,
                'How many measures to play per pattern (1 = easier, 4 = harder)'),
            checkbox('showNotes', 'Show Notes on Keys', true,
                { html: 'When checked, circles will appear on piano keys showing which notes to play.<br>' +
                    'Multiple circles stack vertically if a note is played multiple times.' })
        ],
        about: {
            title: 'ℹ️ About Piano Learning:',
            body: 'Players learn simple melodies by listening and repeating patterns.<br>' +
                'Click 🔊 to hear the pattern, then play it back on the piano keyboard.<br>' +
                'Progress is shown with balls (○ ○ ○) representing completed patterns.<br>' +
                'When all patterns are complete, the full melody plays and rewards are given.'
        }
    },
    {
        id: 'speedreading',
        key: 'speedReading',
        option: '📖⏱️ Speed Reading',
        title: 'Speed Reading Configuration',
        saveLabel: '💾 Save Speed Reading Config',
        fields: [
            number('speedReadingWordCount', 'Number of Words in Play:', 100, 10, 1000,
                'How many of the most common Swedish words to use (10–1000). Start easy with 100.',
                { key: 'wordCount', step: 10 }),
            number('speedReadingDuration', 'Time Limit (seconds):', 60, 15, 180, 'How long the round lasts.',
                { key: 'durationSeconds', step: 5 }),
            number('targetWords', 'Words for Full Reward:', 20, 5, 100,
                'Reading this many words pays the max coins and ends the round.'),
            number('speedReadingMaxCoins', 'Max Coins:', 100, 1, 200,
                'Reward at the target. Fewer words pay less, on an accelerating curve.', { key: 'maxCoins' })
        ],
        about: {
            title: 'ℹ️ About Speed Reading:',
            body: 'One word shows at a time and the microphone listens continuously.<br>' +
                'The child reads as many of the most common Swedish words as possible before time runs out.<br>' +
                'The coin reward accelerates with the number of words read: coins = maxCoins × (words / target)², so the last words are worth far more than the first. Hitting the target pays the max and ends the round.<br>' +
                'A progress bar tracks words read toward the target and a timer bar shows time left.<br>' +
                'The word list comes from the 1000 most common Swedish words (profanity filtered).'
        }
    }
];

// Data helpers (no DOM) ------------------------------------------------------

export function fieldKey(field) {
    return field.key || field.id;
}

export function getSection(id) {
    return MINIGAME_CONFIG_SCHEMA.find(section => section.id === id || section.key === id) || null;
}

// { fieldId: default } for a section.
export function sectionDefaults(section) {
    return Object.fromEntries(section.fields.map(field => [field.id, field.default]));
}

// Coerce a stored value to the field's type; anything unusable yields the default.
export function coerceFieldValue(field, value) {
    if (value === null || value === undefined) return field.default;
    switch (field.type) {
        case 'number': {
            const n = typeof value === 'number' ? value : parseFloat(value);
            return Number.isFinite(n) ? n : field.default;
        }
        case 'checkbox':
            if (typeof value === 'boolean') return value;
            if (value === 'true') return true;
            if (value === 'false') return false;
            return field.default;
        case 'select': {
            const str = String(value);
            return field.options.some(option => option.value === str) ? str : field.default;
        }
        default:
            return String(value);
    }
}

// { fieldId: value } for a section, read from a full config object with the
// field defaults filling every gap.
export function readSectionValues(section, config) {
    const stored = (config && typeof config === 'object' && config[section.key]) || {};
    const values = {};
    for (const field of section.fields) {
        values[field.id] = coerceFieldValue(field, stored[fieldKey(field)]);
    }
    return values;
}

// Turn form values ({ fieldId: rawValue }) into the object stored under the
// section key. Numbers are parsed, checkboxes become booleans, text is kept as
// typed, and `fixed` constants are appended.
export function serializeSection(section, values) {
    const out = {};
    for (const field of section.fields) {
        const value = values[field.id];
        switch (field.type) {
            case 'number': {
                const n = typeof value === 'number' ? value : parseInt(value, 10);
                out[fieldKey(field)] = Number.isFinite(n) ? n : field.default;
                break;
            }
            case 'checkbox':
                out[fieldKey(field)] = !!value;
                break;
            default:
                out[fieldKey(field)] = String(value ?? field.default);
        }
    }
    return { ...out, ...(section.fixed || {}) };
}

// First validation error for the given values, or null when Save may proceed.
export function validateSection(section, values) {
    for (const field of section.fields) {
        if (typeof field.preview !== 'function') continue;
        const result = field.preview(values[field.id]);
        if (result && result.error) return { fieldId: field.id, error: result.error };
    }
    return null;
}

// The save patch for a section: { [section.key]: serialized }.
export function sectionPatch(section, values) {
    return { [section.key]: serializeSection(section, values) };
}

// Help text as safe markup: plain strings are escaped, { html } is trusted.
export function helpHtml(help) {
    if (!help) return '';
    if (typeof help === 'object' && help.html) return help.html;
    return escapeHtml(help);
}
