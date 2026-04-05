import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Layout, Card, TextField, Select, ChoiceList, Button, Badge, Toast, Frame, Text, BlockStack, InlineStack, ProgressBar, Box } from "@shopify/polaris";

const PLANS = { free: { name: "Free", price: 0, limit: 3, features: ["3 posts/month", "All tones", "No credit card needed"] }, starter: { name: "Starter", price: 14.99, limit: 50, features: ["50 posts/month", "All features", "Email support"] }, pro: { name: "Pro", price: 29.99, limit: 150, features: ["150 posts/month", "All features", "Brand voice memory", "Priority support"] } };

export default function Settings() {
  const navigate = useNavigate();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const [data, setData] = useState(null);
  const [brandVoice, setBrandVoice] = useState("");
  const [defaultTone, setDefaultTone] = useState("professional");
  const [defaultWordCount, setDefaultWordCount] = useState("1200");
  const [autoPublish, setAutoPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetch(`/api/billing/status?shop=${shop}`).then(r => r.json()).then(d => {
      setData(d); setBrandVoice(d.brandVoice || ""); setDefaultTone(d.defaultTone || "professional");
      setDefaultWordCount(String(d.defaultWordCount || 1200)); setAutoPublish(d.autoPublish || false);
    });
  }, [shop]);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/settings?shop=${shop}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandVoice, defaultTone, defaultWordCount: parseInt(defaultWordCount), autoPublish }) });
    setSaving(false); setToast("Settings saved");
  };

  const handleSubscribe = async (plan) => {
    setSubscribing(plan);
    const res = await fetch(`/api/billing/subscribe?shop=${shop}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
    const d = await res.json();
    setSubscribing(null);
    if (d.confirmationUrl) window.top.location.href = d.confirmationUrl;
    else setToast(d.error || "Failed");
  };

  if (!data) return <Page title="Settings"><Card><Box padding="400"><Text>Loading...</Text></Box></Card></Page>;

  return (
    <Frame>
      <Page title="Settings" backAction={{ content: "Dashboard", onAction: () => navigate(`/?shop=${shop}`) }}>
        <Layout>
          <Layout.Section><Card><BlockStack gap="400">
            <Text variant="headingMd" as="h2">Preferences</Text>
            <TextField label="Brand voice" value={brandVoice} onChange={setBrandVoice} multiline={3} placeholder="Describe your brand tone..." autoComplete="off" />
            <Select label="Default tone" options={[{ label: "Professional", value: "professional" }, { label: "Friendly", value: "friendly" }, { label: "Educational", value: "educational" }, { label: "Conversational", value: "conversational" }]} value={defaultTone} onChange={setDefaultTone} />
            <Select label="Default word count" options={[{ label: "500", value: "500" }, { label: "800", value: "800" }, { label: "1200", value: "1200" }, { label: "1500", value: "1500" }]} value={defaultWordCount} onChange={setDefaultWordCount} />
            <ChoiceList title="" choices={[{ label: "Auto-publish posts (skip draft)", value: "auto" }]} selected={autoPublish ? ["auto"] : []} onChange={(v) => setAutoPublish(v.includes("auto"))} />
            <Button variant="primary" loading={saving} onClick={handleSave}>Save preferences</Button>
          </BlockStack></Card></Layout.Section>

          <Layout.Section><Card><BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center"><Text variant="headingMd" as="h2">Usage</Text><Badge>{data.plan?.charAt(0).toUpperCase() + data.plan?.slice(1)}</Badge></InlineStack>
            <Text>{data.used} / {data.limit} posts this month</Text>
            <ProgressBar progress={Math.round((data.used / data.limit) * 100)} size="small" />
          </BlockStack></Card></Layout.Section>

          <Layout.Section><Text variant="headingMd" as="h2">Plans</Text></Layout.Section>
          {Object.entries(PLANS).map(([key, plan]) => (
            <Layout.Section variant="oneThird" key={key}><Card><BlockStack gap="300">
              <InlineStack gap="200"><Text variant="headingMd" as="h3">{plan.name}</Text>{key === data.plan && <Badge tone="success">Current</Badge>}</InlineStack>
              <Text variant="headingXl">{plan.price === 0 ? "Free" : `$${plan.price}/mo`}</Text>
              {plan.features.map(f => <Text key={f} variant="bodySm">{f}</Text>)}
              {key !== "free" && key !== data.plan && <Button variant="primary" loading={subscribing === key} onClick={() => handleSubscribe(key)}>Upgrade to {plan.name}</Button>}
            </BlockStack></Card></Layout.Section>
          ))}
        </Layout>
        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
