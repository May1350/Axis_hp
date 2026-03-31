/* ═══════════════════════════════════════════════════════════
   AXIS — Project Detail Page Logic
   Loads JSON data, renders all 4 tab sections.
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─── URL PARAMS ──────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const projectId = params.get('id') || 'mongolia';

// ─── NAVBAR SCROLL ───────────────────────────────────────────
window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    nav.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });
document.getElementById('navbar').classList.add('scrolled'); // always frosted on detail page

// ─── FETCH JSON ──────────────────────────────────────────────
fetch(`/api/projects/${projectId}`)
    .then(r => {
        if (!r.ok) throw new Error(`Project "${projectId}" not found`);
        return r.json();
    })
    .then(data => {
        renderHero(data);
        renderStats(data);
        renderDiary(data.diary || []);
        renderReports(data.reports || []);
        renderGallery(data.gallery || []);
        renderInterviews(data.interviews || []);
        document.title = `Axis — ${data.name} Project`;
    })
    .catch(err => {
        document.getElementById('heroName').textContent = 'Project not found';
        console.error(err);
    });

// ─── RENDER: HERO ────────────────────────────────────────────
function renderHero(data) {
    document.getElementById('heroTag').textContent = data.tag || data.name;
    document.getElementById('heroSince').textContent = `Since ${data.since}`;
    document.getElementById('heroName').textContent = data.name;
    document.getElementById('heroSlogan').textContent = data.slogan;

    // Instagram link
    if (data.instagram) {
        const handle = data.instagram.match(/instagram\.com\/([^?]+)/)?.[1] || 'Instagram';
        const igEl = document.createElement('a');
        igEl.href = data.instagram;
        igEl.target = '_blank';
        igEl.rel = 'noopener';
        igEl.className = 'insta-link insta-link--dark';
        igEl.style.marginTop = '16px';
        igEl.style.display = 'inline-flex';
        igEl.textContent = `@${handle}`;
        document.getElementById('heroSlogan').insertAdjacentElement('afterend', igEl);
    }

    const seal = document.getElementById('heroSeal');
    if (data.seal_image) {
        seal.src = data.seal_image;
        seal.alt = `${data.name} Seal`;
    } else {
        seal.style.display = 'none';
    }

    const bgPlaceholder = document.getElementById('heroBgPlaceholder');
    if (data.hero_image) {
        const img = document.createElement('img');
        img.src = data.hero_image;
        img.alt = `${data.name} hero`;
        bgPlaceholder.parentNode.replaceChild(img, bgPlaceholder);
    }
}

// ─── RENDER: STATS BAR ───────────────────────────────────────
function renderStats(data) {
    const s = data.stats || {};
    document.getElementById('statSince').textContent = s.since || data.since;
    document.getElementById('statTrips').textContent = s.totalTrips ?? '—';
    document.getElementById('statTripsLabel').textContent = s.label_trips || 'Total Trips';
    document.getElementById('statMetric').textContent = s.treesPlanted ?? '—';
    document.getElementById('statMetricLabel').textContent = s.label_metric || 'Key Metric';
}
window.renderStats = renderStats;

// ─── RENDER: DIARY (thumbnail card grid) ─────────────────────
let allDiary = [];

function renderDiary(entries) {
    allDiary = entries;
    const list = document.getElementById('diaryList');
    if (!entries.length) {
        list.innerHTML = emptyState('', 'No diary entries yet', 'Check back after the next field trip.');
        return;
    }
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    list.innerHTML = `<div class="diary-thumb-grid">${entries.map((e, i) => {
        const dateStr = formatDate(e.date);
        const thumb = (e.images && e.images[0])
            ? `<img src="${escHtml(e.images[0])}" alt="${escHtml(e.title || '')}" loading="lazy">`
            : `<span class="diary-thumb-fallback">&#9633;</span>`;
        return `
            <div class="diary-thumb-card" onclick="openDetailModal('diary',${i})" role="button" tabindex="0">
                <div class="diary-thumb-img">${thumb}</div>
                <div class="diary-thumb-info">
                    <span class="diary-thumb-date">${dateStr}</span>
                    <h3 class="diary-thumb-title">${escHtml(e.title || '(No Title)')}</h3>
                    ${e.location ? `<span class="diary-thumb-loc">${escHtml(e.location)}</span>` : ''}
                </div>
                <div class="diary-thumb-footer">Read entry →</div>
            </div>`;
    }).join('')
        }</div>`;
}

// ─── RENDER: REPORTS (thumbnail card list) ────────────────────
let allReports = [];

function renderReports(reports) {
    allReports = reports;
    const list = document.getElementById('reportList');
    if (!reports.length) {
        list.innerHTML = emptyState('', 'No reports yet', 'Activity reports will appear after each field trip.');
        return;
    }
    reports.sort((a, b) => new Date(b.date) - new Date(a.date));

    list.innerHTML = `<div class="report-thumb-list">${reports.map((r, i) => `
        <div class="report-thumb-card" onclick="openDetailModal('report',${i})" role="button" tabindex="0">
            <div class="report-thumb-icon">&#9633;</div>
            <div class="report-thumb-body">
                <div class="report-thumb-period">${escHtml(r.period || r.date || '')}</div>
                <div class="report-thumb-title">${escHtml(r.title)}</div>
                <div class="report-thumb-meta">
                    ${r.members ? `<span>${r.members} members</span>` : ''}
                    ${r.pdf ? `<span>PDF available</span>` : ''}
                </div>
            </div>
            <div class="report-thumb-arrow">→</div>
        </div>`).join('')
        }</div>`;
}

// ─── RENDER: GALLERY ─────────────────────────────────────────
let allGallery = [];

function renderGallery(items) {
    allGallery = items.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderGalleryGrid();
}


function renderGalleryGrid() {
    const grid = document.getElementById('galleryGrid');
    const items = allGallery;

    if (!items.length) {
        grid.innerHTML = '<div class="gallery-empty"><p>No photos in this category yet.</p></div>';
        return;
    }

    grid.innerHTML = items.map(g => {
        const dateStr = formatDate(g.date);
        const hasImage = g.image && g.image.trim() !== '';
        const content = hasImage
            ? `<img src="${escHtml(g.image)}" alt="${escHtml(g.caption || '')}" loading="lazy">`
            : `<div class="gallery-placeholder" style="cursor:default">&#9633;<small>${escHtml(g.location || '')}</small></div>`;

        return `
        <div class="gallery-item${hasImage ? '' : ' gallery-item--no-image'}" data-img="${escHtml(g.image || '')}" data-caption="${escHtml(g.caption || '')}">
            ${content}
            <div class="gallery-item-overlay">
                <span class="gallery-item-caption">${escHtml(g.caption || '')}</span>
                <span class="gallery-item-meta">${dateStr} · ${escHtml(g.location || '')}</span>
            </div>
        </div>`;
    }).join('');

    // lightbox — only for items that actually have an image
    grid.querySelectorAll('.gallery-item[data-img]:not(.gallery-item--no-image)').forEach(item => {
        item.addEventListener('click', () => openLightbox(item.dataset.img, item.dataset.caption));
    });
}

// ─── RENDER: INTERVIEWS ──────────────────────────────────────
function renderInterviews(interviews) {
    const grid = document.getElementById('interviewGrid');
    if (!interviews.length) {
        grid.innerHTML = emptyState('', 'No interviews yet', 'Member stories will be added soon.');
        return;
    }

    grid.innerHTML = interviews.map((iv, i) => {
        const tripsHtml = (iv.trips || []).map(t => `<span class="trip-badge">${escHtml(t)}</span>`).join('');
        const qaHtml = (iv.qanda || []).map(qa => `
            <div>
                <p class="interview-q">${escHtml(qa.q)}</p>
                <p class="interview-a">${escHtml(qa.a)}</p>
            </div>`).join('');

        const photoEl = iv.photo
            ? `<img src="${escHtml(iv.photo)}" alt="${escHtml(iv.name)}" class="interview-photo">`
            : `<div class="interview-photo">&#9633;</div>`;

        return `
        <div class="interview-card" id="interview-${i}">
            <div class="interview-card-header" onclick="toggleInterview(${i})">
                ${photoEl}
                <div class="interview-info">
                    <div class="interview-name">${escHtml(iv.name)}</div>
                    <div class="interview-year">${escHtml(iv.year || '')}</div>
                    <div class="interview-trips">${tripsHtml}</div>
                </div>
            </div>
            <div class="interview-body">
                <div class="interview-qa">${qaHtml}</div>
            </div>
        </div>`;
    }).join('');
}

function toggleInterview(i) {
    const card = document.getElementById(`interview-${i}`);
    card.classList.toggle('open');
}
window.toggleInterview = toggleInterview;

// ─── TAB SWITCHING ───────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        if (!target) return;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${target}`).classList.add('active');
        if (target === 'milestones') loadMilestones();
    });
});

// ─── LIGHTBOX ────────────────────────────────────────────────
function openLightbox(src, caption) {
    if (!src) return;
    const lb = document.getElementById('lightbox');
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightboxCaption').textContent = caption || '';
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
}

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLightbox();
});

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    if (!document.getElementById('detailModal').classList.contains('open')) {
        document.body.style.overflow = '';
    }
}

// ─── DETAIL MODAL ─────────────────────────────────────────────
function openDetailModal(type, idx) {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailModalContent');

    if (type === 'diary') {
        const e = allDiary[idx];
        if (!e) return;
        const dateStr = formatDate(e.date);
        const imagesHtml = (e.images || []).filter(Boolean).map(src =>
            `<img src="${escHtml(src)}" alt="field photo" loading="lazy"
                  onclick="openLightbox('${escHtml(src)}','')" style="cursor:pointer">`
        ).join('');
        content.innerHTML = `
            <div class="detail-modal-body">
                <div class="detail-diary-meta">
                    <span class="detail-diary-date">${dateStr}</span>
                    ${e.location ? `<span class="detail-diary-loc">${escHtml(e.location)}</span>` : ''}
                </div>
                ${e.title ? `<h2 class="detail-diary-title">${escHtml(e.title)}</h2>` : ''}
                ${imagesHtml ? `<div class="detail-diary-images">${imagesHtml}</div>` : ''}
                <div class="detail-diary-body">${e.body || ''}</div>
            </div>`;
    } else if (type === 'report') {
        const r = allReports[idx];
        if (!r) return;
        const pdfBtn = r.pdf
            ? `<a href="${escHtml(r.pdf)}" target="_blank" rel="noopener" class="detail-pdf-button">Download PDF Report</a>`
            : '';

        // Summary
        const summaryHtml = r.summary
            ? `<p class="detail-report-summary">${escHtml(r.summary)}</p>`
            : '';

        // Sections
        const sectionsHtml = (r.sections || []).map(s => `
            <div class="detail-report-section">
                ${s.heading ? `<h4 class="detail-report-section-heading">${escHtml(s.heading)}</h4>` : ''}
                <p class="detail-report-section-body">${escHtml(s.body || '')}</p>
            </div>`).join('');

        // Impact badges
        const impactLabels = { trees: '🌳 Trees', students: '📚 Students', schools: '🏫 Schools', participants: '👤 Participants', members: '👥 Members', workshops: '🎓 Workshops' };
        const impactHtml = r.impact && Object.keys(r.impact).length
            ? `<div class="detail-report-impact">${Object.entries(r.impact).map(([k, v]) =>
                `<span class="detail-report-chip">${impactLabels[k] || k}: ${v}</span>`).join('')}</div>`
            : '';

        content.innerHTML = `
            <div class="detail-modal-body">
                <div class="detail-report-header">
                    ${r.period ? `<div class="detail-report-period">${escHtml(r.period)}</div>` : ''}
                    <h2 class="detail-report-title">${escHtml(r.title)}</h2>
                    <div class="detail-report-chips">
                        ${r.members ? `<span class="detail-report-chip">${r.members} members</span>` : ''}
                        ${r.date ? `<span class="detail-report-chip">${formatDate(r.date)}</span>` : ''}
                    </div>
                </div>
                ${pdfBtn}
                ${summaryHtml}
                ${impactHtml}
                ${sectionsHtml}
            </div>`;

    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('open');
    document.body.style.overflow = '';
}

document.getElementById('detailModalClose').addEventListener('click', closeDetailModal);
document.getElementById('detailModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDetailModal();
});

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('lightbox').classList.contains('open')) {
        closeLightbox();
    } else if (document.getElementById('detailModal').classList.contains('open')) {
        closeDetailModal();
    }
});

window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;

// ─── HELPERS ─────────────────────────────────────────────────
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function emptyState(icon, title, sub) {
    return `<div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <h3>${title}</h3>
        <p>${sub}</p>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC MILESTONES — Simplified View (English only)
   ═══════════════════════════════════════════════════════════ */

let pubMsData = [];
let pubMsCats = [];
let pubMsPIdx = 0;

function pubMsRisk(goal) {
    if (goal.status === 'completed') return 'done';
    if (!goal.targetDate) return goal.status === 'in_progress' ? 'in-progress' : 'planned';
    const now = new Date(); now.setHours(0,0,0,0);
    const diff = (new Date(goal.targetDate) - now) / 86400000;
    if (diff < 0) return 'overdue';
    if (diff <= 7) return 'at-risk';
    return goal.status === 'in_progress' ? 'in-progress' : 'planned';
}

function pubMsRiskLabel(risk) {
    const map = { done:'Done', 'in-progress':'In Progress', planned:'Planned', overdue:'Overdue', 'at-risk':'At Risk' };
    return map[risk] || risk;
}

function pubMsCatInfo(key) {
    return pubMsCats.find(c => c.key === key) || { icon: '○', en: key };
}

async function loadMilestones() {
    const id = new URLSearchParams(location.search).get('id');
    try {
        const [msRes, catRes] = await Promise.all([
            fetch('/api/projects/' + id + '/milestones'),
            fetch('/api/milestone-categories')
        ]);
        pubMsData = msRes.ok ? await msRes.json() : [];
        pubMsCats = catRes.ok ? await catRes.json() : [];
    } catch { pubMsData = []; pubMsCats = []; }
    renderPubMs();
}

function renderPubMs() {
    const has = pubMsData.length > 0;
    document.getElementById('pubMsContainer').style.display = has ? '' : 'none';
    document.getElementById('pubMsEmpty').style.display = has ? 'none' : '';

    // Period selector (only if multiple)
    document.getElementById('pubMsPeriods').innerHTML = pubMsData.length > 1
        ? pubMsData.map((p, i) =>
            '<button class="pub-ms-period-btn' + (i === pubMsPIdx ? ' active' : '') + '" onclick="pubMsSwitchPeriod(' + i + ')">' + escHtml(p.title || p.period) + '</button>'
        ).join('')
        : '';

    if (!has) return;

    const period = pubMsData[pubMsPIdx];
    const goals = period.goals || [];

    // Title (English)
    document.getElementById('pubMsTitle').textContent = period.title || period.title_jp || period.period;

    // D-day
    const ddayEl = document.getElementById('pubMsDday');
    if (period.departureDate) {
        const now = new Date(); now.setHours(0,0,0,0);
        const daysLeft = Math.ceil((new Date(period.departureDate) - now) / 86400000);
        ddayEl.textContent = daysLeft > 0 ? 'D-' + daysLeft : daysLeft === 0 ? 'D-Day' : 'D+' + Math.abs(daysLeft);
        ddayEl.className = 'pub-ms-dday ' + (daysLeft < 0 ? 'past' : daysLeft <= 7 ? 'urgent' : daysLeft <= 14 ? 'warning' : 'normal');
    } else {
        ddayEl.textContent = '';
        ddayEl.className = 'pub-ms-dday';
    }

    // Progress
    const done = goals.filter(g => g.status === 'completed').length;
    const pct = goals.length ? Math.round(done / goals.length * 100) : 0;
    document.getElementById('pubMsPct').textContent = pct + '%';
    document.getElementById('pubMsFill').style.width = pct + '%';

    // Goals list
    document.getElementById('pubMsGoals').innerHTML = goals.map(function(g) {
        var cat = pubMsCatInfo(g.category);
        var risk = pubMsRisk(g);
        var stDone = (g.subTasks || []).filter(function(s) { return s.done; }).length;
        var stTotal = (g.subTasks || []).length;
        var stPct = stTotal ? Math.round(stDone / stTotal * 100) : 0;

        return '<div class="pub-ms-goal">' +
            '<div class="pub-ms-goal-top">' +
                '<span class="pub-ms-goal-icon">' + cat.icon + '</span>' +
                '<span class="pub-ms-goal-title">' + escHtml(g.title || g.title_jp || '') + '</span>' +
                '<span class="pub-ms-status ' + risk + '">' + pubMsRiskLabel(risk) + '</span>' +
                '<span class="pub-ms-goal-assignee">' + escHtml(g.assignee || '') + '</span>' +
            '</div>' +
            (stTotal ? '<div class="pub-ms-goal-bar-wrap">' +
                '<div class="pub-ms-goal-bar"><div class="pub-ms-goal-bar-fill" style="width:' + stPct + '%"></div></div>' +
                '<span class="pub-ms-goal-bar-label">' + stDone + '/' + stTotal + ' tasks</span>' +
            '</div>' : '') +
        '</div>';
    }).join('') || '<div class="pub-ms-empty">No goals yet.</div>';
}

function pubMsSwitchPeriod(idx) { pubMsPIdx = idx; renderPubMs(); }
window.pubMsSwitchPeriod = pubMsSwitchPeriod;
