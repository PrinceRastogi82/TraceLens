import { createServer } from "node:http";
import { mapSpan, type SpanRow } from "./mapSpan";
import { enqueue } from "./batcher";
import { stats, drop } from "./stats";

const PORT = 4318;

function getServiceName(resource: any): string {
  for (const attr of resource?.attributes ?? []) {
    if (attr.key === "service.name") return attr.value?.stringValue ?? "unknown";
  }
  return "unknown";
}

function collectRows(payload: any): SpanRow[] {
  const rows: SpanRow[] = [];
  for (const rs of payload.resourceSpans ?? []) {
    const service = getServiceName(rs.resource);
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        rows.push(mapSpan(span, service));
      }
    }
  }
  return rows;
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
    return;
  }

  if (req.method !== "POST" || req.url !== "/v1/traces") {
    res.writeHead(404);
    res.end();
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", async () => {
    let rows: SpanRow[];
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      rows = collectRows(payload);
    } catch (err) {
      stats.badRequests++;
      console.log("bad request:", (err as Error).message);
      res.writeHead(400);
      res.end();
      return;
    }

    stats.spansReceived += rows.length;
    try {
      await enqueue(rows);
      stats.spansInserted += rows.length;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    } catch (err) {
      drop("insert_failed", rows.length);
      console.log("insert failed:", (err as Error).message);
      res.writeHead(503);
      res.end();
    }
  });
});

server.listen(PORT, () => {
  console.log(`ingest listening on port ${PORT}`);
});