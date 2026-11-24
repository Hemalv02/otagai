import type { Language } from "./api";

export const draftRelationships = ["neighbor", "elder", "family"] as const;

export type DraftRelationship = (typeof draftRelationships)[number];
export type RequestTone = "polite" | "keigo" | "casual";

export type WordingSource = {
  text: string;
  title?: string;
  when_text?: string;
};

export type WordingInput = WordingSource & {
  relationship: DraftRelationship;
  language?: Language;
};

export type RequestWording = {
  title: string;
  message: string;
  when_text: string | null;
  language: Language;
  tone: RequestTone;
  relationship: DraftRelationship;
};
