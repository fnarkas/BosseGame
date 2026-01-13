/**
 * Reward Animation
 * Shows gift box (normal modes) or treasure chest (legendary modes) opening animation with coin reward
 */

/**
 * Create and show reward animation
 * @param {Phaser.Scene} scene - The Phaser scene to add the animation to
 * @param {number} coinAmount - Amount of coins to show (already multiplied)
 * @param {number} multiplier - Streak multiplier (1-5) or null for legendary
 * @param {boolean} isLegendary - Whether this is a legendary mode (uses treasure chest instead of gift)
 * @param {Function} onComplete - Callback when animation completes
 */
export function showGiftBoxReward(scene, coinAmount, multiplier, isLegendary, onComplete) {
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

  let rewardIcon;

  if (isLegendary) {
    // Create treasure chest sprite for legendary modes
    rewardIcon = scene.add.image(centerX, centerY, 'treasure-chest');
    rewardIcon.setOrigin(0.5);
    rewardIcon.setDepth(1001);
    rewardIcon.setScale(0);
  } else {
    // Create gift box emoji for normal modes
    rewardIcon = scene.add.text(centerX, centerY, '🎁', {
      fontSize: '120px',
      align: 'center',
      padding: { y: 30 }
    });
    rewardIcon.setOrigin(0.5);
    rewardIcon.setDepth(1001);
    rewardIcon.setScale(0);
  }

  // Scale in the reward icon
  scene.tweens.add({
    targets: rewardIcon,
    scale: isLegendary ? 1.2 : 1,
    duration: 300,
    ease: 'Back.easeOut',
    onComplete: () => {
      if (isLegendary) {
        // Bounce animation for treasure chest
        bounceTreasureChest(scene, rewardIcon, () => {
          // Explosion and reveal coins
          explodeAndReveal(scene, rewardIcon, coinAmount, multiplier, () => {
            overlay.destroy();
            if (onComplete) {
              onComplete();
            }
          });
        });
      } else {
        // Jiggle animation for gift box
        jiggleGiftBox(scene, rewardIcon, () => {
          // Explosion and reveal coins
          explodeAndReveal(scene, rewardIcon, coinAmount, multiplier, () => {
            overlay.destroy();
            if (onComplete) {
              onComplete();
            }
          });
        });
      }
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
 * Bounce animation for treasure chest (simulates it shaking/unlocking)
 */
function bounceTreasureChest(scene, treasureChest, onComplete) {
  const bounceCount = 3;
  let currentBounce = 0;

  const bounce = () => {
    if (currentBounce >= bounceCount) {
      // Reset and proceed
      treasureChest.setScale(1.2);
      if (onComplete) {
        onComplete();
      }
      return;
    }

    // Bounce up and down
    scene.tweens.add({
      targets: treasureChest,
      y: treasureChest.y - 20,
      scale: 1.3,
      duration: 150,
      yoyo: true,
      onComplete: () => {
        currentBounce++;
        bounce();
      }
    });
  };

  bounce();
}

/**
 * Create explosion particle effect and reveal coins
 */
function explodeAndReveal(scene, treasureChest, coinAmount, multiplier, onComplete) {
  const centerX = treasureChest.x;
  const centerY = treasureChest.y;

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

  // Hide treasure chest
  scene.tweens.add({
    targets: treasureChest,
    alpha: 0,
    scale: 0.5,
    duration: 300,
    onComplete: () => {
      treasureChest.destroy();

      // Show coin reward (with multiplier if > 1)
      showCoinReveal(scene, centerX, centerY, coinAmount, multiplier, onComplete);
    }
  });
}

/**
 * Show the coin amount reveal
 */
function showCoinReveal(scene, x, y, coinAmount, multiplier, onComplete) {
  // If multiplier > 1, show multiplier first
  if (multiplier > 1) {
    showMultiplierAnimation(scene, x, y, multiplier, () => {
      // Then show coins
      showCoinAmountAnimation(scene, x, y, coinAmount, onComplete);
    });
  } else {
    // No multiplier, show coins directly
    showCoinAmountAnimation(scene, x, y, coinAmount, onComplete);
  }
}

/**
 * Show multiplier animation (only if > 1)
 */
function showMultiplierAnimation(scene, x, y, multiplier, onComplete) {
  // Create multiplier text
  const multiplierText = scene.add.text(x, y, `x${multiplier}`, {
    fontSize: '80px',
    fontFamily: 'Arial',
    color: '#FFD700',
    fontStyle: 'bold',
    stroke: '#FF6B6B',
    strokeThickness: 6,
    align: 'center'
  });
  multiplierText.setOrigin(0.5);
  multiplierText.setDepth(1001);
  multiplierText.setScale(0);

  // Animate multiplier appearing
  scene.tweens.add({
    targets: multiplierText,
    scale: 2,
    duration: 400,
    ease: 'Back.easeOut',
    onComplete: () => {
      // Pulse effect
      scene.tweens.add({
        targets: multiplierText,
        scale: 2.2,
        duration: 300,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          // Fade out multiplier
          scene.tweens.add({
            targets: multiplierText,
            alpha: 0,
            scale: 3,
            duration: 400,
            ease: 'Cubic.easeIn',
            onComplete: () => {
              multiplierText.destroy();
              if (onComplete) {
                onComplete();
              }
            }
          });
        }
      });
    }
  });

  // Add glow particles around multiplier
  addMultiplierGlow(scene, x, y);
}

/**
 * Add glow effect around multiplier
 */
function addMultiplierGlow(scene, x, y) {
  const glowCount = 12;
  const radius = 100;

  for (let i = 0; i < glowCount; i++) {
    const angle = (Math.PI * 2 * i) / glowCount;

    const glow = scene.add.text(
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      '✨',
      { fontSize: '32px', padding: { y: 8 } }
    );
    glow.setOrigin(0.5);
    glow.setDepth(1000);
    glow.setAlpha(0);

    scene.tweens.add({
      targets: glow,
      alpha: 1,
      x: x + Math.cos(angle) * (radius + 30),
      y: y + Math.sin(angle) * (radius + 30),
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: glow,
          alpha: 0,
          duration: 200,
          onComplete: () => {
            glow.destroy();
          }
        });
      }
    });
  }
}

/**
 * Show coin amount animation
 */
function showCoinAmountAnimation(scene, x, y, coinAmount, onComplete) {
  // Create coin sprite (using tiny version for better quality)
  const coinSprite = scene.add.image(x, y - 30, 'coin-tiny');
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
    scale: 1.6, // 64px * 1.6 = ~102px (good size for reward reveal)
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
      { fontSize: '24px', padding: { y: 5 } }
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
