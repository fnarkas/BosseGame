// Game-wide reactions to state pulled from the server while playing
// (account.js live sync). Scenes handle their own HUDs; this covers the
// things that live outside any one scene.
//
//   pokemonCaughtList  -> the registry copy MainGameScene spawns from
//   minigameConfig     -> the Pokemon pool size (the config cache itself is
//                         dropped by account.js, so the wheel, the modes and
//                         the catching scene re-read it on their next entry)

import { onRemoteChange } from './account.js';
import { CAUGHT_POKEMON_KEY, getCaughtPokemonList } from './caughtPokemon.js';
import { CONFIG_OVERRIDE_KEY } from './minigameConfig.js';
import { applyPokedexConfig } from './pokemonPool.js';

// `game` needs only a Phaser-style `registry` with get/set. Returns an
// unsubscribe function.
export function bindLiveUpdates(game) {
    return onRemoteChange((keys) => {
        if (keys.includes(CAUGHT_POKEMON_KEY)) {
            game.registry.set('caughtPokemon', getCaughtPokemonList());
        }
        if (keys.includes(CONFIG_OVERRIDE_KEY)) {
            applyPokedexConfig().catch(error => console.warn('Live update: pokedex config failed', error));
        }
    });
}
