export const stats = {
  spansReceived: 0,
  spansInserted: 0,
  spansDropped: {} as Record<string, number>,
  badRequests: 0,
};

export function drop(reason: string, count: number): void {
  stats.spansDropped[reason] = (stats.spansDropped[reason] ?? 0) + count;
}