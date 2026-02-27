// Game Configuration
const BOARD_SIZE = 52;
let INITIAL_CAPITAL = 5000;
let collectionConfig = [];
let rouletteConfig = {};
let rouletteIntegralConfig = [];
let rouletteInterval = null;
let partnerGameConfig = []; // [NEW]
let partnerAutoInjectState = { 1: false, 2: false, 3: false, 4: false }; // [NEW]
let partnerAutoInjectInterval = null; // [NEW]

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
            diceReward: parseInt(p[4].trim()) || 0,
            skin: p[5] || "" // [NEW] Added for volcano
        };
    }).filter(x => x);
}

function parseVolcanoCSV(text) {
    const lines = text.trim().split('\n');
    return lines.slice(1).map(line => {
        const cols = line.trim().split(',');
        if (cols.length < 7) return null;
        // level,hp,reward_gold,reward_gem,reward_dice,reward_desc,skin
        return {
            level: parseInt(cols[0]),
            hp: parseInt(cols[1]),
            reward_gold: parseInt(cols[2]) || 0,
            reward_gem: parseInt(cols[3]) || 0,
            reward_dice: parseInt(cols[4]) || 0,
            reward_desc: cols[5] || "",
            skin: cols[6] || ""
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

// [NEW] Parse Partner Game CSV
function parsePartnerGameCSV(csvText) {
    const lines = csvText.trim().split('\n');
    return lines.slice(1).map(line => {
        const p = line.split(',');
        if (p.length < 8) return null;
        return {
            id: parseInt(p[0].trim()),
            partner: parseInt(p[1].trim()),
            level: parseInt(p[2].trim()),
            required: parseInt(p[3].trim()),
            coin: parseInt(p[4].trim()) || 0,
            gem: parseInt(p[5].trim()) || 0,
            dice: parseInt(p[6].trim()) || 0,
            desc: p[7].trim()
        };
    }).filter(x => x);
}

// --- WORKER INTEGRATION ---
let worker;

async function setupWorker() {
    try {
        console.log("Attempting to load Worker via Blob...");
        const response = await fetch('scripts/worker.js');
        if (!response.ok) throw new Error("Worker fetch failed");
        const code = await response.text();
        const blob = new Blob([code], { type: 'application/javascript' });
        worker = new Worker(URL.createObjectURL(blob));
        console.log("Worker loaded via Blob successfully.");
    } catch (e) {
        console.warn("Blob Worker fallback, trying direct load:", e);
        try {
            worker = new Worker('scripts/worker.js');
        } catch (e2) {
            console.error("Critical: Worker failed to load.", e2);
            alert("⚠️ Web Worker 載入失敗。\n請使用 Live Server 或伺服器環境開啟，或檢查腳本權限。");
            return false;
        }
    }

    if (worker) {
        worker.onmessage = workerMessageHandler;
        return true;
    }
    return false;
}

// --- BACKGROUND TIMER WORKER ---
// Browsers throttle setTimeout to 1000ms in background tabs. This worker bypasses it.
const timerWorkerCode = `
    const timeouts = new Map();
    self.onmessage = function(e) {
        if (e.data.command === 'setTimeout') {
            const id = e.data.id;
            timeouts.set(id, setTimeout(() => {
                self.postMessage({ id });
                timeouts.delete(id);
            }, e.data.time));
        } else if (e.data.command === 'clearTimeout') {
            clearTimeout(timeouts.get(e.data.id));
            timeouts.delete(e.data.id);
        }
    };
`;
const timerBlob = new Blob([timerWorkerCode], { type: 'application/javascript' });
const timerWorker = new Worker(URL.createObjectURL(timerBlob));

let uiTimeoutId = 0;
const uiTimeouts = new Map();

timerWorker.onmessage = function (e) {
    const id = e.data.id;
    if (uiTimeouts.has(id)) {
        const cb = uiTimeouts.get(id);
        uiTimeouts.delete(id);
        cb();
    }
};

function reliableSetTimeout(cb, time) {
    const id = ++uiTimeoutId;
    uiTimeouts.set(id, cb);
    timerWorker.postMessage({ command: 'setTimeout', id, time });
    return id;
}

function reliableClearTimeout(id) {
    uiTimeouts.delete(id);
    timerWorker.postMessage({ command: 'clearTimeout', id });
}

// Local View State (Synced from Worker)
let state = {
    turn: 0,
    position: 0,
    money: INITIAL_CAPITAL,
    logs: [],
    properties: [],
    extraObjects: new Set(),
    collection: { level: 1, points: 0, totalCollected: 0, config: [], enabled: true },
    tileVisits: [],
    tournament: {
        participants: [], // {id, name, score, target, valueRange:[], cdRange:[], nextUpdate: 0}
        playerScore: 0,
        playerRank: 0
    },
    totalEarnedDice: 0,
    totalSpentDice: 0,
    earnedDiceBreakdown: {},
    spentDiceBreakdown: {},
    systemConfig: {}, // [FIX] Initialize systemConfig in main thread state
    partnerGame: {
        tokens: 0,
        towers: [
            { id: 1, myScore: 0, partnerScore: 0, joined: false, partnerId: null },
            { id: 2, myScore: 0, partnerScore: 0, joined: false, partnerId: null },
            { id: 3, myScore: 0, partnerScore: 0, joined: false, partnerId: null },
            { id: 4, myScore: 0, partnerScore: 0, joined: false, partnerId: null }
        ],
        multiplier: 1,
        stats: { totalSpent: 0, totalGenerated: 0 }
    },
    volcano: {
        level: 1,
        hp: 0,
        maxHp: 0,
        position: 10,
        config: [],
        stats: { totalHits: 0, totalKills: 0 }
    }
};

const systemConfig = {
    Target_Speed: 0.1, // Default 100ms
    Spin_CD: 0.25,    // Default 250ms
    UI_Px: [10, 10, 10, 16], // Top, Bottom, Left, Right
    Collect_UI_Name: "收藏活動",
    AIRPORT_Value: 50,
    Collect_Item_Count: 10 // [NEW] Default count
};

// DOM Elements
const ui = {
    board: document.getElementById('board-grid'),
    boardDragHandle: document.getElementById('board-drag-handle'),
    money: document.getElementById('display-money'),
    turn: document.getElementById('display-turn'),
    gems: document.getElementById('display-gems'), // [NEW] Gem UI
    earnedDice: document.getElementById('display-earned-dice'), // [NEW] Total Earned Dice
    spentDice: document.getElementById('display-spent-dice'), // [NEW] Total Spent Dice
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
    colReward: document.getElementById('collection-reward-desc'),
    colRewardsToggle: document.getElementById('collection-rewards-toggle'),
    btnColToggle: document.getElementById('btn-collection-toggle'),
    colToggleDot: document.getElementById('collection-toggle-dot'),
    colToggleText: document.getElementById('collection-toggle-text'),
    colRewardsModal: document.getElementById('collection-rewards-modal'),
    colRewardsBackdrop: document.getElementById('collection-rewards-backdrop'),
    colRewardsList: document.getElementById('collection-rewards-list'),
    colRewardsContent: document.getElementById('collection-rewards-content'),
    btnCloseColRewards: document.getElementById('btn-close-collection-rewards'),
    btnStop: document.getElementById('btn-stop'),
    autoProgress: document.getElementById('auto-progress'),
    btnFast: document.getElementById('btn-fast'),

    // Volcano Elements
    volcanoLevel: document.getElementById('volcano-level-disp'),
    volcanoHpCurrent: document.getElementById('volcano-hp-current'),
    volcanoHpMax: document.getElementById('volcano-hp-max'),
    volcanoHpBar: document.getElementById('volcano-hp-bar'),
    volcanoModal: document.getElementById('volcano-modal'),
    volcanoList: document.getElementById('volcano-list-content'),
    btnVolcanoOpen: document.getElementById('btn-volcano-open'),
    btnVolcanoClose: document.getElementById('btn-volcano-close'),
    tourList: document.getElementById('tournament-list'),
    btnResetStats: document.getElementById('btn-reset-stats'),
    btnResetUI: document.getElementById('btn-reset-ui'),

    // [NEW] 2048 DOM Elements
    btn2048Open: document.getElementById('btn-2048-open'),
    modal2048: document.getElementById('2048-modal'),
    btnClose2048: document.getElementById('btn-close-2048'),
    grid2048: document.getElementById('grid-2048'),
    disp2048Score: document.getElementById('disp-2048-score'),
    disp2048Max: document.getElementById('disp-2048-max-level'),
    disp2048NextRewards: document.getElementById('2048-next-rewards'),
    btnRestart2048: document.getElementById('btn-restart-2048'),
    btnFullReset2048: document.getElementById('btn-full-reset-2048'),
    overlay2048: document.getElementById('grid-2048-overlay'),
    overlayTitle2048: document.getElementById('grid-overlay-title'),

    btnStmRecover: document.getElementById('btn-stm-recover'),
    stmCurrent: document.getElementById('stm-current'),
    stmTime: document.getElementById('stm-time-remaining'),
    stmBar: document.getElementById('stm-bar'),
    stmMaxDisp: document.getElementById('stm-max-display'),

    disp2048MSList: document.getElementById('2048-ms-list'),
    disp2048MSCurrentScore: document.getElementById('ms-current-score'),

    stmPreviewCurrent: document.getElementById('stm-preview-current'),
    stmPreviewBar: document.getElementById('stm-preview-bar'),

    btn2048Auto: document.getElementById('btn-2048-auto'),
    dot2048Auto: document.getElementById('2048-auto-dot'),
    select2048Speed: document.getElementById('select-2048-speed'),

    stat2048Stm: document.getElementById('2048-stat-stm'),
    stat2048Dice: document.getElementById('2048-stat-dice'),
    stat2048Gems: document.getElementById('2048-stat-gems'),
    stat2048Gold: document.getElementById('2048-stat-gold'),

    // [NEW] Partner Game DOM Elements
    btnPartnerOpen: document.getElementById('btn-partner-open'),
    modalPartner: document.getElementById('partner-modal'),
    btnClosePartner: document.getElementById('btn-close-partner'),
    btnPartnerMultToggle: document.getElementById('btn-partner-multiplier-toggle'),
    partnerMultDropdown: document.getElementById('partner-multiplier-dropdown'),
    dispPartnerMult: document.getElementById('current-partner-multiplier'),
    inputPartnerTokens: document.getElementById('partner-tokens'),
    statPartnerTotalTokens: document.getElementById('stat-partner-total-tokens'),
    statPartnerSpentTokens: document.getElementById('stat-partner-spent-tokens'),
    statPartnerTotalScore: document.getElementById('stat-partner-total-score'),

    // [NEW] Scratch Card DOM Elements
    btnScratchOpen: document.getElementById('btn-scratch-open'),
    modalScratch: document.getElementById('scratch-card-modal'),
    btnCloseScratch: document.getElementById('btn-scratch-close'),
    gridScratch: document.getElementById('scratch-grid'),
    scratchTargets: document.getElementById('scratch-targets-container'),
    scratchLevel: document.getElementById('scratch-level'),
    scratchPoints: document.getElementById('scratch-points'),
    scratchTargetPoints: document.getElementById('scratch-target-points'),
    scratchBar: document.getElementById('scratch-progress-bar'),
    btnScratchAuto: document.getElementById('btn-scratch-auto'),
    dotScratchAuto: document.getElementById('scratch-auto-dot'),
    btnScratchMult: document.getElementById('btn-scratch-multiplier'),
    dispScratchMult: document.getElementById('scratch-multiplier-val'),
    scratchTokens: document.getElementById('scratch-modal-tokens'),
    scratchSideTokens: document.getElementById('scratch-token-display'),
    statScratchTokens: document.getElementById('scratch-stat-tokens'),
    statScratchDice: document.getElementById('scratch-stat-dice'),
    statScratchGem: document.getElementById('scratch-stat-gem'),
    statScratchGold: document.getElementById('scratch-stat-gold'),
    btnScratchReset: document.getElementById('btn-scratch-reset-activity'),
    scratchPermanentRewards: document.getElementById('scratch-permanent-rewards'),
};

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
function workerMessageHandler(e) {
    const { type, payload } = e.data;

    if (type === 'UPDATE_UI') {
        const previousPosition = state.position;
        const steps = payload.diceRoll || 0;
        const isAuto = payload.isAuto;

        // Sync Data
        state.turn = payload.turn;
        state.money = payload.money;
        state.tileVisits = payload.tileVisits;
        state.extraObjects = new Set(payload.extraObjects);
        state.collection = payload.collection;
        if (payload.dice !== undefined) state.dice = payload.dice;
        if (payload.totalEarnedDice !== undefined) state.totalEarnedDice = payload.totalEarnedDice;
        if (payload.totalSpentDice !== undefined) state.totalSpentDice = payload.totalSpentDice;
        if (payload.earnedDiceBreakdown !== undefined) state.earnedDiceBreakdown = payload.earnedDiceBreakdown;
        if (payload.spentDiceBreakdown !== undefined) state.spentDiceBreakdown = payload.spentDiceBreakdown;
        if (payload.multiplier !== undefined) state.multiplier = payload.multiplier;
        if (payload.gems !== undefined) state.gems = payload.gems;

        // Feature Sync
        if (payload.partnerGame) state.partnerGame = payload.partnerGame;
        if (payload.game2048) { state.game2048 = payload.game2048; render2048(); }
        if (payload.roulette) {
            state.roulette = payload.roulette;
            updateRouletteUI();
            if (payload.roulette.lastSpinResult) animateRoulette(payload.roulette.lastSpinResult);
        }
        if (payload.volcano) { state.volcano = payload.volcano; updateVolcanoUI(); }
        if (payload.scratchCard) { state.scratchCard = payload.scratchCard; updateScratchUI(); }

        updateLogs(payload.logs);

        const isFastMode = ui.btnFast && ui.btnFast.disabled === true;

        if (isFastMode) {
            state.position = payload.position;
            updateDynamicUI(); updateUI(); updateStatsUI();
        } else if ((isAuto && isAutoRunning) || (!isAuto && steps > 0)) {
            setIsAnimating(true);
            animateMove(previousPosition, steps, payload.position, () => {
                state.position = payload.position;
                setIsAnimating(false);
                updateStatsUI(); updateUI(); updateDynamicUI(); updatePlayerPosition(state.position);
                if (state.volcano && thiefVisualPos !== -1 && state.volcano.position !== thiefVisualPos && !thiefAnimTimer) {
                    animateThief(thiefVisualPos, state.volcano.position);
                }
                if (isAutoRunning) {
                    reliableSetTimeout(() => { worker.postMessage({ type: 'NEXT_TURN' }); }, systemConfig.Spin_CD * 1000);
                }
            });
        } else {
            state.position = payload.position;
            updateDynamicUI(); updateUI(); updateStatsUI();
        }
    }

    if (type === 'AUTO_STOPPED') {
        setIsAnimating(false);
        endAutoRoll(payload.finished);
        const overlay = document.getElementById('fast-sim-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    if (type === 'PROGRESS') {
        const overlay = document.getElementById('fast-sim-overlay');
        const percent = document.getElementById('fast-sim-percent');
        if (overlay && percent) { overlay.classList.remove('hidden'); percent.textContent = payload.percent; }
    }

    if (type === 'EXPORT_DATA') {
        const logs = payload.logs;
        const csvContent = "data:text/csv;charset=utf-8,Turn,Event,Detail,Delta Gold,Balance\n" + logs.map(e => `${e.turn},${e.event},"${e.detail}",${e.delta_gold},${e.current_balance}`).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "monopoly_logs.csv");
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
}

let isAnimating = false;
let isAutoRunning = false;
let isFastSimulating = false;
let isPartnerSpeedUp = false; // [NEW] Track speed up state
let isScratchAuto = false; // [NEW] Track scratch card auto state
function setIsAnimating(val) {
    isAnimating = val;
    ui.btnRoll.disabled = val;
    // ui.btnGenExtra.disabled = val; 
}

function animateMove(startPos, steps, finalPos, onComplete) {
    let currentStep = 0;
    const interval = systemConfig.Target_Speed * 1000;

    function step() {
        if (document.hidden) {
            updatePlayerPosition(finalPos);
            // Skip to end if hidden
            if (state.volcano && thiefVisualPos !== -1 && state.volcano.position !== thiefVisualPos && !thiefAnimTimer) {
                animateThief(thiefVisualPos, state.volcano.position);
            }
            if (onComplete) onComplete();
            return;
        }

        if (currentStep >= steps) {
            if (onComplete) onComplete();
            return;
        }

        // Calculate next position visually
        const nextPos = (startPos + currentStep + 1) % BOARD_SIZE;
        updatePlayerPosition(nextPos);
        currentStep++;

        // [NEW] Trigger thief animation the moment player steps on thief's tile
        if (nextPos === thiefVisualPos && state.volcano && state.volcano.position !== thiefVisualPos && !thiefAnimTimer) {
            animateThief(thiefVisualPos, state.volcano.position);
        }

        reliableSetTimeout(() => {
            if (document.hidden) {
                step(); // Skip rAF completely if we became hidden
            } else {
                requestAnimationFrame(step);
            }
        }, interval);
    }

    if (document.hidden) {
        step(); // Immediately finish if currently hidden
    } else {
        requestAnimationFrame(step);
    }
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
        if (ui.logContainer) {
            ui.logContainer.appendChild(div);
            // [OPTIMIZATION] Limit the number of logs in the DOM
            if (ui.logContainer.children.length > 100) {
                ui.logContainer.removeChild(ui.logContainer.firstElementChild);
            }
        }
    });
}


// Initialization with Worker
async function initGame() {
    // 0. Setup Worker (Async)
    const workerOk = await setupWorker();
    if (!workerOk) return;

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
            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(buffer);

            // Parse manual csv
            const lines = text.trim().split('\n').slice(1);
            lines.forEach(line => {
                line = line.trim();
                if (!line) return;

                // Regex to capture: ID, Type, Value (handling {}), Desc
                const match = line.match(/^(\d+),([^,]+),("?\{[^}]+\}"?|[^,]+),(.+)$/);

                if (match) {
                    const type = match[2].trim();
                    let value = match[3].trim();

                    if (value.startsWith('{') || value.startsWith('"{')) {
                        // Array parsing
                        value = value.replace(/^"|"$|{|}/g, '');
                        systemConfig[type] = value.split(',').map(n => parseFloat(n.trim()));
                    } else {
                        // Numeric or String parsing
                        if (isNaN(parseFloat(value))) {
                            systemConfig[type] = value.trim();
                        } else {
                            systemConfig[type] = parseFloat(value);
                        }
                    }
                }
            });

            const colTitle = document.getElementById('collection-title');
            if (colTitle) colTitle.textContent = systemConfig.Collect_UI_Name;

            console.log("System Config Loaded:", systemConfig);
            state.systemConfig = systemConfig;

            // [NEW] Update UI input for extra count
            if (ui.extraCount) ui.extraCount.value = systemConfig.Collect_Item_Count;
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

    // 4. Load 2048 Config (New)
    let config2048 = [];
    let config2048Integral = [];
    try {
        const res2048 = await fetch('./config/2048_activity.csv');
        if (res2048.ok) {
            const text = await res2048.text();
            config2048 = parse2048CSV(text);
            state.systemConfig.config2048 = config2048;
            console.log("2048 Config Loaded:", config2048);
        }

        const resIntegral2048 = await fetch('./config/2048_activity_integral.csv');
        if (resIntegral2048.ok) {
            const text = await resIntegral2048.text();
            config2048Integral = parse2048IntegralCSV(text);
            state.systemConfig.config2048Integral = config2048Integral;
            console.log("2048 Integral Config Loaded:", config2048Integral);
        }
    } catch (e) {
        console.warn("2048 Config Load Failed", e);
    }

    // 5. Initialize Worker
    worker.postMessage({
        type: 'INIT_GAME',
        payload: {
            properties: properties,
            collectionConfig: collectionConfig,
            systemConfig: systemConfig,
            rouletteConfig: rouletteConfig, // [NEW] Pass roulette config
            rouletteIntegralConfig: rouletteIntegralConfig, // [NEW] Pass roulette integral config
            config2048: config2048,
            config2048Integral: config2048Integral,
            partnerGameConfig: partnerGameConfig // [NEW]
        }
    });

    // 5.5 Load Scratch Card Config (New Two-Table Structure)
    try {
        // Load scratch_card_reward.csv (group-based rewards)
        const resSCR = await fetch('./config/scratch_card_reward.csv');
        if (resSCR.ok) {
            const scrConfig = parseScratchCSV(await resSCR.text());
            worker.postMessage({ type: 'UPDATE_SCRATCH_REWARD_CONFIG', payload: { config: scrConfig } });
            console.log("Scratch Card Reward Config Loaded:", scrConfig.length, "entries");
        }
        // Load scratch_card_group.csv (level -> group mapping)
        const resSCG = await fetch('./config/scratch_card_group.csv');
        if (resSCG.ok) {
            const scgConfig = parseScratchGroupCSV(await resSCG.text());
            worker.postMessage({ type: 'UPDATE_SCRATCH_GROUP_CONFIG', payload: { config: scgConfig } });
            console.log("Scratch Card Group Config Loaded:", scgConfig);
        }
        // Load scratch_card_integral.csv (level progression rewards)
        const resSCI = await fetch('./config/scratch_card_integral.csv');
        if (resSCI.ok) {
            const sciConfig = parseScratchCSV(await resSCI.text());
            worker.postMessage({ type: 'UPDATE_SCRATCH_INTEGRAL', payload: { config: sciConfig } });
            console.log("Scratch Card Integral Config Loaded:", sciConfig);
        }
    } catch (e) {
        console.warn("Scratch Card Config Load Failed", e);
    }

    // 4.5 Load Volcano Config (New)
    try {
        const resVolcano = await fetch('./config/volcano.csv');
        if (resVolcano.ok) {
            const text = await resVolcano.text();
            const volcanoConfig = parseVolcanoCSV(text);
            state.volcano.config = volcanoConfig;
            console.log("Volcano Config Loaded:", volcanoConfig);
            worker.postMessage({ type: 'UPDATE_CONFIG', payload: { volcanoConfig } });
        }
    } catch (e) {
        console.warn("Volcano Config Load Failed", e);
    }

    // 6. Load Partner Game Config
    try {
        const resPartner = await fetch('./config/partner_game.csv');
        if (resPartner.ok) {
            const text = await resPartner.text();
            partnerGameConfig = parsePartnerGameCSV(text);
            state.partnerGameConfig = partnerGameConfig;
            console.log("Partner Game Config Loaded:", partnerGameConfig);

            // Re-send INIT if already sent, or just wait for START_GAME
            worker.postMessage({
                type: 'UPDATE_PARTNER_CONFIG',
                payload: { config: partnerGameConfig }
            });
        }
    } catch (e) {
        console.warn("Partner Game Config Load Failed", e);
    }

    console.log("Worker Initialized");
    // Start the game in the worker AFTER init — this resets state and triggers the first sendUpdate()
    worker.postMessage({ type: 'START_GAME' });

    initBoard(); // Initial Render (using local state.properties)

    // [NEW] Auto Generate Icons based on config
    worker.postMessage({ type: 'GEN_EXTRA', payload: { count: systemConfig.Collect_Item_Count || 10 } });

    // 4. Load Tournament Data
    try {
        const response = await fetch('./config/ranking_tournament.csv');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('utf-8');
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
                        if (p.length >= 6) {
                            state.tournament.integralConfig.push({
                                level: parseInt(p[0].trim()),
                                required: parseInt(p[1].trim()),
                                reward: parseInt(p[2].trim()) || 0,
                                gem: parseInt(p[3].trim()) || 0,
                                dice: parseInt(p[4].trim()) || 0,
                                desc: p[5].trim()
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
    if (isAutoRunning) {
        // [FIX] Stop Auto if clicked during auto-play
        ui.btnStop.click();
        return;
    }
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


// Fast Sim Handler
if (ui.btnFast) {
    ui.btnFast.addEventListener('click', () => {
        const count = parseInt(ui.autoCount.value);
        if (ui.btnFast) ui.btnFast.disabled = true;
        if (ui.btnAuto) ui.btnAuto.disabled = true;
        if (ui.btnRoll) ui.btnRoll.disabled = true;
        worker.postMessage({ type: 'START_FAST_SIM', payload: { count } });
    });
}


if (ui.btnResetStats) {
    ui.btnResetStats.addEventListener('click', () => {
        if (confirm("確定要重置所有統計數據嗎？ (Reset Stats?)")) {
            worker.postMessage({ type: 'RESET_STATS' });
            state.tileVisits = [];
            updateStatsUI();
        }
    });
}

const btnResetDiceStats = document.getElementById('btn-reset-dice-stats');
if (btnResetDiceStats) {
    btnResetDiceStats.addEventListener('click', () => {
        if (confirm("確定要重置骰子統計嗎？ (Reset Dice Stats?)")) {
            worker.postMessage({ type: 'RESET_DICE_STATS' });
            state.totalEarnedDice = 0;
            state.totalSpentDice = 0;
            state.earnedDiceBreakdown = {};
            state.spentDiceBreakdown = {};
            if (ui.earnedDice) ui.earnedDice.textContent = "0";
            if (ui.spentDice) ui.spentDice.textContent = "0";
        }
    });
}

if (ui.btnColToggle) {
    ui.btnColToggle.addEventListener('click', () => {
        state.collection.enabled = !state.collection.enabled;
        worker.postMessage({ type: 'UPDATE_COLLECTION_ENABLED', payload: { enabled: state.collection.enabled } });
        updateUI(); // Refresh UI to show grayed out state
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

const btnResetRoulette = document.getElementById('btn-reset-roulette');
if (btnResetRoulette) {
    btnResetRoulette.addEventListener('click', () => {
        if (confirm("確定要重置整個輪盤活動包含統計數據嗎？ (Reset Roulette?)")) {
            worker.postMessage({ type: 'RESET_ROULETTE' });
            // Optimistic stat clear UI
            document.getElementById('stat-r-coin').textContent = '0';
            document.getElementById('stat-r-gem').textContent = '0';
            document.getElementById('stat-r-dice').textContent = '0';
            document.getElementById('stat-r-landings').innerHTML = '';
            document.getElementById('stat-r-tokens').innerHTML = '';
            document.getElementById('stat-r-spins').textContent = 'Spins: 0';
        }
    });
}

function openRoulette() {
    uiRouletteModal.classList.remove('hidden');
    // Force reflow
    void uiRouletteModal.offsetWidth;
    uiRouletteModal.classList.remove('opacity-0');
    if (ui.btnResetUI) ui.btnResetUI.classList.add('hidden');
    renderRoulette();
    updateRouletteUI();
}

function closeRoulette() {
    uiRouletteModal.classList.add('opacity-0');
    setTimeout(() => {
        uiRouletteModal.classList.add('hidden');
        if (ui.btnResetUI) ui.btnResetUI.classList.remove('hidden');
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
        if (document.hidden) {
            current = targetCount;
            step = Math.max(step, totalSteps);
        }

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
                const waitTime = document.hidden ? 0 : Math.max(100, Math.floor(1500 / speedMult));
                reliableSetTimeout(() => {
                    if (state.pendingRouletteState) {
                        state.roulette = state.pendingRouletteState;
                        state.pendingRouletteState = null;

                        renderRoulette(); // Re-render for new level (clears drawn state visual)
                        updateRouletteUI();

                        // Proceed to auto chain
                        if (rouletteInterval && state.roulette.tokens > 0) {
                            reliableSetTimeout(() => spinRoulette(true), document.hidden ? 0 : Math.max(100, Math.floor(1000 / speedMult)));
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
                    const chainWait = document.hidden ? 0 : Math.max(10, Math.floor(baseWait / speedMult));
                    reliableSetTimeout(() => spinRoulette(true), chainWait); // Delay before next spin based on spin time
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

        reliableSetTimeout(() => {
            if (document.hidden) {
                runStep(); // Skip rAF completely if we became hidden
            } else {
                requestAnimationFrame(runStep);
            }
        }, document.hidden ? 0 : speed);
    };

    if (document.hidden) {
        runStep(); // Immediately finish if currently hidden
    } else {
        requestAnimationFrame(runStep);
    }
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
            level: parseInt(obj.level) || 0,
            maxLevel: 5
        };
    }).filter(x => x);
}

function parseScratchCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length === 0) return [];
    const headers = lines[0].trim().split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        if (!line.trim() || line.startsWith('#')) return null;
        const values = line.trim().split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h] = values[i] ? values[i].trim() : ''; });
        return obj; // Return raw object for worker flexibility
    }).filter(x => x);
}

// Parse scratch_card_group.csv which has array columns like "{1,2,3}"
function parseScratchGroupCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    // headers: level, group_list, weight_list
    return lines.slice(1).map(line => {
        if (!line.trim() || line.startsWith('#')) return null;
        // Handle CSV with quoted array values: 1,"{1,2,3}","{100,200,300}"
        const parts = line.trim().match(/([^,"]+|"[^"]*")/g);
        if (!parts || parts.length < 3) return null;
        const level = parseInt(parts[0].trim());
        // Strip quotes and braces
        const groupStr = parts[1].replace(/"|{|}/g, '').trim();
        const weightStr = parts[2].replace(/"|{|}/g, '').trim();
        const groups = groupStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        const weights = weightStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        if (isNaN(level) || groups.length === 0) return null;
        return { level, groups, weights };
    }).filter(x => x);
}

function parseCollectionCSV(text) {
    const lines = text.trim().split('\n');
    return lines.slice(1).map(line => {
        const cols = line.trim().split(',');
        if (cols.length < 6) return null; // Update column check for 6 fields
        const [level, required, gold, gem, dice, desc] = cols;
        return {
            level: parseInt(level),
            required: parseInt(required),
            gold: parseInt(gold) || 0,
            gem: parseInt(gem) || 0,
            dice: parseInt(dice) || 0,
            desc: desc
        };
    }).filter(x => x);
}

function parse2048CSV(text) {
    const lines = text.trim().split('\n');
    return lines.slice(1).map(line => {
        const cols = line.trim().split(',');
        if (cols.length < 5) return null;
        // level,reward_gold,reward_gem,reward_dice,reward_desc
        return {
            level: parseInt(cols[0]),
            coin: parseInt(cols[1]) || 0,
            gem: parseInt(cols[2]) || 0,
            dice: parseInt(cols[3]) || 0,
            desc: cols[4] || ""
        };
    }).filter(x => x);
}

function parse2048IntegralCSV(text) {
    const lines = text.trim().split('\n');
    return lines.slice(1).map(line => {
        const cols = line.trim().split(',');
        if (cols.length < 6) return null;
        // level,required_points,reward_gold,reward_gem,reward_dice,reward_desc
        return {
            level: parseInt(cols[0]),
            required: parseInt(cols[1]),
            coin: parseInt(cols[2]) || 0,
            gem: parseInt(cols[3]) || 0,
            dice: parseInt(cols[4]) || 0,
            desc: cols[5] || ""
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

// [OPTIMIZATION] Split renderBoard into initBoard and dynamic update
let isBoardInitialized = false;

function initBoard() {
    if (isBoardInitialized) return;
    try {
        const centerPanel = document.getElementById('center-panel');
        const dragHandle = document.getElementById('board-drag-handle');
        ui.board.innerHTML = '';

        if (dragHandle) ui.board.appendChild(dragHandle);

        if (centerPanel) {
            ui.board.appendChild(centerPanel);
        } else {
            ui.board.innerHTML += '<div id="center-panel" class="absolute inset-[13%] flex items-center justify-center text-white bg-red-900/50 rounded-xl">Center Panel Lost</div>';
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
                            <div class="text-[9px] text-gray-400 mt-1">$${tile.coin}</div>`;
            } else {
                content = `<div class="font-bold ${tile.color} text-xl" title="${tile.name}">${icon}</div>`;
            }

            el.innerHTML = content;
            ui.board.appendChild(el);
        });

        // Add Player Marker
        const marker = document.createElement('div');
        marker.id = 'player-marker';
        marker.className = 'player-marker';
        ui.board.appendChild(marker);

        isBoardInitialized = true;
        updateDynamicUI();
    } catch (err) {
        console.error("Board Init Failed:", err);
    }
}

function updateDynamicUI() {
    updatePlayerPosition(state.position);

    document.querySelectorAll('.tile-extra-badge').forEach(el => el.remove());
    document.querySelectorAll('.ring-2.ring-pink-500').forEach(el => el.classList.remove('ring-2', 'ring-pink-500'));

    state.extraObjects.forEach(i => {
        const el = document.getElementById(`tile-${i}`);
        if (el) {
            el.classList.add('ring-2', 'ring-pink-500');
            const badge = document.createElement('div');
            badge.className = 'tile-extra-badge absolute -top-1 -right-1 bg-pink-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full shadow z-10';
            badge.innerHTML = '🍦';
            el.appendChild(badge);
        }
    });

    document.querySelectorAll('.thief-badge').forEach(el => el.remove());
    if (state.volcano && thiefVisualPos >= 0) {
        const el = document.getElementById(`tile-${thiefVisualPos}`);
        if (el) {
            const thief = document.createElement('div');
            thief.className = 'thief-badge absolute -top-3 -right-3 bg-red-600 text-white text-xl w-9 h-9 flex items-center justify-center rounded-full shadow-[0_0_12px_rgba(239,68,68,0.8)] z-30 border-2 border-white animate-pulse ring-2 ring-red-400/60';
            thief.innerHTML = '👤';
            el.appendChild(thief);
        }
    }
}

function renderBoard() {
    if (!isBoardInitialized) {
        initBoard();
    } else {
        updateDynamicUI();
    }
}

// [NEW] Render Partner Game
function renderCollectionRewardsList() {
    if (!state.collection || !state.collection.config || !ui.colRewardsContent) return;

    ui.colRewardsContent.innerHTML = state.collection.config.map(item => {
        const isCompleted = item.level < state.collection.level;
        const isCurrent = item.level === state.collection.level;

        let rewards = [];
        if (item.coin > 0) rewards.push(`💰${item.coin.toLocaleString()}`);
        if (item.gem > 0) rewards.push(`💎${item.gem.toLocaleString()}`);
        if (item.dice > 0) rewards.push(`🎲${item.dice.toLocaleString()}`);

        const statusClass = isCompleted ? 'opacity-50 grayscale' : (isCurrent ? 'ring-2 ring-pink-500 bg-pink-500/15' : 'bg-white/10');
        const checkmark = isCompleted ? '<span class="text-neon-green text-lg ml-auto">✓</span>' : '';
        const currentTag = isCurrent ? '<span class="text-[9px] font-bold bg-pink-500 text-white px-2 py-0.5 rounded ml-auto animate-pulse shadow-lg shadow-pink-500/20">CURRENT</span>' : '';

        return `
            <div class="flex items-center gap-4 p-3 rounded-xl border border-white/10 ${statusClass} transition-all duration-300">
                <div class="w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center font-bold font-mono text-lg ${isCurrent ? 'text-pink-400' : 'text-gray-400'}">
                    ${item.level}
                </div>
                <div class="flex flex-col flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <div class="text-white text-base font-bold tracking-tight">${rewards.join(' ')}</div>
                        <div class="text-[10px] text-gray-400 bg-black/30 px-2 py-0.5 rounded-full font-mono">
                            所需積分: <span class="${isCompleted ? 'text-gray-500' : 'text-yellow-400'}">${item.required}</span>
                        </div>
                    </div>
                    <div class="text-[11px] text-gray-400 mt-1 font-medium">${item.desc || 'Reward Tier'}</div>
                </div>
                ${checkmark}
                ${currentTag}
            </div>
        `;
    }).join('');
}

function renderPartnerGame() {
    if (!state.partnerGame || !ui.modalPartner || ui.modalPartner.classList.contains('hidden')) return;
    const pg = state.partnerGame;

    // Tokens
    if (ui.inputPartnerTokens && document.activeElement !== ui.inputPartnerTokens) {
        ui.inputPartnerTokens.value = pg.tokens;
    }
    if (ui.statPartnerTotalTokens) ui.statPartnerTotalTokens.textContent = (pg.tokens + (pg.stats ? pg.stats.totalSpent : 0)).toLocaleString();
    if (ui.statPartnerSpentTokens) ui.statPartnerSpentTokens.textContent = (pg.stats ? pg.stats.totalSpent : 0).toLocaleString();
    if (ui.dispPartnerMult) ui.dispPartnerMult.textContent = `x${pg.multiplier || 1}`;

    let totalScore = 0;
    pg.towers.forEach((tower, idx) => {
        const id = tower.id;
        const myScore = tower.myScore || 0;
        const pScore = tower.partnerScore || 0;
        const currentTotal = myScore + pScore;
        totalScore += currentTotal;

        const towerMilestones = partnerGameConfig.filter(m => m.partner == id);
        const maxScore = towerMilestones.length > 0 ? Math.max(...towerMilestones.map(m => Number(m.required))) : 40000;
        const pct = Math.min(100, (currentTotal / maxScore) * 100);

        const bar = document.getElementById(`tower-bar-${id}`);
        const label = document.getElementById(`tower-score-label-${id}`);
        const btnInject = document.querySelector(`.btn-partner-inject[data-id="${id}"]`);
        const btnJoin = document.querySelector(`.btn-partner-join[data-id="${id}"]`);
        const myScoreDisp = document.getElementById(`tower-my-score-${id}`);
        const pScoreDisp = document.getElementById(`tower-partner-score-${id}`);
        const statMemberScore = document.getElementById(`stat-member-score-${id}`);

        if (bar) bar.style.width = `${pct}%`;
        if (label) label.textContent = currentTotal.toLocaleString();
        if (myScoreDisp) myScoreDisp.textContent = myScore.toLocaleString();
        if (pScoreDisp) pScoreDisp.textContent = pScore.toLocaleString();
        if (statMemberScore) statMemberScore.textContent = `${pScore.toLocaleString()} (${(tower.partnerTokens || 0).toLocaleString()})`;

        if (btnJoin) {
            if (tower.joined) {
                btnJoin.textContent = "已加入";
                btnJoin.classList.add('joined');
            } else {
                btnJoin.textContent = "加入";
                btnJoin.classList.remove('joined');
            }
        }

        if (btnInject) {
            if (currentTotal >= maxScore) {
                btnInject.classList.add('opacity-50', 'pointer-events-none');
                // Stop auto if finished
                if (partnerAutoInjectState[id]) {
                    partnerAutoInjectState[id] = false;
                }
            } else {
                btnInject.classList.remove('opacity-50', 'pointer-events-none');
            }
        }

        const btnAuto = document.querySelector(`.btn-partner-auto[data-id="${id}"]`);
        if (btnAuto) {
            if (partnerAutoInjectState[id]) {
                btnAuto.classList.add('bg-neon-blue', 'text-white', 'shadow-[0_0_15px_rgba(59,130,246,0.5)]', 'active');
                btnAuto.textContent = "AUTO ON";
            } else {
                btnAuto.classList.remove('bg-neon-blue', 'text-white', 'shadow-[0_0_15px_rgba(59,130,246,0.5)]', 'active');
                btnAuto.textContent = "AUTO";
            }
        }

        // Render Milestones
        const milestonesContainer = document.getElementById(`milestones-${id}`);
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            // Only use config for the specific partner (partner 1, 2, 3, 4)
            // If the CSV has "partner" column, filter by it.
            const towerMilestones = partnerGameConfig.filter(m => m.partner == id);
            towerMilestones.forEach(m => {
                const marker = document.createElement('div');
                let mPct = (m.required / maxScore) * 100;
                marker.className = 'milestone-marker';
                if (currentTotal >= m.required) marker.classList.add('reached');

                // Adjust last marker to not clip
                if (mPct >= 100) {
                    marker.style.right = '0';
                    marker.style.left = 'auto';
                } else {
                    marker.style.left = `${mPct}%`;
                }

                // Add Score Label (Top)
                const scoreLabel = document.createElement('div');
                scoreLabel.className = 'milestone-score';
                scoreLabel.textContent = m.required.toLocaleString();
                marker.appendChild(scoreLabel);

                // Add Reward Label (Bottom) + Tooltip
                const rewardLabel = document.createElement('div');
                rewardLabel.className = 'milestone-reward';

                let icons = [];
                let tip = [];
                if (m.dice) { icons.push('🎲'); tip.push(`🎲${m.dice.toLocaleString()}`); }
                if (m.gem) { icons.push('💎'); tip.push(`💎${m.gem.toLocaleString()}`); }
                if (m.coin) { if (!icons.length) icons.push('💰'); tip.push(`💰${m.coin.toLocaleString()}`); }
                if (m.desc) tip.push(m.desc);

                rewardLabel.textContent = icons.join('');
                rewardLabel.setAttribute('data-tip', tip.join(' '));

                // Set alignment for edge tooltips
                if (mPct > 80) {
                    rewardLabel.setAttribute('data-align', 'right');
                }

                marker.appendChild(rewardLabel);

                milestonesContainer.appendChild(marker);
            });
        }
    });

    if (ui.statPartnerTotalScore) ui.statPartnerTotalScore.textContent = totalScore.toLocaleString();

    if (ui.dispPartnerCurrentMult) ui.dispPartnerCurrentMult.textContent = `x${pg.multiplier}`;
    if (ui.partnerMultDropdown) {
        ui.partnerMultDropdown.querySelectorAll('.mult-btn').forEach(btn => {
            if (parseInt(btn.dataset.val) === pg.multiplier) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }
}

function updateUI() {
    if (ui.money) ui.money.textContent = state.money.toLocaleString();
    if (ui.turn) ui.turn.textContent = state.turn;
    if (ui.gems) ui.gems.textContent = (state.gems || 0).toLocaleString();

    // [NEW] Update Earned/Spent Dice
    if (ui.earnedDice) ui.earnedDice.textContent = (state.totalEarnedDice || 0).toLocaleString();
    if (ui.spentDice) ui.spentDice.textContent = (state.totalSpentDice || 0).toLocaleString();

    // Collection UI
    const isColEnabled = state.collection && state.collection.enabled !== false;
    const colPanel = document.getElementById('activity-drag-handle');

    if (ui.colToggleDot) {
        ui.colToggleDot.className = `w-2 h-2 rounded-full transition-all ${isColEnabled ? 'bg-neon-green shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-gray-500 shadow-none'}`;
    }
    if (ui.colToggleText) {
        ui.colToggleText.textContent = isColEnabled ? '啟動中' : '關閉中';
        ui.colToggleText.className = `text-[9px] font-bold ${isColEnabled ? 'text-gray-200' : 'text-gray-500'}`;
    }
    if (colPanel) {
        if (!isColEnabled) {
            colPanel.classList.add('opacity-50', 'grayscale-[0.5]');
        } else {
            colPanel.classList.remove('opacity-50', 'grayscale-[0.5]');
        }
    }

    const currentConfig = state.collection && state.collection.config
        ? state.collection.config.find(c => c.level === state.collection.level)
        : null;
    if (currentConfig) {
        if (ui.colLevel) ui.colLevel.textContent = state.collection.level;
        if (ui.colPoints) ui.colPoints.textContent = state.collection.points;
        if (ui.colTarget) ui.colTarget.textContent = currentConfig.required;
        if (ui.colBar) {
            const pct = Math.min((state.collection.points / currentConfig.required) * 100, 100);
            ui.colBar.style.width = `${pct}%`;
        }

        let rewardText = [];
        if (currentConfig.gold > 0) rewardText.push(`💰${currentConfig.gold.toLocaleString()}`);
        if (currentConfig.gem > 0) rewardText.push(`💎${currentConfig.gem.toLocaleString()}`);
        if (currentConfig.dice > 0) rewardText.push(`🎲${currentConfig.dice.toLocaleString()}`);
        if (currentConfig.desc) rewardText.push(currentConfig.desc);
        if (ui.colReward) ui.colReward.textContent = `Next: ` + rewardText.join(" ");
    } else if (state.collection && state.collection.config && state.collection.config.length > 0) {
        if (ui.colLevel) ui.colLevel.textContent = "MAX";
        if (ui.colPoints) ui.colPoints.textContent = "-";
        if (ui.colTarget) ui.colTarget.textContent = "-";
        if (ui.colBar) ui.colBar.style.width = "100%";
        if (ui.colReward) ui.colReward.textContent = "已達最高等級";
    }

    // [NEW] Update Dice & Multiplier UI
    const diceInput = document.getElementById('dice-balance');
    if (diceInput && document.activeElement !== diceInput) {
        diceInput.value = state.dice !== undefined ? state.dice : 10000;
    }

    // Disable Roll Button if insufficient dice
    if (ui.btnRoll) {
        if ((state.dice || 0) < (state.multiplier || 1)) {
            ui.btnRoll.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
            ui.btnRoll.title = "骰子不足 (Insufficient Dice)";
        } else {
            ui.btnRoll.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
            ui.btnRoll.title = "";
        }
    }

    renderPartnerGame(); // Update partner UI (lightweight - only updates numbers)
    updateVolcanoUI();   // Update volcano HP bar only (lightweight)
}

function updateStatsUI() {
    if (!ui.statsContent || !ui.statsContent.offsetParent) return; // Only if visible

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
        <div class="grid grid-cols-12 gap-1 px-2 py-1 hover:bg-white/5 border-b border-white/5 items-center text-[9px] group">
            <div class="col-span-1 text-gray-500 font-mono text-[8px]">#${rank + 1}</div>
            <div class="col-span-7 flex items-center gap-1 overflow-hidden">
                <span class="text-xs">${item.icon}</span>
                <span class="${item.color.split(' ')[0]} font-medium truncate">${item.name}</span>
            </div>
            <div class="col-span-2 text-right font-mono text-white group-hover:text-neon-green transition-colors">${item.count}</div>
             <div class="col-span-2 text-right font-mono text-gray-400"><span class="text-[8px]">${item.percent}%</span></div>
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

    if (updated && ui.tourList && ui.tourList.offsetParent) {
        renderTournamentUI();
    }

    requestAnimationFrame(updateTournamentBots);
}

function getRandomRange(min, max) {
    return Math.random() * (max - min) + min;
}

function renderTournamentUI() {
    if (!ui.tourList || !ui.tourList.offsetParent) return; // Only if visible
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
            <div class="chk-rank flex items-center gap-1.5 p-1 rounded border ${border} text-[9px] snap-start shrink-0">
                <div class="w-4 font-mono text-gray-500 text-center">#${rank}</div>
                <div class="flex-1 ${text} truncate max-w-[100px]" title="${p.name}">${p.name}</div>
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

        let rewardText = [];
        if (config.reward > 0) rewardText.push(`💰${config.reward}`);
        if (config.gem > 0) rewardText.push(`💎${config.gem}`);
        if (config.dice > 0) rewardText.push(`🎲${config.dice}`);
        uiDesc.textContent = `Next: ` + (rewardText.length > 0 ? rewardText.join(" ") : config.desc);
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

// --- Sidebar Toggle Logic ---
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const rightSidebar = document.getElementById('right-sidebar');
const sidebarIcon = document.getElementById('sidebar-toggle-icon');

if (btnToggleSidebar && rightSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
        const isCollapsed = rightSidebar.classList.contains('translate-x-full');
        if (isCollapsed) {
            rightSidebar.classList.remove('translate-x-full');
            sidebarIcon.style.transform = ''; // Reset rotation
            // Make sure the button stays outside
            btnToggleSidebar.classList.remove('-left-4');
            btnToggleSidebar.classList.add('-left-4');
        } else {
            rightSidebar.classList.add('translate-x-full');
            sidebarIcon.style.transform = 'rotate(180deg)';
        }
    });
}

// --- Draggable Logic ---
enableDraggable(document.getElementById('activity-panel'), document.getElementById('activity-drag-handle'));
enableDraggable(document.getElementById('tournament-panel'), document.getElementById('tournament-panel'));
enableDraggable(document.getElementById('roulette-side-panel'), document.getElementById('roulette-side-panel'));
enableDraggable(document.getElementById('2048-side-panel'), document.getElementById('2048-side-panel'));
enableDraggable(document.getElementById('partner-side-panel'), document.getElementById('partner-side-panel'));
enableDraggable(document.getElementById('volcano-side-panel'), document.getElementById('volcano-side-panel'));
enableDraggable(document.getElementById('scratch-card-side-panel'), document.getElementById('scratch-card-side-panel'));
// --- Export Logic ---
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
    let isMouseDown = false;
    let startX, startY, initialLeft, initialTop;
    let linkedElements = [];

    function normalizePosition() {
        if (getComputedStyle(el).position !== 'fixed') {
            const rect = el.getBoundingClientRect();
            el.style.position = 'fixed';
            el.style.left = rect.left + 'px';
            el.style.top = rect.top + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.margin = '0';
            // Elevate permanently so siblings moving up don't obscure it
            el.style.zIndex = '40';
        }
    }

    handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        // Don't drag if clicking a button, input, or select
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.closest('button')) {
            return;
        }

        isMouseDown = true;
        startX = e.clientX;
        startY = e.clientY;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isMouseDown) return;

        // If not dragging yet, check threshold
        if (!isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                isDragging = true;
                el.style.transition = 'none'; // Disable transition for the dragged element
                normalizePosition();

                initialLeft = parseFloat(el.style.left) || 0;
                initialTop = parseFloat(el.style.top) || 0;

                // Track fixed children to apply the same delta (synchronous movement)
                linkedElements = Array.from(el.children).filter(child => getComputedStyle(child).position === 'fixed').map(child => {
                    const originalTransition = child.style.transition;
                    child.style.transition = 'none'; // Disable transition to avoid "following" effect
                    return {
                        el: child,
                        initialLeft: parseFloat(child.style.left) || 0,
                        initialTop: parseFloat(child.style.top) || 0,
                        originalTransition: originalTransition
                    };
                });

                el.classList.add('z-50');
            } else {
                return; // Wait until threshold met
            }
        }

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLefty = initialLeft + dx;
        let newTop = initialTop + dy;

        el.style.left = `${newLefty}px`;
        el.style.top = `${newTop}px`;

        linkedElements.forEach(item => {
            item.el.style.left = `${item.initialLeft + dx}px`;
            item.el.style.top = `${item.initialTop + dy}px`;
        });
    }

    function onMouseUp() {
        isMouseDown = false;
        if (isDragging) {
            isDragging = false;
            el.style.transition = ''; // Re-enable transition
            el.classList.remove('z-50');
            linkedElements.forEach(item => {
                item.el.style.transition = item.originalTransition || ''; // Restore child element transition
            });
            linkedElements = [];
        }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}


function resetDraggablePositions() {
    const ids = ['activity-panel', 'tournament-panel', 'roulette-side-panel', '2048-side-panel', 'partner-side-panel', 'volcano-side-panel', 'scratch-card-side-panel'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // [NEW] Disable transition temporarily for instant reset
            const originalTransition = el.style.transition;
            el.style.transition = 'none';

            el.style.position = '';
            el.style.left = '';
            el.style.top = '';
            el.style.right = '';
            el.style.bottom = '';
            el.style.margin = '';
            el.style.zIndex = '';
            el.style.transform = '';

            // Force reflow to apply 'none' before restoring
            void el.offsetHeight;
            el.style.transition = originalTransition;
        }
    });

    // Also reset the board if it was moved
    const board = document.getElementById('board-grid');
    if (board) {
        board.style.transform = '';
        // Reset the tracker in script.js to match
        if (typeof boardOffsets !== 'undefined') {
            boardOffsets.x = -100;
            boardOffsets.y = 0;
        }
    }
}

// Bind Reset Button
const btnResetUI = document.getElementById('btn-reset-ui');
if (btnResetUI) {
    btnResetUI.addEventListener('click', resetDraggablePositions);
}

// [NEW] Modal function for Dice Stats
function showDiceStatsModal() {
    const listEarned = document.getElementById('dice-stats-earned-list');
    const listSpent = document.getElementById('dice-stats-spent-list');
    if (!listEarned || !listSpent) return;

    // Helper to generate specific li elements
    const renderList = (dataObj, elList, emptyMsg) => {
        const entries = Object.entries(dataObj).sort((a, b) => b[1] - a[1]); // Sort by highest amount
        if (entries.length === 0) {
            elList.innerHTML = `<li class="flex justify-between border-b border-white/5 pb-1"><span>${emptyMsg}</span><span class="text-white font-bold">0</span></li>`;
            return;
        }

        let html = '';
        for (const [key, value] of entries) {
            html += `<li class="flex justify-between border-b border-white/5 pb-1">
                      <span>${key}</span>
                      <span class="text-white font-bold">${value.toLocaleString()}</span>
                    </li>`;
        }
        elList.innerHTML = html;
    };

    renderList(state.earnedDiceBreakdown || {}, listEarned, "無紀錄");
    renderList(state.spentDiceBreakdown || {}, listSpent, "無紀錄");

    document.getElementById('dice-stats-modal').classList.remove('hidden');
    document.getElementById('dice-stats-modal').classList.add('flex');
}

// ==========================================
// 2048 UI Logic
// ==========================================

function update2048PreviewBar() {
    if (!state.game2048) return;
    const stm = state.game2048.stamina;
    const maxStm = state.game2048.maxStamina || 100;
    ui.stmPreviewCurrent.textContent = stm;
    const pct = Math.min(100, (stm / maxStm) * 100);
    ui.stmPreviewBar.style.width = `${pct}%`;
}

function render2048() {
    if (!state.game2048) return;

    const { grid, score, maxUnlockedLevel, stamina, nextStaminaTick, maxStamina, isGameOver } = state.game2048;

    // Update Scores & Stamina
    ui.disp2048Score.textContent = score;
    ui.disp2048Max.textContent = maxUnlockedLevel;
    ui.stmCurrent.textContent = stamina;
    ui.stmMaxDisp.textContent = maxStamina || 100;

    const pct = Math.min(100, (stamina / (maxStamina || 100)) * 100);
    ui.stmBar.style.width = `${pct}%`;

    // Update Stats
    if (state.game2048.stats) {
        ui.stat2048Stm.textContent = state.game2048.stats.totalStaminaUsed || 0;
        ui.stat2048Dice.textContent = state.game2048.stats.totalDiceEarned || 0;
        ui.stat2048Gems.textContent = state.game2048.stats.totalGemsEarned || 0;
        ui.stat2048Gold.textContent = (state.game2048.stats.totalGoldEarned || 0).toLocaleString();
    }

    // Handle Time Remaining (if any)
    if (stamina >= (maxStamina || 100)) {
        ui.stmTime.textContent = 'MAX';
    } else if (nextStaminaTick) {
        const remainingStr = Math.max(0, Math.ceil((nextStaminaTick - Date.now()) / 1000));
        ui.stmTime.textContent = `${remainingStr}s`;
    }

    // Render Grid
    ui.grid2048.innerHTML = '';

    // We assume 4x4
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            // Draw background empty slots
            const bgSlot = document.createElement('div');
            bgSlot.className = "absolute rounded-md bg-[#cdc1b4]";
            bgSlot.style.width = '22.5%';
            bgSlot.style.height = '22.5%';
            bgSlot.style.left = `${c * 24.5 + 2}%`;
            bgSlot.style.top = `${r * 24.5 + 2}%`;
            ui.grid2048.appendChild(bgSlot);

            // Draw active tiles
            const val = grid[r][c];
            if (val > 0) {
                const tile = document.createElement('div');

                // Styling based on level using inline attributes for safety
                let bgColor = "#eee4da";
                let textColor = "#776e65";
                let sizeClass = "text-4xl";
                let shadow = "";

                if (val >= 3) { bgColor = "#f2b179"; textColor = "white"; } // 8
                if (val >= 4) { bgColor = "#f59563"; textColor = "white"; } // 16
                if (val >= 5) { bgColor = "#f67c5f"; textColor = "white"; } // 32
                if (val >= 6) { bgColor = "#f65e3b"; textColor = "white"; } // 64
                if (val >= 7) { bgColor = "#edcf72"; textColor = "white"; sizeClass = "text-3xl"; shadow = "0 0 10px #edcf72"; } // 128
                if (val >= 8) { bgColor = "#edcc61"; textColor = "white"; sizeClass = "text-3xl"; shadow = "0 0 15px #edcc61"; } // 256
                if (val >= 9) { bgColor = "#edc850"; textColor = "white"; sizeClass = "text-3xl"; shadow = "0 0 20px #edc850"; } // 512
                if (val >= 10) { bgColor = "#edc53f"; textColor = "white"; sizeClass = "text-2xl"; shadow = "0 0 25px #edc53f"; } // 1024
                if (val >= 11) { bgColor = "#edc22e"; textColor = "white"; sizeClass = "text-2xl"; shadow = "0 0 30px #edc22e"; } // 2048

                tile.className = `absolute flex items-center justify-center font-bold rounded-md transition-all duration-150 ${sizeClass}`;

                // Position and size
                tile.style.width = '22.5%';
                tile.style.height = '22.5%';
                tile.style.left = `${c * 24.5 + 2}%`;
                tile.style.top = `${r * 24.5 + 2}%`;

                // Colors
                tile.style.backgroundColor = bgColor;
                tile.style.color = textColor;
                if (shadow) tile.style.boxShadow = shadow;

                const displayNum = Math.pow(2, val);
                tile.textContent = displayNum;

                ui.grid2048.appendChild(tile);
            }
        }
    }

    // Render Next Merge Rewards
    ui.disp2048NextRewards.innerHTML = '';
    if (state.systemConfig && state.systemConfig.config2048) {
        // Show all reward tiers from Level 2 upwards
        const allTiers = state.systemConfig.config2048.filter(c => c.level >= 2);

        if (allTiers.length === 0) {
            ui.disp2048NextRewards.innerHTML = '<div class="text-xs text-gray-500 text-center py-2">無合成獎勵設定</div>';
        } else {
            allTiers.forEach(c => {
                const item = document.createElement('div');
                const isClaimed = c.level <= maxUnlockedLevel;
                const opacityClass = isClaimed ? 'opacity-40' : 'opacity-100';

                item.className = `flex justify-between items-center bg-black/20 p-2 rounded border border-white/5 ${opacityClass}`;

                let rewardsHtml = '';
                if (c.coin) rewardsHtml += `<span class="text-yellow-400 mr-2">💰 ${c.coin}</span>`;
                if (c.gem) rewardsHtml += `<span class="text-purple-400 mr-2">💎 ${c.gem}</span>`;
                if (c.dice) rewardsHtml += `<span class="text-green-400">🎲 ${c.dice}</span>`;

                item.innerHTML = `
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded bg-[#f59563] text-white font-bold flex items-center justify-center text-[10px]">${Math.pow(2, c.level)}</div>
                        <span class="text-xs ${isClaimed ? 'text-emerald-400' : 'text-gray-300'}">${isClaimed ? '已解鎖' : '解鎖'} Lv.${c.level}</span>
                    </div>
                    <div class="text-[10px] bg-black/50 px-2 py-1 rounded flex items-center shadow-inner">
                        ${rewardsHtml || '無'}
                    </div>
                `;
                ui.disp2048NextRewards.appendChild(item);
            });
        }
    }

    // Auto update milestones inside right panel
    process2048Milestones();
    // Handle Game Over Overlay
    if (isGameOver) {
        ui.overlay2048.classList.remove('opacity-0', 'pointer-events-none');
        ui.overlay2048.classList.add('opacity-100', 'pointer-events-auto');
    } else {
        ui.overlay2048.classList.add('opacity-0', 'pointer-events-none');
        ui.overlay2048.classList.remove('opacity-100', 'pointer-events-auto');
    }
}

function process2048Milestones() {
    if (!state.systemConfig || !state.systemConfig.config2048Integral || !state.game2048) return;

    const msConfig = state.systemConfig.config2048Integral;
    const currentScore = state.game2048.score;
    const claimed = state.game2048.claimedMilestones || [];

    ui.disp2048MSCurrentScore.textContent = currentScore;
    ui.disp2048MSList.innerHTML = '';

    msConfig.forEach((c, idx) => {
        const item = document.createElement('div');
        const isClaimed = claimed.includes(idx);
        const canClaim = !isClaimed && currentScore >= c.required;
        const progressPct = Math.min(100, (currentScore / c.required) * 100);

        let borderClass = 'border-white/5';
        let bgClass = 'bg-black/20';
        let statusHtml = '';

        if (isClaimed) {
            borderClass = 'border-emerald-500/20';
            bgClass = 'bg-emerald-900/10';
            statusHtml = '<div class="text-xs text-emerald-500 font-bold px-2">已領取</div>';
        } else if (canClaim) {
            borderClass = 'border-emerald-400';
            bgClass = 'bg-emerald-900/30';
            item.classList.add('shadow-[0_0_10px_rgba(52,211,153,0.3)]');
            statusHtml = '<div class="text-xs text-white bg-emerald-500 px-3 py-1 rounded shadow animate-pulse font-bold">可領取!</div>';
        } else {
            statusHtml = `<div class="text-[10px] text-gray-500 w-16 text-right">${currentScore} / ${c.required}</div>`;
        }

        let rewardsHtml = '';
        if (c.coin) rewardsHtml += `<span class="text-yellow-400 mr-2">💰 ${c.coin}</span>`;
        if (c.gem) rewardsHtml += `<span class="text-purple-400 mr-2">💎 ${c.gem}</span>`;
        if (c.dice) rewardsHtml += `<span class="text-green-400">🎲 ${c.dice}</span>`;

        item.className = `p-2 rounded border ${borderClass} ${bgClass} relative overflow-hidden transition-colors`;
        item.innerHTML = `
            <!-- Progress bg -->
            <div class="absolute left-0 top-0 bottom-0 bg-emerald-500/5 transition-all duration-500" style="width: ${progressPct}%"></div>
            
            <div class="relative z-10 flex justify-between items-center whitespace-nowrap">
                <div class="flex-1 min-w-0">
                    <div class="text-[12px] font-bold text-gray-100 flex items-center gap-1.5">
                        <span class="shrink-0">達標 ${c.required} 分</span>
                        ${c.desc ? `<span class="text-[9px] font-normal text-emerald-400 bg-emerald-400/10 px-1 py-0 rounded truncate max-w-[80px]">${c.desc}</span>` : ''}
                    </div>
                    <div class="text-[11px] mt-0.5 opacity-90">
                        ${rewardsHtml || '無'}
                    </div>
                </div>
                <div class="shrink-0 ml-2">${statusHtml}</div>
            </div>
        `;
        ui.disp2048MSList.appendChild(item);
    });
}

// 2048 Event Listeners
if (ui.btn2048Open) {
    ui.btn2048Open.addEventListener('click', () => {
        ui.modal2048.classList.remove('hidden');
        // brief timeout to allow display:block to apply before animating opacity
        setTimeout(() => {
            ui.modal2048.classList.remove('opacity-0');
        }, 10);
        render2048();

        // Setup Keyboard and Swipe Listeners
        document.addEventListener('keydown', handle2048Input);
        document.addEventListener('touchstart', handle2048TouchStart, { passive: false });
        document.addEventListener('touchend', handle2048TouchEnd, { passive: false });
        // Mouse drag support
        ui.grid2048.addEventListener('mousedown', handle2048MouseStart);
    });
}

if (ui.btnClose2048) {
    ui.btnClose2048.addEventListener('click', () => {
        if (is2048Auto) stop2048Auto();
        ui.modal2048.classList.add('opacity-0');
        setTimeout(() => {
            ui.modal2048.classList.add('hidden');
            if (ui.btnResetUI) ui.btnResetUI.classList.remove('hidden');
        }, 300);

        document.removeEventListener('keydown', handle2048Input);
        document.removeEventListener('touchstart', handle2048TouchStart);
        document.removeEventListener('touchend', handle2048TouchEnd);
        ui.grid2048.removeEventListener('mousedown', handle2048MouseStart);
    });
}

if (ui.btnRestart2048) {
    ui.btnRestart2048.addEventListener('click', () => {
        worker.postMessage({ type: 'MOVE_2048', payload: { action: 'RESTART' } });
    });
}
if (ui.btnFullReset2048) {
    ui.btnFullReset2048.addEventListener('click', () => {
        if (confirm('確定要完全重置 2048 活動嗎？這將清空所有積分、體力與獎勵紀錄。')) {
            worker.postMessage({ type: 'MOVE_2048', payload: { action: 'FULL_RESET' } });
        }
    });
}

if (ui.btnStmRecover) {
    ui.btnStmRecover.addEventListener('click', () => {
        worker.postMessage({ type: 'MOVE_2048', payload: { action: 'USE_STAMINA_ITEM' } });
    });
}

function handle2048Input(e) {
    // Only handle if modal is open
    if (ui.modal2048.classList.contains('hidden')) return;

    const keyMap = {
        'ArrowUp': 'UP',
        'ArrowDown': 'DOWN',
        'ArrowLeft': 'LEFT',
        'ArrowRight': 'RIGHT',
        'w': 'UP',
        's': 'DOWN',
        'a': 'LEFT',
        'd': 'RIGHT',
        'W': 'UP',
        'S': 'DOWN',
        'A': 'LEFT',
        'D': 'RIGHT'
    };

    const direction = keyMap[e.key];
    if (direction) {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault(); // prevent scrolling
        }
        worker.postMessage({ type: 'MOVE_2048', payload: { action: 'MOVE', direction } });
    }
}

// --- Swipe Logic ---
let touchStartX = 0;
let touchStartY = 0;

function handle2048TouchStart(e) {
    if (ui.modal2048.classList.contains('hidden')) return;
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}

function handle2048TouchEnd(e) {
    if (ui.modal2048.classList.contains('hidden')) return;
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
}

function handle2048MouseStart(e) {
    if (ui.modal2048.classList.contains('hidden')) return;
    e.preventDefault();
    touchStartX = e.clientX;
    touchStartY = e.clientY;
    document.addEventListener('mouseup', handle2048MouseEnd);
}

function handle2048MouseEnd(e) {
    document.removeEventListener('mouseup', handle2048MouseEnd);
    if (ui.modal2048.classList.contains('hidden')) return;
    const touchEndX = e.clientX;
    const touchEndY = e.clientY;
    handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
}

function handleSwipe(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) > 30) { // Minimum swipe distance
        let direction = null;
        if (absDx > absDy) {
            direction = dx > 0 ? 'RIGHT' : 'LEFT';
        } else {
            direction = dy > 0 ? 'DOWN' : 'UP';
        }
        if (direction) {
            worker.postMessage({ type: 'MOVE_2048', payload: { action: 'MOVE', direction } });
        }
    }
}

// 2048 Auto Play Logic
let is2048Auto = false;
let auto2048Interval = null;
let auto2048DirIdx = 0; // 0:UP, 1:RIGHT, 2:DOWN, 3:LEFT
const auto2048Dirs = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

function toggle2048Auto() {
    if (is2048Auto) {
        stop2048Auto();
    } else {
        start2048Auto();
    }
}

function start2048Auto() {
    if (!state.game2048 || state.game2048.stamina < 1 || state.game2048.isGameOver) return;

    // Clear previous if any
    if (auto2048Interval) clearInterval(auto2048Interval);

    is2048Auto = true;
    ui.btn2048Auto.classList.add('bg-emerald-500/20', 'border-emerald-500', 'text-emerald-400', 'font-bold');
    ui.btn2048Auto.textContent = '停止';
    // Re-insert dot because we just overwrote textContent
    const dot = document.createElement('span');
    dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
    dot.id = "2048-auto-dot";
    ui.btn2048Auto.prepend(dot);
    ui.dot2048Auto = dot; // Update ref

    const speed = parseInt(ui.select2048Speed.value) || 2;
    const intervalMs = Math.floor(1000 / speed);

    auto2048Interval = setInterval(() => {
        if (!is2048Auto || !state.game2048 || state.game2048.stamina < 1 || state.game2048.isGameOver) {
            stop2048Auto();
            return;
        }

        const dir = auto2048Dirs[auto2048DirIdx];
        worker.postMessage({ type: 'MOVE_2048', payload: { action: 'MOVE', direction: dir } });

        // Cycle clockwise
        auto2048DirIdx = (auto2048DirIdx + 1) % 4;
    }, intervalMs);
}

function stop2048Auto() {
    is2048Auto = false;
    if (auto2048Interval) {
        clearInterval(auto2048Interval);
        auto2048Interval = null;
    }
    ui.btn2048Auto.classList.remove('bg-emerald-500/20', 'border-emerald-500', 'text-emerald-400', 'font-bold');
    ui.btn2048Auto.textContent = '啟動';
    const dot = document.createElement('span');
    dot.className = "w-2 h-2 rounded-full bg-gray-500";
    dot.id = "2048-auto-dot";
    ui.btn2048Auto.prepend(dot);
    ui.dot2048Auto = dot; // Update ref
}

if (ui.btn2048Auto) {
    ui.btn2048Auto.addEventListener('click', toggle2048Auto);
}

if (ui.select2048Speed) {
    ui.select2048Speed.addEventListener('change', () => {
        if (is2048Auto) {
            start2048Auto(); // Restart with new speed
        }
    });
}

// --- Partner Game Event Listeners ---
if (ui.btnPartnerOpen) {
    ui.btnPartnerOpen.addEventListener('click', () => {
        ui.modalPartner.classList.remove('hidden');
        if (ui.btnResetUI) ui.btnResetUI.classList.add('hidden');
        setTimeout(() => {
            ui.modalPartner.classList.remove('opacity-0');
            ui.modalPartner.classList.remove('pointer-events-none');
        }, 10);
        renderPartnerGame();
    });
}

if (ui.btnClosePartner) {
    ui.btnClosePartner.addEventListener('click', () => {
        ui.modalPartner.classList.add('opacity-0');
        ui.modalPartner.classList.add('pointer-events-none');
        setTimeout(() => {
            ui.modalPartner.classList.add('hidden');
            if (ui.btnResetUI) ui.btnResetUI.classList.remove('hidden');
        }, 300);
    });
}

if (ui.btnPartnerMultToggle) {
    ui.btnPartnerMultToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        ui.partnerMultDropdown.classList.toggle('hidden');
    });
}

// Close multiplier dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (ui.partnerMultDropdown && !ui.partnerMultDropdown.classList.contains('hidden')) {
        if (!ui.partnerMultDropdown.contains(e.target) && e.target !== ui.btnPartnerMultToggle) {
            ui.partnerMultDropdown.classList.add('hidden');
        }
    }
});

if (ui.partnerMultDropdown) {
    ui.partnerMultDropdown.querySelectorAll('.mult-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.val);
            worker.postMessage({ type: 'UPDATE_PARTNER_DATA', payload: { multiplier: val } });
            ui.partnerMultDropdown.classList.add('hidden');
        });
    });
}

if (ui.inputPartnerTokens) {
    ui.inputPartnerTokens.addEventListener('input', () => {
        const val = parseInt(ui.inputPartnerTokens.value) || 0;
        worker.postMessage({ type: 'UPDATE_PARTNER_DATA', payload: { tokens: val } });
    });
}

// Icon Collection Rewards Toggle (Centered Modal)
if (ui.colRewardsToggle && ui.colRewardsModal) {
    const showModal = () => {
        renderCollectionRewardsList();
        ui.colRewardsModal.classList.remove('hidden');
        if (ui.btnResetUI) ui.btnResetUI.classList.add('hidden');
        // Trigger animations
        setTimeout(() => {
            ui.colRewardsBackdrop.style.opacity = '1';
            ui.colRewardsList.style.opacity = '1';
            ui.colRewardsList.style.transform = 'scale(1)';
        }, 10);
    };

    const hideModal = () => {
        ui.colRewardsBackdrop.style.opacity = '0';
        ui.colRewardsList.style.opacity = '0';
        ui.colRewardsList.style.transform = 'scale(0.9)';
        setTimeout(() => {
            ui.colRewardsModal.classList.add('hidden');
            if (ui.btnResetUI) ui.btnResetUI.classList.remove('hidden');
        }, 300);
    };

    ui.colRewardsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        showModal();
    });

    if (ui.btnCloseColRewards) ui.btnCloseColRewards.addEventListener('click', (e) => {
        e.stopPropagation();
        hideModal();
    });
    if (ui.colRewardsBackdrop) ui.colRewardsBackdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        hideModal();
    });
}

// Close dropdowns on outside click (for other dropdowns if any, but modal is handled above)
document.addEventListener('click', (e) => {
    // Other dropdown closing logic can remain or be updated if needed
});

// Tower interactions (Inject/Join/Auto)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-partner-inject')) {
        const id = parseInt(e.target.dataset.id);
        worker.postMessage({ type: 'PARTNER_GAME_INJECT', payload: { towerId: id } });
    }
    if (e.target.classList.contains('btn-partner-auto')) {
        const id = parseInt(e.target.dataset.id);
        partnerAutoInjectState[id] = !partnerAutoInjectState[id];

        // Start interval if any are enabled
        if (!partnerAutoInjectInterval) {
            partnerAutoInjectInterval = setInterval(() => {
                let anyActive = false;
                Object.keys(partnerAutoInjectState).forEach(pid => {
                    if (partnerAutoInjectState[pid]) {
                        anyActive = true;
                        worker.postMessage({ type: 'PARTNER_GAME_INJECT', payload: { towerId: parseInt(pid) } });
                    }
                });
                if (!anyActive) {
                    clearInterval(partnerAutoInjectInterval);
                    partnerAutoInjectInterval = null;
                }
            }, 200);
        }
        renderPartnerGame();
    }
    if (e.target.classList.contains('btn-partner-join')) {
        const id = parseInt(e.target.dataset.id);
        worker.postMessage({ type: 'PARTNER_GAME_JOIN', payload: { towerId: id } });
    }
});

if (ui.inputPartnerTokens) {
    ui.inputPartnerTokens.addEventListener('change', () => {
        const val = parseInt(ui.inputPartnerTokens.value) || 0;
        worker.postMessage({ type: 'UPDATE_PARTNER_DATA', payload: { tokens: val } });
    });
}

// Board Dragging Logic
let isBoardDragging = false;
let boardOffsets = { x: -100, y: 0 };
let boardStartPos = { x: 0, y: 0 };

if (ui.boardDragHandle) {
    ui.boardDragHandle.addEventListener('mousedown', (e) => {
        isBoardDragging = true;
        ui.board.style.transition = 'none';

        boardStartPos = {
            x: e.clientX - boardOffsets.x,
            y: e.clientY - boardOffsets.y
        };

        document.addEventListener('mousemove', handleBoardDrag);
        document.addEventListener('mouseup', stopBoardDrag);
        e.preventDefault();
    });
}

function handleBoardDrag(e) {
    if (!isBoardDragging) return;
    boardOffsets.x = e.clientX - boardStartPos.x;
    boardOffsets.y = e.clientY - boardStartPos.y;
    ui.board.style.transform = `translate(${boardOffsets.x}px, ${boardOffsets.y}px)`;
}

function stopBoardDrag() {
    isBoardDragging = false;
    ui.board.style.transition = '';
    document.removeEventListener('mousemove', handleBoardDrag);
    document.removeEventListener('mouseup', stopBoardDrag);
}

function flashTitle() {
    const originalTitle = document.title;
    const flashTitleText = '【待確認】';
    let count = 0;
    const interval = setInterval(() => {
        document.title = (document.title === originalTitle) ? flashTitleText : originalTitle;
        count++;
        if (count >= 10) {
            clearInterval(interval);
            document.title = originalTitle;
        }
    }, 500);
}

window.flashTitle = flashTitle;

// Thief animation state
// thiefVisualPos = where thief icon IS currently displayed (NOT state.volcano.position)
// renderBoard uses this, so no premature icon appears
let thiefVisualPos = -1;
let thiefAnimTimer = null;

function updateVolcanoUI() {
    if (!state.volcano) return;

    if (ui.volcanoLevel) ui.volcanoLevel.textContent = state.volcano.level;
    if (ui.volcanoHpCurrent) ui.volcanoHpCurrent.textContent = Math.ceil(state.volcano.hp).toLocaleString();
    if (ui.volcanoHpMax) ui.volcanoHpMax.textContent = state.volcano.maxHp.toLocaleString();

    if (ui.volcanoHpBar) {
        const pct = state.volcano.maxHp > 0 ? (state.volcano.hp / state.volcano.maxHp) * 100 : 0;
        ui.volcanoHpBar.style.width = `${pct}%`;
    }

    // Initialize thiefVisualPos on first call only (no animation trigger here)
    if (thiefVisualPos === -1 && state.volcano.position !== undefined) {
        thiefVisualPos = state.volcano.position;
    }
}

function animateThief(fromPos, toPos) {
    if (thiefAnimTimer) clearTimeout(thiefAnimTimer);

    const speed = systemConfig.Volcano_Speed || 10; // tiles per second
    const intervalMs = Math.round(1000 / speed);
    const total = BOARD_SIZE;
    let current = fromPos;

    const stepsForward = (toPos - fromPos + total) % total;
    if (stepsForward === 0) {
        thiefVisualPos = toPos;
        return;
    }

    let stepCount = 0;

    function stepThief() {
        stepCount++;
        if (stepCount > stepsForward) {
            // Done — update visual pos and do final board render (static badge will appear)
            thiefAnimTimer = null;
            thiefVisualPos = toPos;
            requestAnimationFrame(() => renderBoard());
            return;
        }

        const prevPos = current;          // tile we are leaving
        current = (current + 1) % total;  // move forward (clockwise)
        thiefVisualPos = current;         // keep visual pos in sync

        // Remove badge from previous tile
        const prevTile = document.getElementById(`tile-${prevPos}`);
        if (prevTile) prevTile.querySelectorAll('.thief-badge').forEach(b => b.remove());

        // Place badge on current tile
        const curTile = document.getElementById(`tile-${current}`);
        if (curTile && !curTile.querySelector('.thief-badge')) {
            const badge = document.createElement('div');
            badge.className = 'thief-badge absolute -top-3 -right-3 bg-red-600 text-white text-xl w-9 h-9 flex items-center justify-center rounded-full shadow-[0_0_12px_rgba(239,68,68,0.8)] z-30 border-2 border-white animate-pulse ring-2 ring-red-400/60';
            badge.innerHTML = '\ud83d\udc64';
            curTile.appendChild(badge);
        }

        thiefAnimTimer = setTimeout(stepThief, intervalMs);
    }

    // Clear any existing badge from start tile, then place badge there
    const startTile = document.getElementById(`tile-${fromPos}`);
    if (startTile) {
        startTile.querySelectorAll('.thief-badge').forEach(b => b.remove());
        const badge = document.createElement('div');
        badge.className = 'thief-badge absolute -top-3 -right-3 bg-red-600 text-white text-xl w-9 h-9 flex items-center justify-center rounded-full shadow-[0_0_12px_rgba(239,68,68,0.8)] z-30 border-2 border-white animate-pulse ring-2 ring-red-400/60';
        badge.innerHTML = '\ud83d\udc64';
        startTile.appendChild(badge);
    }

    stepThief();
}

function openVolcanoModal() {
    if (ui.volcanoModal) {
        ui.volcanoModal.classList.remove('hidden');
        if (ui.btnResetUI) ui.btnResetUI.classList.add('hidden');
        // Force reflow
        void ui.volcanoModal.offsetWidth;
        ui.volcanoModal.classList.remove('opacity-0');
        renderVolcanoList();
    }
}

function closeVolcanoModal() {
    if (ui.volcanoModal) {
        ui.volcanoModal.classList.add('opacity-0');
        setTimeout(() => {
            ui.volcanoModal.classList.add('hidden');
            if (ui.btnResetUI) ui.btnResetUI.classList.remove('hidden');
        }, 300);
    }
}

function renderVolcanoList() {
    if (!ui.volcanoList || !state.volcano || !state.volcano.config) return;

    let html = '';
    state.volcano.config.forEach(cfg => {
        const isCurrent = cfg.level === state.volcano.level;
        const rewards = [];
        if (cfg.reward_gold) rewards.push(`💰${cfg.reward_gold}`);
        if (cfg.reward_gem) rewards.push(`💎${cfg.reward_gem}`);
        if (cfg.reward_dice) rewards.push(`🎲${cfg.reward_dice}`);

        html += `
            <div class="flex items-center justify-between p-3 rounded-lg border ${isCurrent ? 'bg-red-500/10 border-red-500/50' : 'bg-white/5 border-white/10'}">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center text-xl border border-red-500/30">👤</div>
                    <div>
                        <div class="text-sm font-bold ${isCurrent ? 'text-red-400' : 'text-gray-300'}">Lv.${cfg.level} 匪徒 ${isCurrent ? '(當前)' : ''}</div>
                        <div class="text-[10px] text-gray-500">生命值: ${cfg.hp} | ${cfg.reward_desc}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] text-gray-500 mb-1 uppercase tracking-tighter">擊敗獎勵</div>
                    <div class="text-xs font-bold text-yellow-500">${rewards.join(' ')}</div>
                </div>
            </div>
        `;
    });
    ui.volcanoList.innerHTML = html;
}

// Event Listeners for Volcano
if (ui.btnVolcanoOpen) {
    ui.btnVolcanoOpen.addEventListener('mousedown', (e) => e.stopPropagation()); // Prevent drag start
    ui.btnVolcanoOpen.addEventListener('click', openVolcanoModal);
}
if (ui.btnVolcanoClose) ui.btnVolcanoClose.addEventListener('click', closeVolcanoModal);

// --- Antigravity Notification Utility ---
window.antigravityNotify = function (isFinal) {
    const originalTitle = document.title;
    if (!isFinal) {
        let count = 0;
        const interval = setInterval(() => {
            document.title = (document.title === originalTitle) ? '【待確認】' : originalTitle;
            count++;
            if (count >= 10) {
                clearInterval(interval);
                document.title = originalTitle;
                setTimeout(() => {
                    window.close();
                }, 100);
            }
        }, 500);
    } else {
        setInterval(() => {
            document.title = (document.title === originalTitle) ? '【待確認】' : originalTitle;
        }, 500);
        // Important: Use setTimeout to ensure title update starts before alert blocks
        setTimeout(() => {
            alert('作業已完成，請驗收！');
        }, 100);
    }
};

// [NEW] Scratch Card Activity Logic
function updateScratchUI() {
    const sc = state.scratchCard;
    if (!sc) return;

    if (ui.scratchLevel) ui.scratchLevel.textContent = sc.level;
    if (ui.scratchPoints) ui.scratchPoints.textContent = sc.points;

    let currentCfg = sc.integralConfig.find(c => parseInt(c.level) === sc.level);
    if (currentCfg) {
        if (ui.scratchTargetPoints) ui.scratchTargetPoints.textContent = currentCfg.required_points;
        if (ui.scratchBar) ui.scratchBar.style.width = `${(sc.points / parseInt(currentCfg.required_points)) * 100}%`;
    }

    if (ui.scratchTokens && document.activeElement !== ui.scratchTokens) ui.scratchTokens.value = sc.tokens;
    if (ui.scratchSideTokens) ui.scratchSideTokens.textContent = sc.tokens;

    if (ui.statScratchTokens) ui.statScratchTokens.textContent = sc.stats.totalTokensUsed || 0;
    if (ui.statScratchDice) ui.statScratchDice.textContent = sc.stats.totalDice || 0;
    if (ui.statScratchGem) ui.statScratchGem.textContent = sc.stats.totalGem || 0;
    if (ui.statScratchGold) ui.statScratchGold.textContent = sc.stats.totalGold || 0;

    if (ui.dispScratchMult) ui.dispScratchMult.textContent = scratchSpeed;

    // Helper: get icon from reward record (use icon field or fall back to reward_type)
    function getRewardIcon(t) {
        if (t.icon && t.icon.trim()) return t.icon.trim();
        const type = (t.reward_type || '').toUpperCase();
        if (type === 'GOLD') return '💰';
        if (type === 'GEM') return '💎';
        if (type === 'DICE') return '🎲';
        return '❓';
    }

    if (ui.scratchTargets && sc.currentCard) {
        ui.scratchTargets.innerHTML = sc.currentCard.targets.slice(0, 3).map((t, idx) => `
            <div class="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                <div class="text-2xl">${getRewardIcon(t)}</div>
                <div>
                    <div class="text-[9px] text-gray-400 uppercase tracking-widest">${t.desc || t.reward_type || '獎勵'}</div>
                    <div class="text-[11px] font-bold text-white">${t.reward_value}</div>
                    ${parseInt(t.integral) > 0 ? `<div class="text-[9px] text-neon-blue">+${t.integral} 積分</div>` : ''}
                </div>
            </div>
        `).join('');
    }

    if (ui.gridScratch && sc.currentCard) {
        ui.gridScratch.innerHTML = sc.currentCard.grid.map((iconIdx, i) => {
            const isRevealed = sc.currentCard.revealed.includes(i);
            const target = sc.currentCard.targets[iconIdx];
            const isMatched = sc.currentCard.isCompleted && sc.currentCard.matchedIdx === iconIdx && isRevealed;
            const icon = getRewardIcon(target);

            return `
                <div onclick="clickScratchCard(${i})" class="scratch-card-item aspect-square rounded-xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-center relative overflow-hidden group
                    ${isRevealed ? 'bg-white/10 border-white/20' : 'bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/30 hover:border-yellow-400'}
                    ${isMatched ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-transparent border-yellow-400 bg-yellow-400/20 animate-pulse' : ''}">
                    ${isRevealed ? `<span class="text-2xl animate-bounce-short">${icon}</span>` : `
                        <div class="absolute inset-0 flex items-center justify-center">
                            <span class="text-yellow-500/40 text-[10px] font-black uppercase tracking-widest group-hover:scale-110 transition-transform">Scratch</span>
                        </div>
                    `}
                </div>
            `;
        }).join('');
    }

    if (ui.dotScratchAuto) {
        ui.dotScratchAuto.className = `w-2 h-2 rounded-full transition-all duration-300 ${isScratchAuto ? 'bg-neon-green shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-gray-500'}`;
    }

    // --- Update Permanent Reward List (2048 Style) ---
    if (ui.scratchPermanentRewards && sc.integralConfig) {
        const currentLevel = sc.level || 1;
        const currentPoints = sc.points || 0;

        ui.scratchPermanentRewards.innerHTML = sc.integralConfig.map(c => {
            const level = parseInt(c.level);
            const isActive = level === currentLevel;
            const isCompleted = level < currentLevel;
            const targetPts = parseInt(c.required_points) || 0;

            const gold = parseInt(c.reward_gold) || 0;
            const gem = parseInt(c.reward_gem) || 0;
            const dice = parseInt(c.reward_dice) || 0;

            const rewards = [];
            if (gold > 0) rewards.push(`
                <div class="flex items-center gap-1">
                    <span class="text-[10px]">💰</span>
                    <span class="font-bold text-yellow-500/90 text-[10px]">${gold.toLocaleString()}</span>
                </div>
            `);
            if (gem > 0) rewards.push(`
                <div class="flex items-center gap-1">
                    <span class="text-[10px]">💎</span>
                    <span class="font-bold text-emerald-400/90 text-[10px]">${gem}</span>
                </div>
            `);
            if (dice > 0) rewards.push(`
                <div class="flex items-center gap-1">
                    <span class="text-[10px]">🎲</span>
                    <span class="font-bold text-blue-400/90 text-[10px]">${dice}</span>
                </div>
            `);

            // Styling based on status
            let rowClass = "p-2.5 rounded-xl border transition-all mb-1.5 flex flex-col gap-2 ";
            let statusText = "";
            let statusClass = "text-[10px] font-bold ";

            if (isCompleted) {
                rowClass += "bg-white/[0.02] border-white/5 opacity-40";
                statusText = "已領取";
                statusClass += "text-neon-green";
            } else if (isActive) {
                rowClass += "bg-vibe-primary/10 border-vibe-primary/30 ring-1 ring-vibe-primary/20 shadow-[0_0_15px_rgba(var(--vibe-primary-rgb),0.1)]";
                statusText = `${currentPoints} / ${targetPts}`;
                statusClass += "text-vibe-primary";
            } else {
                rowClass += "bg-black/20 border-white/5";
                statusText = `0 / ${targetPts}`;
                statusClass += "text-gray-500";
            }

            return `
                <div class="${rowClass}">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] font-black text-white px-1.5 py-0.5 rounded bg-white/5 border border-white/10 italic">LV.${level}</span>
                            <span class="text-[10px] text-gray-400 font-medium">升級獎勵</span>
                        </div>
                        <div class="${statusClass}">${statusText}</div>
                    </div>
                    <div class="flex flex-wrap gap-3 mt-0.5">
                        ${rewards.join('')}
                    </div>
                </div>
            `;
        }).join('');
    }
}

function clickScratchCard(index) {
    worker.postMessage({ type: 'SCRATCH_CARD_PICK', payload: { index } });
}

// Global exposure for onclick
window.clickScratchCard = clickScratchCard;

// Event Listeners for Scratch Card Modal
if (ui.btnScratchOpen) {
    ui.btnScratchOpen.addEventListener('click', () => {
        ui.modalScratch.classList.remove('hidden');
        setTimeout(() => {
            ui.modalScratch.classList.remove('opacity-0');
            const container = document.getElementById('scratch-modal-container');
            if (container) container.classList.remove('scale-90');
        }, 10);
        ui.btnResetUI.classList.add('hidden');
    });
}

if (ui.btnCloseScratch) {
    ui.btnCloseScratch.addEventListener('click', () => {
        ui.modalScratch.classList.add('opacity-0');
        const container = document.getElementById('scratch-modal-container');
        if (container) container.classList.add('scale-90');
        setTimeout(() => ui.modalScratch.classList.add('hidden'), 300);
        ui.btnResetUI.classList.remove('hidden');
    });
}

if (ui.btnScratchReset) {
    ui.btnScratchReset.addEventListener('click', () => {
        if (confirm("確定要重置刮刮卡活動嗎？此操作將清除所有進度。")) {
            worker.postMessage({ type: 'SCRATCH_CARD_RESET' });
        }
    });
}

if (ui.scratchTokens) {
    ui.scratchTokens.addEventListener('input', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 0) val = 0;
        worker.postMessage({ type: 'UPDATE_CONFIG', payload: { scratchTokens: val } });
    });
}

if (ui.btnScratchMult) {
    ui.btnScratchMult.addEventListener('click', () => {
        const speeds = [1, 2, 3, 5, 10, 50, 100];
        let nextIdx = (speeds.indexOf(scratchSpeed) + 1) % speeds.length;
        scratchSpeed = speeds[nextIdx];
        if (ui.dispScratchMult) ui.dispScratchMult.textContent = scratchSpeed;
    });
}
if (ui.btnScratchAuto) {
    ui.btnScratchAuto.addEventListener('click', () => {
        isScratchAuto = !isScratchAuto;
        if (isScratchAuto) runScratchAuto();
        updateScratchUI();
    });
}

let scratchAutoTimer = null;
let scratchSpeed = 1;
function runScratchAuto() {
    if (!isScratchAuto) return;
    const sc = state.scratchCard;
    if (!sc || !sc.currentCard) {
        scratchAutoTimer = setTimeout(runScratchAuto, 1000);
        return;
    }

    if (sc.currentCard.isCompleted) {
        scratchAutoTimer = setTimeout(() => {
            worker.postMessage({ type: 'SCRATCH_CARD_PICK', payload: { index: -1 } });
            runScratchAuto();
        }, Math.max(10, Math.round(1500 / scratchSpeed)));
    } else {
        const hidden = [];
        for (let i = 0; i < 12; i++) {
            if (!sc.currentCard.revealed.includes(i)) hidden.push(i);
        }
        if (hidden.length > 0) {
            const rand = hidden[Math.floor(Math.random() * hidden.length)];
            worker.postMessage({ type: 'SCRATCH_CARD_PICK', payload: { index: rand } });
        }
        scratchAutoTimer = setTimeout(runScratchAuto, Math.max(5, Math.round(500 / scratchSpeed)));
    }
}

