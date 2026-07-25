import Phaser from 'phaser';
import { POKEMON_DATA, getAvailablePokemon } from './pokemonData.js';
import { BootScene } from './scenes/BootScene.js';
import { MainGameScene } from './scenes/MainGameScene.js';
import { PokedexScene } from './scenes/PokedexScene.js';
import { PokeballGameScene } from './scenes/PokeballGameScene.js';
import SettingsScene from './scenes/SettingsScene.js';
import { initPokedex, showPokedex } from './pokedex.js';
import { initPokemonCaughtPopup, showPokemonCaughtPopup } from './pokemonCaughtPopup.js';
import { initStore, openStore } from './store.js';
import { migrateOldInventory } from './inventory.js';
import { loadActiveMinigame } from './minigameSession.js';

// Make POKEMON_DATA globally available
window.POKEMON_DATA = POKEMON_DATA;

// Make showPokedex globally available for scenes
window.showPokedex = showPokedex;

// Make showPokemonCaughtPopup globally available for scenes
window.showPokemonCaughtPopup = showPokemonCaughtPopup;

// Make openStore globally available for scenes
window.openStore = openStore;

// Migrate old inventory before game starts
migrateOldInventory();

// Games Registry - Single source of truth for all minigames
const GAMES_REGISTRY = [
    { path: '/letters', name: '🔊 Letter Listening', mode: 'letter-only', scene: 'PokeballGameScene', weightKey: 'letterListening' },
    { path: '/words', name: '📝 Word-Emoji Match', mode: 'word-emoji-only', scene: 'PokeballGameScene', weightKey: 'wordEmoji' },
    { path: '/emojiword', name: '📖 Emoji-Word Match', mode: 'emojiword-only', scene: 'PokeballGameScene', weightKey: 'emojiWord' },
    { path: '/directions', name: '⬅️➡️ Directions', mode: 'directions-only', scene: 'PokeballGameScene', weightKey: 'leftRight' },
    { path: '/lettermatch', name: '🔤 Letter Match', mode: 'lettermatch-only', scene: 'PokeballGameScene', weightKey: 'letterDragMatch' },
    { path: '/speech', name: '🎤 Speech Reading', mode: 'speech-only', scene: 'PokeballGameScene', weightKey: 'speechRecognition' },
    { path: '/numbers', name: '🔢 Number Listening', mode: 'numbers-only', scene: 'PokeballGameScene', weightKey: 'numberListening' },
    { path: '/numberreading', name: '👀🔢 Number Reading', mode: 'numberreading-only', scene: 'PokeballGameScene', weightKey: 'numberReading' },
    { path: '/wordspelling', name: '⌨️ Word Spelling', mode: 'wordspelling-only', scene: 'PokeballGameScene', weightKey: 'wordSpelling' },
    { path: '/addition', name: '➕ Addition', mode: 'addition-only', scene: 'PokeballGameScene', weightKey: 'addition' },
    { path: '/shapedirections', name: '🔷➡️ Shape Directions', mode: 'shapedirections-only', scene: 'PokeballGameScene', weightKey: 'shapeDirections' },
    { path: '/clocklistening', name: '🕐🔊 Clock Listening', mode: 'clocklistening-only', scene: 'PokeballGameScene', weightKey: 'clockListening' },
    { path: '/clockreading', name: '🕐👀 Clock Reading', mode: 'clockreading-only', scene: 'PokeballGameScene', weightKey: 'clockReading' },
    { path: '/piano', name: '🎹 Piano Learning', mode: 'piano-only', scene: 'PokeballGameScene', weightKey: 'pianoLearning' },
    { path: '/legendary', name: '👑 Legendary Challenge', mode: 'legendary-only', scene: 'PokeballGameScene', weightKey: 'legendary' },
    { path: '/legendarynumbers', name: '🔢👑 Legendary Numbers', mode: 'legendary-numbers-only', scene: 'PokeballGameScene', weightKey: 'legendaryNumbers' },
    { path: '/dayofweek', name: '📅 Day of Week', mode: 'dayofweek-only', scene: 'PokeballGameScene', weightKey: 'dayMatch' },
    { path: '/pokeballs', name: '🎲 Random Mix', mode: null, scene: 'PokeballGameScene', weightKey: null }
];

// Detect URL path to determine game mode and routing
const path = window.location.pathname;
let answerMode;
let startScene = 'MainGameScene';
let pokeballGameMode = null;
let showStoreOnLoad = false;
let showGamesMenu = false;
let showAdmin = false;

// Check if path matches a game in the registry
const gameConfig = GAMES_REGISTRY.find(g => g.path === path || g.path + '/' === path);

if (gameConfig) {
    // Found a registered game
    answerMode = 'letter';
    startScene = gameConfig.scene;
    pokeballGameMode = gameConfig.mode;
    console.log(`Running ${gameConfig.name}`);
} else if (path === '/debug' || path === '/debug/') {
    answerMode = 'debug';
    console.log('Running in DEBUG mode');
} else if (path === '/store' || path === '/store/') {
    answerMode = 'letter';
    startScene = 'MainGameScene';
    showStoreOnLoad = true;
    console.log('Opening STORE');
} else if (path === '/games' || path === '/games/') {
    showGamesMenu = true;
    console.log('Showing GAMES MENU');
} else if (path === '/admin' || path === '/admin/') {
    showAdmin = true;
    console.log('Showing ADMIN PANEL');
} else if (path === '/reset' || path === '/reset/') {
    resetAllProgress();
} else {
    answerMode = 'letter';
    console.log('Running in LETTER MATCH mode');
}

// If a minigame was left unfinished, resume it on load instead of the main
// scene. This makes a reload return the player to the game they were in rather
// than letting them re-roll or back out. Explicit routes (a specific game,
// store, games menu, admin) take precedence and are left untouched.
if (startScene === 'MainGameScene' && !pokeballGameMode && !showStoreOnLoad && !showGamesMenu && !showAdmin) {
    if (loadActiveMinigame()) {
        startScene = 'PokeballGameScene';
        console.log('Resuming unfinished minigame');
    }
}

// Show games menu if /games route
if (showGamesMenu) {
    showGamesMenuPage();
} else if (showAdmin) {
    showAdminPage();
} else {
    // Main game configuration
    const config = {
        type: Phaser.AUTO,
        width: 1280,
        height: 900,
        parent: 'game-container',
        backgroundColor: '#87CEEB',
        scene: [BootScene, MainGameScene, PokedexScene, PokeballGameScene, SettingsScene],
        physics: {
            default: 'arcade',
            arcade: {
                debug: false
            }
        },
        callbacks: {
            preBoot: (game) => {
                // Set answer mode in registry before scenes start
                game.registry.set('answerMode', answerMode);
                game.registry.set('startScene', startScene);
                game.registry.set('pokeballGameMode', pokeballGameMode);
            }
        }
    };

    const game = new Phaser.Game(config);

    // Make game globally accessible for debug methods
    window.phaserGame = game;

    // Initialize Pokedex with game instance for audio access
    initPokedex(game);

    // Initialize Pokemon Caught Popup
    initPokemonCaughtPopup();

    // Initialize Store
    initStore();

    // Open store if /store route was accessed
    if (showStoreOnLoad) {
        openStore();
    }
}

function resetAllProgress() {
    // Clear all localStorage data
    localStorage.clear();

    console.log('All progress has been reset!');

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }

    const resetHTML = `
        <div style="font-family: Arial; max-width: 600px; margin: 80px auto; padding: 40px; text-align: center;">
            <h1 style="font-size: 80px; margin-bottom: 20px;">✅</h1>
            <h2 style="font-size: 36px; margin-bottom: 20px;">Progress Reset!</h2>
            <p style="font-size: 20px; color: #666; margin-bottom: 40px;">All Pokemon, pokeballs, and coins have been cleared.</p>
            <a href="/" style="display: inline-block; padding: 20px 40px; background: #4CAF50; color: white; border-radius: 10px; text-decoration: none; font-size: 24px;">Start Fresh</a>
        </div>
    `;

    document.body.innerHTML = resetHTML;
}

function showGamesMenuPage() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }

    // Auto-generate game links from registry
    const gamesHTML = GAMES_REGISTRY.map(game => `
        <a href="${game.path}" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px; text-align: center;">
            ${game.name}
        </a>
    `).join('');

    const menuHTML = `
        <div style="font-family: Arial; max-width: 1200px; margin: 20px auto; padding: 20px;">
            <h1 style="text-align: center; margin-bottom: 40px; font-size: 36px;">🎮 Games</h1>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                <a href="/" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px; text-align: center;">🎯 Main Game</a>
                ${gamesHTML}
                <a href="/store" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px; text-align: center;">🛒 Store</a>
            </div>
        </div>
    `;

    document.body.innerHTML = menuHTML;

    // Reset body style to allow scrolling
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
}

async function showAdminPage() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }

    // Load server config
    let serverConfig = {
        numbers: { required: 1, numbers: '10-99' },
        letters: { letters: 'A-Z,Å,Ä,Ö' },
        pokemonCatching: { nameCase: 'uppercase', alphabetCase: 'lowercase' }
    };
    try {
        const response = await fetch('/config/minigames.json');
        if (response.ok) {
            serverConfig = await response.json();
        }
    } catch (error) {
        console.warn('Failed to load server config, using defaults:', error);
    }

    // Check for sync parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const syncData = urlParams.get('sync');
    let syncMessage = null;

    if (syncData) {
        try {
            // Decode base64 data
            const jsonString = atob(syncData);
            const importedPokemon = JSON.parse(jsonString);

            // Validate data structure
            if (Array.isArray(importedPokemon)) {
                // Ensure all entries have proper format
                const validatedPokemon = importedPokemon.map(p => {
                    if (typeof p === 'number') {
                        // Old format - convert to new format
                        const pokemonData = POKEMON_DATA.find(pd => pd.id === p);
                        return {
                            id: p,
                            name: pokemonData ? pokemonData.name : 'Unknown',
                            caughtDate: new Date().toISOString()
                        };
                    } else if (p.id) {
                        // Already proper format
                        return p;
                    }
                    return null;
                }).filter(p => p !== null);

                // Merge with existing Pokemon instead of replacing
                const existingPokemon = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');
                const mergedMap = new Map();

                // Add existing Pokemon first (keeps original caught dates)
                existingPokemon.forEach(p => {
                    const id = p.id || p;
                    if (typeof p === 'object' && p.id) {
                        mergedMap.set(id, p);
                    } else if (typeof p === 'number') {
                        // Convert old format
                        const pokemonData = POKEMON_DATA.find(pd => pd.id === p);
                        mergedMap.set(id, {
                            id: id,
                            name: pokemonData ? pokemonData.name : 'Unknown',
                            caughtDate: new Date().toISOString()
                        });
                    }
                });

                // Track how many new Pokemon we're adding
                const existingCount = mergedMap.size;

                // Add imported Pokemon (only if not already exists)
                validatedPokemon.forEach(p => {
                    if (!mergedMap.has(p.id)) {
                        mergedMap.set(p.id, p);
                    }
                });

                const finalList = Array.from(mergedMap.values());
                const newCount = finalList.length - existingCount;

                // Save merged list to localStorage
                localStorage.setItem('pokemonCaughtList', JSON.stringify(finalList));

                syncMessage = {
                    text: '✓ Imported ' + newCount + ' new Pokemon! (Total: ' + finalList.length + ')',
                    color: '#4CAF50'
                };

                // Remove sync parameter from URL without reload
                const cleanURL = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanURL);
            } else {
                throw new Error('Invalid data format');
            }
        } catch (error) {
            console.error('Failed to import sync data:', error);
            syncMessage = {
                text: '❌ Failed to import Pokemon data. Invalid sync URL.',
                color: '#f44336'
            };

            // Remove invalid sync parameter
            const cleanURL = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanURL);
        }
    }

    // Load current caught Pokemon
    const caughtPokemon = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');

    // Generate Pokemon grid (Gen 1 only)
    const availablePokemon = getAvailablePokemon();
    const pokemonGrid = availablePokemon.map(pokemon => {
        // Handle both object format and plain ID format
        const isCaught = caughtPokemon.some(p => (p.id || p) === pokemon.id);
        return `
            <div style="display: flex; align-items: center; padding: 10px; background: ${isCaught ? '#e8f5e9' : '#fff'}; border-radius: 8px; border: 1px solid ${isCaught ? '#4CAF50' : '#ddd'};">
                <input type="checkbox"
                       id="pokemon-${pokemon.id}"
                       ${isCaught ? 'checked' : ''}
                       onchange="togglePokemon(${pokemon.id})"
                       style="width: 20px; height: 20px; margin-right: 15px; cursor: pointer;">
                <img src="pokemon_images/${pokemon.filename}"
                     alt="${pokemon.name}"
                     style="width: 60px; height: 60px; margin-right: 15px; object-fit: contain;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 16px;">#${pokemon.id} ${pokemon.name}</div>
                    <div style="color: #666; font-size: 14px;">${isCaught ? '✓ Caught' : 'Not caught'}</div>
                </div>
            </div>
        `;
    }).join('');

    // Load current minigame weights from config file
    const defaultWeights = {
        letterListening: 10,
        wordEmoji: 10,
        emojiWord: 10,
        leftRight: 10,
        letterDragMatch: 10,
        speechRecognition: 10,
        numberListening: 10,
        numberReading: 10,
        wordSpelling: 40,
        legendary: 10,
        legendaryNumbers: 10
    };

    // Try to load from config file, fall back to defaults
    let currentWeights = { ...defaultWeights };
    if (serverConfig.weights) {
        currentWeights = { ...defaultWeights, ...serverConfig.weights };
    }

    const adminHTML = `
        <div style="font-family: Arial; max-width: 1400px; margin: 20px auto; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h1 style="font-size: 36px; margin: 0;">⚙️ Admin Panel</h1>
                <a href="/" style="padding: 12px 24px; background: #2196F3; color: white; border-radius: 8px; text-decoration: none; font-size: 16px;">← Back to Game</a>
            </div>

            ${syncMessage ? `
            <div style="background: ${syncMessage.color}; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 18px; font-weight: bold;">
                ${syncMessage.text}
            </div>
            ` : ''}

            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h2 style="margin-top: 0;">Minigame Configuration</h2>
                <p style="color: #666; margin-bottom: 15px;">Configure settings for individual minigames.</p>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-weight: bold; margin-bottom: 5px;">Select Minigame:</label>
                    <select id="minigame-selector" onchange="switchMinigameConfig()" style="width: 100%; max-width: 400px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;">
                        <option value="letters">🔊 Letter Listening</option>
                        <option value="numbers">🔢 Number Listening</option>
                        <option value="pokemon-catching">🎯 Pokemon Catching (Letter Match)</option>
                        <option value="legendary">👑 Legendary Challenge</option>
                        <option value="legendary-numbers">🔢👑 Legendary Numbers</option>
                        <option value="word-spelling">⌨️ Word Spelling</option>
                        <option value="dayofweek">📅 Day of Week</option>
                        <option value="addition">➕ Addition</option>
                        <option value="piano">🎹 Piano Learning</option>
                    </select>
                </div>

                <div id="config-letters" style="display: block; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Letter Listening Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Available Letters:</label>
                        <input type="text" id="config-letters-list" value="${serverConfig.letters?.letters || 'A-Z,Å,Ä,Ö'}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace;">
                        <div style="color: #666; margin-top: 5px; font-size: 14px;">
                            Format: <code>a-z,B,C,Ä,Ö</code> (uppercase and lowercase letters are different)<br>
                            Examples: <code>A-Z</code> (all uppercase), <code>a-z</code> (all lowercase), <code>A,B,C,a,b,c</code> (mix)
                        </div>
                        <div id="letters-preview" style="margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px; min-height: 40px;"></div>
                        <div id="letters-error" style="margin-top: 10px; color: #f44336; font-weight: bold; display: none;"></div>
                    </div>

                    <button onclick="saveMinigameConfig('letters')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Letter Config</button>
                    <div id="config-letters-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div id="config-numbers" style="display: none; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Number Listening Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Numbers to Clear Before Gift:</label>
                        <input type="number" id="config-numbers-required" value="${serverConfig.numbers.required}" min="1" max="25" style="width: 100px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">How many correct answers needed to get the Pokemon</span>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Available Numbers:</label>
                        <input type="text" id="config-numbers-range" value="${serverConfig.numbers.numbers}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace;">
                        <div style="color: #666; margin-top: 5px; font-size: 14px;">
                            Format: <code>0,1,3,4-9,15-20</code> (ranges and individual numbers separated by commas)
                        </div>
                        <div id="numbers-preview" style="margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px; min-height: 40px;"></div>
                        <div id="numbers-error" style="margin-top: 10px; color: #f44336; font-weight: bold; display: none;"></div>
                    </div>

                    <button onclick="saveMinigameConfig('numbers')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Number Config</button>
                    <div id="config-numbers-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div id="config-pokemon-catching" style="display: none; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Pokemon Catching Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Pokemon Name Case:</label>
                        <select id="config-catching-namecase" style="width: 100%; max-width: 300px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            <option value="lowercase" ${serverConfig.pokemonCatching?.nameCase === 'lowercase' ? 'selected' : ''}>Lowercase (pikachu)</option>
                            <option value="uppercase" ${serverConfig.pokemonCatching?.nameCase === 'uppercase' || !serverConfig.pokemonCatching?.nameCase ? 'selected' : ''}>Uppercase (PIKACHU)</option>
                        </select>
                        <div style="color: #666; margin-top: 5px; font-size: 14px;">
                            How the Pokemon name is displayed
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Keyboard Letter Case:</label>
                        <select id="config-catching-alphabetcase" style="width: 100%; max-width: 300px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            <option value="lowercase" ${serverConfig.pokemonCatching?.alphabetCase === 'lowercase' || !serverConfig.pokemonCatching?.alphabetCase ? 'selected' : ''}>Lowercase (a b c)</option>
                            <option value="uppercase" ${serverConfig.pokemonCatching?.alphabetCase === 'uppercase' ? 'selected' : ''}>Uppercase (A B C)</option>
                        </select>
                        <div style="color: #666; margin-top: 5px; font-size: 14px;">
                            How the letter buttons are displayed
                        </div>
                    </div>

                    <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border: 1px solid #2196F3; margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">Preview:</div>
                        <div style="color: #666; font-size: 14px;">
                            Pokemon name: <span style="font-family: monospace; font-size: 16px; font-weight: bold;" id="preview-name-case">pikachu</span><br>
                            Keyboard: <span style="font-family: monospace; font-size: 16px; font-weight: bold;" id="preview-alphabet-case">A B C D E</span>
                        </div>
                    </div>

                    <button onclick="saveMinigameConfig('pokemon-catching')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Catching Config</button>
                    <div id="config-catching-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div id="config-legendary" style="display: none; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Legendary Challenge Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Coin Reward:</label>
                        <input type="number" id="config-legendary-coins" value="${serverConfig.legendary?.coinReward || 100}" min="1" max="10000" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">🎁 Coins earned for completing the challenge</span>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Max Errors (Hearts):</label>
                        <input type="number" id="config-legendary-errors" value="${serverConfig.legendary?.maxErrors || 3}" min="1" max="10" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">❤️ Number of mistakes allowed before game over</span>
                    </div>

                    <div style="padding: 15px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffc107; margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">ℹ️ About Legendary Challenge:</div>
                        <div style="color: #666; font-size: 14px;">
                            Players must match all uppercase letters (A-Z,Å,Ä,Ö) with their lowercase counterparts.<br>
                            Drag and drop all 29 letters to complete the challenge and earn the coin reward.<br>
                            Each incorrect match loses one heart. Running out of hearts restarts the challenge.
                        </div>
                    </div>

                    <button onclick="saveMinigameConfig('legendary')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Legendary Config</button>
                    <div id="config-legendary-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div id="config-legendary-numbers" style="display: none; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Legendary Numbers Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Active Numbers:</label>
                        <input type="text" id="config-legendary-numbers-range" value="${serverConfig.legendaryNumbers?.numbers || '0-99'}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace;">
                        <div style="color: #666; margin-top: 5px; font-size: 14px;">
                            Format: <code>0-20,30,40,50-59</code> (ranges and individual numbers separated by commas)<br>
                            Example: <code>0-20,30,40,50,60,70,80,90</code> for easier gameplay
                        </div>
                        <div id="legendary-numbers-preview" style="margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px; min-height: 40px;"></div>
                        <div id="legendary-numbers-error" style="margin-top: 10px; color: #f44336; font-weight: bold; display: none;"></div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Coin Reward:</label>
                        <input type="number" id="config-legendary-numbers-coins" value="${serverConfig.legendaryNumbers?.coinReward || 200}" min="1" max="10000" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">🎁 Coins earned for completing all active numbers</span>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Max Errors (Hearts):</label>
                        <input type="number" id="config-legendary-numbers-errors" value="${serverConfig.legendaryNumbers?.maxErrors || 5}" min="1" max="20" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">❤️ Number of mistakes allowed before game over</span>
                    </div>

                    <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border: 1px solid #2196F3; margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">ℹ️ About Legendary Numbers:</div>
                        <div style="color: #666; font-size: 14px;">
                            Players must correctly identify all active numbers by dragging digits to form each number.<br>
                            Numbers are played via audio. Speaker button (🔊) replays the current number.<br>
                            Progress is tracked with a visual matrix showing cleared numbers (green) and remaining numbers (gray).<br>
                            Inactive numbers are shown in dark gray and are not part of the challenge.<br>
                            Each wrong answer loses one heart. Running out of hearts restarts from scratch.
                        </div>
                    </div>

                    <button onclick="saveMinigameConfig('legendary-numbers')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Legendary Numbers Config</button>
                    <div id="config-legendary-numbers-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div id="config-word-spelling" style="display: none; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Word Spelling Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Words Required for Gift:</label>
                        <input type="number" id="config-wordspelling-required" value="${serverConfig.wordSpelling?.requiredWords || 3}" min="1" max="10" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">How many words player must spell correctly to earn coins</span>
                    </div>

                    <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border: 1px solid #2196F3; margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">ℹ️ About Word Spelling:</div>
                        <div style="color: #666; font-size: 14px;">
                            Players hear Swedish words and must spell them using a letter keyboard.<br>
                            Each word allows 2 mistakes (❤️❤️) before showing the correct answer and restarting.<br>
                            Progress is shown with balls (○ ○ ○ → 🎁) representing completed words.<br>
                            Running out of hearts resets word progress back to 0.
                        </div>
                    </div>

                    <button onclick="saveMinigameConfig('word-spelling')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Word Spelling Config</button>
                    <div id="config-wordspelling-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div id="config-dayofweek" style="display: none; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Day of Week Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Max Errors (Hearts):</label>
                        <input type="number" id="config-dayofweek-errors" value="${serverConfig.dayMatch?.maxErrors || 3}" min="1" max="10" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">❤️ Number of mistakes allowed before restarting</span>
                    </div>

                    <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border: 1px solid #2196F3; margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">ℹ️ About Day of Week:</div>
                        <div style="color: #666; font-size: 14px;">
                            Players drag Swedish day names (Måndag, Tisdag, etc.) to their matching numbers (1-7).<br>
                            Each wrong match loses a heart (❤️). When all hearts are lost, the game restarts with a new scrambled layout.
                        </div>
                    </div>

                    <button onclick="saveMinigameConfig('dayofweek')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Day of Week Config</button>
                    <div id="config-dayofweek-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div id="config-addition" style="display: none; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Addition Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Number of Terms:</label>
                        <input type="number" id="config-addition-terms" value="${serverConfig.addition?.numberOfTerms || 2}" min="2" max="5" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">How many numbers to add together (e.g., 2 = a+b, 3 = a+b+c)</span>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Maximum Sum:</label>
                        <input type="number" id="config-addition-maxsum" value="${serverConfig.addition?.maxSum || 99}" min="10" max="999" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">The highest possible answer (e.g., 99 for numbers under 100)</span>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="config-addition-onlyone" ${serverConfig.addition?.onlyOneMultiDigit !== false ? 'checked' : ''} style="width: 24px; height: 24px; margin-right: 10px; cursor: pointer;">
                            <span style="font-weight: bold;">Only One Multi-Digit Term</span>
                        </label>
                        <div style="color: #666; margin-top: 5px; font-size: 14px; margin-left: 34px;">
                            When checked, only one number can have multiple digits (e.g., 45 + 3 + 2 ✓, but not 45 + 23 ✗)<br>
                            Makes problems easier to solve mentally
                        </div>
                    </div>

                    <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border: 1px solid #2196F3; margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">ℹ️ About Addition:</div>
                        <div style="color: #666; font-size: 14px;">
                            Players solve simple addition problems and select the correct answer from 4 choices.<br>
                            Each problem is randomly generated based on your settings.<br>
                            Progress is shown with balls (○ ○ ○ → 🎁). Players need 3 correct answers to earn a Pokemon.
                        </div>
                    </div>

                    <button onclick="saveMinigameConfig('addition')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Addition Config</button>
                    <div id="config-addition-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div id="config-piano" style="display: none; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <h3 style="margin-top: 0;">Piano Learning Configuration</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Measures Per Pattern:</label>
                        <input type="number" id="config-piano-measures" value="${serverConfig.pianoLearning?.measuresPerPattern || 1}" min="1" max="8" style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="color: #666; margin-left: 10px;">How many measures to play per pattern (1 = easier, 4 = harder)</span>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="config-piano-shownotes" ${serverConfig.pianoLearning?.showNotes !== false ? 'checked' : ''} style="width: 24px; height: 24px; margin-right: 10px; cursor: pointer;">
                            <span style="font-weight: bold;">Show Notes on Keys</span>
                        </label>
                        <div style="color: #666; margin-top: 5px; font-size: 14px; margin-left: 34px;">
                            When checked, circles will appear on piano keys showing which notes to play.<br>
                            Multiple circles stack vertically if a note is played multiple times.
                        </div>
                    </div>

                    <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border: 1px solid #2196F3; margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">ℹ️ About Piano Learning:</div>
                        <div style="color: #666; font-size: 14px;">
                            Players learn simple melodies by listening and repeating patterns.<br>
                            Click 🔊 to hear the pattern, then play it back on the piano keyboard.<br>
                            Progress is shown with balls (○ ○ ○) representing completed patterns.<br>
                            When all patterns are complete, the full melody plays and rewards are given.
                        </div>
                    </div>

                    <button onclick="saveMinigameConfig('piano')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Piano Config</button>
                    <div id="config-piano-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>
            </div>

            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h2 style="margin-top: 0;">📚 Emoji-Word Dictionary</h2>
                <p style="color: #666; margin-bottom: 15px;">Manage words for emoji-word matching games (/emojiword and /words).</p>

                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Letter Filtering</h3>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <span>Only show words from same letter:</span>
                            <input type="checkbox" id="letter-filter-toggle" onchange="toggleLetterFilter()" style="width: 24px; height: 24px; cursor: pointer;">
                        </label>
                    </div>
                    <div style="color: #666; font-size: 14px; padding: 10px; background: #e3f2fd; border-radius: 4px;">
                        When enabled, all 5 words in each round will start with the same letter (e.g., all B words: BIL, BOLL, BOK, BLOMMA, BANAN)
                    </div>
                </div>

                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
                    <div style="margin-bottom: 15px;">
                        <h3 style="margin: 0;">Text Case</h3>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">Word display format:</label>
                        <select id="text-case-select" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 14px; width: 100%; max-width: 300px;">
                            <option value="uppercase" ${serverConfig.emojiWord?.textCase === 'uppercase' ? 'selected' : ''}>UPPERCASE</option>
                            <option value="titlecase" ${serverConfig.emojiWord?.textCase === 'titlecase' ? 'selected' : ''}>Titlecase</option>
                            <option value="lowercase" ${serverConfig.emojiWord?.textCase === 'lowercase' ? 'selected' : ''}>lowercase</option>
                        </select>
                    </div>
                    <div style="color: #666; font-size: 14px; padding: 10px; background: #fff3e0; border-radius: 4px; margin-bottom: 20px;">
                        Controls how words appear in Word-Emoji and Emoji-Word matching games
                    </div>
                    <button onclick="saveMinigameConfig('emoji-word')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Text Case</button>
                    <div id="config-emojiword-message" style="margin-top: 10px; color: #4CAF50; font-weight: bold;"></div>
                </div>

                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 15px;">
                    <h3 style="margin-top: 0;">Add New Word</h3>
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <input type="text" id="new-word" placeholder="Word (e.g., ÄPPLE)" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; text-transform: uppercase;">
                        <input type="text" id="new-emoji" placeholder="Emoji (e.g., 🍎)" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <input type="text" id="new-letter" placeholder="Letter (e.g., Ä)" maxlength="1" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; text-transform: uppercase;">
                        <button onclick="addEmojiWordEntry()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">➕ Add</button>
                    </div>
                    <div id="add-word-message" style="color: #4CAF50; font-size: 14px;"></div>

                    <div style="margin-top: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd;">
                        <button onclick="toggleEmojiPicker()" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 10px;">😀 Show Emoji Reference</button>
                        <div id="emoji-picker" style="display: none;">
                            <div style="color: #666; font-size: 14px; margin-bottom: 10px;">Click any emoji to copy it to the form:</div>
                            <div style="max-height: 300px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                                <!-- Animals -->
                                <div>
                                    <div style="font-weight: bold; margin-bottom: 5px; color: #2196F3;">🐾 Animals</div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                        ${['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🦔'].map(e => `<span onclick="selectEmoji('${e}')" style="font-size: 24px; cursor: pointer; padding: 4px;" title="${e}">${e}</span>`).join('')}
                                    </div>
                                </div>

                                <!-- Food -->
                                <div>
                                    <div style="font-weight: bold; margin-bottom: 5px; color: #2196F3;">🍎 Food & Drink</div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                        ${['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'].map(e => `<span onclick="selectEmoji('${e}')" style="font-size: 24px; cursor: pointer; padding: 4px;" title="${e}">${e}</span>`).join('')}
                                    </div>
                                </div>

                                <!-- Objects -->
                                <div>
                                    <div style="font-weight: bold; margin-bottom: 5px; color: #2196F3;">⚽ Objects & Sports</div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                        ${['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤸', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏊', '🤽', '🚣', '🧗', '🚴', '🚵', '🎪', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩', '🪀', '🪁', '🎁', '🎈', '🎀', '🎊', '🎉', '🎎', '🏮', '🎏', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️', '🪧', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓'].map(e => `<span onclick="selectEmoji('${e}')" style="font-size: 24px; cursor: pointer; padding: 4px;" title="${e}">${e}</span>`).join('')}
                                    </div>
                                </div>

                                <!-- Transport -->
                                <div>
                                    <div style="font-weight: bold; margin-bottom: 5px; color: #2196F3;">🚗 Transport</div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                        ${['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '🪝', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🛖', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋'].map(e => `<span onclick="selectEmoji('${e}')" style="font-size: 24px; cursor: pointer; padding: 4px;" title="${e}">${e}</span>`).join('')}
                                    </div>
                                </div>

                                <!-- Nature -->
                                <div>
                                    <div style="font-weight: bold; margin-bottom: 5px; color: #2196F3;">🌳 Nature</div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                        ${['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🪫', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '🪪', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🪣', '🧼', '🪥', '🧽', '🧴', '🛁', '🛀', '🧯', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🍇', '🌾', '💐', '🌍', '🌎', '🌏', '🌐', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌪️', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫️'].map(e => `<span onclick="selectEmoji('${e}')" style="font-size: 24px; cursor: pointer; padding: 4px;" title="${e}">${e}</span>`).join('')}
                                    </div>
                                </div>

                                <!-- Symbols -->
                                <div>
                                    <div style="font-weight: bold; margin-bottom: 5px; color: #2196F3;">❤️ Symbols</div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                        ${['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '🟰', '♾️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '👁️‍🗨️', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄'].map(e => `<span onclick="selectEmoji('${e}')" style="font-size: 24px; cursor: pointer; padding: 4px;" title="${e}">${e}</span>`).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Word List (<span id="word-count">0</span> words)</h3>
                        <button onclick="resetEmojiWordDict()" style="padding: 8px 16px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;">🔄 Reset to Defaults</button>
                    </div>
                    <div id="emoji-word-list" style="max-height: 400px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px;">
                        <!-- Words will be loaded here by JavaScript -->
                    </div>
                </div>
            </div>

            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h2 style="margin-top: 0;">Minigame Probabilities</h2>
                <p style="color: #666; margin-bottom: 15px;">Adjust the probability weights for each minigame. Higher values = higher chance of appearing.</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 15px;">
                    ${GAMES_REGISTRY.filter(game => game.weightKey).map(game => `
                        <div>
                            <label style="display: block; font-weight: bold; margin-bottom: 5px;">${game.name}</label>
                            <input type="number" id="weight-${game.weightKey}" value="${currentWeights[game.weightKey] || 10}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        </div>
                    `).join('')}
                </div>
                <div style="display: flex; gap: 20px; align-items: center;">
                    <div style="flex: 1;">
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            <button onclick="saveWeights()" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">💾 Save Probabilities</button>
                            <button onclick="resetWeights()" style="padding: 12px 24px; background: #FF9800; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">🔄 Reset to Defaults</button>
                        </div>
                        <div id="weights-message" style="color: #4CAF50; font-weight: bold;"></div>
                    </div>
                    <div style="width: 300px; height: 300px;">
                        <canvas id="probabilityChart"></canvas>
                    </div>
                </div>
            </div>

            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h2 style="margin-top: 0;">Pokemon Manager</h2>
                <p style="color: #666;">Total caught: <strong id="caught-count">${caughtPokemon.filter(p => (p.id || p) <= 151).length}</strong> / ${availablePokemon.length}</p>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button onclick="catchAll()" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">✓ Catch All</button>
                    <button onclick="releaseAll()" style="padding: 12px 24px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">✗ Release All</button>
                    <button onclick="generateSyncURL()" style="padding: 12px 24px; background: #2196F3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">🔗 Generate Sync URL</button>
                </div>
                <div id="sync-url-container" style="display: none; background: #fff; padding: 15px; border-radius: 8px; border: 2px solid #2196F3;">
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #2196F3;">📋 Sync URL (copy and paste on other device):</p>
                    <input type="text" id="sync-url-input" readonly style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px; background: #f9f9f9;" onclick="this.select()">
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">Open this URL on your iPad to sync Pokemon data</p>
                </div>
                <div id="sync-message" style="margin-top: 10px; padding: 10px; border-radius: 8px; font-weight: bold; display: none;"></div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 15px; margin-bottom: 40px;">
                ${pokemonGrid}
            </div>
        </div>

    `;

    document.body.innerHTML = adminHTML;

    // Reset body style to allow scrolling
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';

    // Letter range parser (supports uppercase/lowercase)
    window.parseLetterRange = function(input) {
        try {
            const parts = input.split(',');
            const letters = [];

            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.includes('-')) {
                    // Handle range like "a-z" or "A-Z"
                    const [start, end] = trimmed.split('-').map(s => s.trim());
                    if (start.length !== 1 || end.length !== 1) {
                        return null; // Invalid
                    }
                    const startCode = start.charCodeAt(0);
                    const endCode = end.charCodeAt(0);

                    if (startCode > endCode) {
                        return null; // Invalid range
                    }

                    for (let i = startCode; i <= endCode; i++) {
                        letters.push(String.fromCharCode(i));
                    }
                } else if (trimmed.length === 1) {
                    // Single letter
                    letters.push(trimmed);
                } else if (trimmed.length > 1) {
                    return null; // Invalid
                }
            }

            // Remove duplicates while preserving order
            return Array.from(new Set(letters));
        } catch (error) {
            return null;
        }
    };

    window.updateLettersPreview = function() {
        const input = document.getElementById('config-letters-list').value;
        const preview = document.getElementById('letters-preview');
        const error = document.getElementById('letters-error');

        const letters = window.parseLetterRange(input);

        if (letters === null || letters.length === 0) {
            error.textContent = '❌ Invalid format! Please use format like: a-z,B,C,Ä,Ö';
            error.style.display = 'block';
            preview.innerHTML = '';
            return false;
        }

        error.style.display = 'none';

        // Create visual chips for letters
        const chips = letters.map(letter =>
            `<span style="display: inline-block; padding: 6px 12px; margin: 3px; background: #2196F3; color: white; border-radius: 12px; font-size: 18px; font-weight: bold;">${letter}</span>`
        ).join('');

        preview.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold; color: #333;">
                ✓ ${letters.length} letter${letters.length !== 1 ? 's' : ''} configured
            </div>
            <div style="max-height: 150px; overflow-y: auto;">
                ${chips}
            </div>
        `;

        return true;
    };


    window.updatePokemonCatchingPreview = function() {
        const nameCase = document.getElementById('config-catching-namecase').value;
        const alphabetCase = document.getElementById('config-catching-alphabetcase').value;

        // Update preview
        const namePreview = document.getElementById('preview-name-case');
        const alphabetPreview = document.getElementById('preview-alphabet-case');

        if (namePreview) {
            namePreview.textContent = nameCase === 'uppercase' ? 'PIKACHU' : 'pikachu';
        }

        if (alphabetPreview) {
            alphabetPreview.textContent = alphabetCase === 'uppercase' ? 'A B C D E' : 'a b c d e';
        }
    };


    window.switchMinigameConfig = function() {
        const selector = document.getElementById('minigame-selector');
        const value = selector.value;

        // Hide all configs
        document.getElementById('config-letters').style.display = 'none';
        document.getElementById('config-numbers').style.display = 'none';
        document.getElementById('config-pokemon-catching').style.display = 'none';
        document.getElementById('config-legendary').style.display = 'none';
        document.getElementById('config-legendary-numbers').style.display = 'none';
        document.getElementById('config-word-spelling').style.display = 'none';
        document.getElementById('config-dayofweek').style.display = 'none';
        document.getElementById('config-addition').style.display = 'none';
        document.getElementById('config-piano').style.display = 'none';

        // Show selected config
        document.getElementById('config-' + value).style.display = 'block';

        // Update previews
        if (value === 'letters') {
            window.updateLettersPreview();
        } else if (value === 'numbers') {
            window.updateNumbersPreview();
        } else if (value === 'pokemon-catching') {
            window.updatePokemonCatchingPreview();
        } else if (value === 'legendary-numbers') {
            window.updateLegendaryNumbersPreview();
        }
    };

    // Number range parser
    window.parseNumberRange = function(input) {
        try {
            const parts = input.split(',');
            const numbers = new Set();

            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.includes('-')) {
                    const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
                    if (isNaN(start) || isNaN(end) || start > end || start < 0) {
                        return null; // Invalid
                    }
                    for (let i = start; i <= end; i++) {
                        numbers.add(i);
                    }
                } else {
                    const num = parseInt(trimmed);
                    if (isNaN(num) || num < 0) {
                        return null; // Invalid
                    }
                    numbers.add(num);
                }
            }

            return Array.from(numbers).sort((a, b) => a - b);
        } catch (error) {
            return null;
        }
    };

    window.updateNumbersPreview = function() {
        const input = document.getElementById('config-numbers-range').value;
        const preview = document.getElementById('numbers-preview');
        const error = document.getElementById('numbers-error');

        const numbers = window.parseNumberRange(input);

        if (numbers === null || numbers.length === 0) {
            error.textContent = '❌ Invalid format! Please use format like: 0,1,3,4-9,15-20';
            error.style.display = 'block';
            preview.innerHTML = '';
            return false;
        }

        error.style.display = 'none';

        // Create visual chips for numbers
        const chips = numbers.map(num =>
            `<span style="display: inline-block; padding: 4px 10px; margin: 3px; background: #4CAF50; color: white; border-radius: 12px; font-size: 14px;">${num}</span>`
        ).join('');

        preview.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold; color: #333;">
                ✓ ${numbers.length} number${numbers.length !== 1 ? 's' : ''} configured
            </div>
            <div style="max-height: 150px; overflow-y: auto;">
                ${chips}
            </div>
        `;

        return true;
    };

    window.updateLegendaryNumbersPreview = function() {
        const input = document.getElementById('config-legendary-numbers-range').value;
        const preview = document.getElementById('legendary-numbers-preview');
        const error = document.getElementById('legendary-numbers-error');

        const numbers = window.parseNumberRange(input);

        if (numbers === null || numbers.length === 0) {
            error.textContent = '❌ Invalid format! Please use format like: 0-20,30,40,50-59';
            error.style.display = 'block';
            preview.innerHTML = '';
            return false;
        }

        // Check that numbers are in 0-99 range
        const invalidNumbers = numbers.filter(n => n < 0 || n > 99);
        if (invalidNumbers.length > 0) {
            error.textContent = '❌ All numbers must be between 0 and 99';
            error.style.display = 'block';
            preview.innerHTML = '';
            return false;
        }

        error.style.display = 'none';

        // Create visual chips for numbers
        const chips = numbers.map(num =>
            `<span style="display: inline-block; padding: 4px 10px; margin: 3px; background: #4CAF50; color: white; border-radius: 12px; font-size: 14px;">${num}</span>`
        ).join('');

        preview.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold; color: #333;">
                ✓ ${numbers.length} active number${numbers.length !== 1 ? 's' : ''} (${100 - numbers.length} inactive)
            </div>
            <div style="max-height: 150px; overflow-y: auto;">
                ${chips}
            </div>
        `;

        return true;
    };

    window.saveMinigameConfig = async function(game) {
        if (game === 'pokemon-catching') {
            const nameCase = document.getElementById('config-catching-namecase').value;
            const alphabetCase = document.getElementById('config-catching-alphabetcase').value;

            const message = document.getElementById('config-catching-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' },
                    pokemonCatching: { nameCase: 'uppercase', alphabetCase: 'lowercase' }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update pokemon catching config
                fullConfig.pokemonCatching = {
                    nameCase: nameCase,
                    alphabetCase: alphabetCase
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Pokemon catching config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save catching config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'emoji-word') {
            const textCase = document.getElementById('text-case-select').value;

            const message = document.getElementById('config-emojiword-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' },
                    emojiWord: { textCase: 'uppercase' }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update emoji word config
                fullConfig.emojiWord = {
                    textCase: textCase
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Text case saved to minigames.json! All devices will use this setting.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save emoji-word config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'letters') {
            const lettersInput = document.getElementById('config-letters-list').value;

            // Validate
            if (!window.updateLettersPreview()) {
                return;
            }

            const message = document.getElementById('config-letters-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update letters config
                fullConfig.letters = {
                    letters: lettersInput
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Letter config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save letter config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'numbers') {
            const required = parseInt(document.getElementById('config-numbers-required').value);
            const numbersInput = document.getElementById('config-numbers-range').value;

            // Validate
            if (!window.updateNumbersPreview()) {
                return;
            }

            const message = document.getElementById('config-numbers-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update numbers config
                fullConfig.numbers = {
                    required: required,
                    numbers: numbersInput
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'legendary') {
            const coinReward = parseInt(document.getElementById('config-legendary-coins').value);
            const maxErrors = parseInt(document.getElementById('config-legendary-errors').value);

            const message = document.getElementById('config-legendary-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' },
                    pokemonCatching: { nameCase: 'uppercase', alphabetCase: 'lowercase' },
                    legendary: { coinReward: 100, maxErrors: 3 }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update legendary config
                fullConfig.legendary = {
                    coinReward: coinReward,
                    maxErrors: maxErrors
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Legendary config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save legendary config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'legendary-numbers') {
            const coinReward = parseInt(document.getElementById('config-legendary-numbers-coins').value);
            const maxErrors = parseInt(document.getElementById('config-legendary-numbers-errors').value);
            const numbersInput = document.getElementById('config-legendary-numbers-range').value;

            // Validate numbers
            if (!window.updateLegendaryNumbersPreview()) {
                return;
            }

            const message = document.getElementById('config-legendary-numbers-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' },
                    pokemonCatching: { nameCase: 'uppercase', alphabetCase: 'lowercase' },
                    legendary: { coinReward: 100, maxErrors: 3 },
                    legendaryNumbers: { coinReward: 200, maxErrors: 5, numbers: '0-99' }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update legendary numbers config
                fullConfig.legendaryNumbers = {
                    coinReward: coinReward,
                    maxErrors: maxErrors,
                    numbers: numbersInput
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Legendary Numbers config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save legendary numbers config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'word-spelling') {
            const requiredWords = parseInt(document.getElementById('config-wordspelling-required').value);

            const message = document.getElementById('config-wordspelling-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' },
                    pokemonCatching: { nameCase: 'uppercase', alphabetCase: 'lowercase' },
                    legendary: { coinReward: 100, maxErrors: 3 },
                    legendaryNumbers: { coinReward: 200, maxErrors: 5, numbers: '0-99' },
                    wordSpelling: { requiredWords: 3 }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update word spelling config
                fullConfig.wordSpelling = {
                    requiredWords: requiredWords
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Word Spelling config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save word spelling config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'dayofweek') {
            const maxErrors = parseInt(document.getElementById('config-dayofweek-errors').value);

            const message = document.getElementById('config-dayofweek-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' },
                    pokemonCatching: { nameCase: 'uppercase', alphabetCase: 'lowercase' },
                    legendary: { coinReward: 100, maxErrors: 3 },
                    legendaryNumbers: { coinReward: 200, maxErrors: 5, numbers: '0-99' },
                    wordSpelling: { requiredWords: 3 },
                    dayMatch: { maxErrors: 3 }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update day match config
                fullConfig.dayMatch = {
                    maxErrors: maxErrors
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Day of Week config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save day of week config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'addition') {
            const numberOfTerms = parseInt(document.getElementById('config-addition-terms').value);
            const maxSum = parseInt(document.getElementById('config-addition-maxsum').value);
            const onlyOneMultiDigit = document.getElementById('config-addition-onlyone').checked;

            const message = document.getElementById('config-addition-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' },
                    addition: { numberOfTerms: 2, maxSum: 99, onlyOneMultiDigit: true }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update addition config
                fullConfig.addition = {
                    numberOfTerms: numberOfTerms,
                    maxSum: maxSum,
                    onlyOneMultiDigit: onlyOneMultiDigit
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Addition config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save addition config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        } else if (game === 'piano') {
            const measuresPerPattern = parseInt(document.getElementById('config-piano-measures').value);
            const showNotes = document.getElementById('config-piano-shownotes').checked;

            const message = document.getElementById('config-piano-message');
            message.textContent = '⏳ Saving...';
            message.style.color = '#FF9800';

            try {
                // Load current config
                const response = await fetch('/config/minigames.json');
                let fullConfig = {
                    numbers: { required: 1, numbers: '10-99' },
                    letters: { letters: 'A-Z,Å,Ä,Ö' },
                    pianoLearning: { measuresPerPattern: 1, showNotes: true }
                };
                if (response.ok) {
                    fullConfig = await response.json();
                }

                // Update piano learning config
                fullConfig.pianoLearning = {
                    measuresPerPattern: measuresPerPattern,
                    showNotes: showNotes
                };

                // Save to server
                const saveResponse = await fetch('/api/config/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(fullConfig)
                });

                if (saveResponse.ok) {
                    message.textContent = '✓ Piano config saved to server! All devices will use these settings.';
                    message.style.color = '#4CAF50';
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                console.error('Failed to save piano config:', error);
                message.textContent = '❌ Failed to save config. Check console for details.';
                message.style.color = '#f44336';
            }

            setTimeout(() => {
                message.textContent = '';
            }, 5000);
        }
    };

    // Define all admin functions globally
    window.saveWeights = async function() {
        const weights = {};

        // Dynamically read all weight inputs from GAMES_REGISTRY
        GAMES_REGISTRY.filter(game => game.weightKey).forEach(game => {
            const input = document.getElementById(`weight-${game.weightKey}`);
            if (input) {
                weights[game.weightKey] = parseInt(input.value) || 0;
            }
        });

        const message = document.getElementById('weights-message');
        message.textContent = '⏳ Saving...';
        message.style.color = '#FF9800';

        try {
            // Load current config
            const response = await fetch('/config/minigames.json');
            let fullConfig = {
                numbers: { required: 1, numbers: '10-99' },
                letters: { letters: 'A-Z,Å,Ä,Ö' },
                pokemonCatching: { nameCase: 'uppercase', alphabetCase: 'lowercase' },
                legendary: { coinReward: 100, maxErrors: 3 },
                legendaryNumbers: { coinReward: 100, maxErrors: 3 }
            };
            if (response.ok) {
                fullConfig = await response.json();
            }

            // Update weights in config
            fullConfig.weights = weights;

            // Save to server
            const saveResponse = await fetch('/api/config/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(fullConfig)
            });

            if (saveResponse.ok) {
                message.textContent = '✓ Probabilities saved to config file! All devices will use these settings.';
                message.style.color = '#4CAF50';
            } else {
                throw new Error('Server returned error');
            }
        } catch (error) {
            console.error('Failed to save weights:', error);
            message.textContent = '❌ Failed to save weights. Check console for details.';
            message.style.color = '#f44336';
        }

        if (window.updateProbabilityChart) {
            window.updateProbabilityChart();
        }

        setTimeout(() => {
            message.textContent = '';
        }, 5000);
    };

    window.resetWeights = async function() {
        // Define default weights (most games 10, wordSpelling 40)
        const defaultWeights = {};
        GAMES_REGISTRY.filter(game => game.weightKey).forEach(game => {
            // Word Spelling gets 40, everything else gets 10
            defaultWeights[game.weightKey] = game.weightKey === 'wordSpelling' ? 40 : 10;
        });

        // Update all input fields
        GAMES_REGISTRY.filter(game => game.weightKey).forEach(game => {
            const input = document.getElementById(`weight-${game.weightKey}`);
            if (input) {
                input.value = defaultWeights[game.weightKey];
            }
        });

        const message = document.getElementById('weights-message');
        message.textContent = '⏳ Saving...';
        message.style.color = '#FF9800';

        try {
            // Load current config
            const response = await fetch('/config/minigames.json');
            let fullConfig = {
                numbers: { required: 1, numbers: '10-99' },
                letters: { letters: 'A-Z,Å,Ä,Ö' },
                pokemonCatching: { nameCase: 'uppercase', alphabetCase: 'lowercase' },
                legendary: { coinReward: 100, maxErrors: 3 },
                legendaryNumbers: { coinReward: 100, maxErrors: 3 }
            };
            if (response.ok) {
                fullConfig = await response.json();
            }

            // Update weights to defaults
            fullConfig.weights = defaultWeights;

            // Save to server
            const saveResponse = await fetch('/api/config/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(fullConfig)
            });

            if (saveResponse.ok) {
                message.textContent = '✓ Reset to default probabilities and saved to config file!';
                message.style.color = '#FF9800';
            } else {
                throw new Error('Server returned error');
            }
        } catch (error) {
            console.error('Failed to reset weights:', error);
            message.textContent = '❌ Failed to reset weights. Check console for details.';
            message.style.color = '#f44336';
        }

        if (window.updateProbabilityChart) {
            window.updateProbabilityChart();
        }

        setTimeout(() => {
            message.textContent = '';
        }, 5000);
    };

    window.togglePokemon = function(id) {
        const caughtList = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');
        const index = caughtList.findIndex(p => (p.id || p) === id);

        if (index > -1) {
            caughtList.splice(index, 1);
        } else {
            const pokemon = POKEMON_DATA.find(p => p.id === id);
            caughtList.push({
                id: id,
                name: pokemon ? pokemon.name : 'Unknown',
                caughtDate: new Date().toISOString()
            });
        }

        localStorage.setItem('pokemonCaughtList', JSON.stringify(caughtList));
        updateUI();
    };

    window.catchAll = function() {
        const allPokemon = getAvailablePokemon().map(p => ({
            id: p.id,
            name: p.name,
            caughtDate: new Date().toISOString()
        }));
        localStorage.setItem('pokemonCaughtList', JSON.stringify(allPokemon));
        location.reload();
    };

    window.releaseAll = function() {
        localStorage.setItem('pokemonCaughtList', JSON.stringify([]));
        location.reload();
    };

    window.generateSyncURL = function() {
        const caughtList = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');

        if (caughtList.length === 0) {
            showSyncMessage('⚠️ No Pokemon to sync! Catch some Pokemon first.', '#FF9800');
            return;
        }

        const jsonString = JSON.stringify(caughtList);
        const base64Data = btoa(jsonString);

        const baseURL = window.location.origin + window.location.pathname;
        const syncURL = baseURL + '?sync=' + base64Data;

        document.getElementById('sync-url-container').style.display = 'block';
        document.getElementById('sync-url-input').value = syncURL;
        document.getElementById('sync-url-input').select();

        showSyncMessage('✓ Sync URL generated! Copy and open on your iPad.', '#4CAF50');
    };

    function showSyncMessage(message, color) {
        const messageDiv = document.getElementById('sync-message');
        messageDiv.textContent = message;
        messageDiv.style.background = color;
        messageDiv.style.color = 'white';
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }

    function updateUI() {
        const caughtList = JSON.parse(localStorage.getItem('pokemonCaughtList') || '[]');
        const gen1CaughtCount = caughtList.filter(p => (p.id || p) <= 151).length;
        document.getElementById('caught-count').textContent = gen1CaughtCount;

        getAvailablePokemon().forEach(p => {
            const elem = document.getElementById(`pokemon-${p.id}`);
            if (!elem) return;

            const container = elem.parentElement;
            const isCaught = caughtList.some(entry => (entry.id || entry) === p.id);

            if (isCaught) {
                container.style.background = '#e8f5e9';
                container.style.borderColor = '#4CAF50';
                container.querySelector('div div:last-child').textContent = '✓ Caught';
            } else {
                container.style.background = '#fff';
                container.style.borderColor = '#ddd';
                container.querySelector('div div:last-child').textContent = 'Not caught';
            }
        });
    }

    // Emoji Word Dictionary Management Functions
    window.loadEmojiWordDictionary = function() {
        // Import functions
        import('./emojiWordDictionary.js').then(module => {
            const dictionary = module.getEmojiWordDictionary();
            const letterFilterEnabled = module.getLetterFilterEnabled();

            // Update checkbox
            document.getElementById('letter-filter-toggle').checked = letterFilterEnabled;

            // Update word count
            document.getElementById('word-count').textContent = dictionary.length;

            // Group words by letter
            const byLetter = {};
            dictionary.forEach(item => {
                if (!byLetter[item.letter]) {
                    byLetter[item.letter] = [];
                }
                byLetter[item.letter].push(item);
            });

            // Sort letters
            const sortedLetters = Object.keys(byLetter).sort();

            // Build HTML
            let html = '';
            sortedLetters.forEach(letter => {
                html += `<div style="margin-bottom: 20px;">`;
                html += `<div style="background: #2196F3; color: white; padding: 10px; font-weight: bold; font-size: 18px; position: sticky; top: 0; z-index: 1;">${letter} (${byLetter[letter].length} words)</div>`;

                byLetter[letter].forEach(item => {
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; background: white;">
                            <div style="display: flex; gap: 15px; align-items: center;">
                                <span style="font-size: 32px;">${item.emoji}</span>
                                <span style="font-weight: bold; font-size: 18px;">${item.word}</span>
                                <span style="color: #666;">(${item.letter})</span>
                            </div>
                            <button onclick="removeEmojiWordEntry(${item.id})" style="padding: 6px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">🗑️ Remove</button>
                        </div>
                    `;
                });

                html += `</div>`;
            });

            document.getElementById('emoji-word-list').innerHTML = html;
        });
    };

    window.toggleLetterFilter = function() {
        import('./emojiWordDictionary.js').then(module => {
            const enabled = document.getElementById('letter-filter-toggle').checked;
            module.setLetterFilterEnabled(enabled);

            const message = enabled ? '✓ Letter filtering enabled' : '✓ Letter filtering disabled';
            const msgDiv = document.getElementById('add-word-message');
            msgDiv.textContent = message;
            msgDiv.style.color = '#4CAF50';
            setTimeout(() => { msgDiv.textContent = ''; }, 2000);
        });
    };


    window.addEmojiWordEntry = function() {
        const word = document.getElementById('new-word').value.trim().toUpperCase();
        const emoji = document.getElementById('new-emoji').value.trim();
        const letter = document.getElementById('new-letter').value.trim().toUpperCase();

        if (!word || !emoji || !letter) {
            const msgDiv = document.getElementById('add-word-message');
            msgDiv.textContent = '⚠️ All fields are required';
            msgDiv.style.color = '#f44336';
            return;
        }

        import('./emojiWordDictionary.js').then(module => {
            module.addEmojiWord(word, emoji, letter);

            // Clear inputs
            document.getElementById('new-word').value = '';
            document.getElementById('new-emoji').value = '';
            document.getElementById('new-letter').value = '';

            // Show success message
            const msgDiv = document.getElementById('add-word-message');
            msgDiv.textContent = `✓ Added: ${emoji} ${word}`;
            msgDiv.style.color = '#4CAF50';
            setTimeout(() => { msgDiv.textContent = ''; }, 2000);

            // Reload list
            window.loadEmojiWordDictionary();
        });
    };

    window.removeEmojiWordEntry = function(id) {
        if (!confirm('Remove this word?')) return;

        import('./emojiWordDictionary.js').then(module => {
            module.removeEmojiWord(id);
            window.loadEmojiWordDictionary();
        });
    };

    window.resetEmojiWordDict = function() {
        if (!confirm('Reset dictionary to defaults? This will remove all custom words.')) return;

        import('./emojiWordDictionary.js').then(module => {
            module.resetEmojiWordDictionary();
            window.loadEmojiWordDictionary();
        });
    };

    // Emoji picker toggle
    window.toggleEmojiPicker = function() {
        const picker = document.getElementById('emoji-picker');
        if (picker.style.display === 'none') {
            picker.style.display = 'block';
        } else {
            picker.style.display = 'none';
        }
    };

    // Select emoji from picker
    window.selectEmoji = function(emoji) {
        document.getElementById('new-emoji').value = emoji;
        document.getElementById('new-emoji').focus();
    };

    // Load emoji word dictionary on page load
    window.loadEmojiWordDictionary();

    // Load Chart.js script
    const chartScript = document.createElement('script');
    chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    chartScript.onload = () => {
        // Define functions globally after Chart.js loads
        window.probabilityChart = null;

        window.updateProbabilityChart = function() {
            const weights = {};
            const gamesWithWeights = GAMES_REGISTRY.filter(game => game.weightKey);

            // Dynamically read all weight inputs
            gamesWithWeights.forEach(game => {
                const input = document.getElementById(`weight-${game.weightKey}`);
                if (input) {
                    weights[game.weightKey] = parseInt(input.value) || 0;
                }
            });

            const total = Object.values(weights).reduce((sum, val) => sum + val, 0);

            if (total === 0) {
                // If all weights are 0, show equal distribution
                const equalPercent = 100 / gamesWithWeights.length;
                const data = Array(gamesWithWeights.length).fill(equalPercent.toFixed(1));
                window.probabilityChart.data.datasets[0].data = data;
            } else {
                // Calculate percentage for each game
                const data = gamesWithWeights.map(game =>
                    (weights[game.weightKey] / total * 100).toFixed(1)
                );
                window.probabilityChart.data.datasets[0].data = data;
            }

            window.probabilityChart.update();
        };

        window.initChart = function() {
            const ctx = document.getElementById('probabilityChart');
            if (!ctx) return;

            const gamesWithWeights = GAMES_REGISTRY.filter(game => game.weightKey);

            // Generate colors dynamically (cycle through palette)
            const colorPalette = [
                '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                '#FF9F40', '#4DC9F6', '#F67019', '#F53794', '#537BC4'
            ];
            const colors = gamesWithWeights.map((_, index) =>
                colorPalette[index % colorPalette.length]
            );

            window.probabilityChart = new Chart(ctx.getContext('2d'), {
                type: 'pie',
                data: {
                    labels: gamesWithWeights.map(game => game.name),
                    datasets: [{
                        data: [],
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                boxWidth: 15,
                                font: {
                                    size: 11
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.label + ': ' + context.parsed + '%';
                                }
                            }
                        }
                    }
                }
            });

            window.updateProbabilityChart();

            // Add input event listeners dynamically for all games
            GAMES_REGISTRY.filter(game => game.weightKey).forEach(game => {
                const input = document.getElementById(`weight-${game.weightKey}`);
                if (input) {
                    input.addEventListener('input', window.updateProbabilityChart);
                }
            });
        };

        // Initialize chart
        window.initChart();
    };
    document.head.appendChild(chartScript);

    // Initialize numbers preview on page load
    setTimeout(() => {
        window.updateNumbersPreview();

        // Add event listeners for real-time preview updates
        const numbersInput = document.getElementById('config-numbers-range');
        if (numbersInput) {
            numbersInput.addEventListener('input', window.updateNumbersPreview);
        }

        const lettersInput = document.getElementById('config-letters-list');
        if (lettersInput) {
            lettersInput.addEventListener('input', window.updateLettersPreview);
            // Trigger initial preview
            window.updateLettersPreview();
        }

        // Add event listener for legendary numbers config
        const legendaryNumbersInput = document.getElementById('config-legendary-numbers-range');
        if (legendaryNumbersInput) {
            legendaryNumbersInput.addEventListener('input', window.updateLegendaryNumbersPreview);
            // Trigger initial preview
            window.updateLegendaryNumbersPreview();
        }

        // Add event listeners for Pokemon catching config
        const nameCaseSelect = document.getElementById('config-catching-namecase');
        const alphabetCaseSelect = document.getElementById('config-catching-alphabetcase');
        if (nameCaseSelect) {
            nameCaseSelect.addEventListener('change', window.updatePokemonCatchingPreview);
        }
        if (alphabetCaseSelect) {
            alphabetCaseSelect.addEventListener('change', window.updatePokemonCatchingPreview);
        }
        // Trigger initial preview
        window.updatePokemonCatchingPreview();
    }, 100);
}
