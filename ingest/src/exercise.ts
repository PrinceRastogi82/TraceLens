interface Span {
  name: string;
  duration_ms: number;
}

const spans: Span[] = [];
for (let i = 0; i < 100; i++) {
  spans.push({
    name: `span-${i}`,
    duration_ms: Math.round(Math.random() * 1000),
  });
}

const slowest5 = [...spans]
  .sort((a, b) => b.duration_ms - a.duration_ms)
  .slice(0, 5);

console.log("Slowest 5 spans:");
console.table(slowest5);