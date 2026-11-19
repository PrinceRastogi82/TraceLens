CREATE TABLE spans
(
    trace_id String,
    span_id String,
    parent_span_id String,
    service LowCardinality(String),
    name LowCardinality(String),
    start_time DateTime64(9),
    duration_ns UInt64,
    status_code UInt8,
    attributes Map(String, String),
    INDEX idx_trace trace_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(start_time)
ORDER BY (service, start_time, trace_id)
TTL toDateTime(start_time) + INTERVAL 7 DAY;