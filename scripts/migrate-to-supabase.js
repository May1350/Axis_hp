#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   Migrate local JSON data files → Supabase kv table
   Usage: node scripts/migrate-to-supabase.js
   Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
   ═══════════════════════════════════════════════════════════ */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DATA_DIR = path.join(__dirname, '..', 'data');

function readJSON(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.warn(`   ⚠️  ${filename} not found — skipping`);
        return null;
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

async function upsert(key, value) {
    const { error } = await supabase
        .from('kv')
        .upsert(
            { key, value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );
    if (error) {
        console.error(`   ❌  Failed to upsert "${key}":`, error.message);
        return false;
    }
    console.log(`   ✅  ${key}`);
    return true;
}

async function main() {
    console.log('\n🚀  Migrating data/*.json → Supabase kv table\n');

    let ok = 0;
    let fail = 0;

    // 1. projects-index
    const projectsIndex = readJSON('projects-index.json');
    if (projectsIndex) {
        (await upsert('projects-index', projectsIndex)) ? ok++ : fail++;
    }

    // 2. Individual project files
    if (projectsIndex) {
        for (const project of projectsIndex) {
            const data = readJSON(`${project.id}.json`);
            if (data) {
                (await upsert(`project:${project.id}`, data)) ? ok++ : fail++;
            }
        }
    }

    // 3. global-stats
    const globalStats = readJSON('global_stats.json');
    if (globalStats) {
        (await upsert('global-stats', globalStats)) ? ok++ : fail++;
    }

    // 4. history
    const history = readJSON('history.json');
    if (history) {
        (await upsert('history', history)) ? ok++ : fail++;
    }

    // 5. activity-log
    const activityLog = readJSON('activity-log.json');
    if (activityLog) {
        (await upsert('activity-log', activityLog)) ? ok++ : fail++;
    }

    console.log(`\n📊  Done: ${ok} succeeded, ${fail} failed\n`);

    // Verify
    const { count, error } = await supabase
        .from('kv')
        .select('key', { count: 'exact', head: true });
    if (!error) {
        console.log(`📋  Total rows in kv table: ${count}\n`);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
