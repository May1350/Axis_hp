#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "google-api-python-client>=2.0",
#     "google-auth>=2.0",
# ]
# ///
"""
Upload docs/milestones-template.xlsx to Google Drive as a Google Sheet.

Runs via `uv` — dependencies auto-install on first run, no pip/venv needed.

One-time auth (run once per machine, browser opens):
    gcloud auth application-default login \\
        --scopes=https://www.googleapis.com/auth/drive,openid,https://www.googleapis.com/auth/userinfo.email

Usage (uv auto-installs deps on first invocation):
    ./scripts/upload-milestone-to-gsheets.py
    ./scripts/upload-milestone-to-gsheets.py --force-new
    ./scripts/upload-milestone-to-gsheets.py --folder-id <DRIVE_FOLDER_ID>

Equivalent explicit forms:
    uv run scripts/upload-milestone-to-gsheets.py
    python3 scripts/upload-milestone-to-gsheets.py   # only if deps are pre-installed

Behavior:
    - First run: creates a new Google Sheet named TITLE
    - Subsequent runs: finds same-named Sheet and updates its content
      (same file ID = same URL, safe to re-run after template rebuilds)
    - Prints the Sheet URL on success
"""

import argparse
import sys
from pathlib import Path

TEMPLATE = Path("docs/milestones-template.xlsx")
TITLE = "Axis ミッション進捗管理 (テンプレート)"
GSHEET_MIME = "application/vnd.google-apps.spreadsheet"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
SCOPES = ["https://www.googleapis.com/auth/drive"]

ADC_HINT = (
    "gcloud auth application-default login \\\n"
    "    --scopes=https://www.googleapis.com/auth/drive,"
    "openid,https://www.googleapis.com/auth/userinfo.email"
)


def main() -> int:
    try:
        from google.auth import default
        from google.auth.exceptions import DefaultCredentialsError
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        print(
            "missing deps. install:\n"
            "  pip install google-api-python-client google-auth",
            file=sys.stderr,
        )
        return 1

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--force-new", action="store_true",
                   help="always create a new Sheet (default: update existing)")
    p.add_argument("--folder-id", default=None,
                   help="Drive folder ID to place the Sheet in (optional)")
    p.add_argument("--title", default=TITLE,
                   help=f"Sheet title (default: {TITLE!r})")
    args = p.parse_args()

    if not TEMPLATE.exists():
        print(f"file not found: {TEMPLATE}", file=sys.stderr)
        print("run: python3 scripts/build-milestone-template.py", file=sys.stderr)
        return 1

    try:
        creds, _ = default(scopes=SCOPES)
    except DefaultCredentialsError:
        print("no ADC credentials. one-time setup:\n  " + ADC_HINT, file=sys.stderr)
        return 1

    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    existing_id = None
    if not args.force_new:
        safe_title = args.title.replace("'", "\\'")
        q = (
            f"name = '{safe_title}' and "
            f"mimeType = '{GSHEET_MIME}' and "
            f"trashed = false"
        )
        try:
            res = service.files().list(q=q, fields="files(id, name)", pageSize=5).execute()
        except HttpError as e:
            if e.resp.status in (401, 403):
                print("403/401 from Drive. your ADC token lacks Drive scope. re-login:\n  " + ADC_HINT, file=sys.stderr)
                return 1
            raise
        files = res.get("files", [])
        if files:
            existing_id = files[0]["id"]

    media = MediaFileUpload(str(TEMPLATE), mimetype=XLSX_MIME, resumable=True)

    try:
        if existing_id:
            file = service.files().update(
                fileId=existing_id,
                media_body=media,
                fields="id, webViewLink",
            ).execute()
            action = "updated"
        else:
            metadata = {"name": args.title, "mimeType": GSHEET_MIME}
            if args.folder_id:
                metadata["parents"] = [args.folder_id]
            file = service.files().create(
                body=metadata,
                media_body=media,
                fields="id, webViewLink",
            ).execute()
            action = "created"
    except HttpError as e:
        if e.resp.status in (401, 403):
            print("403/401 from Drive. your ADC token lacks Drive scope. re-login:\n  " + ADC_HINT, file=sys.stderr)
            return 1
        raise

    print(f"{action}: {file['webViewLink']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
