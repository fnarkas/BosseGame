/**
 * Shared popup showing which numbers have been cleared in the number modes
 * (NumberListeningMode, NumberReadingMode, LegendaryNumbersMode).
 *
 * The child can't read, so the popup is purely visual: an emoji title, the
 * number chart itself (green = cleared, grey = still to do, dimmed = not part
 * of this challenge) and a green progress bar. The only text is the numbers
 * in the grid, which are learning content.
 */

const POPUP_ID = 'number-progress-popup';

/**
 * @param {Set<number>} clearedNumbers - Numbers that have been cleared
 * @param {number} minNumber - Minimum number in range (inclusive)
 * @param {number} maxNumber - Maximum number in range (inclusive)
 * @param {string} title - Emoji title for the popup
 * @param {Set<number>|null} activeNumbers - Optional set of active numbers (others shown as inactive)
 */
export function showNumberProgressPopup(clearedNumbers, minNumber, maxNumber, title = '🔢', activeNumbers = null) {
    // Only one popup at a time - a second tap while it's open would stack
    // another copy on top.
    const existing = document.getElementById(POPUP_ID);
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 35px;
        border-radius: 18px;
        max-width: 92%;
        max-height: 92%;
        overflow: auto;
    `;

    const titleElement = document.createElement('div');
    titleElement.textContent = title;
    titleElement.style.cssText = `
        margin: 0 0 25px 0;
        text-align: center;
        font-size: 40px;
        line-height: 1;
    `;
    content.appendChild(titleElement);

    // The number chart, ten columns wide
    const matrix = document.createElement('div');
    matrix.style.cssText = `
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 6px;
        margin-bottom: 25px;
    `;

    for (let i = minNumber; i <= maxNumber; i++) {
        const cell = document.createElement('div');
        const isCleared = clearedNumbers.has(i);
        const isActive = activeNumbers ? activeNumbers.has(i) : true;

        let backgroundColor, textColor, opacity;
        if (isCleared) {
            backgroundColor = '#27AE60'; textColor = 'white'; opacity = '1';
        } else if (isActive) {
            backgroundColor = '#555555'; textColor = 'white'; opacity = '1';
        } else {
            backgroundColor = '#0d0d0d'; textColor = '#777777'; opacity = '0.35';
        }

        cell.textContent = i;
        cell.style.cssText = `
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: ${backgroundColor};
            color: ${textColor};
            font-family: Arial, sans-serif;
            font-weight: bold;
            font-size: 20px;
            border-radius: 5px;
            min-width: 50px;
            min-height: 50px;
            opacity: ${opacity};
        `;
        matrix.appendChild(cell);
    }
    content.appendChild(matrix);

    // Progress bar: how much of the challenge is green
    const activeCount = activeNumbers ? activeNumbers.size : (maxNumber - minNumber + 1);
    const clearedActive = [...clearedNumbers].filter(n => n >= minNumber && n <= maxNumber && (!activeNumbers || activeNumbers.has(n))).length;
    const fraction = activeCount > 0 ? Math.min(1, clearedActive / activeCount) : 0;

    const bar = document.createElement('div');
    bar.style.cssText = `
        height: 22px;
        background: #DDDDDD;
        border-radius: 11px;
        overflow: hidden;
        margin-bottom: 25px;
    `;
    const fill = document.createElement('div');
    fill.style.cssText = `
        width: ${Math.round(fraction * 100)}%;
        height: 100%;
        background: #27AE60;
        border-radius: 11px;
    `;
    bar.appendChild(fill);
    content.appendChild(bar);

    // Close: a big ✕, no words
    const closeButton = document.createElement('button');
    closeButton.textContent = '✕';
    closeButton.setAttribute('aria-label', 'close');
    closeButton.style.cssText = `
        display: block;
        margin: 0 auto;
        padding: 12px 40px;
        font-size: 28px;
        line-height: 1;
        background: #3498DB;
        color: white;
        border: none;
        border-radius: 9px;
        cursor: pointer;
        font-weight: bold;
    `;
    closeButton.onmouseover = () => { closeButton.style.background = '#2980B9'; };
    closeButton.onmouseout = () => { closeButton.style.background = '#3498DB'; };
    closeButton.onclick = () => popup.remove();
    content.appendChild(closeButton);

    popup.appendChild(content);

    // Close on background click
    popup.onclick = (e) => {
        if (e.target === popup) popup.remove();
    };

    document.body.appendChild(popup);
}
