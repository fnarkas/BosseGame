// "Minigame Probabilities": one weight input per registry entry, Save / Reset,
// and a pie chart of the resulting percentages. Chart.js comes from a CDN;
// when it cannot load (offline) the chart area shows the same percentages as
// a plain list.

import { MINIGAMES } from '../../minigameRegistry.js';
import { DEFAULT_MODE_WEIGHTS } from '../../minigameWheel.js';
import { saveConfig, isConfigSaveAvailable } from '../configApi.js';
import { html, toHtml, flash, MESSAGE_COLORS } from '../html.js';

export const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js';

const CHART_COLORS = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#4DC9F6', '#F67019', '#F53794', '#537BC4'
];

// Data ------------------------------------------------------------------------

// Weights from the config merged over the registry defaults.
export function currentWeights(config) {
    const weights = { ...DEFAULT_MODE_WEIGHTS };
    const stored = config && config.weights;
    if (stored && typeof stored === 'object') {
        for (const key of Object.keys(weights)) {
            const value = parseInt(stored[key], 10);
            if (Number.isFinite(value) && value >= 0) weights[key] = value;
        }
    }
    return weights;
}

// Percentage (one decimal, as a number) per registry key. When every weight is
// 0 the chart shows an equal split, mirroring the game's "never empty" rule.
export function weightPercentages(weights) {
    const keys = MINIGAMES.map(game => game.key);
    const total = keys.reduce((sum, key) => sum + (weights[key] || 0), 0);
    return keys.map(key => {
        const share = total === 0 ? 100 / keys.length : (weights[key] || 0) / total * 100;
        return { key, name: MINIGAMES.find(g => g.key === key).name, percent: Number(share.toFixed(1)) };
    });
}

// Markup ---------------------------------------------------------------------

export function renderWeightsSection(config) {
    const weights = currentWeights(config);
    return toHtml(html`
        <div class="admin-section" id="admin-weights">
            <h2>Minigame Probabilities</h2>
            <p class="admin-lead">Adjust the probability weights for each minigame. Higher values = higher chance of appearing.</p>
            <div class="admin-grid admin-weights-grid">
                ${MINIGAMES.map(game => html`
                    <div>
                        <label class="admin-label" for="weight-${game.key}">${game.name}</label>
                        <input type="number" id="weight-${game.key}" data-weight="${game.key}" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${weights[game.key]}" min="0">
                    </div>`)}
            </div>
            <div class="admin-weights-row">
                <div style="flex: 1; min-width: 260px;">
                    <div class="admin-row" style="margin-bottom: 10px;">
                        <button type="button" id="weights-save" class="admin-btn admin-btn-green">💾 Save Probabilities</button>
                        <button type="button" id="weights-reset" class="admin-btn admin-btn-orange">🔄 Reset to Defaults</button>
                    </div>
                    <div id="weights-message" class="admin-message" style="margin-top: 0;"></div>
                </div>
                <div class="admin-chart" id="weights-chart-box">
                    <canvas id="probabilityChart"></canvas>
                </div>
            </div>
        </div>`);
}

// Behaviour --------------------------------------------------------------------

function readWeightInputs(root) {
    const weights = {};
    for (const game of MINIGAMES) {
        const input = root.querySelector(`#weight-${game.key}`);
        weights[game.key] = input ? (parseInt(input.value, 10) || 0) : 0;
    }
    return weights;
}

function renderFallbackList(box, weights) {
    const rows = weightPercentages(weights);
    box.innerHTML = toHtml(html`
        <ul class="admin-chart-fallback" style="margin: 0; padding-left: 18px;">
            ${rows.map(row => html`<li>${row.name}: ${row.percent}%</li>`)}
        </ul>`);
}

function loadChartJs() {
    if (typeof window !== 'undefined' && window.Chart) return Promise.resolve(window.Chart);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = CHART_JS_URL;
        script.async = true;
        script.onload = () => (window.Chart ? resolve(window.Chart) : reject(new Error('Chart.js did not define Chart')));
        script.onerror = () => reject(new Error('Chart.js failed to load'));
        document.head.appendChild(script);
    });
}

export function mountWeightsSection(root) {
    const message = root.querySelector('#weights-message');
    const chartBox = root.querySelector('#weights-chart-box');
    let chart = null;
    let chartFailed = false;

    const redraw = () => {
        const weights = readWeightInputs(root);
        if (chart) {
            chart.data.datasets[0].data = weightPercentages(weights).map(row => row.percent);
            chart.update();
        } else if (chartFailed) {
            renderFallbackList(chartBox, weights);
        }
    };

    loadChartJs().then(Chart => {
        const canvas = root.querySelector('#probabilityChart');
        if (!canvas) return;
        const rows = weightPercentages(readWeightInputs(root));
        chart = new Chart(canvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels: rows.map(row => row.name),
                datasets: [{
                    data: rows.map(row => row.percent),
                    backgroundColor: rows.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 15, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (context) => `${context.label}: ${context.parsed}%` } }
                }
            }
        });
    }).catch(error => {
        console.warn('Admin: pie chart unavailable, showing percentages as text', error);
        chartFailed = true;
        chartBox.style.height = 'auto';
        redraw();
    });

    for (const input of root.querySelectorAll('[data-weight]')) {
        input.addEventListener('input', redraw);
    }

    const save = async (weights, successText, successColor) => {
        flash(message, '⏳ Saving...', MESSAGE_COLORS.busy, 0);
        try {
            await saveConfig({ weights });
            flash(message, successText, successColor);
        } catch (error) {
            console.error('Failed to save weights:', error);
            flash(message, '❌ Failed to save weights. Check console for details.', MESSAGE_COLORS.error);
        }
        redraw();
    };

    const saveButton = root.querySelector('#weights-save');
    const resetButton = root.querySelector('#weights-reset');
    saveButton.disabled = resetButton.disabled = !isConfigSaveAvailable();

    saveButton.addEventListener('click', () => {
        save(readWeightInputs(root), '✓ Probabilities saved to config file! All devices will use these settings.', MESSAGE_COLORS.ok);
    });
    resetButton.addEventListener('click', () => {
        const defaults = { ...DEFAULT_MODE_WEIGHTS };
        for (const game of MINIGAMES) {
            const input = root.querySelector(`#weight-${game.key}`);
            if (input) input.value = defaults[game.key];
        }
        save(defaults, '✓ Reset to default probabilities and saved to config file!', MESSAGE_COLORS.busy);
    });
}
