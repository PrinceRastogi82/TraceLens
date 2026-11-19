import type { SpanRow } from "./mapSpan";

const URL =
    "http://localhost:8123/?query=" +
    encodeURIComponent("INSERT INTO spans FORMAT JSONEachRow");

export async function insertSpans(rows: SpanRow[]): Promise<void> {
    if (rows.length === 0) return;
    const body = rows.map((r) => JSON.stringify(r)).join("\n");
    const res = await fetch(URL, {
        method: "POST",
        headers: { "X-ClickHouse-User": "dev", "X-ClickHouse-Key": "dev" },
        body,
    });
    if (!res.ok) {
        throw new Error(`ClickHouse ${res.status}: ${await res.text()}`);
    }
}