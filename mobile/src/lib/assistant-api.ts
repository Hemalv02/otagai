import type {
  DraftRelationship,
  RequestTone,
  RequestWording,
  WordingInput,
} from "@/lib/request-wording";
import type { RippleScope } from "@/lib/request-ripple";
import { File as ExpoFile } from "expo-file-system";

import {
  ApiError,
  request as apiRequest,
  type Language,
  type Page,
} from "@/lib/api";
import { assistantCopy } from "@/lib/assistant-copy";

export type RequestKind = "borrow" | "help" | "borrow_with_help";
export type ListingStatus = "active" | "paused" | "lent_out" | "deleted";

export type ListingSummary = {
  id: string;
  kind: "tool" | "skill";
  title: string;
  lend_mode: "lend" | "help_only" | "lend_or_help";
  status: ListingStatus;
  available_again_at: string | null;
  photo_url: string | null;
};

export type ListingDetail = Omit<ListingSummary, "photo_url"> & {
  description: string | null;
  lang: Language;
  safety_notes: string | null;
  availability_note: string | null;
  max_loan_days: number | null;
  owner: Person | null;
  parts: { label: string; quantity: number }[];
  photos: {
    media_id: string;
    thumb_url: string | null;
    display_url: string | null;
  }[];
};

export type Person = { id: string; display_name: string };
export type HelperProfile = Person & {
  intro: string | null;
  happy_to_help_with: string | null;
};

export type AssistantCard = {
  type: "tool" | "helper";
  action: "borrow" | "ask_for_help";
  listing: ListingSummary;
  owner: Person;
};

export type ListingRequest = {
  listing_id: string;
  request_id: string;
  title: string;
  kind: RequestKind;
};

export type AssistantTurn = {
  id: string;
  thread_id: string;
  text: string | null;
  reply: string;
  no_matches: boolean;
  clarification:
    "task" | "tool" | "tool_or_help" | "material" | "timing" | "photo" | null;
  cards: AssistantCard[];
  draft: {
    kind: RequestKind;
    title: string;
    description: string;
    when_text: string | null;
    language: Language;
    tone: RequestTone;
    relationship: DraftRelationship;
    status: "awaiting_confirmation" | "posted";
  } | null;
  image_media_id: string | null;
  image_subject: string | null;
  request_id: string | null;
  listing_requests: ListingRequest[];
  created_at: string;
};

export type AssistantThread = {
  id: string;
  title: string;
  updated_at: string;
};

export type ConfirmRequest = {
  kind: RequestKind;
  text: string;
  title?: string;
  language?: Language;
  tone?: RequestTone;
  relationship?: DraftRelationship;
  listing_id?: string;
  home_circle_id?: string;
  ripple_start_stage?: "family" | "han";
  ripple_max_stage?: RippleScope;
};

export type PostedRequest = {
  id: string;
  kind: RequestKind;
  status: "open" | "matched" | "in_progress" | "done" | "cancelled" | "expired";
  polite_text: string;
  lang: Language;
  listing_id: string | null;
  direct_to_user_id: string | null;
};

type Media = { id: string; urls: Record<string, string> };
export type MediaFile = {
  uri: string;
  file?: File;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    return await apiRequest<T>(path, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted)
      throw new ApiError(408, "Request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

function paginate(path: string, cursor?: string | null) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return `${path}?${query}`;
}

export function assistantError(error: unknown, locale: Language) {
  const copy = assistantCopy[locale];
  if (!(error instanceof ApiError)) return copy.failed;
  switch (error.status) {
    case 0:
      return copy.offline;
    case 401:
      return copy.signInAgain;
    case 408:
      return copy.timedOut;
    case 429:
      return copy.rateLimited;
    case 413:
      return copy.attachmentTooLarge;
    case 415:
      return copy.attachmentUnsupported;
    case 400:
    case 422:
      return copy.invalid;
    case 404:
    case 409:
      return copy.unavailable;
    default:
      return copy.failed;
  }
}

export const assistantApi = {
  threads: (cursor?: string | null) =>
    request<Page<AssistantThread>>(paginate("/assistant/threads", cursor)),
  turns: (threadId: string, cursor?: string | null) =>
    request<Page<AssistantTurn>>(
      paginate(`/assistant/threads/${threadId}/turns`, cursor),
    ),
  send: (body: {
    language: Language;
    text?: string;
    image_media_id?: string;
    previous_turn_id?: string;
  }) => post<AssistantTurn>("/assistant/turns", body),
  draftWording: (
    turnId: string,
    body: WordingInput & { listing_id?: string },
    signal: AbortSignal,
  ) =>
    apiRequest<RequestWording>(
      `/assistant/turns/${encodeURIComponent(turnId)}/drafts`,
      { method: "POST", body: JSON.stringify(body), signal },
    ),
  confirm: (turnId: string, body: ConfirmRequest) =>
    post<PostedRequest>(`/assistant/turns/${turnId}/confirm`, body),
  listing: (id: string) => request<ListingDetail>(`/listings/${id}`),
  helper: (id: string) => request<HelperProfile>(`/users/${id}`),
  postedRequest: (id: string) => request<PostedRequest>(`/requests/${id}`),
  media: (id: string) => request<Media>(`/media/${id}`),
  upload: (purpose: "ask" | "voice", picked: MediaFile) => {
    const body = new FormData();
    body.append("purpose", purpose);
    body.append("file", picked.file ?? new ExpoFile(picked.uri));
    return request<Media>("/media", { method: "POST", body });
  },
  transcribe: (id: string) =>
    post<{ text: string }>("/ai/transcriptions", { media_id: id }),
  translate: (text: string, from: Language, to: Language) =>
    post<{ translated: string }>("/ai/translations", {
      text,
      source_language: from,
      target_language: to,
    }),
};
