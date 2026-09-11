// Parse an admin-entered number list like "12-20, 30, 40-49" into a sorted
// array of unique non-negative integers. Invalid parts are skipped; if nothing
// valid remains, `fallback` is returned (as a copy).
export function parseNumberRange(input, fallback = []) {
    const numbers = new Set();
    try {
        for (const part of String(input ?? '').split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            if (trimmed.includes('-')) {
                const [startStr, endStr] = trimmed.split('-');
                const start = parseInt(startStr, 10);
                const end = parseInt(endStr, 10);
                if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0) continue;
                // Guard against a typo like "1-1000000" freezing the game
                const cappedEnd = Math.min(end, start + 10000);
                for (let i = start; i <= cappedEnd; i++) numbers.add(i);
            } else {
                const num = parseInt(trimmed, 10);
                if (!Number.isFinite(num) || num < 0) continue;
                numbers.add(num);
            }
        }
    } catch (error) {
        // fall through to fallback
    }
    const result = Array.from(numbers).sort((a, b) => a - b);
    return result.length > 0 ? result : [...fallback];
}

// Convenience: an inclusive integer range as an array.
export function range(start, end) {
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
}
