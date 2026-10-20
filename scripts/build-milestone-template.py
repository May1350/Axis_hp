#!/usr/bin/env python3
"""
Build Axis ミッション進捗管理 xlsx template.
Run: python3 scripts/build-milestone-template.py
Output: docs/milestones-template.xlsx
"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from datetime import date
import os

NAVY_DEEP = "0B1437"
NAVY = "11235A"
GOLD = "D4AF37"
WHITE = "FFFFFF"
LABEL_BG = "F0F2F7"
HEADER_BG = "11235A"
OVERDUE_BG = "FDE5E5"
OVERDUE_FG = "B71C1C"
TODAY_BG = "FFF4CC"
TODAY_FG = "8B6914"
SOON_BG = "FFE9CC"
SOON_FG = "9C4A00"
DONE_BG = "F0F0F0"
DONE_FG = "888888"

FONT = "Arial"
thin = Side(style="thin", color="D0D0D0")
thin_border = Border(left=thin, right=thin, top=thin, bottom=thin)


def set_col_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def style_header(cell, bg=HEADER_BG, fg=WHITE, size=11):
    cell.font = Font(name=FONT, bold=True, color=fg, size=size)
    cell.fill = PatternFill("solid", start_color=bg)
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.border = thin_border


def style_label(cell):
    cell.font = Font(name=FONT, bold=True, size=10, color=NAVY_DEEP)
    cell.fill = PatternFill("solid", start_color=LABEL_BG)
    cell.alignment = Alignment(horizontal="right", vertical="center", indent=1)
    cell.border = thin_border


def style_value(cell):
    cell.font = Font(name=FONT, size=11, color=NAVY_DEEP)
    cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    cell.border = thin_border


wb = Workbook()

# ============================================================
# Sheet 1: 使い方 (メンバー向け — 編集方法と色の意味のみ)
# 管理者向け情報 (セットアップ・新規ミッション作成) は docs/milestones-setup.md に分離
# ============================================================
s1 = wb.active
s1.title = "使い方"
s1.sheet_view.showGridLines = False
set_col_widths(s1, [18, 80, 10, 10, 10, 10])

# Helper styles
def s1_section_header(row: int, text: str):
    s1.cell(row=row, column=1, value=text)
    s1.cell(row=row, column=1).font = Font(name=FONT, bold=True, size=14, color=NAVY_DEEP)
    s1.row_dimensions[row].height = 28

def s1_keyval_row(row: int, key: str, val: str, key_color=NAVY, val_color="333333"):
    s1.cell(row=row, column=1, value=key)
    s1.cell(row=row, column=1).font = Font(name=FONT, bold=True, size=11, color=key_color)
    s1.cell(row=row, column=1).alignment = Alignment(vertical="center", indent=1)
    s1.cell(row=row, column=2, value=val)
    s1.cell(row=row, column=2).font = Font(name=FONT, size=11, color=val_color)
    s1.cell(row=row, column=2).alignment = Alignment(wrap_text=True, vertical="center")
    s1.merge_cells(start_row=row, start_column=2, end_row=row, end_column=6)
    s1.row_dimensions[row].height = 28

def s1_paragraph(row: int, text: str, height: int = 36, italic: bool = False, color: str = "333333"):
    s1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=6)
    s1.cell(row=row, column=1, value=text)
    s1.cell(row=row, column=1).font = Font(name=FONT, size=11, color=color, italic=italic)
    s1.cell(row=row, column=1).alignment = Alignment(wrap_text=True, vertical="center", indent=1)
    s1.row_dimensions[row].height = height

# Banner
s1.merge_cells("A1:F1")
c = s1["A1"]
c.value = "📍 Axis ミッション進捗管理"
c.font = Font(name=FONT, bold=True, size=22, color=GOLD)
c.fill = PatternFill("solid", start_color=NAVY_DEEP)
c.alignment = Alignment(horizontal="left", vertical="center", indent=2)
s1.row_dimensions[1].height = 48

s1_paragraph(2, "下のタブ (例: 2026夏_モンゴル / 2026秋_ネパール) から参加するミッションを開いて、担当のタスクを進めます。", height=32, color="666666")

# Section 1: 編集のしかた
s1_section_header(4, "✏️ 基本の編集 (3つだけ)")
edit_tasks = [
    ("① 完了チェック", "F列のチェックボックスをクリック → 行が灰色になり、上部の進捗率が自動更新"),
    ("② 日付を入れる", "A列のセルをダブルクリック → カレンダーから選択。手入力は不要"),
    ("③ 担当を選ぶ",   "E列のセルをクリック → ▼から名前を選択 (派遣別の名簿は「メンバー_モンゴル」「メンバー_ネパール」タブで管理)"),
]
for i, (label, desc) in enumerate(edit_tasks):
    s1_keyval_row(5 + i, label, desc)

# Section 2: 行の色の意味
s1_section_header(9, "🎨 行の色の意味")
color_rows = [
    ("🟥 赤",     "期限超過 — 日付が過ぎたのに未完了"),
    ("🟨 金",     "今日が期限"),
    ("🟧 橙",     "あと3日以内"),
    ("⬜ 灰・打消", "完了済み"),
]
for i, (c0, d) in enumerate(color_rows):
    r = 10 + i
    s1.cell(row=r, column=1, value=c0)
    s1.cell(row=r, column=1).font = Font(name=FONT, bold=True, size=11)
    s1.cell(row=r, column=1).alignment = Alignment(vertical="center", indent=1)
    s1.cell(row=r, column=2, value=d)
    s1.cell(row=r, column=2).font = Font(name=FONT, size=11, color="333333")
    s1.cell(row=r, column=2).alignment = Alignment(vertical="center")
    s1.row_dimensions[r].height = 22

# Section 3: Task Management サイドバー (NEW)
s1_section_header(15, "🔘 Task Management サイドバー")
s1_paragraph(
    16,
    "上部メニュー [Task Management] → [Open Sidebar] で右側にパネルを表示。タスク行のセルを"
    "クリックすると、そのタスクの詳細がサイドバーに即時表示されます (約0.7秒)。",
    height=44,
)
sidebar_features = [
    ("● サブタスク管理",    "H列の ☐ サブタスクをチェックボックスで切替。テキスト編集 / 🗑 削除 / 入力欄から追加 まで全部サイドバー上で完結"),
    ("● 進捗バー",         "サブタスクの完了状況を「3/5 (60%)」のように可視化。親タスクのF列とは別の独立指標"),
    ("● 新規タスク行追加",  "サイドバー下部 [+ 新規タスク行を追加] フォームから 日付 / カテゴリ / タスク / 担当 / 優先度 / 備考 を入力 → 日付順の正しい位置に自動挿入"),
]
for i, (label, desc) in enumerate(sidebar_features):
    s1_keyval_row(17 + i, label, desc)
s1_paragraph(
    20,
    "⚠️ 初回のみ「Google で確認されていないアプリ」の警告画面が出ます — 左下 [Advanced] → "
    "[Go to ... (unsafe)] → [Allow] で 1 回だけ承認してください。2 回目以降は表示されません "
    "(各メンバーが自分の Google アカウントで初回 1 回ずつ実施)。",
    height=48,
    color="8B6914",
    italic=True,
)

# Section 4: 質問・議論
s1_section_header(22, "💬 質問・相談があるとき")
s1_paragraph(
    23,
    "タスクのセルを右クリック → 「コメント」で議論スレッドを残せる。@名前 でメンバーにメンション可能 (通知メールが届く)。",
    height=36,
)

# Section 5: モバイル
s1_section_header(25, "📱 スマホでも編集できる")
s1_paragraph(
    26,
    "Google Sheets モバイルアプリでセル編集・チェック・ドロップダウン・日付カレンダーまで対応。"
    "ただし Task Management サイドバー はPC版限定 — モバイルではセル直接編集で運用してください。",
    height=44,
)

# Footer: admin reference
s1_paragraph(
    28,
    "※ セットアップ / 新規ミッション作成 / Apps Script (サイドバー) インストールは docs/milestones-setup.md を参照 (管理者向け)",
    height=24,
    italic=True,
    color="888888",
)


# ============================================================
# Sheets 2 & 3: ミッション別メンバー名簿 (メンバー_モンゴル / メンバー_ネパール)
# 各ミッションシートはそれぞれ自分のメンバーシートを参照する
# ============================================================
MONGOLIA_ACCENT = "E8F3E8"  # 淡い緑
NEPAL_ACCENT = "F8E8E8"     # 淡い桃


def build_member_sheet(ws, mission_label: str, accent_bg: str, members: list):
    """Build a per-mission member roster sheet (used for the 担当 dropdown)."""
    ws.sheet_view.showGridLines = False
    set_col_widths(ws, [22, 22, 40])

    # Banner
    ws.merge_cells("A1:C1")
    c = ws["A1"]
    c.value = f"👥 {mission_label} メンバー名簿"
    c.font = Font(name=FONT, bold=True, size=18, color=GOLD)
    c.fill = PatternFill("solid", start_color=NAVY_DEEP)
    c.alignment = Alignment(horizontal="left", vertical="center", indent=2)
    ws.row_dimensions[1].height = 40

    ws.merge_cells("A2:C2")
    ws["A2"] = ("A列に名前を追加すると、対応するミッションシートの「担当」"
                "ドロップダウンに自動反映される。両方のミッションに参加するメンバーは"
                "両シートに登録。")
    ws["A2"].font = Font(name=FONT, size=10, italic=True, color="666666")
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="center", indent=1)
    ws.row_dimensions[2].height = 38

    # Header
    for i, h in enumerate(["名前", "役割", "備考"], 1):
        cell = ws.cell(row=4, column=i, value=h)
        style_header(cell)
    ws.row_dimensions[4].height = 28

    # Member rows (light accent fill marks the team color)
    for i, row in enumerate(members):
        r = 5 + i
        for j, v in enumerate(row, 1):
            cell = ws.cell(row=r, column=j, value=v)
            cell.font = Font(name=FONT, size=11, color=NAVY_DEEP)
            cell.alignment = Alignment(vertical="center", indent=1)
            cell.border = thin_border
            cell.fill = PatternFill("solid", start_color=accent_bg)
        ws.row_dimensions[r].height = 22

    # Footer hint
    note_r = 5 + len(members) + 1
    ws.merge_cells(start_row=note_r, start_column=1, end_row=note_r, end_column=3)
    ws.cell(row=note_r, column=1, value="※ 新メンバー: A列に名前を追記。役割・備考は任意。")
    ws.cell(row=note_r, column=1).font = Font(name=FONT, size=9, italic=True, color="888888")
    ws.cell(row=note_r, column=1).alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[note_r].height = 22


# モンゴル派遣メンバー (両ミッション参加者は重複登録)
mongolia_members = [
    ("田中 太郎", "代表",       "書類・ビザ担当 (両派遣)"),
    ("山田 花子", "副代表",     "広報・運営 (両派遣)"),
    ("鈴木 一郎", "会計",       "予算・渡航手配 (両派遣)"),
    ("伊藤 美咲", "物資",       "植林用具・苗木調整"),
    ("高橋 真希", "現地コーデ", "ウランバートル現地NPO連絡"),
    ("全員",      "—",          "全体ミーティング時のみ"),
]

# ネパール派遣メンバー (共通メンバーは重複登録)
nepal_members = [
    ("田中 太郎", "代表",       "書類・ビザ担当 (両派遣)"),
    ("山田 花子", "副代表",     "広報・運営 (両派遣)"),
    ("鈴木 一郎", "会計",       "予算・渡航手配 (両派遣)"),
    ("佐藤 健",   "記録",       "写真・日誌・報告書"),
    ("中村 直人", "防災講師",   "ワークショップ設計"),
    ("全員",      "—",          "全体ミーティング時のみ"),
]

s2_mn = wb.create_sheet("メンバー_モンゴル")
build_member_sheet(s2_mn, "🇲🇳 モンゴル派遣", MONGOLIA_ACCENT, mongolia_members)

s2_np = wb.create_sheet("メンバー_ネパール")
build_member_sheet(s2_np, "🇳🇵 ネパール派遣", NEPAL_ACCENT, nepal_members)


# ============================================================
# Mission sheet builder
# ============================================================
def build_mission_sheet(ws, mission_name, departure_date, sample=None, member_sheet="メンバー_モンゴル"):
    ws.sheet_view.showGridLines = False
    set_col_widths(ws, [12, 10, 14, 38, 14, 10, 10, 50])
    ws.freeze_panes = "A8"

    # Banner
    ws.merge_cells("A1:H1")
    c = ws["A1"]
    c.value = f"📍 {mission_name}"
    c.font = Font(name=FONT, bold=True, size=22, color=GOLD)
    c.fill = PatternFill("solid", start_color=NAVY_DEEP)
    c.alignment = Alignment(horizontal="left", vertical="center", indent=2)
    ws.row_dimensions[1].height = 48
    ws.row_dimensions[2].height = 8

    # Metadata: row 3
    ws["A3"] = "ミッション名"
    style_label(ws["A3"])
    ws.merge_cells("B3:D3")
    ws["B3"] = mission_name
    style_value(ws["B3"])
    ws["B3"].font = Font(name=FONT, bold=True, size=13, color=NAVY_DEEP)
    ws["E3"] = "出発日"
    style_label(ws["E3"])
    ws.merge_cells("F3:H3")
    ws["F3"] = departure_date
    ws["F3"].number_format = "yyyy/m/d (aaa)"
    style_value(ws["F3"])
    ws["F3"].font = Font(name=FONT, bold=True, size=13, color=NAVY_DEEP)

    # Metadata: row 4
    ws["A4"] = "今日"
    style_label(ws["A4"])
    ws["B4"] = "=TODAY()"
    ws["B4"].number_format = "yyyy/m/d (aaa)"
    style_value(ws["B4"])
    ws["E4"] = "D-day"
    style_label(ws["E4"])
    ws.merge_cells("F4:H4")
    ws["F4"] = "=F3-TODAY()"
    ws["F4"].number_format = '"D-"0;"D+"0;"D-Day"'
    style_value(ws["F4"])
    ws["F4"].font = Font(name=FONT, bold=True, size=16, color=GOLD)

    # Metadata: row 5
    ws["A5"] = "完了 / 総数"
    style_label(ws["A5"])
    ws["B5"] = '=COUNTIF(F8:F500,TRUE)&" / "&COUNTA(D8:D500)'
    style_value(ws["B5"])
    ws["B5"].font = Font(name=FONT, bold=True, size=12, color=NAVY_DEEP)
    ws["E5"] = "進捗率"
    style_label(ws["E5"])
    ws.merge_cells("F5:H5")
    ws["F5"] = '=IFERROR(COUNTIF(F8:F500,TRUE)/COUNTA(D8:D500),0)'
    ws["F5"].number_format = "0.0%"
    style_value(ws["F5"])
    ws["F5"].font = Font(name=FONT, bold=True, size=16, color=GOLD)

    for r in (3, 4, 5):
        ws.row_dimensions[r].height = 28
    ws.row_dimensions[6].height = 10

    # Header row 7
    for i, h in enumerate(["日付", "D-N", "カテゴリ", "タスク", "担当", "完了", "優先度", "備考・詳細"], 1):
        style_header(ws.cell(row=7, column=i, value=h))
    ws.row_dimensions[7].height = 30

    # Data rows formulas (B column D-N) + base styling
    for r in range(8, 501):
        b = ws.cell(row=r, column=2, value=f'=IF(A{r}="","",A{r}-TODAY())')
        b.number_format = '"D-"0;"D+"0;"D-Day"'
        b.alignment = Alignment(horizontal="center", vertical="center")
        b.font = Font(name=FONT, size=10, color=NAVY_DEEP)
        b.border = thin_border
        for cc in (1, 3, 4, 5, 6, 7, 8):
            cell = ws.cell(row=r, column=cc)
            cell.border = thin_border
            cell.font = Font(name=FONT, size=11, color=NAVY_DEEP)
            if cc == 1:
                cell.number_format = "m/d (aaa)"
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif cc in (3, 5, 7):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif cc == 4:
                cell.alignment = Alignment(horizontal="left", vertical="center", indent=1, wrap_text=True)
            elif cc == 6:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif cc == 8:
                cell.alignment = Alignment(horizontal="left", vertical="top", indent=1, wrap_text=True)

    # Sample data
    if sample:
        for i, t in enumerate(sample):
            r = 8 + i
            d, cat, task, who, done, pri, notes = t
            ws.cell(row=r, column=1, value=d)
            ws.cell(row=r, column=3, value=cat)
            ws.cell(row=r, column=4, value=task)
            ws.cell(row=r, column=5, value=who)
            ws.cell(row=r, column=6, value=done)
            ws.cell(row=r, column=7, value=pri)
            ws.cell(row=r, column=8, value=notes)

    # Data validations
    # A列 (日付): Google Sheets で日付バリデーション = セル選択時に📅アイコン表示、
    # ダブルクリックでカレンダーピッカーが開く → キーボード入力不要
    dv_date = DataValidation(
        type="date", operator="between",
        formula1="DATE(2020,1,1)", formula2="DATE(2040,12,31)",
        allow_blank=True,
        showInputMessage=True, showErrorMessage=True,
        promptTitle="日付を選択", prompt="セルをダブルクリックするとカレンダーが開きます",
        errorTitle="日付形式エラー", error="日付を入力してください (2020–2040)",
    )
    dv_date.add("A8:A500"); ws.add_data_validation(dv_date)
    dv_cat = DataValidation(type="list", formula1='"書類,会計,物品,広報,当日運営,その他"', allow_blank=True)
    dv_cat.add("C8:C500"); ws.add_data_validation(dv_cat)
    dv_assignee = DataValidation(type="list", formula1=f"={member_sheet}!$A$5:$A$30", allow_blank=True)
    dv_assignee.add("E8:E500"); ws.add_data_validation(dv_assignee)
    dv_done = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=True)
    dv_done.add("F8:F500"); ws.add_data_validation(dv_done)
    dv_pri = DataValidation(type="list", formula1='"高,中,低"', allow_blank=True)
    dv_pri.add("G8:G500"); ws.add_data_validation(dv_pri)

    # Conditional formatting (A8:H500)
    cf = "A8:H500"
    # 1. Done
    ws.conditional_formatting.add(cf, FormulaRule(
        formula=['$F8=TRUE'], stopIfTrue=True,
        font=Font(name=FONT, size=11, color=DONE_FG, strike=True),
        fill=PatternFill("solid", start_color=DONE_BG)))
    # 2. Overdue
    ws.conditional_formatting.add(cf, FormulaRule(
        formula=['AND($A8<>"",$A8<TODAY(),$F8<>TRUE)'], stopIfTrue=True,
        font=Font(name=FONT, size=11, bold=True, color=OVERDUE_FG),
        fill=PatternFill("solid", start_color=OVERDUE_BG)))
    # 3. Today
    ws.conditional_formatting.add(cf, FormulaRule(
        formula=['AND($A8=TODAY(),$F8<>TRUE)'], stopIfTrue=True,
        font=Font(name=FONT, size=11, bold=True, color=TODAY_FG),
        fill=PatternFill("solid", start_color=TODAY_BG)))
    # 4. Soon (≤3 days)
    ws.conditional_formatting.add(cf, FormulaRule(
        formula=['AND($A8<>"",$A8>TODAY(),$A8-TODAY()<=3,$F8<>TRUE)'], stopIfTrue=True,
        font=Font(name=FONT, size=11, color=SOON_FG),
        fill=PatternFill("solid", start_color=SOON_BG)))


# ============================================================
# Sheet 3: 2026夏_モンゴル (sample)
# ============================================================
s3 = wb.create_sheet("2026夏_モンゴル")
# H列 (備考・詳細) のサブタスクは ☐ / ☑ 行で表現。
# クリック切替は Google Apps Script で実現 (scripts/google-apps-script-subtask-toggle.gs 参照)
sample = [
    (date(2026, 4, 15), "書類",     "ビザ申請開始",                "田中 太郎", True,  "高", "3名分の書類準備完了"),
    (date(2026, 4, 20), "書類",     "パスポート残存期間確認",      "山田 花子", False, "高", "全員のパスポート有効期限1年以上を確認"),
    (date(2026, 4, 22), "書類",     "ビザ申請書提出",              "田中 太郎", True,  "高", "大使館直接提出"),
    (date(2026, 4, 24), "会計",     "予算案最終確認",              "鈴木 一郎", False, "中", "執行部承認待ち"),
    (date(2026, 4, 26), "広報",     "メンバー募集ポスター作成",    "山田 花子", False, "低", "デザイン案3つから選定"),
    (date(2026, 5,  1), "会計",     "渡航費予算確定",              "鈴木 一郎", False, "高", "目標 ¥800k"),
    (date(2026, 5, 10), "広報",     "春イベントでメンバー募集",   "山田 花子", False, "中", "20名参加目標"),
    (date(2026, 5, 20), "会計",     "大学助成金申請",              "鈴木 一郎", False, "高", "☐ 書類提出\n☐ 面談準備\n☐ 結果受領"),
    (date(2026, 6,  1), "物品",     "活動物資リスト作成",          "伊藤 美咲", False, "中", "苗木数を現地コーディネータと相談"),
    (date(2026, 6, 10), "当日運営", "渡航前説明会",                "山田 花子", False, "高", "☑ 会場予約\n☑ 資料作成\n☐ メンバー連絡\n☐ リハーサル (2/4回完了)"),
    (date(2026, 6, 15), "物品",     "航空券予約確定",              "鈴木 一郎", False, "高", "3社見積もり済、最安で決定予定"),
    (date(2026, 6, 20), "会計",     "クラウドファンディング開始",  "鈴木 一郎", False, "中", "Readyforで開設予定"),
    (date(2026, 6, 25), "書類",     "海外旅行保険加入",            "田中 太郎", False, "高", "全員分、東京海上日動"),
    (date(2026, 7,  1), "物品",     "現地用語集作成",              "佐藤 健",   False, "低", "モンゴル語基本フレーズ50"),
    (date(2026, 7,  5), "当日運営", "出発前最終ミーティング",      "山田 花子", False, "高", "☐ 荷物最終確認\n☐ 緊急連絡網\n☐ 現地情報共有"),
    (date(2026, 7, 10), "物品",     "荷造り最終確認",              "田中 太郎", False, "高", "☐ 服装リスト\n☐ 薬品・応急セット\n☐ カメラ・記録装備"),
    (date(2026, 7, 14), "当日運営", "成田空港集合",                "全員",      False, "高", "10:00 第2ターミナル北ウイング"),
]
build_mission_sheet(s3, "2026年 夏 モンゴル植林", date(2026, 7, 15), sample,
                    member_sheet="メンバー_モンゴル")


# ============================================================
# Sheet 4: 2026秋_ネパール (sample)
# ============================================================
s4 = wb.create_sheet("2026秋_ネパール")
nepal_sample = [
    (date(2026, 5,  1), "書類",     "ネパール査証情報リサーチ",        "田中 太郎", True,  "中", "オンライン申請 (eTA) vs. 大使館申請の比較"),
    (date(2026, 5, 15), "書類",     "パスポート残存期間確認 (6ヶ月以上)", "山田 花子", False, "高", "全員のパスポート有効期限を一覧化"),
    (date(2026, 6,  1), "その他",   "予防接種スケジュール確定",        "伊藤 美咲", False, "高", "☐ 渡航外来予約\n☐ A型肝炎 1回目\n☐ 破傷風\n☐ 日本脳炎"),
    (date(2026, 6, 10), "広報",     "メンバー募集開始",                "山田 花子", False, "中", "目標15名、SNS + 学内ポスター"),
    (date(2026, 7,  1), "会計",     "予算案作成",                      "鈴木 一郎", False, "高", "目標 ¥900k、昨年比 +10%"),
    (date(2026, 7, 15), "広報",     "現地教育NPO 事前ヒアリング",      "佐藤 健",   False, "高", "Zoom ミーティング 60分"),
    (date(2026, 8,  1), "会計",     "航空券予約 (成田⇔カトマンズ)",    "鈴木 一郎", False, "高", "乗継便 3社見積もり → 最安で確定"),
    (date(2026, 8, 15), "物品",     "防災教材作成 (ネパール語版)",     "佐藤 健",   False, "中", "絵本、カード教材。現地教員と監修"),
    (date(2026, 8, 20), "会計",     "大学助成金申請書提出",            "鈴木 一郎", False, "高", "☐ 計画書\n☐ 予算書\n☐ 面談準備"),
    (date(2026, 9,  1), "書類",     "ネパール査証オンライン申請",      "田中 太郎", False, "高", "全員分、出発14日前までに完了"),
    (date(2026, 9,  5), "書類",     "海外旅行保険加入",                "田中 太郎", False, "高", "東京海上日動、高山対応プラン"),
    (date(2026, 9, 10), "広報",     "クラウドファンディング開始",      "鈴木 一郎", False, "中", "Readyfor、目標 ¥500k、30日間"),
    (date(2026, 9, 20), "物品",     "現地教員謝礼品準備",              "伊藤 美咲", False, "低", "和紙小物、折り紙セット等"),
    (date(2026, 9, 25), "物品",     "現地移動手段手配",                "田中 太郎", False, "中", "カトマンズ市内→学校、ハイヤー調整"),
    (date(2026, 10, 1), "当日運営", "渡航前説明会",                    "山田 花子", False, "高", "☐ 会場予約\n☐ 資料作成\n☐ メンバー最終確認\n☐ 保護者向け案内"),
    (date(2026, 10, 5), "物品",     "医薬品・応急セット確認",          "伊藤 美咲", False, "高", "高山病予防薬、下痢止め、整腸剤"),
    (date(2026, 10,10), "物品",     "荷造り最終確認",                  "田中 太郎", False, "高", "☐ 服装リスト\n☐ 医薬品\n☐ 教材\n☐ カメラ・記録装備"),
    (date(2026, 10,15), "当日運営", "出発前最終ミーティング",          "山田 花子", False, "高", "☐ 緊急連絡網\n☐ 現地連絡先\n☐ 個人装備最終点検"),
    (date(2026, 10,20), "当日運営", "成田空港集合",                    "全員",      False, "高", "08:00 第2ターミナル北ウイング"),
]
build_mission_sheet(s4, "2026年 秋 ネパール防災教育", date(2026, 10, 20), nepal_sample,
                    member_sheet="メンバー_ネパール")


# ============================================================
# Sheet 5: テンプレート
# ============================================================
s5 = wb.create_sheet("テンプレート")
# テンプレートはデフォルトでメンバー_モンゴルを参照。新ミッション作成時に
# 担当ドロップダウン (E8:E500 のデータの入力規則) を該当ミッションのメンバーシートに変更すること。
build_mission_sheet(s5, "新しいミッション名を入力", date(2026, 12, 31), None,
                    member_sheet="メンバー_モンゴル")


os.makedirs("docs", exist_ok=True)
out = "docs/milestones-template.xlsx"
wb.save(out)
print(f"built {out}")
