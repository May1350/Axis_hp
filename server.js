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

// ─── Routes ───────────────────────────────────────────────────

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

        const item = data.gallery[idx];
        if (req.body.date !== undefined) item.date = req.body.date;
        if (req.body.location !== undefined) item.location = req.body.location;
        if (req.body.trip !== undefined) item.trip = req.body.trip;
        if (req.body.caption !== undefined) item.caption = req.body.caption;
        if (req.file) item.image = `data/uploads/${req.file.filename}`;
        writeProject(req.params.id, data);
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

    data[key].splice(idx, 1);
    writeProject(req.params.id, data);
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
    const gs = readGlobalStats();
    const fields = ['yearsOfService', 'yearsOfServiceSuffix', 'activeCountries',
        'activeCountriesSuffix', 'treesPlanted', 'treesPlantedSuffix',
        'label_years', 'label_countries', 'label_trees'];
    fields.forEach(k => {
        if (req.body[k] !== undefined) {
            // numeric fields: store as number when possible
            const numFields = ['yearsOfService', 'activeCountries', 'treesPlanted'];
            gs[k] = numFields.includes(k) && !isNaN(Number(req.body[k]))
                ? Number(req.body[k])
                : req.body[k];
        }
    });
    writeGlobalStats(gs);
    res.json({ ok: true, stats: gs });
});

// ── Stats ──────────────────────────────────────────────────────
app.patch('/api/projects/:id/stats', requireAuth, (req, res) => {
    const data = readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const { since, totalTrips, treesPlanted, label_trips, label_metric } = req.body;
    data.stats = data.stats || {};
    if (since !== undefined) data.stats.since = since;
    if (totalTrips !== undefined) data.stats.totalTrips = isNaN(Number(totalTrips)) ? totalTrips : Number(totalTrips);
    if (treesPlanted !== undefined) data.stats.treesPlanted = treesPlanted;
    if (label_trips !== undefined) data.stats.label_trips = label_trips;
    if (label_metric !== undefined) data.stats.label_metric = label_metric;

    writeProject(req.params.id, data);
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

    const card = data.card || {};
    const fields = ['tag', 'slogan_line1', 'slogan_line2', 'lead', 'body',
        'instagram_handle', 'instagram_url'];
    fields.forEach(k => { if (req.body[k] !== undefined) card[k] = req.body[k]; });

    // meta is an array of {label, value} — sent as JSON string
    if (req.body.meta !== undefined) {
        try { card.meta = JSON.parse(req.body.meta); } catch { }
    }
    // Also accept individual meta fields meta_0_label, meta_0_value, etc.
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
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Body must be an array' });
    writeHistory(items);
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
    res.status(201).json({ ok: true, item: newItem, index: items.length - 1 });
});

// Auth-protected: edit item by index
app.patch('/api/history/items/:index', requireAuth, (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const items = readHistory();
    if (isNaN(idx) || idx < 0 || idx >= items.length)
        return res.status(400).json({ error: 'Invalid index' });
    const { year, title, body } = req.body || {};
    if (year !== undefined) items[idx].year = String(year);
    if (title !== undefined) items[idx].title = String(title);
    if (body !== undefined) items[idx].body = String(body);
    writeHistory(items);
    res.json({ ok: true, item: items[idx] });
});

// Auth-protected: delete item by index
app.delete('/api/history/items/:index', requireAuth, (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const items = readHistory();
    if (isNaN(idx) || idx < 0 || idx >= items.length)
        return res.status(400).json({ error: 'Invalid index' });
    items.splice(idx, 1);
    writeHistory(items);
    res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n✅  Axis server running at \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`   Admin panel: \x1b[36mhttp://localhost:${PORT}/admin.html\x1b[0m\n`);
});
