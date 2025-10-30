# Configuration Consolidation Summary

## Overview

All Azure services (Sora video generation, Images, and Titles) now use a **single unified endpoint and API key** hosted at `https://tribixo.openai.azure.com/`.

## Previous Configuration (Multiple Endpoints)

Before, the application required separate configurations:

```bash
# Sora Video
AZURE_SORA_ENDPOINT="https://sbuxsvr2.cognitiveservices.azure.com/openai/v1"
AZURE_SORA_KEY="..."
AZURE_SORA_API_VERSION="preview"

# Titles/Chat
AZURE_OPENAI_ENDPOINT="https://sbuxy.cognitiveservices.azure.com/"
AZURE_OPENAI_API_KEY="..."
AZURE_OPENAI_API_VERSION="2024-04-01-preview"

# Images
AZURE_OPENAI_IMAGES_ENDPOINT="https://tribixo.openai.azure.com/"
AZURE_OPENAI_IMAGES_API_KEY="..."
AZURE_OPENAI_IMAGES_API_VERSION="2025-04-01-preview"
```

## New Unified Configuration

Now simplified to a **single shared endpoint**:

```bash
# Azure OpenAI configuration (shared for Sora, Images, Titles, Prompts)
AZURE_OPENAI_ENDPOINT="https://tribixo.openai.azure.com/"
AZURE_OPENAI_API_KEY="your-azure-openai-key"
AZURE_OPENAI_API_VERSION="2024-04-01-preview"

# Deployment names
AZURE_SORA_DEPLOYMENT_SORA_2="sora-2"
AZURE_OPENAI_TITLE_DEPLOYMENT="gpt-4.1-mini"
AZURE_OPENAI_IMAGE_DEPLOYMENT="gpt-image-1"
```

## Files Modified

### 1. Environment Configuration
- **`.env.local`** - Consolidated to single endpoint/key
- **`.env.example`** - Updated template for safe sharing

### 2. Core Library
- **`lib/azureSora.ts`**
  - Changed `AZURE_SORA_ENDPOINT` → `AZURE_OPENAI_ENDPOINT`
  - Changed `AZURE_SORA_KEY` → `AZURE_OPENAI_API_KEY`
  - Changed `AZURE_SORA_API_VERSION` → `AZURE_OPENAI_API_VERSION`
  - Updated URL builder to add `/openai/v1` prefix for Sora endpoints

### 3. API Routes
- **`app/api/generate-images/route.ts`**
  - Changed `AZURE_OPENAI_IMAGES_ENDPOINT` → `AZURE_OPENAI_ENDPOINT`
  - Changed `AZURE_OPENAI_IMAGES_API_KEY` → `AZURE_OPENAI_API_KEY`
  - Changed `AZURE_OPENAI_IMAGES_API_VERSION` → `AZURE_OPENAI_API_VERSION`
  - Error messages updated to reflect new variable names

- **`app/api/generate-video/route.ts`** - No changes needed (uses `lib/azureSora.ts`)
- **`app/api/video-title/route.ts`** - No changes needed (already using `AZURE_OPENAI_*`)

### 4. Documentation
- **`README.md`** - Updated configuration section with simplified setup
- **`Docs/AzDeployment.md`** - Updated deployment commands and examples
- **`Docs/ImageGenerationSetup.md`** - Updated environment variable documentation

## Endpoint URL Structure

### Sora Video Generation
```
https://tribixo.openai.azure.com/openai/v1/video/generations/jobs?api-version=2024-04-01-preview
```

### Images Generation
```
https://tribixo.openai.azure.com/openai/deployments/gpt-image-1/images/generations?api-version=2024-04-01-preview
```

### Title Generation
```
https://tribixo.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2024-04-01-preview
```

## Benefits

1. **Simpler Configuration** - Only 3 environment variables for the endpoint (vs 9 before)
2. **Single API Key** - One key to manage and rotate
3. **Consistent API Version** - Unified versioning across all services
4. **Easier Deployment** - Fewer App Service settings to configure
5. **Reduced Cost** - Single Azure resource instead of multiple

## Migration Checklist

- [x] Update `.env.local` with consolidated configuration
- [x] Update `lib/azureSora.ts` to read new env vars
- [x] Update `app/api/generate-images/route.ts` to read new env vars
- [x] Update `.env.example` template
- [x] Update `README.md` documentation
- [x] Update `Docs/AzDeployment.md` deployment guide
- [x] Update `Docs/ImageGenerationSetup.md` image setup guide
- [ ] Test Sora video generation locally
- [ ] Test image generation locally
- [ ] Test title generation locally
- [ ] Rotate exposed API key (URGENT)
- [ ] Update GitHub Actions secrets
- [ ] Update Azure App Service Application Settings
- [ ] Test all features in production

## Security Notes

⚠️ **CRITICAL**: The API key in `.env.local` was exposed in this conversation and must be rotated immediately.

### Rotation Steps

1. **Azure Portal** → Cognitive Services → `tribixo` resource
2. Navigate to **Keys and Endpoint**
3. Click **Regenerate Key 1** (or Key 2)
4. Copy the new key
5. Update in all locations:
   - `.env.local` (local development)
   - GitHub repository secrets (for CI/CD)
   - Azure App Service Application Settings (production)

### Production Deployment Command

```powershell
az webapp config appsettings set \
  --name <your-app-name> \
  --resource-group <your-rg> \
  --settings \
    AZURE_OPENAI_ENDPOINT="https://tribixo.openai.azure.com/" \
    AZURE_OPENAI_API_KEY="<NEW_ROTATED_KEY>" \
    AZURE_OPENAI_API_VERSION="2024-04-01-preview" \
    AZURE_SORA_DEPLOYMENT_SORA_2="sora-2" \
    AZURE_OPENAI_TITLE_DEPLOYMENT="gpt-4.1-mini" \
    AZURE_OPENAI_IMAGE_DEPLOYMENT="gpt-image-1" \
    NODE_ENV="production"
```

## Testing Commands

### Local Development

```powershell
# Start development server
npm run dev

# Test Sora video generation
curl -X POST http://localhost:3000/api/generate-video `
  -H "Content-Type: application/json" `
  -d '{"prompt":"A koi fish swimming","model":"sora-2","seconds":5,"size":"1080x1080"}'

# Test image generation
curl -X POST http://localhost:3000/api/generate-images `
  -H "Content-Type: application/json" `
  -d '{"prompt":"A futuristic cityscape","size":"1024x1024","count":2,"model":"gpt-image-1"}'

# Test title generation
curl -X POST http://localhost:3000/api/video-title `
  -H "Content-Type: application/json" `
  -d '{"prompt":"A serene waterfall in a forest"}'
```

## Rollback Plan

If you need to revert to the previous configuration:

1. Restore the old environment variables from git history
2. Revert changes to `lib/azureSora.ts`
3. Revert changes to `app/api/generate-images/route.ts`
4. Restart the application

## Questions?

- All services point to the same Azure OpenAI resource
- Deployments are distinguished by deployment names (sora-2, gpt-image-1, gpt-4.1-mini)
- The same API key authenticates all services
- API version is shared but can be overridden per service if needed in the future

---

**Status**: ✅ Implementation Complete  
**Last Updated**: October 29, 2025  
**Breaking Changes**: Yes - requires new environment variables
