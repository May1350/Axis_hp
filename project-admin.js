/* ═══════════════════════════════════════════════════════════
   AXIS — Inline Admin Overlay Logic for project.html
   Handles: tab + button trigger, password modal, full-screen drawer,
            CRUD for diary / reports / gallery / interviews
   ═══════════════════════════════════════════════════════════ */

'use strict';

(function () {
    /* ── State ────────────────────────────────────────────── */
    const TOKEN_KEY = 'axis_admin_token';
    let projectId = null;
    let projectLabel = '';
    let projectData = {};
    let aQaCount = 0;
    let aPendingDelete = null;
    let aDrawerKeepImages = [];  // existing images to keep when editing a diary entry

    /* ── Token helpers ────────────────────────────────────── */
    const getToken = () => localStorage.getItem(TOKEN_KEY);
    const setToken = t => localStorage.setItem(TOKEN_KEY, t);

    /* ── Init ─────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        projectId = params.get('id') || 'mongolia';
        projectLabel = projectId.charAt(0).toUpperCase() + projectId.slice(1);

        document.getElementById('adminDrawerProject').textContent = projectLabel;

        // FAB (now a tab-style button)
        document.getElementById('adminFab').addEventListener('click', onFabClick);

        // Password modal
        document.getElementById('adminPwForm').addEventListener('submit', handleLogin);
        document.getElementById('adminPwCancel').addEventListener('click', closeModal);

        // Drawer close
        document.getElementById('adminDrawerClose').addEventListener('click', closeDrawer);

        // Drawer tabs
        document.querySelectorAll('.admin-drawer-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.admin-drawer-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.admin-drawer-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`atab-${btn.dataset.atab}`).classList.add('active');
            });
        });

        // Forms
        document.getElementById('aForm-diary').addEventListener('submit', e => handleForm(e, 'diary'));
        document.getElementById('aForm-reports').addEventListener('submit', e => handleForm(e, 'reports'));
        document.getElementById('aForm-gallery').addEventListener('submit', e => handleForm(e, 'gallery'));
        document.getElementById('aForm-interviews').addEventListener('submit', e => handleForm(e, 'interviews'));
        document.getElementById('aForm-stats').addEventListener('submit', handleStatsForm);

        // Dynamic Q&A (interviews only — sections removed from reports)
        document.getElementById('aAddQaBtn').addEventListener('click', addQaPair);
        addQaPair();

        // Image previews
        setupImgPreview('aDiaryImgInput', 'aDiaryImgPreviews', true);
        setupImgPreview('aGalleryImgInput', 'aGalleryImgPreview', false);
        setupImgPreview('aInterviewPhotoInput', 'aInterviewPhotoPreview', false);

        // PDF preview
        const pdfInput = document.getElementById('aReportPdfInput');
        if (pdfInput) {
            pdfInput.addEventListener('change', () => {
                const preview = document.getElementById('aReportPdfPreview');
                if (!preview) return;
                const f = pdfInput.files[0];
                preview.innerHTML = f ? `PDF <strong>${escH(f.name)}</strong> (${(f.size / 1024).toFixed(0)} KB)` : '';
            });
        }

        // Rich Text Editor init
        initRte();

        // Confirm dialog
        document.getElementById('aConfirmCancel').addEventListener('click', closeAConfirm);
        document.getElementById('aConfirmOk').addEventListener('click', () => {
            if (aPendingDelete) doDelete(aPendingDelete.type, aPendingDelete.index);
            closeAConfirm();
        });

        // Escape key
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (!document.getElementById('adminDrawer').classList.contains('hidden')) closeDrawer();
                else if (!document.getElementById('adminPwModal').classList.contains('hidden')) closeModal();
            }
        });
    });

    /* ── Rich Text Editor ───────────────────────────────────── */
    function initRte() {
        const rte = document.getElementById('aDiaryRte');
        if (!rte) return;

        // Toolbar button actions
        document.querySelectorAll('.rte-btn').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault(); // don't lose selection focus
                const cmd = btn.dataset.cmd;
                const val = btn.dataset.val || null;
                document.execCommand(cmd, false, val);
                updateRteToolbarState();
                rte.focus();
            });
        });

        // Update toolbar active states on selection change
        rte.addEventListener('keyup', updateRteToolbarState);
        rte.addEventListener('mouseup', updateRteToolbarState);
    }

    function updateRteToolbarState() {
        document.querySelectorAll('.rte-btn').forEach(btn => {
            const cmd = btn.dataset.cmd;
            if (cmd === 'fontSize') return; // skip font-size active tracking
            try {
                btn.classList.toggle('active', document.queryCommandState(cmd));
            } catch { }
        });
    }

    function getRteHtml() {
        const rte = document.getElementById('aDiaryRte');
        return rte ? rte.innerHTML.trim() : '';
    }

    function clearRte() {
        const rte = document.getElementById('aDiaryRte');
        if (rte) rte.innerHTML = '';
    }

    /* ── FAB / Modal / Drawer ───────────────────────────────── */
    function onFabClick() {
        if (getToken()) openDrawer();
        else openModal();
    }

    function openModal() {
        document.getElementById('adminPwModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('adminPwInput').focus(), 60);
    }

    function closeModal() {
        document.getElementById('adminPwModal').classList.add('hidden');
        document.getElementById('adminPwInput').value = '';
        document.getElementById('adminPwError').textContent = '';
    }

    async function handleLogin(e) {
        e.preventDefault();
        const btn = document.getElementById('adminPwSubmit');
        const err = document.getElementById('adminPwError');
        const pw = document.getElementById('adminPwInput').value;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
        err.textContent = '';

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw })
            });
            if (!res.ok) throw new Error();
            const { token } = await res.json();
            setToken(token);
            closeModal();
            openDrawer();
        } catch {
            err.textContent = 'Incorrect password';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    }

    function openDrawer() {
        document.getElementById('adminDrawer').classList.remove('hidden');
        document.body.classList.add('admin-drawer-open');
        loadProjectData();
    }

    function closeDrawer() {
        document.getElementById('adminDrawer').classList.add('hidden');
        document.body.classList.remove('admin-drawer-open');
        // Reload main page content so new entries appear
        if (typeof window.loadProjectData === 'function') window.loadProjectData();
    }

    /* ── Data ───────────────────────────────────────────────── */
    async function loadProjectData() {
        try {
            const res = await authFetch(`/api/projects/${projectId}`);
            if (res.status === 401) {
                localStorage.removeItem(TOKEN_KEY);
                closeDrawer();
                openModal();
                return;
            }
            if (!res.ok) throw new Error();
            projectData = await res.json();
            renderAllLists();
        } catch {
            aToast('Failed to load data', 'error');
        }
    }

    function renderAllLists() {
        renderList('diary', projectData.diary || []);
        renderList('reports', projectData.reports || []);
        renderList('gallery', projectData.gallery || []);
        renderList('interviews', projectData.interviews || []);
        populateStatsForm(projectData.stats || {});
        buildDrawerAutocomplete();
    }

    /* ── Autocomplete datalists ─────────────────────────────── */
    function buildDrawerAutocomplete() {
        function unique(arr, field) {
            return [...new Set(
                (arr || []).map(item => (item[field] || '').trim()).filter(Boolean)
            )];
        }
        function fill(id, values) {
            const dl = document.getElementById(id);
            if (!dl) return;
            dl.innerHTML = values.map(v =>
                `<option value="${v.replace(/"/g, '&quot;')}"></option>`
            ).join('');
        }

        const diary    = projectData.diary    || [];
        const gallery  = projectData.gallery  || [];
        const reports  = projectData.reports  || [];

        // location: merge diary + gallery
        const locations = [...new Set([
            ...unique(diary, 'location'),
            ...unique(gallery, 'location')
        ])];
        fill('pac-location',   locations);
        fill('pac-diary-title', unique(diary, 'title'));
        fill('pac-period',     unique(reports, 'period'));
        fill('pac-trip',       unique(gallery, 'trip'));
        fill('pac-caption',    unique(gallery, 'caption'));
    }

    /* ── Stats Form ─────────────────────────────────────────── */
    function populateStatsForm(stats) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        set('aStat-since', stats.since);
        set('aStat-totalTrips', stats.totalTrips);
        set('aStat-treesPlanted', stats.treesPlanted);
        set('aStat-labelTrips', stats.label_trips);
        set('aStat-labelMetric', stats.label_metric);
    }

    async function handleStatsForm(e) {
        e.preventDefault();
        const btn = document.getElementById('aStatsSubmitBtn');
        const status = document.getElementById('aStatsStatus');
        const form = e.target;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
        status.textContent = '';

        const body = {};
        new FormData(form).forEach((v, k) => { body[k] = v.trim(); });

        try {
            const res = await authFetch(`/api/projects/${projectId}/stats`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.status === 401) {
                localStorage.removeItem(TOKEN_KEY);
                aToast('Session expired — please log in again', 'error');
                closeDrawer(); openModal(); return;
            }
            if (!res.ok) throw new Error();

            const { stats } = await res.json();
            projectData.stats = stats;

            // Live-update the stats bar on the main page
            if (typeof window.renderStats === 'function') window.renderStats(projectData);

            status.textContent = '✓ Saved!';
            status.className = 'form-status success';
            aToast('Stats updated', 'success');
            setTimeout(() => { status.textContent = ''; status.className = 'form-status'; }, 3500);
        } catch {
            status.textContent = '✗ Failed';
            status.className = 'form-status error';
            aToast('Save failed — try again', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Stats';
        }
    }

    function authFetch(url, opts = {}) {
        return fetch(url, {
            ...opts,
            headers: { ...(opts.headers || {}), 'Authorization': `Bearer ${getToken()}` }
        });
    }

    /* ── Image preview ──────────────────────────────────────── */
    function setupImgPreview(inputId, previewId, multiple) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        if (!input || !preview) return;

        function renderPreviews(files) {
            preview.innerHTML = '';
            const list = multiple ? Array.from(files) : (files[0] ? [files[0]] : []);
            list.forEach(f => {
                const div = document.createElement('div');
                div.className = 'img-preview';
                if (!multiple) { div.style.width = '80px'; div.style.height = '80px'; }
                const img = document.createElement('img');
                img.src = URL.createObjectURL(f);
                div.appendChild(img);
                preview.appendChild(div);
            });
        }

        input.addEventListener('change', () => renderPreviews(input.files));

        // Drag & Drop
        const zone = input.closest('.upload-zone');
        if (!zone) return;
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('upload-zone--drag'); });
        zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('upload-zone--drag'); });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('upload-zone--drag');
            const dropped = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
            const toAdd = multiple ? dropped : [dropped[0]].filter(Boolean);
            if (!toAdd.length) return;
            const transfer = new DataTransfer();
            toAdd.forEach(f => transfer.items.add(f));
            input.files = transfer.files;
            renderPreviews(input.files);
        });
    }


    /* ── Dynamic Q&A (interviews) ───────────────────────────── */
    function addQaPair(q = '', a = '') {
        aQaCount++;
        const id = `aqa-${aQaCount}`;
        const div = document.createElement('div');
        div.className = 'dynamic-item';
        div.id = id;
        div.innerHTML = `
            <button type="button" class="dynamic-item-remove" onclick="document.getElementById('${id}').remove()">✕</button>
            <div class="form-grid">
                <div class="field form-col-full"><label>Question</label><input type="text" name="qa_q" value="${escH(q)}" placeholder="e.g. Why did you join Axis?"></div>
                <div class="field form-col-full"><label>Answer</label><textarea name="qa_a" rows="3" placeholder="Answer...">${escH(a)}</textarea></div>
            </div>`;
        document.getElementById('aQandaItems').appendChild(div);
    }

    /* ── Form submission ────────────────────────────────────── */
    async function handleForm(e, type) {
        e.preventDefault();
        const form = e.target;
        const statusId = { diary: 'aDiaryStatus', reports: 'aReportStatus', gallery: 'aGalleryStatus', interviews: 'aInterviewStatus' };
        const status = document.getElementById(statusId[type]);
        const btn = form.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        const editIndex = form.dataset.editIndex !== undefined && form.dataset.editIndex !== '' ? parseInt(form.dataset.editIndex, 10) : null;
        const isEdit = editIndex !== null && !isNaN(editIndex);

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';

        try {
            const fd = new FormData(form);

            // Diary: inject RTE HTML into hidden 'body' field
            if (type === 'diary') {
                fd.set('body', getRteHtml());
                // In edit mode, send which existing images to keep
                if (isEdit) {
                    fd.set('keepImages', JSON.stringify(aDrawerKeepImages));
                }
            }

            // Interviews: collect Q&A
            if (type === 'interviews') {
                const qanda = Array.from(document.querySelectorAll('#aQandaItems .dynamic-item')).map(item => ({
                    q: item.querySelector('[name=qa_q]')?.value || '',
                    a: item.querySelector('[name=qa_a]')?.value || ''
                })).filter(p => p.q || p.a);
                fd.set('qanda', JSON.stringify(qanda));
            }

            let url, method;
            if (isEdit) {
                // PATCH to update existing item
                const patchType = type === 'interviews' ? 'interviews' : type === 'reports' ? 'reports' : type;
                url = `/api/projects/${projectId}/${patchType}/${editIndex}`;
                method = 'PATCH';
            } else {
                const apiType = type === 'interviews' ? 'interview' : type === 'reports' ? 'report' : type;
                url = `/api/projects/${projectId}/${apiType}`;
                method = 'POST';
            }

            const res = await authFetch(url, { method, body: fd });

            if (res.status === 401) {
                localStorage.removeItem(TOKEN_KEY);
                aToast('Session expired — please log in again', 'error');
                closeDrawer();
                openModal();
                return;
            }
            if (!res.ok) throw new Error();

            const item = await res.json();
            if (!projectData[type]) projectData[type] = [];

            if (isEdit) {
                projectData[type][editIndex] = item;
            } else {
                projectData[type].unshift(item);
                // interviews adds at end per API
                if (type === 'interviews') {
                    projectData[type].shift();
                    projectData[type].push(item);
                }
            }

            renderList(type, projectData[type]);
            form.reset();
            delete form.dataset.editIndex;

            // Clear previews and RTE
            ['aDiaryImgPreviews', 'aGalleryImgPreview', 'aInterviewPhotoPreview', 'aReportPdfPreview'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });
            if (type === 'diary') {
                clearRte();
                // Reset existing-image section
                aDrawerKeepImages = [];
                const sec = document.getElementById('aDiaryExistingImgSection');
                if (sec) sec.style.display = 'none';
                const submitBtn = form.querySelector('[type=submit]');
                if (submitBtn) submitBtn.textContent = 'Add Entry';
            }
            if (type === 'interviews') {
                document.getElementById('aQandaItems').innerHTML = '';
                addQaPair();
            }

            if (status) { status.textContent = isEdit ? '✓ Updated!' : '✓ Saved!'; status.className = 'form-status success'; }
            aToast(isEdit ? 'Entry updated' : 'Entry added successfully', 'success');
            setTimeout(() => { if (status) { status.textContent = ''; status.className = 'form-status'; } }, 3500);
        } catch {
            if (status) { status.textContent = '✗ Failed'; status.className = 'form-status error'; }
            aToast('Save failed — try again', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = isEdit ? 'Add ' + type.charAt(0).toUpperCase() + type.slice(1, -1) : origText;
        }
    }

    /* ── Render lists ───────────────────────────────────────── */
    function renderList(type, items) {
        const container = document.getElementById(`aList-${type}`);
        if (!container) return;
        if (!items.length) {
            const icons = { diary: '', reports: '', gallery: '', interviews: '' };
            container.innerHTML = `<div class="empty-entries"><div class="empty-icon">${icons[type]}</div><p>No entries yet</p></div>`;
            return;
        }
        container.innerHTML = items.map((item, i) => buildCard(type, item, i)).join('');
    }

    function buildCard(type, item, i) {
        let title = '', meta = '', thumb = '';
        if (type === 'diary') {
            title = escH(item.title || '(No title)');
            meta = `<span>${escH(item.date || '')}</span><span>${escH(item.location || '')}</span>`;
            if (item.images?.[0]) thumb = `<img class="entry-card-thumb" src="${escH(item.images[0])}" alt="">`;
        } else if (type === 'reports') {
            title = escH(item.title || '(No title)');
            const pdfLabel = item.pdf ? ' PDF' : '';
            meta = `<span>${escH(item.period || item.date || '')}</span><span>${pdfLabel}</span>`;
        } else if (type === 'gallery') {
            title = escH(item.caption || '(No caption)');
            meta = `<span>${escH(item.date || '')}</span><span>${escH(item.location || '')}</span>`;
            if (item.image) thumb = `<img class="entry-card-thumb" src="${escH(item.image)}" alt="">`;
        } else if (type === 'interviews') {
            title = escH(item.name || '(No name)');
            meta = `<span>${escH(item.year || '')}</span>`;
            if (item.photo) thumb = `<img class="entry-card-thumb" src="${escH(item.photo)}" alt="" style="border-radius:50%">`;
        }
        return `
            <div class="entry-card">
                ${thumb}
                <div class="entry-card-info">
                    <div class="entry-card-title">${title}</div>
                    <div class="entry-card-meta">${meta}</div>
                </div>
                <div class="entry-card-actions" style="display:flex;gap:4px;flex-shrink:0;align-items:center;">
                    <button class="entry-edit-btn" style="background:transparent;color:#64748b;font-size:15px;padding:4px 6px;border-radius:4px;border:none;cursor:pointer;" onclick="window._adminEditEntry('${type}', ${i})" title="Edit">✏️</button>
                    <button class="entry-delete-btn" onclick="window._adminDeleteEntry('${type}', ${i})" title="Delete">🗑</button>
                </div>
            </div>`;
    }

    /* ── Delete ─────────────────────────────────────────────── */
    window._adminDeleteEntry = function (type, index) {
        aPendingDelete = { type, index };
        document.getElementById('aConfirmOverlay').classList.remove('hidden');
    };

    /* ── Edit ───────────────────────────────────────────────── */
    window._adminEditEntry = function (type, index) {
        const item = (projectData[type] || [])[index];
        if (!item) return;

        // Switch to the correct drawer tab
        const tabName = type === 'reports' ? 'reports' : type === 'interviews' ? 'interviews' : type;
        document.querySelectorAll('.admin-drawer-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-drawer-panel').forEach(p => p.classList.remove('active'));
        const tabEl = document.querySelector(`.admin-drawer-tab[data-atab="${tabName}"]`);
        if (tabEl) tabEl.classList.add('active');
        const panel = document.getElementById(`atab-${tabName}`);
        if (panel) panel.classList.add('active');

        // Store edit context on the form
        const formMap = { diary: 'aForm-diary', reports: 'aForm-reports', gallery: 'aForm-gallery', interviews: 'aForm-interviews' };
        const form = document.getElementById(formMap[type]);
        if (!form) return;
        form.dataset.editIndex = index;

        if (type === 'diary') {
            form.querySelector('[name=date]').value = item.date || '';
            form.querySelector('[name=location]').value = item.location || '';
            form.querySelector('[name=title]').value = item.title || '';
            const rte = document.getElementById('aDiaryRte');
            if (rte) rte.innerHTML = item.body || '';
            // ── Show existing images with delete buttons ─────────────
            aDrawerKeepImages = [...(item.images || [])];
            renderADiaryEditPreviews();
            form.querySelector('[type=submit]').textContent = 'Update Entry';
        } else if (type === 'reports') {
            form.querySelector('[name=title]').value = item.title || '';
            form.querySelector('[name=period]').value = item.period || '';
            form.querySelector('[name=date]').value = item.date || '';
            form.querySelector('[name=members]').value = item.members || '';
            form.querySelector('[type=submit]').textContent = 'Update Report';
        } else if (type === 'gallery') {
            form.querySelector('[name=date]').value = item.date || '';
            form.querySelector('[name=location]').value = item.location || '';
            form.querySelector('[name=trip]').value = item.trip || '';
            form.querySelector('[name=caption]').value = item.caption || '';
            form.querySelector('[type=submit]').textContent = 'Update Photo';
        } else if (type === 'interviews') {
            form.querySelector('[name=name]').value = item.name || '';
            form.querySelector('[name=year]').value = item.year || '';
            form.querySelector('[name=trips]').value = (item.trips || []).join(', ');
            // Rebuild Q&A
            const qaContainer = document.getElementById('aQandaItems');
            qaContainer.innerHTML = '';
            aQaCount = 0;
            (item.qanda || []).forEach(qa => addQaPair(qa.q, qa.a));
            form.querySelector('[type=submit]').textContent = 'Update Interview';
        }

        form.closest('.add-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    function closeAConfirm() {
        aPendingDelete = null;
        document.getElementById('aConfirmOverlay').classList.add('hidden');
    }

    async function doDelete(type, index) {
        try {
            const res = await authFetch(`/api/projects/${projectId}/${type}/${index}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            projectData[type].splice(index, 1);
            renderList(type, projectData[type] || []);
            aToast('Entry deleted', 'success');
        } catch {
            aToast('Delete failed', 'error');
        }
    }

    /* ── Render existing diary images (drawer edit mode) ────── */
    function renderADiaryEditPreviews() {
        const section = document.getElementById('aDiaryExistingImgSection');
        const container = document.getElementById('aDiaryExistingImgPreviews');
        if (!section || !container) return;

        if (!aDrawerKeepImages.length) {
            section.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        section.style.display = 'block';
        container.innerHTML = '';
        aDrawerKeepImages.forEach((src, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'img-preview';
            wrap.style.position = 'relative';

            const img = document.createElement('img');
            img.src = src;
            img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:8px;display:block;';

            const rmBtn = document.createElement('button');
            rmBtn.type = 'button';
            rmBtn.textContent = '✕';
            rmBtn.title = 'Remove this photo';
            rmBtn.style.cssText = [
                'position:absolute;top:2px;right:2px;width:20px;height:20px;',
                'border-radius:50%;background:rgba(0,0,0,0.75);border:none;',
                'color:#fff;font-size:11px;cursor:pointer;display:flex;',
                'align-items:center;justify-content:center;line-height:1;padding:0;'
            ].join('');
            rmBtn.addEventListener('click', () => {
                aDrawerKeepImages.splice(i, 1);
                renderADiaryEditPreviews();
            });

            wrap.appendChild(img);
            wrap.appendChild(rmBtn);
            container.appendChild(wrap);
        });
    }

    /* ── Toast ──────────────────────────────────────────────── */
    function aToast(msg, type = 'success') {
        const container = document.getElementById('aToastContainer');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = (type === 'success' ? '✓ ' : '✗ ') + msg;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    /* ── Helpers ────────────────────────────────────────────── */
    function escH(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

})();
