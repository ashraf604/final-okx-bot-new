// bot/handlers.js

const { Keyboard, InlineKeyboard } = require("grammy");
const { bot } = require("../botInstance.js");
const { getTechnicalAnalysis, getHistoricalPerformance } = require("./analysis.js");
const { formatNumber, calculatePerformanceStats, createChartUrl } = require("../utils/helpers.js");
const api = require("../utils/api.js");
const db = require("./db_logic.js");



function formatPortfolioMsg(assets, total, capital) {
    const currentTime = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
    const pnl = total - capital;
    const pnlPercent = capital > 0 ? (pnl / capital) * 100 : 0;
    const pnlEmoji = pnl >= 0 ? '🟢⬆️' : '🔴⬇️';
    const pnlSign = pnl >= 0 ? '+' : '';

    // تحديد مستوى الأداء
    let performanceLevel = "";
    if (pnlPercent > 10) performanceLevel = "🔥 أداء ممتاز";
    else if (pnlPercent > 5) performanceLevel = "✨ أداء جيد جداً";
    else if (pnlPercent > 0) performanceLevel = "✅ أداء إيجابي";
    else if (pnlPercent > -5) performanceLevel = "⚠️ انخفاض طفيف";
    else performanceLevel = "❌ يتطلب مراجعة";

    let msg = `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 *التقرير الشامل للمحفظة الاستثمارية*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `💎 *ملخص المحفظة:*\n`;
    msg += `┏━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
    msg += `┃ 💰 القيمة الإجمالية: \`$${formatNumber(total)}\`\n`;
    msg += `┃ 💼 رأس المال: \`$${formatNumber(capital)}\`\n`;
    msg += `┃ 📈 الربح/الخسارة: ${pnlEmoji} \`${pnlSign}${formatNumber(pnl)}\`\n`;
    msg += `┃ 📊 النسبة المئوية: \`${pnlSign}${formatNumber(pnlPercent)}%\`\n`;
    msg += `┃ 🎯 مستوى الأداء: ${performanceLevel}\n`;
    msg += `┗━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;

    // إحصائيات متقدمة
    const topAsset = assets.reduce((max, asset) => asset.value > max.value ? asset : max, assets[0]);
    const diversificationScore = assets.length >= 5 ? "🌟 متنوعة" : assets.length >= 3 ? "⚖️ متوسطة" : "⚠️ محدودة";

    msg += `📊 *إحصائيات متقدمة:*\n`;
    msg += `▫️ عدد الأصول: \`${assets.length}\` أصل\n`;
    msg += `▫️ أكبر أصل: \`${topAsset?.asset || 'غير متاح'}\` (\`$${formatNumber(topAsset?.value || 0)}\`)\n`;
    msg += `▫️ درجة التنويع: ${diversificationScore}\n\n`;

    msg += `📋 *تفاصيل الأصول:*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    // ترتيب الأصول حسب القيمة (من الأكبر للأصغر)
    const sortedAssets = assets.sort((a, b) => b.value - a.value);

    sortedAssets.forEach((asset, index) => {
        const percentage = total > 0 ? (asset.value / total) * 100 : 0;
        const rank = index + 1;
        const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🔹";

        msg += `\n${rankEmoji} *${asset.asset}* (#${rank})\n`;
        msg += `┌─────────────────────────┐\n`;
        msg += `│ 💎 الكمية: \`${formatNumber(asset.amount, 6)}\`\n`;
        msg += `│ 💵 السعر: \`$${formatNumber(asset.price, 4)}\`\n`;
        msg += `│ 💰 القيمة: \`$${formatNumber(asset.value)}\`\n`;
        msg += `│ 📊 النسبة: \`${formatNumber(percentage, 1)}%\`\n`;
        msg += `└─────────────────────────┘\n`;
    });

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⏰ آخر تحديث: \`${currentTime}\`\n`;
    msg += `🤖 تم إنشاؤه بواسطة بوت OKX المطور\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━`;

    return msg;
}

// This variable needs to be accessible by this module
let waitingState = null;

const mainKeyboard = new Keyboard()
    .text("📊 عرض المحفظة").text("📈 أداء المحفظة").row()
    .text("ℹ️ معلومات عملة").text("🔔 ضبط تنبيه").row()
    .text("🧮 حاسبة PnL").text("💎 أفضل الأصول").row()
    .text("📊 إحصائيات سريعة").text("🚀 تحليل السوق").row()
    .text("⚙️ الإعدادات").text("ℹ️ مساعدة").resized();

async function sendSettingsMenu(ctx) {
    try {
        const settings = await db.loadSettings();
        const settingsKeyboard = new InlineKeyboard()
            .text("💰 تعيين رأس المال", "set_capital")
            .text("💼 عرض المراكز المفتوحة", "view_positions").row()
            .text("🚨 إدارة تنبيهات الحركة", "manage_movement_alerts")
            .text("🗑️ حذف تنبيه سعر", "delete_alert").row()
            .text(`📰 الملخص اليومي: ${settings.dailySummary ? '✅' : '❌'}`, "toggle_summary").row()
            .text(`🚀 النشر التلقائي للقناة: ${settings.autoPostToChannel ? '✅' : '❌'}`, "toggle_autopost")
            .text(`🐞 وضع التشخيص: ${settings.debugMode ? '✅' : '❌'}`, "toggle_debug").row()
            .text("🔥 حذف جميع بيانات البوت 🔥", "delete_all_data");
        const text = "⚙️ *لوحة التحكم والإعدادات الرئيسية*";

        try {
            await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: settingsKeyboard });
        } catch {
            await ctx.reply(text, { parse_mode: "Markdown", reply_markup: settingsKeyboard });
        }
    } catch (e) {
        console.error("CRITICAL ERROR in sendSettingsMenu:", e);
        await ctx.reply(`❌ حدث خطأ فادح أثناء فتح قائمة الإعدادات.\n\nرسالة الخطأ: ${e.message}`);
    }
}

async function sendMovementAlertsMenu(ctx) {
    try {
        const alertSettings = await db.loadAlertSettings();
        const text = `🚨 *إدارة تنبيهات حركة الأسعار*\n\nتستخدم هذه الإعدادات لمراقبة التغيرات المئوية في الأسعار وإعلامك.\n\n- *النسبة العامة الحالية:* سيتم تنبيهك لأي أصل يتحرك بنسبة \`${alertSettings.global}%\` أو أكثر.\n- يمكنك تعيين نسبة مختلفة لعملة معينة لتجاوز الإعداد العام.`;
        const keyboard = new InlineKeyboard()
            .text("📊 تعديل النسبة العامة", "set_global_alert").row()
            .text("💎 تعديل نسبة عملة محددة", "set_coin_alert").row()
            .text("📄 عرض الإعدادات الحالية", "view_movement_alerts").row()
            .text("🔙 العودة إلى الإعدادات", "back_to_settings");

        try {
            await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
        } catch {
            await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
        }
    } catch (e) {
        console.error("CRITICAL ERROR in sendMovementAlertsMenu:", e);
        await ctx.reply(`❌ حدث خطأ فادح أثناء فتح قائمة تنبيهات الحركة.\n\nرسالة الخطأ: ${e.message}`);
    }
}

function initializeHandlers() {
    bot.command("start", async (ctx) => {
        const welcomeMsg = `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🤖 *بوت OKX التحليلي المطور*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🎉 *أهلاً وسهلاً بك!*\n\n` +
            `🚀 *الإصدار:* v81 - المطور والمحسن\n` +
            `📊 *الميزات الجديدة:*\n` +
            `• تصميم محسّن للرسائل\n` +
            `• إحصائيات متقدمة\n` +
            `• تحليل أفضل الأصول\n` +
            `• حاسبة ربح وخسارة مطورة\n` +
            `• واجهة مستخدم محسّنة\n\n` +
            `💎 *أنا هنا لمساعدتك في:*\n` +
            `▫️ تتبع محفظتك الاستثمارية\n` +
            `▫️ تحليل أداء الأصول\n` +
            `▫️ إنشاء تقارير مفصلة\n` +
            `▫️ ضبط التنبيهات الذكية\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔥 *ابدأ الآن واستكشف الميزات الجديدة!*`;
        await ctx.reply(welcomeMsg, { parse_mode: "Markdown", reply_markup: mainKeyboard });
    });

    bot.command("settings", async (ctx) => await sendSettingsMenu(ctx));

    bot.command("pnl", async (ctx) => {
        const args = ctx.match.trim().split(/\s+/);
        if (args.length !== 3 || args[0] === '') {
            return await ctx.reply(`❌ *صيغة غير صحيحة*\n\n` + 
                `*يرجى استخدام الصيغة الصحيحة للأمر:*\n\n` + 
                `\`/pnl <سعر_الشراء> <سعر_البيع> <الكمية>\`\n\n` + 
                `*أمثلة:*\n` +
                `\`/pnl 45000 50000 0.1\`\n` +
                `\`/pnl 3000 3500 2\``, 
                { parse_mode: "Markdown" });
        }

        const [buyPrice, sellPrice, quantity] = args.map(parseFloat);
        if (isNaN(buyPrice) || isNaN(sellPrice) || isNaN(quantity) || buyPrice <= 0 || sellPrice <= 0 || quantity <= 0) {
            return await ctx.reply("❌ *خطأ:* تأكد من أن جميع القيم هي أرقام موجبة صحيحة.", { parse_mode: "Markdown" });
        }

        const totalInvestment = buyPrice * quantity;
        const totalSaleValue = sellPrice * quantity;
        const profitOrLoss = totalSaleValue - totalInvestment;
        const pnlPercentage = (profitOrLoss / totalInvestment) * 100;
        const pnlSign = profitOrLoss >= 0 ? '+' : '';

        // تحديد نوع النتيجة
        let resultEmoji = "";
        let resultText = "";
        if (profitOrLoss > 0) {
            resultEmoji = "🎉";
            resultText = "ربح ممتاز";
        } else if (profitOrLoss === 0) {
            resultEmoji = "⚖️";
            resultText = "تعادل";
        } else {
            resultEmoji = "📉";
            resultText = "خسارة";
        }

        let responseMessage = `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        responseMessage += `🧮 *حاسبة الربح والخسارة المطورة*\n`;
        responseMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        responseMessage += `📝 *المدخلات:*\n`;
        responseMessage += `┌─────────────────────────┐\n`;
        responseMessage += `│ 💵 سعر الشراء: \`$${formatNumber(buyPrice, 4)}\`\n`;
        responseMessage += `│ 💰 سعر البيع: \`$${formatNumber(sellPrice, 4)}\`\n`;
        responseMessage += `│ 📊 الكمية: \`${formatNumber(quantity, 6)}\`\n`;
        responseMessage += `└─────────────────────────┘\n\n`;

        responseMessage += `📊 *التحليل المالي:*\n`;
        responseMessage += `┌─────────────────────────┐\n`;
        responseMessage += `│ 💼 رأس المال المستثمر: \`$${formatNumber(totalInvestment)}\`\n`;
        responseMessage += `│ 💎 قيمة البيع الإجمالية: \`$${formatNumber(totalSaleValue)}\`\n`;
        responseMessage += `│ 📈 صافي الربح/الخسارة: \`${pnlSign}$${formatNumber(Math.abs(profitOrLoss))}\`\n`;
        responseMessage += `│ 📊 النسبة المئوية: \`${pnlSign}${formatNumber(pnlPercentage)}%\`\n`;
        responseMessage += `└─────────────────────────┘\n\n`;

        responseMessage += `${resultEmoji} *النتيجة النهائية: ${resultText}*\n\n`;

        // إضافة نصائح
        if (profitOrLoss > 0) {
            responseMessage += `💡 *نصيحة:* أداء جيد! فكر في جني الأرباح أو إعادة الاستثمار.\n`;
        } else if (profitOrLoss < 0) {
            responseMessage += `💡 *نصيحة:* قم بمراجعة استراتيجية الاستثمار وإدارة المخاطر.\n`;
        }

        responseMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        responseMessage += `⏰ تم الحساب في: ${new Date().toLocaleString('ar-EG')}`;

        await ctx.reply(responseMessage, { parse_mode: "Markdown" });
    });

    bot.on("callback_query:data", async (ctx) => {
        try {
            await ctx.answerCallbackQuery();
            const data = ctx.callbackQuery.data;
            if (!ctx.callbackQuery.message) { console.log("Callback query has no message, skipping."); return; }

            if (data.startsWith("chart_")) {
                const period = data.split('_')[1];
                await ctx.editMessageText("⏳ جاري إنشاء تقرير الأداء...");
                let history, periodLabel, periodData;
                if (period === '24h') { history = await db.loadHourlyHistory(); periodData = history.slice(-24); }
                else if (period === '7d') { history = await db.loadHistory(); periodLabel = "آخر 7 أيام"; periodData = history.slice(-7).map(h => ({ label: h.date.slice(5), total: h.total })); }
                else if (period === '30d') { history = await db.loadHistory(); periodLabel = "آخر 30 يومًا"; periodData = history.slice(-30).map(h => ({ label: h.date.slice(5), total: h.total })); }
                if (!periodData || periodData.length < 2) { await ctx.editMessageText("ℹ️ لا توجد بيانات كافية لإنشاء تقرير لهذه الفترة."); return; }
                const stats = calculatePerformanceStats(periodData);
                if (!stats) { await ctx.editMessageText("ℹ️ لا توجد بيانات كافية لإنشاء تقرير لهذه الفترة."); return; }
                const chartUrl = createChartUrl(periodData, periodLabel, stats.pnl);
                const pnlEmoji = stats.pnl >= 0 ? '🟢⬆️' : '🔴⬇️';
                const pnlSign = stats.pnl >= 0 ? '+' : '';
                const caption = `📊 *تحليل أداء المحفظة | ${periodLabel}*\n\n` + `📈 **النتيجة:** ${pnlEmoji} \`${pnlSign}${formatNumber(stats.pnl)}\` (\`${pnlSign}${formatNumber(stats.pnlPercent)}%\`)\n` + `*التغير الصافي: من \`$${formatNumber(stats.startValue)}\` إلى \`$${formatNumber(stats.endValue)}\`*\n\n` + `📝 **ملخص إحصائيات الفترة:**\n` + ` ▫️ *أعلى قيمة وصلت لها المحفظة:* \`$${formatNumber(stats.maxValue)}\`\n` + ` ▫️ *أدنى قيمة وصلت لها المحفظة:* \`$${formatNumber(stats.minValue)}\`\n` + ` ▫️ *متوسط قيمة المحفظة:* \`$${formatNumber(stats.avgValue)}\`\n\n` + `*التقرير تم إنشاؤه في: ${new Date().toLocaleDateString("en-GB").replace(/\//g, '.')}*`;
                try { await ctx.replyWithPhoto(chartUrl, { caption: caption, parse_mode: "Markdown" }); await ctx.deleteMessage(); } catch (e) { console.error("Failed to send chart:", e); await ctx.editMessageText("❌ فشل إنشاء الرسم البياني. قد تكون هناك مشكلة في خدمة الرسوم البيانية."); }
                return;
            }

            if (data.startsWith("publish_")) {
                const originalText = ctx.callbackQuery.message.text;
                let messageForChannel;
                if (data === 'publish_close_report') {
                    const markerStart = originalText.indexOf("<CLOSE_REPORT>");
                    const markerEnd = originalText.indexOf("</CLOSE_REPORT>");
                    if (markerStart !== -1 && markerEnd !== -1) {
                        try { messageForChannel = JSON.parse(originalText.substring(markerStart + 14, markerEnd)); } catch (e) { console.error("Could not parse CLOSE_REPORT JSON"); }
                    }
                } else { // publish_trade
                    const markerStart = originalText.indexOf("<CHANNEL_POST>");
                    const markerEnd = originalText.indexOf("</CHANNEL_POST>");
                    if (markerStart !== -1 && markerEnd !== -1) {
                        try { messageForChannel = JSON.parse(originalText.substring(markerStart + 14, markerEnd)); } catch (e) { console.error("Could not parse CHANNEL_POST JSON"); }
                    }
                }
                if (!messageForChannel) { messageForChannel = "حدث خطأ في استخلاص نص النشر."; }
                try {
                    await bot.api.sendMessage(process.env.TARGET_CHANNEL_ID, messageForChannel, { parse_mode: "Markdown" });
                    await ctx.editMessageText("✅ تم النشر في القناة بنجاح.", { reply_markup: undefined });
                } catch (e) { 
                    console.error("Failed to post to channel:", e); 
                    await ctx.editMessageText("❌ فشل النشر في القناة.", { reply_markup: undefined }); 
                }
                return;
            }

            if (data === "ignore_trade" || data === "ignore_report") { 
                await ctx.editMessageText("❌ تم تجاهل الإشعار ولن يتم نشره.", { reply_markup: undefined }); 
                return; 
            }

            switch (data) {
                case "view_positions":
                    const positions = await db.loadPositions();
                    if (Object.keys(positions).length === 0) { await ctx.editMessageText("ℹ️ لا توجد مراكز مفتوحة قيد التتبع حاليًا.", { reply_markup: new InlineKeyboard().text("🔙 العودة إلى الإعدادات", "back_to_settings") }); } else {
                        let msg = "📄 *قائمة المراكز المفتوحة التي يتم تتبعها تلقائيًا:*\n";
                        for (const symbol in positions) { const pos = positions[symbol]; msg += `\n╭─ *${symbol}*`; const avgBuyPriceText = pos && pos.avgBuyPrice ? `$${formatNumber(pos.avgBuyPrice, 4)}` : 'غير متاح'; const totalAmountText = pos && pos.totalAmountBought ? formatNumber(pos.totalAmountBought, 6) : 'غير متاح'; const openDateText = pos && pos.openDate ? new Date(pos.openDate).toLocaleDateString('en-GB') : 'غير متاح'; msg += `\n├─ *متوسط الشراء:* \`${avgBuyPriceText}\``; msg += `\n├─ *الكمية الإجمالية المشتراة:* \`${totalAmountText}\``; msg += `\n╰─ *تاريخ فتح المركز:* \`${openDateText}\``; }
                        await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 العودة إلى الإعدادات", "back_to_settings") });
                    }
                    break;
                case "back_to_settings": await sendSettingsMenu(ctx); break;
                case "manage_movement_alerts": await sendMovementAlertsMenu(ctx); break;
                case "set_global_alert": waitingState = 'set_global_alert_state'; await ctx.editMessageText("✍️ يرجى إرسال النسبة المئوية العامة الجديدة لتنبيهات الحركة (مثال: `5` لـ 5%)."); break;
                case "set_coin_alert": waitingState = 'set_coin_alert_state'; await ctx.editMessageText("✍️ يرجى إرسال رمز العملة والنسبة المئوية المخصصة لها.\n*مثال لضبط تنبيه عند 2.5% لـ BTC:*\n`BTC 2.5`\n\n*لحذف الإعداد المخصص لعملة ما وإعادتها للنسبة العامة، أرسل نسبة 0.*"); break;
                case "view_movement_alerts": const alertSettings = await db.loadAlertSettings(); let msg_alerts = `🚨 *الإعدادات الحالية لتنبيهات الحركة:*\n\n` + `*النسبة العامة (Global):* \`${alertSettings.global}%\`\n` + `--------------------\n*النسب المخصصة (Overrides):*\n`; if (Object.keys(alertSettings.overrides).length === 0) { msg_alerts += "لا توجد نسب مخصصة حاليًا." } else { for (const coin in alertSettings.overrides) { msg_alerts += `- *${coin}:* \`${alertSettings.overrides[coin]}%\`\n`; } } await ctx.editMessageText(msg_alerts, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 العودة", "manage_movement_alerts") }); break;
                case "set_capital": waitingState = 'set_capital'; await ctx.editMessageText("💰 يرجى إرسال المبلغ الجديد لرأس المال (رقم فقط).", { reply_markup: undefined }); break;
                case "delete_alert": const alerts = await db.loadAlerts(); if (alerts.length === 0) { await ctx.editMessageText("ℹ️ لا توجد تنبيهات سعر محدد مسجلة حاليًا.", { reply_markup: new InlineKeyboard().text("🔙 العودة إلى الإعدادات", "back_to_settings") }); } else { let msg = "🗑️ *قائمة تنبيهات السعر المسجلة:*\n\n"; alerts.forEach((alert, index) => { msg += `*${index + 1}.* \`${alert.instId}\` عندما يكون السعر ${alert.condition === '>' ? 'أعلى من' : 'أقل من'} \`${alert.price}\`\n`; }); msg += "\n*يرجى إرسال رقم التنبيه الذي تود حذفه.*"; waitingState = 'delete_alert_number'; await ctx.editMessageText(msg, { parse_mode: "Markdown" }); } break;
                case "toggle_summary": case "toggle_autopost": case "toggle_debug": { let settings = await db.loadSettings(); if (data === 'toggle_summary') settings.dailySummary = !settings.dailySummary; else if (data === 'toggle_autopost') settings.autoPostToChannel = !settings.autoPostToChannel; else if (data === 'toggle_debug') settings.debugMode = !settings.debugMode; await db.saveSettings(settings); await sendSettingsMenu(ctx); } break;
                case "delete_all_data": waitingState = 'confirm_delete_all'; await ctx.editMessageText("⚠️ *تحذير: هذا الإجراء لا يمكن التراجع عنه!* ⚠️\n\nسيتم حذف جميع بياناتك المخزنة...", { parse_mode: "Markdown", reply_markup: undefined }); setTimeout(() => { if (waitingState === 'confirm_delete_all') waitingState = null; }, 30000); break;
                case "interactive_calc": waitingState = 'interactive_calc'; await ctx.reply("🧮 *أدخل بيانات الحاسبة التفاعلية*\n\n*الصيغة:*\n`سعر_الشراء سعر_البيع الكمية`\n\n*مثال:* `45000 50000 0.1`", { parse_mode: "Markdown" }); break;
                case "track_coin": waitingState = 'track_coin'; await ctx.reply("🔍 *لتتبع عملة جديدة*\n\nيرجى إرسال رمز العملة (مثال: `BTC-USDT`).", { parse_mode: "Markdown" }); break;
                case "view_tracked": const trackedCoins = await db.loadTrackedCoins(); if (trackedCoins.length === 0) { await ctx.reply("ℹ️ لا توجد عملات قيد التتبع حاليًا.", { reply_markup: new InlineKeyboard().text("🔙 العودة", "back_to_tracking") }); } else { let msg_tracked = "📋 *قائمة العملات التي يتم تتبعها حاليًا:*\n\n"; trackedCoins.forEach((coin, index) => { msg_tracked += `${index + 1}. \`${coin.symbol}\`\n`; }); await ctx.reply(msg_tracked, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 العودة", "back_to_tracking") }); } break;
                case "untrack_coin": waitingState = 'untrack_coin'; await ctx.reply("🗑️ *لإلغاء تتبع عملة*\n\nيرجى إرسال رمز العملة الذي تريد إلغاء تتبعه (مثال: `BTC-USDT`).", { parse_mode: "Markdown" }); break;
                case "back_to_tracking": await ctx.reply("📈 *نظام تتبع الأسعار المتقدم*\n\nاختر الإجراء المطلوب:", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔍 تتبع عملة جديدة", "track_coin").text("📋 عرض المتتبعة", "view_tracked").row().text("🗑️ إلغاء تتبع", "untrack_coin") }); break;
            }
        } catch (error) { console.error("Caught a critical error in callback_query handler:", error); }
    });

    bot.on("message:text", async (ctx) => {
        try {
            const text = ctx.message.text.trim();
            if (ctx.message.text && ctx.message.text.startsWith('/')) { return; }
            switch (text) {
                case "📊 عرض المحفظة":
                    await ctx.reply("⏳ لحظات... جاري إعداد تقرير المحفظة المطور.");
                    const pricesPortfolio = await api.getMarketPrices();
                    if (!pricesPortfolio) { return await ctx.reply("❌ عذرًا، فشل في جلب أسعار السوق."); }
                    const capital = await db.loadCapital();
                    const { assets, total, error } = await api.getPortfolio(pricesPortfolio);
                    if (error) { return await ctx.reply(`❌ ${error}`); }
                    const msgPortfolio = formatPortfolioMsg(assets, total, capital);
                    await ctx.reply(msgPortfolio, { parse_mode: "Markdown" });
                    return;

                case "📈 أداء المحفظة": 
                    const performanceKeyboard = new InlineKeyboard()
                        .text("📊 آخر 24 ساعة", "chart_24h").row()
                        .text("📈 آخر 7 أيام", "chart_7d").row()
                        .text("📉 آخر 30 يومًا", "chart_30d").row()
                        .text("📋 تقرير شامل", "full_report"); 
                    await ctx.reply("📊 *اختر نوع التقرير المطلوب:*", { parse_mode: "Markdown", reply_markup: performanceKeyboard }); 
                    return;

                case "💎 أفضل الأصول":
                    await ctx.reply("⏳ جاري تحليل أفضل الأصول...");
                    const pricesTop = await api.getMarketPrices();
                    if (!pricesTop) { return await ctx.reply("❌ فشل في جلب أسعار السوق."); }
                    const { assets: topAssets } = await api.getPortfolio(pricesTop);
                    if (topAssets.length === 0) { return await ctx.reply("ℹ️ لا توجد أصول في المحفظة حالياً."); }

                    const sortedAssets = topAssets.sort((a, b) => b.value - a.value);
                    let topMsg = `🏆 *أفضل 5 أصول في محفظتك*\n`;
                    topMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                    sortedAssets.slice(0, 5).forEach((asset, index) => {
                        const medals = ["🥇", "🥈", "🥉", "🏅", "⭐"];
                        topMsg += `${medals[index]} *${asset.asset}*\n`;
                        topMsg += `💰 القيمة: \`$${formatNumber(asset.value)}\`\n`;
                        topMsg += `💵 السعر: \`$${formatNumber(asset.price, 4)}\`\n\n`;
                    });

                    topMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    topMsg += `📊 *نصائح:* ركز على الأصول ذات الأداء الجيد`;
                    await ctx.reply(topMsg, { parse_mode: "Markdown" });
                    return;

                case "📊 إحصائيات سريعة":
                    const quickPrices = await api.getMarketPrices();
                    if (!quickPrices) { return await ctx.reply("❌ فشل في جلب البيانات."); }
                    const quickCapital = await db.loadCapital();
                    const { assets: quickAssets, total: quickTotal } = await api.getPortfolio(quickPrices);

                    const quickPnl = quickTotal - quickCapital;
                    const quickPnlPercent = quickCapital > 0 ? (quickPnl / quickCapital) * 100 : 0;

                    let quickMsg = `⚡ *إحصائيات سريعة*\n\n`;
                    quickMsg += `💎 إجمالي الأصول: \`${quickAssets.length}\`\n`;
                    quickMsg += `💰 القيمة الحالية: \`$${formatNumber(quickTotal)}\`\n`;
                    quickMsg += `📈 نسبة الربح: \`${formatNumber(quickPnlPercent)}%\`\n`;
                    quickMsg += `🎯 الحالة: ${quickPnl >= 0 ? '🟢 ربح' : '🔴 خسارة'}\n\n`;
                    quickMsg += `⏰ ${new Date().toLocaleTimeString('ar-EG')}`;

                    await ctx.reply(quickMsg, { parse_mode: "Markdown" });
                    return;

                case "🚀 تحليل السوق":
                    await ctx.reply(`🚀 *تحليل السوق المتقدم*\n\n` +
                        `📊 هذه الميزة تحت التطوير وستتضمن:\n\n` +
                        `• تحليل اتجاهات السوق العامة\n` +
                        `• مؤشرات فنية متقدمة\n` +
                        `• توصيات ذكية\n` +
                        `• تنبيهات الفرص\n\n` +
                        `🔔 سيتم إضافتها في التحديث القادم`, { parse_mode: "Markdown" });
                    return;

                case "ℹ️ مساعدة":
                    let helpMsg = `🤖 *دليل استخدام البوت المطور*\n`;
                    helpMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                    helpMsg += `📊 *الميزات الأساسية:*\n`;
                    helpMsg += `• عرض المحفظة - تقرير شامل ومجمل\n`;
                    helpMsg += `• أداء المحفظة - رسوم بيانية تفاعلية\n`;
                    helpMsg += `• معلومات عملة - تحليل تفصيلي\n`;
                    helpMsg += `• أفضل الأصول - ترتيب حسب الأداء\n\n`;
                    helpMsg += `⚙️ *الإعدادات المتقدمة:*\n`;
                    helpMsg += `• ضبط رأس المال\n`;
                    helpMsg += `• تنبيهات الأسعار\n`;
                    helpMsg += `• تنبيهات الحركة\n\n`;
                    helpMsg += `🧮 *الأدوات:*\n`;
                    helpMsg += `• حاسبة الربح والخسارة: \`/pnl سعر_الشراء سعر_البيع الكمية\`\n\n`;
                    helpMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    helpMsg += `💡 *نصيحة:* استخدم الأزرار للوصول السريع للميزات`;
                    await ctx.reply(helpMsg, { parse_mode: "Markdown" });
                    return;

                case "ℹ️ معلومات عملة": waitingState = 'coin_info'; await ctx.reply("✍️ يرجى إرسال رمز العملة (مثال: `BTC-USDT`).", { parse_mode: "Markdown" }); return;
                case "⚙️ الإعدادات": await sendSettingsMenu(ctx); return;
                case "🔔 ضبط تنبيه": waitingState = 'set_alert'; await ctx.reply("✍️ *لضبط تنبيه سعر جديد...*\n\nيرجى إرسال التنبيه بالصيغة التالية:\n`BTC-USDT > 50000`\n`ETH-USDT < 3000`", { parse_mode: "Markdown" }); return;
                case "🧮 حاسبة PnL": await ctx.reply("🧮 *حاسبة الربح والخسارة المتقدمة*\n\nاستخدم الأمر بالصيغة التالية:\n`/pnl <سعر_الشراء> <سعر_البيع> <الكمية>`\n\n*مثال:*\n`/pnl 45000 50000 0.1`\n\n*أو يمكنك استخدام الحاسبة التفاعلية*", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🧮 حاسبة تفاعلية", "interactive_calc") }); return;
                case "🏆 إحصائيات المتقدمة":
                    await ctx.reply("⏳ جاري تحضير الإحصائيات المتقدمة...");
                    const advPrices = await api.getMarketPrices();
                    if (!advPrices) { return await ctx.reply("❌ فشل في جلب البيانات."); }

                    const advCapital = await db.loadCapital();
                    const { assets: advAssets, total: advTotal } = await api.getPortfolio(advPrices);
                    const advHistory = await db.loadHistory();

                    let advMsg = `🏆 *الإحصائيات المتقدمة للمحفظة*\n`;
                    advMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                    // تحليل التنويع
                    const largestAsset = Math.max(...advAssets.map(a => a.value));
                    const diversificationRatio = advAssets.length > 0 ? (largestAsset / advTotal) * 100 : 0;
                    let diversificationLevel = "";
                    if (diversificationRatio > 70) diversificationLevel = "⚠️ تركيز عالي";
                    else if (diversificationRatio > 50) diversificationLevel = "📊 تركيز متوسط";
                    else diversificationLevel = "🌟 تنويع جيد";

                    advMsg += `🎯 *تحليل التنويع:*\n`;
                    advMsg += `▫️ أكبر أصل يشكل: \`${formatNumber(diversificationRatio, 1)}%\`\n`;
                    advMsg += `▫️ مستوى التنويع: ${diversificationLevel}\n\n`;

                    // تحليل الأداء الزمني
                    if (advHistory.length >= 7) {
                        const weekAgo = advHistory[advHistory.length - 7];
                        const weeklyChange = advTotal - weekAgo.total;
                        const weeklyPercent = (weeklyChange / weekAgo.total) * 100;
                        const weeklyEmoji = weeklyChange >= 0 ? '📈' : '📉';

                        advMsg += `📊 *أداء الأسبوع الماضي:*\n`;
                        advMsg += `${weeklyEmoji} التغير: \`${formatNumber(weeklyChange)}\` (\`${formatNumber(weeklyPercent)}%\`)\n\n`;
                    }

                    // أفضل وأسوأ أداء
                    const sortedByValue = advAssets.sort((a, b) => b.value - a.value);
                    advMsg += `🥇 *أكبر الأصول:*\n`;
                    sortedByValue.slice(0, 3).forEach((asset, i) => {
                        const percentage = (asset.value / advTotal) * 100;
                        advMsg += `${i + 1}. ${asset.asset}: \`${formatNumber(percentage, 1)}%\` (\`$${formatNumber(asset.value)}\`)\n`;
                    });

                    await ctx.reply(advMsg, { parse_mode: "Markdown" });
                    return;

                case "📈 تتبع السعر":
                    const trackingKeyboard = new InlineKeyboard()
                        .text("🔍 تتبع عملة جديدة", "track_coin")
                        .text("📋 عرض المتتبعة", "view_tracked").row()
                        .text("🗑️ إلغاء تتبع", "untrack_coin");
                    await ctx.reply("📈 *نظام تتبع الأسعار المتقدم*\n\nاختر الإجراء المطلوب:", { parse_mode: "Markdown", reply_markup: trackingKeyboard });
                    return;
            }
            if (waitingState) {
                const state = waitingState;
                waitingState = null;
                switch (state) {
                    case 'interactive_calc':
                        const calcParts = text.split(/\s+/);
                        if (calcParts.length !== 3) {
                            return await ctx.reply("❌ *الرجاء إدخال البيانات بالصيغة الصحيحة:*\n`سعر_الشراء سعر_البيع الكمية`\n\n*مثال:* `45000 50000 0.1`", { parse_mode: "Markdown" });
                        }

                        const [buyP, sellP, qty] = calcParts.map(parseFloat);
                        if ([buyP, sellP, qty].some(isNaN) || [buyP, sellP, qty].some(v => v <= 0)) {
                            return await ctx.reply("❌ تأكد من أن جميع القيم أرقام موجبة.");
                        }

                        const investment = buyP * qty;
                        const saleValue = sellP * qty;
                        const pnl = saleValue - investment;
                        const pnlPct = (pnl / investment) * 100;

                        let calcResult = `🧮 *نتائج الحاسبة التفاعلية*\n`;
                        calcResult += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                        calcResult += `📊 *المعطيات:*\n`;
                        calcResult += `• سعر الشراء: \`$${formatNumber(buyP, 4)}\`\n`;
                        calcResult += `• سعر البيع: \`$${formatNumber(sellP, 4)}\`\n`;
                        calcResult += `• الكمية: \`${formatNumber(qty, 6)}\`\n\n`;
                        calcResult += `💰 *النتائج:*\n`;
                        calcResult += `• الاستثمار: \`$${formatNumber(investment)}\`\n`;
                        calcResult += `• قيمة البيع: \`$${formatNumber(saleValue)}\`\n`;
                        calcResult += `• الربح/الخسارة: \`$${formatNumber(pnl)}\`\n`;
                        calcResult += `• النسبة المئوية: \`${formatNumber(pnlPct)}%\`\n\n`;

                        if (pnl > 0) calcResult += `🎉 *ربح ممتاز!*`;
                        else if (pnl < 0) calcResult += `📉 *يتطلب مراجعة الاستراتيجية*`;
                        else calcResult += `⚖️ *تعادل*`;

                        await ctx.reply(calcResult, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🧮 حساب آخر", "interactive_calc") });
                        return;

                    case 'set_capital': 
                        const amount = parseFloat(text); 
                        if (!isNaN(amount) && amount >= 0) { 
                            await db.saveCapital(amount); 
                            await ctx.reply(`✅ *تم تحديث رأس المال إلى:* \`$${formatNumber(amount)}\``, { parse_mode: "Markdown" }); 
                        } else { 
                            await ctx.reply("❌ مبلغ غير صالح."); 
                        } 
                        return;

                    case 'set_global_alert_state': 
                        const percent = parseFloat(text); 
                        if (isNaN(percent) || percent <= 0) { 
                            return await ctx.reply("❌ *خطأ:* النسبة يجب أن تكون رقمًا موجبًا."); 
                        } 
                        let alertSettingsGlobal = await db.loadAlertSettings(); 
                        alertSettingsGlobal.global = percent; 
                        await db.saveAlertSettings(alertSettingsGlobal); 
                        await ctx.reply(`✅ تم تحديث النسبة العامة إلى \`${percent}%\`.`); 
                        return;

                    case 'set_coin_alert_state': 
                        const parts_coin_alert = text.split(/\s+/); 
                        if (parts_coin_alert.length !== 2) { 
                            return await ctx.reply("❌ *صيغة غير صحيحة*."); 
                        } 
                        const [symbol_coin_alert, percentStr_coin_alert] = parts_coin_alert; 
                        const coinPercent = parseFloat(percentStr_coin_alert); 
                        if (isNaN(coinPercent) || coinPercent < 0) { 
                            return await ctx.reply("❌ *خطأ:* النسبة يجب أن تكون رقمًا."); 
                        } 
                        let alertSettingsCoin = await db.loadAlertSettings(); 
                        if (coinPercent === 0) { 
                            delete alertSettingsCoin.overrides[symbol_coin_alert.toUpperCase()]; 
                            await ctx.reply(`✅ تم حذف الإعداد المخصص لـ *${symbol_coin_alert.toUpperCase()}*.`); 
                        } else { 
                            alertSettingsCoin.overrides[symbol_coin_alert.toUpperCase()] = coinPercent; 
                            await ctx.reply(`✅ تم تحديث النسبة المخصصة لـ *${symbol_coin_alert.toUpperCase()}* إلى \`${coinPercent}%\`.`); 
                        } 
                        await db.saveAlertSettings(alertSettingsCoin); 
                        return;
                    case 'set_alert':
                        const alertParts = text.split(' ');
                        if (alertParts.length !== 3) {
                            return await ctx.reply('❌ *صيغة غير صحيحة*\n\n*يرجى استخدام الصيغة التالية:*\n`رمز_العملة > السعر` أو `رمز_العملة < السعر`\n\n*مثال:*\n`BTC-USDT > 50000`');
                        }
                        const [symbol, condition, priceStr] = alertParts;
                        const price = parseFloat(priceStr);
                        if (isNaN(price) || price <= 0) {
                            return await ctx.reply('❌ *سعر غير صالح*. يرجى إدخال رقم موجب.');
                        }
                        const newAlert = { instId: symbol.toUpperCase(), condition, price };
                        await db.addAlert(newAlert);
                        await ctx.reply(`✅ *تم ضبط تنبيه جديد:* ${symbol.toUpperCase()} عندما يكون السعر ${condition === '>' ? 'أعلى من' : 'أقل من'} \`${formatNumber(price, 2)}\``);
                        return;
                    case 'delete_alert_number':
                        const alertIndex = parseInt(text);
                        const currentAlerts = await db.loadAlerts();
                        if (isNaN(alertIndex) || alertIndex <= 0 || alertIndex > currentAlerts.length) {
                            return await ctx.reply('❌ *رقم تنبيه غير صالح*. يرجى إدخال رقم صحيح من القائمة.');
                        }
                        const deletedAlert = currentAlerts[alertIndex - 1];
                        await db.deleteAlert(deletedAlert.id);
                        await ctx.reply(`✅ *تم حذف التنبيه:* \`${deletedAlert.instId}\` عند سعر \`${deletedAlert.price}\`.`);
                        return;
                    case 'confirm_delete_all':
                        if (text.toLowerCase() === 'نعم') {
                            await db.clearAllData();
                            await ctx.reply('✅ *تم حذف جميع بيانات البوت بنجاح.*');
                        } else {
                            await ctx.reply('❌ تم إلغاء حذف البيانات.');
                        }
                        waitingState = null;
                        return;
                    case 'track_coin':
                        const coinSymbolToTrack = text.toUpperCase();
                        await db.addTrackedCoin({ symbol: coinSymbolToTrack });
                        await ctx.reply(`✅ *تم بدء تتبع العملة:* \`${coinSymbolToTrack}\``);
                        return;
                    case 'untrack_coin':
                        const coinSymbolToUntrack = text.toUpperCase();
                        await db.removeTrackedCoin(coinSymbolToUntrack);
                        await ctx.reply(`✅ *تم إلغاء تتبع العملة:* \`${coinSymbolToUntrack}\``);
                        return;
                }
            }
        } catch (error) { console.error("Caught a critical error in message:text handler:", error); }
    });
}

module.exports = { initializeHandlers };