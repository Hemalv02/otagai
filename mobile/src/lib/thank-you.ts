import type { Exchange, Language } from "@/lib/api";

export type ThankYouChoice = "note" | "points" | "demo";
export const THANK_YOU_POINTS = 5;

export function thankYouHref(
  exchange: Pick<
    Exchange,
    "id" | "mode" | "status" | "requester_user_id" | "helper_user_id"
  >,
  viewerId: string,
) {
  if (
    exchange.status !== "completed" ||
    ![exchange.requester_user_id, exchange.helper_user_id].includes(viewerId)
  ) {
    return null;
  }
  return {
    pathname:
      exchange.mode === "loan"
        ? ("/loans/[id]/thank-you" as const)
        : ("/exchanges/[id]/thank-you" as const),
    params: { id: exchange.id },
  };
}

export function thankYouPayload(
  exchangeId: string,
  note: string,
  lang: Language,
  aiDrafted: boolean,
  choice: ThankYouChoice,
) {
  return {
    exchange_id: exchangeId,
    gift_type: choice === "points" ? "points" : "note",
    ...(choice === "points" ? { points_amount: THANK_YOU_POINTS } : {}),
    note: note.trim(),
    lang,
    ai_drafted: aiDrafted,
  };
}
