import type { Exchange } from "@/lib/api";

type HelpStage = "scheduled" | "confirm" | "waiting" | "completed";

export function helpExchangeStage(
  exchange: Pick<
    Exchange,
    | "mode"
    | "status"
    | "requester_user_id"
    | "helper_user_id"
    | "requester_confirmed_at"
    | "helper_confirmed_at"
  >,
  viewerId: string,
): HelpStage | null {
  const requester = exchange.requester_user_id === viewerId;
  if (
    exchange.mode !== "help" ||
    (!requester && exchange.helper_user_id !== viewerId)
  ) {
    return null;
  }
  if (exchange.status === "scheduled" || exchange.status === "completed") {
    return exchange.status;
  }
  if (exchange.status !== "active") return null;
  const confirmed = requester
    ? exchange.requester_confirmed_at
    : exchange.helper_confirmed_at;
  return confirmed ? "waiting" : "confirm";
}

type SchedulePatch = Partial<
  Pick<Exchange, "scheduled_at" | "meet_place_note">
>;

export function helpSchedulePatch(
  initial: Pick<Exchange, "scheduled_at" | "meet_place_note">,
  date: Date | null,
  place: string,
  now: number,
): SchedulePatch | null {
  const changes: SchedulePatch = {};
  if (date && date.getTime() !== Date.parse(initial.scheduled_at ?? "")) {
    if (!(date.getTime() > now)) return null;
    changes.scheduled_at = date.toISOString();
  }
  const cleanedPlace = place.trim();
  if (cleanedPlace !== (initial.meet_place_note ?? "").trim()) {
    changes.meet_place_note = cleanedPlace || null;
  }
  return changes;
}
