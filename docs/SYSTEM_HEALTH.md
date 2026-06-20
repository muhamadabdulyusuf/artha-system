# System Health

`GET /api/system/health`

Returns a read-only operational health snapshot for Artha System.

## Checks

- Supabase env readiness and database connectivity.
- Whether `SUPABASE_SERVICE_ROLE_KEY` is configured.
- Whether `ai_business_memory` exists and can be read.
- AI provider readiness from configured environment variables.

The endpoint never returns secret values and does not call AI providers, so it does not spend AI quota.

## Example

```json
{
  "status": "ok",
  "generatedAt": "2026-06-19T00:00:00.000Z",
  "checks": {
    "supabase": {
      "status": "ok",
      "message": "Supabase terkoneksi dengan service role.",
      "configured": true,
      "serviceRoleConfigured": true,
      "latencyMs": 120
    },
    "aiMemoryTable": {
      "status": "ok",
      "message": "Tabel ai_business_memory tersedia.",
      "latencyMs": 85
    },
    "aiProviders": {
      "status": "ok",
      "message": "3/5 AI provider siap dikonfigurasi.",
      "configuredCount": 3,
      "totalCount": 5,
      "providers": []
    }
  }
}
```

`status` can be:

- `ok`: core checks are ready.
- `degraded`: app can run, but a supporting foundation needs attention.
- `error`: a core dependency is not reachable or not configured.
