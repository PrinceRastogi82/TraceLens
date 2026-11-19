export interface SpanRow {
    trace_id: string;
    span_id: string;
    parent_span_id: string;
    service: string;
    name: string;
    start_time: string;
    duration_ns: string;
    status_code: number;
    attributes: Record<string, string>;
}

function toStatusCode(status: any): number {
    const code = status?.code;
    if (typeof code === "number") return code;
    if (code === "STATUS_CODE_OK") return 1;
    if (code === "STATUS_CODE_ERROR") return 2;
    return 0;
}

function toAttributes(list: any[] | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const attr of list ?? []) {
        const v = attr.value ?? {};
        const raw = v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue;
        out[attr.key] = raw !== undefined ? String(raw) : JSON.stringify(v);
    }
    return out;
}

function toDateTime64(unixNano: bigint): string {
    const secs = unixNano / 1000000000n;
    const nanos = unixNano % 1000000000n;
    return `${secs}.${nanos.toString().padStart(9, "0")}`;
}

export function mapSpan(span: any, service: string): SpanRow {
    const start = BigInt(span.startTimeUnixNano);
    const end = BigInt(span.endTimeUnixNano);
    return {
        trace_id: span.traceId,
        span_id: span.spanId,
        parent_span_id: span.parentSpanId ?? "",
        service,
        name: span.name,
        start_time: toDateTime64(start),
        duration_ns: (end - start).toString(),
        status_code: toStatusCode(span.status),
        attributes: toAttributes(span.attributes),
    };
}