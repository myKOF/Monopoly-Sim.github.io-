// Game Configuration
const BOARD_SIZE = 40;
const START_MONEY = 0; // Starts at 0 as per mechanic "Action to get gold" or imply starting gold? User prompt says "Go +2000", implied start 0? Mechanics section says "Gold: Construction cost, Action gain". Let's start with 5000 to allow some early buys, or 0 if "Go" is the main source.
// Re-reading: "經過獲得 2000 金幣" (Pass Go get 2000). "建設消耗，行動獲得". Let's give a small starter pack or 0. Let's do 0 to test the "Go" mechanic strictly, but usually Monopoly starts with money. Let's start with 2000.
let INITIAL_CAPITAL = 5000;

// Game State
let state = {
    turn: 0,
    position: 0,
    money: INITIAL_CAPITAL,
    logs: [],
    properties: [] // { level: 0, baseRent: 50, upgradeCost: 150 } etc.
};

// DOM Elements
const ui = {
    map: document.getElementById('map-container'),
    money: document.getElementById('display-money'),
    turn: document.getElementById('display-turn'),
    diceVisual: document.getElementById('dice-visual'),
    btnRoll: document.getElementById('btn-roll'),
    btnAuto: document.getElementById('btn-auto'),
    btnExport: document.getElementById('btn-export'),
    logContainer: document.getElementById('log-container')
};

// Audio (Optional Placeholder)
const sounds = {
    roll: null, 
    coin: null
};

// Initialization
function initGame() {
    state.turn = 0;
    state.position = 0;
    state.money = INITIAL_CAPITAL;
    state.logs = [];
    state.properties = Array(40).fill(null).map((_, i) => createTileConfig(i));
    
    renderMap();
    updateUI();
    logEvent("GAME_START", "System Initialized. Welcome to Monopoly Sim.");
}

function createTileConfig(index) {
    // Special Tiles
    if (index === 0) return { type: 'GO', name: 'Start (GO)', color: 'text-neon-pink' };
    if ([5, 15, 25, 35].includes(index)) return { type: 'RAILROAD', name: `Railroad #${index}`, color: 'text-yellow-400' };
    if (index === 10) return { type: 'JAIL', name: 'Jail (Visit)', color: 'text-gray-500' };
    if (index === 20) return { type: 'PARKING', name: 'Free Parking', color: 'text-white' };
    if (index === 30) return { type: 'GOTOJAIL', name: 'Go To Jail', color: 'text-red-500' };
    
    // Properties
    return { 
        type: 'PROPERTY', 
        name: `Property #${index}`, 
        level: 0, 
        maxLevel: 5,
        upgradeCost: 100 * (1 + Math.floor(index / 10)), /* Increasing cost by sector */
        rent: 20 * (1 + Math.floor(index / 10)),
        color: 'text-neon-blue'
    };
}

// Logic: Roll Dice
function rollDice() {
    // 1-12 Random
    return Math.floor(Math.random() * 12) + 1;
}

// Logic: Movement
async function execTurn(isAuto = false) {
    if (!isAuto) {
        ui.diceVisual.classList.add('dice-rolling');
        await new Promise(r => setTimeout(r, 500)); // Visual wait
        ui.diceVisual.classList.remove('dice-rolling');
    }

    const steps = rollDice();
    ui.diceVisual.textContent = steps;
    
    state.turn++;
    const prevPos = state.position;
    state.position = (prevPos + steps) % BOARD_SIZE;

    // Check Pass GO
    let passedGo = state.position < prevPos && prevPos + steps >= BOARD_SIZE; // Simple wrap check
    if (passedGo) { // Or if exact landing 0? "經過獲得" usually means pass or land.
        // If wrapped around
        addMoney(2000, "PASS_GO", "Passed GO, collected salary.");
    }

    renderMap(); // Update visuals immediately
    handleTileEvent(state.position);
    updateUI();

    // Scroll to active tile
    const activeTile = document.getElementById(`tile-${state.position}`);
    if (activeTile && !isAuto) {
        activeTile.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function addMoney(amount, reason, desc) {
    const oldBalance = state.money;
    state.money += amount;
    
    recordLog({
        turn: state.turn,
        position: state.position,
        event: reason,
        delta_gold: amount,
        current_balance: state.money,
        detail: desc
    });
}

function handleTileEvent(pos) {
    const tile = state.properties[pos];

    if (tile.type === 'GO') {
        if (state.turn > 0) { // Don't trigger on init
             // Already handled by PASS_GO logic usually, but if LAND perfectly on GO?
             // "Passed" logic covers landing too usually in implementations. 
             // To be safe, if we landed on GO, we shouldn't double dip if we already credited "Pass Go".
             // Let's assume Move Logic handles the +2000.
             recordLog({ turn: state.turn, position: pos, event: 'LAND_GO', delta_gold: 0, current_balance: state.money, detail: "Landed on GO." });
        }
    } else if (tile.type === 'RAILROAD') {
        // "Demolish/Robbery Simulation" -> Get Large Money
        const windfall = 500 + Math.floor(Math.random() * 1000); // 500-1500
        addMoney(windfall, "HEIST_SUCCESS", `Railroad Event! Smuggled goods for $${windfall}.`);
    } else if (tile.type === 'PROPERTY') {
        // Upgrade Logic
        if (tile.level < tile.maxLevel) {
            if (state.money >= tile.upgradeCost) {
                // Auto Upgrade
                state.money -= tile.upgradeCost;
                tile.level++;
                tile.rent = Math.floor(tile.rent * 1.5); // Increase rent
                recordLog({
                    turn: state.turn,
                    position: pos,
                    event: 'PROPERTY_UPGRADE',
                    delta_gold: -tile.upgradeCost,
                    current_balance: state.money,
                    detail: `Upgraded ${tile.name} to Lv${tile.level}.`
                });
            } else {
                recordLog({ turn: state.turn, position: pos, event: 'INSUFFICIENT_FUNDS', delta_gold: 0, current_balance: state.money, detail: `Cannot afford upgrade for ${tile.name} ($${tile.upgradeCost}).` });
            }
        } else {
             recordLog({ turn: state.turn, position: pos, event: 'MAX_LEVEL', delta_gold: 0, current_balance: state.money, detail: `${tile.name} is at max level.` });
        }
    } else {
        // Generic Landing
        recordLog({ turn: state.turn, position: pos, event: `LAND_${tile.type}`, delta_gold: 0, current_balance: state.money, detail: `Visited ${tile.name}.` });
    }
}

// Data Logging
function recordLog(data) {
    const enrichedData = {
        ...data,
        timestamp: new Date().toISOString()
    };
    state.logs.push(enrichedData);
    
    // UI Update
    const div = document.createElement('div');
    div.className = 'p-3 rounded bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-xs font-mono log-entry-enter flex gap-3';
    
    // Color code based on delta
    let deltaColor = 'text-gray-400';
    if (data.delta_gold > 0) deltaColor = 'text-green-400';
    if (data.delta_gold < 0) deltaColor = 'text-red-400';
    
    div.innerHTML = `
        <span class="text-gray-500 w-8">#${data.turn}</span>
        <span class="flex-1 text-gray-300">${data.detail}</span>
        <span class="${deltaColor} font-bold whitespace-nowrap">${data.delta_gold > 0 ? '+' : ''}${data.delta_gold}</span>
    `;
    
    ui.logContainer.prepend(div);
    
    // Cleanup old UI logs if too many (performance)
    if (ui.logContainer.children.length > 50) {
        ui.logContainer.lastElementChild.remove();
    }
}

// Renders
function renderMap() {
    ui.map.innerHTML = '';
    state.properties.forEach((tile, i) => {
        const isPlayerHere = i === state.position;
        const el = document.createElement('div');
        
        // Dynamic Styles
        let borderClass = 'border-white/5';
        if (tile.type === 'PROPERTY' && tile.level > 0) borderClass = 'border-neon-blue/50';
        if (isPlayerHere) borderClass = 'border-neon-pink';

        el.id = `tile-${i}`;
        el.className = `p-3 rounded-xl border ${borderClass} bg-white/5 flex items-center justify-between group hover:bg-white/10 transition-all cursor-default ${isPlayerHere ? 'tile-active scale-[1.02]' : ''}`;
        
        let subInfo = '';
        if (tile.type === 'PROPERTY') {
            subInfo = `<div class="flex gap-1 mt-1">
                ${[...Array(5)].map((_, idx) => `<div class="w-1.5 h-1.5 rounded-full ${idx < tile.level ? 'bg-neon-blue' : 'bg-gray-700'}"></div>`).join('')}
            </div>`;
        }

        el.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="text-xs font-mono text-gray-500 w-6">${i}</div>
                <div>
                    <div class="text-sm font-medium ${tile.color}">${tile.name}</div>
                    ${subInfo}
                </div>
            </div>
            ${isPlayerHere ? '<div class="w-2 h-2 rounded-full bg-neon-pink animate-ping"></div>' : ''}
        `;
        ui.map.appendChild(el);
    });
}

function updateUI() {
    ui.money.textContent = state.money.toLocaleString();
    ui.turn.textContent = state.turn;
}

// Export
function exportCSV() {
    if (state.logs.length === 0) return alert("No logs to export!");
    
    const headers = ['turn', 'position', 'event', 'delta_gold', 'current_balance', 'timestamp'];
    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n"
        + state.logs.map(e => headers.map(h => e[h]).join(",")).join("\n");
        
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `monopoly_logs_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click(); 
}

// Event Listeners
ui.btnRoll.addEventListener('click', () => execTurn(false));

ui.btnAuto.addEventListener('click', async () => {
    ui.btnAuto.disabled = true;
    ui.btnRoll.disabled = true;
    for (let i = 0; i < 100; i++) {
        await execTurn(true);
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 10)); // Breathe for UI
    }
    ui.btnAuto.disabled = false;
    ui.btnRoll.disabled = false;
});

ui.btnExport.addEventListener('click', exportCSV);

// Start
initGame();
