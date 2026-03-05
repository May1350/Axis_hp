/**
 * migrate-to-mongodb.js
 * Run ONCE locally to push existing JSON data → MongoDB Atlas.
 * Usage: node scripts/migrate-to-mongodb.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI not set in .env');
    process.exit(1);
}

const KvSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
});
const Kv = mongoose.model('Kv', KvSchema);

function readJson(filename, fallback) {
    const file = path.join(DATA_DIR, filename);
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function upsert(key, value) {
    await Kv.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
    console.log(`  ✅  ${key}`);
}

async function main() {
    console.log('\n📦  Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅  Connected!\n');

    console.log('📂  Migrating data...\n');

    // 1. projects-index
    const projectsIndex = readJson('projects-index.json', []);
    await upsert('projects-index', projectsIndex);

    // 2. Each project JSON
    for (const project of projectsIndex) {
        const data = readJson(`${project.id}.json`, null);
        if (data) {
            await upsert(`project:${project.id}`, data);
        } else {
            console.log(`  ⚠️  No file found for project: ${project.id}`);
        }
    }

    // 3. Global stats
    const globalStats = readJson('global_stats.json', {});
    await upsert('global-stats', globalStats);

    // 4. History
    const history = readJson('history.json', []);
    await upsert('history', history);

    // 5. Activity log (optional — OK to start fresh)
    const activityLog = readJson('activity-log.json', []);
    await upsert('activity-log', activityLog);

    console.log('\n🎉  Migration complete! All data is now in MongoDB.\n');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
