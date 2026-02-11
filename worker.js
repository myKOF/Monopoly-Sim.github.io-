// Game Configuration (Duplicated for Worker)
const BOARD_SIZE = 52;
let INITIAL_CAPITAL = 5000;

// Worker State
let state = {
    turn: 0,
    position: 0,
    money: INITIAL_CAPITAL,
    logs: [],
    properties: [], // Receives from Main Thread
    extraObjects: new Set(),
    collection: { level: 1, points: 0, totalCollected: 0, config: [] },
    tileVisits: new Array(BOARD_SIZE).fill(0),
    isRunning: false,
    autoRollTimer: null,
    rollCount: 0,
    targetRollCount: 0,
    mode: 'IDLE' // IDLE, AUTO_PLAY, FAST_SIM
};

// --- Message Handling ---
self.onmessage = function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT_GAME':
            state.properties = payload.properties;
            state.collection.config = payload.collectionConfig;
            // Reset state
            state.turn = 0;
            state.position = 0;
            state.money = INITIAL_CAPITAL;
            state.logs = [];
            state.tileVisits = new Array(state.properties.length).fill(0);
            state.extraObjects.clear();
            state.collection.level = 1;
            state.collection.points = 0;
            state.collection.totalCollected = 0;
            sendUpdate();
            break;

        case 'START_AUTO_PLAY': // Visual Mode
            state.targetRollCount = payload.count || Infinity;
            state.rollCount = 0;
            state.mode = 'AUTO_PLAY'; // New State
            execTurn(true); // Run first turn, then wait for NEXT_TURN
            break;

        case 'START_FAST_SIM': // Background/Fast Mode
            state.targetRollCount = payload.count || Infinity;
            state.rollCount = 0;
            state.mode = 'FAST_SIM';
            startFastLoop();
            break;

        case 'NEXT_TURN': // Triggered by UI after animation
            if (state.mode === 'AUTO_PLAY') {
                if (state.rollCount < state.targetRollCount) {
                    execTurn(true);
                } else {
                    stopAutoRoll(true);
                }
            }
            break;

        case 'STOP_AUTO':
            stopAutoRoll(false);
            break;

        case 'EXEC_TURN':
            execTurn(false);
            break;

        case 'GEN_EXTRA':
            generateExtraObjects(payload.count);
            break;
    }
};

// --- Core Logic ---

function startFastLoop() {
    if (state.mode !== 'FAST_SIM') return;

    // Web Worker can use setInterval/setTimeout without throttling in background tabs
    function loop() {
        if (state.mode !== 'FAST_SIM') return;

        if (state.rollCount >= state.targetRollCount) {
            stopAutoRoll(true);
            return;
        }

        execTurn(true);
        state.rollCount++;
        // Fast loop doesn't wait for UI
        state.autoRollTimer = setTimeout(loop, 10); // Very fast
    }
    loop();
}

function stopAutoRoll(finished) {
    state.mode = 'IDLE';
    clearTimeout(state.autoRollTimer);
    self.postMessage({ type: 'AUTO_STOPPED', payload: { finished } });
}

function rollDice() {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return d1 + d2;
}

function execTurn(isAuto) {
    state.rollCount++;
    const steps = rollDice();
    state.turn++;

    const prevPos = state.position;
    state.position = (prevPos + steps) % BOARD_SIZE;

    // Pass GO logic
    if (state.position < prevPos && prevPos + steps >= BOARD_SIZE) {
        addMoney(2000, "PASS_GO", "經過起點，獲得 $2000");
    }

    // Tile Visits
    if (!state.tileVisits[state.position]) state.tileVisits[state.position] = 0;
    state.tileVisits[state.position]++;

    // Events
    handleTileEvent(state.position);

    // Send Update to Main Thread
    sendUpdate(steps, isAuto);
}

function addMoney(amount, reason, desc) {
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

function recordLog(data) {
    // We only keep the last 50 logs in state to save memory/bandwidth
    // logic is similar to main thread
    const logEntry = { ...data, timestamp: new Date().toISOString() };
    state.logs.push(logEntry);
    if (state.logs.length > 50) state.logs.shift(); // Keep last 50 in memory
}

function handleTileEvent(pos) {
    if (!state.properties || !state.properties[pos]) return;

    const tile = state.properties[pos];

    checkCollectionEvent(pos);

    if (tile.type === 'PROPERTY') {
        const val = tile.price;
        if (val !== 0) {
            const type = val > 0 ? "INCOME" : "EXPENSE";
            const msg = val > 0 ? `獲得收益 $${val}` : `支付費用 $${Math.abs(val)}`;
            addMoney(val, type, `${msg} (${tile.name})`);
        }
    } else if (tile.type === 'SMALL_GOLD') {
        addMoney(tile.price, "SMALL_GOLD", `Small Gold! +$${tile.price}`);
    } else if (tile.type === 'BIG_GOLD') {
        addMoney(tile.price, "BIG_GOLD", `Big Gold! +$${tile.price}`);
    } else if (tile.type === 'AIRPORT') {
        if (Math.random() <= tile.probability) {
            addMoney(tile.price, "AIRPORT", `機場補助！獲得 $${tile.price}`);
        } else {
            recordLog({ turn: state.turn, position: pos, event: 'AIRPORT_FAIL', delta_gold: 0, current_balance: state.money, detail: `機場未發放補助 (機率 ${tile.probability * 100}%)` });
        }
    } else if (tile.type === 'GOTOJAIL') {
        recordLog({ turn: state.turn, position: pos, event: 'JAIL', delta_gold: 0, current_balance: state.money, detail: "被抓進監獄！" });
    }
}

function checkCollectionEvent(pos) {
    // Logic copied from script.js
    if (state.extraObjects.has(pos)) {
        state.collection.points++;
        state.collection.totalCollected = (state.collection.totalCollected || 0) + 1;

        const currentConfig = state.collection.config.find(c => c.level === state.collection.level);
        if (!currentConfig) return;

        if (state.collection.points >= currentConfig.required) {
            state.collection.points -= currentConfig.required;
            state.collection.level++;
            addMoney(currentConfig.gold, "EVENT_REWARD", `活動升級 Lv.${state.collection.level - 1} -> Lv.${state.collection.level}! ${currentConfig.desc}`);
        }
    }
}

function generateExtraObjects(count) {
    state.extraObjects.clear();
    const available = [];
    for (let i = 0; i < state.properties.length; i++) available.push(i);

    // Shuffle
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }

    let added = 0;
    for (const idx of available) {
        if (added >= count) break;
        const next = (idx + 1) % state.properties.length;
        const prev = (idx - 1 + state.properties.length) % state.properties.length;

        if (!state.extraObjects.has(next) && !state.extraObjects.has(prev)) {
            state.extraObjects.add(idx);
            added++;
        }
    }

    // Log comes from worker now
    recordLog({
        turn: state.turn,
        position: state.position,
        event: "SYSTEM",
        delta_gold: 0,
        current_balance: state.money,
        detail: `生成了 ${added} 個額外物件 (🍦) [間距規則已啟用]`
    });

    sendUpdate(0, true); // Treat extra object gen as "Auto" (instant update)
}

function sendUpdate(lastDiceRoll = 0, isAuto = false) {
    // Send a snapshot of the state to the main thread
    self.postMessage({
        type: 'UPDATE_UI',
        payload: {
            turn: state.turn,
            position: state.position,
            money: state.money,
            logs: state.logs, // Send full logs or delta? Full for simplicity now
            tileVisits: state.tileVisits,
            extraObjects: Array.from(state.extraObjects),
            collection: state.collection,
            diceRoll: lastDiceRoll,
            isAuto: isAuto
        }
    });
}

