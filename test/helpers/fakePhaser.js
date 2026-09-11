// Minimal stand-in for the `phaser` module. Only the static helpers the game
// modes call are implemented; anything else is deliberately absent so a test
// fails loudly if a mode starts depending on something new.

function Between(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function Shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = array[i];
        array[i] = array[j];
        array[j] = t;
    }
    return array;
}

function GetRandom(array, startIndex = 0, length = array.length) {
    const randomIndex = startIndex + Math.floor(Math.random() * length);
    return array[randomIndex] === undefined ? null : array[randomIndex];
}

function RectangleContains(rect, x, y) {
    if (rect.width <= 0 || rect.height <= 0) return false;
    return rect.x <= x && rect.x + rect.width >= x && rect.y <= y && rect.y + rect.height >= y;
}

function RectangleToRectangle(a, b) {
    if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
    return !(a.right < b.x || a.bottom < b.y || a.x > b.right || a.y > b.bottom);
}

class Rectangle {
    constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x; this.y = y; this.width = width; this.height = height;
    }
    get right() { return this.x + this.width; }
    get bottom() { return this.y + this.height; }
    get centerX() { return this.x + this.width / 2; }
    get centerY() { return this.y + this.height / 2; }
}
Rectangle.Contains = RectangleContains;

class Scene {
    constructor(config) {
        this.sceneConfig = config;
    }
}

const Phaser = {
    AUTO: 0,
    Scene,
    Math: { Between },
    Utils: { Array: { Shuffle, GetRandom } },
    Geom: {
        Rectangle,
        Intersects: { RectangleToRectangle }
    }
};

// Several modes use the Phaser global instead of importing it (the real
// library registers window.Phaser). Mirror that so both styles work.
globalThis.Phaser = Phaser;

export default Phaser;
export { Scene };
