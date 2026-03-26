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

// ═══════════════════════════════════════════════════════════════
// MILESTONES — Public Timeline
// ═══════════════════════════════════════════════════════════════

let msData = [];         // all periods
let msCats = [];         // categories
let msSelectedPIdx = 0;  // current period index
let msSelectedGIdx = -1; // selected goal index (-1 = none)

async function loadMilestones() {
    try {
        const [msRes, catsRes] = await Promise.all([
            fetch(`/api/projects/${projectId}/milestones`),
            fetch('/api/milestone-categories')
        ]);
        msData = await msRes.json();
        msCats = await catsRes.json();
        msSelectedPIdx = 0;
        msSelectedGIdx = -1;
        renderMsPeriodSelector();
        renderMsTrack();
    } catch {
        document.getElementById('msEmptyState').style.display = 'block';
    }
}

function msGetCat(key) {
    return msCats.find(c => c.key === key) || { icon: '○', en: key, jp: key };
}

function msPeriodLabel(period) {
    // "2025.03" → "March 2025 · 2025年3月"
    const [y, m] = period.split('.');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthsJp = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const mi = parseInt(m, 10) - 1;
    return `${months[mi] || m} ${y} · ${y}年${monthsJp[mi] || m}`;
}

function msCalcProgress(goal) {
    const subs = goal.subTasks || [];
    if (!subs.length) {
        return goal.status === 'completed' ? 100 : goal.status === 'in_progress' ? 50 : 0;
    }
    return Math.round(subs.filter(s => s.status === 'completed').length / subs.length * 100);
}

function renderMsPeriodSelector() {
    const el = document.getElementById('msPeriodSelector');
    if (!el) return;

    if (!msData.length) {
        el.innerHTML = '';
        document.getElementById('msHTrackOuter').style.display = 'none';
        document.getElementById('msTrackHeader').style.display = 'none';
        document.getElementById('msDetailPanel').classList.remove('ms-open');
        document.getElementById('msEmptyState').style.display = 'block';
        return;
    }
    document.getElementById('msEmptyState').style.display = 'none';

    el.innerHTML = msData.map((p, i) =>
        `<button class="ms-period-btn${i === msSelectedPIdx ? ' active' : ''}" onclick="msSwitchPeriod(${i})">${p.period}</button>`
    ).join('');
}

window.msSwitchPeriod = function(idx) {
    msSelectedPIdx = idx;
    msSelectedGIdx = -1;
    renderMsPeriodSelector();
    renderMsTrack();
};

function renderMsTrack() {
    const period = msData[msSelectedPIdx];
    const headerEl = document.getElementById('msTrackHeader');
    const trackOuter = document.getElementById('msHTrackOuter');
    const detailPanel = document.getElementById('msDetailPanel');

    if (!period || !period.goals.length) {
        headerEl.style.display = 'none';
        trackOuter.style.display = 'none';
        detailPanel.classList.remove('ms-open');
        return;
    }

    // Sort goals by targetDate ascending, final goal last
    const goals = [...period.goals].sort((a, b) => {
        if (!a.targetDate) return 1;
        if (!b.targetDate) return -1;
        return a.targetDate.localeCompare(b.targetDate);
    });

    // Overall progress = average of all goal progresses
    const totalPct = Math.round(goals.reduce((sum, g) => sum + msCalcProgress(g), 0) / goals.length);

    headerEl.style.display = 'flex';
    document.getElementById('msTrackPeriodLabel').textContent = msPeriodLabel(period.period).toUpperCase();
    document.getElementById('msTrackPct').textContent = `${totalPct}% Complete`;
    trackOuter.style.display = 'block';

    // Render nodes
    const track = document.getElementById('msHTrack');
    const isFinal = (i) => i === goals.length - 1;
    track.innerHTML = goals.map((g, i) => {
        const cat = msGetCat(g.category);
        const pct = msCalcProgress(g);
        const cls = isFinal(i) ? 'final' : g.status === 'completed' ? 'done' : g.status === 'in_progress' ? 'active-node' : 'planned';
        const sel = i === msSelectedGIdx ? ' selected' : '';
        const dateStr = g.targetDate ? g.targetDate.slice(5).replace('-', '/') : '';
        return `<div class="ms-h-node ${cls}${sel}" onclick="msSelectGoal(${i})" data-gidx="${i}">
            <div class="ms-h-circle">${cat.icon}</div>
            <div class="ms-h-label">${g.title_en || g.title_jp}<br><span>${g.title_jp || ''}</span></div>
            <div class="ms-h-date">${dateStr}</div>
            <div class="ms-h-tick"></div>
        </div>`;
    }).join('');

    // Update fill line
    const doneCnt = goals.filter(g => g.status === 'completed').length;
    const fillPct = goals.length > 1 ? (doneCnt / (goals.length - 1)) * 100 : (doneCnt > 0 ? 100 : 0);
    const fillW = fillPct >= 100 ? '100%' : Math.min(fillPct, 92) + '%';
    setTimeout(() => {
        const fill = document.getElementById('msHLineFill');
        const arrow = document.getElementById('msHLineArrow');
        if (fill) fill.style.width = fillW;
        if (arrow) arrow.classList.toggle('filled', fillPct >= 100);
    }, 50);

    // Update detail panel if a goal is selected
    if (msSelectedGIdx >= 0 && msSelectedGIdx < goals.length) {
        renderMsDetailPanel(goals[msSelectedGIdx]);
    } else {
        detailPanel.classList.remove('ms-open');
    }
}

window.msSelectGoal = function(gIdx) {
    msSelectedGIdx = gIdx;
    document.querySelectorAll('.ms-h-node').forEach((n, i) => {
        n.classList.toggle('selected', i === gIdx);
    });
    const period = msData[msSelectedPIdx];
    const goals = [...period.goals].sort((a, b) => {
        if (!a.targetDate) return 1;
        if (!b.targetDate) return -1;
        return a.targetDate.localeCompare(b.targetDate);
    });
    renderMsDetailPanel(goals[gIdx]);
};

function renderMsDetailPanel(goal) {
    const panel = document.getElementById('msDetailPanel');
    const inner = document.getElementById('msDetailInner');
    const cat = msGetCat(goal.category);

    const subs = goal.subTasks || [];
    const done = subs.filter(s => s.status === 'completed').length;
    const total = subs.length;
    const pct = msCalcProgress(goal);

    const statusLabels = { completed: 'Completed / 完了', in_progress: 'In Progress / 進行中', planned: 'Planned / 予定' };
    const statusTag = `<span class="ms-status-tag ms-tag-${goal.status}">${statusLabels[goal.status] || goal.status}</span>`;

    // Vertical fill for subtasks
    const doneSubs = subs.filter(s => s.status === 'completed').length;
    const vFill = total > 1 ? Math.min((doneSubs / (total - 1)) * 100, pct >= 100 ? 100 : 90) : (pct >= 100 ? 100 : 0);

    const subsHTML = subs.map(s => {
        const scls = s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'active-node' : 'planned';
        const stag = s.status === 'completed' ? '<span class="ms-status-tag ms-tag-completed" style="font-size:9px;padding:2px 7px">完了</span>'
            : s.status === 'in_progress' ? '<span class="ms-status-tag ms-tag-in_progress" style="font-size:9px;padding:2px 7px">進行中</span>'
            : '<span class="ms-status-tag ms-tag-planned" style="font-size:9px;padding:2px 7px">予定</span>';
        return `<div class="ms-v-node ${scls}">
            <div class="ms-v-circle">○</div>
            <div class="ms-v-content">
                <div class="ms-v-title-en">${s.title_en || ''}</div>
                <div class="ms-v-title-jp">${s.title_jp || ''}</div>
                ${stag}
            </div>
        </div>`;
    }).join('');

    inner.innerHTML = `
        <div class="ms-detail-top">
            <div>
                <div class="ms-detail-title-en">${goal.title_en || goal.title_jp}</div>
                <div class="ms-detail-title-jp">${goal.title_jp || ''}</div>
            </div>
            ${statusTag}
        </div>
        <div class="ms-detail-meta">
            <div class="ms-meta-item">CATEGORY<strong>${cat.icon} ${cat.en} / ${cat.jp}</strong></div>
            ${goal.assignee ? `<div class="ms-meta-item">ASSIGNEE / 担当<strong>${goal.assignee}</strong></div>` : ''}
            ${goal.targetDate ? `<div class="ms-meta-item">DUE DATE<strong>${goal.targetDate}</strong></div>` : ''}
        </div>
        ${subs.length ? `
        <div class="ms-v-track-outer">
            <div class="ms-v-line-wrap">
                <div class="ms-v-line-base"></div>
                <div class="ms-v-line-fill" id="msVLineFill" style="height:0%"></div>
                <div class="ms-v-line-arrow" id="msVLineArrow"></div>
            </div>
            ${subsHTML}
        </div>
        <div class="ms-progress-wrap">
            <div class="ms-progress-label">
                <span>SUB-TASK PROGRESS</span>
                <span>${done}/${total} · ${pct}%</span>
            </div>
            <div class="ms-progress-bar"><div class="ms-progress-fill" id="msProgressFill" style="width:0%"></div></div>
        </div>` : ''}
    `;

    panel.classList.add('ms-open');

    setTimeout(() => {
        const vf = document.getElementById('msVLineFill');
        const pf = document.getElementById('msProgressFill');
        const va = document.getElementById('msVLineArrow');
        if (vf) vf.style.height = vFill + '%';
        if (pf) pf.style.width = pct + '%';
        if (va) va.classList.toggle('filled', pct >= 100);
    }, 60);
}
