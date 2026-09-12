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
:root { --admin-bg: #eef1f5; --admin-card: #fff; --admin-ink: #1f2933; --admin-muted: #5f6b7a; --admin-line: #d9dee5;
        --admin-blue: #2196F3; --admin-green: #4CAF50; --admin-orange: #FF9800; --admin-red: #f44336; --admin-radius: 12px; }
.admin { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 0 20px 60px; color: var(--admin-ink); }
.admin * { box-sizing: border-box; }
.admin h1 { font-size: 24px; margin: 0; white-space: nowrap; }
.admin h2 { font-size: 22px; margin: 0 0 6px; }
.admin h3 { font-size: 17px; }

/* Header: title, account picker, sync pill, back link. Sticks to the top. */
.admin-header { position: sticky; top: 0; z-index: 20; display: flex; justify-content: space-between; align-items: center; gap: 16px;
                margin: 0 -20px 16px; padding: 12px 20px; background: rgba(255,255,255,0.96); backdrop-filter: blur(6px); border-bottom: 1px solid var(--admin-line); }
.admin-header-main { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; min-width: 0; }
.admin-account { display: flex; align-items: center; gap: 6px; }
.admin-account-icon { font-size: 20px; }
.admin-account-select { padding: 8px 12px; font-size: 16px; font-weight: 600; max-width: 260px; background: #fff; }
.admin-sync { font-size: 13px; font-weight: 600; padding: 5px 12px; border-radius: 999px; white-space: nowrap; }
.admin-sync.saved { color: #1b5e20; background: #e8f5e9; }
.admin-sync.pending { color: #7a4b00; background: #fff3e0; }
.admin-sync.error { color: #b71c1c; background: #ffebee; }
.admin-back { padding: 8px 14px; background: var(--admin-blue); color: white; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; white-space: nowrap; }
.admin-banner { color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 18px; font-weight: bold; }

/* Tabs */
.admin-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.admin-tab { padding: 10px 16px; border-radius: 999px; background: #fff; border: 1px solid var(--admin-line); color: var(--admin-ink); text-decoration: none; font-size: 15px; font-weight: 600; }
.admin-tab:hover { border-color: var(--admin-blue); }
.admin-tab.active { background: var(--admin-blue); border-color: var(--admin-blue); color: #fff; }
.admin-subnav { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.admin-subtab { padding: 7px 12px; border-radius: 8px; border: 1px solid var(--admin-line); background: #fff; color: var(--admin-ink); font-size: 14px; cursor: pointer; }
.admin-subtab.active { background: var(--admin-ink); border-color: var(--admin-ink); color: #fff; }

/* Sections and cards */
.admin-section { background: var(--admin-card); padding: 20px; border-radius: var(--admin-radius); margin-bottom: 20px; border: 1px solid var(--admin-line); }
.admin-section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.admin-lead { color: var(--admin-muted); margin: 0 0 16px; }
.admin-card { background: #f8fafc; padding: 18px; border-radius: 10px; border: 1px solid var(--admin-line); margin-bottom: 15px; }
.admin-card h3 { margin-top: 0; }
.admin-field { margin-bottom: 18px; }
.admin-label { display: block; font-weight: 600; margin-bottom: 5px; }
.admin-help { color: var(--admin-muted); margin-top: 4px; font-size: 13px; }
.admin-help-inline { color: var(--admin-muted); margin-left: 10px; font-size: 13px; }
.admin-help-indent { margin-left: 34px; }
.admin-input { padding: 8px 10px; border: 1px solid #c5ccd6; border-radius: 8px; font-size: 14px; background: #fff; color: var(--admin-ink); }
.admin-input:focus { outline: 2px solid var(--admin-blue); outline-offset: 0; border-color: var(--admin-blue); }
.admin-input-number { width: 150px; }
.admin-input-text { width: 100%; font-family: monospace; }
.admin-input-select { width: 100%; max-width: 300px; }
.admin-checkbox-label { display: flex; align-items: center; cursor: pointer; }
.admin-checkbox { width: 22px; height: 22px; margin-right: 10px; cursor: pointer; }
.admin-preview { margin-top: 10px; padding: 10px; background: #fff; border-radius: 8px; min-height: 40px; border: 1px dashed var(--admin-line); }
.admin-error { margin-top: 10px; color: var(--admin-red); font-weight: bold; }
.admin-chips { max-height: 150px; overflow-y: auto; }
.admin-chip { display: inline-block; padding: 4px 10px; margin: 3px; background: var(--admin-green); color: white; border-radius: 12px; font-size: 14px; }
.admin-chip-letter { padding: 6px 12px; background: var(--admin-blue); font-size: 18px; font-weight: bold; }
.admin-note { padding: 14px; background: #e3f2fd; border-radius: 8px; border: 1px solid #bbdefb; margin-bottom: 16px; }
.admin-note-warn { background: #fff3cd; border-color: #ffe082; }
.admin-note-title { font-weight: bold; margin-bottom: 5px; }
.admin-note-body { color: var(--admin-muted); font-size: 14px; }
.admin-mono { font-family: monospace; font-size: 16px; font-weight: bold; }

/* Buttons */
.admin-btn { padding: 11px 20px; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 600; }
.admin-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.admin-btn-sm { padding: 8px 14px; font-size: 14px; }
.admin-btn-xs { padding: 6px 12px; font-size: 13px; }
.admin-btn-green { background: var(--admin-green); }
.admin-btn-orange { background: var(--admin-orange); }
.admin-btn-red { background: var(--admin-red); }
.admin-btn-blue { background: var(--admin-blue); }
.admin-message { margin-top: 10px; color: var(--admin-green); font-weight: bold; min-height: 1.2em; }
.admin-row { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
.admin-grid { display: grid; gap: 12px; }
.admin-empty { color: var(--admin-muted); text-align: center; padding: 30px; }

/* Inventory */
.admin-inv-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
.admin-inv-item { display: flex; gap: 14px; align-items: flex-start; margin: 0; }
.admin-inv-icon { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; flex: none; background: #fff; border-radius: 12px; border: 1px solid var(--admin-line); }
.admin-inv-icon img { width: 52px; height: 52px; object-fit: contain; }
.admin-inv-emoji { font-size: 36px; line-height: 1; }
.admin-inv-body { flex: 1; min-width: 0; }
.admin-inv-label { font-weight: 700; font-size: 17px; }
.admin-stepper { display: flex; align-items: center; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.admin-step { width: 40px; height: 40px; border-radius: 10px; border: 1px solid #c5ccd6; background: #fff; font-size: 22px; line-height: 1; cursor: pointer; color: var(--admin-ink); }
.admin-step:hover { border-color: var(--admin-blue); color: var(--admin-blue); }
.admin-stepper-input { width: 92px; height: 40px; text-align: center; font-size: 18px; font-weight: 700; -moz-appearance: textfield; }
.admin-stepper-input::-webkit-outer-spin-button, .admin-stepper-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.admin-inv-quick { display: flex; gap: 6px; margin-left: 6px; flex-wrap: wrap; }
.admin-chip-btn { padding: 6px 10px; border-radius: 999px; border: 1px solid #c5ccd6; background: #fff; color: var(--admin-ink); font-size: 13px; font-weight: 600; cursor: pointer; }
.admin-chip-btn:hover { border-color: var(--admin-green); color: #2e7d32; }
.admin-chip-btn-muted { color: var(--admin-muted); }
.admin-chip-btn-muted:hover { border-color: var(--admin-red); color: var(--admin-red); }

/* Probabilities */
.admin-weights-grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-bottom: 15px; }
.admin-weights-row { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.admin-chart { width: 300px; max-width: 100%; height: 300px; }
.admin-chart-fallback { font-size: 14px; color: #333; }
.admin-chart-fallback li { margin: 2px 0; }

/* Pokédex */
.admin-progress { display: flex; align-items: center; gap: 14px; margin: 6px 0 14px; }
.admin-progress-bar { flex: 1; height: 12px; background: #e3e8ee; border-radius: 999px; overflow: hidden; }
.admin-progress-fill { height: 100%; background: linear-gradient(90deg, #66bb6a, #43a047); border-radius: 999px; transition: width 0.25s; }
.admin-progress-text { color: var(--admin-muted); white-space: nowrap; }
.admin-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.admin-search { flex: 1; min-width: 200px; font-size: 15px; padding: 10px 12px; }
.admin-segmented { display: inline-flex; border: 1px solid #c5ccd6; border-radius: 8px; overflow: hidden; background: #fff; }
.admin-seg { padding: 9px 14px; border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--admin-ink); }
.admin-seg + .admin-seg { border-left: 1px solid #c5ccd6; }
.admin-seg.active { background: var(--admin-ink); color: #fff; }
.admin-pokemon-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.admin-pokemon { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #fff; border-radius: 10px; border: 1px solid var(--admin-line); cursor: pointer; user-select: none; }
.admin-pokemon:hover { border-color: var(--admin-blue); }
.admin-pokemon.caught { background: #e8f5e9; border-color: #81c784; }
.admin-pokemon input { width: 20px; height: 20px; margin: 0; cursor: pointer; flex: none; }
.admin-pokemon img { width: 56px; height: 56px; object-fit: contain; flex: none; }
.admin-pokemon-text { min-width: 0; }
.admin-pokemon-name { display: block; font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-pokemon-status { display: block; color: var(--admin-muted); font-size: 12px; }
.admin-chip-btn.active { border-color: var(--admin-green); background: #e8f5e9; color: #2e7d32; }
.admin-chip-btn img { width: 24px; height: 24px; object-fit: contain; vertical-align: middle; }
.admin-queue-results { margin: -4px 0 12px; }
.admin-queue { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.admin-queue-slot { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #fff; border-radius: 10px; border: 1px solid var(--admin-line); }
.admin-queue-slot.pinned { background: #fff8e1; border-color: #ffb300; }
.admin-queue-slot img { width: 56px; height: 56px; object-fit: contain; flex: none; }
.admin-queue-slot .admin-pokemon-text { flex: 1; }
.admin-queue-pos { flex: none; width: 24px; text-align: center; font-weight: 800; color: var(--admin-muted); }

/* Dictionary */
.admin-word-form { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 10px; margin-bottom: 10px; }
.admin-word-form input { padding: 8px 10px; border: 1px solid #c5ccd6; border-radius: 8px; }
.admin-emoji-picker-box { margin-top: 15px; padding: 10px; background: #fff; border-radius: 8px; border: 1px solid var(--admin-line); }
.admin-emoji-grid { max-height: 300px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.admin-emoji-cat-title { font-weight: bold; margin-bottom: 5px; color: var(--admin-blue); }
.admin-emoji-cat { display: flex; flex-wrap: wrap; gap: 5px; }
.admin-emoji { font-size: 24px; cursor: pointer; padding: 4px; }
.admin-word-list { max-height: 480px; overflow-y: auto; border: 1px solid var(--admin-line); border-radius: 8px; background: #fff; }
.admin-word-letter { background: var(--admin-blue); color: white; padding: 8px 12px; font-weight: bold; font-size: 16px; position: sticky; top: 0; z-index: 1; }
.admin-word-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #eee; background: white; }
.admin-word-row-main { display: flex; gap: 15px; align-items: center; }
.admin-word-emoji { font-size: 28px; }
.admin-word-text { font-weight: bold; font-size: 17px; }
.admin-word-key { color: var(--admin-muted); }
.admin-tip { color: var(--admin-muted); font-size: 14px; padding: 10px; background: #e3f2fd; border-radius: 8px; }
.admin-tip-warm { background: #fff3e0; margin-bottom: 20px; }
.admin-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; gap: 10px; flex-wrap: wrap; }
.admin-card-head h3 { margin: 0; }
.admin-toggle-label { display: flex; align-items: center; gap: 10px; cursor: pointer; }

@media (max-width: 640px) {
    .admin { padding: 0 12px 40px; }
    .admin-header { margin: 0 -12px 12px; padding: 10px 12px; }
    .admin h1 { font-size: 20px; }
    .admin-back { padding: 8px 10px; }
    .admin-section { padding: 14px; }
    .admin-inv-grid { grid-template-columns: 1fr; }
    .admin-word-form { grid-template-columns: 1fr 1fr; }
    .admin-pokemon-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
`;
