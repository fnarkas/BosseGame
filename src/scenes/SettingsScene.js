import Phaser from 'phaser';

export default class SettingsScene extends Phaser.Scene {
    constructor() {
        super({ key: 'SettingsScene' });
        this.previousScene = null;
    }

    init(data) {
        // Store which scene we came from so we can return to it
        this.previousScene = data.previousScene || 'MainGameScene';
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Semi-transparent background overlay
        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
        overlay.setOrigin(0, 0);

        // Settings panel background
        const panelWidth = 600;
        const panelHeight = 400;
        const panelX = width / 2;
        const panelY = height / 2;

        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0xFFFFFF, 1);
        panel.setStrokeStyle(4, 0x000000);

        // Title with gear icon
        const title = this.add.text(panelX, panelY - 150, '⚙️', {
            fontSize: '64px',
            color: '#000000'
        }).setOrigin(0.5);

        // Get current volume (0-1)
        const currentVolume = this.getVolume();

        // Volume label with percentage
        const volumeLabel = this.add.text(panelX, panelY - 80, `🔊 ${Math.round(currentVolume * 100)}%`, {
            fontSize: '48px',
            color: '#000000',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Volume slider track
        const sliderWidth = 400;
        const sliderHeight = 20;
        const sliderX = panelX - sliderWidth / 2;
        const sliderY = panelY;

        const sliderTrack = this.add.rectangle(sliderX, sliderY, sliderWidth, sliderHeight, 0xCCCCCC);
        sliderTrack.setOrigin(0, 0.5);
        sliderTrack.setStrokeStyle(2, 0x000000);

        // Volume slider fill (shows current volume)
        const sliderFill = this.add.rectangle(sliderX, sliderY, sliderWidth * currentVolume, sliderHeight, 0x4A90E2);
        sliderFill.setOrigin(0, 0.5);

        // Volume slider handle
        const handleSize = 40;
        const handle = this.add.circle(
            sliderX + sliderWidth * currentVolume,
            sliderY,
            handleSize / 2,
            0xFFFFFF
        );
        handle.setStrokeStyle(4, 0x000000);
        handle.setInteractive({ useHandCursor: true, draggable: true });

        // Drag handler for volume slider
        this.input.on('drag', (pointer, gameObject, dragX) => {
            if (gameObject === handle) {
                // Constrain handle to slider track
                const minX = sliderX;
                const maxX = sliderX + sliderWidth;
                const constrainedX = Phaser.Math.Clamp(dragX, minX, maxX);

                handle.x = constrainedX;

                // Update volume (0-1)
                const volume = (constrainedX - minX) / sliderWidth;
                this.setVolume(volume);

                // Update fill width
                sliderFill.width = sliderWidth * volume;

                // Update label
                volumeLabel.setText(`🔊 ${Math.round(volume * 100)}%`);
            }
        });

        // Test sound button (speaker icon)
        const testButton = this.add.text(panelX, panelY + 80, '🔊', {
            fontSize: '64px',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        testButton.on('pointerdown', () => {
            // Play a test sound (using a number audio as example)
            try {
                const testSound = this.sound.add('number_audio_1');
                testSound.play();
                testSound.once('complete', () => {
                    testSound.destroy();
                });
            } catch (error) {
                console.warn('Test sound failed:', error);
            }
        });

        // Hover effect for test button
        testButton.on('pointerover', () => {
            testButton.setScale(1.1);
        });
        testButton.on('pointerout', () => {
            testButton.setScale(1);
        });

        // Close button (X)
        const closeButton = this.add.text(panelX + panelWidth / 2 - 30, panelY - panelHeight / 2 + 30, '✕', {
            fontSize: '48px',
            color: '#000000',
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeButton.on('pointerdown', () => {
            this.closeSettings();
        });

        // Hover effect for close button
        closeButton.on('pointerover', () => {
            closeButton.setColor('#FF0000');
            closeButton.setScale(1.1);
        });
        closeButton.on('pointerout', () => {
            closeButton.setColor('#000000');
            closeButton.setScale(1);
        });

        // Back button at bottom
        const backButton = this.add.text(panelX, panelY + 150, '← Tillbaka', {
            fontSize: '32px',
            color: '#FFFFFF',
            backgroundColor: '#4A90E2',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        backButton.on('pointerdown', () => {
            this.closeSettings();
        });

        // Hover effect for back button
        backButton.on('pointerover', () => {
            backButton.setBackgroundColor('#3A7BC8');
        });
        backButton.on('pointerout', () => {
            backButton.setBackgroundColor('#4A90E2');
        });
    }

    getVolume() {
        // Get volume from localStorage, default to 100% (1.0)
        const storedVolume = localStorage.getItem('gameVolume');
        return storedVolume !== null ? parseFloat(storedVolume) : 1.0;
    }

    setVolume(volume) {
        // Clamp volume between 0 and 1
        const clampedVolume = Phaser.Math.Clamp(volume, 0, 1);

        // Set global game volume
        this.sound.volume = clampedVolume;

        // Save to localStorage
        localStorage.setItem('gameVolume', clampedVolume.toString());
    }

    closeSettings() {
        // Return to previous scene
        this.scene.stop('SettingsScene');
        this.scene.resume(this.previousScene);
    }
}
