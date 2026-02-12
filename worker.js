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
    mode: 'IDLE', // IDLE, AUTO_PLAY, FAST_SIM
    logId: 0,
    dice: 1000,
    multiplier: 1,
    systemConfig: {} // [NEW] Store system config here
};

// --- Message Handling ---
self.onmessage = function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT_GAME':
            state.properties = payload.properties;
            state.collection.config = payload.collectionConfig;
            // [NEW] Load System Config
            if (payload.systemConfig) {
                state.systemConfig = payload.systemConfig;
            }

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
            state.dice = 1000;
            state.multiplier = 1;
            sendUpdate();
            break;

        case 'UPDATE_CONFIG': // New: Handle Dice/Multiplier updates from UI
            if (payload.dice !== undefined) state.dice = payload.dice;
            if (payload.multiplier !== undefined) state.multiplier = payload.multiplier;
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

        case 'ADD_MONEY':
            addMoney(payload.amount, payload.reason || "BONUS", payload.desc || "Bonus");
            sendUpdate();
            break;

        case 'RESET_STATS':
            state.tileVisits.fill(0);
            state.collection.totalCollected = 0;
            sendUpdate();
            break;

        case 'CLEAR_LOGS':
            state.logs = [];
            state.logId = 0;
            // No update needed, UI already cleared
            break;

        case 'EXPORT_LOGS':
            // Send all logs back to UI for download
            self.postMessage({
                type: 'EXPORT_DATA',
                payload: { logs: state.logs }
            });
            break;
    }
};

// --- Core Logic ---

function startFastLoop() {
    if (state.mode !== 'FAST_SIM') return;

    // Web Worker can use setInterval/setTimeout without throttling in background tabs
    function loop() {
        if (state.mode !== 'FAST_SIM') return;

        // Batch Processing: Run 500 turns per tick
        for (let i = 0; i < 500; i++) {
            if (state.rollCount >= state.targetRollCount) {
                sendUpdate(0, true);
                stopAutoRoll(true);
                return;
            }
            execTurn(true, true);
            state.rollCount++;
        }

        // Send Progress every 1% or at least every 100 turns
        if (state.rollCount % 500 === 0) { // Sync with batch size
            const pct = Math.floor((state.rollCount / state.targetRollCount) * 100);
            self.postMessage({ type: 'PROGRESS', payload: { percent: pct } });
        }


        // Fast loop doesn't wait for UI
        state.autoRollTimer = setTimeout(loop, 0); // Minimal delay
    }
    loop();
}

function stopAutoRoll(finished) {
    state.mode = 'IDLE';
    clearTimeout(state.autoRollTimer);
    self.postMessage({ type: 'AUTO_STOPPED', payload: { finished } });
}

function rollDice() {
    // [NEW] Weighted Logic
    const result = calculateNextStep();
    return result.steps;
}

function calculateNextStep() {
    // 1. Identify candidates (2-12 steps ahead)
    const candidates = [];
    const currentPos = state.position;

    for (let step = 2; step <= 12; step++) {
        const nextPos = (currentPos + step) % BOARD_SIZE;
        let weight = 100; // Default

        // Check for specific weight config on tile
        if (state.properties[nextPos] && state.properties[nextPos].weight) {
            weight = state.properties[nextPos].weight;
        }

        // Check for Extra Object (Override)
        if (state.extraObjects.has(nextPos)) {
            if (state.systemConfig && state.systemConfig.Collect_Item_Weight) {
                weight = state.systemConfig.Collect_Item_Weight;
            } else {
                weight = 200; // Default if config missing
            }
        }

        candidates.push({ step, pos: nextPos, weight });
    }

    // 2. Weighted Random Selection
    const totalWeight = candidates.reduce((a, b) => a + b.weight, 0);
    let random = Math.random() * totalWeight;
    let selected = candidates[0];

    for (const candidate of candidates) {
        random -= candidate.weight;
        if (random <= 0) {
            selected = candidate;
            break;
        }
    }

    // 3. Log the decision (Detailed)
    // Only log if we are not in FAST_SIM to avoid spamming memory, or log sparingly?
    // Let's log but maybe with a special flag or just standard log. 
    // Given the requirement "Detailed log entry showing the decision process", we should add it.
    // However, too much logging crashes browser. Let's log only if it's a "Significant" choice or just simple log.

    // Let's log it as a debug/system event 
    // "Target: #5 (Weight: 200), Total: 1500"

    // To avoid spam, we might not want to log EVERY roll details to the UI log, 
    // unless it's a special event. But user asked for it.
    // Let's add a property to the returned object so execTurn can log it if needed.

    return { steps: selected.step, details: selected };
}

function execTurn(isAuto, silent = false) {
    // Check Dice Shortage
    if ((state.dice || 0) < (state.multiplier || 1)) {
        recordLog({
            turn: state.turn,
            position: state.position,
            event: "SYSTEM",
            delta_gold: 0,
            current_balance: state.money,
            detail: `骰子不足！ (需 ${state.multiplier}, 剩 ${state.dice})`
        });
        if (isAuto) stopAutoRoll(false);
        sendUpdate();
        return;
    }

    // Deduct Dice
    // console.log(`Consuming Dice: ${state.multiplier} (Current: ${state.dice})`);
    state.dice -= state.multiplier;

    state.rollCount++;
    const rollResult = rollDice(); // Now returns { steps, details } or just steps if we didn't update it fully? 
    // Wait, I updated rollDice to return number in previous step... NO, I returned object in my replacement content above.
    // "return { steps: selected.step, details: selected };"
    // So I need to handle that.

    let steps = 0;
    if (typeof rollResult === 'object') {
        steps = rollResult.steps;
        // Log decision if it's interesting or just always?
        // User said: "Add a detailed log entry showing the decision process"
        // Let's format a string
        const d = rollResult.details;
        // Example: "骰子判定: 目標 #15 (權重 200)"
        recordLog({
            turn: state.turn,
            position: state.position,
            event: "SYSTEM",
            delta_gold: 0,
            current_balance: state.money,
            detail: `系統判定: 目標格 #${d.pos} (權重 ${d.weight}, 步數 ${d.step})`
        });
    } else {
        steps = rollResult; // Fallback
    }

    state.turn++;

    const prevPos = state.position;
    state.position = (prevPos + steps) % BOARD_SIZE;

    // Pass GO logic
    if (state.position < prevPos && prevPos + steps >= BOARD_SIZE) {
        addMoney(2000 * state.multiplier, "PASS_GO", `經過起點，獲得 $${2000 * state.multiplier} (x${state.multiplier})`);
    }

    // Tile Visits
    if (!state.tileVisits[state.position]) state.tileVisits[state.position] = 0;
    state.tileVisits[state.position]++;

    // Events
    handleTileEvent(state.position);

    // Send Update to Main Thread
    if (!silent) sendUpdate(steps, isAuto);
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
    state.logId++;
    const logEntry = { ...data, timestamp: new Date().toISOString(), id: state.logId };
    state.logs.push(logEntry);
    if (state.logs.length > 50) state.logs.shift(); // Keep last 50 in memory
}

function handleTileEvent(pos) {
    if (!state.properties || !state.properties[pos]) return;

    const tile = state.properties[pos];
    const mult = state.multiplier; // Check Multiplier

    checkCollectionEvent(pos);

    if (tile.type === 'PROPERTY') {
        const val = tile.price * mult;
        if (val !== 0) {
            const type = val > 0 ? "INCOME" : "EXPENSE";
            const msg = val > 0 ? `獲得收益 $${val}` : `支付費用 $${Math.abs(val)}`;
            addMoney(val, type, `${msg} (x${mult}, ${tile.name})`);
        }
    } else if (tile.type === 'SMALL_GOLD') {
        const val = tile.price * mult;
        addMoney(val, "SMALL_GOLD", `Small Gold! +$${val} (x${mult})`);
    } else if (tile.type === 'BIG_GOLD') {
        const val = tile.price * mult;
        addMoney(val, "BIG_GOLD", `Big Gold! +$${val} (x${mult})`);
    } else if (tile.type === 'AIRPORT') {
        if (Math.random() <= tile.probability) {
            const val = tile.price * mult;
            addMoney(val, "AIRPORT", `機場補助！獲得 $${val} (x${mult})`);
        } else {
            recordLog({ turn: state.turn, position: pos, event: 'AIRPORT_FAIL', delta_gold: 0, current_balance: state.money, detail: `機場未發放補助 (機率 ${tile.probability * 100}%)` });
        }
    } else if (tile.type === 'GOTOJAIL') {
        recordLog({ turn: state.turn, position: pos, event: 'JAIL', delta_gold: 0, current_balance: state.money, detail: "被抓進監獄！" });
    }
}

function checkCollectionEvent(pos) {
    // Logic copied from script.js
    // 4. Extra Objects (Events)
    if (state.extraObjects.has(pos)) {
        // [FIX] Remove object upon collection as requested
        state.extraObjects.delete(pos);

        // [NEW] Use Collect_Item_Value from config, multiply by dice multiplier
        let baseValue = 3;
        if (state.systemConfig && state.systemConfig.Collect_Item_Value) {
            baseValue = state.systemConfig.Collect_Item_Value;
        }

        const points = baseValue * state.multiplier;
        state.collection.points += points;
        state.collection.totalCollected++;

        // Log Collection
        recordLog({
            turn: state.turn,
            position: pos,
            event: "COLLECT",
            delta_gold: 0,
            current_balance: state.money,
            detail: `獲得 ${points} 點數 (基礎 ${baseValue} x 倍率 ${state.multiplier})`
        });

        // [NEW] Respawn Logic
        respawnItem();

        let currentConfig = state.collection.config.find(c => c.level === state.collection.level);

        // Loop for multi-level up
        while (currentConfig && state.collection.points >= currentConfig.required) {
            state.collection.points -= currentConfig.required;
            state.collection.level++;

            // Reward
            const reward = currentConfig.gold * state.multiplier;
            addMoney(reward, "EVENT_REWARD", `活動升級 Lv.${state.collection.level - 1} -> Lv.${state.collection.level}! ${currentConfig.desc} (x${state.multiplier})`);

            // Update config for next iteration
            currentConfig = state.collection.config.find(c => c.level === state.collection.level);
        }
    }
}

function respawnItem() {
    const size = state.properties.length;
    const candidates = [];

    // Find all valid positions
    for (let i = 0; i < size; i++) {
        // Skip if occupied
        if (state.extraObjects.has(i)) continue;

        // Check adjacency
        const next = (i + 1) % size;
        const prev = (i - 1 + size) % size;

        if (state.extraObjects.has(next) || state.extraObjects.has(prev)) continue;

        // Passed checks
        candidates.push(i);
    }

    if (candidates.length > 0) {
        const idx = Math.floor(Math.random() * candidates.length);
        const newPos = candidates[idx];
        state.extraObjects.add(newPos);
        // Optional: Log respawn?
        // console.log(`Respawned item at ${newPos}`);
    } else {
        console.warn("No valid space to respawn item!");
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
    const uiName = (state.systemConfig && state.systemConfig.Collect_UI_Name) ? state.systemConfig.Collect_UI_Name : '特殊物件';
    recordLog({
        turn: state.turn,
        position: state.position,
        event: "SYSTEM",
        delta_gold: 0,
        current_balance: state.money,
        detail: `已生成 ${added} 個 ${uiName}`
    });

    sendUpdate();
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
            isAuto: isAuto,
            dice: state.dice, // Send back dice
            multiplier: state.multiplier // Send back multiplier
        }
    });
}

