import { useState } from "react";
import { Page, Button, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function AdditionalPage() {
  const [status, setStatus] = useState(null);

  const handleSend = async () => {
    setStatus("sending");
    try {
      const res = await fetch("/api/receiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello from Additional" }),
      });

      const payload = await res.text();
      if (!res.ok) throw new Error(`Request failed: ${res.status} ${payload}`);

      setStatus("saved");
    } catch (err) {
      console.error("Send error:", err);
      setStatus("error");
    }
  };

  return (
    <Page>
      <TitleBar title="Additional page" />
      <Button onClick={handleSend}>send</Button>
      {status === "sending" && <Text>Sending…</Text>}
      {status === "saved" && <Text>Saved to log.</Text>}
      {status === "error" && <Text>Failed to save log.</Text>}
    </Page>
  );
}
