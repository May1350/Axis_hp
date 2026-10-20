/**
 * Axis ミッション進捗管理 — サイドバー (サブタスク管理 + 新規タスク追加)
 *
 * 機能:
 *   ・選択中のタスク行のサブタスク (H列) を即座にサイドバーで表示
 *   ・サブタスク: 追加 / 編集 / 削除 / 完了切替
 *   ・進捗バー (X/Y 完了)
 *   ・**新規タスク行を追加** — 日付・カテゴリ・タスク・担当・優先度・備考を入力
 *     → 既存行の中の正しい日付位置に自動挿入される
 *
 * インストール (1回限り):
 *   1. Google Sheets で [拡張機能] → [Apps Script]
 *   2. 既定の Code.gs を全削除 → このファイル全文を貼り付け
 *   3. Cmd+S 保存 → Sheets タブで Cmd+R リロード
 *   4. メニュー [🔘 サブタスク] → [サイドバーを開く]
 *   5. 初回のみ権限承認
 */

const HCOL = 8;          // H = 備考・詳細
const TASK_COL = 4;      // D = タスク
const DATE_COL = 1;      // A = 日付
const CATEGORY_COL = 3;  // C = カテゴリ
const ASSIGNEE_COL = 5;  // E = 担当
const DONE_COL = 6;      // F = 完了
const PRIORITY_COL = 7;  // G = 優先度
const HEADER_ROW_END = 7;
const DATA_START_ROW = 8;

const CATEGORIES = ['書類', '会計', '物品', '広報', '当日運営', 'その他'];
const PRIORITIES = ['高', '中', '低'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Task Management')
    .addItem('Open Sidebar', 'showSubtaskSidebar')
    .addToUi();
}

function showSubtaskSidebar() {
  const html = HtmlService.createHtmlOutput(getSidebarHtml())
    .setTitle('Task Management');
  SpreadsheetApp.getUi().showSidebar(html);
}

// ─────────────────────────────────────────────
// Server: current selection
// ─────────────────────────────────────────────
function getCurrentSelection() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cell = ss.getActiveCell();
    const sheet = cell.getSheet();
    const sheetName = sheet.getName();
    const row = cell.getRow();

    // ミッションシート判定: 7行目 D列に「タスク」ヘッダーがあるか
    const isMission = String(sheet.getRange(7, TASK_COL).getValue() || '').indexOf('タスク') !== -1;

    if (!isMission) {
      return { ok: false, reason: 'not_mission_sheet', sheetName: sheetName, isMission: false };
    }
    if (row <= HEADER_ROW_END) {
      return { ok: false, reason: 'header_row', sheetName: sheetName, row: row, isMission: true };
    }
    const taskName = String(sheet.getRange(row, TASK_COL).getValue() || '').trim();
    if (!taskName) {
      return { ok: false, reason: 'empty_row', sheetName: sheetName, row: row, isMission: true };
    }

    const dateVal = sheet.getRange(row, DATE_COL).getValue();
    let dateStr = '';
    if (dateVal instanceof Date) {
      dateStr = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'M/d (E)');
    } else if (dateVal) {
      dateStr = String(dateVal);
    }
    const assignee = String(sheet.getRange(row, ASSIGNEE_COL).getValue() || '');
    const parentDone = sheet.getRange(row, DONE_COL).getValue() === true;
    const priority = String(sheet.getRange(row, PRIORITY_COL).getValue() || '');

    const hCell = sheet.getRange(row, HCOL);
    const hText = String(hCell.getValue() || '');
    const lines = hText === '' ? [] : hText.split('\n');

    const items = [];
    const notes = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ch = line.charAt(0);
      if (ch === '☐' || ch === '☑') {
        items.push({ idx: i, text: line.substr(1).trim(), done: ch === '☑' });
      } else if (line.trim() !== '') {
        notes.push({ idx: i, text: line });
      }
    }

    return {
      ok: true,
      sheetName: sheetName, row: row, taskName: taskName,
      dateStr: dateStr, assignee: assignee, parentDone: parentDone, priority: priority,
      items: items, notes: notes,
      isMission: true,
    };
  } catch (e) {
    return { ok: false, reason: 'error', message: String(e) };
  }
}

// ─────────────────────────────────────────────
// Server: dropdown options (categories / assignees / priorities)
// 担当者は3段階フォールバック:
//   ① E8セルの データの入力規則 を読む (本来の参照)
//   ② ①が失敗時 → ミッションシート名から国名抽出 → メンバー_<国名> シートを検索
//   ③ ②も失敗時 → "メンバー_" で始まる任意のシートを列挙して返す (将来の新国対応)
// ─────────────────────────────────────────────
function getSheetOptions(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { categories: CATEGORIES.slice(), priorities: PRIORITIES.slice(), assignees: [], source: 'no_sheet' };
  }

  let assignees = [];
  let source = 'none';

  // ── Strategy 1: E8 のデータ入力規則を読み取る ──
  try {
    const dv = sheet.getRange(DATA_START_ROW, ASSIGNEE_COL).getDataValidation();
    if (dv) {
      const cv = dv.getCriteriaValues();
      if (cv && cv.length > 0) {
        const first = cv[0];
        if (first && typeof first.getValues === 'function') {
          // VALUE_IN_RANGE → first は Range オブジェクト
          assignees = first.getValues()
            .map(function(r) { return r[0]; })
            .filter(function(v) { return v != null && String(v).trim() !== ''; });
          if (assignees.length > 0) source = 'dv_range';
        } else if (Array.isArray(first)) {
          // VALUE_IN_LIST → first は配列
          assignees = first.slice().filter(function(v) { return v != null && String(v).trim() !== ''; });
          if (assignees.length > 0) source = 'dv_list';
        }
      }
    }
  } catch (e) { /* continue to Strategy 2 */ }

  // ── Strategy 2: シート名パターンから国名抽出 → メンバー_<国名> シート ──
  if (assignees.length === 0) {
    const country = _extractCountry(sheetName);
    if (country) {
      const memberSheet = ss.getSheetByName('メンバー_' + country);
      if (memberSheet) {
        assignees = _readMemberNames(memberSheet);
        if (assignees.length > 0) source = 'pattern:' + country;
      }
    }
  }

  // ── Strategy 3: 全シート走査して "メンバー_" で始まる最初のシートを使用 ──
  if (assignees.length === 0) {
    const allSheets = ss.getSheets();
    for (let i = 0; i < allSheets.length; i++) {
      const name = allSheets[i].getName();
      if (name.indexOf('メンバー_') === 0) {
        assignees = _readMemberNames(allSheets[i]);
        if (assignees.length > 0) {
          source = 'fallback:' + name;
          break;
        }
      }
    }
  }

  return {
    categories: CATEGORIES.slice(),
    priorities: PRIORITIES.slice(),
    assignees: assignees,
    source: source,  // デバッグ用 (どのStrategyで取得できたか)
  };
}

// ミッションシート名 (例: "2026夏_モンゴル", "2027春_インドネシア") から
// 末尾の "_" 以降を国名として抽出。アンダースコアが無いと null を返す
function _extractCountry(sheetName) {
  if (!sheetName) return null;
  const idx = sheetName.lastIndexOf('_');
  if (idx === -1 || idx === sheetName.length - 1) return null;
  return sheetName.substr(idx + 1);
}

// メンバーシートからA列5行目以降の名前を抽出 (空・空白のみは除外)
function _readMemberNames(memberSheet) {
  const lastRow = memberSheet.getLastRow();
  if (lastRow < 5) return [];
  const range = memberSheet.getRange(5, 1, lastRow - 4, 1);
  return range.getValues()
    .map(function(r) { return r[0]; })
    .filter(function(v) { return v != null && String(v).trim() !== ''; });
}

// ─────────────────────────────────────────────
// Subtask CRUD (H列)
// ─────────────────────────────────────────────
function _getHCell(sheetName, row) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return null;
  return sheet.getRange(row, HCOL);
}

function toggleSubtask(sheetName, row, lineIdx) {
  const cell = _getHCell(sheetName, row);
  if (!cell) return false;
  const lines = String(cell.getValue() || '').split('\n');
  if (lineIdx < 0 || lineIdx >= lines.length) return false;
  const ch = lines[lineIdx].charAt(0);
  if (ch === '☐') lines[lineIdx] = '☑' + lines[lineIdx].substr(1);
  else if (ch === '☑') lines[lineIdx] = '☐' + lines[lineIdx].substr(1);
  else return false;
  cell.setValue(lines.join('\n'));
  return true;
}

function addSubtask(sheetName, row, text) {
  text = String(text || '').trim();
  if (!text) return false;
  const cell = _getHCell(sheetName, row);
  if (!cell) return false;
  const current = String(cell.getValue() || '');
  const newLine = '☐ ' + text;
  cell.setValue(current ? current + '\n' + newLine : newLine);
  return true;
}

function editSubtask(sheetName, row, lineIdx, newText) {
  newText = String(newText || '').trim();
  if (!newText) return false;
  const cell = _getHCell(sheetName, row);
  if (!cell) return false;
  const lines = String(cell.getValue() || '').split('\n');
  if (lineIdx < 0 || lineIdx >= lines.length) return false;
  const ch = lines[lineIdx].charAt(0);
  const prefix = (ch === '☐' || ch === '☑') ? ch + ' ' : '';
  lines[lineIdx] = prefix + newText;
  cell.setValue(lines.join('\n'));
  return true;
}

function deleteSubtask(sheetName, row, lineIdx) {
  const cell = _getHCell(sheetName, row);
  if (!cell) return false;
  const lines = String(cell.getValue() || '').split('\n');
  if (lineIdx < 0 || lineIdx >= lines.length) return false;
  lines.splice(lineIdx, 1);
  cell.setValue(lines.join('\n'));
  return true;
}

// ─────────────────────────────────────────────
// New: insert a task row, sorted by date
// ─────────────────────────────────────────────
function addTaskRow(sheetName, dateStr, category, task, assignee, priority, notes) {
  task = String(task || '').trim();
  if (!task) return { ok: false, error: 'タスク名は必須です' };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: 'シートが見つかりません: ' + sheetName };

  // Parse date (YYYY-MM-DD)
  let newDate = null;
  if (dateStr) {
    const parts = String(dateStr).split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      newDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }

  // 挿入位置を検索: 既存の日付 > newDate となる最初の行
  const lastRow = sheet.getLastRow();
  let lastDataRow = DATA_START_ROW - 1;
  let insertRow = -1;

  if (lastRow >= DATA_START_ROW) {
    const range = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 4);
    const values = range.getValues();
    for (let i = 0; i < values.length; i++) {
      const r = DATA_START_ROW + i;
      const dVal = values[i][0];
      const tVal = values[i][3];
      if (tVal) lastDataRow = r;
      if (insertRow === -1 && newDate && dVal instanceof Date && dVal.getTime() > newDate.getTime()) {
        insertRow = r;
      }
    }
  }

  if (insertRow === -1) {
    // 全既存行が新日付以前 (or newDate なし) → 末尾に追加
    insertRow = Math.max(lastDataRow + 1, DATA_START_ROW);
  }

  // 既存行があるなら新規行を挿入してシフト、なければそのまま書き込み
  if (insertRow <= lastRow) {
    sheet.insertRowBefore(insertRow);
  }

  // 値書き込み
  if (newDate) {
    sheet.getRange(insertRow, DATE_COL).setValue(newDate)
      .setNumberFormat('m/d (aaa)');
  }
  // B列 (D-N) 自動計算式
  sheet.getRange(insertRow, 2)
    .setFormula('=IF(A' + insertRow + '="","",A' + insertRow + '-TODAY())')
    .setNumberFormat('"D-"0;"D+"0;"D-Day"');
  if (category) sheet.getRange(insertRow, CATEGORY_COL).setValue(category);
  sheet.getRange(insertRow, TASK_COL).setValue(task);
  if (assignee) sheet.getRange(insertRow, ASSIGNEE_COL).setValue(assignee);
  sheet.getRange(insertRow, DONE_COL).setValue(false);
  if (priority) sheet.getRange(insertRow, PRIORITY_COL).setValue(priority);
  if (notes) sheet.getRange(insertRow, HCOL).setValue(notes);

  // 新行のタスクセルにアクティブセルを移動 → サイドバーが自動でその行に切替
  sheet.setActiveRange(sheet.getRange(insertRow, TASK_COL));

  return { ok: true, row: insertRow };
}

// ─────────────────────────────────────────────
// Sidebar HTML
// ─────────────────────────────────────────────
function getSidebarHtml() {
  return [
    '<!DOCTYPE html><html><head><base target="_top"><style>',
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f7;color:#333}',
    '.header{padding:14px 16px;background:#0B1437;color:#fff}',
    '.header .label{font-size:10px;color:#D4AF37;letter-spacing:0.3px;text-transform:uppercase;font-weight:600}',
    '.header .task{font-size:14px;font-weight:600;margin-top:4px;line-height:1.4;word-break:break-word}',
    '.header .meta{font-size:11px;color:#aaa;margin-top:6px;line-height:1.6}',
    '.progress{padding:12px 16px;background:#fff;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px}',
    '.progress-bar{flex:1;height:6px;background:#eee;border-radius:3px;overflow:hidden}',
    '.progress-fill{height:100%;background:#D4AF37;transition:width 0.3s}',
    '.progress-text{font-size:11px;color:#666;white-space:nowrap;font-weight:500}',
    '.items{background:#fff}',
    '.item{display:flex;align-items:center;padding:8px 14px;gap:8px;border-bottom:1px solid #f5f5f5}',
    '.item:last-child{border-bottom:none}',
    '.item input[type="checkbox"]{width:18px;height:18px;cursor:pointer;flex-shrink:0;margin:0;accent-color:#D4AF37}',
    '.item input[type="text"]{flex:1;border:1px solid transparent;background:transparent;font:inherit;padding:5px 7px;border-radius:4px;color:#222;min-width:0}',
    '.item input[type="text"]:hover{background:#fafafa}',
    '.item input[type="text"]:focus{outline:none;background:#fff;border-color:#D4AF37}',
    '.item.done input[type="text"]{color:#888;text-decoration:line-through}',
    '.item .del{background:transparent;border:none;color:#ccc;cursor:pointer;padding:4px 6px;font-size:14px;flex-shrink:0;border-radius:4px}',
    '.item .del:hover{color:#c40c0c;background:#fff5f5}',
    '.add-form{padding:12px 14px;background:#fafafa;border-top:1px solid #eee}',
    '.add-form input{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:4px;font:inherit}',
    '.add-form input:focus{outline:none;border-color:#D4AF37}',
    '.add-form .btn{width:100%;margin-top:6px;padding:9px;background:#11235A;color:#D4AF37;border:none;border-radius:4px;cursor:pointer;font:inherit;font-weight:600;letter-spacing:0.3px}',
    '.add-form .btn:hover{background:#0B1437}',
    '.add-form .btn:disabled{background:#ccc;color:#fff;cursor:default}',
    '.notes{padding:10px 16px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#666}',
    '.notes .ttl{color:#888;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-size:10px}',
    '.notes .nt{padding:3px 0;line-height:1.5;font-style:italic}',
    '.empty{padding:32px 18px;text-align:center;color:#999;font-size:12px;line-height:1.6}',
    '.hint{padding:18px;background:#fffae6;color:#8B6914;font-size:12px;line-height:1.6}',
    '.spin{padding:18px;text-align:center;color:#999;font-size:12px}',
    /* New row section */
    '.newrow{margin-top:6px;padding:0;background:#fff;border-top:6px solid #f0f0f0}',
    '.newrow-toggle{width:100%;padding:14px 16px;background:#fff;color:#11235A;border:none;font:inherit;font-weight:600;font-size:13px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px}',
    '.newrow-toggle:hover{background:#f7f9ff}',
    '.newrow-toggle .arr{margin-left:auto;color:#999;transition:transform 0.2s}',
    '.newrow.open .newrow-toggle .arr{transform:rotate(180deg)}',
    '.newrow-form{display:none;padding:0 16px 16px}',
    '.newrow.open .newrow-form{display:block}',
    '.field{margin-bottom:9px}',
    '.field label{display:block;font-size:10px;font-weight:600;color:#666;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.3px}',
    '.field label .req{color:#c40c0c;margin-left:2px}',
    '.field input,.field select,.field textarea{width:100%;padding:7px 9px;border:1px solid #ddd;border-radius:4px;font:inherit;color:#222;background:#fff}',
    '.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:#D4AF37}',
    '.field textarea{resize:vertical;font-family:inherit}',
    '.actions{display:flex;gap:6px;margin-top:12px}',
    '.actions .btn{flex:1;padding:9px;border:none;border-radius:4px;font:inherit;font-weight:600;cursor:pointer;letter-spacing:0.3px}',
    '.btn-primary{background:#11235A;color:#D4AF37}',
    '.btn-primary:hover{background:#0B1437}',
    '.btn-primary:disabled{background:#ccc;color:#fff;cursor:default}',
    '.btn-secondary{background:#eee;color:#666}',
    '.btn-secondary:hover{background:#ddd}',
    '</style></head><body>',
    '<div id="root"><div class="spin">読み込み中...</div></div>',
    '<div id="newrow" class="newrow" style="display:none">',
    '<button class="newrow-toggle" id="newrow-toggle" onclick="toggleNewRow()">+ 新規タスク行を追加<span class="arr">▼</span></button>',
    '<div class="newrow-form">',
    '<div class="field"><label>日付</label><input type="date" id="ar-date"></div>',
    '<div class="field"><label>カテゴリ</label><select id="ar-cat"></select></div>',
    '<div class="field"><label>タスク<span class="req">*</span></label><input type="text" id="ar-task" placeholder="タスク名 (必須)"></div>',
    '<div class="field"><label>担当</label><select id="ar-assignee"></select></div>',
    '<div class="field"><label>優先度</label><select id="ar-priority"></select></div>',
    '<div class="field"><label>備考・詳細</label><textarea id="ar-notes" rows="2" placeholder="サブタスクは ☐ で行を始める"></textarea></div>',
    '<div class="actions"><button class="btn btn-secondary" onclick="cancelNewRow()">キャンセル</button><button class="btn btn-primary" id="ar-submit" onclick="submitNewRow()">+ 追加</button></div>',
    '</div></div>',
    '<script>',
    'var lastKey="";var lastSheet="";var typing=false;var saving=false;var formOpen=false;var optsCache={};',
    'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;")}',
    'function poll(){if(typing||saving||formOpen)return;google.script.run.withSuccessHandler(onData).withFailureHandler(function(){}).getCurrentSelection()}',
    'function onData(d){if(typing||saving||formOpen)return;',
    'var nr=document.getElementById("newrow");if(d&&d.isMission){nr.style.display="block"}else{nr.style.display="none"}',
    'if(d&&d.sheetName&&d.sheetName!==lastSheet){lastSheet=d.sheetName;refreshOptions(d.sheetName)}',
    'if(!d||!d.ok){var k1=d?(d.sheetName+":hint:"+d.reason):"unknown";if(k1===lastKey)return;lastKey=k1;renderHint(d?d.reason:"unknown");return}',
    'var k=d.sheetName+":"+d.row;if(k===lastKey)return;lastKey=k;render(d)}',
    'function refreshOptions(sn){if(optsCache[sn]){populateDropdowns(optsCache[sn]);return}google.script.run.withSuccessHandler(function(o){optsCache[sn]=o;populateDropdowns(o)}).getSheetOptions(sn)}',
    'function fillSel(sel,items,def){var html=\'<option value="">（未選択）</option>\';for(var i=0;i<items.length;i++){var v=items[i];html+=\'<option value="\'+esc(v)+\'"\'+(v===def?" selected":"")+">"+esc(v)+"</option>"}sel.innerHTML=html}',
    'function populateDropdowns(o){var c=document.getElementById("ar-cat"),a=document.getElementById("ar-assignee"),p=document.getElementById("ar-priority");if(c)fillSel(c,o.categories||[],"");if(a)fillSel(a,o.assignees||[],"");if(p)fillSel(p,o.priorities||[],"中")}',
    'function renderHint(reason){var msgs={header_row:"ヘッダー行が選択されています。<br>8行目以降のタスク行を選択してください。",empty_row:"空の行です。<br>タスクが入力された行を選択してください。",not_mission_sheet:"ミッションシート (例: 2026夏_モンゴル) を開いてください。",unknown:"読み込み中..."};document.getElementById("root").innerHTML=\'<div class="hint">\'+(msgs[reason]||msgs.unknown)+"</div>"}',
    'function render(d){var t=d.items.length,done=0;for(var i=0;i<d.items.length;i++)if(d.items[i].done)done++;var pct=t?Math.round(done/t*100):0;',
    'var h=\'<div class="header"><div class="label">\'+esc(d.sheetName)+" / 行 "+d.row+\'</div><div class="task">\'+esc(d.taskName)+"</div>";',
    'var m=[];if(d.dateStr)m.push("📅 "+esc(d.dateStr));if(d.assignee)m.push("👤 "+esc(d.assignee));if(d.priority)m.push("🔥 "+esc(d.priority));if(d.parentDone)m.push("✅ 親タスク完了");if(m.length)h+=\'<div class="meta">\'+m.join(" · ")+"</div>";h+="</div>";',
    'if(t>0){h+=\'<div class="progress"><div class="progress-bar"><div class="progress-fill" style="width:\'+pct+\'%"></div></div><div class="progress-text">\'+done+"/"+t+" ("+pct+\'%)</div></div>\';h+=\'<div class="items">\';for(var j=0;j<d.items.length;j++){var it=d.items[j];h+=\'<div class="item\'+(it.done?" done":"")+\'" data-idx="\'+it.idx+\'"><input type="checkbox" \'+(it.done?"checked":"")+\' onchange="onToggle(this)"><input type="text" value="\'+esc(it.text)+\'" onfocus="typing=true" onblur="onEdit(this)" onkeydown="if(event.key===\\\'Enter\\\')this.blur()"><button class="del" onclick="onDelete(this)" title="削除">🗑</button></div>\'}h+="</div>"}else{h+=\'<div class="empty">サブタスクがまだありません<br>下の欄から追加してください</div>\'}',
    'if(d.notes&&d.notes.length){h+=\'<div class="notes"><div class="ttl">📝 メモ</div>\';for(var k=0;k<d.notes.length;k++)h+=\'<div class="nt">\'+esc(d.notes[k].text)+"</div>";h+="</div>"}',
    'h+=\'<div class="add-form"><input id="new-text" placeholder="新しいサブタスク..." onfocus="typing=true" onblur="typing=false" onkeydown="if(event.key===\\\'Enter\\\')onAdd()"><button class="btn" onclick="onAdd()">+ サブタスク追加</button></div>\';',
    'document.getElementById("root").innerHTML=h}',
    'function getCur(){var i=lastKey.lastIndexOf(":");return{sheet:lastKey.substr(0,i),row:parseInt(lastKey.substr(i+1),10)}}',
    'function updateProgress(){var items=document.querySelectorAll(".item");var done=document.querySelectorAll(".item.done").length;var pct=items.length?Math.round(done/items.length*100):0;var f=document.querySelector(".progress-fill"),t=document.querySelector(".progress-text");if(f)f.style.width=pct+"%";if(t)t.textContent=done+"/"+items.length+" ("+pct+"%)"}',
    'function onToggle(cb){var item=cb.closest(".item");var idx=parseInt(item.dataset.idx,10);var c=getCur();item.classList.toggle("done",cb.checked);updateProgress();google.script.run.toggleSubtask(c.sheet,c.row,idx)}',
    'function onEdit(input){typing=false;var item=input.closest(".item");var idx=parseInt(item.dataset.idx,10);var newText=input.value.trim();if(!newText){input.value=input.defaultValue;return}var c=getCur();google.script.run.editSubtask(c.sheet,c.row,idx,newText)}',
    'function onDelete(btn){var item=btn.closest(".item");var idx=parseInt(item.dataset.idx,10);if(!confirm("このサブタスクを削除しますか?"))return;var c=getCur();item.style.opacity="0.4";saving=true;google.script.run.withSuccessHandler(function(){saving=false;lastKey="";poll()}).withFailureHandler(function(){saving=false;item.style.opacity="1"}).deleteSubtask(c.sheet,c.row,idx)}',
    'function onAdd(){var input=document.getElementById("new-text");if(!input)return;var text=input.value.trim();if(!text)return;var c=getCur();input.value="";input.disabled=true;saving=true;google.script.run.withSuccessHandler(function(){saving=false;input.disabled=false;lastKey="";poll();setTimeout(function(){var ni=document.getElementById("new-text");if(ni)ni.focus()},100)}).withFailureHandler(function(){saving=false;input.disabled=false}).addSubtask(c.sheet,c.row,text)}',
    /* New row form handlers */
    'function toggleNewRow(){var nr=document.getElementById("newrow");if(nr.classList.contains("open")){cancelNewRow()}else{formOpen=true;nr.classList.add("open");var t=new Date();var iso=t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0");document.getElementById("ar-date").value=iso;setTimeout(function(){document.getElementById("ar-task").focus()},50)}}',
    'function cancelNewRow(){var nr=document.getElementById("newrow");nr.classList.remove("open");["ar-date","ar-task","ar-notes"].forEach(function(id){var e=document.getElementById(id);if(e)e.value=""});var c=document.getElementById("ar-cat");if(c)c.value="";var a=document.getElementById("ar-assignee");if(a)a.value="";var p=document.getElementById("ar-priority");if(p)p.value="中";formOpen=false}',
    'function submitNewRow(){var task=document.getElementById("ar-task").value.trim();if(!task){alert("タスク名は必須です");document.getElementById("ar-task").focus();return}if(!lastSheet){alert("シートを認識できません。ミッションシートのセルをクリックしてから再試行");return}var date=document.getElementById("ar-date").value,category=document.getElementById("ar-cat").value,assignee=document.getElementById("ar-assignee").value,priority=document.getElementById("ar-priority").value,notes=document.getElementById("ar-notes").value;var btn=document.getElementById("ar-submit");btn.disabled=true;btn.textContent="追加中...";saving=true;google.script.run.withSuccessHandler(function(r){saving=false;btn.disabled=false;btn.textContent="+ 追加";if(r&&r.ok){cancelNewRow();lastKey="";poll()}else{alert("追加失敗: "+(r?r.error:"unknown"))}}).withFailureHandler(function(e){saving=false;btn.disabled=false;btn.textContent="+ 追加";alert("エラー: "+e)}).addTaskRow(lastSheet,date,category,task,assignee,priority,notes)}',
    'setInterval(poll,700);poll();',
    '</script></body></html>',
  ].join('');
}
