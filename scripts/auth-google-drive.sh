#!/usr/bin/env bash
# One-shot Google ADC login with Drive scope.
# Run once per machine. Opens a browser for consent.
set -euo pipefail

SCOPES="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive,openid,https://www.googleapis.com/auth/userinfo.email"

exec gcloud auth application-default login --scopes="$SCOPES"
