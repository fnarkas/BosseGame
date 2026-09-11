// Every image and audio file the game can load, as pure data.
//
// BootScene loads the small "always needed" set up front. Everything else is
// loaded on demand (see lazyLoad.js): a Pokemon's artwork and name when it is
// encountered, and a minigame's audio pack when the wheel lands on it. That
// keeps the iPad from holding 151 decoded textures and ~900 decoded sound
// buffers in memory for a session that will use a handful of them.

import { getAvailablePokemon, POKEMON_DATA } from './pokemonData.js';
import { getAllWords, getAllSentences } from './speechVocabulary.js';
import { SPELLING_WORDS } from './spellingWords.js';
import { getAllVowelWords } from './vowelLengthPairs.js';
import { DEFAULT_EMOJI_WORD_DICTIONARY } from './emojiWordDictionary.js';
import { MINIGAMES } from './minigameRegistry.js';

const asset = (key, url) => ({ key, url });

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export function bootImages() {
    const list = [
        asset('coin-tiny', 'coin-tiny.png'),
        asset('treasure-chest', 'treasure-chest.png'),
        asset('dice-icon', 'dice-icon-small.png'),
        asset('pokedex-icon', 'pokedex-icon-small.png'),
        asset('store-icon', 'store-icon-small.png'),
        // Optimized 128x128 pokeball sprites
        asset('pokeball_poke-ball', 'pokeball_sprites/poke-ball-small.png'),
        asset('pokeball_great-ball', 'pokeball_sprites/great-ball-small.png'),
        asset('pokeball_ultra-ball', 'pokeball_sprites/ultra-ball-small.png'),
        asset('pokeball_legendary-ball', 'pokeball_sprites/legendary-ball.png'),
        // Tiny 64x64 pokeball sprites for the inventory HUD
        asset('pokeball_poke-ball-tiny', 'pokeball_sprites/poke-ball-tiny.png'),
        asset('pokeball_great-ball-tiny', 'pokeball_sprites/great-ball-tiny.png'),
        asset('pokeball_ultra-ball-tiny', 'pokeball_sprites/ultra-ball-tiny.png'),
        asset('pokeball_legendary-ball-tiny', 'pokeball_sprites/legendary-ball-tiny.png')
    ];
    // Type icons (IDs 1-18), circular versions without text
    for (let typeId = 1; typeId <= 18; typeId++) {
        list.push(asset(`type_${typeId}`, `type_icons_circular/${typeId}.png`));
    }
    // Minigame icons for the wheel. Modes sharing a slice share an icon key.
    const seen = new Set();
    for (const game of MINIGAMES) {
        if (seen.has(game.icon)) continue;
        seen.add(game.icon);
        list.push(asset(game.icon, game.iconFile));
    }
    return list;
}

export function pokemonImageAsset(pokemonOrId) {
    const pokemon = typeof pokemonOrId === 'object' ? pokemonOrId : POKEMON_DATA.find(p => p.id === pokemonOrId);
    if (!pokemon) return null;
    return asset(`pokemon_${pokemon.id}`, `pokemon_images/${pokemon.filename}`);
}

export function pokemonAudioAsset(pokemonOrId) {
    const pokemon = typeof pokemonOrId === 'object' ? pokemonOrId : POKEMON_DATA.find(p => p.id === pokemonOrId);
    if (!pokemon) return null;
    const file = `${pokemon.id.toString().padStart(3, '0')}_${pokemon.name.toLowerCase().replace('-', '')}.mp3`;
    return asset(`pokemon_audio_${pokemon.id}`, `pokemon_audio/${file}`);
}

export function allPokemonAssets() {
    const images = [];
    const audio = [];
    for (const pokemon of getAvailablePokemon()) {
        images.push(pokemonImageAsset(pokemon));
        audio.push(pokemonAudioAsset(pokemon));
    }
    return { images, audio };
}

// ---------------------------------------------------------------------------
// Audio packs
// ---------------------------------------------------------------------------

export const AUDIO_PACKS = {
    // Swedish letters a-z, å, ä, ö (files are lowercase)
    letters: () => 'abcdefghijklmnopqrstuvwxyzåäö'.split('').map(l => asset(`letter_audio_${l}`, `letter_audio/${l}.mp3`)),

    // 0-99 individually, plus the hundreds 100-1000 for stitching (245 = "200" + "45")
    numbers: () => {
        const list = [];
        for (let n = 0; n <= 99; n++) list.push(asset(`number_audio_${n}`, `number_audio/${n}.mp3`));
        for (const n of [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) list.push(asset(`number_audio_${n}`, `number_audio/${n}.mp3`));
        return list;
    },

    directions: () => ['hoger', 'vanster'].map(d => asset(`direction_audio_${d}`, `direction_audio/${d}.mp3`)),

    math: () => [asset('math_audio_ganger', 'math_audio/ganger.mp3')],

    // Isolated long/short vowel sounds
    vowels: () => {
        const list = [];
        for (const v of ['a', 'e', 'i', 'o', 'u', 'y', 'å', 'ä', 'ö']) {
            for (const length of ['long', 'short']) list.push(asset(`vowel_audio_${v}_${length}`, `vowel_audio/${v}_${length}.mp3`));
        }
        return list;
    },

    // Every spoken word: vocabulary, sentence words, spelling pool, vowel pairs,
    // and the emoji-word dictionary (spoken on reveal in the picture games)
    words: () => {
        const words = new Set();
        getAllWords().forEach(w => words.add(w.word.toLowerCase()));
        getAllSentences().forEach(s => s.sentence.split(' ').forEach(w => words.add(w.toLowerCase())));
        SPELLING_WORDS.forEach(w => words.add(w.toLowerCase()));
        getAllVowelWords().forEach(w => words.add(w.toLowerCase()));
        DEFAULT_EMOJI_WORD_DICTIONARY.forEach(e => words.add(e.word.toLowerCase()));
        return [...words].map(w => asset(`word_audio_${w}`, `word_audio/${w}.mp3`));
    },

    days: () => [
        [1, 'mandag'], [2, 'tisdag'], [3, 'onsdag'], [4, 'torsdag'], [5, 'fredag'], [6, 'lordag'], [7, 'sondag']
    ].map(([n, name]) => asset(`day_${n}_${name}`, `day_audio/day_${n}_${name}.mp3`)),

    shapedir: () => {
        const list = ['hoger', 'vanster'].map(d => asset(`shapedir_prefix_${d}`, `shapedir_audio/shapedir_prefix_${d}.mp3`));
        for (const color of ['blue', 'red', 'yellow', 'green', 'orange', 'purple']) {
            for (const shape of ['circle', 'square', 'triangle', 'star']) {
                list.push(asset(`shapedir_${color}_${shape}`, `shapedir_audio/shapedir_${color}_${shape}.mp3`));
            }
        }
        return list;
    },

    clock: () => {
        const list = [];
        for (let h = 1; h <= 12; h++) {
            const hh = h.toString().padStart(2, '0');
            list.push(asset(`clock_audio_${h}`, `clock_audio/klockan_${hh}.mp3`));
            list.push(asset(`clock_audio_${h}_30`, `clock_audio/klockan_${hh}_30.mp3`));
        }
        return list;
    },

    piano: () => [
        'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
        'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
        'C5'
    ].map(note => asset(`piano-${note}`, `piano_audio/${encodeURIComponent(`${note}.mp3`)}`))
};

// Packs small and common enough to load at boot. Everything else is fetched
// the first time a mode (or the Pokedex) needs it.
export const BOOT_AUDIO_PACKS = ['letters', 'numbers', 'directions', 'math'];

export function audioPack(name) {
    const pack = AUDIO_PACKS[name];
    if (!pack) {
        console.warn(`Unknown audio pack "${name}"`);
        return [];
    }
    return pack();
}

export function audioPacks(names) {
    return names.flatMap(audioPack);
}

export function allAudioAssets() {
    return Object.keys(AUDIO_PACKS).flatMap(audioPack);
}
