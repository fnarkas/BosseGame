/**
 * Reusable Letter Slots Component
 * Creates letter slots for spelling games (e.g., Pokemon name, word spelling)
 */

const SWEDISH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');

/**
 * Create letter slots
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {string} word - The word to display
 * @param {Object} config - Configuration options
 * @param {number} config.y - Y position for slots (default: 500)
 * @param {boolean} config.showWord - Show letters in slots (default: true)
 * @param {number} config.highlightIndex - Index of highlighted letter (default: null)
 * @param {Set|Array} config.collectedIndices - Indices of collected letters (default: new Set())
 * @param {string} config.nameCase - 'uppercase' or 'lowercase' (default: 'lowercase')
 * @param {boolean} config.clearOnNewEncounter - Add clearOnNewEncounter data flag (default: true)
 * @returns {Object} { elements: [], slots: [], highlightedSlot: {} } - UI elements and slot data
 */
export function createLetterSlots(scene, word, config = {}) {
    const {
        y = 500,
        showWord = true,
        highlightIndex = null,
        collectedIndices = new Set(),
        nameCase = 'lowercase',
        clearOnNewEncounter = true
    } = config;

    const width = scene.cameras.main.width;
    const letterWidth = 60;
    const letterHeight = 80;
    const spacing = 10;

    // Apply case transformation
    const displayWord = nameCase === 'uppercase' ? word.toUpperCase() : word.toLowerCase();
    const letters = displayWord.split('');

    const totalWidth = letters.length * (letterWidth + spacing) - spacing;
    const startX = (width - totalWidth) / 2 + letterWidth / 2;

    const elements = [];
    const slots = [];
    let highlightedSlot = null;

    // Convert collectedIndices to Set if it's an array
    const collected = collectedIndices instanceof Set ? collectedIndices : new Set(collectedIndices);

    letters.forEach((letter, index) => {
        const x = startX + index * (letterWidth + spacing);
        const isHighlight = (index === highlightIndex);
        const isCollected = collected.has(index);

        // Normalize to uppercase for checking against alphabet
        const isLetter = SWEDISH_ALPHABET.includes(letter.toUpperCase());

        if (isLetter) {
            // Determine visual state
            let bgColor, borderColor, borderWidth, alpha;

            if (isCollected) {
                // Collected state: solid green
                bgColor = 0x4CAF50;
                borderColor = 0x388E3C;
                borderWidth = 3;
                alpha = 1.0;
            } else if (isHighlight) {
                // Highlighted state: gold
                bgColor = 0xFFD700;
                borderColor = 0xFF6B00;
                borderWidth = 5;
                alpha = 1.0;
            } else {
                // Uncollected/empty state: faded gray
                bgColor = 0xE8E8E8;
                borderColor = 0xCCCCCC;
                borderWidth = 2;
                alpha = 0.4;
            }

            // Background box
            const bg = scene.add.rectangle(x, y, letterWidth, letterHeight, bgColor);
            bg.setStrokeStyle(borderWidth, borderColor);
            if (clearOnNewEncounter) {
                bg.setData('clearOnNewEncounter', true);
            }
            bg.setData('letterSlot', true);
            bg.setAlpha(alpha);
            elements.push(bg);

            // Add glow effect for highlighted letter
            let glow = null;
            if (isHighlight) {
                glow = scene.add.rectangle(x, y, letterWidth + 10, letterHeight + 10, 0xFFD700, 0.3);
                if (clearOnNewEncounter) {
                    glow.setData('clearOnNewEncounter', true);
                }
                glow.setData('letterSlot', true);
                elements.push(glow);
                bg.setDepth(1);
            }

            // Letter text (only show if showWord is true OR if collected)
            let text = null;
            if (showWord || isCollected) {
                let textColor, fontSize, textAlpha;
                if (isCollected) {
                    textColor = '#FFFFFF';
                    fontSize = 'bold 52px Arial';
                    textAlpha = 1.0;
                } else if (isHighlight) {
                    textColor = '#000000';
                    fontSize = 'bold 52px Arial';
                    textAlpha = 1.0;
                } else {
                    textColor = '#999999';
                    fontSize = 'bold 44px Arial';
                    textAlpha = showWord ? 0.4 : 0; // Hide if not showing word
                }

                text = scene.add.text(x, y, letter, {
                    font: fontSize,
                    fill: textColor
                }).setOrigin(0.5);
                if (clearOnNewEncounter) {
                    text.setData('clearOnNewEncounter', true);
                }
                text.setData('letterSlot', true);
                text.setAlpha(textAlpha);

                if (isHighlight || isCollected) {
                    text.setDepth(2);
                }
                elements.push(text);
            }

            // Store slot data
            const slotData = {
                index,
                letter,
                x,
                y,
                bg,
                text,
                glow,
                isHighlight,
                isCollected,
                isLetter
            };
            slots.push(slotData);

            if (isHighlight) {
                highlightedSlot = slotData;
            }
        } else {
            // Non-letter character (e.g., space, hyphen) - just show text
            const text = scene.add.text(x, y, letter, {
                font: 'bold 52px Arial',
                fill: '#999999'
            }).setOrigin(0.5);
            if (clearOnNewEncounter) {
                text.setData('clearOnNewEncounter', true);
            }
            text.setData('letterSlot', true);
            elements.push(text);

            slots.push({
                index,
                letter,
                x,
                y,
                text,
                isLetter: false
            });
        }
    });

    return {
        elements,
        slots,
        highlightedSlot
    };
}

/**
 * Show particle effect at slot position
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {number} x - X position
 * @param {number} y - Y position
 */
export function showSlotParticleEffect(scene, x, y) {
    // Create star texture if needed
    if (!scene.textures.exists('correctLetterStar')) {
        const graphics = scene.add.graphics();
        graphics.fillStyle(0xFFD700, 1);

        const starPoints = 5;
        const outerRadius = 16;
        const innerRadius = 8;
        const centerOffset = 20;
        graphics.beginPath();
        for (let i = 0; i < starPoints * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / starPoints - Math.PI / 2;
            const px = centerOffset + radius * Math.cos(angle);
            const py = centerOffset + radius * Math.sin(angle);
            if (i === 0) {
                graphics.moveTo(px, py);
            } else {
                graphics.lineTo(px, py);
            }
        }
        graphics.closePath();
        graphics.fillPath();

        graphics.generateTexture('correctLetterStar', 40, 40);
        graphics.destroy();
    }

    // Create particle emitter
    const particles = scene.add.particles(x, y, 'correctLetterStar', {
        speed: { min: 150, max: 250 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.5, end: 0 },
        lifespan: 700,
        gravityY: 150,
        quantity: 20
    });
    particles.setDepth(50);
    particles.explode();

    // Clean up
    scene.time.delayedCall(900, () => {
        particles.destroy();
    });
}

/**
 * Shake/flash error effect on slot
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {Object} slotData - Slot data from createLetterSlots
 */
export function showSlotErrorEffect(scene, slotData) {
    if (!slotData || !slotData.bg) return;

    const { bg, text, glow } = slotData;
    const originalBgColor = 0xFFD700;
    const originalBorderColor = 0xFF6B00;
    const errorColor = 0xFF0000;

    // Flash red
    bg.setFillStyle(errorColor);
    bg.setStrokeStyle(5, errorColor);

    // Shake animation
    const originalX = bg.x;
    const originalTextX = text ? text.x : null;
    const glowOriginalX = glow ? glow.x : null;

    const targets = [bg, text, glow].filter(t => t !== null);

    scene.tweens.add({
        targets,
        x: originalX - 5,
        duration: 50,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
            // Return to original position
            bg.x = originalX;
            if (text) text.x = originalTextX;
            if (glow) glow.x = glowOriginalX;

            // Return to original color
            bg.setFillStyle(originalBgColor);
            bg.setStrokeStyle(5, originalBorderColor);
        }
    });
}

/**
 * Destroy slot elements
 * @param {Array} elements - Elements array from createLetterSlots
 */
export function destroyLetterSlots(elements) {
    elements.forEach(element => {
        if (element && element.destroy) {
            element.destroy();
        }
    });
}
