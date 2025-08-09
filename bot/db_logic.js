// bot/db_logic.js
const { getDB } = require("../database.js");
const { ObjectId } = require('mongodb'); // لاستخدامها في الحذف

// دالة مساعدة لجلب "collection" معين
const collection = (name) => getDB().collection(name);

// --- وظائف الإعدادات ---
async function loadSettings() {
    let settings = await collection('app_state').findOne({ _id: 'settings' });
    if (!settings) {
        settings = { _id: 'settings', dailySummary: false, autoPostToChannel: false, debugMode: false };
        await collection('app_state').insertOne(settings);
    }
    return settings;
}
async function saveSettings(settings) {
    // نحذف الـ _id من الكائن قبل التحديث لتجنب المشاكل
    const updateData = { ...settings };
    delete updateData._id;
    await collection('app_state').updateOne({ _id: 'settings' }, { $set: updateData }, { upsert: true });
}

// --- وظائف رأس المال ---
async function loadCapital() {
    const data = await collection('app_state').findOne({ _id: 'capital' });
    return data ? data.amount : 0;
}
async function saveCapital(amount) {
    await collection('app_state').updateOne({ _id: 'capital' }, { $set: { amount } }, { upsert: true });
}

// --- وظائف التنبيهات ---
async function loadAlerts() {
    return await collection('alerts').find({}).toArray();
}
async function addAlert(alert) {
    await collection('alerts').insertOne(alert);
}
async function deleteAlert(alertId) {
    try {
        await collection('alerts').deleteOne({ _id: new ObjectId(alertId) });
    } catch (error) {
        console.error("Failed to delete alert, maybe invalid ID format:", error);
    }
}


// --- وظائف باقي البيانات (يمكنك إضافتها بنفس الطريقة) ---
// مثال على دالة واحدة فقط، ويمكنك إكمال الباقي على نفس النمط
async function loadHistory() {
    return await collection('history').find({}).sort({ date: 1 }).toArray();
}
async function saveHistoryEntry(entry) {
    await collection('history').insertOne(entry);
}


// قم بتصدير كل الوظائف التي تحتاجها
module.exports = {
    loadSettings,
    saveSettings,
    loadCapital,
    saveCapital,
    loadAlerts,
    addAlert,
    deleteAlert,
    loadHistory,
    saveHistoryEntry
    // أضف هنا باقي الوظائف التي ستقوم بتعديلها مثل loadPositions, saveBalanceState...
};
