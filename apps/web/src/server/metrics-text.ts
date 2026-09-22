/** Prometheus text exposition for a flat set of gauges. Pure. */
export function renderMetrics(
  metrics: { name: string; help: string; value: number; labels?: Record<string, string> }[],
) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const m of metrics) {
    if (!seen.has(m.name)) {
      seen.add(m.name);
      lines.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} gauge`);
    }
    const labels =
      m.labels && Object.keys(m.labels).length
        ? `{${Object.entries(m.labels)
            .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
            .join(",")}}`
        : "";
    lines.push(`${m.name}${labels} ${m.value}`);
  }
  return lines.join("\n") + "\n";
}
