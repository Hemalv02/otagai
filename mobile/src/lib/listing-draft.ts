import type { CategoryNode, ListingDraft } from "./api";

export type DraftFields = {
  title: string;
  categoryId: string;
  parts: string;
  safety: string;
  brand: string;
  model: string;
  condition: string;
  details: string;
};
export type DraftKey = keyof DraftFields;

export const emptyDraftFields: DraftFields = {
  title: "",
  categoryId: "",
  parts: "",
  safety: "",
  brand: "",
  model: "",
  condition: "",
  details: "",
};

const unsureNames: Record<ListingDraft["unsure_fields"][number], DraftKey> = {
  title: "title",
  category: "categoryId",
  brand: "brand",
  model: "model",
  condition: "condition",
  parts: "parts",
  safety_notes: "safety",
};

const MAX_LABEL = 120;
const MAX_PARTS = 30;
export const MAX_LISTING_DESCRIPTION = 2000;

export function suggestionFields(
  draft: ListingDraft,
  categories: CategoryNode[],
): DraftFields {
  const live = draft.category_id
    ? categories.some((item) => item.id === draft.category_id)
    : false;
  return {
    title: draft.title,
    categoryId: live && draft.category_id ? draft.category_id : "",
    parts: encodeParts(
      draft.part_items ??
        draft.parts.map((label) => ({ label, quantity: null })),
    ),
    safety: draft.safety_notes ?? "",
    brand: draft.brand ?? "",
    model: draft.model ?? "",
    condition: draft.condition ?? "",
    details: draft.details ?? "",
  };
}

export function unsureKeys(draft: ListingDraft): Set<DraftKey> {
  return new Set(draft.unsure_fields.map((name) => unsureNames[name]));
}

export function mergeSuggestion(
  current: DraftFields,
  lastSuggested: DraftFields,
  next: DraftFields,
  dismissed: ReadonlySet<DraftKey> = new Set(),
): DraftFields {
  const merged = { ...current };
  for (const key of Object.keys(current) as DraftKey[]) {
    if (dismissed.has(key)) continue;
    if (current[key] === "" || current[key] === lastSuggested[key]) {
      merged[key] = next[key];
    }
  }
  return merged;
}

export type DraftPart = { label: string; quantity: number | null };

export function encodeParts(parts: readonly DraftPart[]) {
  return parts
    .map(({ label, quantity }) => `${label} × ${quantity ?? "?"}`)
    .join("\n");
}

export function parseParts(text: string) {
  const seen = new Set<string>();
  const parts: DraftPart[] = [];
  for (const line of text.split("\n")) {
    const notation = /^(.+?)\s+×\s+(\?|[1-9]\d{0,2})$/.exec(line.trim());
    const label = (notation?.[1] ?? line).trim().slice(0, MAX_LABEL).trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    parts.push({
      label,
      quantity:
        notation?.[2] === "?" ? null : notation ? Number(notation[2]) : 1,
    });
    if (parts.length === MAX_PARTS) break;
  }
  return parts;
}

export function partsKeptOnPhotoChange(current: string, suggested: string) {
  const previous = new Map(
    parseParts(suggested).map((part) => [part.label, part.quantity]),
  );
  return encodeParts(
    parseParts(current).filter(
      ({ label, quantity }) =>
        !previous.has(label) || previous.get(label) !== quantity,
    ),
  );
}

export function isRiskyCategory(categories: CategoryNode[], id: string) {
  return categories.some((item) => item.id === id && item.is_risky);
}

export function listingLendMode(
  kind: "tool" | "skill",
  categories: CategoryNode[],
  categoryId: string,
  suggestedMode?: ListingDraft["suggested_lend_mode"],
): "lend" | "help_only" {
  return kind === "skill" ||
    suggestedMode === "help_only" ||
    isRiskyCategory(categories, categoryId)
    ? "help_only"
    : "lend";
}

export const extraKeys = ["brand", "model", "condition", "details"] as const;
export type ExtraKey = (typeof extraKeys)[number];

export function visibleExtras(
  lastSuggested: DraftFields,
  dismissed: ReadonlySet<DraftKey>,
): ExtraKey[] {
  return extraKeys.filter(
    (key) => lastSuggested[key].trim() !== "" && !dismissed.has(key),
  );
}

export function composeDescription(
  description: string,
  fields: DraftFields,
  labels: { brand: string; model: string; condition: string },
  dismissed: ReadonlySet<DraftKey> = new Set(),
) {
  const lines = [description.trim()];
  for (const key of visibleExtras(fields, dismissed)) {
    const value = fields[key].trim();
    if (!value) continue;
    lines.push(key === "details" ? value : `${labels[key]}: ${value}`);
  }
  return lines.filter(Boolean).join("\n");
}
