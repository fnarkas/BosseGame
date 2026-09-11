// A fake Phaser scene for exercising the pokeball game modes in Node.
//
// It models just enough of Phaser for the modes: game objects with the setters
// they use, an interactive/event layer so tests can click and drag, a virtual
// clock that drives delayedCall/addEvent timers and tweens deterministically,
// a sound manager that refuses keys BootScene never loaded (like real Phaser),
// and bookkeeping so tests can assert on leaks, orphaned UI and late callbacks.
import { getAssetRegistry } from './assets.js';

const DEFAULT_SOUND_DURATION = 0.5; // seconds

// ---------------------------------------------------------------------------
// Event emitter (subset of eventemitter3 used by Phaser)
// ---------------------------------------------------------------------------
class Emitter {
    constructor() { this._listeners = new Map(); }
    on(event, fn, context) {
        if (typeof fn !== 'function') throw new TypeError(`on('${event}') listener is not a function`);
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push({ fn, context, once: false });
        return this;
    }
    once(event, fn, context) {
        if (typeof fn !== 'function') throw new TypeError(`once('${event}') listener is not a function`);
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push({ fn, context, once: true });
        return this;
    }
    off(event, fn) {
        if (!this._listeners.has(event)) return this;
        if (!fn) { this._listeners.delete(event); return this; }
        this._listeners.set(event, this._listeners.get(event).filter(l => l.fn !== fn));
        return this;
    }
    removeListener(event, fn) { return this.off(event, fn); }
    removeAllListeners(event) {
        if (event) this._listeners.delete(event); else this._listeners.clear();
        return this;
    }
    listenerCount(event) { return (this._listeners.get(event) || []).length; }
    emit(event, ...args) {
        const list = this._listeners.get(event);
        if (!list || list.length === 0) return false;
        for (const l of [...list]) {
            if (l.once) this.off(event, l.fn);
            l.fn.apply(l.context, args);
        }
        return true;
    }
}

// ---------------------------------------------------------------------------
// Game objects
// ---------------------------------------------------------------------------
let nextId = 1;

class GameObject extends Emitter {
    constructor(scene, type, x = 0, y = 0) {
        super();
        this.id = nextId++;
        this.scene = scene;
        this._scene = scene;
        this.type = type;
        this.x = x;
        this.y = y;
        this.alpha = 1;
        this.scaleX = 1;
        this.scaleY = 1;
        this.angle = 0;
        this.rotation = 0;
        this.visible = true;
        this.active = true;
        this.depth = 0;
        this.originX = 0.5;
        this.originY = 0.5;
        this.width = 0;
        this.height = 0;
        this.name = '';
        this.tintTopLeft = 0xffffff;
        this.isTinted = false;
        this.input = null;
        this.parentContainer = null;
        this.destroyed = false;
        this._data = new Map();
        this.createdAt = scene.time.now;
        scene._register(this);
    }

    get scale() { return this.scaleX; }
    set scale(v) { this.scaleX = v; this.scaleY = v; }
    get displayWidth() { return this.width * this.scaleX; }
    set displayWidth(v) { this.scaleX = this.width ? v / this.width : 1; }
    get displayHeight() { return this.height * this.scaleY; }
    set displayHeight(v) { this.scaleY = this.height ? v / this.height : 1; }

    _guard(method) {
        if (this.destroyed) this._scene._useAfterDestroy.push(`${this.type}#${this.id}.${method}`);
    }

    setOrigin(x = 0.5, y = x) { this.originX = x; this.originY = y; return this; }
    setPosition(x = 0, y = x) { this.x = x; this.y = y; return this; }
    setX(x) { this.x = x; return this; }
    setY(y) { this.y = y; return this; }
    setScale(x = 1, y = x) { this.scaleX = x; this.scaleY = y; return this; }
    setAlpha(a = 1) { this.alpha = a; return this; }
    setVisible(v) { this.visible = v; return this; }
    setActive(v) { this.active = v; return this; }
    setDepth(d) { this.depth = d; return this; }
    setAngle(a = 0) { this.angle = a; this.rotation = a * Math.PI / 180; return this; }
    setRotation(r = 0) { this.rotation = r; this.angle = r * 180 / Math.PI; return this; }
    setName(n) { this.name = n; return this; }
    setSize(w, h) { this.width = w; this.height = h; return this; }
    setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; }
    setScrollFactor() { return this; }
    setBlendMode() { return this; }
    setTint(color = 0xffffff) { this.tintTopLeft = color; this.isTinted = true; return this; }
    clearTint() { this.tintTopLeft = 0xffffff; this.isTinted = false; return this; }
    setData(key, value) {
        this._guard('setData');
        if (typeof key === 'object') {
            for (const k of Object.keys(key)) this._data.set(k, key[k]);
        } else {
            this._data.set(key, value);
        }
        return this;
    }
    getData(key) { return this._data.has(key) ? this._data.get(key) : undefined; }
    incData(key, amount = 1) { this._data.set(key, (this._data.get(key) || 0) + amount); return this; }
    toggleData(key) { this._data.set(key, !this._data.get(key)); return this; }

    setInteractive(options = {}) {
        this._guard('setInteractive');
        if (!this.input) {
            this.input = { enabled: true, draggable: false, cursor: null, dropZone: false };
            this._scene.input._interactive.add(this);
        }
        this.input.enabled = true;
        if (options && options.draggable) this.input.draggable = true;
        if (options && options.useHandCursor) this.input.cursor = 'pointer';
        if (options && options.dropZone) this.input.dropZone = true;
        return this;
    }
    disableInteractive() {
        if (this.input) this.input.enabled = false;
        return this;
    }
    removeInteractive() {
        if (this.input) this._scene.input._interactive.delete(this);
        this.input = null;
        return this;
    }

    // Axis-aligned bounds in world space (ignores rotation, like most tests need).
    getBounds() {
        const w = this.width * this.scaleX;
        const h = this.height * this.scaleY;
        let x = this.x - w * this.originX;
        let y = this.y - h * this.originY;
        if (this.parentContainer) {
            x += this.parentContainer.x;
            y += this.parentContainer.y;
        }
        return new (globalThis.Phaser.Geom.Rectangle)(x, y, w, h);
    }
    getCenter() { const b = this.getBounds(); return { x: b.centerX, y: b.centerY }; }
    getTopLeft() { const b = this.getBounds(); return { x: b.x, y: b.y }; }

    destroy() {
        if (this.destroyed) return;
        this.emit('destroy', this);
        this.destroyed = true;
        this.active = false;
        this.removeAllListeners();
        if (this.input) this._scene.input._interactive.delete(this);
        this.input = null;
        if (this.parentContainer) this.parentContainer.remove(this);
        this._scene._unregister(this);
        // Real Phaser clears the scene reference on destroy; modes use it as an
        // "is this object still alive" check.
        this.scene = undefined;
    }
}

class Rectangle extends GameObject {
    constructor(scene, x, y, width, height, fillColor, fillAlpha) {
        super(scene, 'Rectangle', x, y);
        this.width = width;
        this.height = height;
        this.isFilled = fillColor !== undefined;
        this.fillColor = fillColor === undefined ? 0xffffff : fillColor;
        this.fillAlpha = fillAlpha === undefined ? 1 : fillAlpha;
        this.isStroked = false;
        this.strokeColor = 0;
        this.strokeAlpha = 1;
        this.lineWidth = 0;
    }
    setFillStyle(color, alpha = 1) {
        this._guard('setFillStyle');
        if (color === undefined) { this.isFilled = false; return this; }
        this.isFilled = true; this.fillColor = color; this.fillAlpha = alpha; return this;
    }
    setStrokeStyle(lineWidth, color, alpha = 1) {
        this._guard('setStrokeStyle');
        if (lineWidth === undefined) { this.isStroked = false; return this; }
        this.isStroked = true; this.lineWidth = lineWidth; this.strokeColor = color; this.strokeAlpha = alpha; return this;
    }
}

class Circle extends Rectangle {
    constructor(scene, x, y, radius, fillColor, fillAlpha) {
        super(scene, x, y, radius * 2, radius * 2, fillColor, fillAlpha);
        this.type = 'Arc';
        this.radius = radius;
    }
    setRadius(r) { this.radius = r; this.width = r * 2; this.height = r * 2; return this; }
}

function parseFontSize(style = {}) {
    const candidates = [style.fontSize, style.font];
    for (const c of candidates) {
        if (typeof c === 'number') return c;
        if (typeof c === 'string') {
            const m = c.match(/(\d+(?:\.\d+)?)px/);
            if (m) return parseFloat(m[1]);
        }
    }
    return 16;
}

class Text extends GameObject {
    constructor(scene, x, y, text, style = {}) {
        super(scene, 'Text', x, y);
        this.originX = 0;
        this.originY = 0;
        this.style = { ...style };
        this.padding = style.padding || {};
        this.text = '';
        this.setText(text);
    }
    _measure() {
        const size = parseFontSize(this.style);
        const lines = String(this.text).split('\n');
        const longest = lines.reduce((m, l) => Math.max(m, Array.from(l).length), 0);
        const padX = (this.padding.x || 0) * 2 + (this.padding.left || 0) + (this.padding.right || 0);
        const padY = (this.padding.y || 0) * 2 + (this.padding.top || 0) + (this.padding.bottom || 0);
        this.width = Math.round(longest * size * 0.6) + padX;
        this.height = Math.round(lines.length * size * 1.2) + padY;
    }
    setText(value) {
        if (this.destroyed) {
            // Real Phaser re-renders the text canvas here, which fails after
            // the texture has been destroyed. Make it loud.
            throw new Error(`setText() called on a destroyed Text object ("${this.text}")`);
        }
        if (Array.isArray(value)) value = value.join('\n');
        this.text = value === undefined || value === null ? '' : String(value);
        this._measure();
        return this;
    }
    setStyle(style) { this.style = { ...this.style, ...style }; this._measure(); return this; }
    setFont(font) { this.style.font = font; this._measure(); return this; }
    setFontSize(size) { this.style.fontSize = typeof size === 'number' ? `${size}px` : size; this._measure(); return this; }
    setFontFamily(f) { this.style.fontFamily = f; return this; }
    setFontStyle(s) { this.style.fontStyle = s; return this; }
    setColor(c) { this.style.color = c; this.style.fill = c; return this; }
    setFill(c) { return this.setColor(c); }
    setStroke(color, thickness) { this.style.stroke = color; this.style.strokeThickness = thickness; return this; }
    setShadow() { return this; }
    setAlign(a) { this.style.align = a; return this; }
    setPadding(p) { this.padding = typeof p === 'number' ? { x: p, y: p } : p; this._measure(); return this; }
    setWordWrapWidth(w) { this.style.wordWrap = { width: w }; return this; }
    setLineSpacing() { return this; }
    setFixedSize(w, h) { if (w) this.width = w; if (h) this.height = h; return this; }
    setBackgroundColor(c) { this.style.backgroundColor = c; return this; }
    setResolution() { return this; }
    setLetterSpacing() { return this; }
}

class Image extends GameObject {
    constructor(scene, x, y, key, frame) {
        super(scene, 'Image', x, y);
        if (!scene.textures.exists(key)) {
            scene._missingTextures.push(key);
            throw new Error(`Texture "${key}" is not loaded (add.image). BootScene never loads it.`);
        }
        this.textureKey = key;
        this.texture = { key };
        this.frame = frame;
        this.width = 128;
        this.height = 128;
        this.flipX = false;
        this.flipY = false;
    }
    setTexture(key) {
        if (!this._scene.textures.exists(key)) throw new Error(`Texture "${key}" is not loaded (setTexture).`);
        this.textureKey = key; this.texture = { key }; return this;
    }
    setFrame() { return this; }
    setFlipX(v) { this.flipX = v; return this; }
    setFlipY(v) { this.flipY = v; return this; }
    setCrop() { return this; }
}

class Graphics extends GameObject {
    constructor(scene) {
        super(scene, 'Graphics', 0, 0);
        this.originX = 0;
        this.originY = 0;
        this.commands = [];
    }
    _cmd(name) { return (...args) => { this._guard(name); this.commands.push([name, ...args]); return this; }; }
    generateTexture(key, width, height) {
        this._scene.textures._generated.add(key);
        return this;
    }
}
for (const name of [
    'fillStyle', 'lineStyle', 'fillRect', 'strokeRect', 'fillRoundedRect', 'strokeRoundedRect',
    'fillCircle', 'strokeCircle', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'lineBetween',
    'fillPath', 'strokePath', 'arc', 'fillTriangle', 'strokeTriangle', 'fillPoint', 'fillPoints',
    'strokePoints', 'fillEllipse', 'strokeEllipse', 'strokeLineShape', 'clear', 'save', 'restore',
    'translateCanvas', 'rotateCanvas', 'scaleCanvas', 'fillGradientStyle', 'lineGradientStyle', 'slice', 'setDefaultStyles'
]) {
    Graphics.prototype[name] = function (...args) { this._guard(name); this.commands.push([name, ...args]); return this; };
}

class Container extends GameObject {
    constructor(scene, x, y, children) {
        super(scene, 'Container', x, y);
        this.list = [];
        if (Array.isArray(children)) this.add(children);
        else if (children) this.add([children]);
    }
    add(child) {
        const arr = Array.isArray(child) ? child : [child];
        for (const c of arr) {
            if (c.parentContainer) c.parentContainer.remove(c);
            c.parentContainer = this;
            this.list.push(c);
        }
        return this;
    }
    remove(child, destroyChild = false) {
        const arr = Array.isArray(child) ? child : [child];
        for (const c of arr) {
            const i = this.list.indexOf(c);
            if (i >= 0) this.list.splice(i, 1);
            c.parentContainer = null;
            if (destroyChild) c.destroy();
        }
        return this;
    }
    removeAll(destroyChildren = false) {
        const all = [...this.list];
        this.list = [];
        for (const c of all) { c.parentContainer = null; if (destroyChildren) c.destroy(); }
        return this;
    }
    getAt(i) { return this.list[i]; }
    getAll() { return [...this.list]; }
    each(fn, ctx) { [...this.list].forEach(c => fn.call(ctx, c)); return this; }
    iterate(fn, ctx) { return this.each(fn, ctx); }
    bringToTop(c) { const i = this.list.indexOf(c); if (i >= 0) { this.list.splice(i, 1); this.list.push(c); } return this; }
    sendToBack(c) { const i = this.list.indexOf(c); if (i >= 0) { this.list.splice(i, 1); this.list.unshift(c); } return this; }
    get length() { return this.list.length; }
    destroy() {
        if (this.destroyed) return;
        const children = [...this.list];
        this.list = [];
        for (const c of children) { c.parentContainer = null; c.destroy(); }
        super.destroy();
    }
}

class Zone extends GameObject {
    constructor(scene, x, y, width, height) {
        super(scene, 'Zone', x, y);
        this.width = width;
        this.height = height;
    }
    setRectangleDropZone(w, h) { this.setInteractive({ dropZone: true }); this.width = w; this.height = h; return this; }
}

class ParticleEmitter extends GameObject {
    constructor(scene, x, y, texture, config) {
        super(scene, 'ParticleEmitter', x, y);
        if (!scene.textures.exists(texture)) {
            scene._missingTextures.push(texture);
            throw new Error(`Particle texture "${texture}" does not exist.`);
        }
        this.textureKey = texture;
        this.config = config;
        this.explosions = 0;
    }
    explode(count, x, y) { this._guard('explode'); this.explosions++; return this; }
    start() { this.emitting = true; return this; }
    stop() { this.emitting = false; return this; }
    setFrequency(f) { this.frequency = f; return this; }
    setQuantity() { return this; }
    setSpeed() { return this; }
    setLifespan() { return this; }
    setParticleTint() { return this; }
    setParticleScale() { return this; }
    setConfig() { return this; }
    setEmitterFrame() { return this; }
    setEmitZone() { return this; }
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------
class Sound extends Emitter {
    constructor(manager, key, config = {}) {
        super();
        this.manager = manager;
        this.key = key;
        this.config = config;
        this.isPlaying = false;
        this.isPaused = false;
        this.volume = config.volume === undefined ? 1 : config.volume;
        this.rate = config.rate === undefined ? 1 : config.rate;
        this.loop = !!config.loop;
        this.seek = 0;
        this.duration = manager.durations.get(key) ?? DEFAULT_SOUND_DURATION;
        this.totalDuration = this.duration;
        this.destroyed = false;
        this._endTimer = null;
    }
    play(markerOrConfig, config) {
        if (this.destroyed) throw new Error(`play() on destroyed sound "${this.key}"`);
        const cfg = typeof markerOrConfig === 'object' ? markerOrConfig : config;
        if (cfg && cfg.volume !== undefined) this.volume = cfg.volume;
        this.isPlaying = true;
        this.isPaused = false;
        this.manager.log.push({ key: this.key, time: this.manager.scene.time.now });
        this.emit('play', this);
        if (this._endTimer) this._endTimer.remove();
        const scene = this.manager.scene;
        this._endTimer = scene.time.delayedCall(this.duration * 1000, () => {
            this._endTimer = null;
            if (!this.isPlaying) return;
            if (this.loop) { this.emit('looped', this); this.play(); return; }
            this.isPlaying = false;
            this.emit('complete', this);
        }, undefined, undefined, { internal: true });
        return true;
    }
    stop() {
        if (this._endTimer) { this._endTimer.remove(); this._endTimer = null; }
        const was = this.isPlaying;
        this.isPlaying = false;
        this.isPaused = false;
        if (was) this.emit('stop', this);
        return true;
    }
    pause() { if (this.isPlaying) { this.isPlaying = false; this.isPaused = true; return true; } return false; }
    resume() { if (this.isPaused) { this.isPaused = false; this.isPlaying = true; return true; } return false; }
    setVolume(v) { this.volume = v; return this; }
    setRate(r) { this.rate = r; return this; }
    setLoop(l) { this.loop = l; return this; }
    setMute() { return this; }
    setSeek(s) { this.seek = s; return this; }
    destroy() {
        this.stop();
        this.destroyed = true;
        this.removeAllListeners();
        const i = this.manager.sounds.indexOf(this);
        if (i >= 0) this.manager.sounds.splice(i, 1);
    }
}

class SoundManager {
    constructor(scene, registry) {
        this.scene = scene;
        this.registry = registry;
        this.sounds = [];
        this.log = [];
        this.durations = new Map();
        this.volume = 1;
        this.mute = false;
        this.locked = false;
        this.context = { state: 'running', suspend: async () => {}, resume: async () => {} };
        this.pauseOnBlur = true;
    }
    _check(key) {
        if (!this.scene.cache.audio.exists(key)) {
            this.scene._missingAudio.push(key);
            throw new Error(`Audio key "${key}" missing from cache`);
        }
    }
    add(key, config) {
        this._check(key);
        const s = new Sound(this, key, config);
        this.sounds.push(s);
        return s;
    }
    play(key, config) {
        const s = this.add(key, config);
        s.play();
        return true;
    }
    get(key) { return this.sounds.find(s => s.key === key) || null; }
    getAll(key) { return this.sounds.filter(s => s.key === key); }
    stopAll() { this.sounds.forEach(s => s.stop()); }
    stopByKey(key) { this.getAll(key).forEach(s => s.stop()); return 0; }
    removeByKey(key) { [...this.getAll(key)].forEach(s => s.destroy()); return 0; }
    removeAll() { [...this.sounds].forEach(s => s.destroy()); }
    setVolume(v) { this.volume = v; return this; }
    setMute(m) { this.mute = m; return this; }
    pauseAll() {}
    resumeAll() {}
    unlock() {}
    get playing() { return this.sounds.filter(s => s.isPlaying); }
}

// ---------------------------------------------------------------------------
// Clock: timers and tweens
// ---------------------------------------------------------------------------
class TimerEvent {
    constructor(clock, config, meta = {}) {
        this.clock = clock;
        this.delay = config.delay || 0;
        this.callback = config.callback;
        this.callbackScope = config.callbackScope;
        this.args = config.args || [];
        this.loop = !!config.loop;
        this.repeat = config.repeat || 0;
        this.repeatCount = this.loop ? -1 : this.repeat;
        this.paused = !!config.paused;
        this.startAt = clock.now;
        this.dueAt = clock.now + this.delay;
        this.elapsed = 0;
        this.hasDispatched = false;
        this.removed = false;
        this.meta = meta;
        this.stack = meta.internal ? null : new Error().stack;
    }
    remove() { this.removed = true; this.clock._removeTimer(this); }
    destroy() { this.remove(); }
    getProgress() { return Math.min(1, (this.clock.now - this.startAt) / (this.delay || 1)); }
    getRemaining() { return Math.max(0, this.dueAt - this.clock.now); }
    getRemainingSeconds() { return this.getRemaining() / 1000; }
    getElapsed() { return this.clock.now - this.startAt; }
    getElapsedSeconds() { return this.getElapsed() / 1000; }
    reset(config) {
        this.delay = config.delay || 0;
        this.callback = config.callback;
        this.loop = !!config.loop;
        this.repeatCount = this.loop ? -1 : (config.repeat || 0);
        this.startAt = this.clock.now;
        this.dueAt = this.clock.now + this.delay;
        this.removed = false;
        this.clock.timers.push(this);
        return this;
    }
}

function tweenTotalDuration(config) {
    const duration = config.duration === undefined ? 1000 : config.duration;
    const repeat = config.repeat || 0;
    if (repeat === -1 || config.loop === -1) return Infinity;
    const cycle = (config.yoyo ? duration * 2 : duration) + (config.hold || 0) + (config.repeatDelay || 0);
    const loops = (config.loop || 0) + 1;
    return ((config.delay || 0) + cycle * (repeat + 1) + (config.completeDelay || 0)) * loops;
}

const TWEEN_PROPS = new Set(['x', 'y', 'alpha', 'scale', 'scaleX', 'scaleY', 'angle', 'rotation', 'width', 'height',
    'displayWidth', 'displayHeight', 'value', 'radius', 'fillAlpha', 'depth', 'tint', 'originX', 'originY']);

class Tween {
    constructor(clock, config) {
        this.clock = clock;
        this.config = config;
        this.targets = config.targets === undefined ? [] : (Array.isArray(config.targets) ? config.targets : [config.targets]);
        this.startAt = clock.now + (config.delay || 0);
        this.total = tweenTotalDuration(config);
        this.dueAt = this.startAt + (this.total === Infinity ? Infinity : this.total - (config.delay || 0));
        this.state = 'active';
        this.started = false;
        this.progress = 0;
        this.stack = new Error().stack;
        this.counterValue = config.from;
        this.endValues = this._collectEndValues();
        // A finished 0ms tween still completes on the next tick, never synchronously.
    }
    _collectEndValues() {
        const ends = {};
        const src = this.config.props || this.config;
        for (const key of Object.keys(src)) {
            if (!TWEEN_PROPS.has(key)) continue;
            ends[key] = src[key];
        }
        return ends;
    }
    _applyEndValues() {
        if (this.config.yoyo) return; // ends where it started
        for (const target of this.targets) {
            if (!target) continue;
            for (const [key, raw] of Object.entries(this.endValues)) {
                let value = raw;
                if (value && typeof value === 'object') value = value.to !== undefined ? value.to : value.value;
                if (typeof value === 'string') {
                    const m = value.match(/^([+\-*/]=)(.+)$/);
                    if (m) {
                        const n = parseFloat(m[2]);
                        const cur = target[key] || 0;
                        value = m[1] === '+=' ? cur + n : m[1] === '-=' ? cur - n : m[1] === '*=' ? cur * n : cur / n;
                    } else {
                        value = parseFloat(value);
                    }
                }
                if (typeof value === 'function') continue;
                if (value === undefined || Number.isNaN(value)) continue;
                target[key] = value;
            }
        }
    }
    _start() {
        this.started = true;
        // from/to value objects set the from value on start
        for (const target of this.targets) {
            if (!target) continue;
            for (const [key, raw] of Object.entries(this.endValues)) {
                if (raw && typeof raw === 'object' && raw.from !== undefined) target[key] = raw.from;
            }
        }
        if (this.config.onStart) this.config.onStart.call(this.config.callbackScope, this, this.targets);
    }
    _complete() {
        this.state = 'complete';
        this.progress = 1;
        this._applyEndValues();
        if (this.config.to !== undefined) this.counterValue = this.config.to;
        if (this.config.onUpdate) this.config.onUpdate.call(this.config.callbackScope, this, this.targets[0], undefined, undefined, undefined);
        if (this.config.onComplete) this.config.onComplete.call(this.config.callbackScope, this, this.targets);
    }
    getValue() { return this.counterValue; }
    isPlaying() { return this.state === 'active'; }
    isDestroyed() { return this.state === 'destroyed'; }
    hasTarget(t) { return this.targets.includes(t); }
    stop() {
        if (this.state !== 'active') return this;
        this.state = 'stopped';
        this.clock._removeTween(this);
        if (this.config.onStop) this.config.onStop.call(this.config.callbackScope, this, this.targets);
        return this;
    }
    remove() { return this.stop(); }
    destroy() { this.stop(); this.state = 'destroyed'; }
    pause() { this.paused = true; return this; }
    resume() { this.paused = false; return this; }
    restart() { this.state = 'active'; this.startAt = this.clock.now; this.dueAt = this.startAt + this.total; if (!this.clock.tweens.includes(this)) this.clock.tweens.push(this); return this; }
    play() { return this; }
    complete() { this.clock._removeTween(this); this._complete(); return this; }
    setCallback(type, fn) { this.config[type] = fn; return this; }
}

class Clock {
    constructor(scene) {
        this.scene = scene;
        this.now = 0;
        this.timers = [];
        this.tweens = [];
        this.firedTimers = 0;
        this.firedTweens = 0;
    }
    _removeTimer(t) { const i = this.timers.indexOf(t); if (i >= 0) this.timers.splice(i, 1); }
    _removeTween(t) { const i = this.tweens.indexOf(t); if (i >= 0) this.tweens.splice(i, 1); }

    addTimer(config, meta) {
        const t = new TimerEvent(this, config, meta);
        this.timers.push(t);
        return t;
    }
    addTween(config) {
        const t = new Tween(this, config);
        this.tweens.push(t);
        return t;
    }

    // Advance virtual time, firing timers and tweens in chronological order.
    advance(ms) {
        const target = this.now + ms;
        for (let guard = 0; guard < 100000; guard++) {
            let next = null;
            let nextTime = Infinity;
            for (const t of this.timers) {
                if (t.paused) continue;
                if (t.dueAt < nextTime) { nextTime = t.dueAt; next = { kind: 'timer', item: t }; }
            }
            for (const tw of this.tweens) {
                if (tw.paused) continue;
                if (!tw.started && tw.startAt < nextTime) { nextTime = tw.startAt; next = { kind: 'tweenStart', item: tw }; }
                if (tw.started && tw.dueAt < nextTime) { nextTime = tw.dueAt; next = { kind: 'tweenEnd', item: tw }; }
            }
            if (!next || nextTime > target) break;
            this.now = Math.max(this.now, nextTime);
            if (next.kind === 'timer') {
                const t = next.item;
                if (t.loop || t.repeatCount > 0) {
                    if (!t.loop) t.repeatCount--;
                    t.startAt = this.now;
                    t.dueAt = this.now + t.delay;
                } else {
                    this._removeTimer(t);
                }
                t.hasDispatched = true;
                this.firedTimers++;
                t.callback.apply(t.callbackScope, t.args);
            } else if (next.kind === 'tweenStart') {
                next.item._start();
                if (next.item.dueAt === Infinity) continue;
            } else {
                this._removeTween(next.item);
                this.firedTweens++;
                next.item._complete();
            }
        }
        this.now = target;
    }

    pendingTimers() { return this.timers.filter(t => !t.meta.internal); }
    pendingTweens() { return [...this.tweens]; }
    clearAll() { this.timers = []; this.tweens = []; }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export class FakeScene {
    constructor(options = {}) {
        const registry = getAssetRegistry();
        this.key = options.key || 'PokeballGameScene';
        this.width = options.width || 1280;
        this.height = options.height || 900;

        this.clock = new Clock(this);
        this.time = {
            get now() { return scene.clock.now; },
            delayedCall: (delay, callback, args, callbackScope, meta) =>
                this.clock.addTimer({ delay, callback, args, callbackScope }, meta),
            addEvent: (config) => this.clock.addTimer(config),
            removeEvent: (ev) => { (Array.isArray(ev) ? ev : [ev]).forEach(e => e.remove()); },
            removeAllEvents: () => { this.clock.timers = []; },
            clearPendingEvents: () => {},
            paused: false
        };
        const scene = this;

        this.tweens = {
            add: (config) => this.clock.addTween(config),
            create: (config) => new Tween(this.clock, config),
            addCounter: (config) => this.clock.addTween({ ...config, targets: [] }),
            chain: (config) => this.clock.addTween({ targets: [], duration: 0, ...config }),
            killTweensOf: (target) => {
                const arr = Array.isArray(target) ? target : [target];
                [...this.clock.tweens].forEach(tw => { if (arr.some(t => tw.hasTarget(t))) tw.stop(); });
            },
            killAll: () => { [...this.clock.tweens].forEach(tw => tw.stop()); },
            getTweensOf: (target) => this.clock.tweens.filter(tw => tw.hasTarget(target)),
            isTweening: (target) => this.clock.tweens.some(tw => tw.hasTarget(target)),
            pauseAll: () => {}, resumeAll: () => {}
        };

        this.cameras = {
            main: {
                width: this.width, height: this.height,
                centerX: this.width / 2, centerY: this.height / 2,
                x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: 1,
                shake() { return this; }, flash() { return this; }, fadeOut() { return this; }, fadeIn() { return this; },
                setBackgroundColor() { return this; }, setZoom() { return this; }, once() { return this; }, on() { return this; }
            }
        };

        this._objects = new Set();
        this._allCreated = [];
        this._useAfterDestroy = [];
        this._missingAudio = [];
        this._missingTextures = [];

        this.textures = {
            _generated: new Set(registry.generatedTextures),
            exists: (key) => registry.images.has(key) || this.textures._generated.has(key),
            get: (key) => ({ key, getSourceImage: () => ({ width: 128, height: 128 }) }),
            remove: (key) => { this.textures._generated.delete(key); },
            addBase64: (key) => { this.textures._generated.add(key); },
            list: {}
        };
        this.cache = {
            audio: {
                exists: (key) => registry.audio.has(key) || this._extraAudio.has(key),
                get: (key) => (registry.audio.has(key) ? { key } : null),
                has: (key) => registry.audio.has(key)
            },
            json: { get: () => null, exists: () => false }
        };
        this._extraAudio = new Set();

        this.sound = new SoundManager(this, registry);

        this.add = {
            text: (x, y, text, style) => new Text(this, x, y, text, style),
            rectangle: (x, y, w, h, color, alpha) => new Rectangle(this, x, y, w, h, color, alpha),
            circle: (x, y, r, color, alpha) => new Circle(this, x, y, r, color, alpha),
            graphics: () => new Graphics(this),
            image: (x, y, key, frame) => new Image(this, x, y, key, frame),
            sprite: (x, y, key, frame) => new Image(this, x, y, key, frame),
            container: (x, y, children) => new Container(this, x, y, children),
            zone: (x, y, w, h) => new Zone(this, x, y, w, h),
            particles: (x, y, texture, config) => new ParticleEmitter(this, x, y, texture, config),
            existing: (obj) => obj,
            renderTexture: (x, y, w, h) => {
                const rt = new GameObject(this, 'RenderTexture', x, y);
                rt.width = w; rt.height = h;
                rt.draw = () => rt;
                rt.saveTexture = (key) => { this.textures._generated.add(key); return rt; };
                rt.clear = () => rt;
                return rt;
            }
        };

        this.input = {
            _interactive: new Set(),
            _emitter: new Emitter(),
            enabled: true,
            activePointer: { x: 0, y: 0, isDown: false },
            dragDistanceThreshold: 0,
            setDraggable: (objs, value = true) => {
                const arr = Array.isArray(objs) ? objs : [objs];
                for (const o of arr) {
                    if (!o.input) o.setInteractive();
                    o.input.draggable = value;
                }
            },
            on: (event, fn, ctx) => { this.input._emitter.on(event, fn, ctx); return this.input; },
            once: (event, fn, ctx) => { this.input._emitter.once(event, fn, ctx); return this.input; },
            off: (event, fn) => { this.input._emitter.off(event, fn); return this.input; },
            removeAllListeners: () => this.input._emitter.removeAllListeners(),
            setDefaultCursor: () => {},
            setTopOnly: () => {},
            keyboard: { on: () => {}, off: () => {}, addKey: () => ({ on() {}, isDown: false }), createCursorKeys: () => ({}) },
            enableDebug: () => {}
        };

        this._registry = new Map(Object.entries(options.registry || {}));
        this.registry = {
            get: (k) => this._registry.get(k),
            set: (k, v) => { this._registry.set(k, v); return this.registry; },
            has: (k) => this._registry.has(k),
            remove: (k) => this._registry.delete(k),
            events: new Emitter()
        };

        this.sceneCalls = [];
        this.scene = {
            key: this.key,
            manager: { keys: {} },
            restart: (data) => { this.sceneCalls.push({ method: 'restart', data }); this._shutdown(); },
            start: (key, data) => { this.sceneCalls.push({ method: 'start', key, data }); this._shutdown(); },
            stop: (key) => { this.sceneCalls.push({ method: 'stop', key }); },
            pause: (key) => { this.sceneCalls.push({ method: 'pause', key }); this._paused = true; },
            resume: (key) => { this.sceneCalls.push({ method: 'resume', key }); this._paused = false; },
            launch: (key, data) => { this.sceneCalls.push({ method: 'launch', key, data }); },
            bringToTop: () => {},
            get: (key) => null,
            getScenes: () => [],
            isActive: () => !this._shutdownCalled,
            isPaused: () => !!this._paused,
            isVisible: () => true,
            isSleeping: () => false,
            settings: { key: this.key }
        };
        this.events = new Emitter();
        this.sys = { settings: { key: this.key }, isActive: () => !this._shutdownCalled, events: this.events };
        this.children = { list: [], getByName: (n) => [...this._objects].find(o => o.name === n) || null };
        this.game = { config: { width: this.width, height: this.height }, registry: this.registry };
        this._shutdownCalled = false;
        this.boosterBarElements = null;
    }

    // --- bookkeeping ------------------------------------------------------
    _register(obj) { this._objects.add(obj); this._allCreated.push(obj); this.children.list.push(obj); }
    _unregister(obj) { this._objects.delete(obj); const i = this.children.list.indexOf(obj); if (i >= 0) this.children.list.splice(i, 1); }

    _shutdown() {
        // Phaser destroys the display list and clears timers/tweens on restart/start.
        this._shutdownCalled = true;
        for (const obj of [...this._objects]) obj.destroy();
        this.clock.clearAll();
        this.sound.removeAll();
    }

    liveObjects() { return [...this._objects]; }
    liveObjectsOfType(type) { return this.liveObjects().filter(o => o.type === type); }
    objectsCreatedAfter(time) { return this._allCreated.filter(o => o.createdAt > time); }
    liveTexts() { return this.liveObjectsOfType('Text'); }
    findText(predicate) {
        const p = typeof predicate === 'string' ? (t) => t.text === predicate : predicate;
        return this.liveTexts().find(p) || null;
    }
    findTexts(predicate) {
        const p = typeof predicate === 'string' ? (t) => t.text === predicate : predicate;
        return this.liveTexts().filter(p);
    }
    interactives() { return [...this.input._interactive].filter(o => !o.destroyed && o.input && o.input.enabled); }
    playedAudio() { return this.sound.log.map(l => l.key); }
    lastAudio() { return this.sound.log.length ? this.sound.log[this.sound.log.length - 1].key : null; }
    playingSounds() { return this.sound.playing; }

    // Register an audio key the test wants to pretend exists (rarely needed).
    addFakeAudio(key, duration = DEFAULT_SOUND_DURATION) {
        this._extraAudio.add(key);
        this.sound.durations.set(key, duration);
    }

    // --- interaction ------------------------------------------------------
    pointerAt(x, y) { return { x, y, worldX: x, worldY: y, isDown: false, event: {}, button: 0, id: 1 }; }

    click(obj, opts = {}) {
        if (!obj) throw new Error('click(): no object');
        if (obj.destroyed) throw new Error(`click(): ${obj.type}#${obj.id} is destroyed`);
        if (!obj.input || !obj.input.enabled) {
            if (opts.force) { /* allow */ } else return false;
        }
        const b = obj.getBounds();
        const pointer = this.pointerAt(opts.x ?? b.centerX, opts.y ?? b.centerY);
        pointer.isDown = true;
        this.input.activePointer = pointer;
        obj.emit('pointerover', pointer);
        obj.emit('pointerdown', pointer, pointer.x, pointer.y, pointer.event);
        this.input._emitter.emit('gameobjectdown', pointer, obj, pointer.event);
        if (!obj.destroyed) {
            pointer.isDown = false;
            obj.emit('pointerup', pointer, pointer.x, pointer.y, pointer.event);
            this.input._emitter.emit('gameobjectup', pointer, obj, pointer.event);
            obj.emit('pointerout', pointer);
        }
        return true;
    }

    // Drag an object so its centre lands at (toX, toY). Emits the same event
    // sequence as Phaser's input plugin (object and scene-level listeners).
    drag(obj, toX, toY, opts = {}) {
        if (!obj || obj.destroyed) throw new Error('drag(): object missing or destroyed');
        if (!obj.input || !obj.input.enabled || !obj.input.draggable) {
            if (!opts.force) return false;
        }
        const start = obj.getBounds();
        const pointer = this.pointerAt(start.centerX, start.centerY);
        pointer.isDown = true;
        this.input.activePointer = pointer;
        obj.emit('pointerdown', pointer, pointer.x, pointer.y, pointer.event);
        obj.emit('dragstart', pointer, obj.x, obj.y);
        this.input._emitter.emit('dragstart', pointer, obj);
        const steps = opts.steps || 3;
        const dx = toX - start.centerX;
        const dy = toY - start.centerY;
        const offX = obj.x - start.centerX;
        const offY = obj.y - start.centerY;
        for (let i = 1; i <= steps; i++) {
            pointer.x = start.centerX + dx * (i / steps);
            pointer.y = start.centerY + dy * (i / steps);
            pointer.worldX = pointer.x; pointer.worldY = pointer.y;
            const dragX = pointer.x + offX;
            const dragY = pointer.y + offY;
            obj.emit('drag', pointer, dragX, dragY);
            this.input._emitter.emit('drag', pointer, obj, dragX, dragY);
            if (obj.destroyed) return true;
        }
        // Drop-zone detection
        const zones = this.interactives().filter(z => z.input.dropZone && z !== obj);
        const hit = zones.find(z => {
            const zb = z.getBounds();
            return pointer.x >= zb.x && pointer.x <= zb.right && pointer.y >= zb.y && pointer.y <= zb.bottom;
        });
        pointer.isDown = false;
        if (hit) {
            obj.emit('drop', pointer, hit);
            this.input._emitter.emit('drop', pointer, obj, hit);
        }
        obj.emit('dragend', pointer, obj.x, obj.y, !!hit);
        this.input._emitter.emit('dragend', pointer, obj, !!hit);
        obj.emit('pointerup', pointer, pointer.x, pointer.y, pointer.event);
        return true;
    }

    advance(ms) { this.clock.advance(ms); }
}

// Graft a FakeScene's subsystems onto a real Scene subclass instance (e.g.
// PokeballGameScene) so its create()/handlers run against the fake. Returns the
// FakeScene for inspection (clock, liveObjects, click, ...).
export function installFakeScene(target, options = {}) {
    const fake = new FakeScene(options);
    for (const key of ['add', 'time', 'tweens', 'cameras', 'textures', 'cache', 'sound', 'input',
        'registry', 'scene', 'events', 'sys', 'children', 'game']) {
        target[key] = fake[key];
    }
    target.__fake = fake;
    return fake;
}

// Let every pending promise chain (fetch mocks, async createChallengeUI) settle.
export async function flush() {
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
}

// Convenience: run a mode through generateChallenge + createChallengeUI.
export async function startMode(mode, scene) {
    if (mode.loadConfig && !mode.configLoaded) await mode.loadConfig();
    mode.generateChallenge();
    await mode.createChallengeUI(scene);
    return mode;
}

// Collect callback invocations.
export function attachCallback(mode) {
    const calls = [];
    mode.setAnswerCallback((isCorrect, answer, x, y) => {
        calls.push({ isCorrect, answer, x, y, time: mode._scene ? mode._scene.time.now : undefined });
    });
    return calls;
}

export { GameObject, Rectangle, Circle, Text, Image, Graphics, Container, Sound, Tween, TimerEvent };
