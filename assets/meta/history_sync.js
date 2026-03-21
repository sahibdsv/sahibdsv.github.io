const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
    historyDataPath: path.join(__dirname, '../../assets/data/history.json')
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
    console.log('Generating website history snapshot...');
    const history = getGitHistory();
    
    // Ensure directory exists
    const dir = path.dirname(CONFIG.historyDataPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(CONFIG.historyDataPath, JSON.stringify(history, null, 2));
    console.log(`History snapshot saved with ${history.length} notable entries.`);
}

run();
