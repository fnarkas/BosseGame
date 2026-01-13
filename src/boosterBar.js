/**
 * Booster Bar UI Component
 * Visual display of streak multiplier (1x-5x)
 */

/**
 * Create booster bar at specified position
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {number} x - Center x position
 * @param {number} y - Center y position
 * @param {number} depth - Z-depth for rendering order
 * @returns {Object} Bar elements for updates
 */
export function createBoosterBar(scene, x, y, depth = 100) {
  const elements = {
    container: [],
    segments: [],
    fills: [],
    multiplierText: null,
    glowTween: null
  };

  const segmentWidth = 50;
  const segmentHeight = 30;
  const spacing = 8;
  const totalWidth = (segmentWidth * 5) + (spacing * 4);
  const startX = x - totalWidth / 2;

  // Background container (dark background for visibility)
  const bgRect = scene.add.rectangle(
    x, y,
    totalWidth + 20, segmentHeight + 20,
    0x000000, 0.5
  );
  bgRect.setDepth(depth);
  elements.container.push(bgRect);

  // Create 5 segments
  for (let i = 0; i < 5; i++) {
    const segX = startX + i * (segmentWidth + spacing) + segmentWidth / 2;

    // Segment outline (border)
    const outline = scene.add.rectangle(
      segX, y,
      segmentWidth, segmentHeight,
      0xffffff, 0
    );
    outline.setStrokeStyle(3, 0xffffff);
    outline.setDepth(depth + 1);
    elements.segments.push(outline);
    elements.container.push(outline);

    // Filled segment (initially hidden)
    const fill = scene.add.rectangle(
      segX, y,
      segmentWidth - 6, segmentHeight - 6,
      0x27AE60, 1
    );
    fill.setDepth(depth + 2);
    fill.setAlpha(0);
    elements.fills.push(fill);
    elements.container.push(fill);
  }

  // Multiplier text (shows x1 to x5)
  const multiplierText = scene.add.text(x, y, 'x1', {
    fontSize: '24px',
    fontFamily: 'Arial',
    color: '#ffffff',
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 4
  });
  multiplierText.setOrigin(0.5);
  multiplierText.setDepth(depth + 3);
  elements.multiplierText = multiplierText;
  elements.container.push(multiplierText);

  return elements;
}

/**
 * Update booster bar visual based on streak
 * @param {Object} elements - Bar elements returned from createBoosterBar
 * @param {number} streak - Current streak value (0-5)
 * @param {Phaser.Scene} scene - The Phaser scene (for tweens)
 */
export function updateBoosterBar(elements, streak, scene) {
  const multiplier = Math.max(1, streak);

  // Update multiplier text
  elements.multiplierText.setText(`x${multiplier}`);

  // Update segment fills with animation
  for (let i = 0; i < 5; i++) {
    const shouldBeFilled = i < streak;
    const fill = elements.fills[i];

    if (shouldBeFilled && fill.alpha === 0) {
      // Animate fill appearing
      scene.tweens.add({
        targets: fill,
        alpha: 1,
        scale: { from: 0.5, to: 1 },
        duration: 300,
        ease: 'Back.easeOut'
      });

      // Change color based on level
      const colors = [
        0x95A5A6, // Gray (not used, starts at 1)
        0x3498DB, // Blue x1
        0x2ECC71, // Green x2
        0xF39C12, // Orange x3
        0xE74C3C, // Red x4
        0x9B59B6  // Purple x5
      ];
      fill.setFillStyle(colors[streak]);
    } else if (!shouldBeFilled && fill.alpha === 1) {
      // Animate fill disappearing
      scene.tweens.add({
        targets: fill,
        alpha: 0,
        scale: 0.5,
        duration: 200,
        ease: 'Cubic.easeIn'
      });
    }
  }

  // Stop existing glow if any
  if (elements.glowTween) {
    elements.glowTween.stop();
    elements.glowTween = null;
  }

  // Add glow effect at max streak (5x)
  if (streak === 5) {
    // Glow the segments
    elements.glowTween = scene.tweens.add({
      targets: elements.fills,
      alpha: { from: 1, to: 0.6 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Pulse the multiplier text
    scene.tweens.add({
      targets: elements.multiplierText,
      scale: { from: 1, to: 1.2 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  } else {
    // Reset text scale if not at max
    elements.multiplierText.setScale(1);
  }
}

/**
 * Hide booster bar
 * @param {Object} elements - Bar elements to hide
 */
export function hideBoosterBar(elements) {
  if (!elements) return;

  elements.container.forEach(el => {
    if (el && el.setVisible) {
      el.setVisible(false);
    }
  });
}

/**
 * Show booster bar
 * @param {Object} elements - Bar elements to show
 */
export function showBoosterBar(elements) {
  if (!elements) return;

  elements.container.forEach(el => {
    if (el && el.setVisible) {
      el.setVisible(true);
    }
  });
}

/**
 * Destroy booster bar and clean up
 * @param {Object} elements - Bar elements to destroy
 */
export function destroyBoosterBar(elements) {
  if (!elements) return;

  // Stop glow tween if active
  if (elements.glowTween) {
    elements.glowTween.stop();
  }

  // Destroy all elements
  elements.container.forEach(el => {
    if (el && el.destroy) {
      el.destroy();
    }
  });
}
