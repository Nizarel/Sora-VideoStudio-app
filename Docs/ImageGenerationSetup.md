# Azure OpenAI Images Configuration

## Overview

This application now uses **Azure OpenAI Images API** (gpt-image-1 deployment) for image generation instead of the public OpenAI API.

## Endpoint Configuration

The image generation feature connects to Azure using the following URI structure:

```
https://tribixo.openai.azure.com/openai/deployments/gpt-image-1/images/generations?api-version=2025-04-01-preview
```

## Environment Variables

Add these to your `.env.local`:

```bash
AZURE_OPENAI_ENDPOINT="https://tribixo.openai.azure.com/"
AZURE_OPENAI_API_KEY="your-azure-openai-key"
AZURE_OPENAI_API_VERSION="2024-04-01-preview"
AZURE_OPENAI_IMAGE_DEPLOYMENT="gpt-image-1"
```

## Implementation Details

### API Route: `/api/generate-images`

**File:** `app/api/generate-images/route.ts`

**Changes:**
- ✅ Removed dependency on `openai` SDK for images
- ✅ Implemented direct `fetch` to Azure OpenAI Images endpoint
- ✅ Uses `api-key` header authentication (Azure standard)
- ✅ Preserves existing payload validation (prompt, size, count, model)
- ✅ Maintains same response structure for client compatibility

### Request Format

```json
{
  "prompt": "A golden retriever playing in snow",
  "size": "1024x1024",
  "count": 3,
  "model": "gpt-image-1"
}
```

### Response Format

```json
{
  "images": [
    {
      "id": "generated-1730217600000-0",
      "url": "data:image/png;base64,..." or "https://...",
      "base64": "..." (if returned),
      "description": "A golden retriever playing in snow"
    }
  ]
}
```

### Supported Sizes

- `256x256`
- `512x512`
- `1024x1024` (default)
- `1024x1536` (portrait)
- `1536x1024` (landscape)
- `1024x1792` (tall portrait)
- `1792x1024` (wide landscape)
- `auto`

### Count Limits

- Default: 3 images
- Minimum: 1
- Maximum: 4

## Client Usage

The `services/soraApi.ts` client remains unchanged:

```typescript
import { generateImages } from "@/services/soraApi";

const images = await generateImages({
  prompt: "Your prompt here",
  size: "1024x1024",
  count: 3,
  model: "gpt-image-1"
});
```

## Security Notes

⚠️ **CRITICAL**: If API keys were exposed in any commit, chat, or screenshot:

1. **Rotate immediately** in Azure Portal:
   - Navigate to: Cognitive Services → Your Resource → Keys and Endpoint
   - Click "Regenerate Key 1" (or Key 2)
   
2. **Update all locations**:
   - `.env.local` (local development)
   - GitHub Actions secrets (CI/CD)
   - Azure App Service Application Settings (production)

3. **Never commit** `.env.local` to git (already in `.gitignore`)

## Production Deployment

For Azure App Service, configure as Application Settings instead of using `.env.local`:

```bash
az webapp config appsettings set \
  --resource-group <your-rg> \
  --name <your-app-name> \
  --settings \
    AZURE_OPENAI_ENDPOINT="https://tribixo.openai.azure.com/" \
    AZURE_OPENAI_API_KEY="@Microsoft.KeyVault(SecretUri=...)" \
    AZURE_OPENAI_API_VERSION="2024-04-01-preview" \
    AZURE_OPENAI_IMAGE_DEPLOYMENT="gpt-image-1"
```

For enhanced security, reference Azure Key Vault secrets instead of raw keys.

## Testing

Test the endpoint locally:

```bash
npm run dev
```

Then use the UI or call the API directly:

```bash
curl -X POST http://localhost:3000/api/generate-images \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A futuristic cityscape at sunset",
    "size": "1024x1024",
    "count": 2,
    "model": "gpt-image-1"
  }'
```

## Troubleshooting

### Error: "AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be configured"

**Solution:** Ensure all required environment variables are set in `.env.local`.

### Error: 401 Unauthorized

**Solution:** Verify the API key is correct and hasn't been rotated.

### Error: 404 Not Found

**Solution:** 
- Check the endpoint URL format
- Verify the deployment name matches your Azure configuration
- Ensure the API version is supported

### Error: Different response structure

**Solution:** The code handles both `b64_json` and `url` responses. If Azure returns a different structure, check the console logs for the raw response.

## Migration Checklist

- [x] Update `.env.local` with Azure Images credentials
- [x] Refactor `app/api/generate-images/route.ts` to use Azure fetch
- [x] Create `.env.example` template
- [x] Update `README.md` with new configuration
- [ ] Rotate any exposed API keys
- [ ] Update GitHub Actions secrets
- [ ] Update Azure App Service Application Settings
- [ ] Test image generation in development
- [ ] Test image generation in production
- [ ] Remove any references to public OpenAI image API

## Related Files

- `app/api/generate-images/route.ts` - Main API route
- `services/soraApi.ts` - Client wrapper
- `hooks/useVideoForm.ts` - Image selection integration
- `utils/image.ts` - Image preprocessing utilities
- `types/generated.ts` - TypeScript types
- `.env.local` - Environment configuration
- `.env.example` - Configuration template
