
// database.js - Local JSON file storage instead of PostgreSQL
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILES = {
    settings: path.join(DATA_DIR, 'settings.json'),
    capital: path.join(DATA_DIR, 'capital.json'),
    alerts: path.join(DATA_DIR, 'alerts.json'),
    alertSettings: path.join(DATA_DIR, 'alertSettings.json'),
    history: path.join(DATA_DIR, 'history.json'),
    hourlyHistory: path.join(DATA_DIR, 'hourlyHistory.json'),
    positions: path.join(DATA_DIR, 'positions.json'),
    balanceState: path.join(DATA_DIR, 'balanceState.json'),
    closedTrades: path.join(DATA_DIR, 'closedTrades.json')
};

async function connectDB() {
    try {
        // Create data directory if it doesn't exist
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Initialize default files if they don't exist
        for (const [key, filePath] of Object.entries(DATA_FILES)) {
            try {
                await fs.access(filePath);
            } catch {
                // File doesn't exist, create with default data
                let defaultData = {};
                if (key === 'settings') {
                    defaultData = { dailySummary: false, autoPostToChannel: false, debugMode: false };
                } else if (key === 'capital') {
                    defaultData = { amount: 0 };
                } else if (key === 'alerts') {
                    defaultData = { alerts: [] };
                } else if (key === 'alertSettings') {
                    defaultData = { global: 5, overrides: {} };
                } else if (key === 'history' || key === 'hourlyHistory' || key === 'closedTrades') {
                    defaultData = [];
                } else if (key === 'positions') {
                    defaultData = { positions: {} };
                } else if (key === 'balanceState') {
                    defaultData = { balances: {}, totalValue: 0 };
                }
                
                await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
            }
        }
        
        console.log("Successfully initialized local file storage.");
        return true;
    } catch (e) {
        console.error("Failed to initialize local storage", e);
        process.exit(1);
    }
}

async function readJSONFile(filePath, defaultValue = {}) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return defaultValue;
    }
}

async function writeJSONFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Error writing to ${filePath}:`, e);
    }
}

const getDB = () => ({
    readFile: readJSONFile,
    writeFile: writeJSONFile,
    files: DATA_FILES
});

module.exports = { 
    connectDB, 
    getDB
};
