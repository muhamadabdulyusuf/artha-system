# AI Analyze Endpoint

`POST /api/ai/analyze`

Analyzes product, stock, and sales rows for PO planning, inventory control, and movement classification.

## Request

```json
{
  "dataContext": [
    {
      "product_id": "SKU-001",
      "product_name": "Example Product",
      "current_stock": 12,
      "minimum_stock": 20,
      "sales_last_30_days": 86
    }
  ]
}
```

`dataContext` must be an array. The endpoint passes the array directly into the internal inventory analyst prompt.

## Success Response

The response is pure JSON from the accepted schema:

```json
{
  "summary": {
    "total_products": 1,
    "fast_moving_count": 1,
    "low_moving_count": 0,
    "critical_stock_count": 1
  },
  "purchase_orders": [
    {
      "product_id": "SKU-001",
      "product_name": "Example Product",
      "recommended_qty": 20,
      "priority": "high",
      "reason": "Fast moving and below minimum stock."
    }
  ],
  "inventory_control": [
    {
      "product_id": "SKU-001",
      "product_name": "Example Product",
      "current_stock": 12,
      "recommended_action": "Create PO and monitor daily stock movement.",
      "risk_level": "high"
    }
  ],
  "product_classification": [
    {
      "product_id": "SKU-001",
      "product_name": "Example Product",
      "classification": "fast_moving",
      "reason": "High 30-day sales velocity."
    }
  ]
}
```

## Failover Order

1. Gemini: `gemini-2.5-flash`
2. Groq: `llama3-8b-8192`
3. OpenRouter: `meta-llama/llama-3-8b-instruct:free`
4. Cohere: `command-r`
5. Mistral: `open-mixtral-8x22b`

If a provider fails, rate-limits, or returns invalid JSON/schema, the endpoint automatically tries the next provider.
Each provider call has a 25 second timeout so the cascade does not hang.

## Failure Response

If all providers fail:

```json
{
  "error": {
    "code": "AI_DAILY_LIMIT_EXHAUSTED",
    "message": "Semua limit AI harian habis atau semua provider gagal dipakai untuk analisis inventory.",
    "attempts": []
  }
}
```

Status code: `429`.

`attempts` contains sanitized, shortened provider errors. It never includes API key values.
