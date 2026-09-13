// "Logs": what the child's device reported (src/remoteLog.js), newest first,
// so a parent can see why a game stopped without plugging the iPad into a
// Mac. Refreshes itself every few seconds while the tab is open. Filters:
// everything, problems only (console errors and warnings, uncaught errors,
// speech errors), the game's own milestones, or the speech path.

import { getCurrentAccount } from '../../account.js';
import { fetchClientLog } from '../../remoteLog.js';
import { html, toHtml } from '../html.js';

export const LOG_LIMIT = 300;
export const LOG_REFRESH_MS = 5000;

export const LOG_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'problems', label: '⚠️ Problems' },
    { id: 'game', label: '🎮 Game' },
    { id: 'speech', label: '🎤 Speech' }
];

export function isProblem(entry) {
    if (!entry) return false;
    if (entry.source === 'window') return true;
    if (entry.source === 'console') return entry.event === 'error' || entry.event === 'warn';
    return entry.event === 'error' || entry.event === 'unhandledrejection' || entry.event === 'startFailed';
}

export function matchesLogFilter(entry, filter) {
    switch (filter) {
        case 'problems': return isProblem(entry);
        case 'game': return entry.source === 'game' || entry.source === 'app';
        case 'speech': return entry.source === 'speech' || entry.source === 'mic';
        default: return true;
    }
}

// One line of detail for the table: the message for console/window events,
// otherwise the data as compact JSON.
export function describeLogData(entry) {
    const data = entry && entry.data;
    if (data === null || data === undefined) return '';
    if (typeof data === 'object') {
        if (typeof data.message === 'string' && Object.keys(data).length <= 3) {
            const extra = data.error && data.error.stack ? `\n${data.error.stack}` : '';
            return `${data.message}${data.source ? ` (${data.source})` : ''}${extra}`;
        }
        if (data.reason && data.reason.message) return `${data.reason.message}${data.reason.stack ? `\n${data.reason.stack}` : ''}`;
        try {
            return JSON.stringify(data);
        } catch (error) {
            return String(data);
        }
    }
    return String(data);
}

function timeOf(entry) {
    const iso = entry.t || entry.received;
    const date = iso ? new Date(iso) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('sv-SE');
}

function dayOf(entry) {
    const iso = entry.t || entry.received;
    return iso ? String(iso).slice(0, 10) : '';
}

// Rows for `entries` (oldest first, as the server sends them), newest on top.
export function renderLogRows(entries, filter = 'all') {
    const rows = entries.filter(entry => matchesLogFilter(entry, filter)).reverse();
    if (rows.length === 0) return [];
    let lastDay = null;
    const out = [];
    for (const entry of rows) {
        const day = dayOf(entry);
        if (day !== lastDay) {
            lastDay = day;
            out.push(html`<tr class="admin-log-day"><td colspan="4">${day}</td></tr>`);
        }
        out.push(html`
            <tr class="admin-log-row ${isProblem(entry) ? 'problem' : ''}">
                <td class="admin-log-time">${timeOf(entry)}</td>
                <td class="admin-log-source">${entry.source || ''}</td>
                <td class="admin-log-event">${entry.event || ''}</td>
                <td class="admin-log-data">${describeLogData(entry)}</td>
            </tr>`);
    }
    return out;
}

export function renderLogsSection() {
    return toHtml(html`
        <div class="admin-section" id="admin-logs">
            <div class="admin-section-head">
                <h2>🪵 Logs</h2>
                <div class="admin-row" style="margin: 0;">
                    <label class="admin-checkbox-label"><input type="checkbox" id="logs-auto" class="admin-checkbox" checked> Auto-refresh</label>
                    <button type="button" id="logs-refresh" class="admin-btn admin-btn-sm admin-btn-blue">↻ Refresh</button>
                </div>
            </div>
            <p class="admin-lead">What this player's device reported: the game's own milestones, console errors and warnings, and the speech path. Newest first.</p>
            <div class="admin-toolbar">
                <div class="admin-segmented" id="logs-filter">
                    ${LOG_FILTERS.map((option, index) => html`
                        <button type="button" class="admin-seg ${index === 0 ? 'active' : ''}" data-log-filter="${option.id}">${option.label}</button>`)}
                </div>
                <span class="admin-help-inline" id="logs-status"></span>
            </div>
            <div class="admin-log-scroll">
                <table class="admin-log-table">
                    <tbody id="logs-body"></tbody>
                </table>
            </div>
            <div class="admin-empty" id="logs-empty">Nothing logged yet.</div>
        </div>`);
}

let refreshTimer = null;

export function mountLogsSection(root) {
    const body = root.querySelector('#logs-body');
    const empty = root.querySelector('#logs-empty');
    const status = root.querySelector('#logs-status');
    const filterBox = root.querySelector('#logs-filter');
    const auto = root.querySelector('#logs-auto');
    const panel = root.querySelector('[data-panel="logs"]');
    if (!body) return;
    let filter = 'all';
    let entries = [];

    const paint = () => {
        const rows = renderLogRows(entries, filter);
        body.innerHTML = toHtml(html`${rows}`);
        empty.hidden = rows.length > 0;
    };

    const load = async () => {
        try {
            entries = await fetchClientLog({ name: getCurrentAccount(), n: LOG_LIMIT });
            status.textContent = `${entries.length} events · updated ${new Date().toLocaleTimeString('sv-SE')}`;
            paint();
        } catch (error) {
            status.textContent = `❌ ${error.message}`;
        }
    };

    filterBox.addEventListener('click', (event) => {
        const button = event.target.closest('[data-log-filter]');
        if (!button) return;
        filter = button.dataset.logFilter;
        for (const b of filterBox.querySelectorAll('[data-log-filter]')) b.classList.toggle('active', b === button);
        paint();
    });
    root.querySelector('#logs-refresh').addEventListener('click', load);

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        if (!auto.checked) return;
        if (!body.isConnected) { clearInterval(refreshTimer); refreshTimer = null; return; }
        if (panel && panel.hidden) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        load();
    }, LOG_REFRESH_MS);
    load();
}
