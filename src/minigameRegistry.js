// Single source of truth for every minigame in the pokeball scene.
//
// Adding a minigame is one entry here (plus its class, icon and tests). From
// this list the rest of the game derives:
//   - the debug route (/letters etc.) and the /games menu       (main.js)
//   - the forced-mode registry value ('letter-only')             (main.js, PokeballGameScene)
//   - the weighted random pick and the class-name restore map    (PokeballGameScene)
//   - the wheel slices, colours and icons                        (minigameWheel.js, BootScene)
//   - the default weights and the admin panel's probability form (minigameWheel.js, main.js)
//
// Fields:
//   key           weight key in public/config/minigames.json (and the admin form)
//   Mode          the game-mode class
//   path          debug URL that forces this mode
//   forced        the registry value stored in 'pokeballGameMode' for that URL
//   name          label for the /games menu and admin panel (never shown to the child)
//   icon          texture key of the 256x256 icon
//   iconFile      file under public/ for that icon
//   color         slice colour on the wheel
//   defaultWeight probability weight used when the config omits the key
//   slice         optional: modes sharing a slice name share one wheel slice
//                 (listening/reading pairs). Defaults to `key`.
//   legendary     optional: fixed coin reward from config, no streak, treasure chest
//   audio         optional: audio packs (assetManifest.js) loaded before the mode starts

import { LetterListeningMode } from './pokeballGameModes/LetterListeningMode.js';
import { WordEmojiMatchMode } from './pokeballGameModes/WordEmojiMatchMode.js';
import { EmojiWordMatchMode } from './pokeballGameModes/EmojiWordMatchMode.js';
import { LeftRightMode } from './pokeballGameModes/LeftRightMode.js';
import { LetterDragMatchMode } from './pokeballGameModes/LetterDragMatchMode.js';
import { InitialSoundMode } from './pokeballGameModes/InitialSoundMode.js';
import { SpeechRecognitionMode } from './pokeballGameModes/SpeechRecognitionMode.js';
import { NumberListeningMode } from './pokeballGameModes/NumberListeningMode.js';
import { NumberReadingMode } from './pokeballGameModes/NumberReadingMode.js';
import { WordSpellingMode } from './pokeballGameModes/WordSpellingMode.js';
import { LegendaryAlphabetMatchMode } from './pokeballGameModes/LegendaryAlphabetMatchMode.js';
import { LegendaryNumbersMode } from './pokeballGameModes/LegendaryNumbersMode.js';
import { DayMatchMode } from './pokeballGameModes/DayMatchMode.js';
import { AdditionMode } from './pokeballGameModes/AdditionMode.js';
import { MultiplicationMode } from './pokeballGameModes/MultiplicationMode.js';
import { VowelLengthMode } from './pokeballGameModes/VowelLengthMode.js';
import { VowelSoundsMode } from './pokeballGameModes/VowelSoundsMode.js';
import { VowelSortMode } from './pokeballGameModes/VowelSortMode.js';
import { NumberBondsMode } from './pokeballGameModes/NumberBondsMode.js';
import { ShapeDirectionsMode } from './pokeballGameModes/ShapeDirectionsMode.js';
import { ClockListeningMode } from './pokeballGameModes/ClockListeningMode.js';
import { ClockReadingMode } from './pokeballGameModes/ClockReadingMode.js';
import { PianoLearningMode } from './pokeballGameModes/PianoLearningMode.js';
import { SpeedReadingMode } from './pokeballGameModes/SpeedReadingMode.js';

export const MINIGAMES = [
    { key: 'letterListening',   Mode: LetterListeningMode,        path: '/letters',          forced: 'letter-only',             name: '🔊 Letter Listening',       icon: 'game-mode-letter',            iconFile: 'minigame_icons/letter_listening.png',   color: 0xFF6B6B, defaultWeight: 10 },
    { key: 'wordEmoji',         Mode: WordEmojiMatchMode,         path: '/words',            forced: 'word-emoji-only',         name: '📝 Word-Emoji Match',       icon: 'game-mode-word',              iconFile: 'minigame_icons/word_emoji_match.png',   color: 0x4ECDC4, defaultWeight: 10, audio: ['words'] },
    { key: 'emojiWord',         Mode: EmojiWordMatchMode,         path: '/emojiword',        forced: 'emojiword-only',          name: '📖 Emoji-Word Match',       icon: 'game-mode-emojiword',         iconFile: 'minigame_icons/emoji_word_match.png',   color: 0xFFE66D, defaultWeight: 10, audio: ['words'] },
    { key: 'leftRight',         Mode: LeftRightMode,              path: '/directions',       forced: 'directions-only',         name: '⬅️➡️ Directions',           icon: 'game-mode-directions',        iconFile: 'minigame_icons/left_right.png',         color: 0x95E1D3, defaultWeight: 10 },
    { key: 'initialSound',      Mode: InitialSoundMode,           path: '/initialsound',     forced: 'initialsound-only',       name: '🔤🍎 Första bokstaven',     icon: 'game-mode-initialsound',      iconFile: 'minigame_icons/initial_sound.png',      color: 0xFF7043, defaultWeight: 10, audio: ['words'] },
    { key: 'letterDragMatch',   Mode: LetterDragMatchMode,        path: '/lettermatch',      forced: 'lettermatch-only',        name: '🔤 Letter Match',           icon: 'game-mode-lettermatch',       iconFile: 'minigame_icons/letter_drag_match.png',  color: 0xA78BFA, defaultWeight: 10 },
    { key: 'speechRecognition', Mode: SpeechRecognitionMode,      path: '/speech',           forced: 'speech-only',             name: '🎤 Speech Reading',         icon: 'game-mode-speech',            iconFile: 'minigame_icons/speech_recognition.png', color: 0xFF8C42, defaultWeight: 10, audio: ['words'] },
    { key: 'numberListening',   Mode: NumberListeningMode,        path: '/numbers',          forced: 'numbers-only',            name: '🔢 Number Listening',       icon: 'game-mode-numbers',           iconFile: 'minigame_icons/number_listening.png',   color: 0x26A69A, defaultWeight: 10, slice: 'numbers' },
    { key: 'numberReading',     Mode: NumberReadingMode,          path: '/numberreading',    forced: 'numberreading-only',      name: '👀🔢 Number Reading',       icon: 'game-mode-numbers',           iconFile: 'minigame_icons/number_listening.png',   color: 0x26A69A, defaultWeight: 10, slice: 'numbers' },
    { key: 'wordSpelling',      Mode: WordSpellingMode,           path: '/wordspelling',     forced: 'wordspelling-only',       name: '⌨️ Word Spelling',          icon: 'game-mode-spelling',          iconFile: 'minigame_icons/word_spelling.png',      color: 0xFFC107, defaultWeight: 40, audio: ['words'] },
    { key: 'legendary',         Mode: LegendaryAlphabetMatchMode, path: '/legendary',        forced: 'legendary-only',          name: '👑 Legendary Challenge',    icon: 'game-mode-legendary',         iconFile: 'minigame_icons/legendary_alphabet.png', color: 0xFFD700, defaultWeight: 10, legendary: true },
    { key: 'legendaryNumbers',  Mode: LegendaryNumbersMode,       path: '/legendarynumbers', forced: 'legendary-numbers-only',  name: '🔢👑 Legendary Numbers',    icon: 'game-mode-legendary-numbers', iconFile: 'minigame_icons/legendary_numbers.png',  color: 0x00BCD4, defaultWeight: 10, legendary: true },
    { key: 'dayMatch',          Mode: DayMatchMode,               path: '/dayofweek',        forced: 'dayofweek-only',          name: '📅 Day of Week',            icon: 'game-mode-dayofweek',         iconFile: 'minigame_icons/day_of_week.png',        color: 0xE91E63, defaultWeight: 10, audio: ['days'] },
    { key: 'addition',          Mode: AdditionMode,               path: '/addition',         forced: 'addition-only',           name: '➕ Addition',               icon: 'game-mode-addition',          iconFile: 'minigame_icons/addition.png',           color: 0x4CAF50, defaultWeight: 10 },
    { key: 'multiplication',    Mode: MultiplicationMode,         path: '/multiplication',   forced: 'multiplication-only',     name: '✖️ Multiplikation',         icon: 'game-mode-multiplication',    iconFile: 'minigame_icons/multiplication.png',     color: 0x5C6BC0, defaultWeight: 10 },
    { key: 'vowelLength',       Mode: VowelLengthMode,            path: '/vowellength',      forced: 'vowellength-only',        name: '🔤 Lång och kort vokal',    icon: 'game-mode-vowellength',       iconFile: 'minigame_icons/vowel_length.png',       color: 0x00ACC1, defaultWeight: 10, audio: ['words', 'vowels'] },
    { key: 'vowelSounds',       Mode: VowelSoundsMode,            path: '/vowelsounds',      forced: 'vowelsounds-only',        name: '🔊 Lång eller kort?',       icon: 'game-mode-vowelsounds',       iconFile: 'minigame_icons/vowel_sounds.png',       color: 0x8D6E63, defaultWeight: 10, audio: ['words', 'vowels'] },
    { key: 'vowelSort',         Mode: VowelSortMode,              path: '/vowelsort',        forced: 'vowelsort-only',          name: '🧺 Kort eller lång? (sortera)', icon: 'game-mode-vowelsort',     iconFile: 'minigame_icons/vowel_sort.png',         color: 0x00897B, defaultWeight: 10, audio: ['vowels'] },
    { key: 'numberBonds',       Mode: NumberBondsMode,            path: '/numberbonds',      forced: 'numberbonds-only',        name: '🤝 Tiokompisar',            icon: 'game-mode-numberbonds',       iconFile: 'minigame_icons/number_bonds.png',       color: 0x7CB342, defaultWeight: 10 },
    { key: 'shapeDirections',   Mode: ShapeDirectionsMode,        path: '/shapedirections',  forced: 'shapedirections-only',    name: '🔷➡️ Shape Directions',     icon: 'game-mode-shapedirections',   iconFile: 'minigame_icons/shape_directions.png',   color: 0xFF5722, defaultWeight: 10, audio: ['shapedir'] },
    { key: 'clockListening',    Mode: ClockListeningMode,         path: '/clocklistening',   forced: 'clocklistening-only',     name: '🕐🔊 Clock Listening',      icon: 'game-mode-clock',             iconFile: 'minigame_icons/clock.png',              color: 0x9C27B0, defaultWeight: 10, audio: ['clock'], slice: 'clock' },
    { key: 'clockReading',      Mode: ClockReadingMode,           path: '/clockreading',     forced: 'clockreading-only',       name: '🕐👀 Clock Reading',        icon: 'game-mode-clock',             iconFile: 'minigame_icons/clock.png',              color: 0x9C27B0, defaultWeight: 10, audio: ['clock'], slice: 'clock' },
    { key: 'pianoLearning',     Mode: PianoLearningMode,          path: '/piano',            forced: 'piano-only',              name: '🎹 Piano Learning',         icon: 'game-mode-piano',             iconFile: 'minigame_icons/piano_mode.png',         color: 0x9b59b6, defaultWeight: 3, audio: ['piano'] },
    { key: 'speedReading',      Mode: SpeedReadingMode,           path: '/speedreading',     forced: 'speedreading-only',       name: '📖⏱️ Speed Reading',        icon: 'game-mode-speedreading',      iconFile: 'minigame_icons/speed_reading.png',      color: 0x3498DB, defaultWeight: 10, audio: ['words'] }
];

// Lookups ------------------------------------------------------------------

export function getMinigameByKey(key) {
    return MINIGAMES.find(g => g.key === key) || null;
}

export function getMinigameByForced(forced) {
    return MINIGAMES.find(g => g.forced === forced) || null;
}

export function getMinigameByPath(path) {
    return MINIGAMES.find(g => g.path === path || g.path + '/' === path) || null;
}

// Entry for a mode class or an instance of it (matched by constructor name so
// it also works for subclasses and for the name stored by minigameSession).
export function getMinigameForMode(modeOrClassName) {
    const className = typeof modeOrClassName === 'string'
        ? modeOrClassName
        : modeOrClassName && modeOrClassName.constructor && modeOrClassName.constructor.name;
    return MINIGAMES.find(g => g.Mode.name === className) || null;
}

export function isLegendaryMode(mode) {
    const entry = getMinigameForMode(mode);
    return !!(entry && entry.legendary);
}

// Weighted random pick over the registry. `weights` maps key -> weight; modes
// with weight 0 (or a missing key) are never picked. Falls back to word
// spelling when every weight is 0 so the scene can always start something.
export function pickWeightedMinigame(weights, random = Math.random) {
    const candidates = MINIGAMES.filter(g => (weights[g.key] || 0) > 0);
    if (candidates.length === 0) {
        console.warn('All minigame weights are 0, defaulting to Word Spelling');
        return getMinigameByKey('wordSpelling');
    }
    const total = candidates.reduce((sum, g) => sum + weights[g.key], 0);
    let roll = random() * total;
    for (const g of candidates) {
        roll -= weights[g.key];
        if (roll < 0) return g;
    }
    return candidates[candidates.length - 1];
}
