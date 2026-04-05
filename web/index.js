import express from "express";
import compression from "compression";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import serveStatic from "serve-static";
import { verifyWebhookHmac, shopifyGraphQL, PLANS, CREATE_SUBSCRIPTION } from "./shopify.js";
import { verifyRequest } from "./middleware/verify-request.js";
import { fetchProductContext, buildPrompt, generatePost, publishToShopify } from "./lib/blogGenerator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const IS_PROD = process.env.NODE_ENV === "production";

app.use(compression());
app.use("/api/webhooks", express.raw({ type: "application/json" }));
app.use(express.json());
app.get("/health", (req, res) => res.json({ status: "ok", app: "blogflow" }));

// --- Webhooks ---
app.post("/api/webhooks/:topic", async (req, res) => {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac || !verifyWebhookHmac(req.body.toString(), hmac, process.env.SHOPIFY_API_SECRET)) return res.status(401).send("Unauthorized");
  const shop = req.headers["x-shopify-shop-domain"];
  try {
    if (req.params.topic === "app-uninstalled" || req.params.topic === "shop-redact") {
      await prisma.blogPost.deleteMany({ where: { shop } });
      await prisma.usageTracking.deleteMany({ where: { shop } });
      await prisma.productCache.deleteMany({ where: { shop } });
      await prisma.merchantPlan.deleteMany({ where: { shop } });
      await prisma.session.deleteMany({ where: { shop } });
    }
    res.status(200).send("OK");
  } catch (err) { console.error(`[webhook] error:`, err); res.status(500).send("Error"); }
});

// --- Usage helper ---
async function getUsage(shop) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  let usage = await prisma.usageTracking.findUnique({ where: { shop_month: { shop, month } } });
  if (!usage) usage = await prisma.usageTracking.create({ data: { shop, month, postCount: 0 } });
  const merchant = await prisma.merchantPlan.findUnique({ where: { shop } });
  const plan = merchant?.plan || "free";
  const limit = PLANS[plan]?.postLimit || 3;
  return { used: usage.postCount, limit, plan, month, resetDate: `${month}-01` };
}

// --- Generate Post ---
app.post("/api/generate", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  const { topic, tone = "professional", wordCount = 1200, brandVoice = "" } = req.body;
  if (!topic) return res.status(400).json({ error: "Topic is required" });

  try {
    const usage = await getUsage(shop);
    if (usage.used >= usage.limit) return res.status(403).json({ error: "Monthly post limit reached", ...usage, upgrade: true });

    const products = await fetchProductContext(shop, accessToken);
    const prompt = buildPrompt(topic, products, tone, wordCount, brandVoice);
    const post = await generatePost(prompt);

    const saved = await prisma.blogPost.create({
      data: { shop, topic, title: post.title, metaDescription: post.metaDescription, content: post.content, tags: post.tags || "", slug: post.slug || topic.toLowerCase().replace(/\s+/g, "-"), wordCount: post.wordCount },
    });

    const month = new Date().toISOString().slice(0, 7);
    await prisma.usageTracking.upsert({
      where: { shop_month: { shop, month } },
      create: { shop, month, postCount: 1 },
      update: { postCount: { increment: 1 } },
    });

    res.json({ postId: saved.id, title: saved.title, metaDescription: saved.metaDescription, content: saved.content, tags: saved.tags, slug: saved.slug, wordCount: saved.wordCount });
  } catch (err) { console.error("[api] generate error:", err); res.status(500).json({ error: err.message || "Generation failed" }); }
});

// --- Publish Post ---
app.post("/api/publish/:postId", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  try {
    const post = await prisma.blogPost.findFirst({ where: { id: req.params.postId, shop } });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const result = await publishToShopify(shop, accessToken, null, post, true);
    await prisma.blogPost.update({ where: { id: post.id }, data: { status: "published", shopifyPostId: result.id, shopifyUrl: result.url, publishedAt: new Date() } });

    res.json({ url: result.url, published: true });
  } catch (err) { console.error("[api] publish error:", err); res.status(500).json({ error: err.message || "Publish failed" }); }
});

// --- List Posts ---
app.get("/api/posts", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const page = parseInt(req.query.page || "1");
  const status = req.query.status;
  const where = { shop };
  if (status) where.status = status;

  try {
    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20, select: { id: true, title: true, status: true, wordCount: true, createdAt: true, shopifyUrl: true, topic: true } }),
      prisma.blogPost.count({ where }),
    ]);
    res.json({ posts, total, page, pages: Math.ceil(total / 20) });
  } catch (err) { res.status(500).json({ error: "Failed to fetch posts" }); }
});

// --- Delete Post ---
app.delete("/api/posts/:postId", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  try {
    const post = await prisma.blogPost.findFirst({ where: { id: req.params.postId, shop } });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (post.shopifyPostId) {
      await shopifyGraphQL(shop, accessToken, `mutation($id: ID!) { articleDelete(id: $id) { userErrors { message } } }`, { id: post.shopifyPostId }).catch(() => {});
    }
    await prisma.blogPost.delete({ where: { id: post.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete post" }); }
});

// --- Usage ---
app.get("/api/usage", verifyRequest, async (req, res) => {
  try { res.json(await getUsage(req.shopSession.shop)); } catch (err) { res.status(500).json({ error: "Failed to fetch usage" }); }
});

// --- Keyword Suggestions ---
app.post("/api/keywords", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  const { topic } = req.body;
  try {
    const products = await fetchProductContext(shop, accessToken);
    const types = [...new Set(products.map(p => p.productType).filter(Boolean))];
    const tags = [...new Set(products.flatMap(p => p.tags || []))].slice(0, 20);
    const suggestions = [`${topic} guide`, `best ${topic}`, `${topic} tips`, ...types.slice(0, 2).map(t => `${topic} for ${t}`)].slice(0, 5);
    res.json({ suggestions });
  } catch (err) { res.status(500).json({ error: "Failed to generate keywords" }); }
});

// --- Billing ---
app.get("/api/billing/status", verifyRequest, async (req, res) => {
  const merchant = await prisma.merchantPlan.findUnique({ where: { shop: req.shopSession.shop } });
  const plan = merchant?.plan || "free";
  const usage = await getUsage(req.shopSession.shop);
  res.json({ plan, price: PLANS[plan]?.price || 0, ...usage, brandVoice: merchant?.brandVoice || "", defaultTone: merchant?.defaultTone || "professional", defaultWordCount: merchant?.defaultWordCount || 1200, autoPublish: merchant?.autoPublish || false, reviewDismissed: merchant?.reviewDismissed || false });
});

app.post("/api/billing/subscribe", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  const { plan } = req.body;
  if (!plan || !PLANS[plan] || plan === "free") return res.status(400).json({ error: "Invalid plan" });
  const returnUrl = `${process.env.SHOPIFY_APP_URL}/api/billing/callback?shop=${shop}&plan=${plan}`;
  try {
    const result = await shopifyGraphQL(shop, accessToken, CREATE_SUBSCRIPTION, {
      name: `BlogFlow ${PLANS[plan].name}`, returnUrl, test: !IS_PROD,
      lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: PLANS[plan].price, currencyCode: "USD" }, interval: "EVERY_30_DAYS" } } }],
    });
    const { confirmationUrl, userErrors } = result.data.appSubscriptionCreate;
    if (userErrors.length > 0) return res.status(400).json({ error: "Failed", details: userErrors });
    res.json({ confirmationUrl });
  } catch (err) { res.status(500).json({ error: "Subscription failed" }); }
});

app.get("/api/billing/callback", async (req, res) => {
  const { shop, plan, charge_id } = req.query;
  if (charge_id && plan && shop) {
    await prisma.merchantPlan.upsert({ where: { shop }, create: { shop, plan, subscriptionId: charge_id }, update: { plan, subscriptionId: charge_id } });
  }
  res.redirect(`/?shop=${shop}`);
});

app.post("/api/settings", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const { brandVoice, defaultTone, defaultWordCount, autoPublish, reviewDismissed } = req.body;
  const data = {};
  if (brandVoice !== undefined) data.brandVoice = brandVoice;
  if (defaultTone !== undefined) data.defaultTone = defaultTone;
  if (defaultWordCount !== undefined) data.defaultWordCount = parseInt(defaultWordCount) || 1200;
  if (autoPublish !== undefined) data.autoPublish = autoPublish;
  if (reviewDismissed !== undefined) data.reviewDismissed = reviewDismissed;
  const updated = await prisma.merchantPlan.upsert({ where: { shop }, create: { shop, ...data }, update: data });
  res.json(updated);
});

// --- Static ---
if (IS_PROD) {
  app.use(serveStatic(path.join(__dirname, "frontend", "dist")));
  app.get("*", (req, res) => res.sendFile(path.join(__dirname, "frontend", "dist", "index.html")));
}

app.listen(PORT, () => console.log(`BlogFlow backend running on port ${PORT}`));
