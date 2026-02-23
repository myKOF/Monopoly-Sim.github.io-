// Game Configuration
const BOARD_SIZE = 52;
let INITIAL_CAPITAL = 5000;
let collectionConfig = [];
let rouletteConfig = {};
let rouletteIntegralConfig = [];
let rouletteInterval = null;

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

// [NEW] Parse Roulette Integral CSV
function parseRouletteIntegralCSV(csvText) {
    const lines = csvText.trim().split('\n');
    return lines.slice(1).map(line => {
        const p = line.split(',');
        if (p.length < 2) return null;
        return {
            level: parseInt(p[0].trim()),
            required: parseInt(p[1].trim()),
            coin: p[2] ? parseInt(p[2].trim()) : 0,
            gem: p[3] ? parseInt(p[3].trim()) : 0,
            dice: p[4] ? parseInt(p[4].trim()) : 0
        };
    }).filter(x => x);
}

// [NEW] Parse Roulette CSV
function parseRouletteCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const config = {}; // { level: [items] }

    lines.slice(1).forEach(line => {
        const parts = line.split(',');
        if (parts.length < 8) return;

        // id,level,count,weight,coin_value,gem_value,dice_value,level_up
        const id = parseInt(parts[0]);
        const level = parseInt(parts[1]);
        const count = parseInt(parts[2]);
        const weight = parseInt(parts[3]) || 0;
        const coin = parts[4] ? parseInt(parts[4]) : 0;
        const gem = parts[5] ? parseInt(parts[5]) : 0;
        const dice = parts[6] ? parseInt(parts[6]) : 0;
        const levelUp = parts[7] && parts[7].trim() === '1';

        if (!config[level]) config[level] = [];

        config[level].push({
            id,
            level,
            count, // 1-12
            weight,
            coin,
            gem,
            dice,
            levelUp
        });
    });

    return config;
}

// --- WORKER INTEGRATION ---
let worker;
try {
    worker = new Worker('scripts/worker.js');
} catch (e) {
    alert("⚠️ 無法載入本地 Worker 腳本 (CORS 安全性限制)。\n\n您目前似乎是直接雙擊開啟 HTML (file://)。請改用 Live Server 或將檔案放置於伺服器環境開啟，以正常執行遊戲！\n\n錯誤資訊：" + e.message);
    throw e; // Stop execution
}

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
    tourList: document.getElementById('tournament-list'),
    btnResetStats: document.getElementById('btn-reset-stats')
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
        if (payload.gems !== undefined) {
            state.gems = payload.gems;
        }

        // [NEW] Roulette State Sync
        if (payload.roulette) {
            const isLevelUp = isSpinning && payload.roulette.lastSpinResult && payload.roulette.lastSpinResult.levelUp;

            if (isLevelUp) {
                // Defer the board reset until the animation finishes
                state.pendingRouletteState = payload.roulette;
                if (state.roulette) state.roulette.tokens = payload.roulette.tokens;
            } else {
                state.roulette = payload.roulette; // Sync State
            }

            updateRouletteUI(); // Update Tokens/Level/Disabled items

            // Check if we need to animate a spin result
            if (payload.roulette.lastSpinResult) {
                animateRoulette(payload.roulette.lastSpinResult);
            }
        }

        updateLogs(payload.logs);

        if (steps > 0) {
            ui.diceVisual.classList.remove('text-xl');
            ui.diceVisual.classList.add('text-5xl');
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
                    const bonus = baseBonus * (state.multiplier || 1);
                    state.tournament.playerScore += bonus;

                    // [NEW] Integral Logic
                    if (state.tournament.integral && state.tournament.integralConfig) {
                        state.tournament.integral.score += bonus;

                        // Check Level Up
                        let currentCfg = state.tournament.integralConfig.find(c => c.level === state.tournament.integral.level);
                        while (currentCfg && state.tournament.integral.score >= currentCfg.required) {
                            // Level Up!
                            state.tournament.integral.score -= currentCfg.required;
                            state.tournament.integral.level++;

                            // Give Reward
                            const reward = currentCfg.reward;
                            worker.postMessage({
                                type: 'ADD_MONEY',
                                payload: {
                                    amount: reward,
                                    reason: "TOURNAMENT_INTEGRAL",
                                    desc: `錦標賽積分升級 Lv.${state.tournament.integral.level - 1} -> Lv.${state.tournament.integral.level} (${currentCfg.desc})`
                                }
                            });

                            // Check next level
                            currentCfg = state.tournament.integralConfig.find(c => c.level === state.tournament.integral.level);
                        }
                    }

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
        // [NEW] Hide Progress
        const overlay = document.getElementById('fast-sim-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    // [NEW] Progress Handler
    if (type === 'PROGRESS') {
        const overlay = document.getElementById('fast-sim-overlay');
        const percent = document.getElementById('fast-sim-percent');
        if (overlay && percent) {
            overlay.classList.remove('hidden');
            percent.textContent = payload.percent;
        }
    }

    if (type === 'EXPORT_DATA') {
        const logs = payload.logs;
        if (!logs || logs.length === 0) {
            alert("沒有紀錄可匯出");
            return;
        }

        const csvContent = "data:text/csv;charset=utf-8,"
            + "Turn,Event,Detail,Delta Gold,Balance\n"
            + logs.map(e => `${e.turn},${e.event},"${e.detail}",${e.delta_gold},${e.current_balance}`).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "monopoly_logs.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
    // We use the global variables declared at the top
    let properties = [];
    collectionConfig = []; // [FIX] Use global
    rouletteConfig = {}; // [FIX] Use global
    rouletteIntegralConfig = []; // [NEW] Use global
    // rouletteInterval is global and managed elsewhere, no need to init here except maybe clear?
    if (rouletteInterval) clearInterval(rouletteInterval);
    rouletteInterval = null;
    // systemConfig is already declared as a const globally, no need to redeclare here.

    try {
        const response = await fetch('./config/board_config.csv');
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
        const response = await fetch('./config/collect_item.csv');
        if (response.ok) {
            collectionConfig = parseCollectionCSV(await response.text());
        }
    } catch (e) { }

    // 2. Load System Config (Async)
    try {
        const response = await fetch('./config/system_config.csv?' + new Date().getTime());
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
                    const type = match[2].trim(); // Column 2: Type
                    let value = match[3].trim();  // Column 3: Value

                    if (value.startsWith('{') || value.startsWith('"{')) {
                        // Array parsing
                        value = value.replace(/^"|"$|{|}/g, ''); // Remove quotes and braces
                        const nums = value.split(',').map(n => parseFloat(n.trim()));
                        if (nums.length === 4 && type === 'UI_Px') {
                            systemConfig.UI_Px = nums;
                        } else if (type === 'Roulette_Time') {
                            systemConfig.Roulette_Time = nums;
                        }
                    } else {
                        // Check if it's the UI Name (String)
                        if (type === 'Collect_UI_Name') {
                            systemConfig.Collect_UI_Name = value.trim();
                        } else if (type === 'AIRPORT_Value') {
                            systemConfig.AIRPORT_Value = parseFloat(value);
                        } else {
                            const val = parseFloat(value);
                            if (type === 'Target_Speed') systemConfig.Target_Speed = val;
                            if (type === 'Spin_CD') systemConfig.Spin_CD = val;
                            if (type === 'Collect_Item_Weight') systemConfig.Collect_Item_Weight = val;
                            if (type === 'Collect_Item_Value') systemConfig.Collect_Item_Value = val;
                            if (type === 'Roulette_Token_Value') systemConfig.Roulette_Token_Value = val;
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

    // 3. Load Roulette Config (New)
    try {
        const response = await fetch('./config/lucky_loulette.csv');
        if (response.ok) {
            const text = await response.text();
            rouletteConfig = parseRouletteCSV(text);
            console.log("Roulette Config Loaded:", rouletteConfig);
        }

        const reqIntegral = await fetch('./config/lucky_loulette_integral.csv');
        if (reqIntegral.ok) {
            const textIntegral = await reqIntegral.text();
            rouletteIntegralConfig = parseRouletteIntegralCSV(textIntegral);
            console.log("Roulette Integral Config Loaded:", rouletteIntegralConfig);
        }
    } catch (e) {
        console.warn("Roulette Config Load Failed", e);
    }

    // 4. Initialize Worker
    worker.postMessage({
        type: 'INIT_GAME',
        payload: {
            properties: properties,
            collectionConfig: collectionConfig,
            systemConfig: systemConfig,
            rouletteConfig: rouletteConfig, // [NEW] Pass roulette config
            rouletteIntegralConfig: rouletteIntegralConfig // [NEW] Pass roulette integral config
        }
    });

    console.log("Worker Initialized");
    renderBoard(); // Initial Render

    // [NEW] Auto Generate Icons
    worker.postMessage({ type: 'GEN_EXTRA', payload: { count: 10 } });

    // 4. Load Tournament Data
    try {
        const response = await fetch('./config/ranking_tournament.csv');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('big5');
            const text = decoder.decode(buffer);

            state.tournament.participants = parseTournamentCSV(text);

            // [NEW] Load Integral Config
            try {
                const resIntegral = await fetch('./config/ranking_tournament_integral.csv');
                if (resIntegral.ok) {
                    const buf = await resIntegral.arrayBuffer();
                    const txt = decoder.decode(buf);
                    state.tournament.integralConfig = [];
                    const lines = txt.split(/\r?\n/).slice(1);
                    lines.forEach(l => {
                        const p = l.split(',');
                        if (p.length >= 4) {
                            state.tournament.integralConfig.push({
                                level: parseInt(p[0].trim()),
                                required: parseInt(p[1].trim()),
                                reward: parseInt(p[2].trim()),
                                desc: p[3].trim()
                            });
                        }
                    });

                    // Init Integral State
                    state.tournament.integral = {
                        score: 0,
                        level: 1
                    };
                }
            } catch (e) {
                console.error("Failed to load Integral CSV", e);
            }

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

if (ui.btnResetStats) {
    ui.btnResetStats.addEventListener('click', () => {
        if (confirm("確定要重置所有統計數據嗎？ (Reset Stats?)")) {
            worker.postMessage({ type: 'RESET_STATS' });
            state.tileVisits = []; // Optimistic clear
            updateStatsUI();
        }
    });
}

function endAutoRoll(finished) {
    isAutoRunning = false; // [FIX] Ensure state is reset
    ui.btnAuto.classList.remove('hidden');
    ui.btnStop.classList.add('hidden');

    // [FIX] Re-enable buttons (in case coming from Fast Sim)
    ui.btnFast.disabled = false;
    ui.btnAuto.disabled = false;
    ui.btnRoll.disabled = false;

    if (finished) alert("Auto Roll Finished");
}


// [NEW] Roulette UI Logic
const uiRouletteModal = document.getElementById('roulette-modal');
const uiRouletteLevel = document.getElementById('roulette-level');
const uiRouletteTokens = document.getElementById('roulette-tokens');
const uiRouletteWheel = document.getElementById('roulette-wheel');
const btnRouletteSpin = document.getElementById('btn-roulette-spin');
const btnRouletteAuto = document.getElementById('btn-roulette-auto');

if (uiRouletteTokens) {
    uiRouletteTokens.addEventListener('input', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 0) val = 0;
        worker.postMessage({ type: 'UPDATE_CONFIG', payload: { rouletteTokens: val } });
    });

    uiRouletteTokens.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 0) val = 0;
        e.target.value = val;
        worker.postMessage({ type: 'UPDATE_CONFIG', payload: { rouletteTokens: val } });
    });
}

document.getElementById('btn-roulette-open').addEventListener('click', openRoulette);
document.getElementById('btn-roulette-close').addEventListener('click', closeRoulette);
btnRouletteSpin.addEventListener('click', () => spinRoulette(false));
btnRouletteAuto.addEventListener('click', toggleAutoRoulette);

function openRoulette() {
    uiRouletteModal.classList.remove('hidden');
    // Force reflow
    void uiRouletteModal.offsetWidth;
    uiRouletteModal.classList.remove('opacity-0');
    renderRoulette();
    updateRouletteUI();
}

function closeRoulette() {
    uiRouletteModal.classList.add('opacity-0');
    setTimeout(() => {
        uiRouletteModal.classList.add('hidden');
    }, 300);
    // Stop Auto if closed?
    if (rouletteInterval) toggleAutoRoulette();
}

function renderRoulette() {
    uiRouletteWheel.innerHTML = '';
    const level = state.roulette ? state.roulette.level : 1;

    // Config: level -> items
    // Handle Max Level logic: if level > max config key, use max key
    const maxLevel = Math.max(...Object.keys(rouletteConfig).map(Number));
    const effectiveLevel = Math.min(level, maxLevel);

    const items = rouletteConfig[effectiveLevel] || [];

    // We expect 12 items. If fewer, we map by ID or just index?
    // CSV count is 1-12.
    // Angle: -90 deg is top.

    items.forEach((item) => {
        // item.count is 1-12.
        // Index 0 (Top) -> Item 1?
        // Let's verify CSV: ID 1, Count 1. ID 7, Count 7.
        // Item 1 at Top (-90 deg). Item 7 at Bottom (90 deg).
        // 12 Items: 360 / 12 = 30 deg.
        // Position index = item.count - 1;
        const idx = item.count - 1;
        const angle = idx * 30 - 90;
        const radius = 130; // Radius from center

        const el = document.createElement('div');
        // Removed transition-all duration-300 to ensure instant border snapping
        el.className = `absolute w-12 h-12 -ml-6 -mt-6 rounded-lg border-2 flex flex-col items-center justify-center text-[10px] shadow-lg transform`;
        el.style.left = '50%';
        el.style.top = '50%';
        el.style.transform = `rotate(${angle}deg) translate(${radius}px) rotate(${-angle}deg)`;
        el.id = `roulette-item-${item.count}`;

        // Styling based on Type
        // Grand Prize (Level Up): Top (1) and Bottom (7) or explicitly marked?
        // CSV: level_up column.
        // Icon
        let icon = '❓';
        if (item.coin) icon = '💰';
        if (item.gem) icon = '💎';
        if (item.dice) icon = '🎲';

        // Value
        let val = item.coin || item.gem || item.dice || '';

        if (item.levelUp) {
            // Keep yellow background but slightly lighter/transparent, with standard icon/value layout
            el.classList.add('bg-yellow-500/40', 'border-yellow-300', 'text-white', 'font-bold', 'z-10');
            el.innerHTML = `<span class="text-sm">${icon}</span><span>${val}</span>`;
        } else {
            el.classList.add('bg-vibe-card', 'border-white/10', 'text-gray-300');
            el.innerHTML = `<span class="text-sm">${icon}</span><span>${val}</span>`;
        }

        uiRouletteWheel.appendChild(el);
    });
}

function updateRouletteUI() {
    if (!state.roulette) return;

    uiRouletteLevel.textContent = `Lv.${state.roulette.level}`;

    // Only update the input value if we aren't currently typing in it, OR if it's spinning (force update)
    if (document.activeElement !== uiRouletteTokens || isSpinning) {
        uiRouletteTokens.value = state.roulette.tokens;
    }

    // Integral UI
    renderRouletteIntegralUI();

    // Handle drawn items and last landed item
    const drawn = state.roulette.drawnCounts || [];
    // If spinning, the 'lastDrawn' item just arrived from worker, but animation hasn't finished.
    // So we treat the actual 'settled' last item as the one before it, or current if not spinning.
    const settledDrawnCount = isSpinning ? Math.max(0, drawn.length - 1) : drawn.length;
    const settledDrawn = drawn.slice(0, settledDrawnCount);
    const lastSettledItem = settledDrawn.length > 0 ? settledDrawn[settledDrawn.length - 1] : null;

    // Update uiLastLandedCount for permanent highlight
    if (!isSpinning && drawn.length > 0) {
        uiLastLandedCount = drawn[drawn.length - 1];
    } else if (drawn.length === 0) {
        uiLastLandedCount = null; // Reset if no items drawn
    }

    const items = document.querySelectorAll('[id^="roulette-item-"]');
    items.forEach(el => {
        const count = parseInt(el.id.replace('roulette-item-', ''));

        // Reset all specific visual states first
        el.classList.remove('z-10', 'scale-110', 'bg-white/10');
        el.style.borderColor = ''; // Reverts to native border-white/10 or border-yellow-300
        el.style.boxShadow = ''; // Clears inline shadow

        // Remove existing overlay and checkmark if any
        const existingOverlay = el.querySelector('.roulette-overlay');
        if (existingOverlay) existingOverlay.remove();
        const existingCheck = el.querySelector('.roulette-check');
        if (existingCheck) existingCheck.remove();

        // 1. Permanent purple highlight for the last landed item (managed by UI state)
        if (count === uiLastLandedCount) {
            el.style.borderColor = '#a855f7'; // Tailwind purple-500
            el.classList.add('z-10');
        }

        // 2. Gray out and Checkmark for all completely settled drawn items
        if (settledDrawn.includes(count)) {
            // Dark Overlay to simulate grayscale without affecting checkmark color
            const overlay = document.createElement('div');
            overlay.className = 'roulette-overlay absolute inset-0 bg-black/60 rounded-lg z-10';
            el.appendChild(overlay);

            // Add green checkmark
            const check = document.createElement('div');
            check.className = 'roulette-check absolute -top-2 -right-2 bg-neon-green text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(16,185,129,0.8)] z-20';
            check.innerHTML = '✓';
            el.appendChild(check);
        }
    });

    // Disable Spin if no tokens
    if (state.roulette.tokens < 1) {
        btnRouletteSpin.disabled = true;
        if (rouletteInterval) toggleAutoRoulette(); // Stop auto
    } else {
        btnRouletteSpin.disabled = false;
    }

    // [NEW] Update Stats Panel
    updateRouletteStatsUI();
}

function updateRouletteStatsUI() {
    if (!state.roulette || !state.roulette.stats) return;
    const stats = state.roulette.stats;

    // 1. Cumulative Rewards
    const elCoin = document.getElementById('stat-r-coin');
    const elGem = document.getElementById('stat-r-gem');
    const elDice = document.getElementById('stat-r-dice');
    if (elCoin) elCoin.textContent = stats.totalCoin.toLocaleString();
    if (elGem) elGem.textContent = stats.totalGem.toLocaleString();
    if (elDice) elDice.textContent = stats.totalDice.toLocaleString();

    // 2. Landing Probabilities
    const elLandings = document.getElementById('stat-r-landings');
    const elSpins = document.getElementById('stat-r-spins');
    if (elLandings && elSpins) {
        let totalSpins = 0;
        Object.values(stats.landings).forEach(c => totalSpins += c);
        elSpins.textContent = `Spins: ${Math.max(0, totalSpins)}`;

        let html = '';
        for (let i = 1; i <= 12; i++) {
            const count = stats.landings[i] || 0;
            const pct = totalSpins > 0 ? ((count / totalSpins) * 100).toFixed(1) : "0.0";
            const color = count > 0 ? (count === Math.max(...Object.values(stats.landings)) ? 'text-yellow-400' : 'text-gray-300') : 'text-gray-600';

            html += `
                <div class="flex justify-between items-center ${color} py-0.5 border-b border-white/5 last:border-0 hover:bg-white/5">
                    <span>Slot #${String(i).padStart(2, '0')}</span>
                    <span class="flex gap-2 w-16 justify-end">
                        <span class="font-bold">${count}</span>
                        <span class="text-gray-500 w-8 text-right text-[10px] my-auto">${pct}%</span>
                    </span>
                </div>
            `;
        }
        elLandings.innerHTML = html;
    }

    // 3. Tokens Per Level
    const elTokens = document.getElementById('stat-r-tokens');
    if (elTokens) {
        let html = '';
        const levels = Object.keys(stats.tokensPerLevel).map(Number).sort((a, b) => a - b);
        for (const lvl of levels) {
            html += `
                <div class="flex justify-between items-center text-gray-300 py-0.5 border-b border-white/5 last:border-0 hover:bg-white/5">
                    <span>Lv.${lvl}</span>
                    <span class="text-yellow-500 font-bold">${stats.tokensPerLevel[lvl]} <span class="text-[9px] text-gray-500">tokens</span></span>
                </div>
            `;
        }
        if (html === '') html = '<div class="text-center text-gray-500 py-2 italic text-[10px]">No data yet</div>';
        elTokens.innerHTML = html;
    }
}

function renderRouletteIntegralUI() {
    if (!state.roulette || !rouletteIntegralConfig || rouletteIntegralConfig.length === 0) return;

    // Use Roulette's own integral config
    const uiLevel = document.getElementById('roulette-integral-level');
    const uiBar = document.getElementById('roulette-integral-bar');
    const uiScore = document.getElementById('roulette-integral-score');
    const uiTarget = document.getElementById('roulette-integral-target');
    const uiDesc = document.getElementById('roulette-integral-desc');

    if (!uiLevel || !uiBar) return;

    // Default integral state if missing
    if (!state.roulette.integral) {
        state.roulette.integral = { score: 0, level: 1 };
    }

    const level = state.roulette.integral.level;
    const score = state.roulette.integral.score;
    const config = rouletteIntegralConfig.find(c => c.level === level);

    if (config) {
        let maxReq = config.required;
        const progress = Math.min(100, (score / maxReq) * 100);

        uiLevel.textContent = level;
        uiBar.style.width = `${progress}%`;
        uiScore.textContent = score;
        uiTarget.textContent = maxReq;

        let rewardText = [];
        if (config.coin > 0) rewardText.push(`💰${config.coin}`);
        if (config.gem > 0) rewardText.push(`💎${config.gem}`);
        if (config.dice > 0) rewardText.push(`🎲${config.dice}`);

        if (uiDesc) uiDesc.textContent = rewardText.length > 0 ? "下級金：" + rewardText.join(" ") : "無";

    } else {
        // Max Level reached
        uiLevel.textContent = level;
        uiBar.style.width = '100%';
        uiScore.textContent = score;
        uiTarget.textContent = "Max";
        if (uiDesc) uiDesc.textContent = "已達最高等級";
    }
}

let isSpinning = false;

function spinRoulette(isAuto = false) {
    if (isSpinning && !isAuto) return; // Wait for animation
    if (state.roulette.tokens < 1) return;

    isSpinning = true; // Lock state immediately to prevent UI spoilers when worker responds
    worker.postMessage({ type: 'SPIN_ROULETTE' });
}

function toggleAutoRoulette() {
    if (rouletteInterval) {
        clearInterval(rouletteInterval);
        rouletteInterval = null;
        btnRouletteAuto.classList.remove('bg-yellow-500/20', 'border-yellow-500');
        btnRouletteAuto.classList.add('border-yellow-500/30');
    } else {
        if (state.roulette.tokens < 1) return;
        btnRouletteAuto.classList.add('bg-yellow-500/20', 'border-yellow-500');
        btnRouletteAuto.classList.remove('border-yellow-500/30');

        spinRoulette(true); // Trigger first
        // Interval: Animation duration + delay?
        // Animation takes ~1-2s. Let's set interval to check state?
        // Actually, better to chain it: animate -> finish -> if auto -> spin again.
        // So let's NOT use setInterval for logic, just setting a flag `isAutoRoulette`.
        // But user asked for "AUTO Button".

        // Revised Auto Logic:
        // Set flag -> Spin.
        // Animation End -> Check Flag -> Spin again.
        rouletteInterval = true; // Use as flag
    }
}

function animateRoulette(targetItem) {
    btnRouletteSpin.disabled = true;

    const targetCount = targetItem.count;
    // Determine starting position (last landed item)
    const drawn = state.roulette.drawnCounts || [];
    // If we just pushed the targetCount, the PREVIOUS one is drawn[drawn.length-2]
    let startCount = 1;
    if (drawn.length > 1) {
        startCount = drawn[drawn.length - 2];
    } else if (drawn.length === 1 && targetCount !== drawn[0]) {
        // If it's the first spin but the target isn't the only one (e.g., Level Up reset it?), wait, if length is 1, then the one we just drew is the ONLY one. So we start at 1.
        // Actually, let's keep it simple. If it's a new board, start at 1 or random? User said "start from last stopped".
        startCount = 1;
    }

    // Fallback if startCount is somehow invalid
    if (!startCount || startCount < 1 || startCount > 12) startCount = 1;

    // Read Speed Multiplier
    const speedSelect = document.getElementById('roulette-speed');
    const speedMult = speedSelect ? parseFloat(speedSelect.value) || 1 : 1;

    let current = startCount;
    // Apply multiplier to base speeds
    let baseSpeed = (state.systemConfig && state.systemConfig.Roulette_Speed) ? (state.systemConfig.Roulette_Speed * 1000) : 50;
    baseSpeed = Math.floor(baseSpeed / speedMult);

    // Choose random time from Roulette_Time array (in seconds)
    let targetTimeMs = 2500; // Default 2.5s
    if (state.systemConfig && state.systemConfig.Roulette_Time && state.systemConfig.Roulette_Time.length > 0) {
        const times = state.systemConfig.Roulette_Time;
        const randomTimeSec = times[Math.floor(Math.random() * times.length)];
        targetTimeMs = randomTimeSec * 1000;
    }
    // Apply multiplier to target time
    targetTimeMs = Math.floor(targetTimeMs / speedMult);

    // Rough calculation of how many steps we can fit in targetTimeMs.
    // We start at baseSpeed and decelerate at the end.
    // For simplicity, let's estimate average speed = baseSpeed + 20ms
    const avgSpeed = baseSpeed + 20;
    let estimatedSteps = Math.floor(targetTimeMs / avgSpeed);

    // Ensure it lands on the target
    // current + steps = targetCount (mod 12)
    // distance = (targetCount - current + 12) % 12
    let distance = (targetCount - current + 12) % 12;
    if (distance === 0) distance = 12; // At least one full loop if same (won't happen normally since we remove drawn)

    // Calculate loops needed to get close to estimatedSteps
    // steps = loops * 12 + distance
    let loops = Math.max(1, Math.floor((estimatedSteps - distance) / 12));
    const totalSteps = loops * 12 + distance;

    let speed = baseSpeed;
    let step = 0;

    // Just a visual highlight
    const highlight = (count) => {
        const els = document.querySelectorAll('[id^="roulette-item-"]');
        els.forEach(el => {
            const elCount = parseInt(el.id.replace('roulette-item-', ''));
            // Remove scanning states
            el.classList.remove('scale-110', 'bg-white/10');
            el.style.borderColor = ''; // Restore native border
            el.style.boxShadow = '';

            // Apply scanning states to the current scan position ONLY
            if (elCount === count) {
                el.style.borderColor = '#a855f7'; // Purple tracking
                el.style.boxShadow = '0 0 10px #a855f7'; // Extra glow
                el.classList.add('scale-110', 'bg-white/10', 'z-20');
            } else {
                el.classList.remove('z-10', 'z-20');
            }
        });
    };

    const runStep = () => {
        highlight(current);

        if (current === targetCount && step >= totalSteps) {
            // Done
            isSpinning = false;

            uiLastLandedCount = targetCount;
            updateRouletteUI(); // Reveal/Audit state

            // Show Result Popup or Effect?
            // (Removed animate-bounce to prevent transform conflicts that cause the icon to jump to the center)
            const el = document.getElementById(`roulette-item-${targetCount}`);
            if (el) {
                el.style.borderColor = '#a855f7'; // Ensure purple
                el.style.boxShadow = '';
            }

            // If Level Up, we defer the board reset so the player can see what they landed on
            if (targetItem.levelUp) {
                const waitTime = Math.max(100, Math.floor(1500 / speedMult));
                setTimeout(() => {
                    if (state.pendingRouletteState) {
                        state.roulette = state.pendingRouletteState;
                        state.pendingRouletteState = null;

                        renderRoulette(); // Re-render for new level (clears drawn state visual)
                        updateRouletteUI();

                        // Proceed to auto chain
                        if (rouletteInterval && state.roulette.tokens > 0) {
                            setTimeout(() => spinRoulette(true), Math.max(100, Math.floor(1000 / speedMult)));
                        } else if (rouletteInterval && state.roulette.tokens < 1) {
                            toggleAutoRoulette(); // Stop
                        }
                    }
                }, waitTime); // Scale delay down before wiping the board to next level
            } else {
                // Auto Chain
                if (rouletteInterval && state.roulette.tokens > 0) {
                    // Limit the chain wait time drastically on higher speeds so it spins continuously
                    const baseWait = Math.max(10, Math.floor(targetTimeMs * 0.2));
                    const chainWait = Math.max(10, Math.floor(baseWait / speedMult));
                    setTimeout(() => spinRoulette(true), chainWait); // Delay before next spin based on spin time
                } else if (rouletteInterval && state.roulette.tokens < 1) {
                    toggleAutoRoulette(); // Stop
                }
            }

            return;
        }

        current++;
        if (current > 12) current = 1;
        step++;

        // Decelerate (last 5 steps) - Scaled by speed multiplier
        if (step > totalSteps - 5) {
            speed += Math.max(1, Math.floor(30 / speedMult));
        }

        setTimeout(runStep, speed);
    };

    runStep();
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
            // [NEW] Use coin_value, gem_value, dice_value
            coin: parseInt(obj.coin_value) || parseInt(obj.base_value) || 0,
            gem: parseInt(obj.gem_value) || 0,
            diceReward: parseInt(obj.dice_value) || 0,

            upgrade_cost: parseInt(obj.upgrade_cost) || 0,
            probability: parseFloat(obj.probability) || 1.0,
            weight: parseInt(obj.weight) || 100,
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

    // [NEW] Update Gems
    const gemsEl = document.getElementById('display-gems');
    if (gemsEl) gemsEl.textContent = state.gems !== undefined ? state.gems : 0;
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

    // [NEW] Render Integral UI
    renderIntegralUI();
}

function renderIntegralUI() {
    if (!state.tournament.integral || !state.tournament.integralConfig) return;

    const uiLevel = document.getElementById('integral-level');
    const uiBar = document.getElementById('integral-bar');
    const uiScore = document.getElementById('integral-score');
    const uiTarget = document.getElementById('integral-target');
    const uiDesc = document.getElementById('integral-reward-desc');

    if (!uiLevel || !uiBar) return;

    const level = state.tournament.integral.level;
    const score = state.tournament.integral.score;
    const config = state.tournament.integralConfig.find(c => c.level === level);

    uiLevel.textContent = level;

    if (config) {
        const required = config.required;
        const pct = Math.min(100, (score / required) * 100);
        uiBar.style.width = `${pct}%`;
        uiScore.textContent = score;
        uiTarget.textContent = required;
        uiDesc.textContent = `Next: ${config.desc}`; // Simplified
    } else {
        // Max Level?
        uiBar.style.width = '100%';
        uiScore.textContent = score;
        uiTarget.textContent = 'MAX';
        uiDesc.textContent = 'Max Level Reached';
    }
}

// --- Dice & Multiplier Logic ---
const diceInput = document.getElementById('dice-balance');
const multiplierSelect = document.getElementById('multiplier-select');
// --- Export Logic ---
const btnExport = document.getElementById('btn-export');
const btnClearLogs = document.getElementById('btn-clear-logs');

if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
        if (confirm('確定要清除所有紀錄嗎？')) {
            ui.logContainer.innerHTML = '';
            lastLogId = 0; // Reset local tracker
            worker.postMessage({ type: 'CLEAR_LOGS' });
        }
    });
}

if (btnExport) {
    btnExport.addEventListener('click', () => {
        // Collect all logs: we need to ask worker or just allow UI export?
        // Let's ask worker for full logs to export
        worker.postMessage({ type: 'EXPORT_LOGS' });
    });
}
// Export Listener is inside onmessage payload usually? 
// Wait, we don't have export logic in worker yet. 
// Existing btn-export was removed in previous steps, let's check where it went or if we need to re-add.
// The user asked to Move export button, so we should keep it working.
// Code at 903 only shows Dice logic. 



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
enableDraggable(document.getElementById('roulette-side-panel'), document.getElementById('roulette-side-panel'));

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

    function normalizePosition() {
        if (getComputedStyle(el).position !== 'fixed') {
            const rect = el.getBoundingClientRect();
            el.style.position = 'fixed';
            el.style.left = rect.left + 'px';
            el.style.top = rect.top + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.margin = '0';
        }
    }

    handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;

        // 1. Disable transition immediately to prevent jump
        el.style.transition = 'none';

        // 2. Normalize to fixed positioning
        normalizePosition();

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
