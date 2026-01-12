import Phaser from 'phaser';
import { POKEMON_DATA } from './pokemonData.js';
import { BootScene } from './scenes/BootScene.js';
import { MainGameScene } from './scenes/MainGameScene.js';
import { PokedexScene } from './scenes/PokedexScene.js';
import { PokeballGameScene } from './scenes/PokeballGameScene.js';
import { initPokedex, showPokedex } from './pokedex.js';
import { initPokemonCaughtPopup, showPokemonCaughtPopup } from './pokemonCaughtPopup.js';
import { initStore, openStore } from './store.js';
import { migrateOldInventory } from './inventory.js';

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
    { path: '/letters', name: '🔊 Letter Listening', mode: 'letter-only', scene: 'PokeballGameScene' },
    { path: '/words', name: '📝 Word-Emoji Match', mode: 'word-emoji-only', scene: 'PokeballGameScene' },
    { path: '/emojiword', name: '📖 Emoji-Word Match', mode: 'emojiword-only', scene: 'PokeballGameScene' },
    { path: '/directions', name: '⬅️➡️ Directions', mode: 'directions-only', scene: 'PokeballGameScene' },
    { path: '/lettermatch', name: '🔤 Letter Match', mode: 'lettermatch-only', scene: 'PokeballGameScene' },
    { path: '/speech', name: '🎤 Speech Reading', mode: 'speech-only', scene: 'PokeballGameScene' },
    { path: '/numbers', name: '🔢 Number Listening', mode: 'numbers-only', scene: 'PokeballGameScene' },
    { path: '/wordspelling', name: '⌨️ Word Spelling', mode: 'wordspelling-only', scene: 'PokeballGameScene' },
    { path: '/pokeballs', name: '🎲 Random Mix', mode: null, scene: 'PokeballGameScene' }
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

// Show games menu if /games route
if (showGamesMenu) {
    showGamesMenuPage();
} else if (showAdmin) {
    showAdminPage();
} else {
    // Main game configuration
    const config = {
        type: Phaser.AUTO,
        width: 1024,
        height: 768,
        parent: 'game-container',
        backgroundColor: '#87CEEB',
        scene: [BootScene, MainGameScene, PokedexScene, PokeballGameScene],
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

    // Generate Pokemon grid
    const pokemonGrid = POKEMON_DATA.map(pokemon => {
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

    // Load current minigame weights
    const defaultWeights = {
        letterListening: 10,
        wordEmoji: 10,
        emojiWord: 10,
        leftRight: 10,
        letterDragMatch: 10,
        speechRecognition: 10,
        numberListening: 10,
        wordSpelling: 40
    };
    const savedWeights = localStorage.getItem('minigameWeights');
    const currentWeights = savedWeights ? JSON.parse(savedWeights) : defaultWeights;

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
            </div>

            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h2 style="margin-top: 0;">Minigame Probabilities</h2>
                <p style="color: #666; margin-bottom: 15px;">Adjust the probability weights for each minigame. Higher values = higher chance of appearing.</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 15px;">
                    <div>
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">🔊 Letter Listening</label>
                        <input type="number" id="weight-letterListening" value="${currentWeights.letterListening}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">📝 Word-Emoji Match</label>
                        <input type="number" id="weight-wordEmoji" value="${currentWeights.wordEmoji}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">📖 Emoji-Word Match</label>
                        <input type="number" id="weight-emojiWord" value="${currentWeights.emojiWord}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">⬅️➡️ Directions</label>
                        <input type="number" id="weight-leftRight" value="${currentWeights.leftRight}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">🔤 Letter Match</label>
                        <input type="number" id="weight-letterDragMatch" value="${currentWeights.letterDragMatch}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">🎤 Speech Recognition</label>
                        <input type="number" id="weight-speechRecognition" value="${currentWeights.speechRecognition}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">🔢 Number Listening</label>
                        <input type="number" id="weight-numberListening" value="${currentWeights.numberListening}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">⌨️ Word Spelling</label>
                        <input type="number" id="weight-wordSpelling" value="${currentWeights.wordSpelling}" min="0" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
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
                <p style="color: #666;">Total caught: <strong id="caught-count">${caughtPokemon.length}</strong> / ${POKEMON_DATA.length}</p>
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

        // Show selected config
        document.getElementById('config-' + value).style.display = 'block';

        // Update previews
        if (value === 'letters') {
            window.updateLettersPreview();
        } else if (value === 'numbers') {
            window.updateNumbersPreview();
        } else if (value === 'pokemon-catching') {
            window.updatePokemonCatchingPreview();
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
        }
    };

    // Define all admin functions globally
    window.saveWeights = function() {
        const weights = {
            letterListening: parseInt(document.getElementById('weight-letterListening').value) || 0,
            wordEmoji: parseInt(document.getElementById('weight-wordEmoji').value) || 0,
            emojiWord: parseInt(document.getElementById('weight-emojiWord').value) || 0,
            leftRight: parseInt(document.getElementById('weight-leftRight').value) || 0,
            letterDragMatch: parseInt(document.getElementById('weight-letterDragMatch').value) || 0,
            speechRecognition: parseInt(document.getElementById('weight-speechRecognition').value) || 0,
            numberListening: parseInt(document.getElementById('weight-numberListening').value) || 0,
            wordSpelling: parseInt(document.getElementById('weight-wordSpelling').value) || 0
        };

        localStorage.setItem('minigameWeights', JSON.stringify(weights));

        const message = document.getElementById('weights-message');
        message.textContent = '✓ Probabilities saved successfully!';
        message.style.color = '#4CAF50';
        setTimeout(() => {
            message.textContent = '';
        }, 3000);
    };

    window.resetWeights = function() {
        const defaultWeights = {
            letterListening: 10,
            wordEmoji: 10,
            emojiWord: 10,
            leftRight: 10,
            letterDragMatch: 10,
            speechRecognition: 10,
            numberListening: 10,
            wordSpelling: 40
        };

        document.getElementById('weight-letterListening').value = defaultWeights.letterListening;
        document.getElementById('weight-wordEmoji').value = defaultWeights.wordEmoji;
        document.getElementById('weight-emojiWord').value = defaultWeights.emojiWord;
        document.getElementById('weight-leftRight').value = defaultWeights.leftRight;
        document.getElementById('weight-letterDragMatch').value = defaultWeights.letterDragMatch;
        document.getElementById('weight-speechRecognition').value = defaultWeights.speechRecognition;
        document.getElementById('weight-numberListening').value = defaultWeights.numberListening;
        document.getElementById('weight-wordSpelling').value = defaultWeights.wordSpelling;

        localStorage.setItem('minigameWeights', JSON.stringify(defaultWeights));

        if (window.updateProbabilityChart) {
            window.updateProbabilityChart();
        }

        const message = document.getElementById('weights-message');
        message.textContent = '✓ Reset to default probabilities!';
        message.style.color = '#FF9800';
        setTimeout(() => {
            message.textContent = '';
        }, 3000);
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
        const allPokemon = POKEMON_DATA.map(p => ({
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
        document.getElementById('caught-count').textContent = caughtList.length;

        POKEMON_DATA.forEach(p => {
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

    // Load Chart.js script
    const chartScript = document.createElement('script');
    chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    chartScript.onload = () => {
        // Define functions globally after Chart.js loads
        window.probabilityChart = null;

        window.updateProbabilityChart = function() {
            const weights = {
                letterListening: parseInt(document.getElementById('weight-letterListening').value) || 0,
                wordEmoji: parseInt(document.getElementById('weight-wordEmoji').value) || 0,
                emojiWord: parseInt(document.getElementById('weight-emojiWord').value) || 0,
                leftRight: parseInt(document.getElementById('weight-leftRight').value) || 0,
                letterDragMatch: parseInt(document.getElementById('weight-letterDragMatch').value) || 0,
                speechRecognition: parseInt(document.getElementById('weight-speechRecognition').value) || 0,
                numberListening: parseInt(document.getElementById('weight-numberListening').value) || 0,
                wordSpelling: parseInt(document.getElementById('weight-wordSpelling').value) || 0
            };

            const total = Object.values(weights).reduce((sum, val) => sum + val, 0);

            if (total === 0) {
                const data = Array(8).fill(12.5);
                window.probabilityChart.data.datasets[0].data = data;
            } else {
                const data = [
                    (weights.letterListening / total * 100).toFixed(1),
                    (weights.wordEmoji / total * 100).toFixed(1),
                    (weights.emojiWord / total * 100).toFixed(1),
                    (weights.leftRight / total * 100).toFixed(1),
                    (weights.letterDragMatch / total * 100).toFixed(1),
                    (weights.speechRecognition / total * 100).toFixed(1),
                    (weights.numberListening / total * 100).toFixed(1),
                    (weights.wordSpelling / total * 100).toFixed(1)
                ];
                window.probabilityChart.data.datasets[0].data = data;
            }

            window.probabilityChart.update();
        };

        window.initChart = function() {
            const ctx = document.getElementById('probabilityChart');
            if (!ctx) return;

            window.probabilityChart = new Chart(ctx.getContext('2d'), {
                type: 'pie',
                data: {
                    labels: [
                        '🔊 Letter',
                        '📝 Word-Emoji',
                        '📖 Emoji-Word',
                        '⬅️➡️ Directions',
                        '🔤 Letter Match',
                        '🎤 Speech',
                        '🔢 Numbers',
                        '⌨️ Spelling'
                    ],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#FF6384',
                            '#36A2EB',
                            '#FFCE56',
                            '#4BC0C0',
                            '#9966FF',
                            '#FF9F40',
                            '#FF6384',
                            '#C9CBCF'
                        ],
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

            // Add input event listeners
            const inputs = [
                'weight-letterListening',
                'weight-wordEmoji',
                'weight-emojiWord',
                'weight-leftRight',
                'weight-letterDragMatch',
                'weight-speechRecognition',
                'weight-numberListening',
                'weight-wordSpelling'
            ];

            inputs.forEach(id => {
                const input = document.getElementById(id);
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
