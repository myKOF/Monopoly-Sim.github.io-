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
    btnFast: document.getElementById('btn-fast')
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
worker.onmessage = function (e) {
    const { type, payload } = e.data;

    if (type === 'UPDATE_UI') {
        const previousPosition = state.position;
        const steps = payload.diceRoll;
        const isAuto = payload.isAuto;

        // Sync State (but keep visual position derived for now if animating)
        state.turn = payload.turn;
        state.money = payload.money;
        state.tileVisits = payload.tileVisits;
        state.extraObjects = new Set(payload.extraObjects);
        state.collection = payload.collection;
        // NOTE: We update state.position AFTER animation if manual

        updateLogs(payload.logs);

        if (steps > 0) {
            ui.diceVisual.textContent = steps;
        }

        if (!isAuto && steps > 0) {
            // MANUAL MODE: Animate
            const startPos = previousPosition;
            animateMove(startPos, steps, payload.position, () => {
                state.position = payload.position;
                updateStatsUI(); // Update stats after move
                updateUI();
                renderBoard(); // refresh board active states
            });
        } else {
            // AUTO MODE: Instant Jump
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
        endAutoRoll(payload.finished);
    }
};

function animateMove(startPos, steps, finalPos, onComplete) {
    let currentStep = 0;

    function step() {
        if (currentStep >= steps) {
            if (onComplete) onComplete();
            return;
        }

        const nextPos = (startPos + currentStep + 1) % BOARD_SIZE;
        updatePlayerPosition(nextPos);
        currentStep++;

        setTimeout(() => requestAnimationFrame(step), 100); // 100ms per tile
    }

    step();
}

function updateLogs(newLogs) {
    // Basic log diffing or just clear/redraw
    // Since logs are minimal, clearing is fine for now
    ui.logContainer.innerHTML = '';
    // Wait, clearing removes history beyond 50.
    // Actually the worker maintains the last 50.
    // So we just render what the worker gives us.

    newLogs.forEach(data => {
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
        ui.logContainer.prepend(div);
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

    // 2. Initialize Worker
    worker.postMessage({
        type: 'INIT_GAME',
        payload: {
            properties: properties,
            collectionConfig: collectionConfig
        }
    });

    console.log("Worker Initialized");
    renderBoard(); // Initial Render
}


// --- Event Listeners (Delegate to Worker) ---

ui.btnRoll.addEventListener('click', () => {
    worker.postMessage({ type: 'EXEC_TURN' });
});

ui.btnAuto.addEventListener('click', () => {
    const count = parseInt(ui.autoCount.value);
    ui.btnAuto.classList.add('hidden');
    ui.btnStop.classList.remove('hidden');
    worker.postMessage({ type: 'START_AUTO', payload: { count } });
});

ui.btnStop.addEventListener('click', () => {
    worker.postMessage({ type: 'STOP_AUTO' });
});

ui.btnGenExtra.addEventListener('click', () => {
    const count = parseInt(ui.extraCount.value);
    worker.postMessage({ type: 'GEN_EXTRA', payload: { count } });
});

ui.btnFast.addEventListener('click', () => {
    const count = parseInt(ui.autoCount.value);
    worker.postMessage({ type: 'START_AUTO', payload: { count } }); // Logic handles speed
});

function endAutoRoll(finished) {
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

// Start
initGame();
console.log("Script Loaded Successfully");
