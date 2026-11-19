const CH = "http://localhost:8123/";
const HEADERS = { "X-ClickHouse-User": "dev", "X-ClickHouse-Key": "dev" };
const SAMPLES = Number(process.argv[2] ?? 200);
const SPANS_PER_TRACE = 8;
const WARMUP = 10;

async function ch(sql: string, settings = ""): Promise<any> {
  const res = await fetch(`${CH}?${settings}`, {
    method: "POST",
    headers: HEADERS,
    body: `${sql} FORMAT JSON`,
  });
  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${await res.text()}`);
  return res.json();
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function lookup(id: string, settings: string) {
  const sql =
    `SELECT span_id, parent_span_id, service, name, start_time, duration_ns ` +
    `FROM spans WHERE trace_id = '${id}' ORDER BY start_time`;
  const start = performance.now();
  const out = await ch(sql, settings);
  return {
    ms: performance.now() - start,
    rowsRead: Number(out.statistics.rows_read),
    rows: Number(out.rows),
  };
}

async function measure(label: string, ids: string[], settings: string) {
  const latencies: number[] = [];
  const reads: number[] = [];
  let wrong = 0;
  for (const id of ids) {
    const r = await lookup(id, settings);
    latencies.push(r.ms);
    reads.push(r.rowsRead);
    if (r.rows !== SPANS_PER_TRACE) wrong++;
  }
  latencies.sort((a, b) => a - b);
  reads.sort((a, b) => a - b);
  console.log(`${label}: ${ids.length} lookups, wrong row count: ${wrong}`);
  console.log(
    `  latency ms: p50 ${percentile(latencies, 50).toFixed(1)}, ` +
      `p95 ${percentile(latencies, 95).toFixed(1)}, p99 ${percentile(latencies, 99).toFixed(1)}`,
  );
  console.log(`  rows read per lookup: median ${percentile(reads, 50)}`);
}

async function main() {
  const total = Number((await ch("SELECT count() AS n FROM spans")).data[0].n);
  const need = SAMPLES * 2 + WARMUP;
  const sample = await ch(
    `SELECT trace_id FROM spans WHERE service = 'bench-frontend' ` +
      `GROUP BY trace_id ORDER BY rand() LIMIT ${need}`,
  );
  const ids: string[] = sample.data.map((r: any) => r.trace_id);
  if (ids.length < need) throw new Error(`only ${ids.length} traces found, need ${need}`);

  console.log(`rows in table: ${total}`);
  for (const id of ids.slice(0, WARMUP)) await lookup(id, "");

  const withIndex = ids.slice(WARMUP, WARMUP + SAMPLES);
  const withoutIndex = ids.slice(WARMUP + SAMPLES);
  await measure("skip indexes ON ", withIndex, "");
  await measure("skip indexes OFF", withoutIndex, "use_skip_indexes=0");
}

main();