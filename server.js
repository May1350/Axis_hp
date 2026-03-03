/* ═══════════════════════════════════════════════════════════
   AXIS — Express API Server
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

const app = express();
const PORT = process.env.PORT || 8000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'axis_admin_2024';
const JWT_SECRET = process.env.JWT_SECRET || 'axis-secret-key';

// ─── Middleware ───────────────────────────────────────────────
// Security headers (X-Frame-Options, X-Content-Type, HSTS, etc.)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));   // serves index.html, project.html, etc.

// ─── Upload directory ─────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
        cb(null, name);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },   // 50 MB (covers PDFs)
    fileFilter: (_req, file, cb) => {
        // Allow by MIME type (more reliable than extension alone)
        const allowedMime = [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'application/pdf'
        ];
        // Also cross-check extension as secondary guard
        const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        const mimeOk = allowedMime.includes(file.mimetype);
        const extOk = allowedExt.includes(ext);
        cb(null, mimeOk && extOk);
    }
});

// ─── Auth middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        req.user = jwt.verify(auth.slice(7), JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// ─── JSON helpers ─────────────────────────────────────────────
const PROJECTS_INDEX_FILE = path.join(__dirname, 'data', 'projects-index.json');

function readProjectsIndex() {
    if (!fs.existsSync(PROJECTS_INDEX_FILE)) return [];
    return JSON.parse(fs.readFileSync(PROJECTS_INDEX_FILE, 'utf8'));
}

function writeProjectsIndex(data) {
    fs.writeFileSync(PROJECTS_INDEX_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function isValidProjectId(id) {
    const index = readProjectsIndex();
    return index.some(p => p.id === id);
}

function readProject(id) {
    if (!isValidProjectId(id)) return null;
    const file = path.join(__dirname, 'data', `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeProject(id, data) {
    fs.writeFileSync(
        path.join(__dirname, 'data', `${id}.json`),
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

// ─── Activity Log helpers ──────────────────────────────────────
const ACTIVITY_LOG_FILE = path.join(__dirname, 'data', 'activity-log.json');

function readActivityLog() {
    if (!fs.existsSync(ACTIVITY_LOG_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8')); } catch { return []; }
}

/**
 * Append one event to the activity log.
 * @param {'CREATE'|'UPDATE'|'DELETE'|'REORDER'|'UNDO'} action
 * @param {string} type   e.g. 'diary', 'gallery', 'history', 'stats'
 * @param {string} project  e.g. 'mongolia', 'global'
 * @param {string} title  human-readable identifier for the affected item
 * @param {object|null} snapshot  data needed to undo this action
 */
function appendLog(action, type, project, title = '', snapshot = null) {
    try {
        const log = readActivityLog();
        log.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            action,
            type,
            project,
            title: String(title).slice(0, 120),
            snapshot,       // null when not undoable
            undone: false
        });
        // Keep only the latest 200 entries
        const trimmed = log.slice(0, 200);
        fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch { /* never crash the main request because of logging */ }
}

// GET /api/activity-log — admin only
app.get('/api/activity-log', requireAuth, (_req, res) => {
    res.json(readActivityLog());
});

// POST /api/activity-log/:logId/undo — admin only
app.post('/api/activity-log/:logId/undo', requireAuth, (req, res) => {
    const log = readActivityLog();
    const entryIdx = log.findIndex(e => e.id === req.params.logId);
    if (entryIdx === -1) return res.status(404).json({ error: 'Log entry not found' });

    const entry = log[entryIdx];
    if (entry.undone) return res.status(400).json({ error: 'Already undone' });
    if (!entry.snapshot) return res.status(400).json({ error: 'This action cannot be undone (no snapshot)' });

    const { action, type, project, snapshot } = entry;

    try {
        // ── Project-level items (diary, report, gallery, interview) ────
        const PROJECT_TYPES = ['diary', 'report', 'gallery', 'interview'];
        if (PROJECT_TYPES.includes(type)) {
            const keyMap = { diary: 'diary', report: 'reports', gallery: 'gallery', interview: 'interviews' };
            const key = keyMap[type];
            const data = readProject(project);
            if (!data) return res.status(404).json({ error: `Project '${project}' not found` });
            data[key] = data[key] || [];

            if (action === 'DELETE') {
                // Re-insert item at its original index
                const insertAt = Math.min(snapshot.index, data[key].length);
                data[key].splice(insertAt, 0, snapshot.item);
                writeProject(project, data);
                appendLog('UNDO', type, project, `Restored: ${entry.title}`);
            } else if (action === 'CREATE') {
                // Remove the first matching item
                const removeAt = snapshot.index !== undefined
                    ? snapshot.index
                    : data[key].findIndex(item => JSON.stringify(item) === JSON.stringify(snapshot.item));
                if (removeAt < 0 || removeAt >= data[key].length)
                    return res.status(400).json({ error: 'Cannot find the item to undo creation' });
                data[key].splice(removeAt, 1);
                writeProject(project, data);
                appendLog('UNDO', type, project, `Removed: ${entry.title}`);
            } else if (action === 'UPDATE') {
                const idx = snapshot.index;
                if (idx === undefined || idx < 0 || idx >= data[key].length)
                    return res.status(400).json({ error: 'Index out of range' });
                data[key][idx] = snapshot.prev;
                writeProject(project, data);
                appendLog('UNDO', type, project, `Reverted: ${entry.title}`);
            } else {
                return res.status(400).json({ error: 'Undo not supported for this action' });
            }

            // ── History ───────────────────────────────────────────────────
        } else if (type === 'history') {
            const items = readHistory();
            if (action === 'DELETE') {
                const insertAt = Math.min(snapshot.index, items.length);
                items.splice(insertAt, 0, snapshot.item);
                writeHistory(items);
                appendLog('UNDO', type, project, `Restored: ${entry.title}`);
            } else if (action === 'CREATE') {
                // Remove the last item (history items are push()ed)
                const removeAt = snapshot.index !== undefined ? snapshot.index : items.length - 1;
                if (removeAt < 0 || removeAt >= items.length)
                    return res.status(400).json({ error: 'Cannot find the item' });
                items.splice(removeAt, 1);
                writeHistory(items);
                appendLog('UNDO', type, project, `Removed: ${entry.title}`);
            } else if (action === 'UPDATE') {
                items[snapshot.index] = snapshot.prev;
                writeHistory(items);
                appendLog('UNDO', type, project, `Reverted: ${entry.title}`);
            } else if (action === 'REORDER') {
                writeHistory(snapshot.prevOrder);
                appendLog('UNDO', type, project, 'Reverted reorder');
            } else {
                return res.status(400).json({ error: 'Undo not supported' });
            }

            // ── Global Stats ──────────────────────────────────────────────
        } else if (type === 'global-stats') {
            if (action === 'UPDATE' && snapshot.prev) {
                writeGlobalStats(snapshot.prev);
                appendLog('UNDO', type, project, 'Reverted Global Stats');
            } else {
                return res.status(400).json({ error: 'Undo not supported' });
            }

            // ── Project Stats / Card ──────────────────────────────────────
        } else if (type === 'stats' || type === 'card') {
            if (action === 'UPDATE' && snapshot.prev) {
                const data = readProject(project);
                if (!data) return res.status(404).json({ error: 'Project not found' });
                data[type === 'stats' ? 'stats' : 'card'] = snapshot.prev;
                writeProject(project, data);
                appendLog('UNDO', type, project, `Reverted ${type === 'stats' ? 'Project Stats' : 'Project Card'}`);
            } else {
                return res.status(400).json({ error: 'Undo not supported' });
            }
        } else {
            return res.status(400).json({ error: 'Undo not supported for this type' });
        }

        // Mark the original entry as undone
        log[entryIdx].undone = true;
        fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
        res.json({ ok: true });
    } catch (err) {
        console.error('Undo error:', err);
        res.status(500).json({ error: 'Internal error during undo: ' + err.message });
    }
});

// GET /api/projects-index — public, used by map + cards
app.get('/api/projects-index', (_req, res) => {
    res.json(readProjectsIndex());
});

// GET /api/countries-catalog — public, 178 countries with pre-computed centroids
const COUNTRIES_CATALOG_FILE = path.join(__dirname, 'data', 'countries-catalog.json');
app.get('/api/countries-catalog', (_req, res) => {
    if (!fs.existsSync(COUNTRIES_CATALOG_FILE)) {
        return res.status(404).json({ error: 'countries-catalog.json not found. Run: node scripts/generate-countries-catalog.js' });
    }
    res.json(JSON.parse(fs.readFileSync(COUNTRIES_CATALOG_FILE, 'utf8')));
});

// POST /api/projects — create new project (admin only)
app.post('/api/projects', requireAuth, upload.single('hero_image'), (req, res) => {
    const { id, name, name_jp, label, countryCode, markerX, markerY, labelY, color, since, slogan } = req.body;

    if (!id || !name || !countryCode) {
        return res.status(400).json({ error: 'id, name, countryCode are required' });
    }

    // Validate id format (lowercase alphanumeric + underscore)
    if (!/^[a-z0-9_]+$/.test(id)) {
        return res.status(400).json({ error: 'id must be lowercase letters, numbers, or underscores' });
    }

    // Check duplicate
    const index = readProjectsIndex();
    if (index.some(p => p.id === id)) {
        return res.status(409).json({ error: `Project '${id}' already exists` });
    }

    // Add to index
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
    writeProjectsIndex(index);

    // Find the SVG path from BACKGROUND_PATHS logic is in world-map.js (client-side),
    // the server just stores the countryCode; the client resolves the path.

    // Create project JSON file
    const heroImage = req.file ? `data/uploads/${req.file.filename}` : '';
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
    writeProject(id, projectData);

    res.status(201).json({ ok: true, project: entry, data: projectData });
});

// PATCH /api/projects/:id/index — update index metadata for a project
app.patch('/api/projects/:id/index', requireAuth, (req, res) => {
    const index = readProjectsIndex();
    const i = index.findIndex(p => p.id === req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Not found in index' });

    const fields = ['name', 'name_jp', 'label', 'countryCode', 'markerX', 'markerY', 'labelY', 'color', 'since'];
    fields.forEach(k => {
        if (req.body[k] !== undefined) {
            index[i][k] = ['markerX', 'markerY', 'labelY', 'since'].includes(k)
                ? Number(req.body[k]) : req.body[k];
        }
    });
    writeProjectsIndex(index);
    res.json({ ok: true, project: index[i] });
});

// DELETE /api/projects/:id — remove project from index and delete its data file
app.delete('/api/projects/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    const index = readProjectsIndex();
    const newIndex = index.filter(p => p.id !== id);
    if (newIndex.length === index.length) return res.status(404).json({ error: 'Not found' });

    // 1. Update index
    writeProjectsIndex(newIndex);

    // 2. Delete project JSON file
    const filePath = path.join(__dirname, 'data', `${id}.json`);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error(`Failed to delete file ${filePath}:`, err);
            // We still proceed since the index is updated
        }
    }

    res.json({ ok: true, deletedId: id });
});

// Rate-limiting: max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// POST /api/login
app.post('/api/login', loginLimiter, (req, res) => {
    const { password } = req.body || {};
    if (!password || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Wrong password' });
    }
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
});

// GET /api/projects/:id  — read full JSON (authenticated)
app.get('/api/projects/:id', requireAuth, (req, res) => {
    const data = readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Project not found' });
    res.json(data);
});

// ── Field Diary ────────────────────────────────────────────────
app.post('/api/projects/:id/diary',
    requireAuth,
    upload.array('images', 10),
    (req, res) => {
        const data = readProject(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });

        const entry = {
            date: req.body.date || '',
            location: req.body.location || '',
            title: req.body.title || '',
            body: req.body.body || '',
            images: (req.files || []).map(f => `data/uploads/${f.filename}`)
        };

        data.diary = data.diary || [];
        data.diary.unshift(entry);
        writeProject(req.params.id, data);
        appendLog('CREATE', 'diary', req.params.id, entry.title || entry.date, { index: 0, item: entry });
        res.status(201).json(entry);
    }
);

// ── Activity Reports ───────────────────────────────────────────
app.post('/api/projects/:id/report',
    requireAuth,
    upload.single('pdf'),
    (req, res) => {
        const data = readProject(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });

        let sections = [];
        try { sections = JSON.parse(req.body.sections || '[]'); } catch { }

        let impact = {};
        try { impact = JSON.parse(req.body.impact || '{}'); } catch { }

        const report = {
            title: req.body.title || '',
            period: req.body.period || '',
            date: req.body.date || (req.body.period || '').split('–')[0].trim(),
            members: req.body.members ? parseInt(req.body.members, 10) : undefined,
            summary: req.body.summary || '',
            sections,
            impact,
            pdf: req.file ? `data/uploads/${req.file.filename}` : ''
        };

        data.reports = data.reports || [];
        data.reports.unshift(report);
        writeProject(req.params.id, data);
        appendLog('CREATE', 'report', req.params.id, report.title || report.period, { index: 0, item: report });
        res.status(201).json(report);
    }
);

// ── Photo Gallery ──────────────────────────────────────────────
app.post('/api/projects/:id/gallery',
    requireAuth,
    upload.array('images', 20),   // accept up to 20 images at once
    (req, res) => {
        const data = readProject(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });

        const files = req.files || [];
        // If no files uploaded at all, still allow metadata-only entry
        const baseItem = {
            date: req.body.date || '',
            location: req.body.location || '',
            trip: req.body.trip || '',
            caption: req.body.caption || '',
        };

        data.gallery = data.gallery || [];

        if (files.length === 0) {
            // no image — just store metadata (edit use-case)
            const item = { ...baseItem, image: '' };
            data.gallery.unshift(item);
            writeProject(req.params.id, data);
            appendLog('CREATE', 'gallery', req.params.id, item.caption || item.date, { index: 0, item });
            return res.status(201).json([item]);
        }

        // One gallery entry per uploaded image
        const items = files.map(f => ({
            ...baseItem,
            image: `data/uploads/${f.filename}`
        }));

        // Prepend newest first
        data.gallery.unshift(...items);
        writeProject(req.params.id, data);
        appendLog('CREATE', 'gallery', req.params.id,
            `${items.length} photo${items.length > 1 ? 's' : ''} (${baseItem.date || 'no date'})`,
            { index: 0, count: items.length, items });
        res.status(201).json(items);
    }
);


// ── Member Interview ───────────────────────────────────────────
app.post('/api/projects/:id/interview',
    requireAuth,
    upload.single('photo'),
    (req, res) => {
        const data = readProject(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });

        let qanda = [];
        try { qanda = JSON.parse(req.body.qanda || '[]'); } catch { }

        const interview = {
            name: req.body.name || '',
            year: req.body.year || '',
            trips: req.body.trips ? req.body.trips.split(',').map(s => s.trim()).filter(Boolean) : [],
            photo: req.file ? `data/uploads/${req.file.filename}` : '',
            qanda
        };

        data.interviews = data.interviews || [];
        data.interviews.push(interview);
        writeProject(req.params.id, data);
        appendLog('CREATE', 'interview', req.params.id, interview.name || interview.year,
            { index: data.interviews.length - 1, item: interview });
        res.status(201).json(interview);
    }
);

// PATCH /api/projects/:id/diary/:index
app.patch('/api/projects/:id/diary/:index',
    requireAuth,
    upload.array('images', 10),
    (req, res) => {
        const data = readProject(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        const idx = parseInt(req.params.index, 10);
        if (isNaN(idx) || !data.diary || idx < 0 || idx >= data.diary.length)
            return res.status(400).json({ error: 'Invalid index' });

        const prevEntry = JSON.parse(JSON.stringify(data.diary[idx]));
        const entry = data.diary[idx];
        if (req.body.date !== undefined) entry.date = req.body.date;
        if (req.body.location !== undefined) entry.location = req.body.location;
        if (req.body.title !== undefined) entry.title = req.body.title;
        if (req.body.body !== undefined) entry.body = req.body.body;
        // If new images uploaded, append; otherwise keep existing
        if (req.files && req.files.length > 0) {
            entry.images = (entry.images || []).concat(
                req.files.map(f => `data/uploads/${f.filename}`)
            );
        }
        writeProject(req.params.id, data);
        appendLog('UPDATE', 'diary', req.params.id, entry.title || entry.date,
            { index: idx, prev: prevEntry });
        res.json(entry);
    }
);

// PATCH /api/projects/:id/reports/:index
app.patch('/api/projects/:id/reports/:index',
    requireAuth,
    upload.single('pdf'),
    (req, res) => {
        const data = readProject(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        const idx = parseInt(req.params.index, 10);
        if (isNaN(idx) || !data.reports || idx < 0 || idx >= data.reports.length)
            return res.status(400).json({ error: 'Invalid index' });

        const prevReport = JSON.parse(JSON.stringify(data.reports[idx]));
        const report = data.reports[idx];
        if (req.body.title !== undefined) report.title = req.body.title;
        if (req.body.period !== undefined) report.period = req.body.period;
        if (req.body.date !== undefined) report.date = req.body.date;
        if (req.body.members !== undefined) report.members = parseInt(req.body.members, 10) || undefined;
        if (req.body.summary !== undefined) report.summary = req.body.summary;
        if (req.body.sections !== undefined) {
            try { report.sections = JSON.parse(req.body.sections); } catch { }
        }
        if (req.body.impact !== undefined) {
            try { report.impact = JSON.parse(req.body.impact); } catch { }
        }
        if (req.file) report.pdf = `data/uploads/${req.file.filename}`;
        writeProject(req.params.id, data);
        appendLog('UPDATE', 'report', req.params.id, report.title || report.period,
            { index: idx, prev: prevReport });
        res.json(report);
    }
);

// PATCH /api/projects/:id/gallery/:index
app.patch('/api/projects/:id/gallery/:index',
    requireAuth,
    upload.single('image'),
    (req, res) => {
        const data = readProject(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        const idx = parseInt(req.params.index, 10);
        if (isNaN(idx) || !data.gallery || idx < 0 || idx >= data.gallery.length)
            return res.status(400).json({ error: 'Invalid index' });

        const prevGallery = JSON.parse(JSON.stringify(data.gallery[idx]));
        const item = data.gallery[idx];
        if (req.body.date !== undefined) item.date = req.body.date;
        if (req.body.location !== undefined) item.location = req.body.location;
        if (req.body.trip !== undefined) item.trip = req.body.trip;
        if (req.body.caption !== undefined) item.caption = req.body.caption;
        if (req.file) item.image = `data/uploads/${req.file.filename}`;
        writeProject(req.params.id, data);
        appendLog('UPDATE', 'gallery', req.params.id, item.caption || item.date,
            { index: idx, prev: prevGallery });
        res.json(item);
    }
);

// PATCH /api/projects/:id/interviews/:index
app.patch('/api/projects/:id/interviews/:index',
    requireAuth,
    upload.single('photo'),
    (req, res) => {
        const data = readProject(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        const idx = parseInt(req.params.index, 10);
        if (isNaN(idx) || !data.interviews || idx < 0 || idx >= data.interviews.length)
            return res.status(400).json({ error: 'Invalid index' });

        const prevInterview = JSON.parse(JSON.stringify(data.interviews[idx]));
        const interview = data.interviews[idx];
        if (req.body.name !== undefined) interview.name = req.body.name;
        if (req.body.year !== undefined) interview.year = req.body.year;
        if (req.body.trips !== undefined) {
            interview.trips = req.body.trips.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (req.body.qanda !== undefined) {
            try { interview.qanda = JSON.parse(req.body.qanda); } catch { }
        }
        if (req.file) interview.photo = `data/uploads/${req.file.filename}`;
        writeProject(req.params.id, data);
        appendLog('UPDATE', 'interview', req.params.id, interview.name || interview.year,
            { index: idx, prev: prevInterview });
        res.json(interview);
    }
);

// DELETE /api/projects/:id/:type/:index
app.delete('/api/projects/:id/:type/:index', requireAuth, (req, res) => {
    const data = readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const keyMap = { diary: 'diary', reports: 'reports', gallery: 'gallery', interviews: 'interviews' };
    const key = keyMap[req.params.type];
    const idx = parseInt(req.params.index, 10);

    if (!key || !data[key] || isNaN(idx) || idx < 0 || idx >= data[key].length) {
        return res.status(400).json({ error: 'Invalid type or index' });
    }

    const deletedItem = data[key][idx];
    const deletedTitle = deletedItem.title || deletedItem.caption || deletedItem.name || deletedItem.date || String(idx);
    data[key].splice(idx, 1);
    writeProject(req.params.id, data);
    appendLog('DELETE', req.params.type, req.params.id, deletedTitle,
        { index: idx, item: deletedItem });
    res.json({ ok: true });
});


// ── Global Stats (main page) ───────────────────────────────────
const GLOBAL_STATS_FILE = path.join(__dirname, 'data', 'global_stats.json');

function readGlobalStats() {
    if (!fs.existsSync(GLOBAL_STATS_FILE)) return {};
    return JSON.parse(fs.readFileSync(GLOBAL_STATS_FILE, 'utf8'));
}

function writeGlobalStats(data) {
    fs.writeFileSync(GLOBAL_STATS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Public read — index.html fetches this
// activeCountries and yearsOfService are always derived from live data,
// overriding any stale values stored in global_stats.json
app.get('/api/global-stats', (_req, res) => {
    const gs = readGlobalStats();

    // Auto-calculate active countries from the live projects index
    try {
        const projectsIndex = readProjectsIndex();
        gs.activeCountries = Array.isArray(projectsIndex) ? projectsIndex.length : (gs.activeCountries || 0);
    } catch {
        // keep whatever is stored
    }

    // Auto-calculate years of service from founding year
    const FOUNDING_YEAR = 2001;
    gs.yearsOfService = new Date().getFullYear() - FOUNDING_YEAR;

    res.json(gs);
});

// Auth-protected write
app.patch('/api/global-stats', requireAuth, (req, res) => {
    const prevGs = readGlobalStats();
    const gs = { ...prevGs };
    const fields = ['yearsOfService', 'yearsOfServiceSuffix', 'activeCountries',
        'activeCountriesSuffix', 'treesPlanted', 'treesPlantedSuffix',
        'label_years', 'label_countries', 'label_trees'];
    fields.forEach(k => {
        if (req.body[k] !== undefined) {
            const numFields = ['yearsOfService', 'activeCountries', 'treesPlanted'];
            gs[k] = numFields.includes(k) && !isNaN(Number(req.body[k]))
                ? Number(req.body[k])
                : req.body[k];
        }
    });
    writeGlobalStats(gs);
    appendLog('UPDATE', 'global-stats', 'global', 'Global Stats', { prev: prevGs });
    res.json({ ok: true, stats: gs });
});

// ── Stats ──────────────────────────────────────────────────────
app.patch('/api/projects/:id/stats', requireAuth, (req, res) => {
    const data = readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const prevStats = JSON.parse(JSON.stringify(data.stats || {}));
    const { since, totalTrips, treesPlanted, label_trips, label_metric } = req.body;
    data.stats = data.stats || {};
    if (since !== undefined) data.stats.since = since;
    if (totalTrips !== undefined) data.stats.totalTrips = isNaN(Number(totalTrips)) ? totalTrips : Number(totalTrips);
    if (treesPlanted !== undefined) data.stats.treesPlanted = treesPlanted;
    if (label_trips !== undefined) data.stats.label_trips = label_trips;
    if (label_metric !== undefined) data.stats.label_metric = label_metric;

    writeProject(req.params.id, data);
    appendLog('UPDATE', 'stats', req.params.id, 'Project Stats', { prev: prevStats });
    res.json({ ok: true, stats: data.stats });
});

// ── Project Card (main page card content) ─────────────────────
// Public read — index.html fetches card content for each project
app.get('/api/projects/:id/card', (req, res) => {
    const data = readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data.card || {});
});

// Auth-protected write
app.patch('/api/projects/:id/card', requireAuth, (req, res) => {
    const data = readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const prevCard = JSON.parse(JSON.stringify(data.card || {}));
    const card = data.card || {};
    const fields = ['tag', 'slogan_line1', 'slogan_line2', 'lead', 'body',
        'instagram_handle', 'instagram_url'];
    fields.forEach(k => { if (req.body[k] !== undefined) card[k] = req.body[k]; });

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

    data.card = card;
    writeProject(req.params.id, data);
    appendLog('UPDATE', 'card', req.params.id, 'Project Card', { prev: prevCard });
    res.json({ ok: true, card });
});

// ── History Timeline ────────────────────────────────────────────
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');

function readHistory() {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

function writeHistory(data) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Public read — index.html fetches this
app.get('/api/history', (_req, res) => {
    res.json(readHistory());
});

// Auth-protected: replace entire array (used for reorder)
app.patch('/api/history', requireAuth, (req, res) => {
    const prevOrder = readHistory();
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Body must be an array' });
    writeHistory(items);
    appendLog('REORDER', 'history', 'global', `${items.length} items reordered`, { prevOrder });
    res.json({ ok: true, items });
});

// Auth-protected: add new item
app.post('/api/history/items', requireAuth, (req, res) => {
    const { year, title, body } = req.body || {};
    if (!year || !title) return res.status(400).json({ error: 'year and title are required' });
    const items = readHistory();
    const newItem = { year: String(year), title: String(title), body: String(body || '') };
    items.push(newItem);
    writeHistory(items);
    appendLog('CREATE', 'history', 'global', `${newItem.year} — ${newItem.title}`,
        { index: items.length - 1, item: newItem });
    res.status(201).json({ ok: true, item: newItem, index: items.length - 1 });
});

// Auth-protected: edit item by index
app.patch('/api/history/items/:index', requireAuth, (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const items = readHistory();
    if (isNaN(idx) || idx < 0 || idx >= items.length)
        return res.status(400).json({ error: 'Invalid index' });
    const prevHistItem = JSON.parse(JSON.stringify(items[idx]));
    const { year, title, body } = req.body || {};
    if (year !== undefined) items[idx].year = String(year);
    if (title !== undefined) items[idx].title = String(title);
    if (body !== undefined) items[idx].body = String(body);
    writeHistory(items);
    appendLog('UPDATE', 'history', 'global', `${items[idx].year} — ${items[idx].title}`,
        { index: idx, prev: prevHistItem });
    res.json({ ok: true, item: items[idx] });
});

// Auth-protected: delete item by index
app.delete('/api/history/items/:index', requireAuth, (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const items = readHistory();
    if (isNaN(idx) || idx < 0 || idx >= items.length)
        return res.status(400).json({ error: 'Invalid index' });
    const deletedHistory = items[idx];
    items.splice(idx, 1);
    writeHistory(items);
    appendLog('DELETE', 'history', 'global', `${deletedHistory.year} — ${deletedHistory.title}`,
        { index: idx, item: deletedHistory });
    res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n✅  Axis server running at \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`   Admin panel: \x1b[36mhttp://localhost:${PORT}/admin.html\x1b[0m\n`);
});
