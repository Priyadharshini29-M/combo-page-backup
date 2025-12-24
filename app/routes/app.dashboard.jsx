import { useEffect, useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  RangeSlider,
  Checkbox,
  Button,
  ButtonGroup,
  Modal,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  getActiveDiscounts,
  getAllDiscounts,
  addDiscount,
} from "../data/discounts.sample";
import { authenticate } from "../shopify.server";

function PxField({
  label,
  value,
  onChange,
  min = 0,
  max = 2000,
  step = 1,
  suffix = "px",
}) {
  const handle = (v) => {
    const num = Number(v);
    if (Number.isNaN(num)) {
      onChange(0);
      return;
    }
    const clamped = Math.max(min, Math.min(max, num));
    onChange(clamped);
  };
  return (
    <TextField
      label={label}
      type="number"
      value={String(value ?? 0)}
      onChange={handle}
      suffix={suffix}
      autoComplete="off"
      inputMode="numeric"
    />
  );
}

const DEFAULT_COMBO_CONFIG = {
  container_padding_desktop: 0,
  container_padding_mobile: 0,
  container_padding_top_desktop: 0,
  container_padding_right_desktop: 0,
  container_padding_bottom_desktop: 0,
  container_padding_left_desktop: 0,
  container_padding_top_mobile: 0,
  container_padding_right_mobile: 0,
  container_padding_bottom_mobile: 0,
  container_padding_left_mobile: 0,
  banner_width_desktop: 100,
  banner_height_desktop: 300,
  banner_width_mobile: 100,
  banner_height_mobile: 200,
  banner_padding_top: 0,
  banner_padding_bottom: 10,
  preview_bg_color: "#e0ca9b",
  preview_text_color: "#333",
  preview_item_border_color: "#333",
  preview_height: 100,
  preview_font_size: 14,
  preview_item_size: 60,
  preview_border_radius: 5,
  preview_padding: 20,
  preview_padding_top: 0,
  preview_padding_bottom: 10,
  preview_margin_top: 0,
  preview_margin_bottom: 12,
  preview_alignment: "flex-start",
  preview_alignment_mobile: "flex-start",
  preview_original_price_size: 14,
  preview_discount_price_size: 18,
  preview_original_price_color: "#999",
  preview_discount_price_color: "#000",
  header_padding_top: 0,
  header_padding_bottom: 10,
  products_padding_top: 0,
  products_padding_bottom: 0,
  products_margin_top: 12,
  products_margin_bottom: 0,
  products_gap: 12,
  product_card_padding: 10,
  mobile_columns: "2",
  product_image_height_desktop: 250,
  product_image_height_mobile: 200,
  product_title_size_desktop: 14,
  product_title_size_mobile: 14,
  product_price_size_desktop: 16,
  product_price_size_mobile: 16,
  card_border_radius: 10,
  collection_title: "Build Your Combo",
  collection_description:
    "Select your favorite products and enjoy exclusive discounts",
  max_selections: 3,
  layout: "layout1",
  show_banner: true,
  preview_item_gap: 12,
  preview_font_weight: 600,
  preview_align_items: "center",
  preview_item_shape: "circle",
  heading_align: "left",
  heading_size: 28,
  heading_color: "#000000",
  heading_weight: 700,
  description_align: "left",
  description_size: 16,
  description_color: "#666666",
  description_weight: 400,
  desktop_columns: "3",
  card_height_desktop: 0,
  card_height_mobile: 0,
  discount_rule: "default",
  buy_btn_text: "Proceed to checkout",
  buy_btn_color: "#000",
  buy_btn_text_color: "#fff",
  buy_btn_font_size: 14,
  buy_btn_font_weight: 700,
  product_add_btn_text: "Add",
  product_add_btn_color: "#000",
  product_add_btn_text_color: "#fff",
  product_add_btn_font_size: 14,
  product_add_btn_font_weight: 600,
  has_discount_offer: false,
  selected_discount_id: null,
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const discountData = Object.fromEntries(formData);

    if (!discountData.title || !discountData.value) {
      return json({ error: "Title and value are required" }, { status: 400 });
    }

    const graphqlQuery = `
      mutation CreateCodeDiscount($input: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $input) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) {
                  edges {
                    node {
                      code
                    }
                  }
                }
              }
            }
          }
          userErrors {
            code
            message
            field
          }
        }
      }
    `;

    const isPercentage = discountData.type === "percentage";
    const discountValue = parseFloat(discountData.value);

    const variables = {
      input: {
        title: discountData.title,
        code: discountData.code.toUpperCase(),
        startsAt: discountData.startsAt || new Date().toISOString(),
        endsAt: discountData.endsAt || null,
        customerSelection: {
          all: true,
        },
        customerGets: {
          value: isPercentage
            ? {
                percentage: discountValue / 100,
              }
            : {
                discountAmount: {
                  amount: discountValue,
                  appliesOnEachItem: false,
                },
              },
          items: {
            all: true,
          },
        },
        appliesOncePerCustomer: discountData.oncePerCustomer === "on",
        usageLimit: null,
      },
    };

    const response = await fetch(
      `https://${session.shop}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({ query: graphqlQuery, variables }),
      },
    ).then((r) => r.json());

    console.log("Shopify API response:", response);

    if (response.errors) {
      console.error("GraphQL errors:", response.errors);
      return json(
        { error: response.errors[0]?.message || "Failed to create discount" },
        { status: 400 },
      );
    }

    if (response.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
      const userError = response.data.discountCodeBasicCreate.userErrors[0];
      console.error("Shopify user error:", userError);
      return json({ error: userError.message }, { status: 400 });
    }

    console.log("Discount created successfully on Shopify");

    // Persist to in-memory store so it shows in Discount Engine dashboard and dropdowns
    const nextId = Math.max(...getAllDiscounts().map((d) => d.id || 0), 0) + 1;
    const newDiscount = {
      id: nextId,
      title: discountData.title,
      type: discountData.type,
      value: discountData.value,
      status: "active",
      created: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      usage: "0 / Unlimited",
    };
    addDiscount(newDiscount);

    return json({
      success: true,
      message: "Discount code created in Shopify",
      discount: newDiscount,
    });
  } catch (error) {
    console.error("Discount creation error:", error);
    return json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
};

export const loader = async () => {
  const activeDiscounts = getActiveDiscounts().map((discount) => ({
    id: discount.id,
    title: discount.title,
    type: discount.type,
  }));

  return json({ activeDiscounts });
};

export default function Customize() {
  const shopify = useAppBridge();
  const { activeDiscounts = [] } = useLoaderData();
  const discountFetcher = useFetcher();

  const [config, setConfig] = useState(() => {
    try {
      const raw = localStorage.getItem("combo_design_config");
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_COMBO_CONFIG, ...parsed };
      }
      return DEFAULT_COMBO_CONFIG;
    } catch (e) {
      return DEFAULT_COMBO_CONFIG;
    }
  });

  const [previewDevice, setPreviewDevice] = useState("desktop");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState(
    config?.collection_title || "Untitled Template",
  );

  // Discount modal state
  const [createDiscountModalOpen, setCreateDiscountModalOpen] = useState(false);
  const [dTitle, setDTitle] = useState("");
  const [dCode, setDCode] = useState("");
  const [dType, setDType] = useState("percentage");
  const [dValue, setDValue] = useState("");
  const [dStartsAt, setDStartsAt] = useState("");
  const [dEndsAt, setDEndsAt] = useState("");
  const [dOncePerCustomer, setDOncePerCustomer] = useState(false);
  const [localActiveDiscounts, setLocalActiveDiscounts] =
    useState(activeDiscounts);

  // Handle discount creation response
  useEffect(() => {
    if (discountFetcher.data) {
      if (discountFetcher.data.success) {
        shopify.toast.show("Discount created successfully on Shopify!");

        setLocalActiveDiscounts((prev) => {
          const fromServer = discountFetcher.data.discount;
          const nextId = fromServer?.id
            ? Number(fromServer.id)
            : Math.max(...prev.map((d) => d.id || 0), 0) + 1;
          const newDiscount = fromServer ?? {
            id: nextId,
            title: dTitle,
            type: dType,
          };
          updateConfig("selected_discount_id", nextId);
          updateConfig("has_discount_offer", true);
          return [...prev, newDiscount];
        });

        // Reset form and close modal
        setDTitle("");
        setDCode("");
        setDType("percentage");
        setDValue("");
        setDStartsAt("");
        setDEndsAt("");
        setDOncePerCustomer(false);
        setCreateDiscountModalOpen(false);
      } else if (discountFetcher.data.error) {
        shopify.toast.show(discountFetcher.data.error, { isError: true });
      }
    }
  }, [discountFetcher.data, dTitle, dType, shopify]);

  useEffect(() => {
    localStorage.setItem("combo_design_config", JSON.stringify(config));
  }, [config]);

  const updateConfig = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateBoth = (keyA, keyB, value) => {
    setConfig((prev) => ({ ...prev, [keyA]: value, [keyB]: value }));
  };

  const confirmSaveTemplate = async () => {
    try {
      await fetch("/app/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: (saveTitle || "Untitled Template").trim(),
          config,
        }),
      });
    } finally {
      setSaveModalOpen(false);
    }
  };

  const handleCreateDiscount = () => {
    if (!dTitle || !dValue) {
      shopify.toast.show(
        "Please fill in all required fields (Title and Value)",
        {
          isError: true,
        },
      );
      return;
    }

    const formData = new FormData();
    formData.append("title", dTitle);
    formData.append("code", dCode || dTitle.toUpperCase().replace(/\s+/g, ""));
    formData.append("type", dType);
    formData.append("value", dValue);
    formData.append("startsAt", dStartsAt || new Date().toISOString());
    formData.append("endsAt", dEndsAt || "");
    formData.append("oncePerCustomer", dOncePerCustomer ? "on" : "off");

    discountFetcher.submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar
        title="Customize Template"
        subtitle="Design your combo builder layout and styling"
        primaryAction={{
          content: "Save Template",
          onAction: () => setSaveModalOpen(true),
        }}
        secondaryActions={[
          {
            content: "Reset to Default",
            onAction: () => {
              if (
                confirm(
                  "Are you sure you want to reset all settings to default?",
                )
              ) {
                setConfig(DEFAULT_COMBO_CONFIG);
              }
            },
          },
        ]}
      />
      <Modal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Save Template"
        primaryAction={{ content: "Save", onAction: confirmSaveTemplate }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setSaveModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Template Title"
              value={saveTitle}
              onChange={setSaveTitle}
              autoComplete="off"
            />
            <p style={{ color: "#666", marginTop: 4 }}>
              Confirm to save the current customization as a template.
            </p>
          </FormLayout>
        </Modal.Section>
      </Modal>
      {/* Inline top-right actions (non-sticky, no background) */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 12,
          flexWrap: "wrap",
          margin: "8px 0",
        }}
      >
        <Button
          onClick={() => {
            if (
              confirm("Are you sure you want to reset all settings to default?")
            ) {
              setConfig(DEFAULT_COMBO_CONFIG);
            }
          }}
        >
          Reset to Default
        </Button>
        <Button variant="primary" onClick={() => setSaveModalOpen(true)}>
          Save Template
        </Button>
      </div>
      <Layout>
        <Layout.Section variant="oneHalf">
          <div style={{ position: "sticky", top: 16, zIndex: 10 }}>
            <Card title="Preview" sectioned>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 12,
                  alignItems: "center",
                }}
              >
                <Select
                  label="Layout"
                  options={[
                    { label: "Layout 1", value: "layout1" },
                    { label: "Layout 2", value: "layout2" },
                    { label: "Layout 3", value: "layout3" },
                    { label: "Layout 4", value: "layout4" },
                  ]}
                  value={config.layout}
                  onChange={(v) => updateConfig("layout", v)}
                />
                <ButtonGroup>
                  <Button
                    pressed={previewDevice === "desktop"}
                    onClick={() => setPreviewDevice("desktop")}
                  >
                    Desktop
                  </Button>
                  <Button
                    pressed={previewDevice === "mobile"}
                    onClick={() => setPreviewDevice("mobile")}
                  >
                    Mobile
                  </Button>
                </ButtonGroup>
              </div>
              <div
                style={{
                  border: "1px solid #e0e0e0",
                  borderRadius: 8,
                  overflow: "hidden",
                  minHeight: 600,
                }}
              >
                <ComboPreview config={config} device={previewDevice} />
              </div>
            </Card>
          </div>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          {/* Discount Question - FIRST CARD */}
          <Card title="Discount Offer" sectioned>
            <FormLayout>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#202223",
                      display: "block",
                      marginBottom: "8px",
                    }}
                  >
                    Do you have a discount offer?
                  </label>
                </div>
                <ButtonGroup segmented>
                  <Button
                    pressed={config.has_discount_offer === true}
                    onClick={() => {
                      updateConfig("has_discount_offer", true);
                      if (
                        localActiveDiscounts.length > 0 &&
                        !config.selected_discount_id
                      ) {
                        updateConfig(
                          "selected_discount_id",
                          localActiveDiscounts[0].id,
                        );
                      }
                    }}
                  >
                    Yes
                  </Button>
                  <Button
                    pressed={config.has_discount_offer === false}
                    onClick={() => {
                      updateConfig("has_discount_offer", false);
                      updateConfig("selected_discount_id", null);
                    }}
                  >
                    No
                  </Button>
                </ButtonGroup>
              </div>

              {config.has_discount_offer === true && (
                <div>
                  <Select
                    label="Select Active Discount"
                    options={[
                      { label: "-- Choose a discount --", value: "" },
                      ...localActiveDiscounts.map((discount) => ({
                        label: `${discount.title} (${discount.type || "custom"})`,
                        value: String(discount.id),
                      })),
                    ]}
                    value={String(config.selected_discount_id || "")}
                    onChange={(v) =>
                      updateConfig("selected_discount_id", v ? Number(v) : null)
                    }
                    placeholder={
                      localActiveDiscounts.length === 0
                        ? "No active discounts available"
                        : undefined
                    }
                  />
                </div>
              )}

              {config.has_discount_offer === false && (
                <div>
                  <Button
                    primary
                    onClick={() => setCreateDiscountModalOpen(true)}
                  >
                    Create Discount
                  </Button>
                </div>
              )}
            </FormLayout>
          </Card>

          <Card title="Container Settings" sectioned>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                width: "100%",
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <PxField
                  label="Desktop Padding Vertical (px)"
                  value={config.container_padding_top_desktop}
                  onChange={(v) =>
                    updateBoth(
                      "container_padding_top_desktop",
                      "container_padding_bottom_desktop",
                      v,
                    )
                  }
                  min={0}
                  max={100}
                />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <PxField
                  label="Desktop Padding Horizontal (px)"
                  value={config.container_padding_left_desktop}
                  onChange={(v) =>
                    updateBoth(
                      "container_padding_left_desktop",
                      "container_padding_right_desktop",
                      v,
                    )
                  }
                  min={0}
                  max={100}
                />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <PxField
                  label="Mobile Padding Vertical (px)"
                  value={config.container_padding_top_mobile}
                  onChange={(v) =>
                    updateBoth(
                      "container_padding_top_mobile",
                      "container_padding_bottom_mobile",
                      v,
                    )
                  }
                  min={0}
                  max={100}
                />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <PxField
                  label="Mobile Padding Horizontal (px)"
                  value={config.container_padding_left_mobile}
                  onChange={(v) =>
                    updateBoth(
                      "container_padding_left_mobile",
                      "container_padding_right_mobile",
                      v,
                    )
                  }
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </Card>

          <Card title="Banner Settings" sectioned>
            <FormLayout>
              <Checkbox
                label="Show banner"
                checked={!!config.show_banner}
                onChange={(checked) => updateConfig("show_banner", checked)}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  width: "100%",
                }}
              >
                <div style={{ minWidth: 180 }}>
                  <RangeSlider
                    label="Desktop Banner Width (%)"
                    value={config.banner_width_desktop}
                    onChange={(v) => updateConfig("banner_width_desktop", v)}
                    min={50}
                    max={100}
                    step={5}
                    output
                  />
                </div>
                <div style={{ minWidth: 180 }}>
                  <PxField
                    label="Desktop Banner Height (px)"
                    value={config.banner_height_desktop}
                    onChange={(v) => updateConfig("banner_height_desktop", v)}
                    min={150}
                    max={600}
                  />
                </div>
                <div style={{ minWidth: 180 }}>
                  <RangeSlider
                    label="Mobile Banner Width (%)"
                    value={config.banner_width_mobile}
                    onChange={(v) => updateConfig("banner_width_mobile", v)}
                    min={50}
                    max={100}
                    step={5}
                    output
                  />
                </div>
                <div style={{ minWidth: 180 }}>
                  <PxField
                    label="Mobile Banner Height (px)"
                    value={config.banner_height_mobile}
                    onChange={(v) => updateConfig("banner_height_mobile", v)}
                    min={100}
                    max={400}
                  />
                </div>
              </div>
              <PxField
                label="Banner Padding Vertical (px)"
                value={config.banner_padding_top}
                onChange={(v) =>
                  updateBoth("banner_padding_top", "banner_padding_bottom", v)
                }
                min={0}
                max={80}
              />
            </FormLayout>
          </Card>

          <Card title="Preview Bar Settings" sectioned>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <TextField
                label="Background Color"
                value={config.preview_bg_color}
                onChange={(v) => updateConfig("preview_bg_color", v)}
                type="text"
              />
              <TextField
                label="Text Color"
                value={config.preview_text_color}
                onChange={(v) => updateConfig("preview_text_color", v)}
                type="text"
              />
              <TextField
                label="Item Border Color"
                value={config.preview_item_border_color}
                onChange={(v) => updateConfig("preview_item_border_color", v)}
                type="text"
              />
              <PxField
                label="Preview Bar Height (px)"
                value={config.preview_height}
                onChange={(v) => updateConfig("preview_height", v)}
                min={60}
                max={200}
              />
              <PxField
                label="Preview Font Size (px)"
                value={config.preview_font_size}
                onChange={(v) => updateConfig("preview_font_size", v)}
                min={12}
                max={24}
              />
              <Select
                label="Font Weight"
                options={[
                  { label: "400", value: "400" },
                  { label: "500", value: "500" },
                  { label: "600", value: "600" },
                  { label: "700", value: "700" },
                ]}
                value={String(config.preview_font_weight)}
                onChange={(v) => updateConfig("preview_font_weight", Number(v))}
              />
              <PxField
                label="Preview Item Size (px)"
                value={config.preview_item_size}
                onChange={(v) => updateConfig("preview_item_size", v)}
                min={40}
                max={120}
              />
              <PxField
                label="Preview Item Gap (px)"
                value={config.preview_item_gap}
                onChange={(v) => updateConfig("preview_item_gap", v)}
                min={0}
                max={32}
              />
              <PxField
                label="Border Radius (px)"
                value={config.preview_border_radius}
                onChange={(v) => updateConfig("preview_border_radius", v)}
                min={0}
                max={50}
              />
              <PxField
                label="Padding (px)"
                value={config.preview_padding}
                onChange={(v) => updateConfig("preview_padding", v)}
                min={5}
                max={30}
              />
              <PxField
                label="Padding Vertical (px)"
                value={config.preview_padding_top}
                onChange={(v) =>
                  updateBoth("preview_padding_top", "preview_padding_bottom", v)
                }
                min={0}
                max={80}
              />
              <PxField
                label="Margin Vertical (px)"
                value={config.preview_margin_top}
                onChange={(v) =>
                  updateBoth("preview_margin_top", "preview_margin_bottom", v)
                }
                min={0}
                max={80}
              />
              <Select
                label="Align Items (vertical)"
                options={[
                  { label: "Start", value: "flex-start" },
                  { label: "Center", value: "center" },
                  { label: "End", value: "flex-end" },
                ]}
                value={config.preview_align_items}
                onChange={(v) => updateConfig("preview_align_items", v)}
              />
              <Select
                label="Items Alignment"
                options={[
                  { label: "Left", value: "flex-start" },
                  { label: "Center", value: "center" },
                  { label: "Right", value: "flex-end" },
                  { label: "Space Between", value: "space-between" },
                ]}
                value={config.preview_alignment}
                onChange={(v) => updateConfig("preview_alignment", v)}
              />
              <Select
                label="Items Alignment (Mobile)"
                options={[
                  { label: "Left", value: "flex-start" },
                  { label: "Center", value: "center" },
                  { label: "Right", value: "flex-end" },
                  { label: "Space Between", value: "space-between" },
                ]}
                value={config.preview_alignment_mobile}
                onChange={(v) => updateConfig("preview_alignment_mobile", v)}
              />
              <Select
                label="Preview Image Shape"
                options={[
                  { label: "Circle", value: "circle" },
                  { label: "Square", value: "square" },
                  { label: "Rectangle", value: "rectangle" },
                ]}
                value={config.preview_item_shape}
                onChange={(v) => updateConfig("preview_item_shape", v)}
              />
              <PxField
                label="Original Price Font Size (px)"
                value={config.preview_original_price_size}
                onChange={(v) => updateConfig("preview_original_price_size", v)}
                min={12}
                max={24}
              />
              <PxField
                label="Discount Price Font Size (px)"
                value={config.preview_discount_price_size}
                onChange={(v) => updateConfig("preview_discount_price_size", v)}
                min={12}
                max={28}
              />
              <TextField
                label="Original Price Color"
                value={config.preview_original_price_color}
                onChange={(v) =>
                  updateConfig("preview_original_price_color", v)
                }
                type="text"
              />
              <TextField
                label="Discount Price Color"
                value={config.preview_discount_price_color}
                onChange={(v) =>
                  updateConfig("preview_discount_price_color", v)
                }
                type="text"
              />
            </div>
          </Card>

          <Card title="Product Grid Settings" sectioned>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <Select
                label="Desktop Columns"
                options={[
                  { label: "2 Columns", value: "2" },
                  { label: "3 Columns", value: "3" },
                  { label: "4 Columns", value: "4" },
                ]}
                value={config.desktop_columns}
                onChange={(v) => updateConfig("desktop_columns", v)}
              />
              <PxField
                label="Header Padding Vertical (px)"
                value={config.header_padding_top}
                onChange={(v) =>
                  updateBoth("header_padding_top", "header_padding_bottom", v)
                }
                min={0}
                max={80}
              />
              <PxField
                label="Products Padding Vertical (px)"
                value={config.products_padding_top}
                onChange={(v) =>
                  updateBoth(
                    "products_padding_top",
                    "products_padding_bottom",
                    v,
                  )
                }
                min={0}
                max={80}
              />
              <PxField
                label="Products Margin Vertical (px)"
                value={config.products_margin_top}
                onChange={(v) =>
                  updateBoth("products_margin_top", "products_margin_bottom", v)
                }
                min={0}
                max={80}
              />
              <PxField
                label="Product Card Padding (px)"
                value={config.product_card_padding}
                onChange={(v) => updateConfig("product_card_padding", v)}
                min={0}
                max={30}
              />
              <PxField
                label="Products Gap (px)"
                value={config.products_gap}
                onChange={(v) => updateConfig("products_gap", v)}
                min={0}
                max={32}
              />
              <Select
                label="Mobile Columns"
                options={[
                  { label: "1 Column", value: "1" },
                  { label: "2 Columns", value: "2" },
                ]}
                value={config.mobile_columns}
                onChange={(v) => updateConfig("mobile_columns", v)}
              />
              <PxField
                label="Image Height Desktop (px)"
                value={config.product_image_height_desktop}
                onChange={(v) =>
                  updateConfig("product_image_height_desktop", v)
                }
                min={150}
                max={400}
              />
              <PxField
                label="Image Height Mobile (px)"
                value={config.product_image_height_mobile}
                onChange={(v) => updateConfig("product_image_height_mobile", v)}
                min={120}
                max={350}
              />
              <PxField
                label="Title Font Size Desktop (px)"
                value={config.product_title_size_desktop}
                onChange={(v) => updateConfig("product_title_size_desktop", v)}
                min={12}
                max={28}
              />
              <PxField
                label="Title Font Size Mobile (px)"
                value={config.product_title_size_mobile}
                onChange={(v) => updateConfig("product_title_size_mobile", v)}
                min={12}
                max={28}
              />
              <PxField
                label="Price Font Size Desktop (px)"
                value={config.product_price_size_desktop}
                onChange={(v) => updateConfig("product_price_size_desktop", v)}
                min={12}
                max={28}
              />
              <PxField
                label="Price Font Size Mobile (px)"
                value={config.product_price_size_mobile}
                onChange={(v) => updateConfig("product_price_size_mobile", v)}
                min={12}
                max={28}
              />
              <PxField
                label="Card Border Radius (px)"
                value={config.card_border_radius}
                onChange={(v) => updateConfig("card_border_radius", v)}
                min={0}
                max={24}
              />
              <PxField
                label="Card Height Desktop (px, 0 = auto)"
                value={config.card_height_desktop}
                onChange={(v) => updateConfig("card_height_desktop", v)}
                min={0}
                max={800}
              />
              <PxField
                label="Card Height Mobile (px, 0 = auto)"
                value={config.card_height_mobile}
                onChange={(v) => updateConfig("card_height_mobile", v)}
                min={0}
                max={800}
              />
            </div>
          </Card>

          <Card title="Content Settings" sectioned>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <TextField
                label="Collection Title"
                value={config.collection_title}
                onChange={(v) => updateConfig("collection_title", v)}
              />
              <TextField
                label="Collection Description"
                value={config.collection_description}
                onChange={(v) => updateConfig("collection_description", v)}
                multiline={3}
              />
              <Select
                label="Heading Alignment"
                options={[
                  { label: "Left", value: "left" },
                  { label: "Center", value: "center" },
                  { label: "Right", value: "right" },
                ]}
                value={config.heading_align}
                onChange={(v) => updateConfig("heading_align", v)}
              />
              <PxField
                label="Heading Size (px)"
                value={config.heading_size}
                onChange={(v) => updateConfig("heading_size", v)}
                min={16}
                max={48}
              />
              <Select
                label="Heading Weight"
                options={[
                  { label: "400", value: "400" },
                  { label: "500", value: "500" },
                  { label: "600", value: "600" },
                  { label: "700", value: "700" },
                ]}
                value={String(config.heading_weight)}
                onChange={(v) => updateConfig("heading_weight", Number(v))}
              />
              <TextField
                label="Heading Color"
                value={config.heading_color}
                onChange={(v) => updateConfig("heading_color", v)}
              />
              <Select
                label="Description Alignment"
                options={[
                  { label: "Left", value: "left" },
                  { label: "Center", value: "center" },
                  { label: "Right", value: "right" },
                ]}
                value={config.description_align}
                onChange={(v) => updateConfig("description_align", v)}
              />
              <PxField
                label="Description Size (px)"
                value={config.description_size}
                onChange={(v) => updateConfig("description_size", v)}
                min={12}
                max={32}
              />
              <Select
                label="Description Weight"
                options={[
                  { label: "300", value: "300" },
                  { label: "400", value: "400" },
                  { label: "500", value: "500" },
                  { label: "600", value: "600" },
                  { label: "700", value: "700" },
                ]}
                value={String(config.description_weight)}
                onChange={(v) => updateConfig("description_weight", Number(v))}
              />
              <TextField
                label="Description Color"
                value={config.description_color}
                onChange={(v) => updateConfig("description_color", v)}
              />
            </div>
          </Card>

          <Card title="Proceed to Checkout Button Settings" sectioned>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <TextField
                label="Button Text"
                value={config.buy_btn_text}
                onChange={(v) => updateConfig("buy_btn_text", v)}
              />
              <TextField
                label="Button Color (Hex)"
                value={config.buy_btn_color}
                onChange={(v) => updateConfig("buy_btn_color", v)}
              />
              <TextField
                label="Text Color (Hex)"
                value={config.buy_btn_text_color}
                onChange={(v) => updateConfig("buy_btn_text_color", v)}
              />
              <PxField
                label="Font Size (px)"
                value={config.buy_btn_font_size}
                onChange={(v) => updateConfig("buy_btn_font_size", v)}
                min={10}
                max={28}
              />
              <Select
                label="Font Weight"
                options={[
                  { label: "400", value: "400" },
                  { label: "500", value: "500" },
                  { label: "600", value: "600" },
                  { label: "700", value: "700" },
                ]}
                value={String(config.buy_btn_font_weight)}
                onChange={(v) => updateConfig("buy_btn_font_weight", Number(v))}
              />
            </div>
          </Card>

          <Card title="Product Card Add Button Settings" sectioned>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <TextField
                label="Button Text"
                value={config.product_add_btn_text}
                onChange={(v) => updateConfig("product_add_btn_text", v)}
              />
              <TextField
                label="Button Color (Hex)"
                value={config.product_add_btn_color}
                onChange={(v) => updateConfig("product_add_btn_color", v)}
              />
              <TextField
                label="Text Color (Hex)"
                value={config.product_add_btn_text_color}
                onChange={(v) => updateConfig("product_add_btn_text_color", v)}
              />
              <PxField
                label="Font Size (px)"
                value={config.product_add_btn_font_size}
                onChange={(v) => updateConfig("product_add_btn_font_size", v)}
                min={10}
                max={28}
              />
              <Select
                label="Font Weight"
                options={[
                  { label: "400", value: "400" },
                  { label: "500", value: "500" },
                  { label: "600", value: "600" },
                  { label: "700", value: "700" },
                ]}
                value={String(config.product_add_btn_font_weight)}
                onChange={(v) =>
                  updateConfig("product_add_btn_font_weight", Number(v))
                }
              />
            </div>
          </Card>

          <Card title="Discount Settings" sectioned>
            <FormLayout>
              {/* Max Selections */}
              <RangeSlider
                label="Max Selections"
                value={config.max_selections}
                onChange={(v) => updateConfig("max_selections", v)}
                min={1}
                max={10}
                step={1}
                output
              />
            </FormLayout>
          </Card>
        </Layout.Section>
      </Layout>
      {/* Bottom action buttons removed; actions are now in the top TitleBar */}

      {/* Discount Creation Modal */}
      <Modal
        open={createDiscountModalOpen}
        onClose={() => {
          setCreateDiscountModalOpen(false);
          setDTitle("");
          setDCode("");
          setDType("percentage");
          setDValue("");
          setDStartsAt("");
          setDEndsAt("");
          setDOncePerCustomer(false);
        }}
        title="Create Discount"
        primaryAction={{
          content: "Create",
          onAction: handleCreateDiscount,
          loading: discountFetcher.state === "submitting",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setCreateDiscountModalOpen(false);
              setDTitle("");
              setDCode("");
              setDType("percentage");
              setDValue("");
              setDStartsAt("");
              setDEndsAt("");
              setDOncePerCustomer(false);
            },
          },
        ]}
      >
        <Modal.Section>
          <div style={{ padding: "8px 0" }}>
            {/* Title and Code */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "20px",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Title *
                </label>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  Shown in Shopify Admin discounts
                </span>
                <input
                  required
                  value={dTitle}
                  onChange={(e) => setDTitle(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#667eea")}
                  onBlur={(e) => (e.target.style.borderColor = "#D1D5DB")}
                  placeholder="Summer Sale 20% Off"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Code *
                </label>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  Must be unique. Try a distinctive name
                </span>
                <input
                  required
                  value={dCode}
                  onChange={(e) => setDCode(e.target.value.toUpperCase())}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#667eea")}
                  onBlur={(e) => (e.target.style.borderColor = "#D1D5DB")}
                  placeholder="SAVE10WINTER"
                />
              </div>
            </div>

            {/* Type and Value */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "20px",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Type *
                </label>
                <select
                  value={dType}
                  onChange={(e) => setDType(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                  required
                >
                  <option value="percentage">Percentage off (%)</option>
                  <option value="amount">Fixed amount off</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Value *
                </label>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  {dType === "percentage"
                    ? "Enter 0–100"
                    : "Enter amount in your store currency"}
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={dValue}
                  onChange={(e) => setDValue(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                  }}
                  placeholder={dType === "percentage" ? "10" : "20"}
                />
              </div>
            </div>

            {/* Dates */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "20px",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Starts at
                </label>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  When the discount becomes active
                </span>
                <input
                  type="datetime-local"
                  value={dStartsAt}
                  onChange={(e) => setDStartsAt(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Ends at
                </label>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  Leave blank for no expiration
                </span>
                <input
                  type="datetime-local"
                  value={dEndsAt}
                  onChange={(e) => setDEndsAt(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            {/* Once per customer */}
            <div style={{ marginBottom: "8px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={dOncePerCustomer}
                  onChange={(e) => setDOncePerCustomer(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: "14px", color: "#111" }}>
                  Apply once per customer
                </span>
              </label>
            </div>
          </div>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function ComboPreview({ config, device }) {
  const isMobile = device === "mobile";
  const paddingTop = isMobile
    ? config.container_padding_top_mobile
    : config.container_padding_top_desktop;
  const paddingRight = isMobile
    ? config.container_padding_right_mobile
    : config.container_padding_right_desktop;
  const paddingBottom = isMobile
    ? config.container_padding_bottom_mobile
    : config.container_padding_bottom_desktop;
  const paddingLeft = isMobile
    ? config.container_padding_left_mobile
    : config.container_padding_left_desktop;
  const bannerWidth = isMobile
    ? config.banner_width_mobile
    : config.banner_width_desktop;
  const bannerHeight = isMobile
    ? config.banner_height_mobile
    : config.banner_height_desktop;
  const previewAlignment = isMobile
    ? config.preview_alignment_mobile
    : config.preview_alignment;
  const previewJustify = previewAlignment;
  const previewGap = config.preview_item_gap ?? 12;
  const previewShape = config.preview_item_shape || "circle";
  const previewItemSize = config.preview_item_size;
  const previewAlignItems = config.preview_align_items || "center";
  const previewFontWeight = config.preview_font_weight || 600;
  const viewportWidth = isMobile ? 430 : 1280;
  const columns = isMobile ? config.mobile_columns : config.desktop_columns;
  const numericColumns = Math.max(1, Number(columns) || 1);
  const gridGap = Number(config.products_gap ?? 12);
  const effectiveColumns = numericColumns; // Width is adaptive; keep selected columns
  const cardHeight = isMobile
    ? config.card_height_mobile
    : config.card_height_desktop;
  const productImageHeight = isMobile
    ? config.product_image_height_mobile
    : config.product_image_height_desktop;
  const headingAlign = config.heading_align || "left";
  const descriptionAlign = config.description_align || "left";

  const shapeStyles = (baseSize) => {
    if (previewShape === "circle")
      return { width: baseSize, height: baseSize, borderRadius: "50%" };
    if (previewShape === "rectangle")
      return {
        width: baseSize * 1.4,
        height: baseSize * 0.8,
        borderRadius: config.preview_border_radius,
      };
    return {
      width: baseSize,
      height: baseSize,
      borderRadius: config.preview_border_radius,
    };
  };

  return (
    <div style={{ background: "#eef1f5", padding: 16 }}>
      <div
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          paddingTop: paddingTop,
          paddingRight: paddingRight,
          paddingBottom: paddingBottom,
          paddingLeft: paddingLeft,
          background: "#f9f9f9",
          maxWidth: viewportWidth,
          margin: "0 auto",
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
        }}
      >
        {/* Banner */}
        {config.show_banner && (
          <div
            style={{
              width: `${bannerWidth}%`,
              height: bannerHeight,
              background: "#e0e0e0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: config.banner_padding_top,
              paddingBottom: config.banner_padding_bottom,
            }}
          >
            <span style={{ color: "#999" }}>Banner Image</span>
          </div>
        )}

        {/* Preview Bar */}
        <div
          style={{
            background: config.preview_bg_color,
            color: config.preview_text_color,
            borderRadius: config.preview_border_radius,
            padding: config.preview_padding,
            minHeight: config.preview_height,
            fontSize: config.preview_font_size,
            fontWeight: previewFontWeight,
            display: "flex",
            alignItems: previewAlignItems,
            gap: 20,
            flexWrap: "wrap",
            justifyContent: previewJustify,
            paddingTop: config.preview_padding_top,
            paddingBottom: config.preview_padding_bottom,
            marginTop: config.preview_margin_top,
            marginBottom: config.preview_margin_bottom,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: previewGap,
              alignItems: previewAlignItems,
            }}
          >
            {[...Array(config.max_selections)].map((_, i) => {
              const shape = shapeStyles(previewItemSize);
              return (
                <div
                  key={i}
                  style={{
                    ...shape,
                    border: `2px dashed ${config.preview_item_border_color}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: config.preview_item_border_color,
                  }}
                >
                  +
                </div>
              );
            })}
          </div>
          <div
            style={{ display: "flex", gap: 6, alignItems: previewAlignItems }}
          >
            <span
              style={{
                fontSize: config.preview_original_price_size,
                color: config.preview_original_price_color,
              }}
            >
              Total price ={" "}
              <span style={{ textDecoration: "line-through" }}>Rs.0</span>
            </span>
            <span
              style={{
                fontSize: config.preview_discount_price_size,
                color: config.preview_discount_price_color,
                fontWeight: 700,
              }}
            >
              Rs.0
            </span>
            <button
              style={{
                background: config.buy_btn_color,
                color: config.buy_btn_text_color,
                border: "none",
                padding: "8px 14px",
                borderRadius: 6,
                fontWeight: config.buy_btn_font_weight,
                fontSize: config.buy_btn_font_size,
                cursor: "pointer",
              }}
            >
              {config.buy_btn_text}
            </button>
          </div>
        </div>

        {/* Title & Description */}
        <div
          style={{
            paddingTop: config.header_padding_top,
            paddingBottom: config.header_padding_bottom,
            textAlign: headingAlign,
          }}
        >
          <h1
            style={{
              fontSize: config.heading_size,
              marginBottom: 4,
              color: config.heading_color,
              fontWeight: config.heading_weight,
              textAlign: headingAlign,
            }}
          >
            {config.collection_title}
          </h1>
          <p
            style={{
              fontSize: config.description_size,
              color: config.description_color,
              fontWeight: config.description_weight,
              textAlign: descriptionAlign,
            }}
          >
            {config.collection_description}
          </p>
        </div>

        {/* Products Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${effectiveColumns}, 1fr)`,
            gap: gridGap,
            paddingTop: config.products_padding_top,
            paddingBottom: config.products_padding_bottom,
            width: "100%",
            boxSizing: "border-box",
            alignItems: "start",
            justifyItems: "stretch",
            marginTop: config.products_margin_top,
            marginBottom: config.products_margin_bottom,
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                border: "2px solid #eee",
                borderRadius: config.card_border_radius,
                overflow: "hidden",
                background: "white",
                minHeight: cardHeight || undefined,
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: productImageHeight,
                  background: "#f5f5f5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ color: "#999" }}>Product {i}</span>
              </div>
              <div style={{ padding: config.product_card_padding }}>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 6,
                    fontSize: isMobile
                      ? config.product_title_size_mobile
                      : config.product_title_size_desktop,
                  }}
                >
                  Product {i} Title
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 12,
                    fontSize: isMobile
                      ? config.product_price_size_mobile
                      : config.product_price_size_desktop,
                  }}
                >
                  Rs.500
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 12,
                    borderTop: "1px solid #eee",
                  }}
                >
                  <button
                    style={{
                      width: 32,
                      height: 32,
                      border: "1px solid #ddd",
                      background: "white",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    −
                  </button>
                  <div
                    style={{
                      flexGrow: 1,
                      textAlign: "center",
                      fontWeight: 600,
                    }}
                  >
                    0
                  </div>
                  <button
                    style={{
                      width: 32,
                      height: 32,
                      border: "1px solid #ddd",
                      background: "white",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    +
                  </button>
                  <button
                    style={{
                      background: config.product_add_btn_color,
                      color: config.product_add_btn_text_color,
                      border: "none",
                      padding: "8px 12px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontWeight: config.product_add_btn_font_weight,
                      fontSize: config.product_add_btn_font_size,
                    }}
                  >
                    {config.product_add_btn_text}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
