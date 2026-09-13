import { describe, it, expect } from 'vitest';
import { toHtml, html } from '../../src/admin/html.js';
import { renderLogRows, renderLogsSection, isProblem, matchesLogFilter, describeLogData, LOG_FILTERS } from '../../src/admin/sections/logs.js';

const entries = [
    { t: '2026-09-13T11:00:00.000Z', name: 'Bosse', source: 'game', event: 'wheelShown', data: { mode: 'VowelSortMode' } },
    { t: '2026-09-13T11:00:05.000Z', name: 'Bosse', source: 'console', event: 'error', data: { message: 'colors is not defined' } },
    { t: '2026-09-14T08:00:00.000Z', name: 'Bosse', source: 'speech', event: 'result', data: { transcript: 'hund' } },
    { t: '2026-09-14T08:00:01.000Z', name: 'Bosse', source: 'window', event: 'error', data: { message: 'x <b>bad</b>', source: 'app.js:1:1', error: { stack: 'Error: x\n at y' } } }
];

describe('admin logs tab', () => {
    it('knows a problem when it sees one', () => {
        expect(entries.map(isProblem)).toEqual([false, true, false, true]);
        expect(isProblem({ source: 'speech', event: 'error' })).toBe(true);
        expect(isProblem({ source: 'console', event: 'muted' })).toBe(false);
    });

    it('filters by kind', () => {
        expect(LOG_FILTERS.map(f => f.id)).toEqual(['all', 'problems', 'game', 'speech']);
        expect(entries.filter(e => matchesLogFilter(e, 'game')).map(e => e.event)).toEqual(['wheelShown']);
        expect(entries.filter(e => matchesLogFilter(e, 'speech')).map(e => e.event)).toEqual(['result']);
        expect(entries.filter(e => matchesLogFilter(e, 'problems'))).toHaveLength(2);
        expect(entries.filter(e => matchesLogFilter(e, 'all'))).toHaveLength(4);
    });

    it('renders newest first with a day header, escaping the data', () => {
        const page = toHtml(html`${renderLogRows(entries)}`);
        const shown = [...page.matchAll(/admin-log-event">([^<]*)</g)].map(m => m[1]);
        expect(shown).toEqual(['error', 'result', 'error', 'wheelShown']);
        expect(page.indexOf('2026-09-14')).toBeLessThan(page.indexOf('2026-09-13'));
        expect(page).toContain('&lt;b&gt;bad&lt;/b&gt;');
        expect(page).not.toContain('<b>bad</b>');
        expect(page).toContain('class="admin-log-row problem"');
        expect(page).toContain('Error: x');
        expect(renderLogRows(entries, 'speech')).toHaveLength(2); // day header + row
        expect(renderLogRows([], 'all')).toEqual([]);
    });

    it('describes data as a message when there is one, else as JSON', () => {
        expect(describeLogData(entries[0])).toBe('{"mode":"VowelSortMode"}');
        expect(describeLogData(entries[1])).toBe('colors is not defined');
        expect(describeLogData(entries[3])).toBe('x <b>bad</b> (app.js:1:1)\nError: x\n at y');
        expect(describeLogData({ data: null })).toBe('');
        expect(describeLogData({ data: 'plain' })).toBe('plain');
    });

    it('renders the section with its controls', () => {
        const page = renderLogsSection();
        for (const id of ['admin-logs', 'logs-body', 'logs-filter', 'logs-refresh', 'logs-auto', 'logs-empty']) {
            expect(page).toContain(`id="${id}"`);
        }
        expect(page).toContain('data-log-filter="problems"');
    });
});
