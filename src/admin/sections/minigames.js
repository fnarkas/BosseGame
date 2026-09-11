// "Minigame Configuration": one panel per entry in MINIGAME_CONFIG_SCHEMA,
// selected from a dropdown. The markup, the live previews and the Save button
// are all generated from the schema; nothing here knows about a specific game.

import { MINIGAME_CONFIG_SCHEMA, readSectionValues, sectionPatch, validateSection, helpHtml } from '../schema.js';
import { saveConfig, isConfigSaveAvailable } from '../configApi.js';
import { html, raw, toHtml, flash, MESSAGE_COLORS } from '../html.js';

const fieldDomId = (field) => `config-field-${field.id}`;
const panelDomId = (section) => `config-panel-${section.id}`;

// Markup ---------------------------------------------------------------------

function renderField(field, value) {
    const id = fieldDomId(field);
    const help = helpHtml(field.help);
    const widthStyle = field.width ? `style="width: ${field.width};"` : '';

    if (field.type === 'checkbox') {
        return html`
            <div class="admin-field">
                <label class="admin-checkbox-label">
                    <input type="checkbox" id="${id}" class="admin-checkbox" ${raw(value ? 'checked' : '')}>
                    <span style="font-weight: bold;">${field.label}</span>
                </label>
                ${help ? html`<div class="admin-help admin-help-indent">${raw(help)}</div>` : ''}
            </div>`;
    }

    let input;
    if (field.type === 'select') {
        input = html`
            <select id="${id}" class="admin-input admin-input-select" ${raw(widthStyle)}>
                ${field.options.map(option => html`
                    <option value="${option.value}" ${raw(option.value === value ? 'selected' : '')}>${option.label}</option>`)}
            </select>`;
    } else if (field.type === 'number') {
        const attrs = ['min', 'max', 'step']
            .filter(name => field[name] !== undefined)
            .map(name => `${name}="${field[name]}"`).join(' ');
        input = html`<input type="number" id="${id}" class="admin-input admin-input-number" value="${value}" ${raw(attrs)} ${raw(widthStyle)}>`;
    } else {
        const mono = field.mono === false ? 'style="font-family: inherit;"' : '';
        const cls = field.width ? 'admin-input' : 'admin-input admin-input-text';
        input = html`<input type="text" id="${id}" class="${cls}" value="${value}" ${raw(widthStyle || mono)}>`;
    }

    const inlineHelp = field.helpInline || (field.type === 'number' && !field.helpBelow);
    return html`
        <div class="admin-field">
            <label class="admin-label" for="${id}">${field.label}</label>
            ${input}
            ${help && inlineHelp ? html`<span class="admin-help-inline">${raw(help)}</span>` : ''}
            ${help && !inlineHelp ? html`<div class="admin-help">${raw(help)}</div>` : ''}
            ${field.preview ? html`
                <div id="${id}-preview" class="admin-preview"></div>
                <div id="${id}-error" class="admin-error" hidden></div>` : ''}
        </div>`;
}

function renderPanel(section, config, visible) {
    const values = readSectionValues(section, config);
    return html`
        <div id="${panelDomId(section)}" class="admin-card" ${raw(visible ? '' : 'hidden')}>
            <h3>${section.title}</h3>
            ${section.fields.map(field => renderField(field, values[field.id]))}
            ${section.preview ? html`<div id="${panelDomId(section)}-preview" class="admin-note"></div>` : ''}
            ${section.about ? html`
                <div class="admin-note ${section.about.warn ? 'admin-note-warn' : ''}">
                    <div class="admin-note-title">${section.about.title}</div>
                    <div class="admin-note-body">${raw(section.about.body)}</div>
                </div>` : ''}
            <button type="button" class="admin-btn admin-btn-green" data-save="${section.id}">${section.saveLabel}</button>
            <div id="${panelDomId(section)}-message" class="admin-message"></div>
        </div>`;
}

export function renderMinigamesSection(config) {
    return toHtml(html`
        <div class="admin-section" id="admin-minigames">
            <h2>Minigame Configuration</h2>
            <p class="admin-lead">Configure settings for individual minigames.</p>
            <div style="margin-bottom: 15px;">
                <label class="admin-label" for="minigame-selector">Select Minigame:</label>
                <select id="minigame-selector" class="admin-input" style="width: 100%; max-width: 400px; padding: 10px; font-size: 16px;">
                    ${MINIGAME_CONFIG_SCHEMA.map(section => html`<option value="${section.id}">${section.option}</option>`)}
                </select>
            </div>
            ${MINIGAME_CONFIG_SCHEMA.map((section, index) => renderPanel(section, config, index === 0))}
        </div>`);
}

// Behaviour --------------------------------------------------------------------

function readFormValues(root, section) {
    const values = {};
    for (const field of section.fields) {
        const input = root.querySelector(`#${fieldDomId(field)}`);
        if (!input) continue;
        if (field.type === 'checkbox') values[field.id] = input.checked;
        else if (field.type === 'number') values[field.id] = parseInt(input.value, 10);
        else values[field.id] = input.value;
    }
    return values;
}

function updateFieldPreview(root, field, value) {
    const preview = root.querySelector(`#${fieldDomId(field)}-preview`);
    const error = root.querySelector(`#${fieldDomId(field)}-error`);
    if (!preview || !error) return true;
    const result = field.preview(value);
    if (result.error) {
        error.textContent = result.error;
        error.hidden = false;
        preview.innerHTML = '';
        return false;
    }
    error.hidden = true;
    preview.innerHTML = result.html;
    return true;
}

function updatePreviews(root, section) {
    const values = readFormValues(root, section);
    for (const field of section.fields) {
        if (field.preview) updateFieldPreview(root, field, values[field.id]);
    }
    if (section.preview) {
        const box = root.querySelector(`#${panelDomId(section)}-preview`);
        if (box) box.innerHTML = section.preview(values);
    }
}

async function savePanel(root, section) {
    const message = root.querySelector(`#${panelDomId(section)}-message`);
    const values = readFormValues(root, section);
    const invalid = validateSection(section, values);
    if (invalid) {
        updatePreviews(root, section);
        return;
    }
    flash(message, '⏳ Saving...', MESSAGE_COLORS.busy, 0);
    try {
        await saveConfig(sectionPatch(section, values));
        flash(message, `✓ ${section.title.replace(/ Configuration$/, '')} config saved to server! All devices will use these settings.`, MESSAGE_COLORS.ok);
    } catch (error) {
        console.error(`Failed to save ${section.key} config:`, error);
        flash(message, '❌ Failed to save config. Check console for details.', MESSAGE_COLORS.error);
    }
}

export function mountMinigamesSection(root) {
    const selector = root.querySelector('#minigame-selector');
    const showPanel = (id) => {
        for (const section of MINIGAME_CONFIG_SCHEMA) {
            const panel = root.querySelector(`#${panelDomId(section)}`);
            if (panel) panel.hidden = section.id !== id;
        }
        const section = MINIGAME_CONFIG_SCHEMA.find(s => s.id === id);
        if (section) updatePreviews(root, section);
    };
    selector.addEventListener('change', () => showPanel(selector.value));

    for (const section of MINIGAME_CONFIG_SCHEMA) {
        for (const field of section.fields) {
            const input = root.querySelector(`#${fieldDomId(field)}`);
            if (!input) continue;
            const eventName = field.type === 'select' || field.type === 'checkbox' ? 'change' : 'input';
            input.addEventListener(eventName, () => updatePreviews(root, section));
        }
        const button = root.querySelector(`[data-save="${section.id}"]`);
        if (button) {
            button.disabled = !isConfigSaveAvailable();
            button.addEventListener('click', () => savePanel(root, section));
        }
        updatePreviews(root, section);
    }
    showPanel(selector.value);
}
