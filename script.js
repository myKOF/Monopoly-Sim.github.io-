// Game Configuration
const BOARD_SIZE = 52;
let INITIAL_CAPITAL = 5000;

// debug: visual error logger (Keep this)
window.onerror = function (msg, url, line, col, error) {
    console.error("Global Error:", msg, error);
    const errDiv = document.createElement('div');
    errDiv.style.position = 'fixed';
    errDiv.style.top = '0';
    errDiv.style.left = '0';
    errDiv.style.width = '100%';
    errDiv.style.background = 'rgba(255, 0, 0, 0.9)';
    errDiv.style.color = 'white';
    errDiv.style.padding = '10px';
    errDiv.style.zIndex = '9999';
    errDiv.style.fontFamily = 'monospace';
    errDiv.style.whiteSpace = 'pre-wrap';
    errDiv.style.display = 'flex';
    errDiv.style.justifyContent = 'space-between';
    errDiv.style.alignItems = 'center';

    const text = document.createElement('div');
    text.innerHTML = `<strong>Runtime Error:</strong><br>${msg}<br>Line: ${line}`;
    errDiv.appendChild(text);

    // Close button logic...
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Dismiss';
    closeBtn.style.marginLeft = '20px';
    closeBtn.onclick = () => errDiv.remove();
    errDiv.appendChild(closeBtn);

    document.body.appendChild(errDiv);
    return false;
};

// --- WORKER INTEGRATION ---
const worker = new Worker('worker.js');

// Local View State (Synced from Worker)
let state = {
    turn: 0,
    position: 0,
    money: INITIAL_CAPITAL,
    logs: [],
    properties: [],
    extraObjects: new Set(),
    collection: { level: 1, points: 0, totalCollected: 0, config: [] },
    tileVisits: [],
    tournament: {
        participants: [], // {id, name, score, target, valueRange:[], cdRange:[], nextUpdate: 0}
        playerScore: 0,
        playerRank: 0
    }
};

const systemConfig = {
    Target_Speed: 0.1, // Default 100ms
    Spin_CD: 0.25,    // Default 250ms
    UI_Px: [10, 10, 10, 16], // Top, Bottom, Left, Right
    Collect_UI_Name: "收藏活動",
    AIRPORT_Value: 50
};

// DOM Elements
const ui = {
    board: document.getElementById('board-grid'),
    money: document.getElementById('display-money'),
    turn: document.getElementById('display-turn'),
    diceVisual: document.getElementById('dice-visual'),
    btnRoll: document.getElementById('btn-roll'),
    btnAuto: document.getElementById('btn-auto'),
    autoCount: document.getElementById('auto-count'),
    btnExport: document.getElementById('btn-export'),
    logContainer: document.getElementById('log-container'),
    statsContent: document.getElementById('stats-content'),
    statsTotalMoves: document.getElementById('stats-total-moves'),
    extraCount: document.getElementById('extra-count'),
    btnGenExtra: document.getElementById('btn-gen-extra'),
    colLevel: document.getElementById('collection-level'),
    colPoints: document.getElementById('collection-points'),
    colTarget: document.getElementById('collection-target'),
    colBar: document.getElementById('collection-bar'),
    btnStop: document.getElementById('btn-stop'),
    autoProgress: document.getElementById('auto-progress'),
    btnStop: document.getElementById('btn-stop'),
    autoProgress: document.getElementById('auto-progress'),
    btnFast: document.getElementById('btn-fast'),
    tourList: document.getElementById('tournament-list')
};

// Fallback Config
const FALLBACK_DATA = [
    { id: 0, icon: '🚩', type: 'GO', name: 'GO', price: 2000, color: 'text-neon-pink font-black', probability: 1 },
    { id: 1, icon: '💰', type: 'SMALL_GOLD', name: '小獎勵', price: 500, color: 'text-yellow-300', probability: 1 },
    { id: 2, icon: '🏠', type: 'PROPERTY', name: '備援地產', price: 100, color: 'text-white', probability: 1 },
    { id: 3, icon: '🎲', type: 'PROPERTY', name: '備援地產', price: 100, color: 'text-white', probability: 1 },
    { id: 4, icon: '🏠', type: 'PROPERTY', name: '備援地產', price: 100, color: 'text-white', probability: 1 },
    { id: 5, icon: '🏠', type: 'PROPERTY', name: '備援地產', price: 100, color: 'text-white', probability: 1 },
    { id: 6, icon: '💎', type: 'BIG_GOLD', name: '大寶藏', price: 2000, color: 'text-yellow-500 font-bold', probability: 1 },
    { id: 7, icon: '✈️', type: 'AIRPORT', name: '機場', price: 1000, color: 'text-yellow-400', probability: 0.5 },
    { id: 8, icon: '🏠', type: 'PROPERTY', name: '備援地產', price: 100, color: 'text-white', probability: 1 },
    { id: 9, icon: '🚧', type: 'PROPERTY', name: '過路費', price: -100, color: 'text-red-400', probability: 1 },
    { id: 10, icon: '🏠', type: 'PROPERTY', name: '備援地產', price: 100, color: 'text-white', probability: 1 },
    { id: 11, icon: '💰', type: 'SMALL_GOLD', name: '小獎勵', price: 500, color: 'text-yellow-300', probability: 1 },
    { id: 12, icon: '🏠', type: 'PROPERTY', name: '備援地產', price: 100, color: 'text-white', probability: 1 },
    { id: 13, icon: '⛓️', type: 'JAIL', name: '監獄', price: 0, color: 'text-gray-500', probability: 1 },
];

const DEFAULT_COLLECTION_CSV = `level,required_points,reward_gold,reward_desc
1,3,1000,初級`;

// Worker Message Listener
// Worker Message Listener
worker.onmessage = function (e) {
    const { type, payload } = e.data;

    if (type === 'UPDATE_UI') {
        const previousPosition = state.position;
        const steps = payload.diceRoll;
        const isAuto = payload.isAuto; // This now means "Is this a turn execution?"

        // Sync Data
        state.turn = payload.turn;
        state.money = payload.money;
        state.tileVisits = payload.tileVisits;
        state.extraObjects = new Set(payload.extraObjects);
        state.collection = payload.collection;
        if (payload.dice !== undefined) state.dice = payload.dice;
        if (payload.multiplier !== undefined) state.multiplier = payload.multiplier;

        updateLogs(payload.logs);

        if (steps > 0) {
            ui.diceVisual.textContent = steps;
        }

        // --- VISUAL LOGIC ---
        // 1. FAST SIM (Batch) or Special Events -> No Steps or payload indicates batch?
        // Actually, our worker sends isAuto=true for both AutoPlay and FastSim.
        // We need to differentiate or just infer.
        // If the UI is in "Auto Play" mode (btnAuto hidden), we should animate.
        // If the UI is in "Fast Sim" mode (btnFast disabled), we might want to skip animation.

        const isFastMode = ui.btnFast.disabled === true && ui.btnAuto.classList.contains('hidden') === false;
        // Wait, button states are tricky. Let's rely on checking if we are "stopping" or "running".

        // const isAutoRunning = !ui.btnAuto.classList.contains('hidden') === false; // [FIX] Removed local var
        // Now using global isAutoRunning

        if (isFastMode) {
            // Instant Update (Fast Sim)
            state.position = payload.position;
            requestAnimationFrame(() => {
                renderBoard();
                updateUI();
                updateStatsUI();
                updatePlayerPosition(state.position);
            });
        } else if ((isAuto && isAutoRunning) || (!isAuto && steps > 0)) {
            // "Watch Mode" (Auto Play) OR Manual Roll -> Animate
            const startPos = previousPosition;
            setIsAnimating(true);

            animateMove(startPos, steps, payload.position, () => {
                state.position = payload.position;
                setIsAnimating(false);

                updateStatsUI();
                updateUI();
                renderBoard();
                updatePlayerPosition(state.position); // [FIX] Re-apply active class AFTER render

                // [PING-PONG] If Auto Play, trigger next turn
                if (isAutoRunning) {
                    setTimeout(() => {
                        worker.postMessage({ type: 'NEXT_TURN' });
                    }, systemConfig.Spin_CD * 1000);
                }

                // Check for Airport (Tournament Scoring)
                const tile = state.properties[payload.position];
                if (tile && tile.type === 'AIRPORT') {
                    // Add score
                    const baseBonus = systemConfig.AIRPORT_Value || 50;
                    const bonus = baseBonus * (state.multiplier || 1); // [FIX] Multiply by multiplier
                    state.tournament.playerScore += bonus;
                    renderTournamentUI();

                    // Visual Feedback (Log) - Use same format as worker logs but local
                    const logDiv = document.createElement('div');
                    logDiv.className = 'flex gap-2 log-entry-enter hover:bg-white/5 p-1 rounded';
                    logDiv.innerHTML = `
                        <span class="text-gray-600 w-6">#${state.turn}</span>
                        <span class="flex-1 text-yellow-400 truncate">抵達機場! 積分 +${bonus} (x${state.multiplier || 1})</span>
                     `;
                    ui.logContainer.prepend(logDiv);
                }
            });
        } else {
            // Fallback / Init / Extra Gen
            state.position = payload.position;
            requestAnimationFrame(() => {
                renderBoard();
                updateUI();
                updateStatsUI();
                updatePlayerPosition(state.position);
            });
        }
    }

    if (type === 'AUTO_STOPPED') {
        setIsAnimating(false);
        endAutoRoll(payload.finished);
    }
};

let isAnimating = false;
let isAutoRunning = false; // [FIX] Global state for Auto Play
function setIsAnimating(val) {
    isAnimating = val;
    ui.btnRoll.disabled = val;
    // ui.btnGenExtra.disabled = val; 
}

function animateMove(startPos, steps, finalPos, onComplete) {
    let currentStep = 0;
    const interval = systemConfig.Target_Speed * 1000;

    function step() {
        if (currentStep >= steps) {
            if (onComplete) onComplete();
            return;
        }

        // Calculate next position visually
        const nextPos = (startPos + currentStep + 1) % BOARD_SIZE;
        updatePlayerPosition(nextPos);
        currentStep++;

        setTimeout(() => requestAnimationFrame(step), interval);
    }

    step();
}

let lastLogId = 0;

function updateLogs(newLogs) {
    // Filter for new logs only
    const logsToRender = newLogs.filter(l => l.id > lastLogId);
    if (logsToRender.length === 0) return;

    // Sort by ID ascending (Oldest -> Newest) so we append to bottom
    logsToRender.sort((a, b) => a.id - b.id);

    logsToRender.forEach(data => {
        lastLogId = Math.max(lastLogId, data.id);

        const div = document.createElement('div');
        div.className = 'flex gap-2 log-entry-enter hover:bg-white/5 p-1 rounded';

        let color = 'text-gray-400';
        if (data.delta_gold > 0) color = 'text-neon-green';
        if (data.delta_gold < 0) color = 'text-neon-pink';
        if (data.event === "EVENT_REWARD") color = 'text-yellow-400 font-bold';

        div.innerHTML = `
            <span class="text-gray-600 w-6">#${data.turn}</span>
            <span class="flex-1 text-gray-300 truncate">${data.detail}</span>
            <span class="${color} font-bold text-xs">${data.delta_gold !== 0 ? (data.delta_gold > 0 ? '+' : '') + data.delta_gold : ''}</span>
        `;
        ui.logContainer.appendChild(div); // Newest at bottom
    });
}


// Initialization with Worker
async function initGame() {
    // 1. Fetch Data First (Main Thread)
    // We still do fetch in Main Thread because it's easier to debug network tab here
    let properties = [];
    let collectionConfig = [];

    try {
        const response = await fetch('./board_config.csv');
        if (response.ok) {
            const text = await response.text();
            properties = parseCSV(text);
        }
    } catch (e) {
        console.error("Fetch Error:", e);
        alert("Load Failed: " + e.message);
        // Fallback
        properties = FALLBACK_DATA.map(d => ({ ...d, upgrade_cost: 0, level: 0, maxLevel: 5 }));
    }

    // Fill empty
    while (properties.length < BOARD_SIZE) {
        properties.push({ ...properties[0], id: properties.length, name: 'Empty' });
    }
    state.properties = properties; // Set local for rendering

    try {
        const response = await fetch('./collect_item.csv');
        if (response.ok) {
            collectionConfig = parseCollectionCSV(await response.text());
        }
    } catch (e) { }

    // 2. Load System Config (Async)
    try {
        const response = await fetch('./system_config.csv?' + new Date().getTime());
        if (response.ok) {
            // [FIX] Use ArrayBuffer + TextDecoder to handle Big5 encoding (common in Excel/Windows)
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('big5');
            const text = decoder.decode(buffer);

            // Parse manual csv
            const lines = text.trim().split('\n').slice(1);
            lines.forEach(line => {
                // Simple split by comma might break if value contains comma (like the array)
                // But our format is {a,b,c,d} inside one column? CSV standard says quotes.
                // Let's assume user writes "{10,10,5,5}" without quotes, so split(',') will split it.
                // We need a smarter regex or just handle the array case.

                // [FIX] Trim line to remove potential \r from Windows CRLF
                line = line.trim();
                if (!line) return;

                // Regex to capture: ID, Type, Value (handling {}), Desc
                const match = line.match(/^(\d+),([^,]+),("?\{[^}]+\}"?|[^,]+),(.+)$/);

                if (match) {
                    const type = match[2].trim();
                    let valStr = match[3].trim();

                    if (valStr.startsWith('{') || valStr.startsWith('"{')) {
                        // Array parsing
                        valStr = valStr.replace(/^"|"$|{|}/g, ''); // Remove quotes and braces
                        const nums = valStr.split(',').map(n => parseFloat(n.trim()));
                        if (nums.length === 4) {
                            if (type === 'UI_Px') systemConfig.UI_Px = nums;
                        }
                    } else {
                        // Number parsing or String parsing
                        // Check if it's the UI Name (String)
                        if (type === 'Collect_UI_Name') {
                            systemConfig.Collect_UI_Name = valStr.trim();
                        } else if (type === 'AIRPORT_Value') {
                            systemConfig.AIRPORT_Value = parseFloat(valStr);
                        } else {
                            const val = parseFloat(valStr);
                            if (type === 'Target_Speed') systemConfig.Target_Speed = val;
                            if (type === 'Spin_CD') systemConfig.Spin_CD = val;
                        }
                    }
                }
            });

            // Apply Config to UI
            const colTitle = document.getElementById('collection-title');
            if (colTitle) colTitle.textContent = systemConfig.Collect_UI_Name;

            console.log("System Config Loaded:", systemConfig);
        }
    } catch (e) {
        console.warn("System Config Load Failed, using defaults", e);
    }

    // 3. Initialize Worker
    worker.postMessage({
        type: 'INIT_GAME',
        payload: {
            properties: properties,
            collectionConfig: collectionConfig
        }
    });

    console.log("Worker Initialized");
    renderBoard(); // Initial Render

    // 4. Load Tournament Data
    try {
        const response = await fetch('./ranking_tournament.csv');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('big5');
            const text = decoder.decode(buffer);

            state.tournament.participants = parseTournamentCSV(text);
            renderTournamentUI();
            updateTournamentBots(); // Start Loop
        }
    } catch (e) { console.warn("Tournament Load Failed", e); }
}


// --- Event Listeners (Delegate to Worker) ---

ui.btnRoll.addEventListener('click', () => {
    if (isAnimating) return; // [FIX] Prevent re-entry
    worker.postMessage({ type: 'EXEC_TURN' });
});

ui.btnAuto.addEventListener('click', () => {
    const count = parseInt(ui.autoCount.value);
    ui.btnAuto.classList.add('hidden');
    ui.btnStop.classList.remove('hidden');
    isAutoRunning = true; // [FIX] Set valid state
    // "Watch Mode" -> START_AUTO_PLAY
    worker.postMessage({ type: 'START_AUTO_PLAY', payload: { count } });
});

ui.btnStop.addEventListener('click', () => {
    // Just send stop, Worker handles IDLE state
    isAutoRunning = false; // [FIX] Stop ping-pong
    worker.postMessage({ type: 'STOP_AUTO' });
});

ui.btnGenExtra.addEventListener('click', () => {
    // [FIX] Stop Auto Immediately if running
    if (isAutoRunning) {
        worker.postMessage({ type: 'STOP_AUTO' });
        isAutoRunning = false; // Stop client-side ping-pong
    }

    // Always generate (even if animating, we queue the state change)
    const count = parseInt(ui.extraCount.value);
    worker.postMessage({ type: 'GEN_EXTRA', payload: { count } });
});

ui.btnFast.addEventListener('click', () => {
    const count = parseInt(ui.autoCount.value);
    // "Lightning Mode" -> START_FAST_SIM
    // UI handling for Fast Sim
    ui.btnFast.disabled = true;
    ui.btnAuto.disabled = true;
    ui.btnRoll.disabled = true;

    worker.postMessage({ type: 'START_FAST_SIM', payload: { count } });
});

function endAutoRoll(finished) {
    isAutoRunning = false; // [FIX] Ensure state is reset
    ui.btnAuto.classList.remove('hidden');
    ui.btnStop.classList.add('hidden');
    if (finished) alert("Auto Roll Finished");
}


// --- Helper Functions (Purely for Rendering / Parsing) ---
// ... Copy existing renderBoard, updateUI, parseCSV, getGridPos ...

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length === 0) return [];
    const headers = lines[0].trim().split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        if (!line.trim() || line.startsWith('#')) return null;
        const values = line.trim().split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h] = values[i] ? values[i].trim() : ''; });
        return {
            id: parseInt(obj.id) || 0,
            icon: obj.icon || '⬛',
            type: obj.type || 'PROPERTY',
            name: obj.name || 'Unknown',
            price: parseInt(obj.price) || parseInt(obj.base_value) || 0,
            upgrade_cost: parseInt(obj.upgrade_cost) || 0,
            probability: parseFloat(obj.probability) || 1.0,
            color: obj.color_class || 'text-white',
            level: 0,
            maxLevel: 5
        };
    }).filter(x => x);
}

function parseCollectionCSV(text) {
    const lines = text.trim().split('\n');
    return lines.slice(1).map(line => {
        const cols = line.trim().split(',');
        if (cols.length < 4) return null;
        const [level, required, gold, desc] = cols;
        return {
            level: parseInt(level),
            required: parseInt(required),
            gold: parseInt(gold),
            desc: desc
        };
    }).filter(x => x);
}

function parseTournamentCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].trim().split(','); // Assuming standard csv

    // id,name,fraction,value,value_CD
    return lines.slice(1).map(line => {
        // Handle potential array values "{a,b}" which contain commas
        // Manual parse:
        // 1,Name,10000,"{10,20}","{5,20}"
        const parts = [];
        let current = '';
        let inQuote = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        parts.push(current.trim());

        // Ensure we have enough parts
        // If name contained comma, length might be different, but quotes should handle it.
        // If line is empty or comment
        if (!line.trim() || parts.length < 5) return null;

        // parts[3] might be "{10,20}" or "\"{10,20}\""
        const parseRange = (str) => {
            if (!str) return [0, 0];
            str = str.replace(/"/g, '').replace('{', '').replace('}', '');
            const nums = str.split(',').map(n => parseFloat(n));
            return nums.length === 2 ? nums : [0, 0];
        };

        return {
            id: parts[0],
            name: parts[1].replace(/"/g, ''),
            target: parseFloat(parts[2]),
            valueRange: parseRange(parts[3]),
            cdRange: parseRange(parts[4]),
            score: 0,
            nextUpdate: Date.now() + (Math.random() * 2000) // Stagger start
        };
    }).filter(x => x);
}

function getGridPos(index) {
    if (index <= 13) return { r: 14, c: 14 - index };
    if (index <= 26) return { r: 14 - (index - 13), c: 1 };
    if (index <= 39) return { r: 1, c: 1 + (index - 26) };
    return { r: 1 + (index - 39), c: 14 };
}

function renderBoard() {
    // ... Existing Render Logic ...
    // Note: Use state.properties (local copy) and state.extraObjects (synced)
    // Since this is long, I will use the simplified version but ensure I don't break functionality
    try {
        const centerPanel = document.getElementById('center-panel');
        ui.board.innerHTML = '';

        if (centerPanel) {
            ui.board.appendChild(centerPanel);
        } else {
            ui.board.innerHTML = '<div id="center-panel" class="absolute inset-[13%] flex items-center justify-center text-white bg-red-900/50 rounded-xl">Center Panel Lost</div>';
        }

        state.properties.forEach((tile, i) => {
            const pos = getGridPos(i);
            const el = document.createElement('div');
            const colorClass = tile.color || 'text-white';
            let borderColor = 'border-white/20';
            let bgColor = 'bg-white/10';

            if (colorClass.includes('neon-pink')) { borderColor = 'border-neon-pink'; bgColor = 'bg-neon-pink/10'; }
            if (colorClass.includes('neon-blue')) { borderColor = 'border-neon-blue'; bgColor = 'bg-neon-blue/10'; }
            if (colorClass.includes('neon-green')) { borderColor = 'border-neon-green'; bgColor = 'bg-neon-green/10'; }
            if (colorClass.includes('yellow')) { borderColor = 'border-yellow-500'; bgColor = 'bg-yellow-500/10'; }

            el.className = `tile border-b-4 ${borderColor} ${bgColor} hover:brightness-125 rounded flex flex-col items-center justify-center relative cursor-pointer group transition-all duration-300`;
            el.style.gridRow = pos.r;
            el.style.gridColumn = pos.c;
            el.id = `tile-${i}`;

            const icon = tile.icon || '❓';
            let content;
            if (tile.type === 'PROPERTY') {
                content = `<div class="font-bold ${tile.color} text-[10px]">${icon} ${tile.name}</div>
                            <div class="text-[9px] text-gray-400 mt-1">$${tile.price}</div>`;
            } else {
                content = `<div class="font-bold ${tile.color} text-xl" title="${tile.name}">${icon}</div>`;
            }

            el.innerHTML = content;

            if (state.extraObjects.has(i)) {
                el.classList.add('ring-2', 'ring-pink-500');
                const badge = document.createElement('div');
                badge.className = 'absolute -top-1 -right-1 bg-pink-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full shadow z-10';
                badge.innerHTML = '🍦';
                el.appendChild(badge);
            }

            ui.board.appendChild(el);
        });

        const marker = document.createElement('div');
        marker.id = 'player-marker';
        marker.className = 'player-marker';
        ui.board.appendChild(marker);

    } catch (err) {
        console.error("Render Failed:", err);
    }
}

function updateUI() {
    ui.money.textContent = state.money.toLocaleString();
    ui.turn.textContent = state.turn;

    // Collection UI
    const currentConfig = state.collection.config.find(c => c.level === state.collection.level);
    if (currentConfig) {
        ui.colLevel.textContent = state.collection.level;
        ui.colPoints.textContent = state.collection.points;
        ui.colTarget.textContent = currentConfig.required;
        const pct = Math.min((state.collection.points / currentConfig.required) * 100, 100);
        ui.colBar.style.width = `${pct}%`;
    } else {
        ui.colLevel.textContent = "MAX";
        ui.colPoints.textContent = "-";
        ui.colTarget.textContent = "-";
        ui.colBar.style.width = "100%";
    }

    // [NEW] Update Dice & Multiplier UI
    const diceInput = document.getElementById('dice-balance');
    const multiplierSelect = document.getElementById('multiplier-select');

    if (diceInput && document.activeElement !== diceInput) {
        diceInput.value = state.dice !== undefined ? state.dice : 1000;
    }

    // Disable Roll Button if insufficient dice
    if ((state.dice || 0) < (state.multiplier || 1)) {
        ui.btnRoll.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        ui.btnRoll.title = "骰子不足 (Insufficient Dice)";
    } else {
        ui.btnRoll.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        ui.btnRoll.title = "";
    }
}

function updateStatsUI() {
    // ... Copy stats logic ...
    if (!state.tileVisits || state.tileVisits.length === 0) {
        ui.statsContent.innerHTML = '<div class="p-4 text-center text-gray-500 text-xs">Waiting...</div>';
        ui.statsTotalMoves.textContent = "0";
        return;
    }
    const totalVisits = state.tileVisits.reduce((a, b) => a + b, 0);
    ui.statsTotalMoves.textContent = totalVisits;

    const groups = {
        'PROPERTY': { name: '一般地產', icon: '🏠', count: 0, color: 'text-neon-blue' },
        'SMALL_GOLD': { name: '小獎勵', icon: '💰', count: 0, color: 'text-yellow-300' },
        'BIG_GOLD': { name: '大寶藏', icon: '💎', count: 0, color: 'text-yellow-500' },
        'AIRPORT': { name: '國際機場', icon: '✈️', count: 0, color: 'text-yellow-400' },
        'GO': { name: '起點 (GO)', icon: '🚩', count: 0, color: 'text-neon-pink' },
        'JAIL': { name: '監獄', icon: '⛓️', count: 0, color: 'text-gray-500' },
        'GOTOJAIL': { name: '入獄', icon: '👮', count: 0, color: 'text-red-500' },
        'PARKING': { name: '停車場', icon: '🅿️', count: 0, color: 'text-white' }
    };

    state.properties.forEach((tile, i) => {
        const type = tile.type;
        const visits = state.tileVisits[i] || 0;
        if (groups[type]) groups[type].count += visits;
        else {
            if (!groups['OTHER']) groups['OTHER'] = { name: '其他', icon: '❓', count: 0, color: 'text-gray-400' };
            groups['OTHER'].count += visits;
        }
    });

    // ... Render Stats ...
    let extraVisits = state.collection.totalCollected || 0;
    const stats = Object.values(groups).filter(g => g.count > 0).map(group => ({
        ...group,
        percent: totalVisits > 0 ? ((group.count / totalVisits) * 100).toFixed(2) : "0.00"
    }));
    if (extraVisits > 0) {
        stats.push({ name: '特殊物件 (🍦)', icon: '🍦', count: extraVisits, color: 'text-pink-400', percent: totalVisits > 0 ? ((extraVisits / totalVisits) * 100).toFixed(2) : "0.00" });
    }
    stats.sort((a, b) => b.count - a.count);

    ui.statsContent.innerHTML = stats.map((item, rank) => `
        <div class="grid grid-cols-12 gap-1 px-3 py-1.5 hover:bg-white/5 border-b border-white/5 items-center text-[11px] group">
            <div class="col-span-1 text-gray-500 font-mono">#${rank + 1}</div>
            <div class="col-span-7 flex items-center gap-2 overflow-hidden">
                <span class="text-base">${item.icon}</span>
                <span class="${item.color.split(' ')[0]} font-medium truncate">${item.name}</span>
            </div>
            <div class="col-span-2 text-right font-mono text-white group-hover:text-neon-green transition-colors">${item.count}</div>
             <div class="col-span-2 text-right font-mono text-gray-400"><span class="text-[10px]">${item.percent}%</span></div>
        </div>
    `).join('');
}

function updatePlayerPosition(index) {
    const pos = getGridPos(index);
    const marker = document.getElementById('player-marker');
    if (marker) {
        marker.style.gridRow = pos.r;
        marker.style.gridColumn = pos.c;
    }
    document.querySelectorAll('.tile-active').forEach(el => el.classList.remove('tile-active'));
    const tile = document.getElementById(`tile-${index}`);
    if (tile) tile.classList.add('tile-active');
}


// Tournament Loop
function updateTournamentBots() {
    const now = Date.now();
    let updated = false;

    state.tournament.participants.forEach(bot => {
        if (bot.score >= bot.target) return; // Finished
        if (now >= bot.nextUpdate) {
            // Add Score
            const val = getRandomRange(bot.valueRange[0], bot.valueRange[1]);
            bot.score += Math.round(val);
            if (bot.score > bot.target) bot.score = bot.target;

            // Set Next Update
            const cd = getRandomRange(bot.cdRange[0], bot.cdRange[1]);
            bot.nextUpdate = now + (cd * 1000);
            updated = true;
        }
    });

    if (updated) {
        renderTournamentUI();
    }

    requestAnimationFrame(updateTournamentBots);
}

function getRandomRange(min, max) {
    return Math.random() * (max - min) + min;
}

function renderTournamentUI() {
    // Merge Player into list for display
    const list = [...state.tournament.participants];
    list.push({
        id: 'PLAYER',
        name: 'You',
        score: state.tournament.playerScore,
        isPlayer: true
    });

    // Sort
    list.sort((a, b) => b.score - a.score);

    // Render
    if (ui.tourList) {
        ui.tourList.innerHTML = list.map((p, i) => {
            const isPlayer = p.isPlayer;
            const rank = i + 1;
            const border = isPlayer ? 'border-neon-pink bg-pink-500/10' : 'border-white/5 bg-white/5';
            const text = isPlayer ? 'text-neon-pink font-bold' : 'text-gray-300';

            // Snap item
            return `
            <div class="chk-rank flex items-center gap-2 p-2 rounded border ${border} text-xs snap-start shrink-0">
                <div class="w-6 font-mono text-gray-500 text-center">#${rank}</div>
                <div class="flex-1 ${text} truncate max-w-[120px]" title="${p.name}">${p.name}</div>
                <div class="font-mono text-white">${p.score}</div>
            </div>
            `;
        }).join('');
    }
}

// --- Dice & Multiplier Logic ---
const diceInput = document.getElementById('dice-balance');
const multiplierSelect = document.getElementById('multiplier-select');

if (diceInput && multiplierSelect) {
    // Init listeners
    diceInput.addEventListener('change', () => {
        const val = parseInt(diceInput.value) || 0;
        state.dice = val; // Optimistic update
        worker.postMessage({ type: 'UPDATE_CONFIG', payload: { dice: val } });
    });

    multiplierSelect.addEventListener('change', () => {
        const val = parseInt(multiplierSelect.value) || 1;
        state.multiplier = val; // Optimistic update
        worker.postMessage({ type: 'UPDATE_CONFIG', payload: { multiplier: val } });
    });
}

// Start
initGame();
console.log("Script Loaded Successfully");

// --- Draggable Logic ---
enableDraggable(document.getElementById('activity-panel'), document.getElementById('activity-drag-handle'));
enableDraggable(document.getElementById('tournament-panel'), document.getElementById('tournament-panel'));

// --- Tournament Reset ---
const btnResetTour = document.getElementById('btn-reset-tournament');
if (btnResetTour) {
    // Prevent drag start
    btnResetTour.addEventListener('mousedown', (e) => e.stopPropagation());

    btnResetTour.addEventListener('click', () => {
        if (!state.tournament) return;

        state.tournament.playerScore = 0;
        state.tournament.participants.forEach(p => {
            p.score = 0;
            p.nextUpdate = Date.now() + (Math.random() * 2000);
        });

        renderTournamentUI();

        // System Log
        const logDiv = document.createElement('div');
        logDiv.className = 'flex gap-2 log-entry-enter hover:bg-white/5 p-1 rounded';
        logDiv.innerHTML = `
           <span class="text-gray-600 w-6">SYS</span>
           <span class="flex-1 text-neon-blue truncate">錦標賽已重置 (Tournament Reset)</span>
        `;
        ui.logContainer.appendChild(logDiv);
    });
}

function enableDraggable(el, handle) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    // Helper: Get robust local coordinates relative to offsetParent
    function getLocalCoordinates() {
        const rect = el.getBoundingClientRect();
        const parent = el.offsetParent || document.body;
        const parentRect = parent.getBoundingClientRect();

        // Calculate position relative to parent's client area (border-box)
        const computedStyle = window.getComputedStyle(parent);
        const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
        const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;

        return {
            left: rect.left - parentRect.left - borderLeft,
            top: rect.top - parentRect.top - borderTop
        };
    }

    function normalizePosition() {
        const local = getLocalCoordinates();
        el.style.right = 'auto'; // Release right constraint
        el.style.left = local.left + 'px';
        el.style.top = local.top + 'px';
    }

    handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;

        // 1. Disable transition immediately to prevent jump
        el.style.transition = 'none';

        // 2. Normalize if needed (switch from Right to Left positioning)
        if (!el.style.left || el.style.right !== 'auto') {
            normalizePosition();
        }

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        // 3. Capture starting style positions (should be set by normalize now)
        initialLeft = parseFloat(el.style.left) || 0;
        initialTop = parseFloat(el.style.top) || 0;

        el.classList.add('z-50');

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLefty = initialLeft + dx;
        let newTop = initialTop + dy;

        el.style.left = `${newLefty}px`;
        el.style.top = `${newTop}px`;
    }

    function onMouseUp() {
        isDragging = false;
        el.style.transition = ''; // Re-enable transition
        el.classList.remove('z-50');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}
