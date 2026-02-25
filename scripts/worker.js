// Game Configuration (Duplicated for Worker)
const BOARD_SIZE = 52;
let INITIAL_CAPITAL = 5000;

// Worker State
let state = {
    turn: 0,
    position: 0,
    money: INITIAL_CAPITAL,
    gems: 0, // [NEW] Gem State
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
    dice: 10000,
    totalEarnedDice: 0, // [NEW] Track total earned dice
    totalSpentDice: 0, // [NEW] Track total spent dice
    earnedDiceBreakdown: {}, // [NEW] Track sources of earned dice { 'source': amount }
    spentDiceBreakdown: {}, // [NEW] Track sources of spent dice { 'source': amount }
    multiplier: 1,
    systemConfig: {},
    roulette: { level: 1, drawnCounts: [], config: {}, integral: { score: 0, level: 1 }, stats: { totalCoin: 0, totalGem: 0, totalDice: 0, landings: {}, tokensPerLevel: {} } },
    tournament: { integralConfig: [] },
    game2048: null // Initialize properly in START_GAME or INIT
};

// ... (Existing message handling) ...

function handleTileEvent(pos) {
    if (!state.properties || !state.properties[pos]) return;

    const tile = state.properties[pos];
    const mult = state.multiplier; // Check Multiplier

    checkCollectionEvent(pos);

    // [NEW] Unified Reward Logic
    // 1. Coins (Renamed from Price/BaseValue)
    const coinVal = (tile.coin || 0) * mult;
    if (coinVal !== 0) {
        const type = coinVal > 0 ? "INCOME" : "EXPENSE";
        const msg = coinVal > 0 ? `獲得收益 $${coinVal}` : `支付費用 $${Math.abs(coinVal)}`;
        addMoney(coinVal, type, `${msg} (x${mult}, ${tile.name})`);
    }

    // 2. Gems
    const gemVal = (tile.gem || 0) * mult;
    if (gemVal > 0) {
        state.gems += gemVal;
        recordLog({
            turn: state.turn,
            position: pos,
            event: "GEM",
            delta_gold: 0,
            current_balance: state.money,
            detail: `獲得寶石 ${gemVal} (x${mult})`
        });
    }

    // 3. Dice
    const diceVal = (tile.diceReward || 0) * mult;
    if (diceVal > 0) {
        state.dice += diceVal;
        state.totalEarnedDice += diceVal; // [NEW] Accumulate earned dice
        state.earnedDiceBreakdown['地圖獎勵'] = (state.earnedDiceBreakdown['地圖獎勵'] || 0) + diceVal; // [NEW] Aggregate breakdown
        recordLog({
            turn: state.turn,
            position: pos,
            event: "DICE",
            delta_gold: 0,
            current_balance: state.money,
            detail: `獲得骰子 ${diceVal} (x${mult})`
        });
    }

    // Special Events (Keep existing override logic if needed, or merge)
    // The new CSV values seem to replace hardcoded values for SMALL_GOLD, BIG_GOLD etc.
    // However, AIRPORT has probability logic.
    if (tile.type === 'AIRPORT') {
        if (Math.random() <= tile.probability) {
            // Airport Coin Bonus (using coin_value from CSV if set, else use system config or hardcode?)
            // The user set coin_value in CSV for AIRPORT.
            // If we already handled coinVal above, we might double count?
            // Accessing the CSV, AIRPORT has coin_value 1000/1500 etc.
            // BUT logic says "Airport Subsidy". Maybe it's ONLY if probability hits?
            // If so, we should ONLY award coinVal inside this block.

            // Revert coinVal addition above for AIRPORT? 
            // Actually, standard logic: `coin_value` is the reward.
            // If probability fails, we get 0. 
            // So we should deduct the `coinVal` calculated above from `addMoney` call?
            // Or better: Checking `tile.type` first.
        }
    }

    // Reworking handleTileEvent to rely on CSV values but respect special types
    // actually, let's keep the specific logic for AIRPORT/JAIL but use generic for others.
}
// Wait, I can't easily replace the whole function in one block if I'm thinking through it.
// Let's rewrite `handleTileEvent` to be cleaner.


// --- Message Handling ---
self.onmessage = function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT_GAME':
            state.properties = payload.properties;
            state.collection.config = payload.collectionConfig;
            state.systemConfig = payload.systemConfig || {};
            state.systemConfig.config2048 = payload.config2048 || [];
            state.systemConfig.config2048Integral = payload.config2048Integral || [];
            state.roulette.config = payload.rouletteConfig || {}; // [NEW]
            state.roulette.integralConfig = payload.rouletteIntegralConfig || []; // [NEW] Save integral config
            state.roulette.tokens = (state.systemConfig.Roulette_Token_Initial) ? state.systemConfig.Roulette_Token_Initial : 100; // Initialize Tokens
            state.roulette.integral = { score: 0, level: 1 };
            state.roulette.stats = { totalCoin: 0, totalGem: 0, totalDice: 0, landings: {}, tokensPerLevel: {} }; // [NEW] Stats Tracking

            state.isRunning = false;
            init2048State();
            // No sendUpdate here, as START_GAME will follow
            break;

        case 'START_GAME': // New: Separate from INIT_GAME for clearer reset
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
            state.dice = 10000;
            state.totalEarnedDice = 0; // Reset
            state.totalSpentDice = 0; // Reset
            state.earnedDiceBreakdown = {}; // Reset
            state.spentDiceBreakdown = {}; // Reset
            state.multiplier = 1;
            state.gems = 0; // Reset gems
            state.roulette.level = 1; // Reset roulette level
            state.roulette.drawnCounts = []; // Reset drawn items
            state.roulette.tokens = (state.systemConfig.Roulette_Token_Initial) ? state.systemConfig.Roulette_Token_Initial : 100; // Reset tokens
            state.roulette.integral = { score: 0, level: 1 };
            state.roulette.stats = { totalCoin: 0, totalGem: 0, totalDice: 0, landings: {}, tokensPerLevel: {} }; // [NEW] Stats Tracking

            // [NEW] 2048 Initialization
            init2048State();

            sendUpdate();

            // [NEW] Auto generate icons on game start based on config
            const initialCount = (state.systemConfig && state.systemConfig.Collect_Item_Count) ? state.systemConfig.Collect_Item_Count : 10;
            generateExtraObjects(initialCount);
            break;

        case 'UPDATE_CONFIG': // New: Handle Dice/Multiplier updates from UI
            if (payload.dice !== undefined) state.dice = payload.dice;
            if (payload.multiplier !== undefined) state.multiplier = payload.multiplier;
            if (payload.rouletteTokens !== undefined) state.roulette.tokens = payload.rouletteTokens; // [NEW] Sync Roulette Tokens
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

        case 'ADD_RESOURCES':
            if (payload.coin > 0) addMoney(payload.coin, payload.reason || "BONUS", payload.desc);
            const gemEvent = payload.gemEvent || "ROULETTE_GEM";
            const diceEvent = payload.diceEvent || "ROULETTE_DICE";
            const eventSourceName = payload.eventSourceName || '輪盤抽獎';
            if (payload.gem > 0) {
                state.gems += payload.gem;
                recordLog({ turn: state.turn, position: state.position, event: gemEvent, delta_gold: 0, current_balance: state.money, detail: payload.gemDesc || `大獎升級：寶石 ${payload.gem}` });
            }
            if (payload.dice > 0) {
                state.dice += payload.dice;
                state.totalEarnedDice += payload.dice; // Accumulate earned
                state.earnedDiceBreakdown[eventSourceName] = (state.earnedDiceBreakdown[eventSourceName] || 0) + payload.dice;
                recordLog({ turn: state.turn, position: state.position, event: diceEvent, delta_gold: 0, current_balance: state.money, detail: payload.diceDesc || `大獎升級：骰子 ${payload.dice}` });
            }
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

        case 'RESET_DICE_STATS':
            state.totalEarnedDice = 0;
            state.totalSpentDice = 0;
            state.earnedDiceBreakdown = {};
            state.spentDiceBreakdown = {};
            sendUpdate();
            break;

        case 'EXPORT_LOGS':
            // Send all logs back to UI for download
            self.postMessage({
                type: 'EXPORT_DATA',
                payload: { logs: state.logs }
            });
            break;

        case 'SPIN_ROULETTE':
            spinRoulette();
            break;
        case 'RESET_ROULETTE':
            state.roulette.level = 1;
            state.roulette.drawnCounts = [];
            state.roulette.tokens = (state.systemConfig && state.systemConfig.Roulette_Token_Initial) ? state.systemConfig.Roulette_Token_Initial : 100;
            state.roulette.integral = { score: 0, level: 1 };
            state.roulette.stats = { totalCoin: 0, totalGem: 0, totalDice: 0, landings: {}, tokensPerLevel: {} };

            // Broadcast new state immediately
            self.postMessage({
                type: 'UPDATE_UI',
                payload: {
                    turn: state.turn,
                    position: state.position,
                    money: state.money,
                    logs: state.logs,
                    tileVisits: state.tileVisits,
                    extraObjects: Array.from(state.extraObjects),
                    collection: state.collection,
                    diceRoll: 0,
                    isAuto: false,
                    dice: state.dice,
                    multiplier: state.multiplier,
                    gems: state.gems,
                    roulette: {
                        level: state.roulette.level,
                        drawnCounts: state.roulette.drawnCounts,
                        tokens: state.roulette.tokens,
                        integral: state.roulette.integral,
                        stats: state.roulette.stats
                    }
                }
            });
        case 'MOVE_2048':
            handle2048Event(payload);
            break;
    }
};

// ==========================================
// 2048 Logic Helpers
// ==========================================

function get2048ConfigValue(typeName, fallback) {
    if (!state.systemConfig || !state.systemConfig.raw) return fallback;
    const item = state.systemConfig.raw.find(row => row.type === typeName);
    return item ? parseFloat(item.value) : fallback;
}

function init2048State() {
    state.game2048 = {
        grid: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
        score: 0,
        stamina: 100, // Starting Stamina
        maxStamina: 100,
        nextStaminaTick: 0,
        maxUnlockedLevel: 1,
        claimedMilestones: [],
        isGameOver: false,
        stats: {
            totalStaminaUsed: 0,
            totalDiceEarned: 0,
            totalGemsEarned: 0,
            totalGoldEarned: 0
        }
    };
    // Spawn 2 initial tiles
    spawn2048Tile();
    spawn2048Tile();
}

function spawn2048Tile() {
    const empty = [];
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (state.game2048.grid[r][c] === 0) empty.push({ r, c });
        }
    }
    if (empty.length > 0) {
        const spot = empty[Math.floor(Math.random() * empty.length)];
        // 90% chance for level 1 (value 2), 10% for level 2 (value 4) 
        state.game2048.grid[spot.r][spot.c] = Math.random() < 0.9 ? 1 : 2;
        update2048MaxLevel(state.game2048.grid[spot.r][spot.c]);
    }
}

function update2048MaxLevel(level) {
    if (level > state.game2048.maxUnlockedLevel) {
        state.game2048.maxUnlockedLevel = level;

        // Only trigger rewards for Level 2 and above
        if (level >= 2 && state.systemConfig && state.systemConfig.config2048) {
            const rewardRow = state.systemConfig.config2048.find(r => r.level === level);
            if (rewardRow) {
                if (rewardRow.coin) {
                    addMoney(rewardRow.coin, 'EVENT_REWARD', `2048 合成 Lv.${level} 獎勵`);
                    state.game2048.stats.totalGoldEarned += rewardRow.coin;
                }
                if (rewardRow.gem) {
                    state.gems += rewardRow.gem;
                    state.game2048.stats.totalGemsEarned += rewardRow.gem;
                    recordLog({
                        turn: state.turn, position: state.position, event: "GEM", delta_gold: 0,
                        current_balance: state.money, detail: `2048 Lv.${level} 獎勵：寶石 ${rewardRow.gem}`
                    });
                }
                if (rewardRow.dice) {
                    state.dice += rewardRow.dice;
                    state.totalEarnedDice += rewardRow.dice;
                    state.game2048.stats.totalDiceEarned += rewardRow.dice;
                    state.earnedDiceBreakdown['2048首次合成'] = (state.earnedDiceBreakdown['2048首次合成'] || 0) + rewardRow.dice;
                    recordLog({
                        turn: state.turn, position: state.position, event: "DICE", delta_gold: 0,
                        current_balance: state.money, detail: `2048 Lv.${level} 獎勵：骰子 ${rewardRow.dice}`
                    });
                }
                recordLog({
                    turn: state.turn, position: state.position, event: "SYSTEM", delta_gold: rewardRow.coin || 0,
                    current_balance: state.money, detail: `解鎖 2048 Lv.${level} (${rewardRow.desc})`
                });
            }
        }
    }
}

function check2048Milestones() {
    if (!state.systemConfig || !state.systemConfig.config2048Integral) return;
    const config = state.systemConfig.config2048Integral;
    const score = state.game2048.score;

    config.forEach((row, idx) => {
        if (score >= row.required && !state.game2048.claimedMilestones.includes(idx)) {
            state.game2048.claimedMilestones.push(idx);
            if (row.coin) {
                addMoney(row.coin, 'EVENT_REWARD', `2048 積分獎勵 (${row.required}分)`);
                state.game2048.stats.totalGoldEarned += row.coin;
            }
            if (row.gem) {
                state.gems += row.gem;
                state.game2048.stats.totalGemsEarned += row.gem;
                recordLog({
                    turn: state.turn, position: state.position, event: "GEM", delta_gold: 0,
                    current_balance: state.money, detail: `2048 積分獎勵：寶石 ${row.gem}`
                });
            }
            if (row.dice) {
                state.dice += row.dice;
                state.totalEarnedDice += row.dice;
                state.game2048.stats.totalDiceEarned += row.dice;
                state.earnedDiceBreakdown['2048積分達標'] = (state.earnedDiceBreakdown['2048積分達標'] || 0) + row.dice;
                recordLog({
                    turn: state.turn, position: state.position, event: "DICE", delta_gold: 0,
                    current_balance: state.money, detail: `2048 積分獎勵：骰子 ${row.dice}`
                });
            }
            recordLog({
                turn: state.turn, position: state.position, event: "SYSTEM", delta_gold: row.coin || 0,
                current_balance: state.money, detail: `達成 2048 積分 ${row.required} (${row.desc})`
            });
        }
    });
}

function check2048GameOver() {
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (state.game2048.grid[r][c] === 0) return false;
        }
    }
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const val = state.game2048.grid[r][c];
            if (c < 3 && state.game2048.grid[r][c + 1] === val) return false;
            if (r < 3 && state.game2048.grid[r + 1][c] === val) return false;
        }
    }
    return true;
}

function handle2048Event(payload) {
    if (!state.game2048) init2048State();

    if (payload.action === 'RESTART') {
        init2048State();
        sendUpdate();
        return;
    }

    if (payload.action === 'USE_STAMINA_ITEM') {
        const itemRecovery = get2048ConfigValue('2048_Activity_ItemRecoverPoint', 20);
        state.game2048.stamina += itemRecovery;
        recordLog({
            turn: state.turn, position: state.position, event: "SYSTEM", delta_gold: 0, current_balance: state.money,
            detail: `使用 2048 體力道具，回復 ${itemRecovery} 體力`
        });
        sendUpdate();
        return;
    }

    if (payload.action === 'MOVE') {
        if (state.game2048.isGameOver || state.game2048.stamina < 1) return;

        let moved = false;
        const grid = state.game2048.grid;
        const dir = payload.direction;

        const slideAndMerge = (line) => {
            let filtered = line.filter(val => val !== 0);
            let newLine = [];
            let changed = false;

            for (let i = 0; i < filtered.length; i++) {
                // Max level is 11, so prevent merging two 11s.
                if (i + 1 < filtered.length && filtered[i] === filtered[i + 1] && filtered[i] < 11) {
                    const newLevel = filtered[i] + 1;
                    newLine.push(newLevel);
                    state.game2048.score += Math.pow(2, newLevel);
                    update2048MaxLevel(newLevel);
                    i++;
                    changed = true;
                } else {
                    newLine.push(filtered[i]);
                }
            }

            while (newLine.length < 4) { newLine.push(0); }
            if (!changed) {
                for (let i = 0; i < 4; i++) { if (line[i] !== newLine[i]) changed = true; }
            }
            return { newLine, changed };
        };

        if (dir === 'LEFT' || dir === 'RIGHT') {
            for (let r = 0; r < 4; r++) {
                let row = grid[r].slice();
                if (dir === 'RIGHT') row.reverse();
                const res = slideAndMerge(row);
                if (res.changed) moved = true;
                let newRow = res.newLine;
                if (dir === 'RIGHT') newRow.reverse();
                grid[r] = newRow;
            }
        } else if (dir === 'UP' || dir === 'DOWN') {
            for (let c = 0; c < 4; c++) {
                let col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
                if (dir === 'DOWN') col.reverse();
                const res = slideAndMerge(col);
                if (res.changed) moved = true;
                let newCol = res.newLine;
                if (dir === 'DOWN') newCol.reverse();
                for (let r = 0; r < 4; r++) grid[r][c] = newCol[r];
            }
        }

        if (moved) {
            state.game2048.stamina -= 1;
            state.game2048.stats.totalStaminaUsed += 1;
            spawn2048Tile();
            check2048Milestones();
            if (check2048GameOver()) state.game2048.isGameOver = true;
            sendUpdate();
        }
    }
}

function tick2048Stamina() {
    if (!state.game2048) return;
    if (state.game2048.stamina >= state.game2048.maxStamina) {
        state.game2048.nextStaminaTick = 0;
        return;
    }

    const now = Date.now();
    const recoverTimeSecs = get2048ConfigValue('2048_Activity_RecoverTime', 300);
    const recoverPts = get2048ConfigValue('2048_Activity_RecoverPoint', 1);

    if (state.game2048.nextStaminaTick === 0) {
        state.game2048.nextStaminaTick = now + (recoverTimeSecs * 1000);
    } else if (now >= state.game2048.nextStaminaTick) {
        state.game2048.stamina = Math.min(state.game2048.maxStamina, state.game2048.stamina + recoverPts);
        state.game2048.nextStaminaTick = state.game2048.stamina >= state.game2048.maxStamina ? 0 : now + (recoverTimeSecs * 1000);
        sendUpdate();
    }
}

// Tick stamina periodically 
setInterval(() => {
    tick2048Stamina();
}, 1000);



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
    state.totalSpentDice += state.multiplier; // Accumulate spent
    state.spentDiceBreakdown['基礎擲骰'] = (state.spentDiceBreakdown['基礎擲骰'] || 0) + state.multiplier; // [NEW] Aggregate breakdown


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
        // Example: "骰子判定: 目標 #15 (權重 200), 步數 5"
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

    // [NEW] Unified Reward Logic
    // 1. Coins (Renamed from Price/BaseValue)
    let coinVal = (tile.coin || 0) * mult;

    // Special Logic Overrides for Coins
    if (tile.type === 'AIRPORT') {
        // Airport probability check
        if (Math.random() <= tile.probability) {
            // coinVal is already calculated from CSV coin_value
            // [NEW] Record tournament points for this turn
            const baseBonus = (state.systemConfig && state.systemConfig.AIRPORT_Value) ? state.systemConfig.AIRPORT_Value : 50;
            state.pendingTournamentBonus = (state.pendingTournamentBonus || 0) + (baseBonus * mult);
        } else {
            coinVal = 0; // Failed probability
            recordLog({ turn: state.turn, position: pos, event: 'AIRPORT_FAIL', delta_gold: 0, current_balance: state.money, detail: `機場未發放補助 (機率 ${tile.probability * 100}%)` });
        }
    } else if (tile.type === 'GOTOJAIL') {
        coinVal = 0; // Jail usually has no coin reward unless configured?
        recordLog({ turn: state.turn, position: pos, event: 'JAIL', delta_gold: 0, current_balance: state.money, detail: "被抓進監獄！" });
    }

    if (coinVal !== 0) {
        const type = coinVal > 0 ? "INCOME" : "EXPENSE";
        const msg = coinVal > 0 ? `獲得收益 $${coinVal}` : `支付費用 $${Math.abs(coinVal)}`;
        // Use specific event names if possible
        const eventName = tile.type === 'AIRPORT' ? 'AIRPORT' : (tile.type === 'SMALL_GOLD' ? 'SMALL_GOLD' : (tile.type === 'BIG_GOLD' ? 'BIG_GOLD' : type));
        addMoney(coinVal, eventName, `${msg} (x${mult}, ${tile.name})`);
    }

    // 2. Gems
    const gemVal = (tile.gem || 0) * mult;
    if (gemVal !== 0) {
        state.gems = Math.max(0, state.gems + gemVal); // [FIX] No negative gems
        const msg = gemVal > 0 ? `獲得寶石 ${gemVal}` : `失去寶石 ${Math.abs(gemVal)}`;
        recordLog({
            turn: state.turn,
            position: pos,
            event: "GEM",
            delta_gold: 0,
            current_balance: state.money,
            detail: `${msg} (x${mult})`
        });
    }

    // 3. Dice
    const diceVal = (tile.diceReward || 0) * mult;
    if (diceVal !== 0) {
        state.dice = Math.max(0, state.dice + diceVal); // [FIX] No negative dice
        if (diceVal > 0) {
            state.totalEarnedDice += diceVal; // Accumulate earned
            state.earnedDiceBreakdown['地圖獎勵'] = (state.earnedDiceBreakdown['地圖獎勵'] || 0) + diceVal; // Aggregate breakdown
        } else {
            state.totalSpentDice += Math.abs(diceVal); // Accumulate spent
            state.spentDiceBreakdown['地圖事件懲罰'] = (state.spentDiceBreakdown['地圖事件懲罰'] || 0) + Math.abs(diceVal); // Aggregate breakdown
        }
        const msg = diceVal > 0 ? `獲得骰子 ${diceVal}` : `失去骰子 ${Math.abs(diceVal)}`;
        recordLog({
            turn: state.turn,
            position: pos,
            event: "DICE",
            delta_gold: 0,
            current_balance: state.money,
            detail: `${msg} (x${mult})`
        });
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
            const reward = currentConfig.gold;
            if (reward > 0) addMoney(reward, "EVENT_REWARD", `活動升級 Lv.${state.collection.level - 1} -> Lv.${state.collection.level}! ${currentConfig.desc}`);

            const gemReward = (currentConfig.gem || 0);
            if (gemReward > 0) {
                state.gems += gemReward;
                recordLog({
                    turn: state.turn, position: state.position, event: "EVENT_REWARD_GEM", delta_gold: 0, current_balance: state.money,
                    detail: `活動升級寶石：${gemReward}`
                });
            }

            const diceReward = (currentConfig.dice || 0);
            if (diceReward > 0) {
                state.dice += diceReward;
                state.totalEarnedDice += diceReward;
                state.earnedDiceBreakdown['收集活動獎勵'] = (state.earnedDiceBreakdown['收集活動獎勵'] || 0) + diceReward;
                recordLog({
                    turn: state.turn, position: state.position, event: "EVENT_REWARD_DICE", delta_gold: 0, current_balance: state.money,
                    detail: `活動升級骰子：${diceReward}`
                });
            }

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
    const payload = {
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
        totalEarnedDice: state.totalEarnedDice, // [NEW] Send total earned dice
        totalSpentDice: state.totalSpentDice, // [NEW] Send total spent dice
        earnedDiceBreakdown: state.earnedDiceBreakdown, // [NEW] Send breakdown
        spentDiceBreakdown: state.spentDiceBreakdown, // [NEW] Send breakdown
        multiplier: state.multiplier, // Send back multiplier
        gems: state.gems, // [NEW] Send back gems
        roulette: {
            level: state.roulette.level,
            drawnCounts: state.roulette.drawnCounts,
            tokens: state.roulette.tokens,
            integral: state.roulette.integral, // Send integral state
            stats: state.roulette.stats // Send stats 
        },
        tournamentBonus: state.pendingTournamentBonus || 0, // [NEW] Pass tournament points
        game2048: state.game2048
    };

    // Reset pending bonus after sending
    state.pendingTournamentBonus = 0;

    self.postMessage({
        type: 'UPDATE_UI',
        payload: payload
    });
}

// [NEW] Roulette Logic
function spinRoulette() {
    if ((state.roulette.tokens || 0) < 1) {
        console.warn("Insufficient Roulette Tokens");
        return; // UI should have prevented this
    }

    state.roulette.tokens--; // Deduct Token
    // [NEW] Track Token Used per Level
    state.roulette.stats.tokensPerLevel[state.roulette.level] = (state.roulette.stats.tokensPerLevel[state.roulette.level] || 0) + 1;

    // Add Integral Points (configurable via Roulette_Token_Value)
    const pointsGained = (state.systemConfig && state.systemConfig.Roulette_Token_Value) ? state.systemConfig.Roulette_Token_Value : 10;
    state.roulette.integral.score += pointsGained;

    // [NEW] Process Integral Level Up locally
    if (state.roulette.integralConfig && state.roulette.integralConfig.length > 0) {
        let currentCfg = state.roulette.integralConfig.find(c => c.level === state.roulette.integral.level);
        while (currentCfg && state.roulette.integral.score >= currentCfg.required) {
            // Level Up
            state.roulette.integral.score -= currentCfg.required;
            state.roulette.integral.level++;

            // Give Rewards directly in worker state
            if (currentCfg.coin > 0) addMoney(currentCfg.coin, "ROULETTE_INTEGRAL", `轉盤大獎升級 Lv.${state.roulette.integral.level - 1}`);
            if (currentCfg.gem > 0) {
                state.gems += currentCfg.gem;
                recordLog({ turn: state.turn, position: state.position, event: "ROULETTE_GEM", delta_gold: 0, current_balance: state.money, detail: `大獎升級：寶石 ${currentCfg.gem}` });
            }
            if (currentCfg.dice > 0) {
                state.dice += currentCfg.dice;
                state.totalEarnedDice += currentCfg.dice; // Accumulate
                state.earnedDiceBreakdown['輪盤抽獎'] = (state.earnedDiceBreakdown['輪盤抽獎'] || 0) + currentCfg.dice;
                state.roulette.stats.totalDice = (state.roulette.stats.totalDice || 0) + currentCfg.dice; // Track Roulette local stats
                recordLog({ turn: state.turn, position: state.position, event: "ROULETTE_DICE", delta_gold: 0, current_balance: state.money, detail: `大獎升級：骰子 ${currentCfg.dice}` });
            }

            currentCfg = state.roulette.integralConfig.find(c => c.level === state.roulette.integral.level);
        }
    }

    const level = state.roulette.level;
    const maxLevel = Math.max(...Object.keys(state.roulette.config).map(Number));
    const effectiveLevel = Math.min(level, maxLevel);

    const items = state.roulette.config[effectiveLevel];

    if (!items) {
        console.warn("No config for roulette level", effectiveLevel);
        return;
    }

    // Filter available items (not drawn yet)
    const available = items.filter(item => !state.roulette.drawnCounts.includes(item.count));

    if (available.length === 0) {
        // This should ideally not happen if LevelUp logic works correctly,
        // but if it does, force reset for safety? Or just warn.
        // User rule: LevelUp is grand prize. If you draw everything else...wait, LevelUp exists.
        // If LevelUp is NOT drawn yet, available is > 0.
        // If LevelUp IS drawn, it resets immediately.
        console.warn("No available items in roulette level", level);
        // If all non-levelUp items are drawn, and levelUp is not drawn, it should be the only available item.
        // If levelUp was drawn, drawnCounts would have been reset.
        // So this case implies a config error or all items including levelUp were drawn without reset.
        // For safety, if this happens, we might want to force a level up or reset.
        // For now, just warn and return.
        return;
    }

    // Calculate total weight
    const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    let selected = null;

    for (const item of available) {
        random -= item.weight;
        if (random <= 0) {
            selected = item;
            break;
        }
    }

    if (!selected) selected = available[available.length - 1]; // Fallback

    // Track Landing Stat for Probability Display
    state.roulette.stats.landings[selected.count] = (state.roulette.stats.landings[selected.count] || 0) + 1;

    // Process Reward
    // const mult = 1; // Roulette rewards fixed.

    // For Animation, we need to tell frontend WHAT was selected.
    // Frontend will play animation then reveal result?
    // Let's grant resources immediately for simplicity, but log it.

    if (selected.levelUp) {
        // Level Up Logic
        state.roulette.drawnCounts = []; // Reset locally
        if (state.roulette.level < maxLevel) {
            state.roulette.level++;
        }
        // If Max Level reached, level stays same, but drawnCounts reset (above)

        recordLog({
            turn: state.turn,
            position: state.position,
            event: "ROULETTE_LEVELUP",
            delta_gold: 0,
            current_balance: state.money,
            detail: `輪盤大獎！重置盤面 (Lv.${state.roulette.level})`
        });
    } else {
        state.roulette.drawnCounts.push(selected.count);

        // Grant Resources
        if (selected.coin > 0) {
            addMoney(selected.coin, "ROULETTE_COIN", `輪盤獎勵：金幣 ${selected.coin}`);
            state.roulette.stats.totalCoin += selected.coin; // Track Coin
        }
        if (selected.gem > 0) {
            state.gems = Math.max(0, state.gems + selected.gem);
            state.roulette.stats.totalGem += selected.gem; // Track Gem
            recordLog({
                turn: state.turn,
                position: state.position,
                event: "ROULETTE_GEM",
                delta_gold: 0,
                current_balance: state.money,
                detail: `輪盤獎勵：寶石 ${selected.gem}`
            });
        }
        if (selected.dice > 0) {
            state.dice = Math.max(0, state.dice + selected.dice);
            state.totalEarnedDice += selected.dice; // Accumulate earned
            state.earnedDiceBreakdown['輪盤抽獎'] = (state.earnedDiceBreakdown['輪盤抽獎'] || 0) + selected.dice;
            state.roulette.stats.totalDice += selected.dice; // Track Dice
            recordLog({
                turn: state.turn,
                position: state.position,
                event: "ROULETTE_DICE",
                delta_gold: 0,
                current_balance: state.money,
                detail: `輪盤獎勵：骰子 ${selected.dice}`
            });
        }
    }

    // Send Update with Spin Result
    // We reuse sendUpdate but maybe attach extra payload?
    // sendUpdate function signature: sendUpdate(lastDiceRoll = 0, isAuto = false)
    // We can modify sendUpdate to accept optional extra payload.
    // Or just manually post message here.

    // Better: Helper function
    sendRouletteUpdate(selected);
}

function sendRouletteUpdate(spinResultItem) {
    self.postMessage({
        type: 'UPDATE_UI',
        payload: {
            turn: state.turn,
            position: state.position,
            money: state.money,
            logs: state.logs,
            tileVisits: state.tileVisits,
            extraObjects: Array.from(state.extraObjects),
            collection: state.collection,
            diceRoll: 0,
            isAuto: false, // Roulette doesn't count as auto move?
            dice: state.dice,
            totalEarnedDice: state.totalEarnedDice,
            totalSpentDice: state.totalSpentDice,
            earnedDiceBreakdown: state.earnedDiceBreakdown,
            spentDiceBreakdown: state.spentDiceBreakdown,
            multiplier: state.multiplier,
            gems: state.gems,
            roulette: {
                level: state.roulette.level,
                drawnCounts: state.roulette.drawnCounts,
                tokens: state.roulette.tokens, // [NEW]
                integral: state.roulette.integral, // [NEW] Integral state
                stats: state.roulette.stats, // [NEW] Send stats immediately
                lastSpinResult: spinResultItem // [NEW] Pass result for animation
            }
        }
    });
}
