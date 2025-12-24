import fs from "fs/promises";
import path from "path";

export const action = async ({ request }) => {
  try {
    console.log("api/receiver action start");

    let data;
    try {
      data = await request.json();
    } catch (parseErr) {
      const raw = await request.text();
      console.error("api/receiver: JSON parse failed, raw body:", raw);
      throw parseErr;
    }

    console.log("api/receiver payload:", data);

    const logsDir = path.join(process.cwd(), "logs");
    console.log("api/receiver logsDir:", logsDir);
    await fs.mkdir(logsDir, { recursive: true });

    const filePath = path.join(logsDir, "receiver.log");
    const entry = JSON.stringify({ ...data, timestamp: new Date().toISOString() }) + "\n";

    console.log("api/receiver writing to:", filePath);
    await fs.appendFile(filePath, entry, "utf8");
    console.log("api/receiver write complete");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("api/receiver action error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
