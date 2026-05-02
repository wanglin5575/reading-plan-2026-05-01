#!/usr/bin/env bash
# 通过 Supabase Management API 写入自定义 SMTP（需环境变量，见 configure-supabase-smtp.env.example）
set -euo pipefail

require() {
  local n="$1"
  if [[ -z "${!n:-}" ]]; then
    echo "缺少环境变量: $n" >&2
    exit 1
  fi
}

require SUPABASE_ACCESS_TOKEN
require PROJECT_REF
require SMTP_HOST
require SMTP_PORT
require SMTP_USER
require SMTP_PASS
require SMTP_ADMIN_EMAIL
require SMTP_SENDER_NAME

MAILER_AUTOCONFIRM="${MAILER_AUTOCONFIRM:-false}"

BODY=$(python3 -c "
import json, os
cfg = {
  'external_email_enabled': True,
  'mailer_secure_email_change_enabled': True,
  'mailer_autoconfirm': os.environ.get('MAILER_AUTOCONFIRM', 'false').lower() in ('1', 'true', 'yes'),
  'smtp_admin_email': os.environ['SMTP_ADMIN_EMAIL'],
  'smtp_host': os.environ['SMTP_HOST'],
  'smtp_port': int(os.environ['SMTP_PORT']),
  'smtp_user': os.environ['SMTP_USER'],
  'smtp_pass': os.environ['SMTP_PASS'],
  'smtp_sender_name': os.environ['SMTP_SENDER_NAME'],
}
print(json.dumps(cfg))
")

code=$(curl -sS -o /tmp/sb-smtp-res.json -w "%{http_code}" -X PATCH \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${BODY}")

echo "HTTP $code"
cat /tmp/sb-smtp-res.json
echo ""

if [[ "$code" != "200" && "$code" != "201" && "$code" != "204" ]]; then
  echo "写入失败：请核对 PROJECT_REF、Token 权限（需能改项目配置）及 SMTP 参数。" >&2
  exit 1
fi

echo "SMTP 已提交。请到 Dashboard → Authentication → Rate Limits 按需调高每小时发信上限。"
echo "文档：https://supabase.com/docs/guides/auth/auth-smtp"
