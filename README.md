# TraceLens

An OTLP-compatible trace backend. The goal is to tell which deploy and which service caused a regression, with measured accuracy against injected faults.

**Status:** Phase 1 (ingest pipeline) is done. Regression detection, the UI and fault injection are not built yet.

## What works today

- OTLP/HTTP ingest on port 4318 (`POST /v1/traces`, uncompressed JSON only).
- The server batches rows (flush at 2000 rows or 50 ms) and replies only after the insert finished or failed.
- ClickHouse `spans` table: ordered by `(service, start_time, trace_id)`, bloom filter index on `trace_id`, partitioned by day, 7-day TTL.
- Loss accounting: `GET /stats` returns spans received, inserted and dropped (with reason).
- Fetch a trace by ID: a SQL query today, no API endpoint yet.

## Measured numbers

All numbers come from scripts in `bench/`. Full tables, methods and limits are in `bench/RESULTS.md`. Machine: i5-12500H, 15.6 GB RAM, Windows, client, server and ClickHouse on one laptop.

| What | Result |
|---|---|
| Ingest, batching on (4000 requests x 8 spans, concurrency 128, median of 3 runs) | 7195 spans/s, p50 127.9 ms |
| Ingest, no batching (same test) | 4516 spans/s, p50 219.9 ms |
| Trace lookup by ID, 1.92M rows, bloom index on (median of 3 runs) | p50 9.9 ms, 57,344 rows read |
| Trace lookup by ID, same table, index off | p50 17.0 ms, 1,920,002 rows read |
| Spans lost in these runs | 0 (sent = inserted = counted in ClickHouse) |

## Limits

- Benchmark data is generated (8 spans per trace, one attribute per span), not real traffic. Do not read these numbers as production throughput.
- Not yet tested end to end with real OpenTelemetry Demo traffic after the batcher was added.
- Loss accounting only counts spans that reached this server. Loss in the Collector or network is not counted.
- No gzip, protobuf or gRPC ingest. If the server dies, spans waiting in the batch are lost; their senders get no success reply.
- Counters live in memory and reset on restart.

## Run it

    docker compose up -d
    cd ingest
    npm install
    npx tsx src/index.ts

Benchmarks (from `ingest/`, server running; run `npm install` once in the repo root for the type definitions):

    npx tsx ..\bench\ingest-bench.ts 4000 128 1
    npx tsx ..\bench\fetch-bench.ts 200

Server settings: `BATCH_ROWS` (default 2000) and `BATCH_WAIT_MS` (default 50). Design decisions are in `docs/decisions.md`.