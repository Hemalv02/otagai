import type {
  AssistantCard,
  AssistantTurn,
  ConfirmRequest,
  RequestKind,
} from "./assistant-api";

export type Review = {
  turnId: string;
  kind: RequestKind;
  title: string;
  text: string;
  when: string;
  recipient?: string;
  listingId?: string;
};

export function makeReview(
  turn: AssistantTurn,
  card?: AssistantCard,
  cardMessage?: string,
): Review {
  const draft = turn.draft;
  const kind = card
    ? card.action === "borrow"
      ? "borrow"
      : "help"
    : (draft?.kind ?? "help");
  return {
    turnId: turn.id,
    kind,
    title: card?.listing.title ?? draft?.title ?? "",
    text:
      draft && (draft.kind === kind || !card)
        ? draft.description
        : (cardMessage ??
          (card?.action === "ask_for_help" ? "" : (turn.text ?? ""))),
    when: draft?.when_text ?? "",
    recipient: card?.owner.display_name,
    listingId: card?.listing.id,
  };
}

export function confirmationBody(
  review: Review,
  description: string,
  timing: string,
): ConfirmRequest | null {
  const text = description.trim();
  const when = timing.trim();
  if (!text) return null;
  let reviewedText = text;
  if (when && !text.toLowerCase().includes(when.toLowerCase())) {
    const suggested = review.when.trim();
    const match =
      suggested && text === review.text.trim()
        ? text.toLowerCase().indexOf(suggested.toLowerCase())
        : -1;
    reviewedText =
      match >= 0
        ? `${text.slice(0, match)}${when}${text.slice(match + suggested.length)}`
        : `${text}\n\n${when}`;
  }
  if (reviewedText.length > 2000) return null;
  return {
    kind: review.kind,
    text: reviewedText,
    ...(review.listingId ? { listing_id: review.listingId } : {}),
  };
}

export function mergeTurns<T extends { id: string; created_at: string }>(
  current: T[],
  incoming: T[],
) {
  const items = new Map(
    [...current, ...incoming].map((turn) => [turn.id, turn]),
  );
  return [...items.values()].sort(
    (left, right) =>
      Date.parse(left.created_at) - Date.parse(right.created_at) ||
      left.id.localeCompare(right.id),
  );
}
