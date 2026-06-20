# Artha AI Providers

Artha AI reads provider keys from server environment variables. Keep these values in `.env.local` for local development and in deployment secrets for production.

```bash
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-5.2
OPENROUTER_APP_TITLE=Artha System
OPENROUTER_SITE_URL=

MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest

COHERE_API_KEY=
COHERE_MODEL=command-a-plus-05-2026
COHERE_CLIENT_NAME=artha-system

AI_PROVIDER_ORDER=groq,gemini,openrouter,mistral,cohere
```

`OPENROUTHER_API_KEY` is also accepted as a compatibility alias for a common typo, but `OPENROUTER_API_KEY` is preferred.

The floating Artha AI panel shows provider readiness from server env only: provider name, model, key env name, and order. It never returns key values.

`/api/ai/analyze` uses a strict fixed failover chain for inventory analysis:

1. Gemini `gemini-2.5-flash`
2. Groq `llama3-8b-8192`
3. OpenRouter `meta-llama/llama-3-8b-instruct:free`
4. Cohere `command-r`
5. Mistral `open-mixtral-8x22b`

Never commit real keys. Rotate keys that were shared outside your secret manager.
