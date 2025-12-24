import { Page, Button } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "@remix-run/react";

export default function SendPage() {
  const navigate = useNavigate();

  const handleSend = () => {
    navigate("/receiver", { state: { message: "Hello from Send" } });
  };

  return (
    <Page>
      <TitleBar title="Send" />
      <Button onClick={handleSend}>Send</Button>
    </Page>
  );
}
