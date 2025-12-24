import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  Checkbox,
  Modal,
  FormLayout,
  Text,
  Box,
  BlockStack,
  InlineStack,
  Badge,
  EmptyState,
  Divider,
  IndexTable,
  useIndexResourceState,
  Popover,
  ActionList,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
  DuplicateIcon,
  ChevronDownIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getAllDiscounts } from "../data/discounts.sample";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const discounts = getAllDiscounts();
  return json({ discounts });
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

    if (response.errors) {
      return json(
        { error: response.errors[0]?.message || "Failed to create discount" },
        { status: 400 },
      );
    }

    if (response.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
      const userError = response.data.discountCodeBasicCreate.userErrors[0];
      return json({ error: userError.message }, { status: 400 });
    }

    return json({ success: true, message: "Discount code created in Shopify" });
  } catch (error) {
    console.error("Discount creation error:", error);
    return json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
};

export default function DiscountEngine() {
  const shopify = useAppBridge();
  const { discounts: initialDiscounts } = useLoaderData();
  const fetcher = useFetcher();
  const [discounts, setDiscounts] = useState(initialDiscounts);

  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [popoverActive, setPopoverActive] = useState(null);

  // Shopify Code Form state
  const [dTitle, setDTitle] = useState("");
  const [dCode, setDCode] = useState("");
  const [dType, setDType] = useState("percentage");
  const [dValue, setDValue] = useState("");
  const [dStartsAt, setDStartsAt] = useState("");
  const [dEndsAt, setDEndsAt] = useState("");
  const [dOncePerCustomer, setDOncePerCustomer] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "percentage",
    value: "",
    conditions: "all_products",
    minPurchase: "",
    maxUsage: "",
    startDate: "",
    endDate: "",
    active: true,
  });

  const handleCreateDiscount = () => {
    setEditingDiscount(null);
    setFormData({
      title: "",
      description: "",
      type: "percentage",
      value: "",
      conditions: "all_products",
      minPurchase: "",
      maxUsage: "",
      startDate: "",
      endDate: "",
      active: true,
    });
    setDiscountModalOpen(true);
  };

  const handleEditDiscount = (discount) => {
    setEditingDiscount(discount);
    setFormData({
      title: discount.title,
      description: "",
      type: discount.type,
      value: discount.value,
      conditions: "all_products",
      minPurchase: "",
      maxUsage: "",
      startDate: "",
      endDate: "",
      active: discount.status === "active",
    });
    setDiscountModalOpen(true);
  };

  const handleSaveDiscount = () => {
    if (!formData.title || !formData.value) {
      shopify.toast.show("Please fill in all required fields", {
        isError: true,
      });
      return;
    }

    if (editingDiscount) {
      setDiscounts(
        discounts.map((d) =>
          d.id === editingDiscount.id
            ? {
                ...d,
                title: formData.title,
                value: formData.value,
                type: formData.type,
                status: formData.active ? "active" : "inactive",
              }
            : d,
        ),
      );
      shopify.toast.show("Discount updated successfully");
    } else {
      const newDiscount = {
        id: Math.max(...discounts.map((d) => d.id), 0) + 1,
        title: formData.title,
        type: formData.type,
        value: formData.value,
        status: formData.active ? "active" : "inactive",
        created: new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
        usage: "0 / " + (formData.maxUsage || "Unlimited"),
      };
      setDiscounts([...discounts, newDiscount]);
      shopify.toast.show("Discount created successfully");
    }

    setDiscountModalOpen(false);
  };

  const handleDeleteDiscount = (id) => {
    setDiscounts(discounts.filter((d) => d.id !== id));
    setPopoverActive(null);
    shopify.toast.show("Discount deleted");
  };

  const handleDuplicateDiscount = (discount) => {
    const newDiscount = {
      ...discount,
      id: Math.max(...discounts.map((d) => d.id), 0) + 1,
      title: `${discount.title} (Copy)`,
    };
    setDiscounts([...discounts, newDiscount]);
    setPopoverActive(null);
    shopify.toast.show("Discount duplicated");
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { color: "success", label: "Active" },
      inactive: { color: "attention", label: "Inactive" },
      scheduled: { color: "warning", label: "Scheduled" },
      expired: { color: "subdued", label: "Expired" },
    };
    const config = statusConfig[status] || statusConfig.inactive;
    return <Badge tone={config.color}>{config.label}</Badge>;
  };

  const getTypeLabel = (type) => {
    const typeMap = {
      percentage: "% Discount",
      fixed: "₹ Fixed",
      bogo: "Buy One Get One",
      volume: "Volume Discount",
    };
    return typeMap[type] || type;
  };

  const activeDiscounts = discounts.filter((d) => d.status === "active").length;
  const totalDiscounts = discounts.length;

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(
      discounts.map((discount) => ({
        ...discount,
        id: `discount-${discount.id}`,
      })),
    );

  return (
    <Page>
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          padding: "32px 24px",
          marginBottom: "32px",
          borderRadius: "12px",
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h1
            style={{ fontSize: "32px", fontWeight: "700", margin: "0 0 8px 0" }}
          >
            Discount Engine
          </h1>
          <p style={{ fontSize: "14px", opacity: "0.9", margin: "0" }}>
            Manage and create discount codes for your Shopify store
          </p>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px" }}>
        {/* Stats Overview */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: "#6B7280",
                textTransform: "uppercase",
                marginBottom: "8px",
              }}
            >
              Active Discounts
            </div>
            <div
              style={{
                fontSize: "32px",
                fontWeight: "700",
                color: "#111",
                marginBottom: "4px",
              }}
            >
              {activeDiscounts}
            </div>
            <div style={{ fontSize: "13px", color: "#9CA3AF" }}>
              out of {totalDiscounts} total
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: "#6B7280",
                textTransform: "uppercase",
                marginBottom: "8px",
              }}
            >
              Total Usage
            </div>
            <div
              style={{
                fontSize: "32px",
                fontWeight: "700",
                color: "#111",
                marginBottom: "4px",
              }}
            >
              {discounts.reduce((sum, d) => {
                const usage = parseInt(d.usage.split(" / ")[0]) || 0;
                return sum + usage;
              }, 0)}
            </div>
            <div style={{ fontSize: "13px", color: "#9CA3AF" }}>
              across all discounts
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: "#6B7280",
                textTransform: "uppercase",
                marginBottom: "8px",
              }}
            >
              Shopify Codes
            </div>
            <div
              style={{
                fontSize: "32px",
                fontWeight: "700",
                color: "#111",
                marginBottom: "4px",
              }}
            >
              0
            </div>
            <div style={{ fontSize: "13px", color: "#9CA3AF" }}>
              synced with store
            </div>
          </div>
        </div>

        {/* Create Discount Code Section */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
            padding: "28px",
            marginBottom: "32px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
              paddingBottom: "16px",
              borderBottom: "1px solid #F3F4F6",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#111",
                  margin: "0 0 4px 0",
                }}
              >
                Create Shopify Discount Code
              </h2>
              <p style={{ fontSize: "13px", color: "#6B7280", margin: "0" }}>
                Create and publish discount codes directly to your Shopify store
              </p>
            </div>
          </div>

          <fetcher.Form method="post">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px",
                marginBottom: "20px",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Title *
                </span>
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
                  name="title"
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
              </label>

              <label style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Code *
                </span>
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
                  name="code"
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
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "20px",
                marginBottom: "20px",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Type *
                </span>
                <select
                  name="type"
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
              </label>

              <label style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Value *
                </span>
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
                  name="value"
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
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "20px",
                marginBottom: "20px",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Starts at *
                </span>
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
                  name="startsAt"
                  type="datetime-local"
                  required
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
              </label>

              <label style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: "8px",
                  }}
                >
                  Ends at (optional)
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  Leave blank for no end date
                </span>
                <input
                  name="endsAt"
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
              </label>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "20px",
                cursor: "pointer",
              }}
            >
              <input
                name="oncePerCustomer"
                type="checkbox"
                checked={dOncePerCustomer}
                onChange={(e) => setDOncePerCustomer(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <div>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#111",
                    display: "block",
                  }}
                >
                  Applies once per customer
                </span>
                <span style={{ fontSize: "12px", color: "#6B7280" }}>
                  Prevents stacking multiple uses per customer
                </span>
              </div>
            </label>

            {fetcher.data?.error && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#FEE2E2",
                  border: "1px solid #FECACA",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    color: "#991B1B",
                    fontWeight: "500",
                  }}
                >
                  ⚠️ {fetcher.data.error}
                </span>
              </div>
            )}

            {fetcher.data?.success && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#DCFCE7",
                  border: "1px solid #BBF7D0",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    color: "#166534",
                    fontWeight: "500",
                  }}
                >
                  ✓ {fetcher.data.message}
                </span>
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="submit"
                disabled={fetcher.state === "submitting"}
                style={{
                  padding: "10px 24px",
                  background: "#667eea",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor:
                    fetcher.state === "submitting" ? "not-allowed" : "pointer",
                  fontWeight: "600",
                  fontSize: "14px",
                  transition: "all 0.2s",
                  opacity: fetcher.state === "submitting" ? 0.7 : 1,
                }}
                onMouseOver={(e) =>
                  !fetcher.state === "submitting" &&
                  (e.target.style.background = "#5568d3")
                }
                onMouseOut={(e) => (e.target.style.background = "#667eea")}
              >
                {fetcher.state === "submitting"
                  ? "Creating..."
                  : "Create in Shopify"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDTitle("");
                  setDCode("");
                  setDType("percentage");
                  setDValue("");
                  setDStartsAt("");
                  setDEndsAt("");
                  setDOncePerCustomer(false);
                }}
                style={{
                  padding: "10px 24px",
                  background: "#F3F4F6",
                  color: "#374151",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "14px",
                  transition: "all 0.2s",
                }}
              >
                Clear
              </button>
            </div>
          </fetcher.Form>
        </div>

        {/* Discounts Table */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
            padding: "28px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
              paddingBottom: "16px",
              borderBottom: "1px solid #F3F4F6",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#111",
                  margin: "0 0 4px 0",
                }}
              >
                Internal Discounts
              </h2>
              <p style={{ fontSize: "13px", color: "#6B7280", margin: "0" }}>
                Manage your internal discount collection
              </p>
            </div>
            <Button size="slim" onClick={handleCreateDiscount}>
              + New Discount
            </Button>
          </div>

          {discounts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#111",
                  margin: "0 0 8px 0",
                }}
              >
                No discounts yet
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "#6B7280",
                  margin: "0 0 16px 0",
                }}
              >
                Create your first discount to get started
              </p>
              <Button variant="primary" onClick={handleCreateDiscount}>
                Create Discount
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid #E5E7EB",
                      background: "#F9FAFB",
                    }}
                  >
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Discount
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Type
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Value
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Usage
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Status
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Created
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "center",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((item, index) => {
                    const rowId = `discount-${item.id}`;
                    return (
                      <tr
                        key={rowId}
                        style={{
                          borderBottom: "1px solid #E5E7EB",
                          transition: "background 0.2s",
                        }}
                        onMouseOver={(e) =>
                          (e.currentTarget.style.background = "#F9FAFB")
                        }
                        onMouseOut={(e) =>
                          (e.currentTarget.style.background = "#fff")
                        }
                      >
                        <td style={{ padding: "14px 16px" }}>
                          <div
                            style={{
                              fontWeight: "600",
                              color: "#111",
                              fontSize: "14px",
                              marginBottom: "4px",
                            }}
                          >
                            {item.title}
                          </div>
                          <div style={{ fontSize: "12px", color: "#6B7280" }}>
                            {item.description || "No description"}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "13px",
                            color: "#111",
                          }}
                        >
                          <span
                            style={{
                              background: "#EEF2FF",
                              color: "#3730A3",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "500",
                            }}
                          >
                            {getTypeLabel(item.type)}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "#111",
                          }}
                        >
                          {item.value}
                          {item.type === "percentage" ? "%" : ""}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "13px",
                            color: "#6B7280",
                          }}
                        >
                          {item.usage}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {getStatusBadge(item.status)}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "13px",
                            color: "#6B7280",
                          }}
                        >
                          {item.created}
                        </td>
                        <td
                          style={{ padding: "14px 16px", textAlign: "center" }}
                        >
                          <Popover
                            active={popoverActive === rowId}
                            activator={
                              <Button
                                icon={ChevronDownIcon}
                                variant="plain"
                                size="slim"
                                onClick={() =>
                                  setPopoverActive(
                                    popoverActive === rowId ? null : rowId,
                                  )
                                }
                                aria-label="Actions"
                              />
                            }
                            onClose={() => setPopoverActive(null)}
                            preferredAlignment="right"
                          >
                            <ActionList
                              items={[
                                {
                                  content: "Edit",
                                  icon: EditIcon,
                                  onAction: () => handleEditDiscount(item),
                                },
                                {
                                  content: "Duplicate",
                                  icon: DuplicateIcon,
                                  onAction: () => {
                                    handleDuplicateDiscount(item);
                                  },
                                },
                                {
                                  content: "Delete",
                                  icon: DeleteIcon,
                                  onAction: () => {
                                    handleDeleteDiscount(item.id);
                                  },
                                  destructive: true,
                                },
                              ]}
                            />
                          </Popover>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Discount Modal */}
      <Modal
        open={discountModalOpen}
        onClose={() => setDiscountModalOpen(false)}
        title={editingDiscount ? "Edit Discount" : "Create Discount"}
        primaryAction={{
          content: "Save",
          onAction: handleSaveDiscount,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDiscountModalOpen(false),
          },
        ]}
        size="large"
      >
        <Modal.Section>
          <FormLayout>
            {/* General Section */}
            <BlockStack gap="400">
              <Box borderBottomWidth="1" paddingBlockEnd="400">
                <Text as="h3" variant="headingMd">
                  General
                </Text>
              </Box>

              <TextField
                label="Discount Title"
                placeholder="e.g., Summer Sale 20% Off"
                value={formData.title}
                onChange={(value) => setFormData({ ...formData, title: value })}
              />

              <TextField
                label="Description"
                placeholder="Add a description (optional)"
                multiline={2}
                value={formData.description}
                onChange={(value) =>
                  setFormData({ ...formData, description: value })
                }
              />

              <Checkbox
                label="Active"
                checked={formData.active}
                onChange={(value) =>
                  setFormData({ ...formData, active: value })
                }
              />
            </BlockStack>

            <Divider />

            {/* Discount Type Section */}
            <BlockStack gap="400">
              <Box borderBottomWidth="1" paddingBlockEnd="400">
                <Text as="h3" variant="headingMd">
                  Discount Details
                </Text>
              </Box>

              <Select
                label="Discount Type"
                options={[
                  { label: "Percentage (%)", value: "percentage" },
                  { label: "Fixed Amount (₹)", value: "fixed" },
                  { label: "Buy One Get One", value: "bogo" },
                  { label: "Volume Discount", value: "volume" },
                ]}
                value={formData.type}
                onChange={(value) => setFormData({ ...formData, type: value })}
              />

              <TextField
                label={
                  formData.type === "percentage"
                    ? "Discount Percentage"
                    : formData.type === "fixed"
                      ? "Discount Amount (₹)"
                      : "Discount Value"
                }
                placeholder="0"
                type="number"
                value={formData.value}
                onChange={(value) => setFormData({ ...formData, value: value })}
                suffix={formData.type === "percentage" ? "%" : "₹"}
              />

              <TextField
                label="Minimum Purchase Amount"
                placeholder="0"
                type="number"
                value={formData.minPurchase}
                onChange={(value) =>
                  setFormData({ ...formData, minPurchase: value })
                }
                suffix="₹"
              />
            </BlockStack>

            <Divider />

            {/* Conditions Section */}
            <BlockStack gap="400">
              <Box borderBottomWidth="1" paddingBlockEnd="400">
                <Text as="h3" variant="headingMd">
                  Conditions
                </Text>
              </Box>

              <Select
                label="Apply to"
                options={[
                  { label: "All Products", value: "all_products" },
                  { label: "Specific Collection", value: "collection" },
                  { label: "Specific Products", value: "products" },
                  { label: "Specific Customer", value: "customer" },
                ]}
                value={formData.conditions}
                onChange={(value) =>
                  setFormData({ ...formData, conditions: value })
                }
              />

              <TextField
                label="Max Usage Count"
                placeholder="Leave empty for unlimited"
                type="number"
                value={formData.maxUsage}
                onChange={(value) =>
                  setFormData({ ...formData, maxUsage: value })
                }
              />
            </BlockStack>

            <Divider />

            {/* Schedule Section */}
            <BlockStack gap="400">
              <Box borderBottomWidth="1" paddingBlockEnd="400">
                <Text as="h3" variant="headingMd">
                  Schedule
                </Text>
              </Box>

              <TextField
                label="Start Date"
                type="date"
                value={formData.startDate}
                onChange={(value) =>
                  setFormData({ ...formData, startDate: value })
                }
              />

              <TextField
                label="End Date"
                type="date"
                value={formData.endDate}
                onChange={(value) =>
                  setFormData({ ...formData, endDate: value })
                }
              />
            </BlockStack>
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
