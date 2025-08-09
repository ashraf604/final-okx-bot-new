
// bot/tasks.js

const db = require("./db_logic.js");
const api = require("../utils/api.js");
const { formatNumber, sendDebugMessage } = require("../utils/helpers.js");
const { bot } = require("../botInstance.js");
const { InlineKeyboard } = require("grammy");

let monitoringActive = false;

function startBackgroundTasks() {
    if (monitoringActive) {
        console.log("Background tasks already running.");
        return;
    }
    
    monitoringActive = true;
    console.log("Starting background monitoring tasks...");
    
    // مراقبة تغيرات الرصيد كل 30 ثانية
    setInterval(monitorBalanceChanges, 30000);
    
    // فحص تنبيهات الأسعار كل دقيقة
    setInterval(checkPriceAlerts, 60000);
    
    // حفظ التاريخ كل ساعة
    setInterval(saveHourlySnapshot, 3600000);
    
    // حفظ التاريخ اليومي كل يوم في منتصف الليل
    setInterval(saveDailySnapshot, 86400000);
}

async function monitorBalanceChanges() {
    try {
        await sendDebugMessage("Starting balance monitoring cycle...");
        
        const prices = await api.getMarketPrices();
        if (!prices) {
            await sendDebugMessage("Failed to fetch market prices for monitoring.");
            return;
        }
        
        const { assets: currentBalance, total: newTotalPortfolioValue } = await api.getPortfolio(prices);
        if (!currentBalance) {
            await sendDebugMessage("Failed to fetch current portfolio for monitoring.");
            return;
        }
        
        const previousState = await db.loadBalanceState();
        const previousBalance = previousState.balances || {};
        
        let stateNeedsUpdate = false;
        const alertSettings = await db.loadAlertSettings();
        
        for (const asset of currentBalance) {
            if (asset.amount <= 0) continue;
            
            const previousAmount = previousBalance[asset.asset] || 0;
            const amountDiff = asset.amount - previousAmount;
            
            if (Math.abs(amountDiff) > 0.000001) {
                stateNeedsUpdate = true;
                await sendDebugMessage(`Balance change detected for ${asset.asset}: ${amountDiff > 0 ? '+' : ''}${formatNumber(amountDiff, 6)}`);
                
                const threshold = alertSettings.overrides[asset.asset] || alertSettings.global;
                const currentPrice = prices[`${asset.asset}-USDT`]?.price || 0;
                
                if (Math.abs(amountDiff) * currentPrice > 10) {
                    const settings = await db.loadSettings();
                    const tradeType = amountDiff > 0 ? "شراء" : "بيع";
                    const emoji = amountDiff > 0 ? "🟢" : "🔴";
                    
                    const tradeValue = Math.abs(amountDiff) * currentPrice;
                    
                    const privateTradeAnalysisText = `${emoji} *تم رصد صفقة ${tradeType}*\n\n` +
                        `💎 *العملة:* \`${asset.asset}\`\n` +
                        `📊 *الكمية:* \`${formatNumber(Math.abs(amountDiff), 6)}\`\n` +
                        `💰 *السعر التقريبي:* \`$${formatNumber(currentPrice, 4)}\`\n` +
                        `💵 *القيمة الإجمالية:* \`$${formatNumber(tradeValue)}\`\n\n` +
                        `📈 *الرصيد الجديد:* \`${formatNumber(asset.amount, 6)} ${asset.asset}\``;
                    
                    if (settings.autoPostToChannel) {
                        try {
                            await bot.api.sendMessage(process.env.TARGET_CHANNEL_ID, privateTradeAnalysisText, { parse_mode: "Markdown" });
                        } catch (e) {
                            console.error("Failed to auto-post to channel:", e);
                        }
                    } else {
                        const hiddenMarker = `<CHANNEL_POST>${JSON.stringify(privateTradeAnalysisText)}</CHANNEL_POST>`;
                        const confirmationKeyboard = new InlineKeyboard()
                            .text("✅ نشر في القناة", "publish_trade")
                            .text("❌ تجاهل", "ignore_trade");
                        
                        await bot.api.sendMessage(process.env.AUTHORIZED_USER_ID, 
                            `*هل تريد نشر هذه الصفقة في القناة؟*\n\n${privateTradeAnalysisText}${hiddenMarker}`, 
                            { parse_mode: "Markdown", reply_markup: confirmationKeyboard });
                    }
                }
            }
        }
        
        if (stateNeedsUpdate) {
            const newBalanceState = {};
            currentBalance.forEach(asset => {
                newBalanceState[asset.asset] = asset.amount;
            });
            
            await db.saveBalanceState({ balances: newBalanceState, totalValue: newTotalPortfolioValue });
            await sendDebugMessage(`State updated after processing all detected changes.`);
        } else {
            if (Math.abs(previousState.totalValue - newTotalPortfolioValue) > 1) {
                const newBalanceState = {};
                currentBalance.forEach(asset => {
                    newBalanceState[asset.asset] = asset.amount;
                });
                
                await db.saveBalanceState({ balances: newBalanceState, totalValue: newTotalPortfolioValue });
                await sendDebugMessage(`State updated due to portfolio value change.`);
            }
        }
    } catch (e) {
        console.error("CRITICAL ERROR in monitorBalanceChanges:", e);
    }
}

async function checkPriceAlerts() {
    try {
        const alerts = await db.loadAlerts();
        if (alerts.length === 0) return;
        
        const prices = await api.getMarketPrices();
        if (!prices) return;
        
        const remainingAlerts = [];
        let alertsTriggered = false;
        
        for (const alert of alerts) {
            const currentPrice = (prices[alert.instId] || {}).price;
            if (currentPrice === undefined) {
                remainingAlerts.push(alert);
                continue;
            }
            
            let triggered = false;
            if ((alert.condition === '>' && currentPrice >= alert.price) ||
                (alert.condition === '<' && currentPrice <= alert.price)) {
                triggered = true;
                alertsTriggered = true;
                
                const message = `🚨 *تنبيه سعر!*\n\n` +
                    `💎 *العملة:* \`${alert.instId}\`\n` +
                    `💰 *السعر الحالي:* \`$${formatNumber(currentPrice, 4)}\`\n` +
                    `🎯 *السعر المستهدف:* \`${alert.condition} $${formatNumber(alert.price, 4)}\`\n\n` +
                    `*تم تحقيق الهدف وحذف التنبيه تلقائياً.*`;
                
                await bot.api.sendMessage(process.env.AUTHORIZED_USER_ID, message, { parse_mode: "Markdown" });
            }
            
            if (!triggered) {
                remainingAlerts.push(alert);
            }
        }
        
        if (alertsTriggered) {
            await db.saveAlerts(remainingAlerts);
        }
    } catch (e) {
        console.error("Error in checkPriceAlerts:", e);
    }
}

async function saveHourlySnapshot() {
    try {
        const prices = await api.getMarketPrices();
        if (!prices) return;
        
        const { total } = await api.getPortfolio(prices);
        if (total === undefined) return;
        
        const timestamp = new Date().toISOString();
        await db.saveHourlyHistoryEntry({
            timestamp,
            total,
            hour: new Date().getHours()
        });
        
        // حذف البيانات القديمة (أكثر من 48 ساعة)
        const hourlyHistory = await db.loadHourlyHistory();
        const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const filteredHistory = hourlyHistory.filter(entry => 
            new Date(entry.timestamp) > cutoffTime
        );
        
        if (filteredHistory.length !== hourlyHistory.length) {
            // حفظ التاريخ المفلتر
            // (سنحتاج لتنفيذ وظيفة saveHourlyHistory في db_logic.js)
        }
        
        await sendDebugMessage(`Hourly snapshot saved: $${formatNumber(total)}`);
    } catch (e) {
        console.error("Error in saveHourlySnapshot:", e);
    }
}

async function saveDailySnapshot() {
    try {
        const prices = await api.getMarketPrices();
        if (!prices) return;
        
        const { total } = await api.getPortfolio(prices);
        if (total === undefined) return;
        
        const date = new Date().toISOString().split('T')[0];
        await db.saveHistoryEntry({
            date,
            total,
            timestamp: new Date().toISOString()
        });
        
        await sendDebugMessage(`Daily snapshot saved for ${date}: $${formatNumber(total)}`);
        
        // إرسال الملخص اليومي إذا كان مفعلاً
        const settings = await db.loadSettings();
        if (settings.dailySummary) {
            const history = await db.loadHistory();
            if (history.length >= 2) {
                const today = history[history.length - 1];
                const yesterday = history[history.length - 2];
                
                const change = today.total - yesterday.total;
                const changePercent = yesterday.total > 0 ? (change / yesterday.total) * 100 : 0;
                const emoji = change >= 0 ? '🟢⬆️' : '🔴⬇️';
                const sign = change >= 0 ? '+' : '';
                
                const summaryMessage = `📊 *الملخص اليومي*\n\n` +
                    `📅 *التاريخ:* \`${date}\`\n` +
                    `💰 *القيمة الحالية:* \`$${formatNumber(today.total)}\`\n` +
                    `📈 *التغير اليومي:* ${emoji} \`${sign}${formatNumber(change)}\` (\`${sign}${formatNumber(changePercent, 2)}%\`)\n\n` +
                    `*تم إنشاء التقرير تلقائياً*`;
                
                await bot.api.sendMessage(process.env.AUTHORIZED_USER_ID, summaryMessage, { parse_mode: "Markdown" });
            }
        }
    } catch (e) {
        console.error("Error in saveDailySnapshot:", e);
    }
}

module.exports = {
    startBackgroundTasks,
    monitorBalanceChanges,
    checkPriceAlerts,
    saveHourlySnapshot,
    saveDailySnapshot
};
