# Milestone "Mission Control" Redesign

## Context

The current milestone feature is a generic period → goal → subtask hierarchy. It requires multiple clicks to understand preparation status and offers no urgency signals. Team members have no reason to use it over Notion/Trello.

The redesign transforms milestones into a **departure-countdown dashboard** — purpose-built for expedition preparation. Opening it immediately answers: "How many days until departure, what percentage is done, and what's at risk?"

## Language Rule

- **Public page (project.html)**: English only. All goal titles, status labels, category names, UI text rendered in English.
- **Admin page (admin.html)**: Japanese-first for member convenience. Form labels, placeholders, button text, confirmation messages in Japanese. Category labels show Japanese names. Goal/subtask titles are entered by members in whatever language they prefer (typically Japanese).
- **Data model**: Goals keep both `title` (English, for public display) and `title_jp` (Japanese, for admin use). Members fill in `title_jp` as their primary input; `title` (English) is optional and used on the public page. If `title` is empty, `title_jp` is shown on public page as fallback.

## Data Model Changes

### Period (extended)

```
period {
  period: "2025.08",              // existing
  departureDate: "2025-08-15",    // NEW: departure date (required)
  returnDate: "2025-08-25",       // NEW: return date (optional)
  title: "Mongolia Summer 2025",  // NEW: English title (for public page)
  title_jp: "モンゴル夏合宿 2025", // NEW: Japanese title (for admin)
  goals: [ ... ]                  // existing
}
```

### Goal (updated)

```
goal {
  id: "g_...",
  title: "Flight Booking",         // English (for public page, optional)
  title_jp: "航空券予約",          // Japanese (primary input by members)
  category: "flights",
  targetDate: "2025-08-01",
  assignee: "Shota Tanaka",         // English only (alphabetic input enforced)
  note: "",
  status: "planned" | "in_progress" | "completed",
  subTasks: [
    { id: "s_...", title: "航空会社に連絡", done: boolean },
    ...
  ]
}
```

Changes:
- `title_en` → `title` (rename for consistency)
- `title_jp` kept as primary input field for members
- Subtask simplified: `{ id, title, done }` instead of `{ id, title_en, title_jp, status }`
- `done: boolean` replaces 3-state status for subtasks (simpler toggling)
- Subtask `title` is free-text (members typically write in Japanese)

### Risk Level (computed, not stored)

Calculated client-side from `targetDate`, `status`, and `departureDate`:

| Condition | Risk |
|-----------|------|
| `status === "completed"` | DONE (green) |
| `targetDate` has passed + not completed | OVERDUE (red) |
| `targetDate` within 7 days + not completed | AT RISK (orange) |
| Otherwise | ON TRACK (default) |

No new API fields needed.

## Admin UI: Mission Control Dashboard

### Layout (single screen, no tabs needed for period content)

```
┌─────────────────────────────────────────────────────────┐
│ Period tabs: [2025.08 モンゴル夏合宿] [2025.03 ネパール]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  HEADER                                                 │
│  Mission title · 出発日/帰国日 · D-day countdown        │
│  Full-width progress bar with percentage                │
│                                                         │
│  要注意 SECTION (auto-filtered)                         │
│  Red/orange cards for 期限超過 and 要注意 goals only    │
│  Hidden when everything is on track                     │
│                                                         │
│  SUMMARY ROW                                            │
│  Left: メンバー別 progress bars                         │
│  Right: カテゴリ別 progress bars                        │
│                                                         │
│  全タスク LIST                                          │
│  Rows: icon · title_jp · status · assignee · date       │
│  Click row → inline expand with subtask checklist       │
│  [+ タスク追加] button                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Header

- Mission title large and bold
- "D-23" countdown badge (red if <7 days, orange if <14, default otherwise)
- Date range: "8月15日 – 8月25日, 2025"
- Progress bar: completed goals / total goals percentage
- 「編集」button to change title, departureDate, returnDate

### Attention Section (要注意)

- Auto-filters goals where risk is OVERDUE or AT RISK
- Each card shows: category icon, goal title_jp, risk badge, assignee, due date
- Risk badges in Japanese: 「期限超過」(OVERDUE), 「要注意」(AT RISK)
- Click card → scrolls to that goal in the list below
- If no attention items: shows 「順調に進行中 ✓」

### Summary Row

Two side-by-side mini dashboards:

**メンバー別 (By Member):**
- Each unique assignee gets a row
- Progress bar: their completed goals / their total goals
- Shota Tanaka · bar · "3/5"

**カテゴリ別 (By Category):**
- Each category with goals gets a row
- Progress bar: completed / total in that category
- ✈ 航空券 · bar · "2/3"

### All Goals List (全タスク)

- Table-like rows, each showing: category icon, title_jp, status badge, assignee, target date
- Status badges: 完了 (gold), 進行中 (white), 未着手 (gray), 期限超過 (red), 要注意 (orange)
- Click row → expands inline to show:
  - Subtask checklist (checkbox + title, click to toggle done)
  - メモ field (editable)
  - 「編集」/「削除」buttons
- 「+ タスク追加」opens inline form at the top of the list
- Goal form fields: タイトル(日), Title(EN, optional), カテゴリ (dropdown), 期日, 担当者, ステータス

### Period Management

- Period tabs at the top (shows title instead of just YYYY.MM)
- 「+ 新規ミッション」button opens form: ミッション名, 期間(YYYY.MM), 出発日, 帰国日
- Delete period via 「削除」in context menu on the tab

## Public UI: Project Page Milestone Tab

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Mongolia Summer 2025                  D-23 · 72%    │
│  ■■■■■■■□□□                                          │
│                                                      │
│  ✈ Flight Booking ········ In Progress · S. Tanaka   │
│    ■■■□ 2/4 tasks                                    │
│                                                      │
│  □ Visa Application ······ At Risk · M. Sato         │
│    ■■□□ 1/3 tasks                                    │
│                                                      │
│  ◎ Fundraising Plan ······ Done · D. Suzuki          │
│    ■■■■ 4/4 tasks                                    │
│                                                      │
│  ◇ Hotel Booking ········· Planned · S. Tanaka       │
│    □□□ 0/2 tasks                                     │
└──────────────────────────────────────────────────────┘
```

### What's shown (public)

- Mission title + D-day + overall progress bar
- Each goal: title, status badge, assignee name, subtask progress (count + mini bar)
- Period selector if multiple periods exist
- OVERDUE/AT RISK visual indicators (same color coding)

### What's hidden (private)

- Individual subtask titles and details
- Notes
- Edit/delete controls (admin only)

## API Changes

### Period creation/update

**POST /api/projects/:id/milestones/periods** — add fields:
- `departureDate` (required, YYYY-MM-DD)
- `returnDate` (optional, YYYY-MM-DD)
- `title` (required, English title for public)
- `title_jp` (required, Japanese title for admin)

**PATCH /api/projects/:id/milestones/periods/:pIdx** — NEW endpoint:
- Can update `title`, `title_jp`, `departureDate`, `returnDate`

### Goal changes

- `title_en` → `title` (rename for consistency)
- `title_jp` kept as primary admin-facing field
- Subtask format: `{ title, done }` instead of `{ title_en, title_jp, status }`

### Backward compatibility

Migration logic in the API: if a goal has `title_en` but no `title`, use `title_en` as `title`. If a goal has no `title_jp`, fall back to `title`. This handles existing data without a migration script.

## CSS/Design Language

Follows existing Axis design system (navy backgrounds, gold accents) with additions:

| Element | Color |
|---------|-------|
| DONE badge | Gold border + gold text (`--gold`) |
| IN PROGRESS badge | White border + white text |
| PLANNED badge | Gray, low opacity |
| OVERDUE badge | `#E53E3E` background, white text |
| AT RISK badge | `#ED8936` background, dark text |
| D-day countdown (< 7 days) | Red background |
| D-day countdown (< 14 days) | Orange background |
| D-day countdown (normal) | Gold on navy |
| Progress bar fill | Gold (`--gold`) |
| Attention card border | Left border matches risk color |

## Files to Modify

| File | Change |
|------|--------|
| `admin.html` | Milestone tab HTML: header, attention, summary, goals list |
| `admin.js` | Mission control rendering logic, inline editing, risk calculation |
| `admin.css` | New dashboard styles, attention cards, summary bars |
| `project.html` | Simplified public milestone view |
| `project.js` | Public rendering with progress bars, risk indicators |
| `project.css` | Public milestone styles |
| `api/index.js` | Period fields (title, departureDate, returnDate), goal field rename, new PATCH period endpoint |

## Verification

1. Admin: Create mission with Japanese title + departure date → verify D-day countdown in Japanese UI
2. Admin: Add goals with title_jp as primary → verify Japanese labels throughout admin
3. Admin: Set various target dates → verify 期限超過/要注意 auto-detection
4. Admin: Assign goals to members (Japanese names) → verify メンバー別 summary
5. Admin: Toggle subtask checkboxes → verify progress updates
6. Admin: Edit/delete goals and periods via Japanese UI
7. Public: View milestone tab → verify English title, D-day, progress, goal list
8. Public: Assignee names shown as-is (Japanese names are OK on public page)
9. Public: Verify subtask titles are NOT shown, only counts
10. API: Test backward compat — goals with title_en should map to title
