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

// Detect URL path to determine game mode and routing
const path = window.location.pathname;
let answerMode;
let startScene = 'MainGameScene';
let pokeballGameMode = null; // null = alternate, 'letter' = letter only, 'word-emoji' = word-emoji only
let showStoreOnLoad = false;
let showGamesMenu = false;
let showAdmin = false;

if (path === '/debug' || path === '/debug/') {
    answerMode = 'debug';
    console.log('Running in DEBUG mode');
} else if (path === '/letters' || path === '/letters/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'letter-only';
    console.log('Running LETTER LISTENING mode (debug)');
} else if (path === '/words' || path === '/words/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'word-emoji-only';
    console.log('Running WORD-EMOJI MATCH mode (debug)');
} else if (path === '/directions' || path === '/directions/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'directions-only';
    console.log('Running LEFT/RIGHT DIRECTIONS mode (debug)');
} else if (path === '/pokeballs' || path === '/pokeballs/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    console.log('Running POKEBALL GAME mode');
} else if (path === '/lettermatch' || path === '/lettermatch/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'lettermatch-only';
    console.log('Running LETTER DRAG MATCH mode (debug)');
} else if (path === '/speech' || path === '/speech/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'speech-only';
    console.log('Running SPEECH RECOGNITION mode (debug)');
} else if (path === '/numbers' || path === '/numbers/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'numbers-only';
    console.log('Running NUMBER LISTENING mode (debug)');
} else if (path === '/emojiword' || path === '/emojiword/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'emojiword-only';
    console.log('Running EMOJI-WORD MATCH mode (debug)');
} else if (path === '/wordspelling' || path === '/wordspelling/') {
    answerMode = 'letter'; // default
    startScene = 'PokeballGameScene';
    pokeballGameMode = 'wordspelling-only';
    console.log('Running WORD SPELLING mode (debug)');
} else if (path === '/store' || path === '/store/') {
    answerMode = 'letter'; // default
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
    // Reset all progress
    resetAllProgress();
} else {
    answerMode = 'letter'; // default
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

    const menuHTML = `
        <div style="font-family: Arial; max-width: 600px; margin: 80px auto; padding: 40px;">
            <h1 style="text-align: center; margin-bottom: 40px; font-size: 36px;">🎮 Games</h1>
            <div style="display: grid; gap: 15px;">
                <a href="/" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🎯 Main Game</a>
                <a href="/pokeballs" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🎲 Random Mix</a>
                <a href="/letters" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🔊 Letter Listening</a>
                <a href="/words" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">📝 Word-Emoji Match</a>
                <a href="/emojiword" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">📖 Emoji-Word Match</a>
                <a href="/lettermatch" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🔤 Letter Match</a>
                <a href="/directions" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">⬅️➡️ Directions</a>
                <a href="/speech" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🎤 Speech Reading</a>
                <a href="/numbers" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🔢 Number Listening</a>
                <a href="/wordspelling" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">⌨️ Word Spelling</a>
                <a href="/store" style="display: block; padding: 20px; background: #f0f0f0; border-radius: 10px; text-decoration: none; color: #333; font-size: 20px;">🛒 Store</a>
            </div>
        </div>
    `;

    document.body.innerHTML = menuHTML;
}

function showAdminPage() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
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
}
