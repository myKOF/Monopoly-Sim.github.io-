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
    collection: { level: 1, points: 0, totalCollected: 0, config: [], enabled: true },
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
    game2048: null, // Initialize properly in START_GAME or INIT
    partnerGame: {
        tokens: 0,
        towers: [],
        multiplier: 1,
        config: [],
        stats: { totalSpent: 0, totalGenerated: 0 }
    },
    volcano: {
        level: 1,
        hp: 0,
        maxHp: 0,
        position: 10,
        config: [],
        stats: { totalHits: 0, totalKills: 0 }
    },
    scratchCard: {
        level: 1,
        points: 0,
        tokens: 100,
        rewardConfig: [],   // from scratch_card_reward.csv
        groupConfig: [],    // from scratch_card_group.csv (level->groups/weights)
        integralConfig: [], // from scratch_card_integral.csv
        multiplier: 1,
        currentCard: null,
        stats: { totalTokensUsed: 0, totalGold: 0, totalGem: 0, totalDice: 0 }
    },
    travelEvent: {
        level: 1,
        currencyType: 'GOLD', // GOLD or GEM
        boxes: [], // [{ type, value, isFail, isOpened }]
        isFailed: false,
        isTransitioning: false,
        isFinished: false,
        speed: 1, // [NEW] Speed Multiplier
        stageConfig: [],
        rewardConfig: [],
        stats: { totalGames: 1, totalSpentGold: 0, totalSpentGem: 0, totalEarnedDice: 0, totalEarnedGem: 0, totalEarnedGold: 0 }
    },
    archaeology: {
        level: 1,
        group: 1,
        tokens: 100,
        board: [],
        targetItems: [],
        foundItemsCount: 0,
        autoDig: false,
        speed: 1,
        itemConfigs: [],
        rewardConfigs: [],
        currentStageConfig: null,
        isTransitioning: false,
        isFinished: false,
        stats: {
            totalTokensUsed: 0,
            totalEarnedDice: 0,
            totalEarnedGold: 0,
            totalEarnedGem: 0,
            totalEmptyDigs: 0
        }
    },
    magicPlant: {
        level: 1,
        points: 0,
        tokens: 100,
        rewardConfig: [],
        stats: {
            totalWatered: 0,
            totalSpentGold: 0,
            totalSpentGem: 0,
            totalEarnedDice: 0,
            totalEarnedGold: 0,
            totalEarnedGem: 0
        },
        availableFruits: []
    }
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
            initPartnerGameState(); // [NEW]
            initVolcanoState(payload.volcanoConfig); // [NEW]
            state.scratchCard.rewardConfig = payload.scratchCardConfig || [];
            state.scratchCard.config = state.scratchCard.rewardConfig; // backwards compat
            state.scratchCard.groupConfig = payload.scratchCardGroupConfig || [];
            state.scratchCard.integralConfig = payload.scratchCardIntegralConfig || [];
            initScratchCardState();
            initMagicPlantState(payload.magicPlantConfig);
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

            initPartnerGameState(); // [NEW] Reset partner game on start

            // [NEW] Volcano Reset
            if (state.volcano.config && state.volcano.config.length > 0) {
                const cfg = state.volcano.config.find(c => c.level === 1);
                state.volcano.level = 1;
                state.volcano.hp = cfg ? cfg.hp : 500;
                state.volcano.maxHp = state.volcano.hp;
                state.volcano.position = 10; // Start at tile 10
            }
            initScratchCardState();
            initMagicPlantState(state.magicPlant.rewardConfig); // Keep existing config if resetting game
            state.magicPlant.level = 1;
            state.magicPlant.points = 0;
            state.magicPlant.tokens = 100;
            state.magicPlant.stats = { totalWatered: 0, totalSpentGold: 0, totalSpentGem: 0, totalEarnedDice: 0, totalEarnedGold: 0, totalEarnedGem: 0 };
            state.magicPlant.hasFruit = false;
            state.magicPlant.fruitClaimed = false;
            break;

        case 'UPDATE_CONFIG': // New: Handle Dice/Multiplier updates from UI
            if (payload.dice !== undefined) state.dice = payload.dice;
            if (payload.multiplier !== undefined) state.multiplier = payload.multiplier;
            if (payload.money !== undefined) state.money = payload.money;
            if (payload.gems !== undefined) state.gems = payload.gems;
            if (payload.rouletteTokens !== undefined) state.roulette.tokens = payload.rouletteTokens; // [NEW] Sync Roulette Tokens
            if (payload.volcanoConfig !== undefined) state.volcano.config = payload.volcanoConfig; // [NEW]
            if (payload.scratchTokens !== undefined) state.scratchCard.tokens = payload.scratchTokens;
            if (payload.scratchMultiplier !== undefined) state.scratchCard.multiplier = payload.scratchMultiplier;
            if (payload.archaeologyTokens !== undefined) state.archaeology.tokens = payload.archaeologyTokens;
            if (payload.magicPlantTokens !== undefined) state.magicPlant.tokens = payload.magicPlantTokens;
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
        case 'UPDATE_COLLECTION_ENABLED':
            state.collection.enabled = payload.enabled;
            // If disabled, we could clear extra objects, but let's see if user wants that.
            // User said: "關閉時相當於沒有這個活動"
            if (!state.collection.enabled) {
                state.extraObjects.clear();
            } else {
                // If re-enabled, trigger a spawn based on current config
                const initialCount = (state.systemConfig && state.systemConfig.Collect_Item_Count) ? state.systemConfig.Collect_Item_Count : 10;
                generateExtraObjects(initialCount);
            }
            sendUpdate();
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
            break;
        case 'MOVE_2048':
            handle2048Event(payload);
            break;
        case 'UPDATE_PARTNER_CONFIG':
            if (!state.partnerGame) initPartnerGameState();
            state.partnerGame.config = payload.config || [];
            break;
        case 'UPDATE_PARTNER_DATA':
            if (!state.partnerGame) initPartnerGameState();
            if (payload.tokens !== undefined) state.partnerGame.tokens = payload.tokens;
            if (payload.multiplier !== undefined) state.partnerGame.multiplier = payload.multiplier;
            sendUpdate();
            break;
        case 'PARTNER_GAME_JOIN':
            if (!state.partnerGame) initPartnerGameState();
            handlePartnerJoin(payload.towerId);
            break;
        case 'PARTNER_GAME_INJECT':
            if (!state.partnerGame) initPartnerGameState();
            handlePartnerInject(payload.towerId);
            break;
        case 'SCRATCH_CARD_PICK':
            handleScratchPick(payload.index);
            break;
        case 'SCRATCH_CARD_SET_MULT':
            if (state.scratchCard) state.scratchCard.multiplier = payload.multiplier;
            sendUpdate();
            break;
        case 'UPDATE_SCRATCH_REWARD_CONFIG':
            // New: load from scratch_card_reward.csv
            if (state.scratchCard) {
                state.scratchCard.rewardConfig = payload.config;
                // Also keep .config for backwards compat if needed
                state.scratchCard.config = payload.config;
            }
            generateScratchCard();
            sendUpdate();
            break;
        case 'UPDATE_SCRATCH_GROUP_CONFIG':
            // New: load from scratch_card_group.csv
            if (state.scratchCard) state.scratchCard.groupConfig = payload.config;
            generateScratchCard();
            sendUpdate();
            break;
        case 'UPDATE_SCRATCH_CONFIG':
            // Legacy fallback (old scratch_card.csv)
            if (state.scratchCard) {
                state.scratchCard.config = payload.config;
                state.scratchCard.rewardConfig = payload.config;
            }
            generateScratchCard();
            sendUpdate();
            break;
        case 'UPDATE_SCRATCH_INTEGRAL':
            if (state.scratchCard) state.scratchCard.integralConfig = payload.config;
            sendUpdate();
            break;
        case 'SCRATCH_CARD_RESET':
            generateScratchCard();
            sendUpdate();
            break;
        case 'INIT_TRAVEL_CONFIG':
            state.travelEvent.stageConfig = payload.stageConfig || [];
            state.travelEvent.rewardConfig = payload.rewardConfig || [];
            initTravelEventState();
            sendUpdate();
            break;
        case 'TRAVEL_PICK':
            handleTravelPick(payload.index);
            sendUpdate();
            break;
        case 'TRAVEL_CONTINUE':
            handleTravelContinue();
            sendUpdate();
            break;
        case 'TRAVEL_GIVEUP':
            handleTravelReset();
            sendUpdate();
            break;
        case 'TRAVEL_RESET':
            handleTravelReset();
            break;
        case 'TRAVEL_FULL_RESET':
            handleTravelFullReset();
            break;
        case 'TRAVEL_SET_SPEED':
            state.travelEvent.speed = payload.speed || 1;
            break;
        case 'TRAVEL_SWITCH_CURRENCY':
            state.travelEvent.currencyType = state.travelEvent.currencyType === 'GOLD' ? 'GEM' : 'GOLD';
            handleTravelReset(); // Always reset to Level 1 when switching
            sendUpdate();
            break;
        case 'INIT_ARCHAEOLOGY_CONFIG':
            state.archaeology.itemConfigs = payload.itemConfig || [];
            state.archaeology.rewardConfigs = payload.rewardConfig || [];
            initArchaeologyStage();
            sendUpdate();
            break;
        case 'ARCHAEOLOGY_DIG':
            handleArchaeologyDig(payload.index);
            break;
        case 'ARCHAEOLOGY_SET_AUTO':
            state.archaeology.autoDig = payload.enabled;
            if (state.archaeology.autoDig) runArchaeologyAuto();
            sendUpdate();
            break;
        case 'ARCHAEOLOGY_SET_SPEED':
            state.archaeology.speed = payload.speed;
            sendUpdate();
            break;
        case 'ARCHAEOLOGY_RESET':
            state.archaeology.level = 1;
            state.archaeology.group = 1;
            state.archaeology.foundItemsCount = 0;
            state.archaeology.isFinished = false;
            state.archaeology.autoDig = false; // Stop auto-dig on reset
            // Reset all stats including earned resources
            state.archaeology.stats = {
                totalTokensUsed: 0,
                totalEarnedDice: 0,
                totalEarnedGold: 0,
                totalEarnedGem: 0,
                totalEmptyDigs: 0
            };
            initArchaeologyStage();
            sendUpdate();
            break;
        case 'ARCHAEOLOGY_SWITCH_GROUP':
            state.archaeology.group = payload.group || 1;
            state.archaeology.level = 1;
            state.archaeology.foundItemsCount = 0;
            state.archaeology.isFinished = false;
            initArchaeologyStage();
            sendUpdate();
            break;
        case 'MAGIC_PLANT_WATER':
            handleMagicPlantWater();
            break;
        case 'MAGIC_PLANT_HARVEST':
            handleMagicPlantHarvest(payload.level);
            break;
        case 'MAGIC_PLANT_RESET':
            handleMagicPlantReset();
            break;
        case 'MAGIC_PLANT_PURCHASE':
            if (payload.currency === 'GOLD') {
                state.money += 1000000;
                recordLog({ turn: state.turn, position: state.position, event: "MAGIC_PURCHASE", delta_gold: 1000000, current_balance: state.money, detail: `魔法加值：獲得 1,000,000 金幣` });
            } else if (payload.currency === 'GEM') {
                state.gems += 10000;
                recordLog({ turn: state.turn, position: state.position, event: "MAGIC_PURCHASE", delta_gold: 0, current_balance: state.money, detail: `魔法加值：獲得 10,000 寶石` });
            }
            sendUpdate();
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

function reset2048Board() {
    if (!state.game2048) return;
    state.game2048.grid = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    state.game2048.isGameOver = false;
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
                    state.earnedDiceBreakdown['2048活動'] = (state.earnedDiceBreakdown['2048活動'] || 0) + rewardRow.dice;
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
                state.earnedDiceBreakdown['2048活動'] = (state.earnedDiceBreakdown['2048活動'] || 0) + row.dice;
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
        reset2048Board();
        sendUpdate();
        return;
    }

    if (payload.action === 'FULL_RESET') {
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

    // [NEW] Volcano Collision Detection (Multi-step)
    checkVolcanoCollision(prevPos, steps);

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
    if (state.collection.enabled === false) return;
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
        while (currentConfig && currentConfig.required > 0 && state.collection.points >= currentConfig.required) {
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
    if (state.collection.enabled === false) {
        state.extraObjects.clear();
        return;
    }
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
        game2048: state.game2048,
        partnerGame: state.partnerGame, // [NEW]
        volcano: {
            level: state.volcano.level,
            hp: state.volcano.hp,
            maxHp: state.volcano.maxHp,
            position: state.volcano.position,
            stats: state.volcano.stats,
            config: state.volcano.config // For the modal
        },
        scratchCard: {
            level: state.scratchCard.level,
            points: state.scratchCard.points,
            tokens: state.scratchCard.tokens,
            multiplier: state.scratchCard.multiplier,
            currentCard: state.scratchCard.currentCard,
            stats: state.scratchCard.stats,
            integralConfig: state.scratchCard.integralConfig
        },
        travelEvent: {
            level: state.travelEvent.level,
            currencyType: state.travelEvent.currencyType,
            boxes: state.travelEvent.boxes,
            isFailed: state.travelEvent.isFailed,
            stats: state.travelEvent.stats,
            stageConfig: state.travelEvent.stageConfig
        },
        archaeology: {
            level: state.archaeology.level,
            group: state.archaeology.group,
            tokens: state.archaeology.tokens,
            board: state.archaeology.board,
            targetItems: state.archaeology.targetItems,
            foundItemsCount: state.archaeology.foundItemsCount,
            autoDig: state.archaeology.autoDig,
            speed: state.archaeology.speed,
            currentStageConfig: state.archaeology.currentStageConfig,
            stats: state.archaeology.stats,
            rewardConfigs: state.archaeology.rewardConfigs
        },
        magicPlant: {
            level: state.magicPlant.level,
            points: state.magicPlant.points,
            tokens: state.magicPlant.tokens,
            stats: state.magicPlant.stats,
            rewardConfig: state.magicPlant.rewardConfig,
            availableFruits: state.magicPlant.availableFruits
        }
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
        while (currentCfg && currentCfg.required > 0 && state.roulette.integral.score >= currentCfg.required) {
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
            },
            partnerGame: state.partnerGame // [NEW]
        }
    });
}

// [NEW] Partner Game Core Implementation
function initPartnerGameState() {
    const initialTokens = state.systemConfig.Partner_Game_Token ? parseInt(state.systemConfig.Partner_Game_Token) : 10000;

    state.partnerGame = {
        tokens: initialTokens,
        multiplier: 1,
        towers: [
            { id: 1, myScore: 0, partnerScore: 0, joined: false, partnerTokens: 0, nextBotTick: 0, claimedMilestones: [] },
            { id: 2, myScore: 0, partnerScore: 0, joined: false, partnerTokens: 0, nextBotTick: 0, claimedMilestones: [] },
            { id: 3, myScore: 0, partnerScore: 0, joined: false, partnerTokens: 0, nextBotTick: 0, claimedMilestones: [] },
            { id: 4, myScore: 0, partnerScore: 0, joined: false, partnerTokens: 0, nextBotTick: 0, claimedMilestones: [] }
        ],
        stats: { totalSpent: 0, totalGenerated: 0 }
    };
    sendUpdate();
}

function handlePartnerJoin(towerId) {
    const tower = state.partnerGame.towers.find(t => t.id === towerId);
    if (tower && !tower.joined) {
        tower.joined = true;
        tower.nextBotTick = Date.now() + (Math.random() * 5000);
        recordLog({
            turn: state.turn, position: state.position, event: "SYSTEM", delta_gold: 0, current_balance: state.money,
            detail: `成功加入隊伍 ${towerId}`
        });
        sendUpdate();
    }
}

function handlePartnerInject(towerId) {
    const pg = state.partnerGame;
    const tower = pg.towers.find(t => t.id === towerId);
    const mult = pg.multiplier || 1;
    const cost = mult;

    const towerMilestones = pg.config ? pg.config.filter(m => m.partner == towerId) : [];
    const maxScore = towerMilestones.length > 0 ? Math.max(...towerMilestones.map(m => Number(m.required))) : 30000;

    if (!tower || pg.tokens < cost || (tower.myScore + tower.partnerScore) >= maxScore) return;

    pg.tokens -= cost;
    pg.stats.totalSpent += cost;

    const range = parseRange(state.systemConfig.Partner_Game_TokenValue || "{10,100}");
    const baseScore = Math.floor(getRandomRange(range[0], range[1]));
    const score = baseScore * mult;

    tower.myScore += score;
    pg.stats.totalGenerated += score;

    checkPartnerMilestones(towerId);
    sendUpdate();
}

function checkPartnerMilestones(towerId) {
    if (!state.partnerGame || !state.partnerGame.config) return;

    const tower = state.partnerGame.towers.find(t => t.id === towerId);
    if (!tower) return;

    const totalScore = tower.myScore + tower.partnerScore;
    const towerMilestones = state.partnerGame.config.filter(m => m.partner == towerId);

    towerMilestones.forEach(m => {
        // Find if this milestone was already claimed
        // We use its required score as unique ID per partner
        if (totalScore >= m.required && !tower.claimedMilestones.includes(m.required)) {
            tower.claimedMilestones.push(m.required);

            // Grant Rewards
            if (m.coin) addMoney(m.coin, 'EVENT_REWARD', `合作伙伴大賽隊伍 ${towerId} 達成 ${m.required} 分獎勵`);
            if (m.gem) {
                state.gems += m.gem;
                recordLog({
                    turn: state.turn, position: state.position, event: "GEM", delta_gold: 0,
                    current_balance: state.money, detail: `合作伙伴隊伍 ${towerId} 獎勵：寶石 ${m.gem}`
                });
            }
            if (m.dice) {
                state.dice += m.dice;
                state.totalEarnedDice += m.dice;
                state.earnedDiceBreakdown['合作伙伴活動'] = (state.earnedDiceBreakdown['合作伙伴活動'] || 0) + m.dice;
                recordLog({
                    turn: state.turn, position: state.position, event: "EVENT_REWARD_DICE", delta_gold: 0,
                    current_balance: state.money, detail: `合作伙伴隊伍 ${towerId} 達成 ${m.required} 分獎勵：骰子 ${m.dice}`
                });
            }
        }
    });
}

function tickPartnerBots() {
    if (!state.partnerGame || !state.partnerGame.towers) return;
    const now = Date.now();
    let updated = false;

    state.partnerGame.towers.forEach(tower => {
        const towerMilestones = state.partnerGame.config ? state.partnerGame.config.filter(m => m.partner == tower.id) : [];
        const maxScore = towerMilestones.length > 0 ? Math.max(...towerMilestones.map(m => Number(m.required))) : 30000;

        if (!tower.joined || (tower.myScore + tower.partnerScore) >= maxScore) return;

        if (now >= tower.nextBotTick) {
            const range = parseRange(state.systemConfig.Partner_Game_PartnerValue || "{15,120}");
            const score = Math.floor(getRandomRange(range[0], range[1]));

            tower.partnerScore += score;
            tower.partnerTokens += 1;

            const timeRange = parseRange(state.systemConfig.Partner_Game_PartnerValueTime || "{5,15}");
            const cd = getRandomRange(timeRange[0], timeRange[1]);
            tower.nextBotTick = now + (cd * 1000);

            checkPartnerMilestones(tower.id);
            updated = true;
        }
    });

    if (updated) sendUpdate();
}

function parseRange(str) {
    if (Array.isArray(str)) return str;
    if (typeof str !== 'string') return [0, 0];
    const clean = str.replace(/[{}" ]/g, '');
    const parts = clean.split(',').map(n => parseFloat(n));
    return parts.length === 2 ? parts : [0, 0];
}

function getRandomRange(min, max) {
    return Math.random() * (max - min) + min;
}

setInterval(tickPartnerBots, 2000); // Check every 2 seconds

// [NEW] Volcano (Police and Thief) Logic
function initVolcanoState(config) {
    state.volcano.config = config || [];
    if (state.volcano.config.length > 0) {
        const cfg = state.volcano.config.find(c => c.level === state.volcano.level);
        if (cfg) {
            state.volcano.hp = cfg.hp;
            state.volcano.maxHp = cfg.hp;
        }
    }
}

function checkVolcanoCollision(startPos, steps) {
    // Check each step taken during the move
    for (let i = 1; i <= steps; i++) {
        const currentPos = (startPos + i) % BOARD_SIZE;
        if (currentPos === state.volcano.position) {
            handleVolcanoHit();
            break; // Max one hit per roll
        }
    }
}

function handleVolcanoHit() {
    const mult = state.multiplier || 1;
    const damage = mult; // Damage simplified to multiplier or 1 per multiplier? 
    // Requirement rule 2: "碰撞到該匪徒，則匪徒會減少生命值"
    // Usually damage is multiplier.

    state.volcano.hp = Math.max(0, state.volcano.hp - damage);
    state.volcano.stats.totalHits++;

    recordLog({
        turn: state.turn, position: state.position, event: "VOLCANO_HIT", delta_gold: 0, current_balance: state.money,
        detail: `💥 撞擊匪徒！減少 HP ${damage} (剩餘 ${state.volcano.hp}/${state.volcano.maxHp})`
    });

    if (state.volcano.hp <= 0) {
        handleVolcanoKill();
    } else {
        moveVolcanoEscape();
    }
}

function handleVolcanoKill() {
    const level = state.volcano.level;
    const cfg = state.volcano.config.find(c => c.level === level);

    if (cfg) {
        // Grant Rewards
        if (cfg.reward_gold > 0) addMoney(cfg.reward_gold, "VOLCANO_REWARD", `擊敗 Lv.${level} 匪徒獎勵：金幣 ${cfg.reward_gold}`);
        if (cfg.reward_gem > 0) {
            state.gems += cfg.reward_gem;
            recordLog({ turn: state.turn, position: state.position, event: "VOLCANO_GEM", delta_gold: 0, current_balance: state.money, detail: `擊敗匪徒獎勵：寶石 ${cfg.reward_gem}` });
        }
        if (cfg.reward_dice > 0) {
            state.dice += cfg.reward_dice;
            state.totalEarnedDice += cfg.reward_dice;
            state.earnedDiceBreakdown['警匪追逐'] = (state.earnedDiceBreakdown['警匪追逐'] || 0) + cfg.reward_dice;
            recordLog({ turn: state.turn, position: state.position, event: "VOLCANO_DICE", delta_gold: 0, current_balance: state.money, detail: `擊敗匪徒獎勵：骰子 ${cfg.reward_dice}` });
        }
    }

    state.volcano.stats.totalKills++;

    // Spawn next level
    if (level < 10) {
        state.volcano.level++;
        const nextCfg = state.volcano.config.find(c => c.level === state.volcano.level);
        if (nextCfg) {
            state.volcano.hp = nextCfg.hp;
            state.volcano.maxHp = nextCfg.hp;
            recordLog({ turn: state.turn, position: state.position, event: "VOLCANO_LEVELUP", delta_gold: 0, current_balance: state.money, detail: `出現 Lv.${state.volcano.level} 級匪徒！` });
        }
    } else {
        // Loop back to level 1 for endless play or stay at max?
        // User said: "出現下一個等級的匪徒". Usually loop if maxed.
        state.volcano.level = 1;
        const resetCfg = state.volcano.config.find(c => c.level === 1);
        if (resetCfg) {
            state.volcano.hp = resetCfg.hp;
            state.volcano.maxHp = resetCfg.hp;
        }
    }

    // Move to new position after kill
    state.volcano.position = (state.volcano.position + 20) % BOARD_SIZE;
}

function moveVolcanoEscape() {
    // Escape steps defined in system_config Volcano_Board_Count {min, max}
    const range = parseRange(state.systemConfig.Volcano_Board_Count || "{15,30}");
    const escapeSteps = Math.floor(getRandomRange(range[0], range[1]));

    // 向前逃走 (順時針，與玩家同方向) - Forward clockwise movement
    state.volcano.position = (state.volcano.position + escapeSteps) % BOARD_SIZE;

    recordLog({
        turn: state.turn, position: state.position, event: "VOLCANO_ESCAPE", delta_gold: 0, current_balance: state.money,
        detail: `🏃 匪徒向前逃走了 ${escapeSteps} 格！`
    });
}

// [NEW] Scratch Card Logic
function initScratchCardState() {
    // Maintain level/tokens/config if already exists, otherwise default
    if (!state.scratchCard) {
        state.scratchCard = {
            level: 1,
            points: 0,
            tokens: 100,
            rewardConfig: [],   // from scratch_card_reward.csv
            groupConfig: [],    // from scratch_card_group.csv
            integralConfig: [], // from scratch_card_integral.csv
            multiplier: 1,
            currentCard: null,
            stats: { totalTokensUsed: 0, totalGold: 0, totalGem: 0, totalDice: 0 }
        };
    } else {
        // Ensure new fields exist if upgrading from old state
        if (!state.scratchCard.rewardConfig) state.scratchCard.rewardConfig = state.scratchCard.config || [];
        if (!state.scratchCard.groupConfig) state.scratchCard.groupConfig = [];
    }
    generateScratchCard();
}

function generateScratchCard() {
    const sc = state.scratchCard;

    // --- Step 1: Determine which reward group to use for this level ---
    // Use groupConfig (scratch_card_group.csv) for weighted group selection
    let selectedGroupId = null;

    if (sc.groupConfig && sc.groupConfig.length > 0) {
        // Find the group config for the current level
        const levelCfg = sc.groupConfig.find(g => g.level === sc.level);
        if (levelCfg && levelCfg.groups.length > 0) {
            // Weighted random selection among groups
            const totalWeight = levelCfg.weights.reduce((sum, w) => sum + w, 0);
            let rand = Math.random() * totalWeight;
            for (let i = 0; i < levelCfg.groups.length; i++) {
                rand -= (levelCfg.weights[i] || 1);
                if (rand <= 0) {
                    selectedGroupId = levelCfg.groups[i];
                    break;
                }
            }
            if (selectedGroupId === null) {
                selectedGroupId = levelCfg.groups[levelCfg.groups.length - 1];
            }
        }
    }

    // --- Step 2: Get the 3 reward slots (sort=1,2,3) from the selected group ---
    // rewardConfig comes from scratch_card_reward.csv
    // columns: group, sort, reward_type, reward_spce, reward_value, weight, integral, icon, desc
    const rewardPool = sc.rewardConfig || sc.config || [];
    let targets = [];

    if (selectedGroupId !== null) {
        // Get rewards for this group, sorted by sort asc (1,2,3)
        const groupRewards = rewardPool
            .filter(r => parseInt(r.group) === selectedGroupId)
            .sort((a, b) => parseInt(a.sort) - parseInt(b.sort));
        targets = groupRewards.slice(0, 3);
    }

    // Fallback: use first 3 rewards from pool if no valid group
    if (targets.length < 3) {
        targets = rewardPool.slice(0, 3);
    }
    if (targets.length < 3) return; // Can't generate card

    // --- Step 3: Pre-select winning reward using weight ---
    // weight in scratch_card_reward.csv controls which of the 3 rewards wins this card
    const totalRewardWeight = targets.reduce((sum, t) => sum + (parseInt(t.weight) || 1), 0);
    let rw = Math.random() * totalRewardWeight;
    let preselectedWinnerIdx = targets.length - 1; // fallback: last target
    for (let i = 0; i < targets.length; i++) {
        rw -= (parseInt(targets[i].weight) || 1);
        if (rw <= 0) {
            preselectedWinnerIdx = i;
            break;
        }
    }

    // --- Step 4: Build 12-slot grid ---
    // Fixed: Only the pre-selected winner index can have 3+ matches.
    // Losers will have at most 2 copies on the card to prevent visual bugs.
    let grid = [];
    let allCardTargets = [...targets];

    // Winner gets 4 copies
    for (let j = 0; j < 4; j++) grid.push(preselectedWinnerIdx);

    // Other 2 main targets get 2 copies each (Total 4)
    targets.forEach((t, i) => {
        if (i === preselectedWinnerIdx) return;
        for (let j = 0; j < 2; j++) grid.push(i);
    });

    // We have 4 + 4 = 8 slots filled. Need 4 more decoys.
    let decoys = (sc.rewardConfig || []).filter(r => !targets.some(t => t.reward_type === r.reward_type && t.reward_value === r.reward_value));
    decoys.sort(() => Math.random() - 0.5);

    for (let j = 0; j < 4; j++) {
        const decoy = decoys[j] || targets[preselectedWinnerIdx];
        let idx = allCardTargets.indexOf(decoy);
        if (idx === -1) {
            idx = allCardTargets.length;
            allCardTargets.push(decoy);
        }
        grid.push(idx);
    }
    // Shuffle
    grid.sort(() => Math.random() - 0.5);

    sc.currentCard = {
        groupId: selectedGroupId,
        targets: allCardTargets,
        grid: grid,
        revealed: [],
        preselectedWinnerIdx: preselectedWinnerIdx,
        matchedIdx: -1,
        isCompleted: false
    };
}

function handleScratchPick(index) {
    const sc = state.scratchCard;
    if (!sc.currentCard) return;

    // If completed, any click (or index -1) resets for next card
    if (sc.currentCard.isCompleted) {
        generateScratchCard();
        sendUpdate();
        return;
    }

    if (index === -1) return; // Silent return for heartbeats
    if (sc.currentCard.revealed.includes(index)) return;

    // Cost on first pick
    if (sc.currentCard.revealed.length === 0) {
        const cost = sc.multiplier || 1;
        if (sc.tokens < cost) return;
        sc.tokens -= cost;
        sc.stats.totalTokensUsed += cost;
    }

    sc.currentCard.revealed.push(index);

    // Check results: The first symbol to reach 3 matches wins!
    // This fixed the bug where matching non-intended symbols did nothing.
    const allTargets = sc.currentCard.targets;
    const counts = new Array(allTargets.length).fill(0);

    sc.currentCard.revealed.forEach(cardSlotIdx => {
        const symbolIdx = sc.currentCard.grid[cardSlotIdx];
        counts[symbolIdx]++;
    });

    for (let i = 0; i < allTargets.length; i++) {
        if (counts[i] >= 3) {
            // WIN! Award the reward that matched
            awardScratchReward(allTargets[i]);
            sc.currentCard.matchedIdx = i;
            sc.currentCard.isCompleted = true;
            break;
        }
    }

    sendUpdate();
}

function awardScratchReward(target) {
    const sc = state.scratchCard;
    const mult = sc.multiplier || 1;
    const val = parseInt(target.reward_value) * mult;
    const type = (target.reward_type || '').toUpperCase();
    const integralGain = parseInt(target.integral) || 0;

    // Grant item reward based on reward_type
    if (type === 'GOLD') {
        addMoney(val, 'SCRATCH_REWARD', `刮刮卡獎勵：金幣 ${val} (x${mult})`);
        sc.stats.totalGold += val;
    } else if (type === 'GEM') {
        state.gems += val;
        sc.stats.totalGem += val;
        recordLog({ turn: state.turn, position: state.position, event: "GEM", delta_gold: 0, current_balance: state.money, detail: `刮刮卡獎勵：寶石 ${val} (x${mult})` });
    } else if (type === 'DICE') {
        state.dice += val;
        state.totalEarnedDice += val;
        sc.stats.totalDice += val;
        state.earnedDiceBreakdown['刮刮卡'] = (state.earnedDiceBreakdown['刮刮卡'] || 0) + val;
        recordLog({ turn: state.turn, position: state.position, event: "DICE", delta_gold: 0, current_balance: state.money, detail: `刮刮卡獎勵：骰子 ${val} (x${mult})` });
    }

    // Award integral points (from scratch_card_reward.integral column)
    if (integralGain > 0) {
        sc.points += integralGain;
        recordLog({ turn: state.turn, position: state.position, event: "SCRATCH_INTEGRAL", delta_gold: 0, current_balance: state.money, detail: `刮刮卡積分 +${integralGain}（共 ${sc.points}）` });
        checkScratchIntegral();
    }
}

function checkScratchIntegral() {
    const sc = state.scratchCard;
    let cfg = sc.integralConfig.find(c => parseInt(c.level) === sc.level);
    while (cfg && sc.points >= parseInt(cfg.required_points)) {
        sc.points -= parseInt(cfg.required_points);
        sc.level++;

        // Milestone reward
        if (parseInt(cfg.reward_gold) > 0) addMoney(parseInt(cfg.reward_gold), 'SCRATCH_MILESTONE', `刮刮卡升級 Lv.${sc.level - 1} 獎勵：金幣 ${cfg.reward_gold}`);
        if (parseInt(cfg.reward_gem) > 0) {
            const gReward = parseInt(cfg.reward_gem);
            state.gems += gReward;
            recordLog({ turn: state.turn, position: state.position, event: "GEM", delta_gold: 0, current_balance: state.money, detail: `刮刮卡升級獎勵：寶石 ${gReward}` });
        }
        if (parseInt(cfg.reward_dice) > 0) {
            const dReward = parseInt(cfg.reward_dice);
            state.dice += dReward;
            state.totalEarnedDice += dReward;
            recordLog({ turn: state.turn, position: state.position, event: "DICE", delta_gold: 0, current_balance: state.money, detail: `刮刮卡升級獎勵：骰子 ${dReward}` });
        }

        cfg = sc.integralConfig.find(c => parseInt(c.level) === sc.level);
    }
}

// ==========================================
// Traveler Event Logic
// ==========================================

function initTravelEventState() {
    const te = state.travelEvent;
    te.level = 1;
    te.isFailed = false;
    te.isTransitioning = false;
    te.isFinished = false;
    generateTravelBoxes();
}

function generateTravelBoxes() {
    const te = state.travelEvent;
    const level = te.level;
    const currentGroupId = te.currencyType === 'GOLD' ? 1 : 2;

    const boxes = [];

    // We have 4 boxes (count 1 to 4)
    for (let i = 1; i <= 4; i++) {
        // Filter rewards for this group, level, and box index (count)
        let pool = te.rewardConfig.filter(r =>
            parseInt(r.group) === currentGroupId &&
            parseInt(r.level) === level &&
            parseInt(r.count) === i
        );

        // Fallback: if no specific pool for this level, try any level for this count/group
        if (pool.length === 0) {
            pool = te.rewardConfig.filter(r =>
                parseInt(r.group) === currentGroupId &&
                parseInt(r.count) === i
            );
        }

        const reward = pickWeightedTravelReward(pool);
        const isClown = reward ? reward.reward_type.toUpperCase() === 'NONE' : false;

        boxes.push({
            type: isClown ? 'FAIL' : (reward ? reward.reward_type.toUpperCase() : 'COIN'),
            value: reward ? parseInt(reward.reward_value) : 0,
            isFail: isClown,
            isOpened: false
        });
    }

    // Shuffle the 4 boxes so the outcomes are randomized across positions
    te.boxes = boxes.sort(() => Math.random() - 0.5);
}

function pickWeightedTravelReward(pool) {
    if (!pool || pool.length === 0) return null;
    const totalWeight = pool.reduce((sum, r) => sum + (parseInt(r.weight) || 1), 0);
    let random = Math.random() * totalWeight;
    for (const r of pool) {
        random -= (parseInt(r.weight) || 1);
        if (random <= 0) return r;
    }
    return pool[pool.length - 1];
}

function handleTravelPick(index) {
    const te = state.travelEvent;
    if (te.isFailed || te.isFinished || te.isTransitioning || te.boxes[index].isOpened) return;

    const box = te.boxes[index];
    box.isOpened = true;

    if (box.isFail) {
        te.isFailed = true;
        sendUpdate();
    } else {
        // Success: Grant box reward
        if (box.value > 0) {
            grantTravelReward(box.type, box.value);
        }

        // Milestone reward from stageConfig (reward_probability check)
        const currentGroupId = te.currencyType === 'GOLD' ? 1 : 2;
        const stageCfg = te.stageConfig.find(s => parseInt(s.level) === te.level && parseInt(s.group) === currentGroupId);

        if (stageCfg && stageCfg.reward_type && stageCfg.reward_type.toUpperCase() !== 'NONE') {
            const prob = parseFloat(stageCfg.reward_probability) || 0;
            if (Math.random() < prob) {
                grantTravelReward(stageCfg.reward_type.toUpperCase(), parseInt(stageCfg.reward_value), true);
            }
        }

        // Show box reward before transitioning
        te.isTransitioning = true;
        sendUpdate();

        const speed = te.speed || 1;
        const baseDelay = parseFloat(state.systemConfig.Travel_Stage_Time) || 1;
        const delayMs = (baseDelay * 1000) / speed;
        setTimeout(() => {
            if (te.level < 20) {
                te.level++;
                generateTravelBoxes();
            } else {
                // [FIX] All Stages Cleared
                te.isFinished = true;
                te.isFailed = false;
                te.boxes = []; // Clear boxes so they disappear from UI loop
                self.postMessage({ type: 'TRAVEL_COMPLETE' });
            }
            te.isTransitioning = false;
            sendUpdate();
        }, delayMs);
    }
}

function handleTravelContinue() {
    const te = state.travelEvent;
    if (!te.isFailed) return;

    const currentGroupId = te.currencyType === 'GOLD' ? 1 : 2;
    const stageCfg = te.stageConfig.find(s => parseInt(s.level) === te.level && parseInt(s.group) === currentGroupId);

    if (!stageCfg) {
        te.isFailed = false; // Fallback
        sendUpdate();
        return;
    }

    const cost = parseInt(stageCfg.pay_value);
    const payType = stageCfg.pay_type.toUpperCase(); // COIN or GEM

    if (payType === 'COIN') {
        if (state.money >= cost) {
            state.money -= cost;
            te.stats.totalSpentGold += cost;
            te.isFailed = false;
            recordLog({ turn: state.turn, position: state.position, event: "TRAVEL_CONTINUE", delta_gold: -cost, current_balance: state.money, detail: `旅行家活動：花費 ${cost} 金幣接關` });
            sendUpdate();
        } else {
            self.postMessage({ type: 'TRAVEL_INSUFFICIENT_FUNDS', payload: { currency: 'COIN' } });
        }
    } else if (payType === 'GEM') {
        if (state.gems >= cost) {
            state.gems -= cost;
            te.stats.totalSpentGem += cost;
            te.isFailed = false;
            recordLog({ turn: state.turn, position: state.position, event: "TRAVEL_CONTINUE", delta_gold: 0, current_balance: state.money, detail: `旅行家活動：花費 ${cost} 寶石接關` });
            sendUpdate();
        } else {
            self.postMessage({ type: 'TRAVEL_INSUFFICIENT_FUNDS', payload: { currency: 'GEM' } });
        }
    }
}

function handleTravelReset() {
    const te = state.travelEvent;
    te.level = 1;
    te.isFailed = false;
    te.isTransitioning = false;
    te.isFinished = false;
    te.stats.totalGames++;
    generateTravelBoxes();
    sendUpdate();
}

function handleTravelFullReset() {
    const te = state.travelEvent;
    te.level = 1;
    te.isFailed = false;
    te.isTransitioning = false;
    te.isFinished = false;
    // Clear all statistics to initial state
    te.stats = {
        totalGames: 1,
        totalSpentGold: 0,
        totalSpentGem: 0,
        totalEarnedDice: 0,
        totalEarnedGem: 0,
        totalEarnedGold: 0
    };
    generateTravelBoxes();
    sendUpdate();
}

function handleTravelGiveup() {
    const te = state.travelEvent;
    te.level = 1;
    te.isFailed = false;
    te.isTransitioning = false;
    generateTravelBoxes();
    sendUpdate();
}

function grantTravelReward(type, value, isMilestone = false) {
    const te = state.travelEvent;
    const source = isMilestone ? "關卡獎勵" : "開箱獎勵";
    const mappedType = type.toUpperCase() === 'COIN' ? 'GOLD' : type.toUpperCase();

    if (mappedType === 'GOLD') {
        addMoney(value, 'TRAVEL_EVENT', `旅行家活動 ${source}：金幣 ${value}`);
        te.stats.totalEarnedGold += value;
    } else if (mappedType === 'GEM') {
        state.gems += value;
        te.stats.totalEarnedGem += value;
        recordLog({ turn: state.turn, position: state.position, event: "GEM", delta_gold: 0, current_balance: state.money, detail: `旅行家活動 ${source}：寶石 ${value}` });
    } else if (mappedType === 'DICE') {
        state.dice += value;
        state.totalEarnedDice += value;
        te.stats.totalEarnedDice += value;
        state.earnedDiceBreakdown['旅行家'] = (state.earnedDiceBreakdown['旅行家'] || 0) + value;
        recordLog({ turn: state.turn, position: state.position, event: "DICE", delta_gold: 0, current_balance: state.money, detail: `旅行家活動 ${source}：骰子 ${value}` });
    }
}

// --- Archaeology Activity Logic [NEW] ---
function initArchaeologyStage() {
    const arch = state.archaeology;
    const stageCfg = arch.itemConfigs.find(c => c.level === arch.level);
    if (!stageCfg) return;

    arch.currentStageConfig = stageCfg;
    const [rows, cols] = stageCfg.stage_area.split('_').map(Number);

    // Initialize empty board
    arch.board = new Array(rows * cols).fill(null).map(() => ({ isRevealed: false, itemId: null, instanceId: null }));
    arch.targetItems = [];

    // Items to place: filter keys that start with 'cell_' and have value > 0
    const itemsToPlace = [];
    Object.keys(stageCfg).forEach(key => {
        if (key.startsWith('cell_') && stageCfg[key] > 0) {
            const count = stageCfg[key];
            const sizeStr = key.replace('cell_', ''); // "4_1", "2_2", etc.
            for (let i = 0; i < count; i++) {
                itemsToPlace.push({ id: key, size: sizeStr });
            }
        }
    });

    // Place items randomly
    itemsToPlace.forEach((item, index) => {
        let placed = false;
        let attempts = 0;
        const [w_base, h_base] = item.size.split('_').map(Number);

        while (!placed && attempts < 100) {
            attempts++;
            // Random orientation
            const isVertical = Math.random() > 0.5;
            const w = isVertical ? h_base : w_base;
            const h = isVertical ? w_base : h_base;

            const r = Math.floor(Math.random() * (rows - h + 1));
            const c = Math.floor(Math.random() * (cols - w + 1));

            if (r + h > rows || c + w > cols) continue;

            // Check overlap
            let overlap = false;
            for (let i = 0; i < h; i++) {
                for (let j = 0; j < w; j++) {
                    const cellIdx = (r + i) * cols + (c + j);
                    if (arch.board[cellIdx].itemId !== null) {
                        overlap = true;
                        break;
                    }
                }
                if (overlap) break;
            }

            if (!overlap) {
                // Place it
                const instanceId = index;
                const cells = [];
                for (let i = 0; i < h; i++) {
                    for (let j = 0; j < w; j++) {
                        const idx = (r + i) * cols + (c + j);
                        arch.board[idx].itemId = item.id;
                        arch.board[idx].instanceId = instanceId;
                        cells.push(idx);
                    }
                }
                arch.targetItems.push({
                    id: item.id,
                    instanceId: instanceId,
                    size: item.size,
                    cells: cells,
                    isFound: false,
                    w: w,
                    h: h
                });
                placed = true;
            }
        }
    });
}

function handleArchaeologyDig(index) {
    const arch = state.archaeology;
    if (arch.isFinished || arch.isTransitioning || arch.tokens <= 0) return;
    if (arch.board[index].isRevealed) return;

    arch.tokens--;
    arch.stats.totalTokensUsed++;
    arch.board[index].isRevealed = true;

    if (arch.board[index].itemId === null) {
        arch.stats.totalEmptyDigs++;
    }

    const cell = arch.board[index];
    if (cell.itemId) {
        // Check if item is now fully found
        const item = arch.targetItems.find(it => it.id === cell.itemId && it.instanceId === cell.instanceId);
        if (item) {
            const allRevealed = item.cells.every(idx => arch.board[idx].isRevealed);
            if (allRevealed) {
                item.isFound = true;
                arch.foundItemsCount++;

                // Check level completion
                const allItemsFound = arch.targetItems.every(it => it.isFound);
                if (allItemsFound) {
                    processArchaeologyLevelComplete();
                }
            }
        }
    }

    sendUpdate();
}

function processArchaeologyLevelComplete() {
    const arch = state.archaeology;
    if (arch.isTransitioning || arch.isFinished) return;
    arch.isTransitioning = true;

    // Remember if auto was on
    const wasAuto = arch.autoDig;

    // Grant Reward
    const reward = arch.rewardConfigs.find(r => r.group === arch.group && r.level === arch.level);
    if (reward) {
        grantArchaeologyReward(reward.reward_type, reward.reward_spec, reward.reward_value, `考古學關卡 ${arch.level} 獎勵`);
    }

    // Check if there is a next level in the CURRENT group
    const nextLevelRewardExists = arch.rewardConfigs.some(r => r.group === arch.group && r.level === arch.level + 1);

    if (nextLevelRewardExists) {
        const delay = 2000 / arch.speed;
        setTimeout(() => {
            arch.level++;
            initArchaeologyStage();
            arch.isTransitioning = false;
            sendUpdate();
            // Resume Auto if it was on
            if (wasAuto) {
                arch.autoDig = true;
                runArchaeologyAuto();
            }
        }, delay);
    } else {
        // No more levels in this group - Hard Stop
        arch.isFinished = true;
        arch.isTransitioning = false;
        arch.autoDig = false;
    }

    sendUpdate();
}

function runArchaeologyAuto() {
    const arch = state.archaeology;
    if (!arch.autoDig || arch.isTransitioning || arch.isFinished) return;
    if (arch.tokens <= 0) {
        arch.autoDig = false;
        sendUpdate();
        return;
    }

    const [rows, cols] = arch.currentStageConfig.stage_area.split('_').map(Number);
    let targetIndex = -1;

    // 1. Priority: Find hit cells of items that are NOT fully found yet (Focus mode)
    const partialItems = arch.targetItems.filter(item => !item.isFound && item.cells.some(idx => arch.board[idx].isRevealed));
    if (partialItems.length > 0) {
        // Pick the item with most revealed cells first to finish it quickly
        partialItems.sort((a, b) => {
            const revA = a.cells.filter(idx => arch.board[idx].isRevealed).length;
            const revB = b.cells.filter(idx => arch.board[idx].isRevealed).length;
            return revB - revA;
        });

        for (const item of partialItems) {
            const unrevealedIdx = item.cells.find(idx => !arch.board[idx].isRevealed);
            if (unrevealedIdx !== undefined) {
                targetIndex = unrevealedIdx;
                break;
            }
        }
    }

    // 2. Fallback: Heatmap-based search (Search mode)
    if (targetIndex === -1) {
        const remainingItems = arch.targetItems.filter(item => !item.isFound);
        if (remainingItems.length === 0) {
            arch.autoDig = false;
            sendUpdate();
            return;
        }

        const heatmap = new Float32Array(rows * cols);

        // For each item to be found, check all potential valid placements
        remainingItems.forEach(item => {
            const [w_base, h_base] = item.id.replace('cell_', '').split('_').map(Number);
            const sizes = (w_base === h_base) ? [{ w: w_base, h: h_base }] : [{ w: w_base, h: h_base }, { w: h_base, h: w_base }];

            sizes.forEach(size => {
                const { w, h } = size;
                for (let r = 0; r <= rows - h; r++) {
                    for (let c = 0; c <= cols - w; c++) {
                        // Check if item CAN be placed here (no revealed cells in the area)
                        let possible = true;
                        for (let ir = 0; ir < h; ir++) {
                            for (let ic = 0; ic < w; ic++) {
                                const idx = (r + ir) * cols + (c + ic);
                                if (arch.board[idx].isRevealed) {
                                    possible = false;
                                    break;
                                }
                            }
                            if (!possible) break;
                        }

                        if (possible) {
                            // If possible, increase weight of all covered cells
                            // We give a slight boost to centers of this placement
                            for (let ir = 0; ir < h; ir++) {
                                for (let ic = 0; ic < w; ic++) {
                                    const idx = (r + ir) * cols + (c + ic);
                                    // Base score: 1 count per placement
                                    // Modifier for "center-ness" within the placement itself
                                    const dr = Math.abs(ir - (h - 1) / 2);
                                    const dc = Math.abs(ic - (w - 1) / 2);
                                    const distScore = 1.0 - (dr + dc) * 0.1;
                                    heatmap[idx] += Math.max(0.1, distScore);
                                }
                            }
                        }
                    }
                }
            });
        });

        // Pick max score
        let maxScore = -1;
        let candidates = [];
        for (let i = 0; i < heatmap.length; i++) {
            if (arch.board[i].isRevealed) continue;
            if (heatmap[i] > maxScore + 0.0001) {
                maxScore = heatmap[i];
                candidates = [i];
            } else if (Math.abs(heatmap[i] - maxScore) < 0.0001) {
                candidates.push(i);
            }
        }

        if (candidates.length > 0) {
            // Pick a candidate
            // For spreading, we could pick further from current revealed? 
            // but heatmap naturally does it. Random is fine among ties.
            targetIndex = candidates[Math.floor(Math.random() * candidates.length)];
        }
    }

    if (targetIndex !== -1) {
        handleArchaeologyDig(targetIndex);
        // Delay before next auto move
        if (arch.autoDig && !arch.isTransitioning) {
            const delay = 500 / arch.speed; // Fast enough for 50x
            setTimeout(runArchaeologyAuto, delay);
        }
    } else {
        arch.autoDig = false;
        sendUpdate();
    }
}

function grantArchaeologyReward(type, spec, value, source) {
    const arch = state.archaeology;
    if (type === 'DICE') {
        state.dice += value;
        state.totalEarnedDice += value;
        state.earnedDiceBreakdown[source] = (state.earnedDiceBreakdown[source] || 0) + value;
        if (arch) arch.stats.totalEarnedDice += value;
    } else if (type === 'COIN') {
        addMoney(value, 'INCOME', source);
        if (arch) arch.stats.totalEarnedGold += value;
    } else if (type === 'GEM') {
        state.gems += value;
        if (arch) arch.stats.totalEarnedGem += value;
    }

    recordLog({
        turn: state.turn,
        position: state.position,
        event: "EVENT_REWARD",
        detail: `${source}: ${type} x${value}`,
        delta_gold: type === 'COIN' ? value : 0,
        current_balance: state.money
    });
}

// --- Magic Plant Logic [NEW] ---
function initMagicPlantState(config) {
    if (config) state.magicPlant.rewardConfig = config;
}

function handleMagicPlantWater() {
    const mp = state.magicPlant;
    const maxLevel = mp.rewardConfig.length || 10;

    // Stop if already watered for all stages or no tokens
    if (mp.stats.totalWatered >= maxLevel || mp.tokens <= 0) return;

    mp.tokens--;
    mp.points++;
    mp.stats.totalWatered++;

    // Add fruit for the CURRENT level
    if (!mp.availableFruits.includes(mp.level)) {
        mp.availableFruits.push(mp.level);
    }

    // Watering Reward
    const cfg = mp.rewardConfig.find(c => c.level === mp.level);
    if (cfg) {
        grantMagicReward(cfg.reward_type, cfg.reward_spec, cfg.reward_value, "澆水獎勵");
    }

    // Level up to next stage
    if (mp.level < maxLevel) {
        mp.level++;
    }

    sendUpdate();
}

function handleMagicPlantHarvest(level) {
    const mp = state.magicPlant;
    const targetLevel = level;
    if (!targetLevel || !mp.availableFruits.includes(targetLevel)) return;

    const cfg = mp.rewardConfig.find(c => c.level === targetLevel);
    if (!cfg) return;

    const costType = (cfg.bonus_type || "").toUpperCase();
    const costValue = parseInt(cfg.bonus_value) || 0;

    if (costType === 'COIN' || costType === 'GOLD') {
        if (state.money >= costValue) {
            state.money -= costValue;
            mp.stats.totalSpentGold += costValue;
        } else {
            self.postMessage({ type: 'MAGIC_PLANT_INSUFFICIENT_FUNDS', payload: { currency: 'GOLD', amount: costValue } });
            return;
        }
    } else if (costType === 'GEM') {
        if (state.gems >= costValue) {
            state.gems -= costValue;
            mp.stats.totalSpentGem += costValue;
        } else {
            self.postMessage({ type: 'MAGIC_PLANT_INSUFFICIENT_FUNDS', payload: { currency: 'GEM', amount: costValue } });
            return;
        }
    }

    // Success: Remove fruit and grant reward
    mp.availableFruits = mp.availableFruits.filter(lvl => lvl !== targetLevel);
    grantMagicReward(cfg.fruit_reward_type, cfg.fruit_reward_spec, cfg.fruit_reward_value, `摘取第 ${targetLevel} 階果實獎勵`);
    sendUpdate();
}

function handleMagicPlantReset() {
    const mp = state.magicPlant;
    mp.level = 1;
    mp.points = 0;
    mp.tokens = 100;
    mp.stats = { totalWatered: 0, totalSpentGold: 0, totalSpentGem: 0, totalEarnedDice: 0, totalEarnedGold: 0, totalEarnedGem: 0 };
    mp.availableFruits = [];
    sendUpdate();
}

function grantMagicReward(type, spec, value, source) {
    const mp = state.magicPlant;
    const utype = (type || "").toUpperCase();
    if (utype === 'DICE') {
        state.dice += value;
        state.totalEarnedDice += value;
        state.earnedDiceBreakdown['魔法植物'] = (state.earnedDiceBreakdown['魔法植物'] || 0) + value;
        mp.stats.totalEarnedDice += value;
    } else if (utype === 'COIN' || utype === 'GOLD') {
        addMoney(value, 'INCOME', source);
        mp.stats.totalEarnedGold += value;
    } else if (utype === 'GEM') {
        state.gems += value;
        mp.stats.totalEarnedGem += value;
    }

    recordLog({
        turn: state.turn,
        position: state.position,
        event: "EVENT_REWARD",
        detail: `魔法植物 ${source}：${type} x${value}`,
        delta_gold: (utype === 'COIN' || utype === 'GOLD') ? value : 0,
        current_balance: state.money
    });
}

