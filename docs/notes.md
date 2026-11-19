## Setup notes
- Pinned ClickHouse to 26.3.57, first tried 25.8.33 (details in decisions.md)
- down -v deletes the volume, so my table was gone
- SQL goes inside clickhouse-client, docker commands go in PowerShell

## Step 2d: How MergeTree works
- ORDER BY stores rows sorted on disk, so filters on the first columns are fast.
- Every INSERT makes a small part, so the ingest server must batch inserts.
- index_granularity 8192 = rows per block (confirmed in Step 3: 6 x 8192 = 49,152).

## Step 3: ORDER BY experiment
- trace_id lookup read 5M rows (full scan) because it's the 3rd ORDER BY column; service+time read only 49K.
- Bloom filter: 163K rows for +5% storage. Projection: 24K rows for +81% storage. Chose bloom (details in decisions.md).
- Mistakes: ran SQL in PowerShell; first "before" size was wrong because the index already existed.

## Step 6a: First OTLP receiver (ingest/src/index.ts)
- Small Node http server: accepts POST /v1/traces on port 4318, anything else gets 404.
- Body arrives in chunks: collect them (req.on "data"), use them when "end" fires, then reply 200 so the sender knows it was accepted.
- Tested: /v1/traces worked, /wrong gave 404.

## Step 6b: Parse OTLP JSON
- OTLP JSON is nested: resourceSpans > scopeSpans > spans; service name is in resource attributes (service.name). Read it with 3 loops.
- Times are nanosecond strings -> BigInt, duration = end - start. try/catch returns 400 instead of crashing on bad input.

## Step 6c: Real demo traces to my server
- Kiya: OTel Demo ke Collector se real traces apne ingest server (port 4318) tak bheje, extras file mein otlp_http exporter jodkar.
- Seekha: Collector lists replace karta hai (isliye purane exporters dobara likhe), host.docker.internal kaam karta hai, trace IDs hex text mein aate hain, aur har request mein sirf 4-10 spans aate hain (batch insert zaroori).
- Galti: socha tha container chal raha hai, par demo band tha; docker ps pehle check karna chahiye. Demo + har span print karne se laptop hang hua.

## Step 7: Ingest server to ClickHouse
- Kiya: ingest server ko ClickHouse se joda (mapSpan.ts, clickhouse.ts, index.ts), ek request ke saare spans ek batch insert mein.
- Seekha: DateTime64(9) ko "seconds.9digits" text chalta hai, hex IDs ko convert nahi karna padta (String columns), parse error 400 aur DB error 503 alag hone chahiye.
- Galti: tsc pass hone ko "code badal gaya" maan liya, jabki index.ts mein naya code tha hi nahi; Node ko restart karna padta hai.

## Step 8: Loss accounting
- Kiya: ingest server mein loss accounting lagayi (stats.ts, GET /stats), received = inserted + dropped.
- Seekha: ClickHouse band karke jaanbujhkar insert fail karaya, to 503 aaya aur insert_failed counter badha; counters memory mein hain, restart par zero.
- Galti: naya code lagaye bina purana server chalate rahe, isliye "received" wali purani line dikhti rahi.

## Step 9: Ingest benchmark
- Kiya: bench/ingest-bench.ts banayi, 3 runs x 16000 spans, median 1722 spans/s, p50 185.6 ms, 0 dropped, ClickHouse count = sent.
- Seekha: concurrency 2 par 2275 spans/s aur p50 70 ms tha, concurrency 4 par throughput ghata aur latency badhi (wajah abhi pata nahi).
- Galti: bench folder ka apna tsconfig nahi tha, isliye VS Code mein red lines aayi; aur pehle ulajh gaya ki benchmark kaun se terminal mein chalana hai.

## Step 10: Batcher
- Kiya: ingest server mein batcher.ts lagaya (2000 rows ya 50 ms par ek insert), 6 runs mein median 7195 vs 4516 spans/s (about 1.6x), 0 dropped.
- Seekha: concurrency badhane se latency aur throughput dono badalte hain; pehle ka "2 se 4 par throughput ghata" wala andaaza galat tha; 1 run se number pakka nahi hota.
- Galti: server (setting ke saath) aur benchmark alag terminals mein chalte hain, ye pehle ulajh gaya.

## Step 11: Trace-by-ID benchmark
- Kiya: bench/fetch-bench.ts banayi, 1.92M rows par 3 runs x 200 lookups: bloom ON p50 9.9 ms vs OFF 17.0 ms, rows read 57,344 vs 1,920,002.
- Seekha: rows_read ne index ka saboot diya (33x kam), par latency sirf 1.7x behtar hui (cache garam, fixed ~10 ms ka kharcha, ye andaaza hai).
- Galti: is step mein koi badi galti nahi hui.