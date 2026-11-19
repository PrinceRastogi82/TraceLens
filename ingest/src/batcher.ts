import type { SpanRow } from "./mapSpan";
import { insertSpans } from "./clickhouse";

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

const MAX_ROWS = Number(process.env.BATCH_ROWS ?? 2000);
const MAX_WAIT_MS = Number(process.env.BATCH_WAIT_MS ?? 50);

let rows: SpanRow[] = [];
let waiters: Waiter[] = [];
let timer: NodeJS.Timeout | null = null;

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (rows.length === 0) return;
  const batch = rows;
  const batchWaiters = waiters;
  rows = [];
  waiters = [];
  try {
    await insertSpans(batch);
    for (const w of batchWaiters) w.resolve();
  } catch (err) {
    for (const w of batchWaiters) w.reject(err as Error);
  }
}

export function enqueue(newRows: SpanRow[]): Promise<void> {
  if (newRows.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    for (const r of newRows) rows.push(r);
    waiters.push({ resolve, reject });
    if (rows.length >= MAX_ROWS) {
      void flush();
    } else if (!timer) {
      timer = setTimeout(() => void flush(), MAX_WAIT_MS);
    }
  });
}