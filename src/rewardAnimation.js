/**
 * Gift Box Reward Animation
 * Shows gift box opening animation with coin reward
 */

/**
 * Create and show gift box reward animation
 * @param {Phaser.Scene} scene - The Phaser scene to add the animation to
 * @param {number} coinAmount - Amount of coins to show (1-3)
 * @param {Function} onComplete - Callback when animation completes
 */
export function showGiftBoxReward(scene, coinAmount, onComplete) {
  const centerX = scene.cameras.main.width / 2;
  const centerY = scene.cameras.main.height / 2;

  // Create semi-transparent overlay
  const overlay = scene.add.rectangle(
    0, 0,
    scene.cameras.main.width,
    scene.cameras.main.height,
    0x000000,
    0.5
  );
  overlay.setOrigin(0, 0);
  overlay.setDepth(1000);

  // Create gift box emoji text
  const giftBox = scene.add.text(centerX, centerY, '🎁', {
    fontSize: '120px',
    align: 'center'
  });
  giftBox.setOrigin(0.5);
  giftBox.setDepth(1001);
  giftBox.setScale(0);

  // Scale in the gift box
  scene.tweens.add({
    targets: giftBox,
    scale: 1,
    duration: 300,
    ease: 'Back.easeOut',
    onComplete: () => {
      // Start jiggle animation
      jiggleGiftBox(scene, giftBox, () => {
        // Explosion and reveal coins
        explodeAndReveal(scene, giftBox, coinAmount, () => {
          // Clean up overlay
          overlay.destroy();
          if (onComplete) {
            onComplete();
          }
        });
      });
    }
  });
}

/**
 * Jiggle/shake animation for gift box
 */
function jiggleGiftBox(scene, giftBox, onComplete) {
  const jiggleCount = 6;
  let currentJiggle = 0;

  const jiggle = () => {
    if (currentJiggle >= jiggleCount) {
      // Reset rotation and proceed
      giftBox.setRotation(0);
      if (onComplete) {
        onComplete();
      }
      return;
    }

    scene.tweens.add({
      targets: giftBox,
      rotation: currentJiggle % 2 === 0 ? 0.2 : -0.2,
      duration: 100,
      yoyo: true,
      onComplete: () => {
        currentJiggle++;
        jiggle();
      }
    });
  };

  jiggle();
}

/**
 * Create explosion particle effect and reveal coins
 */
function explodeAndReveal(scene, giftBox, coinAmount, onComplete) {
  const centerX = giftBox.x;
  const centerY = giftBox.y;

  // Create particle explosion
  const particles = [];
  const particleCount = 20;
  const colors = [0xFFD700, 0xFFA500, 0xFFFF00, 0xFFE4B5]; // Gold colors

  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount;
    const color = colors[Math.floor(Math.random() * colors.length)];

    const particle = scene.add.rectangle(
      centerX, centerY,
      10, 10,
      color
    );
    particle.setDepth(1002);
    particles.push(particle);

    // Animate particle outward
    const distance = 100 + Math.random() * 50;
    scene.tweens.add({
      targets: particle,
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        particle.destroy();
      }
    });
  }

  // Hide gift box
  scene.tweens.add({
    targets: giftBox,
    alpha: 0,
    scale: 0.5,
    duration: 300,
    onComplete: () => {
      giftBox.destroy();

      // Show coin reward
      showCoinReveal(scene, centerX, centerY, coinAmount, onComplete);
    }
  });
}

/**
 * Show the coin amount reveal
 */
function showCoinReveal(scene, x, y, coinAmount, onComplete) {
  // Create coin sprite
  const coinSprite = scene.add.image(x, y - 30, 'coin');
  coinSprite.setOrigin(0.5);
  coinSprite.setDepth(1001);
  coinSprite.setScale(0);

  // Create amount text
  const amountText = scene.add.text(x, y + 50, `+${coinAmount}`, {
    fontSize: '48px',
    fontFamily: 'Arial',
    color: '#FFD700',
    stroke: '#000000',
    strokeThickness: 4,
    align: 'center'
  });
  amountText.setOrigin(0.5);
  amountText.setDepth(1001);
  amountText.setScale(0);

  // Animate coin and text
  scene.tweens.add({
    targets: [coinSprite, amountText],
    scale: 0.8, // 128px * 0.8 = ~102px (good size for reward reveal)
    duration: 400,
    ease: 'Back.easeOut',
    onComplete: () => {
      // Add sparkle effect
      addSparkles(scene, x, y);

      // Hold for a moment, then fade out
      scene.time.delayedCall(1000, () => {
        scene.tweens.add({
          targets: [coinSprite, amountText],
          alpha: 0,
          y: y - 50,
          duration: 400,
          onComplete: () => {
            coinSprite.destroy();
            amountText.destroy();
            if (onComplete) {
              onComplete();
            }
          }
        });
      });
    }
  });
}

/**
 * Add sparkle particles around the coin
 */
function addSparkles(scene, x, y) {
  const sparkleCount = 8;

  for (let i = 0; i < sparkleCount; i++) {
    const angle = (Math.PI * 2 * i) / sparkleCount;
    const distance = 60;

    const sparkle = scene.add.text(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      '✨',
      { fontSize: '24px' }
    );
    sparkle.setOrigin(0.5);
    sparkle.setDepth(1001);
    sparkle.setAlpha(0);

    scene.tweens.add({
      targets: sparkle,
      alpha: 1,
      duration: 200,
      yoyo: true,
      onComplete: () => {
        sparkle.destroy();
      }
    });
  }
}
