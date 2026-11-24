import type { RequestDetail, UpdateRequest } from "@/lib/requests-api";

export type RequestTimeInput = { day: string; time: string };
type TimingField = "needed_from" | "needed_until";
export type RequestTimingDraft = Partial<
  Record<TimingField, RequestTimeInput | null>
>;

export const timingFields = ["needed_from", "needed_until"] as const;

export function localTimeInput(value: Date): RequestTimeInput {
  const year = String(value.getFullYear()).padStart(4, "0");
  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    day: `${year}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export function buildWordingUpdate(original: string, value: string) {
  const text = value.trim();
  return text && text !== original ? { polite_text: text } : null;
}

export function buildTimingUpdate(
  original: Pick<RequestDetail, TimingField>,
  draft: RequestTimingDraft,
  now: number,
):
  | { changes: UpdateRequest }
  | { error: "incompleteTiming" | "invalidEndTime" } {
  const changes: UpdateRequest = {};
  for (const field of timingFields) {
    const value = draft[field];
    if (value === undefined) continue;
    const saved = original[field];
    if (value === null) {
      if (saved !== null) changes[field] = null;
      continue;
    }
    const savedInput = saved ? localTimeInput(new Date(saved)) : null;
    if (savedInput?.day === value.day && savedInput.time === value.time) continue;

    const parsed = new Date(`${value.day}T${value.time}`);
    if (!Number.isFinite(parsed.getTime())) return { error: "incompleteTiming" };
    const parsedInput = localTimeInput(parsed);
    if (parsedInput.day !== value.day || parsedInput.time !== value.time) {
      return { error: "incompleteTiming" };
    }
    changes[field] = parsed.toISOString();
  }

  const start = changes.needed_from === undefined
    ? original.needed_from
    : changes.needed_from;
  const end = changes.needed_until === undefined
    ? original.needed_until
    : changes.needed_until;
  if (end !== null) {
    const endTime = Date.parse(end);
    if (endTime <= now || (start !== null && endTime < Date.parse(start))) {
      return { error: "invalidEndTime" };
    }
  }
  return { changes };
}
