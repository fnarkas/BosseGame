/**
 * Shared popup utility for showing number progress in number-based game modes
 * Used by both NumberListeningMode and LegendaryNumbersMode
 */

/**
 * Show a popup displaying progress for a set of numbers
 * @param {Set} clearedNumbers - Set of numbers that have been cleared
 * @param {number} minNumber - Minimum number in range (inclusive)
 * @param {number} maxNumber - Maximum number in range (inclusive)
 * @param {string} title - Title for the popup
 * @param {Set} activeNumbers - Optional set of active numbers (others shown as inactive)
 */
export function showNumberProgressPopup(clearedNumbers, minNumber, maxNumber, title = 'Progress', activeNumbers = null) {
    // Create HTML popup overlay
    const popup = document.createElement('div');
    popup.id = 'number-progress-popup';
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

    const titleElement = document.createElement('h2');
    titleElement.textContent = title;
    titleElement.style.cssText = `
        margin: 0 0 25px 0;
        text-align: center;
        font-family: Arial, sans-serif;
        font-size: 28px;
    `;
    content.appendChild(titleElement);

    // Create matrix grid
    const totalNumbers = maxNumber - minNumber + 1;
    const cols = 10; // Always use 10 columns for consistency
    const matrix = document.createElement('div');
    matrix.style.cssText = `
        display: grid;
        grid-template-columns: repeat(${cols}, 1fr);
        gap: 6px;
        margin-bottom: 25px;
    `;

    // Create cells for each number in range
    for (let i = minNumber; i <= maxNumber; i++) {
        const cell = document.createElement('div');
        const isCleared = clearedNumbers.has(i);
        const isActive = activeNumbers ? activeNumbers.has(i) : true;

        // Determine background color and text color
        let backgroundColor;
        let textColor;
        let opacity;
        if (isCleared) {
            backgroundColor = '#27AE60'; // Green for cleared
            textColor = 'white';
            opacity = '1';
        } else if (isActive) {
            backgroundColor = '#555555'; // Gray for active but not cleared
            textColor = 'white';
            opacity = '1';
        } else {
            backgroundColor = '#0d0d0d'; // Very dark for inactive
            textColor = '#777777'; // Dimmed gray text
            opacity = '0.35';
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

    // Add progress text
    const progressText = document.createElement('div');
    const activeCount = activeNumbers ? activeNumbers.size : totalNumbers;
    progressText.textContent = `Cleared: ${clearedNumbers.size} / ${activeCount}`;
    progressText.style.cssText = `
        text-align: center;
        font-family: Arial, sans-serif;
        font-size: 21px;
        font-weight: bold;
        margin-bottom: 20px;
    `;
    content.appendChild(progressText);

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = `
        display: block;
        margin: 0 auto;
        padding: 14px 45px;
        font-size: 20px;
        font-family: Arial, sans-serif;
        background: #3498DB;
        color: white;
        border: none;
        border-radius: 9px;
        cursor: pointer;
        font-weight: bold;
    `;
    closeButton.onmouseover = () => {
        closeButton.style.background = '#2980B9';
    };
    closeButton.onmouseout = () => {
        closeButton.style.background = '#3498DB';
    };
    closeButton.onclick = () => {
        document.body.removeChild(popup);
    };
    content.appendChild(closeButton);

    popup.appendChild(content);

    // Close on background click
    popup.onclick = (e) => {
        if (e.target === popup) {
            document.body.removeChild(popup);
        }
    };

    document.body.appendChild(popup);
}
