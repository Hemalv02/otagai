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
const MAX_DESCRIPTION = 2000;

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
    parts: draft.parts.join("\n"),
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

export function parseParts(text: string) {
  const seen = new Set<string>();
  const parts: { label: string; quantity: number }[] = [];
  for (const line of text.split("\n")) {
    const label = line.trim().slice(0, MAX_LABEL).trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    parts.push({ label, quantity: 1 });
    if (parts.length === MAX_PARTS) break;
  }
  return parts;
}

export function isRiskyCategory(categories: CategoryNode[], id: string) {
  return categories.some((item) => item.id === id && item.is_risky);
}

export function listingLendMode(
  kind: "tool" | "skill",
  categories: CategoryNode[],
  categoryId: string,
): "lend" | "help_only" {
  return kind === "skill" || isRiskyCategory(categories, categoryId)
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
  lastSuggested: DraftFields,
  dismissed: ReadonlySet<DraftKey> = new Set(),
) {
  const lines = [description.trim()];
  for (const key of visibleExtras(lastSuggested, dismissed)) {
    const value = fields[key].trim();
    if (!value) continue;
    lines.push(key === "details" ? value : `${labels[key]}: ${value}`);
  }
  return lines.filter(Boolean).join("\n").slice(0, MAX_DESCRIPTION);
}
