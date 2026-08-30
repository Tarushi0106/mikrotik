#!/bin/bash
# Runs on the Linux server (copied there by .github/workflows/deploy.yml on every push to main).
set -e

cd /root/mikrotik

echo ">> Pulling latest code..."
git pull origin main

echo ">> Installing backend deps..."
cd backend
npm install
pm2 restart netcontrol-backend

echo ">> Building frontend..."
cd ../frontend
npm install
npm run build

echo ">> Deploying frontend build..."
rm -rf /var/www/mikrotik/frontend/dist
cp -r dist /var/www/mikrotik/frontend/

echo ">> Reloading nginx..."
nginx -t && systemctl reload nginx

echo ">> Deployment complete."
