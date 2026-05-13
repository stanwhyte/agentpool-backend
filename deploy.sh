#!/bin/bash
DL=~/Downloads/files888
SRC=/Users/stanwhyte/agent-pool/agents-pool/agentpool-frontend/src
FE=/Users/stanwhyte/agent-pool/agents-pool/agentpool-frontend
SERVER=root@165.245.210.144
KEY=~/.ssh/id_ed25519

echo "=== Step 1: Upload backend files ==="
scp -i $KEY $DL/memory.js         $SERVER:/var/www/backend/src/routes/memory.js
scp -i $KEY $DL/sessions.js       $SERVER:/var/www/backend/src/routes/sessions.js
scp -i $KEY $DL/patch-providers.sh $SERVER:/tmp/patch-providers.sh

echo "=== Step 2: Register routes + patch Ollama on server ==="
ssh -i $KEY $SERVER << 'ENDSSH'
# Register memory route if not already there
grep -q "memoryRouter" /var/www/backend/src/index.js || {
  sed -i "/import sessionsRouter/a import memoryRouter from './routes/memory.js'" /var/www/backend/src/index.js
  sed -i "/app.use.*sessions/a app.use('/api/memory', memoryRouter)" /var/www/backend/src/index.js
  echo "memory route registered"
}

# Patch Ollama provider
bash /tmp/patch-providers.sh

# Verify
echo "--- index.js routes ---"
grep -E "memory|sessions|skills|settings|notify" /var/www/backend/src/index.js

pm2 restart agentpool-api
sleep 3
pm2 logs agentpool-api --lines 5 --nostream
ENDSSH

echo "=== Step 3: Copy frontend files ==="
cp $DL/App.jsx            $SRC/App.jsx
cp $DL/api.js             $SRC/api.js
cp $DL/ConfigTab.jsx      $SRC/ConfigTab.jsx
cp $DL/LocalLLMConfig.jsx $SRC/LocalLLMConfig.jsx
cp $DL/MemoryTab.jsx      $SRC/MemoryTab.jsx

echo "--- src/ contents ---"
ls $SRC/

echo "=== Step 4: Build ==="
cd $FE && npm run build

echo "=== Step 5: Deploy to server ==="
ssh -i $KEY stan@165.245.210.144 "rm -rf /tmp/fe && mkdir -p /tmp/fe"
scp -r -i $KEY $FE/dist/* stan@165.245.210.144:/tmp/fe/
ssh -i $KEY stan@165.245.210.144 "sudo cp -r /tmp/fe/* /var/www/frontend/dist/ && sudo chown -R www-data:www-data /var/www/frontend/ && sudo systemctl reload nginx && echo DEPLOYED"

echo "=== Step 6: Push to GitHub ==="
cd $FE
git add -A
git commit -m "feat: local LLM (Ollama), agent memory, default skills for all 14 agents"
git push

echo "=== DONE ==="