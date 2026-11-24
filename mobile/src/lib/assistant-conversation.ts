import type { ContentLanguage } from "./api";
import type { DraftRelationship, RequestTone } from "./request-wording";
import type { RippleScope } from "./request-ripple";
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
  language?: ContentLanguage;
  tone?: RequestTone;
  relationship?: DraftRelationship;
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
  const matchingDraft = draft && (draft.kind === kind || !card) ? draft : null;
  return {
    turnId: turn.id,
    kind,
    title: card?.listing.title ?? draft?.title ?? "",
    text:
      matchingDraft?.description ??
      cardMessage ??
      (card?.action === "ask_for_help" ? "" : (turn.text ?? "")),
    when: draft?.when_text ?? "",
    recipient: card?.owner.display_name,
    listingId: card?.listing.id,
    language: matchingDraft?.language,
    tone: matchingDraft?.tone,
    relationship: matchingDraft?.relationship,
  };
}

export function hasClearedTiming(
  review: Review,
  description: string,
  timing: string,
) {
  const suggested = review.when.trim().toLowerCase();
  return (
    !timing.trim() &&
    suggested !== "" &&
    description.toLowerCase().includes(suggested)
  );
}

export function confirmationBody(
  review: Review,
  description: string,
  timing: string,
  homeCircleId?: string,
  scope?: RippleScope,
): ConfirmRequest | null {
  const text = description.trim();
  const when = timing.trim();
  if (!text || hasClearedTiming(review, text, when)) return null;
  let reviewedText = text;
  if (when) {
    const lowerText = text.toLowerCase();
    const suggested = review.when.trim();
    const match = suggested ? lowerText.indexOf(suggested.toLowerCase()) : -1;
    if (match >= 0 && suggested.toLowerCase() !== when.toLowerCase()) {
      reviewedText = `${text.slice(0, match)}${when}${text.slice(match + suggested.length)}`;
    } else if (!lowerText.includes(when.toLowerCase())) {
      reviewedText = `${text}\n\n${when}`;
    }
  }
  if (reviewedText.length > 2000) return null;
  return {
    kind: review.kind,
    text: reviewedText,
    ...(review.language ? { language: review.language } : {}),
    ...(review.tone ? { tone: review.tone } : {}),
    ...(review.relationship ? { relationship: review.relationship } : {}),
    ...(review.language && review.title ? { title: review.title } : {}),
    ...(review.listingId ? { listing_id: review.listingId } : {}),
    ...(!review.listingId && homeCircleId
      ? {
          home_circle_id: homeCircleId,
          ...(scope
            ? { ripple_max_stage: scope, ripple_start_stage: "family" as const }
            : {}),
        }
      : {}),
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
