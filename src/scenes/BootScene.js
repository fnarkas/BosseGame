import Phaser from 'phaser';
import { SWEDISH_LETTERS } from '../letterData.js';
import { getAllWords } from '../speechVocabulary.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Loading emoji
        const loadingEmoji = this.add.text(width / 2, height / 2 - 80, '⚡', {
            font: '120px Arial'
        });
        loadingEmoji.setOrigin(0.5, 0.5);

        // Progress bar
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2, 320, 50);

        // Update progress bar
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 + 10, 300 * value, 30);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingEmoji.destroy();
            console.log('All assets loaded. Checking word audio cache...');
            const words = getAllWords();
            words.forEach(wordObj => {
                const audioKey = `word_audio_${wordObj.word}`;
                if (this.cache.audio.exists(audioKey)) {
                    console.log(`✓ ${audioKey} in cache`);
                } else {
                    console.error(`✗ ${audioKey} NOT IN CACHE`);
                }
            });
        });

        // Load all Pokemon images
        this.loadPokemonImages();

        // Load pokeball sprites
        this.loadPokeballSprites();

        // Load coin sprite
        this.load.image('coin', 'coin.png');

        // Load tiny coin sprite for inventory (64x64)
        this.load.image('coin-tiny', 'coin-tiny.png');

        // Load treasure chest sprite for legendary rewards
        this.load.image('treasure-chest', 'treasure-chest.png');

        // Load UI button icons (optimized 128x128 versions)
        this.load.image('dice-icon', 'dice-icon-small.png');
        this.load.image('pokedex-icon', 'pokedex-icon-small.png');
        this.load.image('store-icon', 'store-icon-small.png');

        // Load type icons
        this.loadTypeIcons();

        // Load Pokemon name audio
        this.loadPokemonAudio();

        // Load Swedish letter audio
        this.loadLetterAudio();

        // Load direction audio
        this.loadDirectionAudio();

        // Load number audio
        this.loadNumberAudio();

        // Load word audio
        this.loadWordAudio();

        // Load day audio
        this.loadDayAudio();

        // Load shape directions audio
        this.loadShapeDirectionsAudio();

        // Load minigame icons (256x256 PNG with transparent backgrounds)
        this.load.image('game-mode-letter', 'minigame_icons/letter_listening.png');
        this.load.image('game-mode-word', 'minigame_icons/word_emoji_match.png');
        this.load.image('game-mode-emojiword', 'minigame_icons/emoji_word_match.png');
        this.load.image('game-mode-directions', 'minigame_icons/left_right.png');
        this.load.image('game-mode-numbers', 'minigame_icons/number_listening.png');
        this.load.image('game-mode-lettermatch', 'minigame_icons/letter_drag_match.png');
        this.load.image('game-mode-speech', 'minigame_icons/speech_recognition.png');
        this.load.image('game-mode-numberreading', 'minigame_icons/number_listening.png'); // Placeholder: uses number_listening icon
        this.load.image('game-mode-spelling', 'minigame_icons/word_spelling.png');
        this.load.image('game-mode-legendary', 'minigame_icons/legendary_alphabet.png');
        this.load.image('game-mode-legendary-numbers', 'minigame_icons/legendary_numbers.png');
        this.load.image('game-mode-dayofweek', 'minigame_icons/day_of_week.png');
        this.load.image('game-mode-addition', 'minigame_icons/addition.png');
        this.load.image('game-mode-shapedirections', 'minigame_icons/shape_directions.png');
    }

    loadPokemonImages() {
        // Load all Pokemon images using POKEMON_DATA
        POKEMON_DATA.forEach(pokemon => {
            this.load.image(`pokemon_${pokemon.id}`, `pokemon_images/${pokemon.filename}`);
        });
    }

    loadPokeballSprites() {
        // Load optimized 128x128 pokeball sprites (converted from high-quality webp)
        this.load.image('pokeball_poke-ball', 'pokeball_sprites/poke-ball-small.png');
        this.load.image('pokeball_great-ball', 'pokeball_sprites/great-ball-small.png');
        this.load.image('pokeball_ultra-ball', 'pokeball_sprites/ultra-ball-small.png');
        this.load.image('pokeball_legendary-ball', 'pokeball_sprites/legendary-ball.png');

        // Load tiny 64x64 pokeball sprites for inventory
        this.load.image('pokeball_poke-ball-tiny', 'pokeball_sprites/poke-ball-tiny.png');
        this.load.image('pokeball_great-ball-tiny', 'pokeball_sprites/great-ball-tiny.png');
        this.load.image('pokeball_ultra-ball-tiny', 'pokeball_sprites/ultra-ball-tiny.png');
        this.load.image('pokeball_legendary-ball-tiny', 'pokeball_sprites/legendary-ball-tiny.png');

        // Load old PNG pokeball sprites (for other types)
        const otherPokeballs = [
            'master-ball',
            'safari-ball',
            'net-ball',
            'dive-ball',
            'nest-ball',
            'repeat-ball',
            'timer-ball',
            'luxury-ball',
            'premier-ball',
            'dusk-ball',
            'heal-ball',
            'quick-ball',
            'cherish-ball'
        ];

        otherPokeballs.forEach(ballName => {
            this.load.image(`pokeball_${ballName}`, `pokeball_sprites/${ballName}.png`);
        });
    }

    loadTypeIcons() {
        // Load type icons (IDs 1-18) - using circular versions without text
        for (let typeId = 1; typeId <= 18; typeId++) {
            this.load.image(`type_${typeId}`, `type_icons_circular/${typeId}.png`);
        }
    }

    loadPokemonAudio() {
        // Load Pokemon name audio for all Pokemon
        POKEMON_DATA.forEach(pokemon => {
            const audioFilename = `${pokemon.id.toString().padStart(3, '0')}_${pokemon.name.toLowerCase().replace('-', '')}.mp3`;
            const audioKey = `pokemon_audio_${pokemon.id}`;
            this.load.audio(audioKey, `pokemon_audio/${audioFilename}`);
        });
    }

    loadLetterAudio() {
        // Load Swedish letter audio for all standard letters (a-z, å, ä, ö)
        // We load all lowercase letters since the audio files are all lowercase
        const allLetters = 'abcdefghijklmnopqrstuvwxyzåäö'.split('');

        allLetters.forEach(letter => {
            const audioKey = `letter_audio_${letter}`;
            const audioFilename = `${letter}.mp3`;
            this.load.audio(audioKey, `letter_audio/${audioFilename}`);
        });
    }

    loadDirectionAudio() {
        // Load direction audio (höger, vänster)
        const directions = ['hoger', 'vanster'];
        directions.forEach(direction => {
            const audioKey = `direction_audio_${direction}`;
            const audioFilename = `${direction}.mp3`;
            this.load.audio(audioKey, `direction_audio/${audioFilename}`);
        });
    }

    loadNumberAudio() {
        // Load number audio for numbers 0-99 (individual files)
        for (let num = 0; num <= 99; num++) {
            const audioKey = `number_audio_${num}`;
            const audioFilename = `${num}.mp3`;
            this.load.audio(audioKey, `number_audio/${audioFilename}`);
        }

        // Load hundreds markers (100, 200, 300) for runtime stitching
        // Numbers 100-399 will be composed by playing hundreds + remainder
        // e.g., 245 = play "200" + "45"
        const hundreds = [100, 200, 300];
        hundreds.forEach(num => {
            const audioKey = `number_audio_${num}`;
            const audioFilename = `${num}.mp3`;
            this.load.audio(audioKey, `number_audio/${audioFilename}`);
        });
    }

    loadWordAudio() {
        // Load word audio for spelling game
        const words = getAllWords();
        console.log(`Loading ${words.length} word audio files...`);
        words.forEach(wordObj => {
            const audioKey = `word_audio_${wordObj.word}`;
            const audioFilename = `${wordObj.word}.mp3`;
            this.load.audio(audioKey, `word_audio/${audioFilename}`);
        });
        console.log('Word audio loading queued');
    }

    loadDayAudio() {
        // Load Swedish day of week audio
        const days = [
            { num: 1, name: 'mandag' },
            { num: 2, name: 'tisdag' },
            { num: 3, name: 'onsdag' },
            { num: 4, name: 'torsdag' },
            { num: 5, name: 'fredag' },
            { num: 6, name: 'lordag' },
            { num: 7, name: 'sondag' }
        ];
        days.forEach(day => {
            const audioKey = `day_${day.num}_${day.name}`;
            const audioFilename = `day_${day.num}_${day.name}.mp3`;
            this.load.audio(audioKey, `day_audio/${audioFilename}`);
        });
    }

    loadShapeDirectionsAudio() {
        // Load prefix audio files
        const prefixes = ['hoger', 'vanster'];
        prefixes.forEach(direction => {
            const audioKey = `shapedir_prefix_${direction}`;
            const audioFilename = `shapedir_prefix_${direction}.mp3`;
            this.load.audio(audioKey, `shapedir_audio/${audioFilename}`);
        });

        // Load color-shape combination audio files
        const colors = ['blue', 'red', 'yellow', 'green', 'orange', 'purple'];
        const shapes = ['circle', 'square', 'triangle', 'star'];

        colors.forEach(color => {
            shapes.forEach(shape => {
                const audioKey = `shapedir_${color}_${shape}`;
                const audioFilename = `shapedir_${color}_${shape}.mp3`;
                this.load.audio(audioKey, `shapedir_audio/${audioFilename}`);
            });
        });
    }

    create() {
        // Generate dice face textures
        this.generateDiceFaces();

        // Generate wheel texture
        this.generateWheelTexture();

        // Store game data globally
        this.registry.set('caughtPokemon', this.loadCaughtPokemon());

        // Start the appropriate scene based on URL routing
        const startScene = this.registry.get('startScene') || 'MainGameScene';
        this.scene.start(startScene);
    }

    generateDiceFaces() {
        // Create 11 dice faces with different colored dots representing each game mode
        const colors = [0xFF6B6B, 0x4ECDC4, 0xFFE66D, 0x95E1D3, 0xA78BFA, 0xFF8C42, 0x26A69A, 0xFFC107, 0xFFD700, 0x00BCD4, 0xE91E63]; // Red, Cyan, Yellow, Mint, Purple, Orange, Teal, Amber, Gold, Cyan Blue, Pink
        const dotPatterns = [
            [{ x: 0.5, y: 0.5 }], // 1 dot (center)
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }], // 2 dots (diagonal)
            [{ x: 0.3, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.7 }], // 3 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 4 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 5 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 6 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.8, y: 0.8 }], // 7 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }], // 8 dots
            [{ x: 0.25, y: 0.25 }, { x: 0.5, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0.25, y: 0.75 }, { x: 0.5, y: 0.75 }, { x: 0.75, y: 0.75 }], // 9 dots (3x3 grid)
            [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }], // 10 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.4 }, { x: 0.2, y: 0.6 }, { x: 0.8, y: 0.6 }, { x: 0.2, y: 0.8 }, { x: 0.4, y: 0.8 }, { x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }] // 11 dots
        ];

        for (let i = 0; i < 11; i++) {
            const graphics = this.add.graphics();

            // Draw white rounded rectangle background
            graphics.fillStyle(0xFFFFFF, 1);
            graphics.fillRoundedRect(0, 0, 100, 100, 10);

            // Draw border
            graphics.lineStyle(4, 0x000000, 1);
            graphics.strokeRoundedRect(0, 0, 100, 100, 10);

            // Draw dots
            graphics.fillStyle(colors[i], 1);
            dotPatterns[i].forEach(dot => {
                const x = dot.x * 100;
                const y = dot.y * 100;
                graphics.fillCircle(x, y, 12);

                // Border on dots
                graphics.lineStyle(2, 0x000000, 1);
                graphics.strokeCircle(x, y, 12);
            });

            // Generate texture
            graphics.generateTexture(`dice-face-${i + 1}`, 100, 100);
            graphics.destroy();
        }
    }

    generateWheelTexture() {
        const size = 600;
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2 - 10;
        const slices = 11;
        const anglePerSlice = (Math.PI * 2) / slices;

        // Slice colors (matching dice colors)
        const colors = [0xFF6B6B, 0x4ECDC4, 0xFFE66D, 0x95E1D3, 0xA78BFA, 0xFF8C42, 0x26A69A, 0xFFC107, 0xFFD700, 0x00BCD4, 0xE91E63];

        // Icon keys in order (matching gameModeMap face order)
        const iconKeys = [
            'game-mode-letter',
            'game-mode-word',
            'game-mode-emojiword',
            'game-mode-directions',
            'game-mode-lettermatch',
            'game-mode-speech',
            'game-mode-numbers',
            'game-mode-spelling',
            'game-mode-legendary',
            'game-mode-legendary-numbers',
            'game-mode-dayofweek'
        ];

        const graphics = this.add.graphics();

        // Draw each slice
        // Offset by half a slice so slice 0 is CENTERED at the top (not edge at top)
        const offset = -Math.PI / 2 - anglePerSlice / 2;
        for (let i = 0; i < slices; i++) {
            const startAngle = i * anglePerSlice + offset;
            const endAngle = (i + 1) * anglePerSlice + offset;

            // Draw slice background
            graphics.fillStyle(colors[i], 1);
            graphics.beginPath();
            graphics.moveTo(centerX, centerY);
            graphics.arc(centerX, centerY, radius, startAngle, endAngle, false);
            graphics.closePath();
            graphics.fillPath();

            // Draw slice border
            graphics.lineStyle(3, 0x000000, 1);
            graphics.beginPath();
            graphics.moveTo(centerX, centerY);
            graphics.lineTo(
                centerX + Math.cos(startAngle) * radius,
                centerY + Math.sin(startAngle) * radius
            );
            graphics.strokePath();
        }

        // Draw outer circle border (after slices)
        graphics.lineStyle(6, 0x000000, 1);
        graphics.strokeCircle(centerX, centerY, radius);

        // Generate the base wheel texture
        graphics.generateTexture('game-wheel-base', size, size);
        graphics.clear();
        graphics.destroy();

        // Now create a render texture to add the icons
        const rt = this.add.renderTexture(0, 0, size, size);

        // First draw the base wheel
        const wheelBase = this.add.image(centerX, centerY, 'game-wheel-base');
        rt.draw(wheelBase);
        wheelBase.destroy();

        // Add icons to each slice
        for (let i = 0; i < slices; i++) {
            // Use same offset as slice drawing to center icons properly
            const sliceOffset = -Math.PI / 2 - anglePerSlice / 2;
            const angle = i * anglePerSlice + sliceOffset + anglePerSlice / 2; // Center of slice
            const iconDistance = radius * 0.65; // 65% from center
            const iconX = centerX + Math.cos(angle) * iconDistance;
            const iconY = centerY + Math.sin(angle) * iconDistance;

            const icon = this.add.image(iconX, iconY, iconKeys[i]);
            icon.setScale(0.35); // Smaller icons to fit better
            // Rotate icon so top faces outward from center
            const angleDegrees = (angle * 180 / Math.PI); // Convert to degrees
            icon.setAngle(angleDegrees + 90); // +90 to align top edge outward
            rt.draw(icon);
            icon.destroy();
        }

        // Save as final wheel texture
        rt.saveTexture('game-wheel');
        rt.destroy();

        // Generate pointer (triangle at top)
        const pointer = this.add.graphics();
        pointer.fillStyle(0xFF4444, 1);
        pointer.lineStyle(3, 0x000000, 1);
        pointer.beginPath();
        pointer.moveTo(50, 0);
        pointer.lineTo(30, 40);
        pointer.lineTo(70, 40);
        pointer.closePath();
        pointer.fillPath();
        pointer.strokePath();
        pointer.generateTexture('wheel-pointer', 100, 40);
        pointer.destroy();
    }

    loadCaughtPokemon() {
        const saved = localStorage.getItem('pokemonCaughtList');
        return saved ? JSON.parse(saved) : [];
    }
}
