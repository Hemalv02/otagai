export function scaleTypographyMetrics(
  fontSize: number,
  lineHeight: number,
  percent?: number | null,
) {
  const scale =
    typeof percent === "number" && Number.isFinite(percent)
      ? Math.min(200, Math.max(80, percent)) / 100
      : 1;

  return { fontSize: fontSize * scale, lineHeight: lineHeight * scale };
}
