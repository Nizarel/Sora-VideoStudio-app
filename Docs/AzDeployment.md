
## ✅ Recommended Option: Azure App Service (Linux, Node 20)

Why this over Static Web Apps:
- Your API routes stream binary video content; App Service handles long-lived responses and larger payloads more predictably than Static Web Apps' function layer.
- No rewiring of routes, no need to separate APIs.
- Easiest lift: push build, set env vars, run.

Static Web Apps works too, but you’d tweak build config, sometimes hit cold starts on heavier endpoints, and binary streaming can be finicky. So for “minimal change + fastest,” App Service wins.

---

## 🪄 Summary Deployment Flow

1. Rotate and remove hardcoded secrets from .env.local.
2. Build locally: `npm ci && npm run build`.
3. Deploy either:
   - Direct (Zip / GitHub Action)
   - Or as a container (slightly more effort; optional)
4. Set environment variables in App Service Application Settings.
5. Start and verify endpoints:
   - `/api/generate-video`
   - `/api/video-title`
   - `/api/videos/{taskId}`
   - `/api/videos/{genId}/content/video`

---

## 🧪 Pre-Deploy Local Check

```powershell
# From project root
npm ci
npm run build
npm run start
# Test a generation:
curl -X POST http://localhost:3000/api/generate-video -H "Content-Type: application/json" `
  -d '{ "prompt": "A koi fish swimming peacefully", "model": "sora-2", "seconds": 5, "size": "1080x1080" }'
```

---

## 🔐 Clean Up .env.local (Don’t Deploy Raw Keys)

Remove plaintext keys before committing; instead add a `.env.example`:

````bash
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_API_VERSION=2024-04-01-preview
AZURE_SORA_DEPLOYMENT_SORA_2=sora-2
AZURE_OPENAI_TITLE_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-1
````

Rotate the existing keys you pasted (treat as compromised).

---

## 🚀 Option 1: Fast GitHub Action Deployment (No Container)

### Create App Service + Resource Group

```powershell
az login
az group create --name sora-app-rg --location eastus
az appservice plan create --name sora-plan --resource-group sora-app-rg --sku B1 --is-linux
az webapp create --name sora-video-app --resource-group sora-app-rg --plan sora-plan --runtime "NODE:20-lts"
```

### Add App Settings (Env Vars)

```powershell
az webapp config appsettings set --name sora-video-app --resource-group sora-app-rg --settings `
  AZURE_OPENAI_ENDPOINT="https://tribixo.openai.azure.com/" `
  AZURE_OPENAI_API_KEY="<ROTATED_KEY>" `
  AZURE_OPENAI_API_VERSION="2024-04-01-preview" `
  AZURE_SORA_DEPLOYMENT_SORA_2="sora-2" `
  AZURE_OPENAI_TITLE_DEPLOYMENT="gpt-4.1-mini" `
  AZURE_OPENAI_IMAGE_DEPLOYMENT="gpt-image-1" `
  NODE_ENV="production"
```

### Add GitHub Action Workflow

````yaml
name: Deploy Next.js App to Azure App Service

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install deps
        run: npm ci
      - name: Build
        run: npm run build
      - name: Archive output
        run: |
          mkdir deploy
          cp -R .next package.json package-lock.json next.config.ts deploy/
      - name: Azure Login
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - name: Deploy Zip
        uses: azure/webapps-deploy@v3
        with:
          app-name: sora-video-app
          package: deploy
````

In Azure Portal, add an App Setting: `PORT=8080` only if needed; Next.js usually binds `process.env.PORT`.

### Ensure next.config.ts

Add standalone output (simplifies runtime):

````ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
````

---

## 🐳 Option 2: Container (Slightly More Work, More Control)

Use if you want consistent local/prod parity or future microservice expansion.

### Dockerfile

````Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY next.config.ts ./
EXPOSE 3000
CMD ["npm", "start"]
````

### Deploy Container to Azure

```powershell
az acr create --name soraacr --resource-group sora-app-rg --sku Basic
az acr login --name soraacr
docker build -t soraacr.azurecr.io/sora-video:latest .
docker push soraacr.azurecr.io/sora-video:latest

az webapp create --name sora-video-app-container --resource-group sora-app-rg \
  --plan sora-plan --deployment-container-image-name soraacr.azurecr.io/sora-video:latest

# Set env vars same as Option 1
```

---

## 🧪 Quick Post-Deploy Smoke Tests

```powershell
# Replace with your app service URL
$BASE="https://sora-video-app.azurewebsites.net"

curl -X POST "$BASE/api/generate-video" -H "Content-Type: application/json" `
  -d '{ "prompt": "A serene waterfall with mist", "model": "sora-2", "seconds": 5, "size": "1080x1080" }'

# Poll status
curl "$BASE/api/videos/<task_id>"

# Once generation id extracted (gen_xxx):
curl "$BASE/api/videos/<gen_id>/content/video" -o test.mp4
```

---

## 🛡 Minimal Hardening (Still Fast)

- Add `AZURE_OPENAI_API_KEY` to Key Vault later (not required day one).
- Set `APPINSIGHTS_INSTRUMENTATIONKEY` (optional) for telemetry.
- Enable HTTPS-only:
  ```powershell
  az webapp update --resource-group sora-app-rg --name sora-video-app --https-only true
  ```

---

## ⏱ Time Estimates

| Step | Time |
|------|------|
| Rotate keys / env cleanup | 5–10 min |
| App Service creation | 2–3 min |
| Add workflow & push | 5–10 min |
| Build & deploy | 3–6 min |
| Smoke test | 5 min |
| Total | ~30–35 min |

---

## 🧩 What NOT To Change Now

Skip:
- Splitting services
- Adding Redis
- Caching layers
- Dapr integration
- Durable Functions polling

Those can come later when traffic or complexity demands.

---

## ✅ Final Recommendation

Use Azure App Service (Linux, Node 20) with a GitHub Action deploy. This path requires only:
- Adding standalone output in next.config.ts
- Setting environment variables in App Settings
- Rotating/cleaning secrets
- Adding the deployment workflow

Say “generate the workflow & config patch” if you’d like me to output the exact file diffs next. Ready to proceed?