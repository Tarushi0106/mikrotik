#!/bin/bash
# Runs on the Linux server (copied there by .github/workflows/deploy.yml on every push to main).
set -e

REPO_URL="https://github.com/Tarushi0106/mikrotik.git"
APP_DIR="/root/mikrotik"

if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch origin main
  git reset --hard origin/main
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

command -v pm2 >/dev/null || npm install -g pm2
command -v serve >/dev/null || npm install -g serve

cd "$APP_DIR/backend"
npm install --omit=dev
pm2 describe netcontrol-backend >/dev/null 2>&1 \
  && pm2 restart netcontrol-backend --update-env \
  || pm2 start index.js --name netcontrol-backend

cd "$APP_DIR/frontend"
npm install
npm run build
pm2 describe netcontrol-frontend >/dev/null 2>&1 \
  && pm2 restart netcontrol-frontend --update-env \
  || pm2 start "serve -s dist -l 5173" --name netcontrol-frontend

pm2 save
