// Game Configuration
const BOARD_SIZE = 52;
let INITIAL_CAPITAL = 5000;

// Game State
let state = {
    turn: 0,
    position: 0,
    money: INITIAL_CAPITAL,
    logs: [],
    properties: []
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
    btnImport: document.getElementById('btn-import'),
    configInput: document.getElementById('config-input'),
    logContainer: document.getElementById('log-container'),
    // Stats Panel
    statsContent: document.getElementById('stats-content'),
    statsTotalMoves: document.getElementById('stats-total-moves')
};

// Embedded Config for Local Execution (CORS Workaround)
// Embedded Config for Local Execution (CORS Workaround)
const DEFAULT_CONFIG_CSV = `id,icon,type,name,base_value,upgrade_cost,probability,color_class
0,🚩,GO,GO,2000,0,1,text-neon-pink font-black
1,💰,SMALL_GOLD,小獎勵,500,0,1,text-yellow-300
2,🏢,PROPERTY,稅務局,-500,0,1,text-red-400
3,🎲,PROPERTY,命運,-200,0,1,text-purple-400
4,🏠,PROPERTY,地產 A,120,0,1,text-neon-blue
5,🏡,PROPERTY,地產 B,120,0,1,text-neon-blue
6,💎,BIG_GOLD,大寶藏,2000,0,1,text-yellow-500 font-bold
7,✈️,AIRPORT,機場 A,1000,0,0.5,text-yellow-400
8,🏢,PROPERTY,地產 C,150,0,1,text-neon-blue
9,🚧,PROPERTY,過路費,-100,0,1,text-red-400
10,🏢,PROPERTY,地產 D,150,0,1,text-neon-blue
11,💰,SMALL_GOLD,小獎勵,500,0,1,text-yellow-300
12,🏢,PROPERTY,地產 E,180,0,1,text-neon-blue
13,⛓️,JAIL,監獄,0,0,1,text-gray-500
14,🏢,PROPERTY,地產 F,200,0,1,text-neon-blue
15,🏢,PROPERTY,地產 G,200,0,1,text-neon-blue
16,💎,BIG_GOLD,大寶藏,2000,0,1,text-yellow-500 font-bold
17,🏢,PROPERTY,地產 H,220,0,1,text-neon-blue
18,🏢,PROPERTY,地產 I,220,0,1,text-neon-blue
19,🏢,PROPERTY,地產 J,220,0,1,text-neon-blue
20,✈️,AIRPORT,機場 B,1500,0,0.4,text-yellow-400
21,🏢,PROPERTY,地產 K,250,0,1,text-neon-blue
22,💰,SMALL_GOLD,小獎勵,500,0,1,text-yellow-300
23,🏢,PROPERTY,地產 L,250,0,1,text-neon-blue
24,🏢,PROPERTY,地產 M,280,0,1,text-neon-blue
25,🏢,PROPERTY,地產 N,280,0,1,text-neon-blue
26,🅿️,PARKING,停車場,0,0,1,text-white
27,🏢,PROPERTY,地產 O,300,0,1,text-neon-blue
28,🏢,PROPERTY,地產 P,300,0,1,text-neon-blue
29,💎,BIG_GOLD,大寶藏,2000,0,1,text-yellow-500 font-bold
30,🏢,PROPERTY,地產 Q,320,0,1,text-neon-blue
31,🏢,PROPERTY,地產 R,320,0,1,text-neon-blue
32,🏢,PROPERTY,地產 S,320,0,1,text-neon-blue
33,✈️,AIRPORT,機場 C,2000,0,0.3,text-yellow-400
34,🏢,PROPERTY,地產 T,350,0,1,text-neon-blue
35,💰,SMALL_GOLD,小獎勵,500,0,1,text-yellow-300
36,🏢,PROPERTY,地產 U,350,0,1,text-neon-blue
37,🏢,PROPERTY,地產 V,380,0,1,text-neon-blue
38,🏢,PROPERTY,地產 W,380,0,1,text-neon-blue
39,👮,GOTOJAIL,入獄,0,0,1,text-red-500
40,🏢,PROPERTY,地產 X,400,0,1,text-neon-blue
41,🏢,PROPERTY,地產 Y,400,0,1,text-neon-blue
42,💎,BIG_GOLD,大寶藏,2000,0,1,text-yellow-500 font-bold
43,🏢,PROPERTY,地產 Z,420,0,1,text-neon-blue
44,🏢,PROPERTY,地產 AA,420,0,1,text-neon-blue
45,🏢,PROPERTY,地產 AB,420,0,1,text-neon-blue
46,✈️,AIRPORT,機場 D,2500,0,0.2,text-yellow-400
47,🏢,PROPERTY,地產 AC,450,0,1,text-neon-blue
48,💰,SMALL_GOLD,小獎勵,500,0,1,text-yellow-300
49,🏢,PROPERTY,地產 AD,450,0,1,text-neon-blue
50,🏢,PROPERTY,地產 AE,480,0,1,text-neon-blue
51,🏢,PROPERTY,地產 AF,480,0,1,text-neon-blue`;

// Initialization
async function initGame() {
    state.turn = 0;
    state.position = 0;
    state.money = INITIAL_CAPITAL;
    state.logs = [];
    state.tileVisits = new Array(BOARD_SIZE).fill(0); // Reset stats

    // 1. Try Load Config from external CSV (Works if hosted on server)
    try {
        const response = await fetch('board_config.csv');
        if (response.ok) {
            const csvText = await response.text();
            state.properties = parseCSV(csvText);
            logEvent("SYSTEM", "成功讀取外部設定檔 (board_config.csv)");
        } else {
            throw new Error("Fetch failed");
        }
    } catch (e) {
        // 2. Fallback to Embedded Config (Local file execution)
        console.log("Local file mode detected. Using embedded Default.");
        state.properties = parseCSV(DEFAULT_CONFIG_CSV);
        logEvent("SYSTEM", "已載入預設設定。欲自訂請點擊「匯入」。");
    }

    // Resize visit array if board size differs (just in case)
    if (state.properties.length !== state.tileVisits.length) {
        state.tileVisits = new Array(state.properties.length).fill(0);
    }

    renderBoard();
    updateUI();
    updateStatsUI(); // Initial Empty Render

    updatePlayerPosition(0);
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].trim().split(',');

    // Skip header, map rows
    return lines.slice(1).map(line => {
        const values = line.trim().split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h.trim()] = values[i].trim());

        // Convert types
        return {
            id: parseInt(obj.id),
            icon: obj.icon || '⬛', // Default icon if missing
            type: obj.type,
            name: obj.name,
            base_value: parseInt(obj.base_value) || 0,
            upgrade_cost: parseInt(obj.upgrade_cost) || 0,
            probability: parseFloat(obj.probability) || 1.0,
            color: obj.color_class || 'text-white',
            level: 0,
            maxLevel: 5
        };
    });
}

// Grid Helper for 52 Tiles (14x14)
function getGridPos(index) {
    if (index <= 13) return { r: 14, c: 14 - index };
    if (index <= 26) return { r: 14 - (index - 13), c: 1 };
    if (index <= 39) return { r: 1, c: 1 + (index - 26) };
    return { r: 1 + (index - 39), c: 14 };
}

function renderBoard() {
    const centerPanel = ui.board.querySelector('.absolute.inset-\\[13\\%\\]');
    ui.board.innerHTML = '';
    ui.board.appendChild(centerPanel);

    state.properties.forEach((tile, i) => {
        const pos = getGridPos(i);
        const el = document.createElement('div');

        // Extract color name from text class (e.g. "text-neon-blue" -> "neon-blue")
        // Default to 'white' if not found
        const colorMatch = tile.color.match(/text-([a-zA-Z0-9-]+)/);
        const baseColor = colorMatch ? colorMatch[1] : 'white';

        // Vibe Style: Colored border & subtle BG
        // Note: Tailwind CDN scans DOM, so dynamic classes work but need to be valid standard or config colors
        el.className = `tile border-b-4 border-${baseColor} bg-${baseColor}/10 hover:bg-${baseColor}/20 rounded flex flex-col items-center justify-center relative cursor-pointer group transition-all duration-300`;
        // Fallback for custom theme colors if border-X doesn't work automatically via string interp
        if (baseColor.startsWith('neon')) {
            el.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue(`--color-${baseColor}`);
            // Note: In Tailwind config we defined colors directly, so standard mapping should work
        }

        el.style.gridRow = pos.r;
        el.style.gridColumn = pos.c;
        el.id = `tile-${i}`;

        // Use Icon from CSV
        const icon = tile.icon;

        let content;
        if (tile.type === 'PROPERTY') {
            // Upgrades removed, simple display for Property
            content = `<div class="font-bold ${tile.color} text-[10px]">${icon} ${tile.name}</div>
                        <div class="text-[9px] text-gray-400 mt-1">$${tile.base_value}</div>`;
        } else {
            // Non-property: Icon only, larger
            content = `<div class="font-bold ${tile.color} text-xl" title="${tile.name}">${icon}</div>`;
        }

        el.innerHTML = content;
        ui.board.appendChild(el);
    });

    const marker = document.createElement('div');
    marker.id = 'player-marker';
    marker.className = 'player-marker';
    ui.board.appendChild(marker);
}

function rollDice() {
    // 2 Dice (2d6), Range: 2-12, Bell Curve Probability
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return d1 + d2;
}

// Movement Logic
// Movement Logic
// Movement Logic
async function execTurn(isAuto = false) {
    const steps = rollDice();
    // Only update dice visual if not in super-fast auto mode (or maybe just skip for performance)
    if (!isAuto) ui.diceVisual.textContent = steps;

    state.turn++; // Increment turn

    if (isAuto) {
        const prevPos = state.position;
        state.position = (prevPos + steps) % BOARD_SIZE;

        if (state.position < prevPos && prevPos + steps >= BOARD_SIZE) {
            addMoney(2000, "PASS_GO", "經過起點，獲得 $2000");
        }

        // Fast update: Update data ONLY, skip heavy DOM rendering
        // updatePlayerPosition(state.position); // Skip marker update in auto

        // Manual stat track
        if (!state.tileVisits[state.position]) state.tileVisits[state.position] = 0;
        state.tileVisits[state.position]++;

        handleTileEvent(state.position);
        // updateUI(); // Skip general UI update
        // updateStatsUI(); // Skip stats table update

    } else {
        // Normal Mode (Slow)
        for (let i = 0; i < steps; i++) {
            state.position = (state.position + 1) % BOARD_SIZE;

            if (state.position === 0) {
                addMoney(2000, "PASS_GO", "經過起點，獲得 $2000");
                updateUI();
            }

            updatePlayerPosition(state.position);
            await new Promise(r => setTimeout(r, 100)); // Animation delay
        }

        updateStatsUI(); // Update stats at end of turn
        handleTileEvent(state.position);
        updateUI();
        ui.diceVisual.textContent = steps;
    }
}

function updatePlayerPosition(index) {
    const pos = getGridPos(index);
    const marker = document.getElementById('player-marker');
    marker.style.gridRow = pos.r;
    marker.style.gridColumn = pos.c;

    document.querySelectorAll('.tile-active').forEach(el => el.classList.remove('tile-active'));
    const tile = document.getElementById(`tile-${index}`);
    if (tile) tile.classList.add('tile-active');

    // Track stats
    if (state.turn > 0) {
        if (!state.tileVisits[index]) state.tileVisits[index] = 0; // Safety init
        state.tileVisits[index]++;
        // Remove updateStatsUI call here to avoid double render in loop, let execTurn handle it
    }
}

function addMoney(amount, reason, desc) {
    state.money += amount;
    recordLog({ turn: state.turn, position: state.position, event: reason, delta_gold: amount, current_balance: state.money, detail: desc });
}

function handleTileEvent(pos) {
    const tile = state.properties[pos];

    if (tile.type === 'PROPERTY') {
        const val = tile.base_value;
        if (val !== 0) {
            // Positive = Income, Negative = Expense
            const type = val > 0 ? "INCOME" : "EXPENSE";
            const msg = val > 0 ? `獲得收益 $${val}` : `支付費用 $${Math.abs(val)}`;
            addMoney(val, type, `${msg} (${tile.name})`);
        }
    } else if (tile.type === 'SMALL_GOLD') {
        addMoney(tile.base_value, "SMALL_GOLD", `Small Gold! +$${tile.base_value}`);
    } else if (tile.type === 'BIG_GOLD') {
        addMoney(tile.base_value, "BIG_GOLD", `Big Gold! +$${tile.base_value}`);
    } else if (tile.type === 'AIRPORT') {
        // Probability Check for Reward
        if (Math.random() <= tile.probability) {
            addMoney(tile.base_value, "AIRPORT", `機場補助！獲得 $${tile.base_value}`);
        } else {
            recordLog({ turn: state.turn, position: pos, event: 'AIRPORT_FAIL', delta_gold: 0, current_balance: state.money, detail: `機場未發放補助 (機率 ${tile.probability * 100}%)` });
        }
    } else if (tile.type === 'GOTOJAIL') {
        recordLog({ turn: state.turn, position: pos, event: 'JAIL', delta_gold: 0, current_balance: state.money, detail: "被抓進監獄！" });
    }
}

function renderTileLevel(index, level) {
    const container = document.getElementById(`lvl-${index}`);
    if (!container) return;
    const dots = container.querySelectorAll('.tile-lvl-dot');
    dots.forEach((dot, i) => {
        if (i < level) dot.classList.add('active');
    });
}

function recordLog(data, type) {
    // Legacy support for calls without type object
    // function recordLog(data) { ... }
    state.logs.push({ ...data, timestamp: new Date().toISOString() });

    const div = document.createElement('div');
    div.className = 'flex gap-2 log-entry-enter hover:bg-white/5 p-1 rounded';

    let color = 'text-gray-400';
    if (data.delta_gold > 0) color = 'text-neon-green';
    if (data.delta_gold < 0) color = 'text-neon-pink';

    div.innerHTML = `
        <span class="text-gray-600 w-6">#${data.turn}</span>
        <span class="flex-1 text-gray-300 truncate">${data.detail}</span>
        <span class="${color} font-bold text-xs">${data.delta_gold !== 0 ? (data.delta_gold > 0 ? '+' : '') + data.delta_gold : ''}</span>
    `;
    ui.logContainer.prepend(div);
    if (ui.logContainer.children.length > 50) ui.logContainer.lastElementChild.remove();
}

// legacy wrapper for logEvent calls in code
function logEvent(type, detail) {
    recordLog({
        turn: state.turn,
        position: state.position,
        event: type,
        delta_gold: 0,
        current_balance: state.money,
        detail: detail
    });
}


function updateUI() {
    ui.money.textContent = state.money.toLocaleString();
    ui.turn.textContent = state.turn;
}

// Stats Logic - Permanent Update
// Stats Logic - Permanent Update
function updateStatsUI() {
    if (!state.tileVisits || state.tileVisits.length === 0) {
        ui.statsContent.innerHTML = '<div class="p-4 text-center text-gray-500 text-xs">暫無數據 (Wait for roll...)</div>';
        ui.statsTotalMoves.textContent = "0";
        return;
    }

    const totalVisits = state.tileVisits.reduce((a, b) => a + b, 0);
    ui.statsTotalMoves.textContent = totalVisits;

    // Aggregation Groups
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

    // Accumulate Counts
    state.properties.forEach((tile, i) => {
        const type = tile.type;
        const visits = state.tileVisits[i] || 0;

        if (groups[type]) {
            groups[type].count += visits;
        } else {
            // Fallback for unknown types
            if (!groups['OTHER']) groups['OTHER'] = { name: '其他', icon: '❓', count: 0, color: 'text-gray-400' };
            groups['OTHER'].count += visits;
        }
    });

    // Convert to Array & Sort
    const stats = Object.values(groups)
        .filter(g => g.count > 0) // Optional: Hide types with 0 visits? Or keep showing 0? User might prefer seeing all types.
        .map(group => ({
            ...group,
            percent: totalVisits > 0 ? ((group.count / totalVisits) * 100).toFixed(2) : "0.00"
        }))
        .sort((a, b) => b.count - a.count);

    ui.statsContent.innerHTML = stats.map((item, rank) => `
        <div class="grid grid-cols-12 gap-1 px-3 py-1.5 hover:bg-white/5 border-b border-white/5 items-center text-[11px] group">
            <div class="col-span-1 text-gray-500 font-mono">#${rank + 1}</div>
            <div class="col-span-7 flex items-center gap-2 overflow-hidden">
                <span class="text-base">${item.icon}</span>
                <span class="${item.color.split(' ')[0]} font-medium truncate">${item.name}</span>
            </div>
            <div class="col-span-2 text-right font-mono text-white group-hover:text-neon-green transition-colors">${item.count}</div>
            <div class="col-span-2 text-right font-mono text-gray-400">
                <span class="text-[10px]">${item.percent}%</span>
            </div>
        </div>
    `).join('');
}

function exportCSV() {
    if (state.logs.length === 0) return alert("無紀錄可匯出");
    const headers = ['turn', 'position', 'event', 'delta_gold', 'current_balance', 'timestamp'];
    const csv = headers.join(",") + "\n" + state.logs.map(r => headers.map(h => r[h]).join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monopoly_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

// Bindings
ui.btnRoll.addEventListener('click', () => {
    if (!ui.btnRoll.disabled) execTurn(false);
});

const originalExecTurn = execTurn;
execTurn = async (isAuto) => {
    if (ui.btnRoll.disabled && !isAuto) return;
    if (!isAuto) ui.btnRoll.disabled = true;

    await originalExecTurn(isAuto);

    if (!isAuto) ui.btnRoll.disabled = false;
};

// Stop Logic
let autoRollInterval = null;
let isAutoRolling = false;

ui.btnStop = document.getElementById('btn-stop');
ui.autoProgress = document.getElementById('auto-progress');
ui.btnFast = document.getElementById('btn-fast');

ui.btnStop.addEventListener('click', () => {
    isAutoRolling = false; // Flag to stop loop
});

// Fast Simulation (Instant)
ui.btnFast.addEventListener('click', async () => {
    const count = parseInt(ui.autoCount.value);

    // Disable Controls
    ui.btnFast.disabled = true;
    ui.btnAuto.disabled = true;
    ui.btnRoll.disabled = true;
    ui.autoCount.disabled = true;

    // Use setTimeout to allow UI to render "disabled" state before freezing
    setTimeout(async () => {
        const batchSize = 100;
        let completed = 0;

        // Chunking to prevent complete browser freeze on valid large numbers
        const runBatch = async () => {
            const limit = Math.min(completed + batchSize, count);
            for (let i = completed; i < limit; i++) {
                await execTurn(true);
            }
            completed = limit;

            if (completed < count) {
                setTimeout(runBatch, 0);
            } else {
                // Done
                updateUI();
                updateStatsUI();
                updatePlayerPosition(state.position);

                ui.btnFast.disabled = false;
                ui.btnAuto.disabled = false;
                ui.btnRoll.disabled = false;
                ui.autoCount.disabled = false;

                logEvent("SYSTEM", `一鍵完成 ${count} 次擲骰計算。`);
                alert(`一鍵完成 ${count} 次！`);
            }
        };
        runBatch();
    }, 50);
});

ui.btnAuto.addEventListener('click', async () => {
    const count = parseInt(ui.autoCount.value);

    // UI State: Running
    isAutoRolling = true;
    ui.btnAuto.classList.add('hidden');
    ui.btnStop.classList.remove('hidden');
    ui.btnFast.disabled = true; // Disable fast button
    ui.btnRoll.disabled = true;
    ui.autoCount.disabled = true;
    ui.autoProgress.classList.remove('hidden');

    let current = 0;

    const runStep = async () => {
        if (!isAutoRolling || current >= count) {
            // Stop or Finished
            endAutoRoll(current >= count);
            return;
        }

        current++;
        ui.autoProgress.textContent = `${current} / ${count}`;

        // Logic Step
        // Use originalExecTurn(false) to simulate manual play with animation
        // Bypassing the execTurn wrapper which blocks execution when disabled
        await originalExecTurn(false);

        // UI updates are handled inside originalExecTurn(false), so we only update progress here
        // (No need to call updateUI or updateStatsUI again)

        // Delay for visual effect
        setTimeout(runStep, 200);
    };

    runStep();
});

function endAutoRoll(finished) {
    isAutoRolling = false;
    ui.btnAuto.classList.remove('hidden');
    ui.btnStop.classList.add('hidden');
    ui.btnFast.disabled = false; // Re-enable fast button
    ui.btnRoll.disabled = false;
    ui.autoCount.disabled = false;
    ui.autoProgress.classList.add('hidden');

    if (finished) {
        alert("自動擲骰完成！");
    } else {
        logEvent("SYSTEM", "使用者手動停止自動擲骰");
    }
}

ui.btnExport.addEventListener('click', exportCSV);

// Import Logic
ui.btnImport.addEventListener('click', () => ui.configInput.click());
ui.configInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            state.properties = parseCSV(text);
            state.turn = 0;
            state.position = 0;
            state.money = INITIAL_CAPITAL;
            state.logs = [];
            state.tileVisits = new Array(state.properties.length).fill(0); // Reset stats
            ui.logContainer.innerHTML = '';

            renderBoard();
            updateUI();
            updatePlayerPosition(0);
            updateStatsUI(); // Clear stats UI

            logEvent("SYSTEM", `成功匯入設定檔：${file.name}`);
            alert(`設定檔 ${file.name} 載入成功！遊戲已重置。`);
        } catch (err) {
            console.error(err);
            alert("設定檔格式錯誤！請檢查 CSV 格式。");
        }
    };
    reader.readAsText(file, 'UTF-8');
});

initGame();
