// database.js - MongoDB Connection
const { MongoClient } = require('mongodb');
require('dotenv').config();

// سيقرأ هذا الرابط من الـ Secrets الخاصة بك
const uri = process.env.MONGO_URI; 
if (!uri) {
    throw new Error('MONGO_URI not found in environment variables. Please add it to your secrets.');
}

const client = new MongoClient(uri);

let db;

async function connectDB() {
    try {
        await client.connect();
        // يمكنك تغيير اسم قاعدة البيانات "okx_bot_db" إلى أي اسم تريده
        db = client.db("okx_bot_db"); 
        console.log("Successfully connected to MongoDB Atlas!");
        return true;
    } catch (e) {
        console.error("Failed to connect to MongoDB", e);
        process.exit(1);
    }
}

const getDB = () => {
    if (!db) {
        throw new Error("Database not initialized. Call connectDB first.");
    }
    return db;
};

module.exports = { connectDB, getDB };
