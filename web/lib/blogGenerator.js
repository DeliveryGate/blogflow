import { PrismaClient } from "@prisma/client";
import { generateWithOpenAI } from "./openai.js";
import { shopifyGraphQL } from "../shopify.js";

const prisma = new PrismaClient();

const COMPETITOR_NAMES = [
  "Amazon", "eBay", "Etsy", "Walmart", "Target", "AliExpress", "Wish",
  "Tesco", "Sainsbury", "ASDA", "Aldi", "Lidl", "Ocado", "HelloFresh",
  "Gousto", "Abel & Cole", "Mindful Chef",
];

export async function fetchProductContext(shop, accessToken) {
  // Check cache (1 hour TTL)
  const cached = await prisma.productCache.findUnique({ where: { shop } });
  if (cached && Date.now() - new Date(cached.cachedAt).getTime() < 3600000) {
    return JSON.parse(cached.products);
  }

  const query = `
    query { products(first: 50, sortKey: BEST_SELLING) {
      edges { node { title description handle productType tags } }
    }}
  `;
  const result = await shopifyGraphQL(shop, accessToken, query);
  const products = result.data.products.edges.map(({ node }) => ({
    title: node.title,
    description: (node.description || "").slice(0, 150),
    handle: node.handle,
    productType: node.productType,
    tags: node.tags,
  }));

  await prisma.productCache.upsert({
    where: { shop },
    create: { shop, products: JSON.stringify(products), cachedAt: new Date() },
    update: { products: JSON.stringify(products), cachedAt: new Date() },
  });

  return products;
}

export function buildPrompt(topic, products, tone, wordCount, brandVoice) {
  const productList = products.map(p => `- ${p.title}: ${p.description} (${p.productType})`).join("\n");

  return `You are writing a blog post for an online store.

PRODUCT CATALOG (only reference these products — never mention competitors, other brands, or products not in this store):
${productList}

TASK: Write a ${wordCount}-word SEO-optimised blog post about: ${topic}

TONE: ${tone}
${brandVoice ? `BRAND VOICE: ${brandVoice}` : ""}

REQUIREMENTS:
- Include 2-4 natural internal product references from the catalog above
- Never mention competitor brands or products not in the catalog
- Write a compelling meta description (max 155 characters)
- Structure with H2 and H3 headings using HTML tags
- Include an FAQ section with 3-4 common questions
- Structure content with clear factual statements for AI search engine extraction
- Optimise for direct answer extraction by AI search engines (ChatGPT, Perplexity, Google AI Overviews)
- Use the target keyword "${topic}" naturally throughout

Return a JSON object with these exact keys:
{
  "title": "Blog post title",
  "metaDescription": "155 char max meta description",
  "content": "Full HTML content with h2, h3, p, ul, li tags",
  "tags": "comma-separated tags",
  "slug": "url-friendly-slug"
}

Return ONLY valid JSON, no markdown code fences.`;
}

export async function generatePost(prompt) {
  const raw = await generateWithOpenAI(prompt);

  let parsed;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  if (!parsed.title || !parsed.metaDescription || !parsed.content) {
    throw new Error("AI response missing required fields (title, metaDescription, content)");
  }

  // Run competitor filter
  parsed.content = competitorFilter(parsed.content);
  parsed.wordCount = parsed.content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
  parsed.generatedAt = new Date().toISOString();

  return parsed;
}

export async function publishToShopify(shop, accessToken, blogId, post, publish = true) {
  const mutation = `
    mutation CreateArticle($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article { id handle }
        userErrors { field message }
      }
    }
  `;

  // If no blogId, get the default blog
  if (!blogId) {
    const blogsResult = await shopifyGraphQL(shop, accessToken, `query { blogs(first: 1) { edges { node { id } } } }`);
    blogId = blogsResult.data.blogs.edges[0]?.node?.id;
    if (!blogId) throw new Error("No blog found — create a blog in Shopify admin first");
  }

  const result = await shopifyGraphQL(shop, accessToken, mutation, {
    article: {
      blogId,
      title: post.title,
      body: post.content,
      summary: post.metaDescription,
      tags: post.tags.split(",").map(t => t.trim()),
      handle: post.slug,
      published: publish,
    },
  });

  const errors = result.data.articleCreate.userErrors;
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join(", "));

  const article = result.data.articleCreate.article;
  return {
    id: article.id,
    url: `https://${shop}/blogs/news/${article.handle}`,
    published: publish,
  };
}

export function competitorFilter(content) {
  let filtered = content;
  let replacements = [];

  for (const name of COMPETITOR_NAMES) {
    const regex = new RegExp(`\\b${name}\\b`, "gi");
    if (regex.test(filtered)) {
      replacements.push(name);
      filtered = filtered.replace(regex, "our store");
    }
  }

  if (replacements.length > 0) {
    console.log(`[competitor-filter] Replaced mentions of: ${replacements.join(", ")}`);
  }

  return filtered;
}
