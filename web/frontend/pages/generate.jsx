import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Layout, Card, TextField, Select, Button, Spinner, Banner, Badge, Toast, Frame, Text, BlockStack, InlineStack, Box, Divider } from "@shopify/polaris";

export default function Generate() {
  const navigate = useNavigate();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [wordCount, setWordCount] = useState("1200");
  const [brandVoice, setBrandVoice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMeta, setEditMeta] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState(null);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    fetch(`/api/billing/status?shop=${shop}`).then(r => r.json()).then(d => {
      setUsage(d);
      if (d.defaultTone) setTone(d.defaultTone);
      if (d.defaultWordCount) setWordCount(String(d.defaultWordCount));
      if (d.brandVoice) setBrandVoice(d.brandVoice);
    });
  }, [shop]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true); setPost(null);
    try {
      const res = await fetch(`/api/generate?shop=${shop}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, tone, wordCount: parseInt(wordCount), brandVoice }) });
      const data = await res.json();
      if (!res.ok) { setToast(data.error || "Generation failed"); return; }
      setPost(data); setEditTitle(data.title); setEditMeta(data.metaDescription);
      setUsage(prev => prev ? { ...prev, used: prev.used + 1 } : prev);
    } catch (err) { setToast(err.message); }
    finally { setGenerating(false); }
  };

  const handlePublish = async () => {
    if (!post) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/publish/${post.postId}?shop=${shop}`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok) { setToast(data.error || "Publish failed"); return; }
      setToast("Published successfully!"); setPost(null);
    } catch (err) { setToast(err.message); }
    finally { setPublishing(false); }
  };

  return (
    <Frame>
      <Page title="Generate Post" backAction={{ content: "Dashboard", onAction: () => navigate(`/?shop=${shop}`) }}>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <TextField label="Topic / keyword" value={topic} onChange={setTopic} placeholder="e.g. healthy meal prep tips" autoComplete="off" />
                <InlineStack gap="300">
                  <Box minWidth="200px"><Select label="Tone" options={[{ label: "Professional", value: "professional" }, { label: "Friendly", value: "friendly" }, { label: "Educational", value: "educational" }, { label: "Conversational", value: "conversational" }]} value={tone} onChange={setTone} /></Box>
                  <Box minWidth="200px"><Select label="Word count" options={[{ label: "500 words", value: "500" }, { label: "800 words", value: "800" }, { label: "1200 words", value: "1200" }, { label: "1500 words", value: "1500" }]} value={wordCount} onChange={setWordCount} /></Box>
                </InlineStack>
                <TextField label="Brand voice (optional)" value={brandVoice} onChange={setBrandVoice} placeholder="Describe your brand tone..." multiline={2} autoComplete="off" />
                <InlineStack gap="200" blockAlign="center">
                  <Button variant="primary" loading={generating} onClick={handleGenerate} disabled={!topic.trim()}>Generate post</Button>
                  {usage && <Badge tone="info">{usage.limit - usage.used} credits remaining</Badge>}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {generating && <Layout.Section><Card><Box padding="800"><InlineStack align="center" gap="300"><Spinner size="large" /><Text>Generating your post...</Text></InlineStack></Box></Card></Layout.Section>}

          {post && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Generated Post</Text>
                  <TextField label="Title" value={editTitle} onChange={setEditTitle} autoComplete="off" />
                  <TextField label="Meta description" value={editMeta} onChange={setEditMeta} autoComplete="off" helpText={`${editMeta.length}/155 characters`} />
                  <Text variant="bodySm" tone="subdued">{post.wordCount} words | Tags: {post.tags}</Text>
                  <Divider />
                  <div dangerouslySetInnerHTML={{ __html: post.content }} style={{ lineHeight: 1.6 }} />
                  <Divider />
                  <InlineStack gap="200">
                    <Button variant="primary" loading={publishing} onClick={handlePublish}>Publish to blog</Button>
                    <Button onClick={() => { setToast("Saved as draft"); setPost(null); }}>Save draft</Button>
                    <Button onClick={handleGenerate}>Regenerate</Button>
                    <Button tone="critical" variant="plain" onClick={() => setPost(null)}>Discard</Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>
        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
