/* ═══════════════════════════════════════════════════════════
   AXIS — Admin Panel Frontend Logic
   Handles auth, project loading, CRUD forms, image previews
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─── State ────────────────────────────────────────────────────
let currentProject = 'mongolia';
let currentTab = 'diary';
let projectData = {};
let sectionCount = 0;
let qaCount = 0;
let pendingDelete = null;  // { type, index }
let editMode = null;       // null | { type, index }

// ─── Token Storage ────────────────────────────────────────────
function getToken() { return localStorage.getItem('axis_admin_token'); }
function setToken(t) { localStorage.setItem('axis_admin_token', t); }
function clearToken() { localStorage.removeItem('axis_admin_token'); }

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (getToken()) {
        showDashboard();
        // loadSidebarProjects() will call loadProject() once the project list is ready
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
    }

    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        clearToken();
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('passwordInput').value = '';
    });

    // Tab switch
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            document.getElementById(`tab-${currentTab}`).classList.add('active');
            // Auto-load Stats when switching to the stats tab
            if (currentTab === 'stats') loadStatsTab();
            // Auto-load Card when switching to the cards tab
            if (currentTab === 'cards') loadCardForm();
            // Auto-load Projects index when switching to projects tab
            if (currentTab === 'projects') loadProjectIndexTab();
            // Auto-load History when switching to the history tab
            if (currentTab === 'history') loadHistoryTab();
        });
    });

    // Project switch
    document.querySelectorAll('.project-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.project-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentProject = btn.dataset.project;
            document.getElementById('currentProjectLabel').textContent =
                btn.querySelector('.project-name').textContent;
            loadProject(currentProject);
            // If Stats tab is open, refresh project stats section
            if (currentTab === 'stats') loadProjectStatsForm();
            // If Cards tab is open, refresh card form
            if (currentTab === 'cards') loadCardForm();
        });
    });

    // Forms
    document.getElementById('diaryForm').addEventListener('submit', handleDiarySubmit);
    document.getElementById('reportForm').addEventListener('submit', handleReportSubmit);
    document.getElementById('galleryForm').addEventListener('submit', handleGallerySubmit);
    document.getElementById('interviewForm').addEventListener('submit', handleInterviewSubmit);
    document.getElementById('globalStatsForm').addEventListener('submit', handleGlobalStatsSubmit);
    document.getElementById('projectStatsForm').addEventListener('submit', handleProjectStatsSubmit);
    document.getElementById('cardForm').addEventListener('submit', handleCardSubmit);

    // Dynamic section/qa buttons
    document.getElementById('addSectionBtn').addEventListener('click', addSection);
    document.getElementById('addQaBtn').addEventListener('click', addQaPair);
    addSection();    // start with one section
    addQaPair();     // start with one Q&A

    // Image previews (diary + interview use generic helper; gallery has its own)
    setupImagePreview('diaryImgInput', 'diaryImgPreviews', true);
    setupImagePreview('interviewPhotoInput', 'interviewPhotoPreview', false);
    // Gallery: dedicated multi-file drop-zone
    setupGalleryUploadZone();

    // Confirm dialog
    document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
    document.getElementById('confirmOk').addEventListener('click', () => {
        if (!pendingDelete) return closeConfirm();
        doDelete(pendingDelete.type, pendingDelete.index);
        closeConfirm();
    });

    // Activity Log toggle button (sidebar bottom)
    const alBtn = document.getElementById('activityLogToggleBtn');
    if (alBtn) alBtn.addEventListener('click', openActivityLog);

    // ── New Project Form ─────────────────────────────────────────
    document.getElementById('newProjectForm').addEventListener('submit', handleNewProjectSubmit);

    // "+ New Project" sidebar shortcut → switch to Projects tab
    const addShortcut = document.getElementById('addProjectShortcut');
    if (addShortcut) {
        addShortcut.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            const projectsTab = document.querySelector('[data-tab="projects"]');
            if (projectsTab) projectsTab.classList.add('active');
            document.getElementById('tab-projects').classList.add('active');
            currentTab = 'projects';
            loadProjectIndexTab();
        });
    }

    // Load sidebar project list dynamically
    loadSidebarProjects();
});

// ─── Auth ─────────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('loginError');
    const pw = document.getElementById('passwordInput').value;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    err.textContent = '';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw })
        });
        if (!res.ok) throw new Error('Wrong password');
        const { token } = await res.json();
        setToken(token);
        showDashboard();
        loadProject(currentProject);
    } catch {
        err.textContent = 'Incorrect password. Please try again.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

// ─── Load Project ─────────────────────────────────────────────
async function loadProject(id) {
    try {
        const res = await authFetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error('Failed to load');
        projectData = await res.json();
        renderAllLists();
    } catch {
        toast('Failed to load project data', 'error');
    }
}

function renderAllLists() {
    renderDiaryList();
    renderReportList();
    renderGalleryList();
    renderInterviewList();
    buildAutocomplete();
}

// ─── Autocomplete Datalists ───────────────────────────────────
function buildAutocomplete() {
    // Helper: collect unique non-empty values for a field across an array
    function unique(arr, field) {
        return [...new Set(
            (arr || []).map(item => (item[field] || '').trim()).filter(Boolean)
        )];
    }
    // Fill a datalist with option elements
    function fill(id, values) {
        const dl = document.getElementById(id);
        if (!dl) return;
        dl.innerHTML = values.map(v => `<option value="${v.replace(/"/g, '&quot;')}"></option>`).join('');
    }

    const diary = projectData.diary || [];
    const gallery = projectData.gallery || [];
    const reports = projectData.reports || [];
    const interviews = projectData.interviews || [];

    // location: merge diary + gallery locations
    const locations = [...new Set([
        ...unique(diary, 'location'),
        ...unique(gallery, 'location')
    ])];
    fill('ac-location', locations);
    fill('ac-period', unique(reports, 'period'));
    fill('ac-trip', unique(gallery, 'trip'));
    fill('ac-caption', unique(gallery, 'caption'));
    fill('ac-university', unique(interviews, 'university'));
    fill('ac-department', unique(interviews, 'department'));
    fill('ac-grade', unique(interviews, 'grade'));
}

// ─── Stats Tab ────────────────────────────────────────────────
async function loadStatsTab() {
    await Promise.all([loadGlobalStatsForm(), loadProjectStatsForm()]);
}

async function loadGlobalStatsForm() {
    try {
        const res = await fetch('/api/global-stats');
        if (!res.ok) return;
        const gs = await res.json();
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        set('gs-years', gs.yearsOfService);
        set('gs-yearsLabel', gs.label_years);
        set('gs-countries', gs.activeCountries);
        set('gs-countriesLabel', gs.label_countries);
        set('gs-trees', gs.treesPlanted);
        set('gs-treesSuffix', gs.treesPlantedSuffix);
        set('gs-treesLabel', gs.label_trees);
    } catch { toast('Failed to load global stats', 'error'); }
}

async function loadProjectStatsForm() {
    // Show current project name (capitalize first letter)
    const title = document.getElementById('projectStatsTitle');
    if (title) title.textContent = currentProject.charAt(0).toUpperCase() + currentProject.slice(1);

    try {
        const res = await authFetch(`/api/projects/${currentProject}`);
        if (!res.ok) return;
        const data = await res.json();
        const s = data.stats || {};
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        set('ps-since', s.since);
        set('ps-trips', s.totalTrips);
        set('ps-metric', s.treesPlanted);
        set('ps-labelTrips', s.label_trips);
        set('ps-labelMetric', s.label_metric);
    } catch { toast('Failed to load project stats', 'error'); }
}

async function handleGlobalStatsSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('globalStatsSubmitBtn');
    const status = document.getElementById('globalStatsStatus');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    status.textContent = '';

    const body = {};
    new FormData(e.target).forEach((v, k) => { body[k] = v.trim(); });

    try {
        const res = await authFetch('/api/global-stats', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error();
        status.textContent = '✓ Saved!';
        status.className = 'form-status success';
        toast('Global stats updated', 'success');
        setTimeout(() => { status.textContent = ''; status.className = 'form-status'; }, 3500);
    } catch {
        status.textContent = '✗ Failed';
        status.className = 'form-status error';
        toast('Save failed — try again', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Global Stats';
    }
}

async function handleProjectStatsSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('projectStatsSubmitBtn');
    const status = document.getElementById('projectStatsStatus');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    status.textContent = '';

    const body = {};
    new FormData(e.target).forEach((v, k) => { body[k] = v.trim(); });

    try {
        const res = await authFetch(`/api/projects/${currentProject}/stats`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error();
        status.textContent = '✓ Saved!';
        status.className = 'form-status success';
        toast(`${currentProject} stats updated`, 'success');
        setTimeout(() => { status.textContent = ''; status.className = 'form-status'; }, 3500);
    } catch {
        status.textContent = '✗ Failed';
        status.className = 'form-status error';
        toast('Save failed — try again', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Project Stats';
    }
}

// ─── Cards Tab ────────────────────────────────────────────────
async function loadCardForm() {
    const titleEl = document.getElementById('cardProjectTitle');
    if (titleEl) titleEl.textContent = currentProject.charAt(0).toUpperCase() + currentProject.slice(1);

    // Reset image preview when switching projects
    const cardImgPreview = document.getElementById('cardImgPreview');
    const cardImgInput = document.getElementById('cardImgInput');
    if (cardImgPreview) cardImgPreview.innerHTML = '';
    if (cardImgInput) cardImgInput.value = '';

    // Setup image preview handler
    if (cardImgInput && !cardImgInput._previewAttached) {
        cardImgInput._previewAttached = true;
        setupImagePreview('cardImgInput', 'cardImgPreview', false);
    }

    try {
        const res = await authFetch(`/api/projects/${currentProject}/card`);
        if (!res.ok) return;
        const card = await res.json();
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        set('cf-tag', card.tag);
        set('cf-slogan1', card.slogan_line1);
        set('cf-slogan2', card.slogan_line2);
        set('cf-lead', card.lead);
        set('cf-body', card.body);
        const meta = card.meta || [];
        [0, 1, 2].forEach(i => {
            set(`cf-m${i}l`, meta[i]?.label ?? '');
            set(`cf-m${i}v`, meta[i]?.value ?? '');
        });
        set('cf-ighandle', card.instagram_handle);
        set('cf-igurl', card.instagram_url);

        // Show current image
        const currentImgEl = document.getElementById('cardCurrentImg');
        if (currentImgEl) {
            if (card.image) {
                currentImgEl.innerHTML = `Current: <a href="/${card.image}" target="_blank" style="color:var(--gold,#C5A028);">${card.image}</a>`;
            } else {
                currentImgEl.textContent = 'No card image set.';
            }
        }
    } catch { toast('Failed to load card data', 'error'); }
}

async function handleCardSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('cardSubmitBtn');
    const status = document.getElementById('cardStatus');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    status.textContent = '';

    // Build as FormData to support file upload
    const fd = new FormData();
    fd.append('tag', document.getElementById('cf-tag')?.value.trim() ?? '');
    fd.append('slogan_line1', document.getElementById('cf-slogan1')?.value.trim() ?? '');
    fd.append('slogan_line2', document.getElementById('cf-slogan2')?.value.trim() ?? '');
    fd.append('lead', document.getElementById('cf-lead')?.value.trim() ?? '');
    fd.append('body', document.getElementById('cf-body')?.value.trim() ?? '');
    fd.append('instagram_handle', document.getElementById('cf-ighandle')?.value.trim() ?? '');
    fd.append('instagram_url', document.getElementById('cf-igurl')?.value.trim() ?? '');
    fd.append('meta_0_label', document.getElementById('cf-m0l')?.value.trim() ?? '');
    fd.append('meta_0_value', document.getElementById('cf-m0v')?.value.trim() ?? '');
    fd.append('meta_1_label', document.getElementById('cf-m1l')?.value.trim() ?? '');
    fd.append('meta_1_value', document.getElementById('cf-m1v')?.value.trim() ?? '');
    fd.append('meta_2_label', document.getElementById('cf-m2l')?.value.trim() ?? '');
    fd.append('meta_2_value', document.getElementById('cf-m2v')?.value.trim() ?? '');

    // Attach image file if selected
    const cardImgInput = document.getElementById('cardImgInput');
    if (cardImgInput?.files?.[0]) fd.append('card_image', cardImgInput.files[0], cardImgInput.files[0].name);

    try {
        const res = await authFetch(`/api/projects/${currentProject}/card`, {
            method: 'PATCH',
            body: fd   // no Content-Type header — browser sets multipart boundary
        });
        if (!res.ok) throw new Error();
        status.textContent = '✓ Saved!';
        status.className = 'form-status success';
        toast(`${currentProject} card updated`, 'success');
        setTimeout(() => { status.textContent = ''; status.className = 'form-status'; }, 3500);
        // Reload to show updated current image path
        loadCardForm();
    } catch {
        status.textContent = '✗ Failed';
        status.className = 'form-status error';
        toast('Save failed — try again', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Card';
    }
}

// ─── API Fetch helper ─────────────────────────────────────────
function authFetch(url, opts = {}) {
    return fetch(url, {
        ...opts,
        headers: {
            ...(opts.headers || {}),
            'Authorization': `Bearer ${getToken()}`
        }
    });
}

// ─── Image preview setup ──────────────────────────────────────
function setupImagePreview(inputId, previewId, multiple) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    function renderPreviews(files) {
        preview.innerHTML = '';
        const list = multiple ? Array.from(files) : (files[0] ? [files[0]] : []);
        list.forEach(file => {
            const div = document.createElement('div');
            div.className = 'img-preview';
            if (!multiple) { div.style.width = '90px'; div.style.height = '90px'; }
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            div.appendChild(img);
            preview.appendChild(div);
        });
    }

    input.addEventListener('change', () => renderPreviews(input.files));

    // Drag & Drop on the upload-zone wrapping the input
    const zone = input.closest('.upload-zone');
    if (!zone) return;

    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('upload-zone--drag');
    });
    zone.addEventListener('dragleave', e => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('upload-zone--drag');
    });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('upload-zone--drag');
        const dt = e.dataTransfer;
        if (!dt || !dt.files.length) return;
        // Assign dropped files to the input via DataTransfer
        const transfer = new DataTransfer();
        const dropped = Array.from(dt.files).filter(f => f.type.startsWith('image/'));
        const toAdd = multiple ? dropped : [dropped[0]].filter(Boolean);
        toAdd.forEach(f => transfer.items.add(f));
        input.files = transfer.files;
        renderPreviews(input.files);
    });
}


// ─── Dynamic Sections (Reports) ───────────────────────────────
function addSection(heading = '', body = '') {
    sectionCount++;
    const id = `section-${sectionCount}`;
    const div = document.createElement('div');
    div.className = 'dynamic-item';
    div.id = id;
    div.innerHTML = `
        <button type="button" class="dynamic-item-remove" onclick="document.getElementById('${id}').remove()">✕</button>
        <div class="form-grid">
            <div class="field form-col-full">
                <label>Section Heading</label>
                <input type="text" name="sec_heading" value="${escHtml(heading)}" placeholder="e.g. 活動目標・背景">
            </div>
            <div class="field form-col-full">
                <label>Content</label>
                <textarea name="sec_body" rows="3" placeholder="Section content...">${escHtml(body)}</textarea>
            </div>
        </div>`;
    document.getElementById('reportSections').appendChild(div);
}

// ─── Dynamic Q&A (Interviews) ─────────────────────────────────
function addQaPair(q = '', a = '') {
    qaCount++;
    const id = `qa-${qaCount}`;
    const div = document.createElement('div');
    div.className = 'dynamic-item';
    div.id = id;
    div.innerHTML = `
        <button type="button" class="dynamic-item-remove" onclick="document.getElementById('${id}').remove()">✕</button>
        <div class="form-grid">
            <div class="field form-col-full">
                <label>Question</label>
                <input type="text" name="qa_q" value="${escHtml(q)}" placeholder="e.g. Why did you join Axis?">
            </div>
            <div class="field form-col-full">
                <label>Answer</label>
                <textarea name="qa_a" rows="3" placeholder="Answer...">${escHtml(a)}</textarea>
            </div>
        </div>`;
    document.getElementById('qandaItems').appendChild(div);
}

// ─── Collect sections and Q&A ─────────────────────────────────
function collectSections() {
    const items = document.querySelectorAll('#reportSections .dynamic-item');
    return Array.from(items).map(item => ({
        heading: item.querySelector('[name=sec_heading]')?.value || '',
        body: item.querySelector('[name=sec_body]')?.value || ''
    })).filter(s => s.heading || s.body);
}

function collectQanda() {
    const items = document.querySelectorAll('#qandaItems .dynamic-item');
    return Array.from(items).map(item => ({
        q: item.querySelector('[name=qa_q]')?.value || '',
        a: item.querySelector('[name=qa_a]')?.value || ''
    })).filter(p => p.q || p.a);
}

// ─── FORM: Diary ──────────────────────────────────────────────
async function handleDiarySubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('diarySubmitBtn');
    const status = document.getElementById('diaryStatus');
    const form = e.target;
    const isEdit = editMode && editMode.type === 'diary';

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + (isEdit ? 'Saving…' : 'Uploading…');
    status.textContent = '';
    status.className = 'form-status';

    try {
        const fd = new FormData(form);
        const url = isEdit
            ? `/api/projects/${currentProject}/diary/${editMode.index}`
            : `/api/projects/${currentProject}/diary`;
        const method = isEdit ? 'PATCH' : 'POST';
        const res = await authFetch(url, { method, body: fd });
        if (!res.ok) throw new Error();
        const entry = await res.json();
        projectData.diary = projectData.diary || [];
        if (isEdit) {
            projectData.diary[editMode.index] = entry;
        } else {
            projectData.diary.unshift(entry);
        }
        renderDiaryList();
        form.reset();
        document.getElementById('diaryImgPreviews').innerHTML = '';
        status.textContent = isEdit ? '✓ Updated!' : '✓ Entry added!';
        status.className = 'form-status success';
        toast(isEdit ? 'Diary entry updated' : 'Diary entry added successfully', 'success');
        editMode = null;
    } catch {
        status.textContent = '✗ Failed to save. Try again.';
        status.className = 'form-status error';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Entry';
        setTimeout(() => { status.textContent = ''; }, 4000);
    }
}

// ─── FORM: Report ─────────────────────────────────────────────
async function handleReportSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('reportSubmitBtn');
    const status = document.getElementById('reportStatus');
    const form = e.target;
    const isEdit = editMode && editMode.type === 'reports';

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    status.textContent = '';
    status.className = 'form-status';

    try {
        const fd = new FormData(form);
        fd.set('sections', JSON.stringify(collectSections()));
        const impact = {};
        ['trees', 'students', 'schools', 'participants', 'members', 'workshops'].forEach(k => {
            const v = form[`impact_${k}`]?.value;
            if (v && parseInt(v) > 0) impact[k] = parseInt(v);
        });
        fd.set('impact', JSON.stringify(impact));

        const url = isEdit
            ? `/api/projects/${currentProject}/reports/${editMode.index}`
            : `/api/projects/${currentProject}/reports`;
        const method = isEdit ? 'PATCH' : 'POST';
        const res = await authFetch(url, { method, body: fd });
        if (!res.ok) throw new Error();
        const report = await res.json();
        projectData.reports = projectData.reports || [];
        if (isEdit) {
            projectData.reports[editMode.index] = report;
        } else {
            projectData.reports.unshift(report);
        }
        renderReportList();
        form.reset();
        document.getElementById('reportSections').innerHTML = '';
        addSection();
        status.textContent = isEdit ? '✓ Updated!' : '✓ Report added!';
        status.className = 'form-status success';
        toast(isEdit ? 'Report updated' : 'Report added successfully', 'success');
        editMode = null;
    } catch {
        status.textContent = '✗ Failed to save. Try again.';
        status.className = 'form-status error';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Report';
        setTimeout(() => { status.textContent = ''; }, 4000);
    }
}

// ─── FORM: Gallery (multi-upload + client-side resize) ──────────
async function handleGallerySubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('gallerySubmitBtn');
    const status = document.getElementById('galleryStatus');
    const form = e.target;
    const isEdit = editMode && editMode.type === 'gallery';

    // ── Edit mode: single patch (no resize needed, image optional) ──
    if (isEdit) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Saving…';
        status.textContent = '';
        try {
            const fd = new FormData(form);
            // If a new file was selected, resize and append
            const file = gallerySelectedFiles[0];
            if (file) {
                const resized = await resizeImageFile(file);
                fd.set('image', resized, file.name.replace(/\.[^.]+$/, '.jpg'));
            }
            const res = await authFetch(`/api/projects/${currentProject}/gallery/${editMode.index}`, { method: 'PATCH', body: fd });
            if (!res.ok) throw new Error();
            const item = await res.json();
            projectData.gallery[editMode.index] = item;
            renderGalleryList();
            resetGalleryForm();
            status.textContent = '✓ Updated!';
            status.className = 'form-status success';
            toast('Photo updated', 'success');
            editMode = null;
        } catch {
            status.textContent = '✗ Update failed.';
            status.className = 'form-status error';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Upload Photos';
            setTimeout(() => { status.textContent = ''; }, 4000);
        }
        return;
    }

    // ── Add mode: multi-file resize + batch upload ───────────────
    if (!gallerySelectedFiles.length) {
        status.textContent = '✗ Please select at least one photo.';
        status.className = 'form-status error';
        setTimeout(() => { status.textContent = ''; status.className = 'form-status'; }, 3000);
        return;
    }

    btn.disabled = true;
    status.textContent = '';
    status.className = 'form-status';

    const total = gallerySelectedFiles.length;
    let uploaded = 0;
    let failed = 0;

    try {
        // Resize all selected images in parallel
        btn.innerHTML = `<span class="spinner"></span> Resizing ${total} image${total > 1 ? 's' : ''}…`;
        const resizedBlobs = await Promise.all(
            gallerySelectedFiles.map(f => resizeImageFile(f))
        );

        // Build base FormData from form fields (date, location, trip, caption)
        const baseData = {
            date: form.querySelector('[name=date]')?.value || '',
            location: form.querySelector('[name=location]')?.value || '',
            trip: form.querySelector('[name=trip]')?.value || '',
            caption: form.querySelector('[name=caption]')?.value || '',
        };

        // Upload all resized blobs in one multipart request
        btn.innerHTML = `<span class="spinner"></span> Uploading ${total} image${total > 1 ? 's' : ''}…`;
        const fd = new FormData();
        Object.entries(baseData).forEach(([k, v]) => fd.append(k, v));
        resizedBlobs.forEach((blob, i) => {
            const origName = gallerySelectedFiles[i].name.replace(/\.[^.]+$/, '.jpg');
            fd.append('images', blob, origName);
        });

        const res = await authFetch(`/api/projects/${currentProject}/gallery`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error();
        const items = await res.json();
        uploaded = items.length;

        projectData.gallery = projectData.gallery || [];
        projectData.gallery.unshift(...items);
        renderGalleryList();
        resetGalleryForm();

        status.textContent = `✓ ${uploaded} photo${uploaded > 1 ? 's' : ''} uploaded!`;
        status.className = 'form-status success';
        toast(`${uploaded} photo${uploaded > 1 ? 's' : ''} added to gallery`, 'success');
    } catch {
        failed = total - uploaded;
        status.textContent = failed === total ? '✗ Upload failed.' : `✗ ${failed} of ${total} uploads failed.`;
        status.className = 'form-status error';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Upload Photos';
        setTimeout(() => { status.textContent = ''; status.className = 'form-status'; }, 5000);
    }
}

// ─── FORM: Interview ──────────────────────────────────────────
async function handleInterviewSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('interviewSubmitBtn');
    const status = document.getElementById('interviewStatus');
    const form = e.target;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    status.textContent = '';
    status.className = 'form-status';

    try {
        const fd = new FormData(form);
        fd.set('qanda', JSON.stringify(collectQanda()));
        const isEditIv = editMode && editMode.type === 'interviews';
        const urlIv = isEditIv
            ? `/api/projects/${currentProject}/interviews/${editMode.index}`
            : `/api/projects/${currentProject}/interviews`;
        const methodIv = isEditIv ? 'PATCH' : 'POST';
        const res = await authFetch(urlIv, { method: methodIv, body: fd });
        if (!res.ok) throw new Error();
        const iv = await res.json();
        projectData.interviews = projectData.interviews || [];
        if (isEditIv) {
            projectData.interviews[editMode.index] = iv;
        } else {
            projectData.interviews.push(iv);
        }
        renderInterviewList();
        form.reset();
        document.getElementById('interviewPhotoPreview').innerHTML = '';
        document.getElementById('qandaItems').innerHTML = '';
        addQaPair();
        status.textContent = isEditIv ? '✓ Updated!' : '✓ Interview added!';
        status.className = 'form-status success';
        toast(isEditIv ? 'Interview updated' : 'Interview added successfully', 'success');
        editMode = null;
    } catch {
        status.textContent = '✗ Failed to save.';
        status.className = 'form-status error';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Interview';
        setTimeout(() => { status.textContent = ''; }, 4000);
    }
}

// ─── Render Lists ─────────────────────────────────────────────
function renderDiaryList() {
    const list = document.getElementById('diaryList');
    const entries = projectData.diary || [];
    if (!entries.length) { list.innerHTML = emptyState('📓', 'No diary entries yet'); return; }

    list.innerHTML = entries.map((e, i) => `
        <div class="entry-card">
            ${e.images?.[0] ? `<img class="entry-card-thumb" src="${e.images[0]}" alt="">` : ''}
            <div class="entry-card-info">
                <div class="entry-card-title">${escHtml(e.title || '(No title)')}</div>
                <div class="entry-card-meta">
                    <span>${escHtml(e.date || '')}</span>
                    <span>📍 ${escHtml(e.location || '')}</span>
                    ${e.images?.length ? `<span class="tag">📷 ${e.images.length} photo${e.images.length > 1 ? 's' : ''}</span>` : ''}
                </div>
            </div>
            <div class="entry-card-actions">
                <button class="entry-edit-btn" onclick="openEditForm('diary', ${i})" title="Edit">✏️</button>
                <button class="entry-delete-btn" onclick="confirmDelete('diary', ${i})" title="Delete">🗑</button>
            </div>
        </div>`).join('');
}

function renderReportList() {
    const list = document.getElementById('reportList');
    const reports = projectData.reports || [];
    if (!reports.length) { list.innerHTML = emptyState('📋', 'No reports yet'); return; }

    list.innerHTML = reports.map((r, i) => `
        <div class="entry-card">
            <div class="entry-card-info">
                <div class="entry-card-title">${escHtml(r.title || '(No title)')}</div>
                <div class="entry-card-meta">
                    <span>${escHtml(r.period || r.date || '')}</span>
                    ${r.members ? `<span>👤 ${r.members} members</span>` : ''}
                    ${r.sections?.length ? `<span class="tag">${r.sections.length} sections</span>` : ''}
                </div>
            </div>
            <div class="entry-card-actions">
                <button class="entry-edit-btn" onclick="openEditForm('reports', ${i})" title="Edit">✏️</button>
                <button class="entry-delete-btn" onclick="confirmDelete('reports', ${i})" title="Delete">🗑</button>
            </div>
        </div>`).join('');
}

function renderGalleryList() {
    const list = document.getElementById('galleryList');
    const items = projectData.gallery || [];
    if (!items.length) { list.innerHTML = emptyState('📷', 'No photos yet'); return; }

    list.innerHTML = items.map((g, i) => `
        <div class="entry-card">
            ${g.image ? `<img class="entry-card-thumb" src="${g.image}" alt="">` : `<div class="entry-card-thumb" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border-radius:8px;font-size:20px;">📷</div>`}
            <div class="entry-card-info">
                <div class="entry-card-title">${escHtml(g.caption || '(No caption)')}</div>
                <div class="entry-card-meta">
                    <span>${escHtml(g.date || '')}</span>
                    <span>📍 ${escHtml(g.location || '')}</span>
                    ${g.trip ? `<span class="tag">${escHtml(g.trip)}</span>` : ''}
                </div>
            </div>
            <div class="entry-card-actions">
                <button class="entry-edit-btn" onclick="openEditForm('gallery', ${i})" title="Edit">✏️</button>
                <button class="entry-delete-btn" onclick="confirmDelete('gallery', ${i})" title="Delete">🗑</button>
            </div>
        </div>`).join('');
}

function renderInterviewList() {
    const list = document.getElementById('interviewList');
    const interviews = projectData.interviews || [];
    if (!interviews.length) { list.innerHTML = emptyState('🎙️', 'No interviews yet'); return; }

    list.innerHTML = interviews.map((iv, i) => `
        <div class="entry-card">
            ${iv.photo ? `<img class="entry-card-thumb" src="${iv.photo}" alt="" style="border-radius:50%">` : `<div class="entry-card-thumb" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border-radius:50%;font-size:22px;">👤</div>`}
            <div class="entry-card-info">
                <div class="entry-card-title">${escHtml(iv.name || '(No name)')}</div>
                <div class="entry-card-meta">
                    <span>${[escHtml(iv.university || ''), escHtml(iv.department || ''), escHtml(iv.grade || '')].filter(Boolean).join(' · ')}</span>
                    ${iv.qanda?.length ? `<span class="tag">${iv.qanda.length} Q&amp;A</span>` : ''}
                </div>
            </div>
            <div class="entry-card-actions">
                <button class="entry-edit-btn" onclick="openEditForm('interviews', ${i})" title="Edit">✏️</button>
                <button class="entry-delete-btn" onclick="confirmDelete('interviews', ${i})" title="Delete">🗑</button>
            </div>
        </div>`).join('');
}

// ─── Delete ───────────────────────────────────────────────────
function confirmDelete(type, index) {
    pendingDelete = { type, index };
    document.getElementById('confirmOverlay').classList.remove('hidden');
}

function closeConfirm() {
    pendingDelete = null;
    document.getElementById('confirmOverlay').classList.add('hidden');
}

async function doDelete(type, index) {
    try {
        const res = await authFetch(`/api/projects/${currentProject}/${type}/${index}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error();
        // Remove from local state
        const keyMap = { diary: 'diary', reports: 'reports', gallery: 'gallery', interviews: 'interviews' };
        projectData[keyMap[type]].splice(index, 1);
        renderAllLists();
        toast('Entry deleted', 'success');
    } catch {
        toast('Delete failed', 'error');
    }
}

// Expose for inline onclick handlers
window.confirmDelete = confirmDelete;
window.openEditForm = openEditForm;

// ─── Open Edit Form ────────────────────────────────────────────
function openEditForm(type, index) {
    editMode = { type, index };

    // Switch to the correct tab
    const tabName = type === 'reports' ? 'reports' : type === 'interviews' ? 'interviews' : type;
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    const tabBtn = document.querySelector(`.admin-tab-btn[data-tab="${tabName}"]`);
    if (tabBtn) { tabBtn.classList.add('active'); currentTab = tabName; }
    const tabContent = document.getElementById(`tab-${tabName}`);
    if (tabContent) tabContent.classList.add('active');

    const item = (projectData[type] || [])[index];
    if (!item) return;

    if (type === 'diary') {
        const f = document.getElementById('diaryForm');
        f.querySelector('[name=date]').value = item.date || '';
        f.querySelector('[name=location]').value = item.location || '';
        f.querySelector('[name=title]').value = item.title || '';
        f.querySelector('[name=body]').value = item.body || '';
        // Update button label
        document.getElementById('diarySubmitBtn').textContent = 'Update Entry';
    } else if (type === 'reports') {
        const f = document.getElementById('reportForm');
        f.querySelector('[name=title]').value = item.title || '';
        f.querySelector('[name=period]').value = item.period || '';
        f.querySelector('[name=date]').value = item.date || '';
        f.querySelector('[name=members]').value = item.members || '';
        f.querySelector('[name=summary]').value = item.summary || '';
        // Rebuild sections
        document.getElementById('reportSections').innerHTML = '';
        sectionCount = 0;
        (item.sections || []).forEach(s => addSection(s.heading, s.body));
        if (item.sections?.length === 0) addSection();
        // Impact
        const impact = item.impact || {};
        ['trees', 'students', 'schools', 'participants', 'members', 'workshops'].forEach(k => {
            const el = f.querySelector(`[name=impact_${k}]`);
            if (el) el.value = impact[k] || '';
        });
        document.getElementById('reportSubmitBtn').textContent = 'Update Report';
    } else if (type === 'gallery') {
        const f = document.getElementById('galleryForm');
        f.querySelector('[name=date]').value = item.date || '';
        f.querySelector('[name=location]').value = item.location || '';
        f.querySelector('[name=trip]').value = item.trip || '';
        f.querySelector('[name=caption]').value = item.caption || '';
        document.getElementById('gallerySubmitBtn').textContent = 'Update Photo';
    } else if (type === 'interviews') {
        const f = document.getElementById('interviewForm');
        f.querySelector('[name=name]').value = item.name || '';
        f.querySelector('[name=university]').value = item.university || '';
        f.querySelector('[name=department]').value = item.department || '';
        f.querySelector('[name=grade]').value = item.grade || '';
        // Rebuild Q&A
        document.getElementById('qandaItems').innerHTML = '';
        qaCount = 0;
        (item.qanda || []).forEach(qa => addQaPair(qa.q, qa.a));
        if (item.qanda?.length === 0) addQaPair();
        document.getElementById('interviewSubmitBtn').textContent = 'Update Interview';
    }

    // Scroll to form
    const formEl = document.getElementById(`${tabName === 'reports' ? 'report' : tabName === 'interviews' ? 'interview' : tabName}Form`);
    if (formEl) formEl.closest('.add-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Toast ───────────────────────────────────────────────────
function toast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${type === 'success' ? '✓' : '✗'} ${escHtml(msg)}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// ─── Helpers ──────────────────────────────────────────────────
function emptyState(icon, msg) {
    return `<div class="empty-entries"><div class="empty-icon">${icon}</div><p>${escHtml(msg)}</p></div>`;
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════
//  PROJECT INDEX MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * Dynamically populate the sidebar project list from /api/projects-index.
 * Falls back to existing static buttons if API unavailable.
 */
async function loadSidebarProjects() {
    const listEl = document.getElementById('sidebarProjectList');
    if (!listEl) return;
    try {
        const res = await fetch('/api/projects-index');
        if (!res.ok) return;
        const projects = await res.json();

        listEl.innerHTML = projects.map((p, i) => `
            <button class="project-btn${i === 0 ? ' active' : ''}" data-project="${escHtml(p.id)}">
                <span class="project-name">${escHtml(p.name)}</span>
            </button>
        `).join('');

        // Re-attach click events
        listEl.querySelectorAll('.project-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                listEl.querySelectorAll('.project-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentProject = btn.dataset.project;
                document.getElementById('currentProjectLabel').textContent =
                    btn.querySelector('.project-name').textContent;
                loadProject(currentProject);
                if (currentTab === 'stats') loadProjectStatsForm();
                if (currentTab === 'cards') loadCardForm();
            });
        });

        // Default: select first project
        if (projects.length > 0) {
            currentProject = projects[0].id;
            document.getElementById('currentProjectLabel').textContent = projects[0].name;
            loadProject(currentProject);
        }
    } catch { /* silently fall back to existing static sidebar buttons */ }
}

/**
 * Load the Projects Index tab: show existing projects list.
 */
async function loadProjectIndexTab() {
    const itemsEl = document.getElementById('projectIndexItems');
    if (!itemsEl) return;
    itemsEl.innerHTML = '<p style="color:rgba(255,255,255,0.4);padding:16px;">Loading…</p>';

    // ── Populate country dropdown ──────────────────────────────────
    const selectEl = document.getElementById('np_country_select');
    if (selectEl && selectEl.options.length <= 1) {
        try {
            const catRes = await fetch('/api/countries-catalog');
            if (catRes.ok) {
                const catalog = await catRes.json();
                // Store catalog on the select element for later lookup
                selectEl._catalog = catalog;
                catalog.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.iso;
                    opt.textContent = `${c.name} (${c.iso})`;
                    opt.dataset.markerX = c.markerX;
                    opt.dataset.markerY = c.markerY;
                    opt.dataset.labelY = c.labelY;
                    opt.dataset.name = c.name;
                    selectEl.appendChild(opt);
                });

                // onChange: auto-fill hidden inputs + preview badge
                selectEl.addEventListener('change', () => {
                    const opt = selectEl.options[selectEl.selectedIndex];
                    const previewRow = document.getElementById('np_preview_row');
                    const previewBadge = document.getElementById('np_preview_badge');

                    if (!opt.value) {
                        // Reset
                        ['np_code', 'np_name', 'np_markerX', 'np_markerY', 'np_labelY'].forEach(id => {
                            const el = document.getElementById(id);
                            if (el) el.value = '';
                        });
                        document.getElementById('np_id').value = '';
                        document.getElementById('np_label').value = '';
                        if (previewRow) previewRow.style.display = 'none';
                        return;
                    }

                    // Fill hidden fields
                    document.getElementById('np_code').value = opt.value;
                    document.getElementById('np_name').value = opt.dataset.name;
                    document.getElementById('np_markerX').value = opt.dataset.markerX;
                    document.getElementById('np_markerY').value = opt.dataset.markerY;
                    document.getElementById('np_labelY').value = opt.dataset.labelY;

                    // Auto-fill editable fields (user can still change)
                    const idEl = document.getElementById('np_id');
                    const labelEl = document.getElementById('np_label');
                    if (idEl && !idEl.dataset.userEdited)
                        idEl.value = opt.value.toLowerCase();
                    if (labelEl && !labelEl.dataset.userEdited)
                        labelEl.value = opt.dataset.name.toUpperCase();

                    // Show preview badge
                    if (previewRow && previewBadge) {
                        previewRow.style.display = 'block';
                        previewBadge.innerHTML =
                            `<span style="font-size:16px;">✅</span>` +
                            `<strong style="color:#fff;">${escHtml(opt.dataset.name)}</strong>` +
                            `<span>ISO: <code style="color:#7ec8e3;">${escHtml(opt.value)}</code></span>` +
                            `<span>Marker: <code style="color:#7ec8e3;">(${opt.dataset.markerX}, ${opt.dataset.markerY})</code></span>`;
                    }
                });

                // Track manual edits so we don't override user's input
                ['np_id', 'np_label'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', () => { el.dataset.userEdited = '1'; });
                });
            }
        } catch (catErr) {
            console.warn('Could not load countries catalog:', catErr);
        }
    }

    // ── Load existing projects list ────────────────────────────────
    try {
        const res = await fetch('/api/projects-index');
        if (!res.ok) throw new Error('fetch failed');
        const projects = await res.json();

        if (!projects.length) {
            itemsEl.innerHTML = emptyState('🌍', 'No projects yet. Add one above.');
            return;
        }

        itemsEl.innerHTML = projects.map(p => `
            <div class="entry-card" style="display:flex;align-items:center;gap:16px;padding:16px;border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="width:12px;height:12px;border-radius:50%;background:${escHtml(p.color || '#2C6E49')};flex-shrink:0;"></div>
                <div style="flex:1;">
                    <strong>${escHtml(p.name)}</strong>
                    <span style="color:rgba(255,255,255,0.4);margin-left:10px;font-size:12px;">${escHtml(p.id)}</span>
                    <span style="color:rgba(255,255,255,0.4);margin-left:10px;font-size:12px;">ISO: ${escHtml(p.countryCode)}</span>
                    <span style="color:rgba(255,255,255,0.4);margin-left:10px;font-size:12px;">Since ${escHtml(String(p.since))}</span>
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0;">
                    <button class="btn-edit" onclick="switchToProject('${escHtml(p.id)}')">Edit</button>
                    ${p.id !== 'mongolia' && p.id !== 'nepal' && p.id !== 'malaysia'
                ? `<button class="btn-delete" onclick="deleteProjectFromIndex('${escHtml(p.id)}')">Remove</button>`
                : `<span style="font-size:11px;color:rgba(255,255,255,0.2);padding:4px 8px;">core</span>`
            }
                </div>
            </div>
        `).join('');
    } catch {
        itemsEl.innerHTML = '<p style="color:#c0392b;padding:16px;">Failed to load projects.</p>';
    }
}

/**
 * Switch to a project from the Projects tab.
 */
function switchToProject(id) {
    // Activate the project in the sidebar
    document.querySelectorAll('.project-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.project === id);
    });
    currentProject = id;
    const btn = document.querySelector(`[data-project="${id}"]`);
    if (btn) document.getElementById('currentProjectLabel').textContent = btn.querySelector('.project-name').textContent;
    loadProject(currentProject);

    // Switch to diary tab
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    const diaryBtn = document.querySelector('[data-tab="diary"]');
    if (diaryBtn) diaryBtn.classList.add('active');
    document.getElementById('tab-diary').classList.add('active');
    currentTab = 'diary';
}

/**
 * Handle new project form submission.
 */
async function handleNewProjectSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('newProjectSubmitBtn');
    const msgEl = document.getElementById('newProjectMsg');
    btn.disabled = true;
    btn.textContent = 'Adding…';
    msgEl.style.display = 'none';

    try {
        const form = document.getElementById('newProjectForm');
        const fd = new FormData(form);

        // Auto-set labelY if not provided
        if (!fd.get('labelY') || fd.get('labelY') === '') {
            const markerY = parseFloat(fd.get('markerY')) || 0;
            fd.set('labelY', String(markerY + 25));
        }

        const res = await authFetch('/api/projects', {
            method: 'POST',
            body: fd
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed');

        toast(`Project '${data.project.name}' added successfully! Reload the main page to see it.`, 'success');
        form.reset();

        // Also reset dropdown + preview
        const sel = document.getElementById('np_country_select');
        if (sel) sel.value = '';
        const previewRow = document.getElementById('np_preview_row');
        if (previewRow) previewRow.style.display = 'none';
        // Clear userEdited flags
        ['np_id', 'np_label'].forEach(id => {
            const el = document.getElementById(id);
            if (el) delete el.dataset.userEdited;
        });

        // Refresh sidebar & project list
        await loadSidebarProjects();
        await loadProjectIndexTab();

    } catch (err) {
        msgEl.textContent = `Error: ${err.message}`;
        msgEl.style.display = 'block';
        msgEl.style.color = '#e74c3c';
        toast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Project';
    }
}

/**
 * Show the custom delete confirmation modal, then DELETE the project
 * (index entry + data file) and update the UI on success.
 */
function deleteProjectFromIndex(id) {
    const modal = document.getElementById('deleteModal');
    const descEl = document.getElementById('deleteModalDesc');
    const cancelBtn = document.getElementById('deleteModalCancel');
    const confirmBtn = document.getElementById('deleteModalConfirm');

    if (!modal) {
        // Fallback if modal HTML is missing
        if (confirm(`삭제: '${id}' — 계속하시겠습니까?`)) _doDelete(id);
        return;
    }

    // Populate description text
    descEl.textContent = `You are about to permanently delete the project '${id}'. This action cannot be undone.`;

    // Show modal (flex so centering works)
    modal.style.display = 'flex';

    // Disable confirm button initially and reset text
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete Permanently';

    // Close helpers
    function closeModal() {
        modal.style.display = 'none';
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
        modal.removeEventListener('click', onBackdrop);
    }
    function onCancel() { closeModal(); }
    function onBackdrop(e) { if (e.target === modal) closeModal(); }

    async function onConfirm() {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting…';
        try {
            const res = await authFetch(`/api/projects/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');

            closeModal();
            toast(`Project '${id}' and all its data have been permanently deleted.`, 'success');

            // If we were viewing the deleted project, fall back to mongolia
            if (currentProject === id) {
                currentProject = 'mongolia';
            }

            // Refresh sidebar + list
            await loadSidebarProjects();
            await loadProjectIndexTab();
        } catch (err) {
            closeModal();
            toast(err.message, 'error');
        }
    }

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    modal.addEventListener('click', onBackdrop);
}

// ═══════════════════════════════════════════════════════════
// HISTORY MANAGER
// ═══════════════════════════════════════════════════════════

let historyData = [];        // local in-memory cache
let historyEditIndex = null;  // null = add mode, number = edit mode

// ─── Load & Render ────────────────────────────────────────
async function loadHistoryTab() {
    try {
        const res = await authFetch('/api/history');
        if (!res.ok) throw new Error('Failed to load');
        historyData = await res.json();
        renderHistoryForm_reset();
        renderHistoryList();
    } catch {
        toast('Failed to load history data', 'error');
    }
}

function renderHistoryList() {
    const list = document.getElementById('historyList');
    if (!list) return;
    if (!historyData.length) {
        list.innerHTML = emptyState('📅', 'No history entries yet. Add the first one above.');
        return;
    }
    list.innerHTML = historyData.map((item, i) => `
        <div class="entry-card" id="history-entry-${i}">
            <div class="entry-card-info">
                <div class="entry-card-title">
                    <span style="font-size:13px;font-weight:700;color:var(--gold,#C5A028);margin-right:10px;min-width:90px;display:inline-block;">${escHtml(item.year || '')}</span>
                    ${escHtml(item.title || '(No title)')}
                </div>
                ${item.body ? `<div class="entry-card-meta" style="margin-top:6px;color:rgba(255,255,255,0.45);font-size:13px;line-height:1.5;">${escHtml(item.body)}</div>` : ''}
            </div>
            <div class="entry-card-actions" style="flex-direction:column;gap:4px;">
                <div style="display:flex;gap:4px;margin-bottom:4px;">
                    <button class="entry-edit-btn" title="Move Up"
                        onclick="historyMove(${i}, -1)" ${i === 0 ? 'disabled style="opacity:0.3"' : ''}>↑</button>
                    <button class="entry-edit-btn" title="Move Down"
                        onclick="historyMove(${i}, 1)" ${i === historyData.length - 1 ? 'disabled style="opacity:0.3"' : ''}>↓</button>
                </div>
                <button class="entry-edit-btn" onclick="historyOpenEdit(${i})" title="Edit">✏️</button>
                <button class="entry-delete-btn" onclick="historyConfirmDelete(${i})" title="Delete">🗑</button>
            </div>
        </div>
    `).join('');
}

// ─── Form Reset (Add Mode) ────────────────────────────────
function renderHistoryForm_reset() {
    historyEditIndex = null;
    const titleEl = document.getElementById('historyFormTitle');
    const btn = document.getElementById('historySubmitBtn');
    const cancelBtn = document.getElementById('historyCancelEditBtn');
    if (titleEl) titleEl.textContent = 'New Timeline Entry';
    if (btn) btn.textContent = 'Add Entry';
    if (cancelBtn) cancelBtn.style.display = 'none';
    const f = (id) => { const el = document.getElementById(id); if (el) el.value = ''; };
    f('hf-year'); f('hf-title'); f('hf-body'); f('hf-editIndex');
}

// ─── Open Edit (populate form) ────────────────────────────
function historyOpenEdit(index) {
    const item = historyData[index];
    if (!item) return;
    historyEditIndex = index;
    document.getElementById('historyFormTitle').textContent = 'Edit Timeline Entry';
    document.getElementById('historySubmitBtn').textContent = 'Save Changes';
    document.getElementById('historyCancelEditBtn').style.display = '';
    document.getElementById('hf-editIndex').value = String(index);
    document.getElementById('hf-year').value = item.year || '';
    document.getElementById('hf-title').value = item.title || '';
    document.getElementById('hf-body').value = item.body || '';
    // Scroll form into view
    document.getElementById('historyForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Form Submit (Add or Edit) ────────────────────────────
async function handleHistorySubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('historySubmitBtn');
    const status = document.getElementById('historyStatus');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    status.textContent = '';

    const year = document.getElementById('hf-year').value.trim();
    const title = document.getElementById('hf-title').value.trim();
    const body = document.getElementById('hf-body').value.trim();
    const isEdit = historyEditIndex !== null;

    try {
        let res;
        if (isEdit) {
            res = await authFetch(`/api/history/items/${historyEditIndex}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, title, body })
            });
        } else {
            res = await authFetch('/api/history/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, title, body })
            });
        }
        if (!res.ok) throw new Error();

        // Refresh local data & re-render
        const freshRes = await authFetch('/api/history');
        historyData = await freshRes.json();
        renderHistoryList();
        renderHistoryForm_reset();

        status.textContent = isEdit ? '✓ Updated!' : '✓ Entry added!';
        status.className = 'form-status success';
        toast(isEdit ? 'History entry updated' : 'History entry added', 'success');
        setTimeout(() => { status.textContent = ''; status.className = 'form-status'; }, 3500);
    } catch {
        status.textContent = '✗ Failed. Try again.';
        status.className = 'form-status error';
        toast('Save failed — try again', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = historyEditIndex !== null ? 'Save Changes' : 'Add Entry';
    }
}

// ─── Delete ───────────────────────────────────────────────
async function historyConfirmDelete(index) {
    const item = historyData[index];
    if (!item) return;

    // Re-use the existing delete modal
    const modal = document.getElementById('deleteModal');
    const desc = document.getElementById('deleteModalDesc');
    const confirmBtn = document.getElementById('deleteModalConfirm');
    const cancelBtn = document.getElementById('deleteModalCancel');
    if (!modal) {
        // Fallback: browser confirm
        if (!confirm(`Delete "${item.title}"?`)) return;
        await doHistoryDelete(index);
        return;
    }

    desc.textContent = `Are you sure you want to delete the "${item.year}" entry: "${item.title}"?`;
    modal.style.display = 'flex';

    function cleanup() {
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
    }
    async function onOk() {
        cleanup();
        await doHistoryDelete(index);
    }
    function onCancel() { cleanup(); }

    confirmBtn.addEventListener('click', onOk, { once: true });
    cancelBtn.addEventListener('click', onCancel, { once: true });
}

async function doHistoryDelete(index) {
    try {
        const res = await authFetch(`/api/history/items/${index}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        historyData.splice(index, 1);
        renderHistoryList();
        // If we were editing this entry, reset the form
        if (historyEditIndex === index) renderHistoryForm_reset();
        toast('History entry deleted', 'success');
    } catch {
        toast('Delete failed', 'error');
    }
}

// ─── Reorder (move up / down) ─────────────────────────────
async function historyMove(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= historyData.length) return;
    // Swap in local array
    [historyData[index], historyData[newIndex]] = [historyData[newIndex], historyData[index]];
    // Persist full reordered array
    try {
        const res = await authFetch('/api/history', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(historyData)
        });
        if (!res.ok) throw new Error();
        renderHistoryList();
        toast('Order updated', 'success');
    } catch {
        // Rollback
        [historyData[index], historyData[newIndex]] = [historyData[newIndex], historyData[index]];
        renderHistoryList();
        toast('Reorder failed', 'error');
    }
}

// ─── Wire up form + expose global handlers ────────────────
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('historyForm');
    if (form) form.addEventListener('submit', handleHistorySubmit);

    const cancelBtn = document.getElementById('historyCancelEditBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', renderHistoryForm_reset);
});

window.historyOpenEdit = historyOpenEdit;
window.historyConfirmDelete = historyConfirmDelete;
window.historyMove = historyMove;

// ═══════════════════════════════════════════════════════════
// GALLERY — Multi-Upload + Client-Side Resize
// ═══════════════════════════════════════════════════════════

/** In-memory list of File objects selected by the gallery drop zone */
let gallerySelectedFiles = [];

/**
 * Resize an image File using an off-screen Canvas.
 * @param {File} file    Original image file
 * @param {number} maxPx Max dimension (default 1920)
 * @param {number} quality JPEG quality 0-1 (default 0.85)
 * @returns {Promise<Blob>} Resized JPEG Blob
 */
function resizeImageFile(file, maxPx = 1920, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            // Scale down only if larger than maxPx
            if (width > maxPx || height > maxPx) {
                const ratio = Math.min(maxPx / width, maxPx / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob failed'));
            }, 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = url;
    });
}

/** Update file badge + thumbnail previews after selection changes */
function updateGalleryPreview() {
    const files = gallerySelectedFiles;
    const badge = document.getElementById('galleryFileBadge');
    const counter = document.getElementById('galleryFileCount');
    const sizeEl = document.getElementById('galleryFileSizeSum');
    const preview = document.getElementById('galleryImgPreview');

    if (!badge || !preview) return;

    if (!files.length) {
        badge.style.display = 'none';
        preview.innerHTML = '';
        return;
    }

    // Badge
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
    badge.style.display = 'flex';
    counter.textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected`;
    sizeEl.textContent = `${totalMB} MB total`;

    // Thumbnails with individual remove button
    preview.innerHTML = '';
    // Snapshot array so indices are captured at render time
    const snapshot = [...files];
    snapshot.forEach((file, i) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;aspect-ratio:1;overflow:hidden;border-radius:8px;background:rgba(255,255,255,0.05);';

        const imgEl = document.createElement('img');
        const objUrl = URL.createObjectURL(file);
        imgEl.src = objUrl;
        imgEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        imgEl.onload = () => URL.revokeObjectURL(objUrl);

        const rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.textContent = '✕';
        rmBtn.title = 'Remove';
        rmBtn.style.cssText = [
            'position:absolute;top:4px;right:4px;width:20px;height:20px;',
            'border-radius:50%;background:rgba(0,0,0,0.72);border:none;',
            'color:#fff;font-size:11px;cursor:pointer;line-height:1;padding:0;',
            'display:flex;align-items:center;justify-content:center;'
        ].join('');
        rmBtn.addEventListener('click', () => {
            gallerySelectedFiles.splice(gallerySelectedFiles.indexOf(snapshot[i]), 1);
            updateGalleryPreview();
        });

        wrap.appendChild(imgEl);
        wrap.appendChild(rmBtn);
        preview.appendChild(wrap);
    });
}

/** Reset gallery form + selection state */
function resetGalleryForm() {
    document.getElementById('galleryForm')?.reset();
    gallerySelectedFiles = [];
    updateGalleryPreview();
}

/** Wire up the gallery drop zone: drag-and-drop + click-to-browse */
function setupGalleryUploadZone() {
    const zone = document.getElementById('galleryDropZone');
    const input = document.getElementById('galleryImgInput');
    const browse = document.getElementById('galleryBrowseLink');
    const clearBtn = document.getElementById('galleryClearFiles');

    if (!zone || !input) return;

    // Click anywhere on zone → open file picker
    zone.addEventListener('click', e => {
        if (e.target !== browse) input.click();
    });
    if (browse) browse.addEventListener('click', e => { e.stopPropagation(); input.click(); });

    // File input change — merge new selections
    input.addEventListener('change', () => {
        Array.from(input.files)
            .filter(f => f.type.startsWith('image/'))
            .forEach(f => {
                if (!gallerySelectedFiles.some(g => g.name === f.name && g.size === f.size)) {
                    gallerySelectedFiles.push(f);
                }
            });
        input.value = ''; // reset so same file can be re-selected after remove
        updateGalleryPreview();
    });

    // Clear all button
    if (clearBtn) {
        clearBtn.addEventListener('click', e => {
            e.stopPropagation();
            gallerySelectedFiles = [];
            input.value = '';
            updateGalleryPreview();
        });
    }

    // Drag & Drop
    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('upload-zone--drag');
    });
    zone.addEventListener('dragleave', e => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('upload-zone--drag');
    });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('upload-zone--drag');
        Array.from(e.dataTransfer?.files || [])
            .filter(f => f.type.startsWith('image/'))
            .forEach(f => {
                if (!gallerySelectedFiles.some(g => g.name === f.name && g.size === f.size)) {
                    gallerySelectedFiles.push(f);
                }
            });
        updateGalleryPreview();
    });
}

// ─── Activity Log Drawer ───────────────────────────────────────

const ACTION_CFG = {
    CREATE: { color: '#2ecc71', dot: '#2ecc71', label: 'Added' },
    UPDATE: { color: '#f39c12', dot: '#f39c12', label: 'Updated' },
    DELETE: { color: '#e74c3c', dot: '#e74c3c', label: 'Deleted' },
    REORDER: { color: '#7ec8e3', dot: '#7ec8e3', label: 'Reordered' },
};
const TYPE_LABEL_EN = {
    diary: 'Field Diary',
    report: 'Activity Report',
    gallery: 'Photo Gallery',
    interview: 'Member Voice',
    history: 'History',
    'global-stats': 'Global Stats',
    stats: 'Project Stats',
    card: 'Project Card',
    project: 'Project',
};

function fmtDateTime(iso) {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDateOnly(iso) {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function openActivityLog() {
    const drawer = document.getElementById('activityLogDrawer');
    const overlay = document.getElementById('activityLogOverlay');
    drawer.style.display = 'flex';
    overlay.style.display = 'block';
    // Trigger animation on next frame
    requestAnimationFrame(() => {
        drawer.style.transform = 'translateX(0)';
    });
    loadActivityLog();
}

function closeActivityLog() {
    const drawer = document.getElementById('activityLogDrawer');
    const overlay = document.getElementById('activityLogOverlay');
    drawer.style.transform = 'translateX(-100%)';
    setTimeout(() => {
        drawer.style.display = 'none';
        overlay.style.display = 'none';
        // Reset detail view
        const detail = document.getElementById('activityLogDetail');
        if (detail) detail.style.display = 'none';
    }, 300);
}

function showActivityDetail(entry) {
    const detail = document.getElementById('activityLogDetail');
    const detailBody = document.getElementById('activityLogDetailBody');
    const cfg = ACTION_CFG[entry.action] || { color: '#aaa', label: entry.action };
    const type = TYPE_LABEL_EN[entry.type] || entry.type;
    const proj = entry.project === 'global' ? 'Global' : capFirst(entry.project);

    detailBody.innerHTML = `
        <div style="margin-bottom:20px">
            <span style="display:inline-block;background:${cfg.color}22;border:1px solid ${cfg.color}55;color:${cfg.color};border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${cfg.label}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <td style="padding:10px 0;color:rgba(255,255,255,0.4);width:110px">Date & Time</td>
                <td style="padding:10px 0;color:#fff">${fmtDateTime(entry.timestamp)}</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Project</td>
                <td style="padding:10px 0;color:#fff">${escHtml(proj)}</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Section</td>
                <td style="padding:10px 0;color:#fff">${escHtml(type)}</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Action</td>
                <td style="padding:10px 0;color:${cfg.color};font-weight:600">${cfg.label}</td>
            </tr>
            ${entry.title ? `<tr>
                <td style="padding:10px 0;color:rgba(255,255,255,0.4);vertical-align:top">Item</td>
                <td style="padding:10px 0;color:#fff;word-break:break-word">${escHtml(entry.title)}</td>
            </tr>` : ''}
        </table>
    `;
    detail.style.display = 'flex';
}

async function loadActivityLog() {
    const container = document.getElementById('activityLogList');
    if (!container) return;

    container.innerHTML = '<div style="padding:24px;text-align:center;color:rgba(255,255,255,0.3)">Loading…</div>';

    try {
        const res = await authFetch('/api/activity-log');
        if (!res.ok) throw new Error();
        const log = await res.json();

        // Update badge count
        const badge = document.getElementById('activityLogBadge');
        if (badge) {
            if (log.length > 0) {
                badge.textContent = log.length > 99 ? '99+' : log.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (!log.length) {
            container.innerHTML = `<div style="padding:40px 20px;text-align:center;color:rgba(255,255,255,0.3)">
                <div style="font-size:40px;margin-bottom:12px">📋</div>
                <p style="font-size:13px">No activity recorded yet.</p>
            </div>`;
            return;
        }

        // Group entries by date
        const grouped = {};
        log.forEach(e => {
            const d = fmtDateOnly(e.timestamp);
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push(e);
        });

        let html = '';
        Object.entries(grouped).forEach(([date, entries]) => {
            html += `<div style="padding:6px 16px 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.08em">${date}</div>`;
            entries.forEach((e, i) => {
                const cfg = ACTION_CFG[e.action] || { color: '#aaa', label: e.action };
                const type = TYPE_LABEL_EN[e.type] || e.type;
                const proj = e.project === 'global' ? 'Global' : capFirst(e.project);
                const time = new Date(e.timestamp);
                const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
                const dataIdx = log.indexOf(e);

                html += `
                <div class="al-row" data-idx="${dataIdx}"
                    style="display:flex;align-items:center;gap:10px;padding:9px 16px;transition:background .15s;border-radius:0;${e.undone ? 'opacity:.45' : ''}"
                    onmouseover="this.style.background='rgba(255,255,255,0.04)'"
                    onmouseout="this.style.background='transparent'">
                    <div style="width:8px;height:8px;border-radius:50%;background:${cfg.color};flex-shrink:0;margin-top:1px"></div>
                    <div style="flex:1;min-width:0;cursor:pointer" onclick="_alShowDetail(${dataIdx})">
                        <div style="font-size:12px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                            <span style="color:${cfg.color};font-weight:700">${e.undone ? '<s>' + cfg.label + '</s>' : cfg.label}</span>
                            <span style="color:rgba(255,255,255,0.5);margin:0 4px">·</span>
                            <span style="color:rgba(255,255,255,0.8)">${escHtml(proj)} — ${escHtml(type)}</span>
                            ${e.undone ? '<span style="color:rgba(255,255,255,0.3);font-size:10px;margin-left:4px">Undone</span>' : ''}
                        </div>
                        ${e.title ? `<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(e.title)}</div>` : ''}
                    </div>
                    <div style="flex-shrink:0;font-size:11px;color:rgba(255,255,255,0.3)">${timeStr}</div>
                    ${(!e.undone && e.snapshot && e.action !== 'UNDO' && e.action !== 'REORDER') ? `
                    <button onclick="event.stopPropagation();_alUndoEntry('${e.id}',this)"
                        title="Undo this action"
                        style="flex-shrink:0;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.55);border-radius:5px;padding:3px 9px;font-size:11px;cursor:pointer;transition:all .2s;white-space:nowrap"
                        onmouseover="this.style.background='rgba(231,76,60,0.25)';this.style.borderColor='rgba(231,76,60,0.5)';this.style.color='#ff7f7f'"
                        onmouseout="this.style.background='rgba(255,255,255,0.06)';this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.55)'">Undo</button>` : `<div style="width:42px;flex-shrink:0"></div>`}
                </div>`;
            });
        });

        if (log.length >= 50) {
            html += `<div style="padding:12px 16px;text-align:center;font-size:11px;color:rgba(255,255,255,0.25)">Showing ${log.length} of up to 200 entries</div>`;
        }

        container.innerHTML = html;

        // Store log for detail lookup
        container._logData = log;

    } catch {
        container.innerHTML = '<div style="padding:24px;text-align:center;color:#e74c3c;font-size:13px">⚠ Failed to load activity log.</div>';
    }
}

// Called from inline onclick — must be global
function _alShowDetail(idx) {
    const container = document.getElementById('activityLogList');
    const log = container?._logData;
    if (!log || !log[idx]) return;
    showActivityDetail(log[idx]);
}

async function _alUndoEntry(logId, btn) {
    if (!logId) return;
    const original = btn.textContent;
    btn.textContent = '…';
    btn.disabled = true;

    try {
        const res = await authFetch(`/api/activity-log/${logId}/undo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) {
            btn.textContent = original;
            btn.disabled = false;
            btn.title = data.error || 'Undo failed';
            btn.style.color = '#e74c3c';
            btn.style.borderColor = 'rgba(231,76,60,0.5)';
            setTimeout(() => {
                btn.textContent = original;
                btn.style.color = '';
                btn.style.borderColor = '';
            }, 2500);
            return;
        }
        // Success — reload the list
        await loadActivityLog();
    } catch {
        btn.textContent = original;
        btn.disabled = false;
    }
}
