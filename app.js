/**
 * Axis Website — app.js
 * Handles: Nav scroll effect · Scroll-reveal · Count-up animation · Mobile nav
 */

// Signal JS is active — enables scroll-reveal CSS transitions
document.body.classList.add('js-ready');

/* ─── NAVIGATION: Transparent → Frosted Glass ─────────────── */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ─── MOBILE NAV TOGGLE ──────────────────────────────────── */
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle?.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', isOpen);
    // Animate hamburger bars
    const bars = navToggle.querySelectorAll('span');
    if (isOpen) {
        bars[0].style.transform = 'translateY(7px) rotate(45deg)';
        bars[1].style.opacity = '0';
        bars[2].style.transform = 'translateY(-7px) rotate(-45deg)';
    } else {
        bars[0].style.transform = '';
        bars[1].style.opacity = '';
        bars[2].style.transform = '';
    }
});

// Close mobile nav on link click
navLinks?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('nav-open');
        const bars = navToggle?.querySelectorAll('span');
        if (bars) { bars[0].style.transform = ''; bars[1].style.opacity = ''; bars[2].style.transform = ''; }
    });
});

/* ─── SCROLL REVEAL ──────────────────────────────────────── */
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

revealElements.forEach(el => revealObserver.observe(el));

/* ─── COUNT-UP ANIMATION ─────────────────────────────────── */
function animateCount(el, target, duration = 1500, suffix = '') {
    const start = performance.now();
    const update = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(eased * target);
        el.textContent = value.toLocaleString() + suffix;
        if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

/* ─── GLOBAL STATS: fetch from server then start count-up ─── */
async function loadGlobalStats() {
    try {
        const res = await fetch('/api/global-stats');
        if (!res.ok) return;
        const gs = await res.json();

        // Map: element ID → { field, suffixField, labelId, labelField }
        const map = [
            { id: 'gStatYears', field: 'yearsOfService', suffixField: 'yearsOfServiceSuffix', labelId: 'gStatYearsLabel', labelField: 'label_years' },
            { id: 'gStatCountries', field: 'activeCountries', suffixField: 'activeCountriesSuffix', labelId: 'gStatCountriesLabel', labelField: 'label_countries' },
            { id: 'gStatTrees', field: 'treesPlanted', suffixField: 'treesPlantedSuffix', labelId: 'gStatTreesLabel', labelField: 'label_trees' },
        ];

        // Auto-calculate yearsOfService from founding year if not set
        const FOUNDING_YEAR = 2001;
        if (!gs.yearsOfService || gs.yearsOfService === 0) {
            gs.yearsOfService = new Date().getFullYear() - FOUNDING_YEAR;
        }

        map.forEach(({ id, field, suffixField, labelId, labelField }) => {
            const el = document.getElementById(id);
            if (el && gs[field] !== undefined) {
                el.dataset.count = gs[field];
                el.dataset.suffix = gs[suffixField] ?? '';
                el.textContent = '0';   // reset so observer re-animates
            }
            const lEl = document.getElementById(labelId);
            if (lEl && gs[labelField]) lEl.textContent = gs[labelField];
        });
    } catch { /* silently fall back to hardcoded values */ }
}

const statNums = document.querySelectorAll('.stat-num[data-count]');
const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseInt(el.dataset.count, 10);
            const suffix = el.dataset.suffix || '';
            animateCount(el, target, 1600, suffix);
            countObserver.unobserve(el);
        }
    });
}, { threshold: 0.5 });

// Load stats first, then start observing (so updated data-count values are used)
loadGlobalStats().then(() => {
    statNums.forEach(el => countObserver.observe(el));
});


/* ─── ACTIVE NAV LINK HIGHLIGHT ──────────────────────────── */
const sections = document.querySelectorAll('section[id], .cta-section[id]');
const navAnchors = document.querySelectorAll('.nav-links a');

const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.id;
            navAnchors.forEach(a => {
                a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
            });
        }
    });
}, { threshold: 0.4 });

sections.forEach(s => sectionObserver.observe(s));

/* ─── PROJECT CARDS: fetch from API then render ──────────── */
function renderCardHTML(id, card) {
    const container = document.getElementById(`card-text-${id}`);
    if (!container || !card) return;

    const meta = (card.meta || []).map(m =>
        `<div class="project-meta-item"><strong>${escCard(m.label)}</strong><span>${escCard(m.value)}</span></div>`
    ).join('');

    const sloganLine2 = card.slogan_line2 ? `<br>${escCard(card.slogan_line2)}` : '';

    container.innerHTML = `
        <span class="tag">${escCard(card.tag || '')}</span>
        <h3>${escCard(card.slogan_line1 || '')}${sloganLine2}</h3>
        ${card.lead ? `<p class="lead">${escCard(card.lead)}</p>` : ''}
        ${card.body ? `<p>${escCard(card.body)}</p>` : ''}
        ${meta ? `<div class="project-meta-row">${meta}</div>` : ''}
        <a href="project.html?id=${id}" class="project-link">View Project</a>
        ${card.instagram_url ? `<a href="${escCard(card.instagram_url)}" target="_blank" rel="noopener" class="insta-link">${escCard(card.instagram_handle || card.instagram_url)}</a>` : ''}
    `;
}

function escCard(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildProjectBlockHTML(project, index) {
    const isReverse = index % 2 === 1;
    const reverseClass = isReverse ? ' reverse' : '';
    const heroImg = project.hero_image
        ? `<img src="${escCard(project.hero_image)}" alt="${escCard(project.name)} Project">`
        : `<div style="width:100%;height:280px;background:linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));border-radius:12px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:48px;">🌍</div>`;
    const sealImg = project.seal_image
        ? `<img src="${escCard(project.seal_image)}" alt="${escCard(project.name)} Seal" class="project-country-seal">`
        : '';
    return `
        <div class="project-block${reverseClass} reveal" id="${escCard(project.id)}">
            <div class="project-img-wrap">
                ${heroImg}
                ${sealImg}
            </div>
            <div class="project-text" id="card-text-${escCard(project.id)}">
                <!-- populated below by renderCardHTML() -->
            </div>
        </div>
    `;
}

async function loadProjectCards() {
    try {
        // 1. Fetch the projects index
        const idxRes = await fetch('/api/projects-index');
        if (!idxRes.ok) return;
        const projects = await idxRes.json();

        const container = document.getElementById('projectsContainer');
        const descEl = document.getElementById('projectsSectionDesc');

        if (!projects.length) {
            if (container) container.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.4);">No active projects yet.</p>';
            if (descEl) descEl.textContent = 'No active projects currently.';
            return;
        }

        // 2. Update section description
        if (descEl) {
            const count = projects.length;
            const names = projects.map(p => p.name).join(' · ');
            descEl.textContent = `${count} active project${count !== 1 ? 's' : ''} across Asia: ${names}.`;
        }

        // 3. Build project blocks dynamically
        if (container) {
            container.innerHTML = projects.map((p, i) => buildProjectBlockHTML(p, i)).join('');

            // Re-attach scroll-reveal observer to new elements
            container.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
        }

        // 4. Fetch each project's card data in parallel and populate text
        const cardResults = await Promise.all(
            projects.map(p => fetch(`/api/projects/${p.id}/card`).then(r => r.ok ? r.json() : null).catch(() => null))
        );
        projects.forEach((p, i) => {
            // merge hero_image & seal_image from project data if card fetch succeeded
            if (cardResults[i]) renderCardHTML(p.id, cardResults[i]);
        });

        // 5. Populate impact-bullets dynamically from projects list
        const bulletsEl = document.getElementById('impactBullets');
        if (bulletsEl) {
            bulletsEl.innerHTML = projects.map(p => {
                const slogan = p.slogan ? ` — ${escCard(p.slogan)}` : '';
                return `<div class="impact-bullet">${escCard(p.name)}${slogan}</div>`;
            }).join('') +
                '<div class="impact-bullet">Environmental Conservation across Asia</div>';
        }

        // 6. Update the impact section heading country count dynamically
        const countLineEl = document.getElementById('impactCountryLine');
        if (countLineEl) {
            const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
            const n = projects.length;
            const word = n < words.length ? words[n] : String(n);
            countLineEl.textContent = `${word} ${n === 1 ? 'country' : 'countries'}.`;
        }


    } catch { /* silently fail — blocks remain skeleton */ }
}

// Kick off both fetches in parallel for faster initial load
Promise.all([loadProjectCards(), loadHistory()]);

async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        if (!res.ok) return;
        const items = await res.json();
        const container = document.getElementById('historyTimeline');
        if (!container || !items.length) return;

        container.innerHTML = items.map(item => `
            <div class="timeline-item">
                <span class="timeline-year">${escCard(item.year || '')}</span>
                <h4>${escCard(item.title || '')}</h4>
                ${item.body ? `<p>${escCard(item.body)}</p>` : ''}
            </div>
        `).join('');

        // Re-attach scroll-reveal observer for new elements
        container.querySelectorAll('.timeline-item').forEach(el => revealObserver.observe(el));
    } catch { /* silently fall back — skeleton placeholder remains */ }
}

loadHistory();
