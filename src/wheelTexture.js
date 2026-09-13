// Draws the spin wheel ('game-wheel' texture) from the enabled slices, and
// keeps it in step with the configured probabilities.
//
// BootScene builds the wheel once at start-up. The probabilities can change
// while the game is open (a parent saving them in /admin on another device;
// account.js live sync pulls the new config), so PokeballGameScene calls
// refreshWheel() before every spin: if the set of enabled slices differs from
// the one the wheel was drawn for, the texture is redrawn and the registry's
// slice order (which the spin uses to land on the right slice) is replaced.

import { loadModeWeights, getEnabledSlices } from './minigameWheel.js';

export const WHEEL_TEXTURE = 'game-wheel';
export const WHEEL_BASE_TEXTURE = 'game-wheel-base';
export const WHEEL_POINTER_TEXTURE = 'wheel-pointer';
export const WHEEL_SIZE = 600;

function removeTexture(scene, key) {
    if (scene.textures && scene.textures.exists(key)) scene.textures.remove(key);
}

// Draw the wheel for `enabledSlices` into the WHEEL_TEXTURE texture (replacing
// any previous wheel) and remember the slice order in the registry.
export function buildWheelTexture(scene, enabledSlices) {
    const size = WHEEL_SIZE;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 10;
    const slices = enabledSlices.length;
    const anglePerSlice = (Math.PI * 2) / slices;

    // Per-slice color and icon come from the shared wheel definition, so the
    // wheel only contains the modes that are actually enabled in the config.
    const colors = enabledSlices.map(slice => slice.color);
    const iconKeys = enabledSlices.map(slice => slice.iconKey);

    removeTexture(scene, WHEEL_TEXTURE);
    removeTexture(scene, WHEEL_BASE_TEXTURE);

    const graphics = scene.add.graphics();

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
    graphics.generateTexture(WHEEL_BASE_TEXTURE, size, size);
    graphics.clear();
    graphics.destroy();

    // Now create a render texture to add the icons
    const rt = scene.add.renderTexture(0, 0, size, size);

    // First draw the base wheel
    const wheelBase = scene.add.image(centerX, centerY, WHEEL_BASE_TEXTURE);
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

        const icon = scene.add.image(iconX, iconY, iconKeys[i]);
        icon.setScale(0.35); // Smaller icons to fit better
        // Rotate icon so top faces outward from center
        const angleDegrees = (angle * 180 / Math.PI); // Convert to degrees
        icon.setAngle(angleDegrees + 90); // +90 to align top edge outward
        rt.draw(icon);
        icon.destroy();
    }

    // Save as final wheel texture
    rt.saveTexture(WHEEL_TEXTURE);
    rt.destroy();

    scene.registry.set('wheelSlices', enabledSlices);
    return enabledSlices;
}

// The red triangle above the wheel. Drawn once; it never changes.
export function buildWheelPointerTexture(scene) {
    if (scene.textures && scene.textures.exists(WHEEL_POINTER_TEXTURE)) return;
    const pointer = scene.add.graphics();
    pointer.fillStyle(0xFF4444, 1);
    pointer.lineStyle(3, 0x000000, 1);
    pointer.beginPath();
    pointer.moveTo(50, 0);
    pointer.lineTo(30, 40);
    pointer.lineTo(70, 40);
    pointer.closePath();
    pointer.fillPath();
    pointer.strokePath();
    pointer.generateTexture(WHEEL_POINTER_TEXTURE, 100, 40);
    pointer.destroy();
}

export function sameSlices(a, b) {
    return a.length === b.length && a.every((slice, i) => slice.name === b[i].name);
}

// Redraw the wheel if the configured probabilities no longer match the slices
// it was drawn for. Resolves true when it was redrawn.
export async function refreshWheel(scene) {
    const weights = await loadModeWeights();
    const enabled = getEnabledSlices(weights);
    const current = scene.registry.get('wheelSlices') || [];
    if (sameSlices(current, enabled) && scene.textures.exists(WHEEL_TEXTURE)) return false;
    buildWheelTexture(scene, enabled);
    console.log(`Wheel redrawn with ${enabled.length} slices`);
    return true;
}
