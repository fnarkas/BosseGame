// Small HTML helpers for the admin panel.
//
// The panel is rendered as HTML strings. Everything that comes from the user
// (dictionary words, emoji, config text) must go through `html` or
// `escapeHtml` before it is inserted into innerHTML.

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Marks a string as already-safe markup so `html` inserts it verbatim.
export function raw(markup) {
    return { __rawHtml: String(markup ?? '') };
}

// Tagged template that escapes every interpolated value unless it is wrapped
// in raw(). Arrays are joined without a separator (each item escaped or raw).
export function html(strings, ...values) {
    let out = '';
    strings.forEach((chunk, i) => {
        out += chunk;
        if (i < values.length) out += renderValue(values[i]);
    });
    return raw(out);
}

function renderValue(value) {
    if (value === null || value === undefined || value === false) return '';
    if (Array.isArray(value)) return value.map(renderValue).join('');
    if (typeof value === 'object' && '__rawHtml' in value) return value.__rawHtml;
    return escapeHtml(value);
}

// String form of a value produced by html()/raw() (or a plain string).
export function toHtml(value) {
    return typeof value === 'string' ? value : renderValue(value);
}

// Show a status line in `element` and clear it after `ms`. A second call on
// the same element cancels the earlier timer so messages never blink away early.
const flashTimers = new WeakMap();
export function flash(element, text, color = '#4CAF50', ms = 5000) {
    if (!element) return;
    element.textContent = text;
    element.style.color = color;
    const previous = flashTimers.get(element);
    if (previous) clearTimeout(previous);
    if (ms > 0) {
        flashTimers.set(element, setTimeout(() => {
            element.textContent = '';
            flashTimers.delete(element);
        }, ms));
    }
}

export const MESSAGE_COLORS = {
    ok: '#4CAF50',
    busy: '#FF9800',
    error: '#f44336'
};

// One stylesheet for the whole panel, so the section modules only carry the
// markup. Colours and spacing match the previous inline styles.
export const ADMIN_CSS = `
.admin { font-family: Arial, sans-serif; max-width: 1400px; margin: 20px auto; padding: 20px; color: #222; }
.admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.admin-header h1 { font-size: 36px; margin: 0; }
.admin-back { padding: 12px 24px; background: #2196F3; color: white; border-radius: 8px; text-decoration: none; font-size: 16px; }
.admin-banner { color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 18px; font-weight: bold; }
.admin-section { background: #f5f5f5; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
.admin-section h2 { margin-top: 0; }
.admin-lead { color: #666; margin-bottom: 15px; }
.admin-card { background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 15px; }
.admin-card h3 { margin-top: 0; }
.admin-field { margin-bottom: 20px; }
.admin-label { display: block; font-weight: bold; margin-bottom: 5px; }
.admin-help { color: #666; margin-top: 5px; font-size: 14px; }
.admin-help-inline { color: #666; margin-left: 10px; }
.admin-help-indent { margin-left: 34px; }
.admin-input { padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
.admin-input-number { width: 150px; }
.admin-input-text { width: 100%; box-sizing: border-box; font-family: monospace; }
.admin-input-select { width: 100%; max-width: 300px; }
.admin-checkbox-label { display: flex; align-items: center; cursor: pointer; }
.admin-checkbox { width: 24px; height: 24px; margin-right: 10px; cursor: pointer; }
.admin-preview { margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px; min-height: 40px; }
.admin-error { margin-top: 10px; color: #f44336; font-weight: bold; }
.admin-chips { max-height: 150px; overflow-y: auto; }
.admin-chip { display: inline-block; padding: 4px 10px; margin: 3px; background: #4CAF50; color: white; border-radius: 12px; font-size: 14px; }
.admin-chip-letter { padding: 6px 12px; background: #2196F3; font-size: 18px; font-weight: bold; }
.admin-note { padding: 15px; background: #e3f2fd; border-radius: 8px; border: 1px solid #2196F3; margin-bottom: 20px; }
.admin-note-warn { background: #fff3cd; border-color: #ffc107; }
.admin-note-title { font-weight: bold; margin-bottom: 5px; }
.admin-note-body { color: #666; font-size: 14px; }
.admin-mono { font-family: monospace; font-size: 16px; font-weight: bold; }
.admin-btn { padding: 12px 24px; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; }
.admin-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.admin-btn-sm { padding: 8px 16px; border-radius: 4px; font-size: 14px; }
.admin-btn-xs { padding: 6px 12px; border-radius: 4px; font-size: 14px; }
.admin-btn-green { background: #4CAF50; }
.admin-btn-orange { background: #FF9800; }
.admin-btn-red { background: #f44336; }
.admin-btn-blue { background: #2196F3; }
.admin-message { margin-top: 10px; color: #4CAF50; font-weight: bold; min-height: 1.2em; }
.admin-row { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
.admin-grid { display: grid; gap: 15px; }
.admin-weights-grid { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); margin-bottom: 15px; }
.admin-weights-row { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.admin-chart { width: 300px; height: 300px; }
.admin-chart-fallback { font-size: 14px; color: #333; }
.admin-chart-fallback li { margin: 2px 0; }
.admin-pokemon-grid { grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); margin-bottom: 40px; }
.admin-pokemon { display: flex; align-items: center; padding: 10px; background: #fff; border-radius: 8px; border: 1px solid #ddd; }
.admin-pokemon.caught { background: #e8f5e9; border-color: #4CAF50; }
.admin-pokemon input { width: 20px; height: 20px; margin-right: 15px; cursor: pointer; }
.admin-pokemon img { width: 60px; height: 60px; margin-right: 15px; object-fit: contain; }
.admin-pokemon-name { font-weight: bold; font-size: 16px; }
.admin-pokemon-status { color: #666; font-size: 14px; }
.admin-sync-box { background: #fff; padding: 15px; border-radius: 8px; border: 2px solid #2196F3; }
.admin-sync-box p { margin: 0 0 10px 0; font-weight: bold; color: #2196F3; }
.admin-sync-box input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px; background: #f9f9f9; }
.admin-sync-box .admin-sync-hint { margin: 10px 0 0 0; font-size: 14px; color: #666; font-weight: normal; }
.admin-sync-message { margin-top: 10px; padding: 10px; border-radius: 8px; font-weight: bold; color: white; }
.admin-word-form { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.admin-word-form input { padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
.admin-emoji-picker-box { margin-top: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd; }
.admin-emoji-grid { max-height: 300px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.admin-emoji-cat-title { font-weight: bold; margin-bottom: 5px; color: #2196F3; }
.admin-emoji-cat { display: flex; flex-wrap: wrap; gap: 5px; }
.admin-emoji { font-size: 24px; cursor: pointer; padding: 4px; }
.admin-word-list { max-height: 400px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; }
.admin-word-letter { background: #2196F3; color: white; padding: 10px; font-weight: bold; font-size: 18px; position: sticky; top: 0; z-index: 1; }
.admin-word-row { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; background: white; }
.admin-word-row-main { display: flex; gap: 15px; align-items: center; }
.admin-word-emoji { font-size: 32px; }
.admin-word-text { font-weight: bold; font-size: 18px; }
.admin-word-key { color: #666; }
.admin-tip { color: #666; font-size: 14px; padding: 10px; background: #e3f2fd; border-radius: 4px; }
.admin-tip-warm { background: #fff3e0; margin-bottom: 20px; }
.admin-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.admin-card-head h3 { margin: 0; }
.admin-toggle-label { display: flex; align-items: center; gap: 10px; cursor: pointer; }
`;
