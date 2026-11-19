## ClickHouse version: pinned to 26.3.57
- Reason: reproducible benchmarks
- Chosen because: 26.3 is the newer LTS line (25.8's 12-month window likely ended Aug 2026)
- Verified: SELECT version() printed 26.3.57.12

## Batch rows across requests before inserting into ClickHouse

Decision: the ingest server collects rows from concurrent requests and flushes one insert when 2000 rows are queued or 50 ms have passed. A request gets its reply only after its rows are inserted (or the insert failed).

Why: measured. Per-request inserts reached a median 4516 spans/s; batching reached 7195 spans/s (about 1.6x) with lower p50 latency. Real Collector requests carried only 4-10 spans, so per-request inserts would be the slow case.

Rejected:
- Reply before the insert: faster replies, but spans are lost silently if the server dies, and the loss counters would be wrong.
- No batching: 1.6x slower in the benchmark.

Costs: up to 50 ms extra latency on a quiet server, rows held in memory until flush, and one failed insert returns 503 for every request in that batch.

Open: 2000 and 50 ms come from a 3-setting sweep, not tuning. Low-load latency and memory were not measured.