import { randomBytes } from "node:crypto";

const TRACES = Number(process.argv[2] ?? 2000);
const CONCURRENCY = Number(process.argv[3] ?? 4);
const SPANS_PER_TRACE = 8;
const TRACES_PER_REQUEST = Number(process.argv[4] ?? 10);
const INGEST = "http://localhost:4318";
const CH = "http://localhost:8123/";
const CH_HEADERS = { "X-ClickHouse-User": "dev", "X-ClickHouse-Key": "dev" };
const SERVICES = ["bench-frontend", "bench-cart", "bench-checkout", "bench-payment", "bench-shipping"];
const runId = randomBytes(4).toString("hex");

function buildRequest(): string {
    const byService = new Map<string, any[]>();
    for (let t = 0; t < TRACES_PER_REQUEST; t++) {
        const traceId = runId + randomBytes(12).toString("hex");
        const rootId = randomBytes(8).toString("hex");
        const start = BigInt(Date.now()) * 1000000n;
        for (let i = 0; i < SPANS_PER_TRACE; i++) {
            const service = SERVICES[i % SERVICES.length];
            const spanStart = start + BigInt(i) * 1000000n;
            const span = {
                traceId,
                spanId: i === 0 ? rootId : randomBytes(8).toString("hex"),
                parentSpanId: i === 0 ? "" : rootId,
                name: `bench-op-${i}`,
                startTimeUnixNano: spanStart.toString(),
                endTimeUnixNano: (spanStart + 5000000n).toString(),
                status: { code: 1 },
                attributes: [{ key: "bench.run", value: { stringValue: runId } }],
            };
            if (!byService.has(service)) byService.set(service, []);
            byService.get(service)!.push(span);
        }
    }
    return JSON.stringify({
        resourceSpans: [...byService].map(([service, spans]) => ({
            resource: { attributes: [{ key: "service.name", value: { stringValue: service } }] },
            scopeSpans: [{ spans }],
        })),
    });
}

async function getStats(): Promise<any> {
    return (await fetch(`${INGEST}/stats`)).json();
}

async function countInClickHouse(): Promise<number> {
    const q = `SELECT count() FROM spans WHERE startsWith(trace_id, '${runId}')`;
    const res = await fetch(CH + "?query=" + encodeURIComponent(q), { headers: CH_HEADERS });
    return Number((await res.text()).trim());
}

function percentile(sorted: number[], p: number): number {
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main() {
    const requests = Math.floor(TRACES / TRACES_PER_REQUEST);
    const spansPerRequest = TRACES_PER_REQUEST * SPANS_PER_TRACE;
    const bodies = Array.from({ length: requests }, buildRequest);

    const before = await getStats();
    const latencies: number[] = [];
    const statusCounts: Record<string, number> = {};
    let next = 0;

    const t0 = performance.now();
    async function worker() {
        while (next < requests) {
            const body = bodies[next++];
            const s = performance.now();
            let status = "error";
            try {
                const res = await fetch(`${INGEST}/v1/traces`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                });
                status = String(res.status);
                await res.arrayBuffer();
            } catch { }
            latencies.push(performance.now() - s);
            statusCounts[status] = (statusCounts[status] ?? 0) + 1;
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const seconds = (performance.now() - t0) / 1000;

    const after = await getStats();
    const counted = await countInClickHouse();
    const sorted = [...latencies].sort((a, b) => a - b);
    const sent = requests * spansPerRequest;
    const insertedDelta = after.spansInserted - before.spansInserted;

    console.log(`run ${runId}: ${requests} requests x ${spansPerRequest} spans, concurrency ${CONCURRENCY}`);
    console.log(`status codes:`, statusCounts);
    console.log(`sent spans:            ${sent}`);
    console.log(`server inserted delta: ${insertedDelta}`);
    const dropped: Record<string, number> = {};
    for (const [reason, n] of Object.entries(after.spansDropped as Record<string, number>)) {
        const delta = n - (before.spansDropped[reason] ?? 0);
        if (delta > 0) dropped[reason] = delta;
    }
    console.log(`server dropped (this run): ${JSON.stringify(dropped)}`);
    console.log(`counted in ClickHouse: ${counted}`);
    console.log(`throughput: ${(sent / seconds).toFixed(0)} spans/s over ${seconds.toFixed(2)} s`);
    console.log(`request latency ms: p50 ${percentile(sorted, 50).toFixed(1)}, p95 ${percentile(sorted, 95).toFixed(1)}, p99 ${percentile(sorted, 99).toFixed(1)}`);
    if (counted !== sent) {
        console.log("MISMATCH: spans sent != spans in ClickHouse");
        process.exitCode = 1;
    }
}

main();