// Stateless UI building blocks shared by the pokeball game modes.
//
// Everything here is a plain function of (scene, options): no `this`, no
// bookkeeping. BasePokeballGameMode wraps the ones that need to be tracked in
// `uiElements` or cancelled by cleanup(). Modes should import constants and
// factories from here instead of re-declaring the same colours, text styles
// and shapes.

export const CANVAS = { WIDTH: 1280, HEIGHT: 900 };

export const COLORS = {
    CORRECT: 0x27AE60,        // green fill/stroke for a right answer or done progress
    WRONG: 0xFF0000,          // red flash on a wrong tap
    REVEAL: 0xFFD700,         // gold: the correct answer being shown, drop-zone hover
    NEUTRAL_FILL: 0xFFFFFF,
    NEUTRAL_STROKE: 0x3498DB,
    HOVER_FILL: 0xECF0F1,
    HOVER_STROKE: 0x2980B9,
    DISABLED: 0x95A5A6,
    TEXT_DARK: '#2C3E50',
    OUTLINE: 0x000000
};

export const LAYOUT = {
    HUD_Y: 70,
    TIMER_Y: 150,
    COIN_Y: 240,
    BAR_MARGIN: 120
};

export const TEXT = {
    title:   { fontSize: '72px', fontFamily: 'Arial', color: COLORS.TEXT_DARK, fontStyle: 'bold' },
    big:     { fontSize: '56px', fontFamily: 'Arial', color: COLORS.TEXT_DARK, fontStyle: 'bold' },
    option:  { fontSize: '48px', fontFamily: 'Arial', color: COLORS.TEXT_DARK, fontStyle: 'bold' },
    label:   { fontSize: '32px', fontFamily: 'Arial', color: COLORS.TEXT_DARK, fontStyle: 'bold' },
    status:  { fontSize: '24px', fontFamily: 'Arial', color: '#95A5A6' },
    hearts:  { fontSize: '36px', fontFamily: 'Arial' },
    emojiXl: { fontSize: '120px', padding: { y: 20 } },
    emojiLg: { fontSize: '72px', padding: { y: 10 } },
    emojiMd: { fontSize: '48px', padding: { y: 10 } }
};

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

// Generate the shared 5-point star texture once per scene.
export function ensureStarTexture(scene, key = 'star', { outer = 12, inner = 5, points = 5, fill = 0xFFFF00, stroke = 0xFFD700, size = 24 } = {}) {
    if (scene.textures.exists(key)) return key;
    const g = scene.add.graphics();
    g.fillStyle(fill, 1);
    g.lineStyle(2, stroke);
    const c = size / 2;
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = (i * Math.PI) / points;
        const x = c + radius * Math.sin(angle);
        const y = c - radius * Math.cos(angle);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.generateTexture(key, size, size);
    g.destroy();
    return key;
}

// One burst of stars at (x, y). Returns the emitter; the caller owns its
// destruction (BasePokeballGameMode.showSuccessParticles does that for modes).
export function burstStars(scene, x, y, { quantity = 15, scale = 2, lifespan = 600, depth = 100, speed = { min: 100, max: 200 }, tint = [0xFFFF00, 0xFFD700, 0xFFA500] } = {}) {
    const key = ensureStarTexture(scene);
    const particles = scene.add.particles(x, y, key, {
        speed,
        angle: { min: 0, max: 360 },
        scale: { start: scale, end: 0 },
        lifespan,
        gravityY: 150,
        tint,
        quantity
    });
    particles.setDepth(depth);
    particles.explode();
    return particles;
}

// ---------------------------------------------------------------------------
// Progress indicators
// ---------------------------------------------------------------------------

// A row of circles that fill green as the child gets answers right, ending in
// a goal emoji (the gift). The whole row, gift included, is centred on `x`.
export function createProgressBalls(scene, {
    total, completed = 0, y, x = scene.cameras.main.width / 2,
    spacing = 60, radius = 20, goalEmoji = '🎁',
    doneColor = COLORS.CORRECT, todoColor = COLORS.NEUTRAL_FILL,
    stateFor = null // optional (index) => color, overrides completed/done/todo
} = {}) {
    const slots = total + (goalEmoji ? 1 : 0);
    const startX = x - ((slots - 1) * spacing) / 2;
    const circles = [];
    const elements = [];

    const colorFor = (i, done) => stateFor ? stateFor(i) : (i < done ? doneColor : todoColor);

    for (let i = 0; i < total; i++) {
        const circle = scene.add.circle(startX + i * spacing, y, radius, colorFor(i, completed), 1);
        circle.setStrokeStyle(3, COLORS.OUTLINE);
        circles.push(circle);
        elements.push(circle);
    }
    if (goalEmoji) {
        const goal = scene.add.text(startX + total * spacing, y, goalEmoji, TEXT.emojiMd).setOrigin(0.5);
        elements.push(goal);
    }

    return {
        elements,
        circles,
        update(done) {
            circles.forEach((circle, i) => {
                if (circle.scene) circle.setFillStyle(colorFor(i, done));
            });
        }
    };
}

// Hearts row: ❤️ for lives left, 🖤 for lives lost. Clamped so a stray negative
// count can never make String.repeat throw.
export function heartsString(max, remaining) {
    const safeMax = Math.max(0, max | 0);
    const safeRemaining = Math.min(safeMax, Math.max(0, remaining | 0));
    return '❤️'.repeat(safeRemaining) + '🖤'.repeat(safeMax - safeRemaining);
}

export function createHearts(scene, { max, remaining = max, x = scene.cameras.main.width / 2, y = LAYOUT.HUD_Y } = {}) {
    const text = scene.add.text(x, y, heartsString(max, remaining), TEXT.hearts).setOrigin(0.5);
    return {
        text,
        update(left) {
            if (text.scene) text.setText(heartsString(max, left));
        }
    };
}

// ---------------------------------------------------------------------------
// Drag-and-drop zones
// ---------------------------------------------------------------------------

export function drawDashedRect(graphics, x, y, width, height, dashLength = 8, gapLength = 6) {
    const perimeter = [
        { x1: x, y1: y, x2: x + width, y2: y },
        { x1: x + width, y1: y, x2: x + width, y2: y + height },
        { x1: x + width, y1: y + height, x2: x, y2: y + height },
        { x1: x, y1: y + height, x2: x, y2: y }
    ];
    perimeter.forEach(line => {
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.floor(length / (dashLength + gapLength));
        for (let i = 0; i < steps; i++) {
            const t1 = i * (dashLength + gapLength) / length;
            const t2 = (i * (dashLength + gapLength) + dashLength) / length;
            graphics.lineBetween(line.x1 + dx * t1, line.y1 + dy * t1, line.x1 + dx * t2, line.y1 + dy * t2);
        }
    });
}

// Highlight whichever unmatched zone the pointer is over (gold) and reset the
// others. Returns the hovered zone or null. Zones must carry 'originalAlpha'
// and 'matched' data keys.
export function updateZoneHover(zones, pointer, { hoverColor = COLORS.REVEAL, hoverAlpha = 0.5 } = {}) {
    let hovered = null;
    zones.forEach(zone => {
        if (zone.getData('matched')) return;
        const bounds = zone.getBounds();
        const isOver = pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
                       pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
        if (isOver) {
            zone.setFillStyle(hoverColor, hoverAlpha);
            hovered = zone;
        } else {
            zone.setFillStyle(COLORS.NEUTRAL_FILL, zone.getData('originalAlpha'));
        }
    });
    return hovered;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

// Standard hover/out styling for a rectangle option button. `isLocked` is
// consulted so a button never re-styles itself during a reveal.
export function wireButtonHover(button, isLocked = () => false, {
    fill = COLORS.NEUTRAL_FILL, stroke = COLORS.NEUTRAL_STROKE, strokeWidth = 4,
    hoverFill = COLORS.HOVER_FILL, hoverStroke = COLORS.HOVER_STROKE, hoverStrokeWidth = 6
} = {}) {
    button.on('pointerover', () => {
        if (isLocked()) return;
        button.setFillStyle(hoverFill);
        button.setStrokeStyle(hoverStrokeWidth, hoverStroke);
    });
    button.on('pointerout', () => {
        if (isLocked()) return;
        button.setFillStyle(fill);
        button.setStrokeStyle(strokeWidth, stroke);
    });
}

export function resetButtonStyle(button, { fill = COLORS.NEUTRAL_FILL, stroke = COLORS.NEUTRAL_STROKE, strokeWidth = 4 } = {}) {
    if (!button || !button.scene) return;
    if (button.setFillStyle) button.setFillStyle(fill, 1);
    if (button.setStrokeStyle) button.setStrokeStyle(strokeWidth, stroke);
    if (button.setAlpha) button.setAlpha(1);
}
