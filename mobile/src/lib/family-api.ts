import {
  type FamilyLink,
  type Language,
  type ProxyGrant,
  type Region,
  request,
  type RequestSummary,
} from "@/lib/api";
import type {
  ConsentMethod,
  ExplicitScopes,
  FamilyRelation,
  ScopeChoice,
} from "@/lib/family-consent";

export type DestinationCircle = {
  id: string;
  name: string;
  name_translations: Partial<Record<Language, unknown>>;
  region: Region;
  unit_type: string;
};

export type NewManagedMember = {
  display_name: string;
  preferred_language: Language;
  region: Region;
  grant: {
    caretaker_role: "family";
    consent_method: ConsentMethod;
    scopes: ExplicitScopes;
  };
};

export type ActingRequestBody = {
  kind: "help";
  raw_text: string;
  lang: Language;
  home_circle_id: string;
};

type Write = { authUserId: string };

function post<T>(path: string, body: unknown, { authUserId }: Write) {
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    authUserId,
  });
}

function actingHeaders(memberId: string) {
  return { "X-Acting-For": memberId };
}

export const familyApi = {
  links: async (signal?: AbortSignal) =>
    (
      await request<{ items: FamilyLink[] }>("/users/me/family-links", {
        signal,
      })
    ).items,
  grants: async (
    as: "member" | "caretaker",
    signal?: AbortSignal,
    authUserId?: string,
  ) =>
    (
      await request<{ items: ProxyGrant[] }>(
        `/users/me/proxy-grants?as=${as}`,
        { signal, authUserId },
      )
    ).items,
  createManagedMember: (body: NewManagedMember, write: Write) =>
    post<{ user: { id: string; display_name: string }; grant: ProxyGrant }>(
      "/managed-users",
      body,
      write,
    ),
  linkFamily: (
    relativeUserId: string,
    relation: FamilyRelation,
    write: Write,
  ) =>
    post<FamilyLink>(
      "/family-links",
      { relative_user_id: relativeUserId, relation },
      write,
    ),
  acceptLink: (linkId: string, write: Write) =>
    post<FamilyLink>(
      `/family-links/${encodeURIComponent(linkId)}/accept`,
      undefined,
      write,
    ),
  endLink: (linkId: string, write: Write) =>
    post<FamilyLink>(
      `/family-links/${encodeURIComponent(linkId)}/revoke`,
      undefined,
      write,
    ),
  giveAccess: (
    memberId: string,
    caretakerId: string,
    consentMethod: ConsentMethod,
    scopes: ExplicitScopes,
    write: Write,
  ) =>
    post<ProxyGrant>(
      "/proxy-grants",
      {
        member_user_id: memberId,
        caretaker_user_id: caretakerId,
        caretaker_role: "family",
        consent_method: consentMethod,
        scopes,
      },
      write,
    ),
  updateScopes: (
    grantId: string,
    changes: Partial<ScopeChoice>,
    write: Write,
  ) =>
    request<ProxyGrant>(`/proxy-grants/${encodeURIComponent(grantId)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
      authUserId: write.authUserId,
    }),
  endAccess: (grantId: string, write: Write) =>
    post<ProxyGrant>(
      `/proxy-grants/${encodeURIComponent(grantId)}/revoke`,
      undefined,
      write,
    ),
  destinationsFor: async (
    memberId: string,
    signal?: AbortSignal,
    authUserId?: string,
  ) =>
    (
      await request<{ items: DestinationCircle[] }>(
        "/users/me/request-destinations",
        { headers: actingHeaders(memberId), signal, authUserId },
      )
    ).items,
  postFor: (memberId: string, body: ActingRequestBody, write: Write) =>
    request<RequestSummary>("/requests", {
      method: "POST",
      body: JSON.stringify(body),
      headers: actingHeaders(memberId),
      authUserId: write.authUserId,
    }),
};
