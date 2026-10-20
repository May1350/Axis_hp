# Milestone "Mission Control" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the milestone feature from a generic task hierarchy into a departure-countdown dashboard that immediately answers "D-day, % done, what's at risk."

**Architecture:** Replace the horizontal timeline public UI and flat admin list with a Mission Control dashboard. Admin UI is Japanese-first for member convenience. Public UI is English-only. API adds `departureDate`, `returnDate`, `title`, `title_jp` to periods and a new PATCH period endpoint. Goal field `title_en` renamed to `title`, subtasks simplified to `{ id, title, done }`.

**Tech Stack:** Vanilla HTML/CSS/JS (no frameworks), Express API on Supabase.

**Spec:** `docs/superpowers/specs/2026-03-31-milestone-mission-control-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `api/index.js:786-897` | Modify | Add period fields, PATCH period endpoint, rename goal fields, simplify subtasks |
| `admin.html:820-923` | Rewrite | Mission Control dashboard HTML (header, attention, summary, goals list) |
| `admin.js:1995-2322` | Rewrite | Dashboard rendering, risk calculation, inline editing, summary computation |
| `admin.css:1071-1220` | Rewrite | Dashboard styles (attention cards, progress bars, summary layout) |
| `project.html:152-186` | Rewrite | Simplified public milestone view |
| `project.js:392-607` | Rewrite | Public rendering with progress bars, D-day, risk colors |
| `project.css:2043-2253` | Rewrite | Public milestone styles |

---

## Task 1: API — Extend Period and Goal Models

**Files:**
- Modify: `api/index.js:786-897` (milestone endpoints section)

- [ ] **Step 1: Update POST /api/projects/:id/milestones/periods (line 786-798)**

Replace the existing endpoint with:

```javascript
app.post('/api/projects/:id/milestones/periods', requireAuth, async (req, res) => {
    const { period, departureDate, returnDate, title, title_jp } = req.body || {};
    if (!period || !/^\d{4}\.\d{2}$/.test(period))
        return res.status(400).json({ error: 'period must match YYYY.MM' });
    if (!departureDate)
        return res.status(400).json({ error: 'departureDate is required' });
    if (!title_jp)
        return res.status(400).json({ error: 'title_jp is required' });
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    data.milestones = data.milestones || [];
    data.milestones.push({
        period,
        departureDate,
        returnDate: returnDate || '',
        title: title || '',
        title_jp,
        goals: []
    });
    data.milestones.sort((a, b) => b.period.localeCompare(a.period));
    await writeProject(req.params.id, data);
    await appendLog('CREATE', 'milestone-period', req.params.id, title_jp);
    res.status(201).json({ ok: true, milestones: data.milestones });
});
```

- [ ] **Step 2: Add new PATCH /api/projects/:id/milestones/periods/:pIdx endpoint**

Insert after the DELETE periods endpoint (after line ~811):

```javascript
app.patch('/api/projects/:id/milestones/periods/:pIdx', requireAuth, async (req, res) => {
    const pIdx = parseInt(req.params.pIdx, 10);
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    data.milestones = data.milestones || [];
    if (isNaN(pIdx) || pIdx < 0 || pIdx >= data.milestones.length)
        return res.status(400).json({ error: 'Invalid' });
    const p = data.milestones[pIdx];
    if (req.body.title !== undefined) p.title = req.body.title;
    if (req.body.title_jp !== undefined) p.title_jp = req.body.title_jp;
    if (req.body.departureDate !== undefined) p.departureDate = req.body.departureDate;
    if (req.body.returnDate !== undefined) p.returnDate = req.body.returnDate;
    await writeProject(req.params.id, data);
    await appendLog('UPDATE', 'milestone-period', req.params.id, p.title_jp || p.title);
    res.json({ ok: true, period: p });
});
```

- [ ] **Step 3: Update POST goals to use `title` instead of `title_en` (line 813-836)**

Replace the goal creation body parsing and object:

```javascript
app.post('/api/projects/:id/milestones/periods/:pIdx/goals', requireAuth, async (req, res) => {
    const pIdx = parseInt(req.params.pIdx, 10);
    const data = await readProject(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    data.milestones = data.milestones || [];
    if (isNaN(pIdx) || pIdx < 0 || pIdx >= data.milestones.length)
        return res.status(400).json({ error: 'Invalid' });
    const { title, title_jp, category, targetDate, assignee, note, status } = req.body || {};
    const goal = {
        id: 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title: title || '',
        title_jp: title_jp || '',
        category: category || '',
        targetDate: targetDate || '',
        assignee: assignee || '',
        note: note || '',
        status: status || 'planned',
        subTasks: []
    };
    data.milestones[pIdx].goals.push(goal);
    await writeProject(req.params.id, data);
    await appendLog('CREATE', 'milestone-goal', req.params.id, goal.title_jp || goal.title);
    res.status(201).json({ ok: true, goal });
});
```

- [ ] **Step 4: Update PATCH goals allowed fields (line 838-857)**

Change the allowed fields array:

```javascript
const allowed = ['title', 'title_jp', 'category', 'targetDate', 'assignee', 'note', 'status'];
```

Also update the appendLog line to use `goal.title_jp || goal.title`.

- [ ] **Step 5: Update DELETE goals log (line 859-874)**

Change: `deleted.title_en || deleted.title_jp` → `deleted.title_jp || deleted.title`

- [ ] **Step 6: Update PATCH subtasks to use simplified format (line 876-897)**

Replace the subtask mapping:

```javascript
goal.subTasks = subTasks.map((st, i) => ({
    id: st.id || ('s_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4) + i),
    title: st.title || '',
    done: !!st.done
}));
```

- [ ] **Step 7: Verify API locally**

```bash
node server.js
# Test period creation with new fields:
curl -X POST http://localhost:8000/api/projects/mongolia/milestones/periods \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"period":"2025.08","departureDate":"2025-08-15","title":"Mongolia Summer 2025","title_jp":"モンゴル夏合宿"}'
```

Expected: `{ "ok": true, "milestones": [...] }` with new period containing `departureDate`, `title`, `title_jp`.

- [ ] **Step 8: Commit**

```bash
git add api/index.js
git commit -m "feat: extend milestone API — period fields, goal rename, subtask simplify"
```

---

## Task 2: Admin HTML — Mission Control Dashboard Structure

**Files:**
- Modify: `admin.html:820-923` (replace entire milestone tab content)

- [ ] **Step 1: Replace milestone tab HTML**

Replace lines 820-923 in `admin.html` with the Mission Control dashboard structure. Find the section that starts with `<!-- ─── Tab: Milestones ───` and replace through its closing `</div>`:

```html
<!-- ─── Tab: Milestones ─────────────────────────────────── -->
<div class="tab-panel" id="tab-milestones">

    <!-- Period Tabs -->
    <div class="mc-period-bar">
        <div class="mc-period-tabs" id="mcPeriodTabs"></div>
        <button class="small-btn gold" id="mcAddPeriodBtn">+ 新規ミッション</button>
    </div>

    <!-- Mission Header -->
    <div class="mc-header" id="mcHeader" style="display:none;">
        <div class="mc-header-top">
            <div class="mc-header-info">
                <h3 class="mc-title" id="mcTitle"></h3>
                <span class="mc-dates" id="mcDates"></span>
            </div>
            <div class="mc-header-right">
                <span class="mc-dday" id="mcDday"></span>
                <button class="small-btn" id="mcEditPeriodBtn">編集</button>
            </div>
        </div>
        <div class="mc-progress-wrap">
            <div class="mc-progress-bar">
                <div class="mc-progress-fill" id="mcProgressFill"></div>
            </div>
            <span class="mc-progress-label" id="mcProgressLabel">0%</span>
        </div>
    </div>

    <!-- Attention Section -->
    <div class="mc-attention" id="mcAttention" style="display:none;">
        <h4 class="mc-section-label">⚠ 要注意</h4>
        <div class="mc-attention-cards" id="mcAttentionCards"></div>
    </div>

    <!-- Summary Row -->
    <div class="mc-summary" id="mcSummary" style="display:none;">
        <div class="mc-summary-col">
            <h4 class="mc-section-label">メンバー別</h4>
            <div id="mcByMember"></div>
        </div>
        <div class="mc-summary-col">
            <h4 class="mc-section-label">カテゴリ別</h4>
            <div id="mcByCategory"></div>
        </div>
    </div>

    <!-- All Goals -->
    <div class="mc-goals" id="mcGoals" style="display:none;">
        <div class="mc-goals-header">
            <h4 class="mc-section-label">全タスク</h4>
            <button class="small-btn gold" id="mcAddGoalBtn">+ タスク追加</button>
        </div>
        <div class="mc-goal-list" id="mcGoalList"></div>
    </div>

    <!-- Inline Goal Form (hidden by default) -->
    <div class="mc-goal-form" id="mcGoalForm" style="display:none;">
        <input type="hidden" id="mcgf-gIdx" value="-1">
        <div class="mc-form-row">
            <label>タイトル (日本語)</label>
            <input type="text" id="mcgf-title-jp" placeholder="航空券予約">
        </div>
        <div class="mc-form-row">
            <label>Title (English, optional)</label>
            <input type="text" id="mcgf-title" placeholder="Flight Booking">
        </div>
        <div class="mc-form-row mc-form-row-3">
            <div>
                <label>カテゴリ</label>
                <select id="mcgf-category"></select>
            </div>
            <div>
                <label>期日</label>
                <input type="date" id="mcgf-target-date">
            </div>
            <div>
                <label>Assignee</label>
                <input type="text" id="mcgf-assignee" placeholder="Shota Tanaka" pattern="[A-Za-z .'-]+" title="English characters only">
            </div>
        </div>
        <div class="mc-form-row mc-form-row-2">
            <div>
                <label>ステータス</label>
                <select id="mcgf-status">
                    <option value="planned">未着手</option>
                    <option value="in_progress">進行中</option>
                    <option value="completed">完了</option>
                </select>
            </div>
            <div>
                <label>メモ</label>
                <input type="text" id="mcgf-note" placeholder="">
            </div>
        </div>
        <div class="mc-form-actions">
            <button class="small-btn gold" id="mcGoalSaveBtn">保存</button>
            <button class="small-btn" id="mcGoalCancelBtn">キャンセル</button>
        </div>
    </div>

    <!-- Period Edit Form (hidden by default) -->
    <div class="mc-period-form" id="mcPeriodForm" style="display:none;">
        <div class="mc-form-row mc-form-row-2">
            <div>
                <label>ミッション名 (日本語)</label>
                <input type="text" id="mcpf-title-jp" placeholder="モンゴル夏合宿">
            </div>
            <div>
                <label>Mission Title (English)</label>
                <input type="text" id="mcpf-title" placeholder="Mongolia Summer 2025">
            </div>
        </div>
        <div class="mc-form-row mc-form-row-3">
            <div>
                <label>期間</label>
                <input type="text" id="mcpf-period" placeholder="2025.08" pattern="\d{4}\.\d{2}">
            </div>
            <div>
                <label>出発日</label>
                <input type="date" id="mcpf-departure">
            </div>
            <div>
                <label>帰国日</label>
                <input type="date" id="mcpf-return">
            </div>
        </div>
        <div class="mc-form-actions">
            <button class="small-btn gold" id="mcPeriodSaveBtn">保存</button>
            <button class="small-btn" id="mcPeriodCancelBtn">キャンセル</button>
            <button class="small-btn danger" id="mcPeriodDeleteBtn" style="display:none;">削除</button>
        </div>
    </div>

    <!-- Empty State -->
    <div class="mc-empty" id="mcEmpty">
        <p>ミッションがまだありません。「+ 新規ミッション」で作成してください。</p>
    </div>

</div>
```

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "feat: admin milestone HTML — Mission Control dashboard structure"
```

---

## Task 3: Admin CSS — Mission Control Styles

**Files:**
- Modify: `admin.css:1071-1220` (replace milestone styles section)

- [ ] **Step 1: Replace milestone CSS section**

Replace lines 1071-1220 in `admin.css` (the section starting with `/* Milestone */` or similar) with:

```css
/* ═══════════════════════════════════════════════════════════
   MISSION CONTROL — Milestone Dashboard
   ═══════════════════════════════════════════════════════════ */

/* Period Bar */
.mc-period-bar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px; gap: 12px; flex-wrap: wrap;
}
.mc-period-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.mc-period-tab {
    padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;
    background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5);
    border: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: all 0.2s;
}
.mc-period-tab:hover { color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.15); }
.mc-period-tab.active { background: var(--accent); color: #0a0f1e; border-color: var(--accent); }

/* Header */
.mc-header {
    background: rgba(255,255,255,0.04); border-radius: 12px;
    padding: 20px 24px; margin-bottom: 20px;
}
.mc-header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.mc-header-info { flex: 1; }
.mc-title { font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 4px; }
.mc-dates { font-size: 13px; color: rgba(255,255,255,0.4); }
.mc-header-right { display: flex; align-items: center; gap: 12px; }
.mc-dday {
    font-size: 18px; font-weight: 800; font-family: 'Outfit', sans-serif;
    padding: 4px 14px; border-radius: 8px; letter-spacing: 0.02em;
}
.mc-dday.urgent { background: #E53E3E; color: #fff; }
.mc-dday.warning { background: #ED8936; color: #1a1a1a; }
.mc-dday.normal { background: rgba(212,175,55,0.15); color: #D4AF37; }
.mc-dday.past { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); }
.mc-progress-wrap { display: flex; align-items: center; gap: 12px; }
.mc-progress-bar { flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.mc-progress-fill { height: 100%; background: #D4AF37; border-radius: 3px; transition: width 0.6s ease; }
.mc-progress-label { font-size: 14px; font-weight: 700; color: #D4AF37; min-width: 36px; text-align: right; }

/* Section Label */
.mc-section-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
    color: rgba(255,255,255,0.35); margin-bottom: 12px;
}

/* Attention */
.mc-attention { margin-bottom: 24px; }
.mc-attention-cards { display: flex; gap: 10px; flex-wrap: wrap; }
.mc-attn-card {
    flex: 1; min-width: 200px; padding: 14px 16px; border-radius: 10px;
    background: rgba(255,255,255,0.04); cursor: pointer; transition: background 0.2s;
}
.mc-attn-card:hover { background: rgba(255,255,255,0.07); }
.mc-attn-card.overdue { border-left: 3px solid #E53E3E; }
.mc-attn-card.at-risk { border-left: 3px solid #ED8936; }
.mc-attn-card-title { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 6px; }
.mc-attn-card-meta { font-size: 12px; color: rgba(255,255,255,0.4); }
.mc-attn-badge {
    display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px;
    border-radius: 4px; margin-left: 8px;
}
.mc-attn-badge.overdue { background: #E53E3E; color: #fff; }
.mc-attn-badge.at-risk { background: #ED8936; color: #1a1a1a; }

/* Summary */
.mc-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
.mc-summary-col { background: rgba(255,255,255,0.03); border-radius: 10px; padding: 16px; }
.mc-summary-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13px; }
.mc-summary-name { min-width: 100px; color: rgba(255,255,255,0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-summary-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
.mc-summary-bar-fill { height: 100%; background: #D4AF37; border-radius: 2px; transition: width 0.4s; }
.mc-summary-count { font-size: 12px; color: rgba(255,255,255,0.4); min-width: 32px; text-align: right; }

/* All Goals */
.mc-goals-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.mc-goal-row {
    display: grid; grid-template-columns: 28px 1fr auto auto auto;
    align-items: center; gap: 12px; padding: 12px 14px; border-radius: 8px;
    background: rgba(255,255,255,0.03); margin-bottom: 6px; cursor: pointer; transition: background 0.15s;
}
.mc-goal-row:hover { background: rgba(255,255,255,0.06); }
.mc-goal-icon { font-size: 16px; text-align: center; }
.mc-goal-title { font-size: 14px; font-weight: 600; color: #fff; }
.mc-goal-title small { font-weight: 400; color: rgba(255,255,255,0.3); margin-left: 6px; font-size: 12px; }
.mc-goal-assignee { font-size: 12px; color: rgba(255,255,255,0.4); }
.mc-goal-date { font-size: 12px; color: rgba(255,255,255,0.4); }

/* Status Badges */
.mc-status {
    display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px;
    border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em;
}
.mc-status.done { border: 1px solid #D4AF37; color: #D4AF37; }
.mc-status.in-progress { border: 1px solid rgba(255,255,255,0.4); color: rgba(255,255,255,0.7); }
.mc-status.planned { border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.3); }
.mc-status.overdue { background: #E53E3E; color: #fff; border: none; }
.mc-status.at-risk { background: #ED8936; color: #1a1a1a; border: none; }

/* Goal Expanded (subtasks inline) */
.mc-goal-expanded {
    padding: 12px 14px 12px 54px; background: rgba(255,255,255,0.02);
    border-radius: 0 0 8px 8px; margin-top: -6px; margin-bottom: 6px;
}
.mc-subtask-row {
    display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: rgba(255,255,255,0.6);
}
.mc-subtask-row input[type="checkbox"] { accent-color: #D4AF37; }
.mc-subtask-row.done { text-decoration: line-through; color: rgba(255,255,255,0.25); }
.mc-subtask-add { font-size: 12px; color: #D4AF37; cursor: pointer; padding: 4px 0; }
.mc-subtask-add:hover { text-decoration: underline; }
.mc-goal-actions { display: flex; gap: 8px; margin-top: 8px; }

/* Forms */
.mc-goal-form, .mc-period-form {
    background: rgba(255,255,255,0.04); border-radius: 10px;
    padding: 20px; margin-bottom: 16px;
}
.mc-form-row { margin-bottom: 12px; }
.mc-form-row label { display: block; font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.mc-form-row input, .mc-form-row select {
    width: 100%; padding: 8px 12px; border-radius: 6px; font-size: 14px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    color: #fff; outline: none;
}
.mc-form-row input:focus, .mc-form-row select:focus { border-color: #D4AF37; }
.mc-form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mc-form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.mc-form-actions { display: flex; gap: 8px; margin-top: 16px; }

/* On-track message */
.mc-on-track { padding: 16px; text-align: center; color: #D4AF37; font-size: 14px; }

/* Empty State */
.mc-empty { text-align: center; padding: 60px 20px; color: rgba(255,255,255,0.3); font-size: 14px; }

/* Responsive */
@media (max-width: 768px) {
    .mc-summary { grid-template-columns: 1fr; }
    .mc-goal-row { grid-template-columns: 28px 1fr auto; }
    .mc-goal-assignee, .mc-goal-date { display: none; }
    .mc-form-row-3 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Commit**

```bash
git add admin.css
git commit -m "feat: admin milestone CSS — Mission Control dashboard styles"
```

---

## Task 4: Admin JS — Mission Control Logic

**Files:**
- Modify: `admin.js:1990-2322` (replace milestone JS section)

- [ ] **Step 1: Replace the entire milestone JS section**

Find the milestone section in admin.js (starts around line 1990 with `let msMilestones`). Replace everything from there through the end of the milestone functions (~line 2322) with the new Mission Control logic:

```javascript
/* ═══════════════════════════════════════════════════════════
   MISSION CONTROL — Milestone Dashboard
   ═══════════════════════════════════════════════════════════ */

let mcData = [];       // milestones array
let mcCats = [];       // categories
let mcPIdx = 0;        // current period index
let mcExpandedGoal = -1; // expanded goal index (-1 = none)

// ─── Risk calculation ────────────────────────────────────
function mcRisk(goal, departureDate) {
    if (goal.status === 'completed') return 'done';
    if (!goal.targetDate) return 'planned';
    const now = new Date(); now.setHours(0,0,0,0);
    const target = new Date(goal.targetDate);
    const diff = (target - now) / 86400000;
    if (diff < 0) return 'overdue';
    if (diff <= 7) return 'at-risk';
    return goal.status === 'in_progress' ? 'in-progress' : 'planned';
}

function mcRiskLabel(risk) {
    const map = { done:'完了', 'in-progress':'進行中', planned:'未着手', overdue:'期限超過', 'at-risk':'要注意' };
    return map[risk] || risk;
}

function mcCatInfo(key) {
    return mcCats.find(c => c.key === key) || { icon: '○', jp: key, en: key };
}

function mcDaysUntil(dateStr) {
    if (!dateStr) return null;
    const now = new Date(); now.setHours(0,0,0,0);
    return Math.ceil((new Date(dateStr) - now) / 86400000);
}

function mcFormatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth()+1}/${d.getDate()}`;
}

// ─── Load ────────────────────────────────────────────────
async function loadMilestonesTab() {
    try {
        const [msRes, catRes] = await Promise.all([
            fetch(`/api/projects/${currentProject}/milestones`),
            fetch('/api/milestone-categories')
        ]);
        mcData = msRes.ok ? await msRes.json() : [];
        mcCats = catRes.ok ? await catRes.json() : [];
    } catch { mcData = []; mcCats = []; }

    if (mcPIdx >= mcData.length) mcPIdx = 0;
    mcExpandedGoal = -1;
    renderMC();
}

// ─── Main render ─────────────────────────────────────────
function renderMC() {
    const hasPeriods = mcData.length > 0;

    // Period tabs
    const tabsEl = document.getElementById('mcPeriodTabs');
    tabsEl.innerHTML = mcData.map((p, i) =>
        `<div class="mc-period-tab${i === mcPIdx ? ' active' : ''}" onclick="mcSwitchPeriod(${i})">${p.title_jp || p.period}</div>`
    ).join('');

    // Toggle visibility
    ['mcHeader','mcAttention','mcSummary','mcGoals'].forEach(id => {
        document.getElementById(id).style.display = hasPeriods ? '' : 'none';
    });
    document.getElementById('mcEmpty').style.display = hasPeriods ? 'none' : '';
    document.getElementById('mcGoalForm').style.display = 'none';
    document.getElementById('mcPeriodForm').style.display = 'none';

    if (!hasPeriods) return;

    const period = mcData[mcPIdx];
    const goals = period.goals || [];
    const daysLeft = mcDaysUntil(period.departureDate);

    // Header
    document.getElementById('mcTitle').textContent = period.title_jp || period.title || period.period;
    document.getElementById('mcDates').textContent =
        period.departureDate
            ? (period.returnDate ? `${period.departureDate} → ${period.returnDate}` : period.departureDate)
            : '';

    const ddayEl = document.getElementById('mcDday');
    if (daysLeft !== null) {
        ddayEl.textContent = daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? 'D-Day' : `D+${Math.abs(daysLeft)}`;
        ddayEl.className = 'mc-dday ' + (daysLeft < 0 ? 'past' : daysLeft <= 7 ? 'urgent' : daysLeft <= 14 ? 'warning' : 'normal');
    } else { ddayEl.textContent = ''; ddayEl.className = 'mc-dday'; }

    const done = goals.filter(g => g.status === 'completed').length;
    const pct = goals.length ? Math.round(done / goals.length * 100) : 0;
    document.getElementById('mcProgressFill').style.width = pct + '%';
    document.getElementById('mcProgressLabel').textContent = pct + '%';

    // Attention
    const risks = goals.map((g, i) => ({ ...g, _idx: i, _risk: mcRisk(g, period.departureDate) }))
        .filter(g => g._risk === 'overdue' || g._risk === 'at-risk');
    const attnEl = document.getElementById('mcAttention');
    if (risks.length === 0) {
        attnEl.style.display = '';
        document.getElementById('mcAttentionCards').innerHTML = '<div class="mc-on-track">順調に進行中 ✓</div>';
    } else {
        attnEl.style.display = '';
        document.getElementById('mcAttentionCards').innerHTML = risks.map(g => {
            const cat = mcCatInfo(g.category);
            const d = mcDaysUntil(g.targetDate);
            const meta = g._risk === 'overdue'
                ? `期日: ${mcFormatDate(g.targetDate)} (${Math.abs(d)}日超過)`
                : `期日: ${mcFormatDate(g.targetDate)} (残${d}日)`;
            return `<div class="mc-attn-card ${g._risk}" onclick="mcScrollToGoal(${g._idx})">
                <div class="mc-attn-card-title">${cat.icon} ${esc(g.title_jp || g.title)}<span class="mc-attn-badge ${g._risk}">${mcRiskLabel(g._risk)}</span></div>
                <div class="mc-attn-card-meta">${esc(g.assignee)} · ${meta}</div>
            </div>`;
        }).join('');
    }

    // Summary — by member
    const members = {};
    goals.forEach(g => {
        const name = g.assignee || 'Unassigned';
        if (!members[name]) members[name] = { done: 0, total: 0 };
        members[name].total++;
        if (g.status === 'completed') members[name].done++;
    });
    document.getElementById('mcByMember').innerHTML = Object.entries(members).map(([name, m]) => {
        const p = m.total ? Math.round(m.done / m.total * 100) : 0;
        return `<div class="mc-summary-row">
            <span class="mc-summary-name">${esc(name)}</span>
            <div class="mc-summary-bar"><div class="mc-summary-bar-fill" style="width:${p}%"></div></div>
            <span class="mc-summary-count">${m.done}/${m.total}</span>
        </div>`;
    }).join('') || '<div style="font-size:12px;color:rgba(255,255,255,0.3);">—</div>';

    // Summary — by category
    const cats = {};
    goals.forEach(g => {
        const cat = mcCatInfo(g.category);
        const key = g.category || '_none';
        if (!cats[key]) cats[key] = { icon: cat.icon, name: cat.jp, done: 0, total: 0 };
        cats[key].total++;
        if (g.status === 'completed') cats[key].done++;
    });
    document.getElementById('mcByCategory').innerHTML = Object.values(cats).map(c => {
        const p = c.total ? Math.round(c.done / c.total * 100) : 0;
        return `<div class="mc-summary-row">
            <span class="mc-summary-name">${c.icon} ${esc(c.name)}</span>
            <div class="mc-summary-bar"><div class="mc-summary-bar-fill" style="width:${p}%"></div></div>
            <span class="mc-summary-count">${c.done}/${c.total}</span>
        </div>`;
    }).join('') || '<div style="font-size:12px;color:rgba(255,255,255,0.3);">—</div>';

    // Goal list
    renderMCGoals(goals, period);
}

function renderMCGoals(goals, period) {
    const list = document.getElementById('mcGoalList');
    list.innerHTML = goals.map((g, i) => {
        const cat = mcCatInfo(g.category);
        const risk = mcRisk(g, period.departureDate);
        const statusClass = risk;
        const stDone = (g.subTasks || []).filter(s => s.done).length;
        const stTotal = (g.subTasks || []).length;
        const expanded = mcExpandedGoal === i;

        let html = `<div class="mc-goal-row" onclick="mcToggleGoal(${i})">
            <span class="mc-goal-icon">${cat.icon}</span>
            <span class="mc-goal-title">${esc(g.title_jp || g.title)}${stTotal ? ` <small>${stDone}/${stTotal}</small>` : ''}</span>
            <span class="mc-status ${statusClass}">${mcRiskLabel(risk)}</span>
            <span class="mc-goal-assignee">${esc(g.assignee)}</span>
            <span class="mc-goal-date">${mcFormatDate(g.targetDate)}</span>
        </div>`;

        if (expanded) {
            const subtasksHtml = (g.subTasks || []).map((s, si) =>
                `<div class="mc-subtask-row${s.done ? ' done' : ''}">
                    <input type="checkbox" ${s.done ? 'checked' : ''} onchange="mcToggleSubtask(${i},${si},this.checked)">
                    <span>${esc(s.title)}</span>
                </div>`
            ).join('');
            html += `<div class="mc-goal-expanded">
                ${subtasksHtml}
                <div class="mc-subtask-add" onclick="mcAddSubtaskInline(${i})">+ サブタスク追加</div>
                <div class="mc-goal-actions">
                    <button class="small-btn" onclick="mcEditGoal(${i})">編集</button>
                    <button class="small-btn danger" onclick="mcDeleteGoal(${i})">削除</button>
                </div>
            </div>`;
        }
        return html;
    }).join('');
}

// ─── Interactions ────────────────────────────────────────
function mcSwitchPeriod(idx) { mcPIdx = idx; mcExpandedGoal = -1; renderMC(); }

function mcToggleGoal(idx) {
    mcExpandedGoal = mcExpandedGoal === idx ? -1 : idx;
    const period = mcData[mcPIdx];
    renderMCGoals(period.goals || [], period);
}

function mcScrollToGoal(idx) {
    mcExpandedGoal = idx;
    const period = mcData[mcPIdx];
    renderMCGoals(period.goals || [], period);
    setTimeout(() => {
        const rows = document.querySelectorAll('.mc-goal-row');
        if (rows[idx]) rows[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
}

async function mcToggleSubtask(gIdx, sIdx, checked) {
    const period = mcData[mcPIdx];
    const goal = period.goals[gIdx];
    goal.subTasks[sIdx].done = checked;
    try {
        await fetch(`/api/projects/${currentProject}/milestones/periods/${mcPIdx}/goals/${gIdx}/subtasks`, {
            method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ subTasks: goal.subTasks })
        });
        // If all subtasks done, auto-complete goal
        if (goal.subTasks.length && goal.subTasks.every(s => s.done) && goal.status !== 'completed') {
            goal.status = 'completed';
            await fetch(`/api/projects/${currentProject}/milestones/periods/${mcPIdx}/goals/${gIdx}`, {
                method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'completed' })
            });
        }
    } catch {}
    renderMC();
}

function mcAddSubtaskInline(gIdx) {
    const title = prompt('サブタスク名:');
    if (!title) return;
    const period = mcData[mcPIdx];
    const goal = period.goals[gIdx];
    goal.subTasks = goal.subTasks || [];
    goal.subTasks.push({ id: 's_' + Date.now().toString(36), title, done: false });
    fetch(`/api/projects/${currentProject}/milestones/periods/${mcPIdx}/goals/${gIdx}/subtasks`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ subTasks: goal.subTasks })
    }).then(() => renderMC());
}

// ─── Goal CRUD ───────────────────────────────────────────
function mcShowGoalForm(gIdx) {
    const form = document.getElementById('mcGoalForm');
    form.style.display = '';
    document.getElementById('mcgf-gIdx').value = gIdx;

    // Populate category dropdown
    const sel = document.getElementById('mcgf-category');
    sel.innerHTML = mcCats.map(c => `<option value="${c.key}">${c.icon} ${c.jp}</option>`).join('');

    if (gIdx >= 0) {
        const g = mcData[mcPIdx].goals[gIdx];
        document.getElementById('mcgf-title-jp').value = g.title_jp || '';
        document.getElementById('mcgf-title').value = g.title || '';
        sel.value = g.category || '';
        document.getElementById('mcgf-target-date').value = g.targetDate || '';
        document.getElementById('mcgf-assignee').value = g.assignee || '';
        document.getElementById('mcgf-status').value = g.status || 'planned';
        document.getElementById('mcgf-note').value = g.note || '';
    } else {
        ['mcgf-title-jp','mcgf-title','mcgf-target-date','mcgf-assignee','mcgf-note'].forEach(id =>
            document.getElementById(id).value = '');
        document.getElementById('mcgf-status').value = 'planned';
    }
    form.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('mcAddGoalBtn')?.addEventListener('click', () => mcShowGoalForm(-1));
document.getElementById('mcGoalCancelBtn')?.addEventListener('click', () => {
    document.getElementById('mcGoalForm').style.display = 'none';
});

function mcEditGoal(idx) { mcShowGoalForm(idx); }

document.getElementById('mcGoalSaveBtn')?.addEventListener('click', async () => {
    const gIdx = parseInt(document.getElementById('mcgf-gIdx').value);
    const body = {
        title: document.getElementById('mcgf-title').value,
        title_jp: document.getElementById('mcgf-title-jp').value,
        category: document.getElementById('mcgf-category').value,
        targetDate: document.getElementById('mcgf-target-date').value,
        assignee: document.getElementById('mcgf-assignee').value,
        status: document.getElementById('mcgf-status').value,
        note: document.getElementById('mcgf-note').value,
    };
    if (!body.title_jp && !body.title) { alert('タイトルを入力してください'); return; }

    const url = gIdx >= 0
        ? `/api/projects/${currentProject}/milestones/periods/${mcPIdx}/goals/${gIdx}`
        : `/api/projects/${currentProject}/milestones/periods/${mcPIdx}/goals`;
    const method = gIdx >= 0 ? 'PATCH' : 'POST';
    try {
        const res = await fetch(url, { method, headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error();
        showToast(gIdx >= 0 ? '更新しました' : '追加しました');
    } catch { showToast('エラーが発生しました', 'error'); return; }
    document.getElementById('mcGoalForm').style.display = 'none';
    await loadMilestonesTab();
});

async function mcDeleteGoal(gIdx) {
    if (!confirm('このタスクを削除しますか？')) return;
    try {
        await fetch(`/api/projects/${currentProject}/milestones/periods/${mcPIdx}/goals/${gIdx}`, {
            method: 'DELETE', headers: authHeaders()
        });
        showToast('削除しました');
    } catch { showToast('エラー', 'error'); }
    mcExpandedGoal = -1;
    await loadMilestonesTab();
}

// ─── Period CRUD ─────────────────────────────────────────
document.getElementById('mcAddPeriodBtn')?.addEventListener('click', () => mcShowPeriodForm(false));
document.getElementById('mcEditPeriodBtn')?.addEventListener('click', () => mcShowPeriodForm(true));
document.getElementById('mcPeriodCancelBtn')?.addEventListener('click', () => {
    document.getElementById('mcPeriodForm').style.display = 'none';
});

function mcShowPeriodForm(isEdit) {
    const form = document.getElementById('mcPeriodForm');
    form.style.display = '';
    document.getElementById('mcPeriodDeleteBtn').style.display = isEdit ? '' : 'none';

    if (isEdit && mcData[mcPIdx]) {
        const p = mcData[mcPIdx];
        document.getElementById('mcpf-title-jp').value = p.title_jp || '';
        document.getElementById('mcpf-title').value = p.title || '';
        document.getElementById('mcpf-period').value = p.period || '';
        document.getElementById('mcpf-departure').value = p.departureDate || '';
        document.getElementById('mcpf-return').value = p.returnDate || '';
    } else {
        ['mcpf-title-jp','mcpf-title','mcpf-period','mcpf-departure','mcpf-return'].forEach(id =>
            document.getElementById(id).value = '');
    }
    form.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('mcPeriodSaveBtn')?.addEventListener('click', async () => {
    const title_jp = document.getElementById('mcpf-title-jp').value;
    const title = document.getElementById('mcpf-title').value;
    const period = document.getElementById('mcpf-period').value;
    const departureDate = document.getElementById('mcpf-departure').value;
    const returnDate = document.getElementById('mcpf-return').value;

    if (!title_jp || !period || !departureDate) { alert('ミッション名(日)・期間・出発日は必須です'); return; }
    if (!/^\d{4}\.\d{2}$/.test(period)) { alert('期間はYYYY.MM形式で入力してください'); return; }

    const isEdit = document.getElementById('mcPeriodDeleteBtn').style.display !== 'none';
    const url = isEdit
        ? `/api/projects/${currentProject}/milestones/periods/${mcPIdx}`
        : `/api/projects/${currentProject}/milestones/periods`;
    const method = isEdit ? 'PATCH' : 'POST';

    try {
        const res = await fetch(url, {
            method, headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ period, departureDate, returnDate, title, title_jp })
        });
        if (!res.ok) throw new Error();
        showToast(isEdit ? '更新しました' : '作成しました');
    } catch { showToast('エラーが発生しました', 'error'); return; }
    document.getElementById('mcPeriodForm').style.display = 'none';
    await loadMilestonesTab();
});

document.getElementById('mcPeriodDeleteBtn')?.addEventListener('click', async () => {
    if (!confirm('このミッションを削除しますか？全タスクも削除されます。')) return;
    try {
        await fetch(`/api/projects/${currentProject}/milestones/periods/${mcPIdx}`, {
            method: 'DELETE', headers: authHeaders()
        });
        showToast('削除しました');
    } catch { showToast('エラー', 'error'); }
    mcPIdx = 0;
    document.getElementById('mcPeriodForm').style.display = 'none';
    await loadMilestonesTab();
});

// ─── Helper (escape HTML) ────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
```

- [ ] **Step 2: Verify the `showToast` and `authHeaders` functions exist in admin.js**

Search admin.js for these utility functions that the new code depends on. They should already exist from the current admin implementation.

- [ ] **Step 3: Update the milestone tab loader call**

Find where `loadMilestonesTab()` is called when the milestones tab is clicked (likely in the tab switching logic). Ensure it still calls `loadMilestonesTab()` — the function name is unchanged.

- [ ] **Step 4: Commit**

```bash
git add admin.js
git commit -m "feat: admin milestone JS — Mission Control dashboard logic"
```

---

## Task 5: Public HTML + JS — Simplified Milestone View

**Files:**
- Modify: `project.html:152-186` (replace milestone tab content)
- Modify: `project.js:387-607` (replace milestone rendering)

- [ ] **Step 1: Replace milestone tab HTML in project.html**

Replace lines 152-186 (the `#tab-milestones` section):

```html
<!-- ─── Milestones ─────────────────────────────────────── -->
<div class="tab-panel" id="tab-milestones" style="display:none;">
    <div class="pub-ms-period-selector" id="pubMsPeriods"></div>
    <div class="pub-ms-container" id="pubMsContainer" style="display:none;">
        <div class="pub-ms-header">
            <div class="pub-ms-header-left">
                <h3 class="pub-ms-title" id="pubMsTitle"></h3>
            </div>
            <div class="pub-ms-header-right">
                <span class="pub-ms-dday" id="pubMsDday"></span>
                <span class="pub-ms-pct" id="pubMsPct"></span>
            </div>
        </div>
        <div class="pub-ms-progress"><div class="pub-ms-progress-fill" id="pubMsFill"></div></div>
        <div class="pub-ms-goals" id="pubMsGoals"></div>
    </div>
    <div class="pub-ms-empty" id="pubMsEmpty">No milestones yet.</div>
</div>
```

- [ ] **Step 2: Replace milestone JS in project.js**

Replace lines 387-607 (all milestone functions) with:

```javascript
/* ═══════════════════════════════════════════════════════════
   PUBLIC MILESTONES — Simplified View
   ═══════════════════════════════════════════════════════════ */

let pubMsData = [];
let pubMsCats = [];
let pubMsPIdx = 0;

function pubMsRisk(goal) {
    if (goal.status === 'completed') return 'done';
    if (!goal.targetDate) return 'planned';
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
            fetch(`/api/projects/${id}/milestones`),
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

    // Period selector
    document.getElementById('pubMsPeriods').innerHTML = pubMsData.length > 1
        ? pubMsData.map((p, i) =>
            `<button class="pub-ms-period-btn${i === pubMsPIdx ? ' active' : ''}" onclick="pubMsSwitchPeriod(${i})">${escCard(p.title || p.period)}</button>`
        ).join('')
        : '';

    if (!has) return;

    const period = pubMsData[pubMsPIdx];
    const goals = period.goals || [];

    // Header
    document.getElementById('pubMsTitle').textContent = period.title || period.title_jp || period.period;

    const daysLeft = period.departureDate
        ? Math.ceil((new Date(period.departureDate) - new Date().setHours(0,0,0,0)) / 86400000)
        : null;
    const ddayEl = document.getElementById('pubMsDday');
    if (daysLeft !== null) {
        ddayEl.textContent = daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? 'D-Day' : `D+${Math.abs(daysLeft)}`;
        ddayEl.className = 'pub-ms-dday ' + (daysLeft < 0 ? 'past' : daysLeft <= 7 ? 'urgent' : daysLeft <= 14 ? 'warning' : 'normal');
    } else { ddayEl.textContent = ''; }

    const done = goals.filter(g => g.status === 'completed').length;
    const pct = goals.length ? Math.round(done / goals.length * 100) : 0;
    document.getElementById('pubMsPct').textContent = pct + '%';
    document.getElementById('pubMsFill').style.width = pct + '%';

    // Goals
    document.getElementById('pubMsGoals').innerHTML = goals.map(g => {
        const cat = pubMsCatInfo(g.category);
        const risk = pubMsRisk(g);
        const stDone = (g.subTasks || []).filter(s => s.done).length;
        const stTotal = (g.subTasks || []).length;
        const stPct = stTotal ? Math.round(stDone / stTotal * 100) : 0;

        return `<div class="pub-ms-goal">
            <div class="pub-ms-goal-top">
                <span class="pub-ms-goal-icon">${cat.icon}</span>
                <span class="pub-ms-goal-title">${escCard(g.title || g.title_jp || '')}</span>
                <span class="pub-ms-status ${risk}">${pubMsRiskLabel(risk)}</span>
                <span class="pub-ms-goal-assignee">${escCard(g.assignee)}</span>
            </div>
            ${stTotal ? `<div class="pub-ms-goal-bar-wrap">
                <div class="pub-ms-goal-bar"><div class="pub-ms-goal-bar-fill" style="width:${stPct}%"></div></div>
                <span class="pub-ms-goal-bar-label">${stDone}/${stTotal} tasks</span>
            </div>` : ''}
        </div>`;
    }).join('') || '<div class="pub-ms-empty">No goals yet.</div>';
}

function pubMsSwitchPeriod(idx) { pubMsPIdx = idx; renderPubMs(); }
```

- [ ] **Step 3: Update the milestone tab click handler**

Find where the milestones tab button triggers loading (look for `data-tab="milestones"` click handler). Ensure it calls `loadMilestones()`.

- [ ] **Step 4: Commit**

```bash
git add project.html project.js
git commit -m "feat: public milestone view — D-day, progress, risk indicators"
```

---

## Task 6: Public CSS — Milestone Styles

**Files:**
- Modify: `project.css:2043-2253` (replace milestone styles)

- [ ] **Step 1: Replace milestone CSS section**

Replace lines 2043-2253 with:

```css
/* ═══════════════════════════════════════════════════════════
   PUBLIC MILESTONES
   ═══════════════════════════════════════════════════════════ */

.pub-ms-period-selector { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.pub-ms-period-btn {
    padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;
    background: transparent; color: rgba(255,255,255,0.4);
    border: 1px solid rgba(255,255,255,0.12); cursor: pointer; transition: all 0.2s;
}
.pub-ms-period-btn:hover { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.25); }
.pub-ms-period-btn.active { background: var(--gold); color: var(--navy-deep); border-color: var(--gold); }

.pub-ms-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.pub-ms-title { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
.pub-ms-header-right { display: flex; align-items: center; gap: 10px; }
.pub-ms-dday {
    font-size: 16px; font-weight: 800; font-family: 'Outfit', sans-serif;
    padding: 3px 12px; border-radius: 6px;
}
.pub-ms-dday.urgent { background: #E53E3E; color: #fff; }
.pub-ms-dday.warning { background: #ED8936; color: #1a1a1a; }
.pub-ms-dday.normal { background: rgba(212,175,55,0.15); color: var(--gold); }
.pub-ms-dday.past { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); }
.pub-ms-pct { font-size: 16px; font-weight: 700; color: var(--gold); }

.pub-ms-progress { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-bottom: 24px; }
.pub-ms-progress-fill { height: 100%; background: var(--gold); border-radius: 2px; transition: width 0.6s ease; }

.pub-ms-goal { padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.pub-ms-goal:last-child { border-bottom: none; }
.pub-ms-goal-top { display: flex; align-items: center; gap: 10px; }
.pub-ms-goal-icon { font-size: 16px; flex-shrink: 0; }
.pub-ms-goal-title { flex: 1; font-size: 15px; font-weight: 600; color: #fff; }
.pub-ms-goal-assignee { font-size: 12px; color: rgba(255,255,255,0.35); }

.pub-ms-status {
    font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0;
}
.pub-ms-status.done { border: 1px solid var(--gold); color: var(--gold); }
.pub-ms-status.in-progress { border: 1px solid rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); }
.pub-ms-status.planned { border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.25); }
.pub-ms-status.overdue { background: #E53E3E; color: #fff; border: none; }
.pub-ms-status.at-risk { background: #ED8936; color: #1a1a1a; border: none; }

.pub-ms-goal-bar-wrap { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding-left: 26px; }
.pub-ms-goal-bar { flex: 1; height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; max-width: 200px; }
.pub-ms-goal-bar-fill { height: 100%; background: var(--gold); border-radius: 2px; transition: width 0.4s; }
.pub-ms-goal-bar-label { font-size: 11px; color: rgba(255,255,255,0.3); }

.pub-ms-empty { text-align: center; padding: 40px 20px; color: rgba(255,255,255,0.3); font-size: 14px; }

@media (max-width: 768px) {
    .pub-ms-goal-assignee { display: none; }
    .pub-ms-header { flex-direction: column; align-items: flex-start; gap: 8px; }
}
```

- [ ] **Step 2: Commit**

```bash
git add project.css
git commit -m "feat: public milestone CSS — simplified D-day progress view"
```

---

## Task 7: Deploy and Verify

- [ ] **Step 1: Test locally**

```bash
node server.js
# Open http://localhost:8000/admin.html → login → select project → Milestones tab
# Create a new mission with departure date
# Add goals with different statuses and target dates
# Verify attention cards, summary bars, goal list
# Open http://localhost:8000/project.html?id=mongolia → Milestones tab
# Verify English-only display, D-day, progress bars
```

- [ ] **Step 2: Deploy to Vercel**

```bash
vercel --prod
```

- [ ] **Step 3: Verify on production**

```bash
curl -s https://axis-homepage.vercel.app/api/health
# Visit https://axis-homepage.vercel.app/admin.html and test full workflow
# Visit https://axis-homepage.vercel.app/project.html?id=mongolia → Milestones
```

- [ ] **Step 4: Final commit with all changes**

```bash
git add -A
git commit -m "feat: milestone Mission Control — complete redesign"
```
