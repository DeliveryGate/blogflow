# BlogFlow — AI SEO Blog Writer

Generates SEO-optimised blog posts using the merchant's own product catalog as context. Prevents AI hallucinations mentioning competitors. Posts write directly to Shopify's native blog engine.

## Architecture

- **Backend** (`web/index.js`) — Express server with generation engine, billing, GDPR webhooks
- **Blog Generator** (`web/lib/blogGenerator.js`) �� Product context injection, prompt building, competitor filter
- **OpenAI Integration** (`web/lib/openai.js`) — GPT-4o-mini with retry logic and cost tracking
- **Admin Frontend** (`web/frontend/`) — React + Polaris (dashboard, generator, post manager, settings)
- **Database** — PostgreSQL via Prisma (posts, usage tracking, product cache)

## Environment Variables

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=read_products,write_content,read_content
SHOPIFY_APP_URL=https://blogflow.railway.app
DATABASE_URL=postgresql://
DIRECT_URL=postgresql://
OPENAI_API_KEY=
NODE_ENV=production
PORT=3000
```

## Billing

| Plan | Price | Posts/month |
|------|-------|-------------|
| Free | $0 | 3 |
| Starter | $14.99/mo | 50 |
| Pro | $29.99/mo | 150 |

## App Store Listing

**Name:** BlogFlow — AI SEO Blog Writer
**Tagline:** AI blog posts using your own products — no competitor hallucinations, direct to Shopify blog.

**Key Benefits:**
- Store-context AI writing — uses your product catalog so posts only reference your products, never competitors
- One-click Shopify publishing — posts go directly to your native blog, no lock-in or external hosting
- AEO/GEO optimised — structured for AI search engines (ChatGPT, Perplexity, Google AI Overviews)
