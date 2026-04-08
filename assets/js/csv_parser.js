function parseFullCSV(text) {
    const p = [[]];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];
        if (char === '"' && inQuotes && next === '"') {
            cur += '"'; i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            p[p.length - 1].push(cur.trim()); cur = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i++;
            p[p.length - 1].push(cur.trim()); cur = '';
            p.push([]);
        } else {
            cur += char;
        }
    }
    if (cur || p[p.length - 1].length) p[p.length - 1].push(cur.trim());
    return p.filter(r => r.length > 1);
}

// Export for Node.js if applicable
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseFullCSV };
}