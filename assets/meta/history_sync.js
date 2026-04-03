const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
    historyDataPath: path.join(__dirname, '../../assets/data/history.json'),
    historyFragmentDir: path.join(__dirname, '../../assets/data/history/'),
};

function getGitHistory() {
    try {
        // Get all commits with hash, date, and message (using :::: as a safe separator)
        const log = execSync('git log "--pretty=format:%H::::%ad::::%s" --date=short').toString();
        const lines = log.split('\n');
        
        const history = [];
        const seenMessages = new Set();

        for (const line of lines) {
            const [hash, date, message] = line.split('::::');
            if (!hash || !date || !message) continue;
            
            // Filter out noise
            if (message.startsWith('chore: auto-sync')) continue;
            if (message.startsWith('Merge branch')) continue;
            if (message.includes('corrupted HTML')) continue;
            if (message.includes('Media Sync: Update')) continue;
            
            // Deduplicate similar messages to keep it clean (optional)
            if (seenMessages.has(message)) continue;
            seenMessages.add(message);

            history.push({ hash, date, message });
        }

        return history;
    } catch (e) {
        console.error('Failed to get git history:', e);
        return [];
    }
}

function run() {
    console.log('Generating website history fragments (Atomic Mode)...');
    const history = getGitHistory();
    
    // Ensure directory exists
    if (!fs.existsSync(CONFIG.historyFragmentDir)) {
        fs.mkdirSync(CONFIG.historyFragmentDir, { recursive: true });
    }

    // 1. Group records by month (YYYY-MM)
    const segments = {};
    const manifest = [];
    
    history.forEach(item => {
        const monthKey = item.date.substring(0, 7); // e.g., "2026-04"
        if (!segments[monthKey]) {
            segments[monthKey] = [];
            manifest.push(monthKey);
        }
        segments[monthKey].push(item);
    });

    // 2. Write each segment
    for (const [monthKey, items] of Object.entries(segments)) {
        const segmentPath = path.join(CONFIG.historyFragmentDir, `${monthKey}.json`);
        fs.writeFileSync(segmentPath, JSON.stringify(items, null, 2));
    }

    // 3. Write manifest (List of segment keys, sorted naturally)
    // Manifest lists which months exist. Conflicts only happen here when a new month starts.
    fs.writeFileSync(path.join(CONFIG.historyFragmentDir, 'manifest.json'), JSON.stringify(manifest.sort().reverse(), null, 2));

    // 4. Legacy fallback: STILL write history.json but maybe just the latest entries?
    // User: "Address merge conflict... then push". Let's keep history.json for now to not break the site.
    fs.writeFileSync(CONFIG.historyDataPath, JSON.stringify(history, null, 2));

    console.log(`History fragments saved: ${manifest.length} segments with ${history.length} notable entries total.`);
}

run();
