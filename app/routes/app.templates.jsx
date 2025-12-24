import { useState } from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Card, Button, IndexTable, Badge, Modal } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// --- Add action to save new templates ---
export const action = async ({ request }) => {
  await authenticate.admin(request);
  if (request.method === "POST") {
    // Handle create or status toggle
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      // Create new template (from customize page)
      try {
        const data = await request.json();
        const { title, config } = data;
        if (!title || !config) {
          return json({ error: "Missing title or config" }, { status: 400 });
        }
        const newTemplate = await prisma.template.create({
          data: {
            title,
            config,
            active: true,
          },
        });
        return json({ success: true, template: newTemplate });
      } catch (error) {
        return json(
          { error: error.message || "Failed to save template" },
          { status: 500 },
        );
      }
    } else {
      // Handle status toggle (from IndexTable)
      const form = await request.formData();
      const id = form.get("id");
      const active = form.get("active");
      if (!id) return json({ error: "Missing id" }, { status: 400 });
      const updated = await prisma.template.update({
        where: { id: Number(id) },
        data: { active: active === "true" },
      });
      return json({ success: true, template: updated });
    }
  } else if (request.method === "DELETE") {
    // Handle delete
    const form = await request.formData();
    const id = form.get("id");
    if (!id) return json({ error: "Missing id" }, { status: 400 });
    await prisma.template.delete({ where: { id: Number(id) } });
    return json({ success: true });
  } else {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
};

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const templates = await prisma.template.findMany({
    orderBy: { createdAt: "desc" },
  });
  const activeCount = await prisma.template.count({ where: { active: true } });
  return json({ templates, activeCount });
};

export default function TemplatesPage() {
  const fetcher = useFetcher();
  const { templates, activeCount } = useLoaderData();
  const navigate = useNavigate();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);

  // Handler to toggle active status
  const handleToggleActive = (template) => {
    fetcher.submit(
      { id: template.id, active: !template.active },
      { method: "post" },
    );
  };

  // Handler for layout card click
  const handleLayoutSelect = (layout) => {
    setModalOpen(false);
    navigate(`/app/customize?layout=${layout}`);
  };

  return (
    <Page>
      <TitleBar title="Templates" />
      <style>{`
        .shopify-table-ui {
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 2px 8px #e5e7eb;
          padding: 0;
          margin-top: 32px;
        }
        .shopify-table-ui .Polaris-IndexTable__Table {
          border-collapse: separate;
          border-spacing: 0;
          width: 100%;
        }
        .shopify-table-ui .Polaris-IndexTable__TableRow {
          border-bottom: 1px solid #e5e7eb;
          transition: background 0.15s;
        }
        .shopify-table-ui .Polaris-IndexTable__TableRow:hover {
          background: #f9fafb;
        }
        .shopify-table-ui .Polaris-IndexTable__TableCell {
          border-right: 1px solid #e5e7eb;
          font-size: 15px;
          padding: 14px 12px !important;
          background: #fff;
        }
        .shopify-table-ui .Polaris-IndexTable__TableCell:last-child {
          border-right: none;
        }
        .shopify-table-ui .Polaris-IndexTable__TableHeading {
          background: #f3f4f6;
          color: #374151;
          font-weight: 600;
          font-size: 15px;
          border-bottom: 1px solid #e5e7eb;
          padding: 16px 12px !important;
        }
      `}</style>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", gap: 32 }}>
            <div>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
                Active Templates
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#1d4ed8" }}>
                {activeCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
                Total Templates
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#7c3aed" }}>
                {templates.length}
              </div>
            </div>
          </div>
          <Button primary onClick={() => setModalOpen(true)}>
            Create Template
          </Button>
          {/* Modal for layout selection */}
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Choose a layout"
            large
          >
            <Modal.Section>
              <div
                style={{ display: "flex", justifyContent: "center", gap: 32 }}
              >
                <Card
                  sectioned
                  title="Layout 1"
                  style={{
                    cursor: "pointer",
                    width: 200,
                    border: "2px solid #e5e7eb",
                  }}
                >
                  <img
                    src="/public/layout1.png"
                    alt="Layout 1"
                    style={{
                      width: "100%",
                      height: 100,
                      objectFit: "cover",
                      marginBottom: 8,
                      cursor: "pointer",
                      borderRadius: 6,
                      boxShadow: "0 0 0 2px #2563eb33",
                      transition: "box-shadow 0.2s",
                    }}
                    onClick={() => handleLayoutSelect("layout1")}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.boxShadow = "0 0 0 3px #2563eb77")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.boxShadow = "0 0 0 2px #2563eb33")
                    }
                  />
                  <div style={{ textAlign: "center", fontWeight: 500 }}>
                    Classic Grid
                  </div>
                </Card>
                <Card
                  sectioned
                  title="Layout 2"
                  style={{
                    cursor: "pointer",
                    width: 200,
                    border: "2px solid #e5e7eb",
                  }}
                >
                  <img
                    src="/public/layout2.png"
                    alt="Layout 2"
                    style={{
                      width: "100%",
                      height: 100,
                      objectFit: "cover",
                      marginBottom: 8,
                      cursor: "pointer",
                      borderRadius: 6,
                      boxShadow: "0 0 0 2px #2563eb33",
                      transition: "box-shadow 0.2s",
                    }}
                    onClick={() => handleLayoutSelect("layout2")}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.boxShadow = "0 0 0 3px #2563eb77")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.boxShadow = "0 0 0 2px #2563eb33")
                    }
                  />
                  <div style={{ textAlign: "center", fontWeight: 500 }}>
                    Modern List
                  </div>
                </Card>
                <Card
                  sectioned
                  title="Layout 3"
                  style={{
                    cursor: "pointer",
                    width: 200,
                    border: "2px solid #e5e7eb",
                  }}
                >
                  <img
                    src="/public/layout3.png"
                    alt="Layout 3"
                    style={{
                      width: "100%",
                      height: 100,
                      objectFit: "cover",
                      marginBottom: 8,
                      cursor: "pointer",
                      borderRadius: 6,
                      boxShadow: "0 0 0 2px #2563eb33",
                      transition: "box-shadow 0.2s",
                    }}
                    onClick={() => handleLayoutSelect("layout3")}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.boxShadow = "0 0 0 3px #2563eb77")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.boxShadow = "0 0 0 2px #2563eb33")
                    }
                  />
                  <div style={{ textAlign: "center", fontWeight: 500 }}>
                    Image Focus
                  </div>
                </Card>
              </div>
            </Modal.Section>
          </Modal>
        </div>
        <div className="shopify-table-ui">
          <IndexTable
            resourceName={{ singular: "template", plural: "templates" }}
            itemCount={templates.length}
            headings={[
              { title: "No" },
              { title: "Title" },
              { title: "URL" },
              { title: "Discount" },
              { title: "Status" },
              { title: "Actions" },
            ]}
          >
            {templates.map((t, idx) => (
              <IndexTable.Row
                key={t.id}
                id={String(t.id)}
                selected={false}
                position={idx}
              >
                <IndexTable.Cell>{idx + 1}</IndexTable.Cell>
                <IndexTable.Cell>{t.title}</IndexTable.Cell>
                <IndexTable.Cell>
                  <a
                    href={t.config?.url || `/app/customize?templateId=${t.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2563eb", textDecoration: "underline" }}
                  >
                    {t.config?.url || `/app/customize?templateId=${t.id}`}
                  </a>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {t.config?.discountName ? (
                    <span style={{ color: "#059669", fontWeight: 500 }}>
                      {t.config.discountName}
                    </span>
                  ) : (
                    <span style={{ color: "#999" }}>No</span>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Badge tone={t.active ? "success" : "attention"}>
                      {t.active ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      size="slim"
                      onClick={() => handleToggleActive(t)}
                      tone={t.active ? "critical" : "primary"}
                    >
                      {t.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      size="slim"
                      onClick={() =>
                        navigate(`/app/customize?templateId=${t.id}`)
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="slim"
                      destructive
                      onClick={() =>
                        fetcher.submit({ id: t.id }, { method: "delete" })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </div>
      </div>
    </Page>
  );
}
