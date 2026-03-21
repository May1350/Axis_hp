/* ═══════════════════════════════════════════════════════════
   AXIS — Express API Server  (MongoDB edition)
   Serves static files + provides authenticated admin API.
   Run: node server.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 8000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'axis_admin_2024';
const JWT_SECRET = process.env.JWT_SECRET || 'axis-secret-key';
const MONGODB_URI = process.env.MONGODB_URI;

// ─── MongoDB connection ───────────────────────────────────────
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('✅  MongoDB connected'))
        .catch(err => console.error('❌  MongoDB connection error:', err));
} else {
    console.warn('⚠️  MONGODB_URI not set — running in local-file fallback mode');
}

// ─── Key-Value store model ────────────────────────────────────
// We store each "document" (projects-index, mongolia, etc.)
// as a single { key, value } record. This mirrors the existing
// JSON-file structure with minimal code change.
const KvSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
});
const Kv = mongoose.model('Kv', KvSchema);

// ─── Generic DB helpers ───────────────────────────────────────
async function dbRead(key, fallback) {
    if (!MONGODB_URI) return fallback;           // local-file fallback
    const doc = await Kv.findOne({ key }).lean();
    return doc ? doc.value : fallback;
}

async function dbWrite(key, value) {
    if (!MONGODB_URI) return;
    await Kv.findOneAndUpdate({ key }, { value }, { upsert: true, returnDocument: 'after' });
}

// ─── Middleware ───────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

// ─── Multer (memory storage — images stored as Base64 in MongoDB) ───
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },   // 15 MB per file
    fileFilter: (_req, file, cb) => {
        const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        const mimeOk = allowedMime.includes(file.mimetype);
        const extOk  = allowedExt.includes(ext);
        cb(null, mimeOk && extOk);
    }
});

// Convert an in-memory multer file to a Base64 Data URL
function toDataUrl(file) {
    const mime = file.mimetype || 'application/octet-stream';
    return `data:${mime};base64,${file.buffer.toString('base64')}`;
}


// ─── Auth middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(auth.slice(7), JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// ─── Projects-index helpers ───────────────────────────────────
async function readProjectsIndex() {
    return await dbRead('projects-index', []);
}

async function writeProjectsIndex(data) {
    await dbWrite('projects-index', data);
}

async function isValidProjectId(id) {
    const index = await readProjectsIndex();
    return index.some(p => p.id === id);
}

async function readProject(id) {
    if (!(await isValidProjectId(id))) return null;
    return await dbRead(`project:${id}`, null);
}

async function writeProject(id, data) {
    await dbWrite(`project:${id}`, data);
}

// ─── Activity Log helpers ─────────────────────────────────────
async function readActivityLog() {
    return await dbRead('activity-log', []);
}

async function appendLog(action, type, project, title = '', snapshot = null) {
    try {
        const log = await readActivityLog();
        log.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            action,
            type,
            project,
            title: String(title).slice(0, 120),
            snapshot,
            undone: false
        });
        await dbWrite('activity-log', log.slice(0, 200));
    } catch { /* never crash the main request */ }
}

// GET /api/activity-log
app.get('/api/activity-log', requireAuth, async (_req, res) => {
    res.json(await readActivityLog());
});

// POST /api/activity-log/:logId/undo
app.post('/api/activity-log/:logId/undo', requireAuth, async (req, res) => {
    const log = await readActivityLog();
    const entryIdx = log.findIndex(e => e.id === req.params.logId);
    if (entryIdx === -1) return res.status(404).json({ error: 'Log entry not found' });

    const entry = log[entryIdx];
    if (entry.undone) return res.status(400).json({ error: 'Already undone' });
    if (!entry.snapshot) return res.status(400).json({ error: 'This action cannot be undone (no snapshot)' });

    const { action, type, project, snapshot } = entry;

    try {
        const PROJECT_TYPES = ['diary', 'report', 'gallery', 'interview'];
        const keyMap = { diary: 'diary', report: 'reports', gallery: 'gallery', interview: 'interviews' };

        if (PROJECT_TYPES.includes(type)) {
            const key = keyMap[type];
            const data = await readProject(project);
            if (!data) return res.status(404).json({ error: `Project '${project}' not found` });
            data[key] = data[key] || [];

            if (action === 'DELETE') {
                data[key].splice(Math.min(snapshot.index, data[key].length), 0, snapshot.item);
                await writeProject(project, data);
                await appendLog('UNDO', type, project, `Restored: ${entry.title}`);
            } else if (action === 'CREATE') {
                const removeAt = snapshot.index !== undefined
                    ? snapshot.index
                    : data[key].findIndex(item => JSON.stringify(item) === JSON.stringify(snapshot.item));
                if (removeAt < 0 || removeAt >= data[key].length)
                    return res.status(400).json({ error: 'Cannot find the item to undo creation' });
                data[key].splice(removeAt, 1);
                await writeProject(project, data);
                await appendLog('UNDO', type, project, `Removed: ${entry.title}`);
            } else if (action === 'UPDATE') {
                const idx = snapshot.index;
                if (idx === undefined || idx < 0 || idx >= data[key].length)
                    return res.status(400).json({ error: 'Index out of range' });
                data[key][idx] = snapshot.prev;
                await writeProject(project, data);
                await appendLog('UNDO', type, project, `Reverted: ${entry.title}`);
            } else {
                return res.status(400).json({ error: 'Undo not supported for this action' });
            }

        } else if (type === 'history') {
            const items = await readHistory();
            if (action === 'DELETE') {
                items.splice(Math.min(snapshot.index, items.length), 0, snapshot.item);
                await writeHistory(items);
                await appendLog('UNDO', type, project, `Restored: ${entry.title}`);
            } else if (action === 'CREATE') {
                const removeAt = snapshot.index !== undefined ? snapshot.index : items.length - 1;
                if (removeAt < 0 || removeAt >= items.length)
                    return res.status(400).json({ error: 'Cannot find the item' });
                items.splice(removeAt, 1);
                await writeHistory(items);
                await appendLog('UNDO', type, project, `Removed: ${entry.title}`);
            } else if (action === 'UPDATE') {
                items[snapshot.index] = snapshot.prev;
                await writeHistory(items);
                await appendLog('UNDO', type, project, `Reverted: ${entry.title}`);
            } else if (action === 'REORDER') {
                await writeHistory(snapshot.prevOrder);
                await appendLog('UNDO', type, project, 'Reverted reorder');
            } else {
                return res.status(400).json({ error: 'Undo not supported' });
            }

        } else if (type === 'global-stats') {
            if (action === 'UPDATE' && snapshot.prev) {
                await writeGlobalStats(snapshot.prev);
                await appendLog('UNDO', type, project, 'Reverted Global Stats');
            } else {
                return res.status(400).json({ error: 'Undo not supported' });
            }

        } else if (type === 'stats' || type === 'card') {
            if (action === 'UPDATE' && snapshot.prev) {
                const data = await readProject(project);
                if (!data) return res.status(404).json({ error: 'Project not found' });
                data[type === 'stats' ? 'stats' : 'card'] = snapshot.prev;
                await writeProject(project, data);
                await appendLog('UNDO', type, project, `Reverted ${type === 'stats' ? 'Project Stats' : 'Project Card'}`);
            } else {
                return res.status(400).json({ error: 'Undo not supported' });
            }
        } else {
            return res.status(400).json({ error: 'Undo not supported for this type' });
        }

        log[entryIdx].undone = true;
        await dbWrite('activity-log', log);
        res.json({ ok: true });
    } catch (err) {
        console.error('Undo error:', err);
        res.status(500).json({ error: 'Internal error during undo: ' + err.message });
    }
});

// GET /api/projects-index — public
app.get('/api/projects-index', async (_req, res) => {
    res.json(await readProjectsIndex());
});

// GET /api/countries-catalog — public, read from local file (static data, no DB needed)
const COUNTRIES_CATALOG_FILE = path.join(__dirname, 'data', 'countries-catalog.json');
app.get('/api/countries-catalog', (_req, res) => {
    if (!fs.existsSync(COUNTRIES_CATALOG_FILE))
        return res.status(404).json({ error: 'countries-catalog.json not found' });
    res.json(JSON.parse(fs.readFileSync(COUNTRIES_CATALOG_FILE, 'utf8')));
});

// POST /api/login
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.post('/api/login', loginLimiter, (req, res) => {
    const { password } = req.body || {};
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
});

// POST /api/projects — create new project
app.post('/api/projects', requireAuth, upload.single('hero_image'), async (req, res) => {
    const { id, name, name_jp, label, countryCode, markerX, markerY, labelY, color, since, slogan } = req.body;

    if (!id || !name || !countryCode)
        return res.status(400).json({ error: 'id, name, countryCode are required' });
    if (!/^[a-z0-9_]+$/.test(id))
        return res.status(400).json({ error: 'id must be lowercase letters, numbers, or underscores' });

    const index = await readProjectsIndex();
    if (index.some(p => p.id === id))
        return res.status(409).json({ error: `Project '${id}' already exists` });

    const entry = {
        id,
        name: name || id,
        name_jp: name_jp || '',
        label: (label || name || id).toUpperCase(),
        countryCode: countryCode.toUpperCase(),
        markerX: parseFloat(markerX) || 500,
        markerY: parseFloat(markerY) || 300,
        labelY: parseFloat(labelY) || 330,
        color: color || '#2C3E50',
        since: parseInt(since, 10) || new Date().getFullYear()
    };
    index.push(entry);
    await writeProjectsIndex(index);

    const heroImage = req.file ? toDataUrl(req.file) : '';
    const projectData = {
        id,
        name: entry.name,
        name_jp: entry.name_jp,
        tag: `New · ${entry.since}`,
        slogan: slogan || '',
        since: entry.since,
        hero_image: heroImage,
        seal_image: '',
        color: entry.color,
        description: '',
        card: {
            tag: `New · ${entry.since}`,
            slogan_line1: slogan || name,
            slogan_line2: '',
            lead: '',
            body: '',
            meta: []
        },
        stats: { since: String(entry.since), totalTrips: 0, treesPlanted: '0', label_trips: 'Total Trips', label_metric: 'Key Metric' },
        diary: [],
        reports: [],
        gallery: [],
        interviews: []
    };
    await writeProject(id, projectData);
    await appendLog('CREATE', 'project', id, name);
    res.status(201).json({ ok: true, entry });
});

// DELETE /api/projects/:id
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
    const index = await readProjectsIndex();
    const filtered = index.filter(p => p.id !== req.params.id);
    if (filtered.length === index.length) return res.status(404).json({ error: 'Project not found' });
    await writeProjectsIndex(filtered);
    await dbWrite(`project:${req.params.id}`, null);
    await appendLog('DELETE', 'project', req.params.id, req.params.id);
    res.json({ ok: true });
});

// GET /api/projects/:id
app.get('/api/projects/:id', async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
});

// PATCH /api/projects/:id — update project metadata
app.patch('/api/projects/:id', requireAuth, upload.single('hero_image'), async (req, res) => {
    const index = await readProjectsIndex();
    const pidx = index.findIndex(p => p.id === req.params.id);
    if (pidx === -1) return res.status(404).json({ error: 'Project not found' });

    const entry = index[pidx];
    ['name', 'name_jp', 'label', 'countryCode', 'markerX', 'markerY', 'labelY', 'color', 'since', 'slogan'].forEach(k => {
        if (req.body[k] !== undefined) {
            if (['markerX', 'markerY', 'labelY'].includes(k)) entry[k] = parseFloat(req.body[k]);
            else if (k === 'since') entry[k] = parseInt(req.body[k], 10);
            else entry[k] = req.body[k];
        }
    });
    await writeProjectsIndex(index);

    const data = await readProject(req.params.id);
    if (data) {
        if (req.body.name !== undefined) data.name = req.body.name;
        if (req.body.name_jp !== undefined) data.name_jp = req.body.name_jp;
        if (req.body.slogan !== undefined) data.slogan = req.body.slogan;
        if (req.body.color !== undefined) data.color = req.body.color;
        if (req.file) data.hero_image = toDataUrl(req.file);
        await writeProject(req.params.id, data);
    }
    await appendLog('UPDATE', 'project', req.params.id, entry.name);
    res.json({ ok: true, entry });
});

// ── Diary ─────────────────────────────────────────────────────
app.get('/api/projects/:id/diary', async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data.diary || []);
});

app.post('/api/projects/:id/diary', requireAuth, upload.array('images', 20), async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const images = (req.files || []).map(f => toDataUrl(f));
    const entry = {
        date: req.body.date || new Date().toISOString().slice(0, 10),
        location: req.body.location || '',
        title: req.body.title || '',
        body: req.body.body || '',
        images
    };
    data.diary = data.diary || [];
    data.diary.unshift(entry);
    await writeProject(req.params.id, data);
    await appendLog('CREATE', 'diary', req.params.id, entry.title || entry.date, { index: 0, item: entry });
    res.status(201).json(entry);
});

app.patch('/api/projects/:id/diary/:index', requireAuth, upload.array('images', 20), async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const data = await readProject(req.params.id);
    if (!data || isNaN(idx) || !data.diary || idx < 0 || idx >= data.diary.length)
        return res.status(400).json({ error: 'Invalid' });

    const prevEntry = JSON.parse(JSON.stringify(data.diary[idx]));
    const entry = data.diary[idx];
    if (req.body.date !== undefined) entry.date = req.body.date;
    if (req.body.location !== undefined) entry.location = req.body.location;
    if (req.body.title !== undefined) entry.title = req.body.title;
    if (req.body.body !== undefined) entry.body = req.body.body;

    // keepImages: JSON array of existing image data-URLs the client wants to retain
    if (req.body.keepImages !== undefined) {
        const kept = JSON.parse(req.body.keepImages);   // array of data-URL strings
        const newImgs = (req.files || []).map(f => toDataUrl(f));
        entry.images = [...kept, ...newImgs];
    } else if (req.files && req.files.length > 0) {
        entry.images = (entry.images || []).concat(req.files.map(f => toDataUrl(f)));
    }

    await writeProject(req.params.id, data);
    await appendLog('UPDATE', 'diary', req.params.id, entry.title || entry.date, { index: idx, prev: prevEntry });
    res.json(entry);
});

// ── Reports ───────────────────────────────────────────────────
app.get('/api/projects/:id/reports', async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data.reports || []);
});

app.post('/api/projects/:id/reports', requireAuth, upload.single('pdf'), async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const report = {
        title: req.body.title || '',
        period: req.body.period || '',
        body: req.body.body || '',
        pdf: req.file ? toDataUrl(req.file) : ''
    };
    data.reports = data.reports || [];
    data.reports.unshift(report);
    await writeProject(req.params.id, data);
    await appendLog('CREATE', 'report', req.params.id, report.title || report.period, { index: 0, item: report });
    res.status(201).json(report);
});

app.patch('/api/projects/:id/reports/:index', requireAuth, upload.single('pdf'), async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const data = await readProject(req.params.id);
    if (!data || isNaN(idx) || !data.reports || idx < 0 || idx >= data.reports.length)
        return res.status(400).json({ error: 'Invalid index' });

    const prevReport = JSON.parse(JSON.stringify(data.reports[idx]));
    const report = data.reports[idx];
    if (req.body.title !== undefined) report.title = req.body.title;
    if (req.body.period !== undefined) report.period = req.body.period;
    if (req.body.body !== undefined) report.body = req.body.body;
    if (req.file) report.pdf = toDataUrl(req.file);
    await writeProject(req.params.id, data);
    await appendLog('UPDATE', 'report', req.params.id, report.title || report.period, { index: idx, prev: prevReport });
    res.json(report);
});

// ── Gallery ───────────────────────────────────────────────────
app.get('/api/projects/:id/gallery', async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data.gallery || []);
});

app.post('/api/projects/:id/gallery', requireAuth, upload.array('images', 30), async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    data.gallery = data.gallery || [];
    const baseItem = {
        date: req.body.date || new Date().toISOString().slice(0, 10),
        location: req.body.location || '',
        caption: req.body.caption || ''
    };

    if (!req.files || req.files.length === 0) {
        const item = { ...baseItem, image: '' };
        data.gallery.unshift(item);
        await writeProject(req.params.id, data);
        await appendLog('CREATE', 'gallery', req.params.id, item.caption || item.date, { index: 0, item });
        return res.status(201).json([item]);
    }

    const items = req.files.map(f => ({ ...baseItem, image: toDataUrl(f) }));
    data.gallery.unshift(...items);
    await writeProject(req.params.id, data);
    await appendLog('CREATE', 'gallery', req.params.id,
        `${items.length} photo${items.length > 1 ? 's' : ''} (${baseItem.date || 'no date'})`,
        { index: 0, count: items.length, items });
    res.status(201).json(items);
});

app.patch('/api/projects/:id/gallery/:index', requireAuth, upload.single('image'), async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const data = await readProject(req.params.id);
    if (!data || isNaN(idx) || !data.gallery || idx < 0 || idx >= data.gallery.length)
        return res.status(400).json({ error: 'Invalid index' });

    const prevGallery = JSON.parse(JSON.stringify(data.gallery[idx]));
    const item = data.gallery[idx];
    if (req.body.date !== undefined) item.date = req.body.date;
    if (req.body.location !== undefined) item.location = req.body.location;
    if (req.body.caption !== undefined) item.caption = req.body.caption;
    if (req.file) item.image = toDataUrl(req.file);
    await writeProject(req.params.id, data);
    await appendLog('UPDATE', 'gallery', req.params.id, item.caption || item.date, { index: idx, prev: prevGallery });
    res.json(item);
});

// ── Interviews ────────────────────────────────────────────────
app.get('/api/projects/:id/interviews', async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data.interviews || []);
});

app.post('/api/projects/:id/interviews', requireAuth, upload.single('photo'), async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const interview = {
        name: req.body.name || '',
        university: req.body.university || '',
        department: req.body.department || '',
        grade: req.body.grade || '',
        trips: req.body.trips ? req.body.trips.split(',').map(t => t.trim()).filter(Boolean) : [],
        qanda: req.body.qanda ? JSON.parse(req.body.qanda) : [],
        photo: req.file ? toDataUrl(req.file) : ''
    };
    data.interviews = data.interviews || [];
    data.interviews.push(interview);
    await writeProject(req.params.id, data);
    await appendLog('CREATE', 'interview', req.params.id, interview.name || interview.university,
        { index: data.interviews.length - 1, item: interview });
    res.status(201).json(interview);
});

app.patch('/api/projects/:id/interviews/:index', requireAuth, upload.single('photo'), async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const data = await readProject(req.params.id);
    if (!data || isNaN(idx) || !data.interviews || idx < 0 || idx >= data.interviews.length)
        return res.status(400).json({ error: 'Invalid index' });

    const prevInterview = JSON.parse(JSON.stringify(data.interviews[idx]));
    const interview = data.interviews[idx];
    if (req.body.name !== undefined) interview.name = req.body.name;
    if (req.body.university !== undefined) interview.university = req.body.university;
    if (req.body.department !== undefined) interview.department = req.body.department;
    if (req.body.grade !== undefined) interview.grade = req.body.grade;
    if (req.body.trips !== undefined) interview.trips = req.body.trips.split(',').map(t => t.trim()).filter(Boolean);
    if (req.body.qanda !== undefined) interview.qanda = JSON.parse(req.body.qanda);
    if (req.file) interview.photo = toDataUrl(req.file);
    await writeProject(req.params.id, data);
    await appendLog('UPDATE', 'interview', req.params.id, interview.name || interview.university,
        { index: idx, prev: prevInterview });
    res.json(interview);
});

// ── Generic DELETE for diary / reports / gallery / interviews ─
app.delete('/api/projects/:id/:type/:index', requireAuth, async (req, res) => {
    const keyMap = { diary: 'diary', report: 'reports', reports: 'reports', gallery: 'gallery', interview: 'interviews', interviews: 'interviews' };
    const key = keyMap[req.params.type];
    const idx = parseInt(req.params.index, 10);
    const data = await readProject(req.params.id);

    if (!key || !data || !data[key] || isNaN(idx) || idx < 0 || idx >= data[key].length)
        return res.status(400).json({ error: 'Invalid type or index' });

    const deletedItem = data[key][idx];
    const deletedTitle = deletedItem.title || deletedItem.caption || deletedItem.name || deletedItem.date || String(idx);
    data[key].splice(idx, 1);
    await writeProject(req.params.id, data);
    await appendLog('DELETE', req.params.type, req.params.id, deletedTitle,
        { index: idx, item: deletedItem });
    res.json({ ok: true });
});

// ── Global Stats ──────────────────────────────────────────────
const GLOBAL_STATS_FILE = path.join(__dirname, 'data', 'global_stats.json');

async function readGlobalStats() {
    return await dbRead('global-stats', {});
}

async function writeGlobalStats(data) {
    await dbWrite('global-stats', data);
}

app.get('/api/global-stats', async (_req, res) => {
    res.json(await readGlobalStats());
});

app.patch('/api/global-stats', requireAuth, async (req, res) => {
    const prevGs = await readGlobalStats();
    const gs = { ...prevGs };
    const fields = ['yearsOfService', 'yearsOfServiceSuffix', 'activeCountries',
        'activeCountriesSuffix', 'treesPlanted', 'treesPlantedSuffix',
        'label_years', 'label_countries', 'label_trees'];
    fields.forEach(k => {
        if (req.body[k] !== undefined) {
            const numFields = ['yearsOfService', 'activeCountries', 'treesPlanted'];
            gs[k] = numFields.includes(k) && !isNaN(Number(req.body[k]))
                ? Number(req.body[k]) : req.body[k];
        }
    });
    await writeGlobalStats(gs);
    await appendLog('UPDATE', 'global-stats', 'global', 'Global Stats', { prev: prevGs });
    res.json({ ok: true, stats: gs });
});

// ── Stats ─────────────────────────────────────────────────────
app.patch('/api/projects/:id/stats', requireAuth, async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const prevStats = JSON.parse(JSON.stringify(data.stats || {}));
    const { since, totalTrips, treesPlanted, label_trips, label_metric } = req.body;
    data.stats = data.stats || {};
    if (since !== undefined) data.stats.since = since;
    if (totalTrips !== undefined) data.stats.totalTrips = isNaN(Number(totalTrips)) ? totalTrips : Number(totalTrips);
    if (treesPlanted !== undefined) data.stats.treesPlanted = treesPlanted;
    if (label_trips !== undefined) data.stats.label_trips = label_trips;
    if (label_metric !== undefined) data.stats.label_metric = label_metric;

    await writeProject(req.params.id, data);
    await appendLog('UPDATE', 'stats', req.params.id, 'Project Stats', { prev: prevStats });
    res.json({ ok: true, stats: data.stats });
});

// ── Project Card ──────────────────────────────────────────────
app.get('/api/projects/:id/card', async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data.card || {});
});

app.patch('/api/projects/:id/card', requireAuth, upload.single('card_image'), async (req, res) => {
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const prevCard = JSON.parse(JSON.stringify(data.card || {}));
    const card = data.card || {};
    ['tag', 'slogan_line1', 'slogan_line2', 'lead', 'body', 'instagram_handle', 'instagram_url']
        .forEach(k => { if (req.body[k] !== undefined) card[k] = req.body[k]; });

    if (req.body.meta !== undefined) {
        try { card.meta = JSON.parse(req.body.meta); } catch { }
    }
    if (req.body.meta_0_label !== undefined) {
        card.meta = card.meta || [{}, {}, {}];
        [0, 1, 2].forEach(i => {
            if (!card.meta[i]) card.meta[i] = {};
            if (req.body[`meta_${i}_label`] !== undefined) card.meta[i].label = req.body[`meta_${i}_label`];
            if (req.body[`meta_${i}_value`] !== undefined) card.meta[i].value = req.body[`meta_${i}_value`];
        });
    }
    if (req.file) card.image = toDataUrl(req.file);

    data.card = card;
    await writeProject(req.params.id, data);
    await appendLog('UPDATE', 'card', req.params.id, 'Project Card', { prev: prevCard });
    res.json({ ok: true, card });
});

// ── History Timeline ──────────────────────────────────────────
async function readHistory() {
    return await dbRead('history', []);
}

async function writeHistory(data) {
    await dbWrite('history', data);
}

app.get('/api/history', async (_req, res) => {
    res.json(await readHistory());
});

app.patch('/api/history', requireAuth, async (req, res) => {
    const prevOrder = await readHistory();
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Body must be an array' });
    await writeHistory(items);
    await appendLog('REORDER', 'history', 'global', `${items.length} items reordered`, { prevOrder });
    res.json({ ok: true, items });
});

app.post('/api/history/items', requireAuth, async (req, res) => {
    const { year, title, body } = req.body || {};
    if (!year || !title) return res.status(400).json({ error: 'year and title are required' });
    const items = await readHistory();
    const newItem = { year: String(year), title: String(title), body: String(body || '') };
    items.push(newItem);
    await writeHistory(items);
    await appendLog('CREATE', 'history', 'global', `${newItem.year} — ${newItem.title}`,
        { index: items.length - 1, item: newItem });
    res.status(201).json({ ok: true, item: newItem, index: items.length - 1 });
});

app.patch('/api/history/items/:index', requireAuth, async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const items = await readHistory();
    if (isNaN(idx) || idx < 0 || idx >= items.length)
        return res.status(400).json({ error: 'Invalid index' });

    const prevHistItem = JSON.parse(JSON.stringify(items[idx]));
    const { year, title, body } = req.body || {};
    if (year !== undefined) items[idx].year = String(year);
    if (title !== undefined) items[idx].title = String(title);
    if (body !== undefined) items[idx].body = String(body);
    await writeHistory(items);
    await appendLog('UPDATE', 'history', 'global', `${items[idx].year} — ${items[idx].title}`,
        { index: idx, prev: prevHistItem });
    res.json({ ok: true, item: items[idx] });
});

app.delete('/api/history/items/:index', requireAuth, async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const items = await readHistory();
    if (isNaN(idx) || idx < 0 || idx >= items.length)
        return res.status(400).json({ error: 'Invalid index' });

    const deletedHistory = items[idx];
    items.splice(idx, 1);
    await writeHistory(items);
    await appendLog('DELETE', 'history', 'global', `${deletedHistory.year} — ${deletedHistory.title}`,
        { index: idx, item: deletedHistory });
    res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n✅  Axis server running at \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`   Admin panel: \x1b[36mhttp://localhost:${PORT}/admin.html\x1b[0m\n`);
});
