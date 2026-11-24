import type { CategoryNode, ListingDraft, LendMode } from "./api";

export type DraftFields = {
  title: string;
  categoryId: string;
  parts: string;
  safety: string;
};
export const emptyDraftFields: DraftFields = {
  title: "",
  categoryId: "",
  parts: "",
  safety: "",
};

export function suggestionFields(
  draft: ListingDraft,
  categories: CategoryNode[],
): DraftFields {
  return {
    title: draft.title,
    categoryId: categories.some((category) => category.id === draft.category_id)
      ? draft.category_id!
      : "",
    parts: draft.parts.join("\n"),
    safety: draft.safety_notes ?? "",
  };
}

export function mergeSuggestion(
  current: DraftFields,
  previous: DraftFields,
  next: DraftFields,
): DraftFields {
  return Object.fromEntries(
    Object.entries(next).map(([key, value]) => {
      const field = key as keyof DraftFields;
      return [
        key,
        current[field] === "" || current[field] === previous[field]
          ? value
          : current[field],
      ];
    }),
  ) as DraftFields;
}

export function parseParts(
  text: string,
): { label: string; quantity: number }[] {
  const seen = new Set<string>();
  return text
    .split("\n")
    .map((label) => label.trim().slice(0, 120))
    .filter((label) => {
      const key = label.toLowerCase();
      if (!label || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30)
    .map((label) => ({ label, quantity: 1 }));
}

export function isRiskyCategory(
  categories: CategoryNode[],
  id: string,
): boolean {
  return categories.some((category) => category.id === id && category.is_risky);
}

export function listingLendMode(
  kind: "tool" | "skill",
  categories: CategoryNode[],
  id: string,
  suggestedMode?: LendMode | null,
): "lend" | "help_only" {
  return kind === "skill" ||
    isRiskyCategory(categories, id) ||
    suggestedMode === "help_only"
    ? "help_only"
    : "lend";
}
