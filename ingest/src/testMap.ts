import { readFileSync } from "node:fs";
import { mapSpan } from "./mapSpan";

const payload = JSON.parse(readFileSync("sample-trace.json", "utf8"));

for (const rs of payload.resourceSpans ?? []) {
  let service = "unknown";
  for (const attr of rs.resource?.attributes ?? []) {
    if (attr.key === "service.name") service = attr.value?.stringValue ?? "unknown";
  }
  for (const ss of rs.scopeSpans ?? []) {
    for (const span of ss.spans ?? []) {
      console.log(JSON.stringify(mapSpan(span, service), null, 2));
    }
  }
}