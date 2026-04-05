import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Card, DataTable, Badge, Button, Pagination, Tabs, Toast, Frame, Text, BlockStack, InlineStack, Box, TextField } from "@shopify/polaris";

export default function Posts() {
  const navigate = useNavigate();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tabIdx, setTabIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const statuses = [null, "draft", "published"];
  const tabs = [{ id: "all", content: "All" }, { id: "draft", content: "Draft" }, { id: "published", content: "Published" }];

  const fetchPosts = useCallback(async () => {
    const params = new URLSearchParams({ shop, page: String(page) });
    if (statuses[tabIdx]) params.set("status", statuses[tabIdx]);
    const res = await fetch(`/api/posts?${params}`);
    const data = await res.json();
    setPosts(data.posts || []); setTotal(data.total || 0);
  }, [shop, page, tabIdx]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleDelete = async (id) => {
    await fetch(`/api/posts/${id}?shop=${shop}`, { method: "DELETE" });
    setToast("Post deleted"); fetchPosts();
  };

  const rows = posts.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase())).map(p => [
    p.title,
    p.status === "published" ? <Badge tone="success">Published</Badge> : <Badge tone="info">Draft</Badge>,
    p.wordCount,
    new Date(p.createdAt).toLocaleDateString("en-GB"),
    <InlineStack gap="100" key={p.id}>
      {p.shopifyUrl && <Button size="slim" url={p.shopifyUrl} external>View</Button>}
      <Button size="slim" tone="critical" onClick={() => handleDelete(p.id)}>Delete</Button>
    </InlineStack>,
  ]);

  return (
    <Frame>
      <Page title="Posts" backAction={{ content: "Dashboard", onAction: () => navigate(`/?shop=${shop}`) }} primaryAction={{ content: "Generate new", onAction: () => navigate(`/generate?shop=${shop}`) }}>
        <Card>
          <BlockStack gap="400">
            <Tabs tabs={tabs} selected={tabIdx} onSelect={(i) => { setTabIdx(i); setPage(1); }} />
            <TextField label="Search" value={search} onChange={setSearch} placeholder="Search by title..." clearButton onClearButtonClick={() => setSearch("")} autoComplete="off" />
            <DataTable columnContentTypes={["text", "text", "numeric", "text", "text"]} headings={["Title", "Status", "Words", "Created", "Actions"]} rows={rows} />
            <InlineStack align="center"><Pagination hasPrevious={page > 1} hasNext={page * 20 < total} onPrevious={() => setPage(page - 1)} onNext={() => setPage(page + 1)} /></InlineStack>
          </BlockStack>
        </Card>
        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
