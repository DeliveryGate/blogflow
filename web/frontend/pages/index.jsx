import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Layout, Card, Banner, Button, Text, BlockStack, InlineStack, Badge, ProgressBar, DataTable, Spinner, Box } from "@shopify/polaris";

export default function Dashboard() {
  const navigate = useNavigate();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const [data, setData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/billing/status?shop=${shop}`).then(r => r.json()),
      fetch(`/api/posts?shop=${shop}`).then(r => r.json()),
    ]).then(([d, p]) => { setData(d); setPosts(p.posts || []); }).finally(() => setLoading(false));
  }, [shop]);

  if (loading) return <Page title="BlogFlow"><Layout><Layout.Section><Card><Box padding="800"><InlineStack align="center"><Spinner size="large" /></InlineStack></Box></Card></Layout.Section></Layout></Page>;

  const usagePercent = data ? Math.round((data.used / data.limit) * 100) : 0;

  return (
    <Page title="BlogFlow" primaryAction={{ content: "Generate new post", onAction: () => navigate(`/generate?shop=${shop}`) }}>
      <Layout>
        {data?.plan === "free" && data?.used >= 2 && (
          <Layout.Section><Banner title="Approaching free plan limit" tone="warning" action={{ content: "Upgrade", onAction: () => navigate(`/settings?shop=${shop}`) }}>You have {data.limit - data.used} credits remaining this month.</Banner></Layout.Section>
        )}

        {!data?.reviewDismissed && posts.filter(p => p.status === "published").length >= 3 && (
          <Layout.Section><Banner title="Enjoying BlogFlow?" tone="info" action={{ content: "Leave a review", url: "https://apps.shopify.com" }} onDismiss={() => fetch(`/api/settings?shop=${shop}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewDismissed: true }) })}>Your blog is growing! A quick review helps other merchants discover BlogFlow.</Banner></Layout.Section>
        )}

        <Layout.Section variant="oneThird"><Card><BlockStack gap="200"><Text variant="headingSm" as="h3">Credits This Month</Text><ProgressBar progress={usagePercent} size="small" /><Text variant="bodySm">{data?.used || 0} / {data?.limit || 3} used</Text></BlockStack></Card></Layout.Section>
        <Layout.Section variant="oneThird"><Card><BlockStack gap="200"><Text variant="headingSm" as="h3">Plan</Text><Badge tone={data?.plan === "pro" ? "success" : data?.plan === "starter" ? "info" : undefined}>{data?.plan?.charAt(0).toUpperCase() + data?.plan?.slice(1) || "Free"}</Badge></BlockStack></Card></Layout.Section>
        <Layout.Section variant="oneThird"><Card><BlockStack gap="200"><Text variant="headingSm" as="h3">Total Published</Text><Text variant="headingXl" as="p">{posts.filter(p => p.status === "published").length}</Text></BlockStack></Card></Layout.Section>

        <Layout.Section><Card><BlockStack gap="300"><Text variant="headingMd" as="h2">Recent Posts</Text>
          {posts.length === 0 ? <Text tone="subdued">No posts yet. Generate your first post!</Text> :
            <DataTable columnContentTypes={["text", "text", "numeric", "text"]} headings={["Title", "Status", "Words", "Date"]}
              rows={posts.slice(0, 5).map(p => [p.title, p.status === "published" ? "Published" : "Draft", p.wordCount, new Date(p.createdAt).toLocaleDateString("en-GB")])} />
          }
          {posts.length > 5 && <Button variant="plain" onClick={() => navigate(`/posts?shop=${shop}`)}>View all posts</Button>}
        </BlockStack></Card></Layout.Section>
      </Layout>
    </Page>
  );
}
