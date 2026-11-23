import type { Exchange, RequestKind, RequestSummary } from "@/lib/api";

export type HomeView = {
  received_requests: RequestSummary[];
  active_exchanges: Exchange[];
  due_soon: Exchange[];
};

export type TodayRow =
  | {
      type: "request";
      id: string;
      text: string;
      kind: RequestKind;
      personId: string;
    }
  | {
      type: "due";
      id: string;
      listingId: string | null;
      partnerId: string;
      dueAt: string | null;
      borrowing: boolean;
    };

export function todayRows(home: HomeView, me: string): TodayRow[] {
  const requests: TodayRow[] = home.received_requests
    .filter((item) => item.status === "open" && item.requester_user_id !== me)
    .map((item) => ({
      type: "request",
      id: item.id,
      text: item.polite_text,
      kind: item.kind,
      personId: item.requester_user_id,
    }));
  const due: TodayRow[] = home.due_soon
    .filter(
      (item) => me === item.requester_user_id || me === item.helper_user_id,
    )
    .map((item) => ({
      type: "due",
      id: item.id,
      listingId: item.listing_id,
      partnerId:
        me === item.requester_user_id
          ? item.helper_user_id
          : item.requester_user_id,
      dueAt: item.due_at,
      borrowing: me === item.requester_user_id,
    }));
  return [...due, ...requests];
}

export function todayPeople(rows: TodayRow[]) {
  return [
    ...new Set(
      rows.map((row) =>
        row.type === "request" ? row.personId : row.partnerId,
      ),
    ),
  ];
}
