import { type Exchange, type Language, type Page, request } from "@/lib/api";

export type RequestStatus =
  | "open"
  | "matched"
  | "in_progress"
  | "done"
  | "cancelled"
  | "expired";
export type ResponseKind = "offer" | "question" | "counter_time";
export type ResponseStatus =
  | "pending"
  | "accepted"
  | "superseded"
  | "withdrawn"
  | "expired";

export type RequestSummary = {
  id: string;
  requester_user_id: string;
  kind: "help" | "borrow" | "borrow_with_help";
  polite_text: string;
  lang: Language;
  status: RequestStatus;
  listing_id: string | null;
  direct_to_user_id: string | null;
  needed_from: string | null;
  needed_until: string | null;
  created_at: string;
};

export type NewDirectRequest = {
  kind: "borrow" | "help";
  raw_text: string;
  lang: Language;
  listing_id: string;
  direct_to_user_id: string;
  ripple_max_stage: "direct";
};

export type RequestDetail = RequestSummary & {
  listing: { id: string; title: string } | null;
  raw_text: string;
  my_role: "requester" | "recipient";
  my_response_status: ResponseStatus | null;
  my_response_id: string | null;
  exchange_id: string | null;
};

export type IncomingRequest = {
  request: RequestSummary;
  seen: boolean;
  my_response_status: ResponseStatus | null;
};

export type RequestResponse = {
  id: string;
  responder_user_id: string;
  kind: ResponseKind;
  status: ResponseStatus;
  message: string | null;
  proposed_start: string | null;
};

export type SendResponse = {
  kind: ResponseKind;
  lang: Language;
  message?: string;
  proposed_start?: string;
};

export type ExchangeDetail = Exchange & {
  mode: "help" | "loan";
  status:
    | "scheduled"
    | "active"
    | "returned"
    | "completed"
    | "cancelled"
    | "disputed";
};

function page<T>(path: string, cursor?: string) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return request<Page<T>>(`${path}?${query}`);
}

function post<T>(path: string, body?: object) {
  return request<T>(path, {
    method: "POST",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export const requestsApi = {
  mine: (cursor?: string) => page<RequestSummary>("/users/me/requests", cursor),
  incoming: (cursor?: string) =>
    page<IncomingRequest>("/users/me/received-requests", cursor),
  detail: (id: string) => request<RequestDetail>(`/requests/${id}`),
  responses: (id: string, cursor?: string) =>
    page<RequestResponse>(`/requests/${id}/responses`, cursor),
  respond: (id: string, body: SendResponse) =>
    post<RequestResponse>(`/requests/${id}/responses`, body),
  accept: (id: string, responseId: string) =>
    post<RequestResponse>(`/requests/${id}/responses/${responseId}/accept`),
  withdraw: (id: string, responseId: string) =>
    post<RequestResponse>(`/requests/${id}/responses/${responseId}/withdraw`),
  cancel: (id: string) => post<RequestDetail>(`/requests/${id}/cancel`),
  markSeen: (id: string) =>
    request<IncomingRequest>(`/users/me/received-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ seen: true }),
    }),
  person: (id: string) => request<{ display_name: string }>(`/users/${id}`),
  exchange: (id: string) => request<ExchangeDetail>(`/exchanges/${id}`),
  create: (body: NewDirectRequest, authUserId: string) =>
    request<RequestDetail>("/requests", {
      method: "POST",
      body: JSON.stringify(body),
      authUserId,
    }),
};
