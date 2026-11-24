import type { FamilyLink, Language, ProxyGrant } from "./api";

export const GRANT_SCOPES = [
  "can_post_requests",
  "can_chat",
  "can_thank_and_pay",
  "can_view_activity",
] as const;

export type GrantScope = (typeof GRANT_SCOPES)[number];
export type ScopeChoice = Record<GrantScope, boolean>;
export type ExplicitScopes = ScopeChoice & { can_manage_listings: false };

export type ConsentMethod = "in_person" | "via_coordinator" | "phone_call";
export const CONSENT_METHODS: readonly ConsentMethod[] = [
  "in_person",
  "via_coordinator",
  "phone_call",
];

export type FamilyRelation =
  | "parent"
  | "child"
  | "sibling"
  | "spouse"
  | "grandparent"
  | "grandchild"
  | "other";
export const FAMILY_RELATIONS: readonly FamilyRelation[] = [
  "parent",
  "child",
  "sibling",
  "spouse",
  "grandparent",
  "grandchild",
  "other",
];

export const DEFAULT_SCOPES: ScopeChoice = {
  can_post_requests: true,
  can_chat: true,
  can_thank_and_pay: false,
  can_view_activity: true,
};

export type PermissionRow = {
  grantId: string;
  personId: string;
  name: string;
  memberName: string | null;
  scopes: ScopeChoice;
  canEdit: boolean;
};

export type Permissions = {
  actsForMe: PermissionRow[];
  iHelp: PermissionRow[];
};

export type ActingDraft = {
  need: string;
  when: string;
  details: string;
  circleId: string | null;
};

export type ActingField = "need" | "when" | "details" | "circle";

export type SendFailure =
  "revoked" | "destination" | "offline" | "session" | "failed";

export const LIMITS = { need: 200, when: 120, details: 1500 } as const;

const MEMBER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function explicitScopes(choice: Partial<ScopeChoice>): ExplicitScopes {
  return {
    can_post_requests: choice.can_post_requests === true,
    can_chat: choice.can_chat === true,
    can_thank_and_pay: choice.can_thank_and_pay === true,
    can_view_activity: choice.can_view_activity === true,
    can_manage_listings: false,
  };
}

export function scopesOf(grant: ProxyGrant): ScopeChoice {
  return {
    can_post_requests: grant.can_post_requests,
    can_chat: grant.can_chat,
    can_thank_and_pay: grant.can_thank_and_pay,
    can_view_activity: grant.can_view_activity,
  };
}

export function scopeChanges(
  before: ScopeChoice,
  after: ScopeChoice,
): { scope: GrantScope; enabled: boolean }[] {
  return GRANT_SCOPES.filter((scope) => before[scope] !== after[scope]).map(
    (scope) => ({ scope, enabled: after[scope] }),
  );
}

function row(grant: ProxyGrant, iHelp: boolean): PermissionRow[] {
  if (!grant.other) return [];
  return [
    {
      grantId: grant.id,
      personId: grant.other.id,
      name: grant.other.display_name,
      memberName: iHelp ? grant.other.display_name : null,
      scopes: scopesOf(grant),
      canEdit: !iHelp || grant.can_change_scopes === true,
    },
  ];
}

export function buildPermissions(
  selfId: string,
  asMember: readonly ProxyGrant[],
  asCaretaker: readonly ProxyGrant[],
): Permissions {
  return {
    actsForMe: asMember
      .filter((grant) => grant.member_user_id === selfId)
      .flatMap((grant) => row(grant, false)),
    iHelp: asCaretaker
      .filter((grant) => grant.caretaker_user_id === selfId)
      .flatMap((grant) => row(grant, true)),
  };
}

export function grantCandidates(
  links: readonly FamilyLink[],
  asMember: readonly ProxyGrant[],
): { id: string; name: string }[] {
  const caretakers = new Set(asMember.map((grant) => grant.caretaker_user_id));
  const seen = new Set<string>();
  return links.flatMap((link) => {
    const other = link.other;
    if (
      link.status !== "accepted" ||
      !other ||
      caretakers.has(other.id) ||
      seen.has(other.id)
    ) {
      return [];
    }
    seen.add(other.id);
    return [{ id: other.id, name: other.display_name }];
  });
}

export function normalizeMemberId(value: string): string | null {
  const candidate = value.trim().toLowerCase();
  return MEMBER_ID.test(candidate) ? candidate : null;
}

export function validateActingDraft(draft: ActingDraft): ActingField[] {
  const problems: ActingField[] = [];
  const need = draft.need.trim();
  if (!need || Array.from(need).length > LIMITS.need) problems.push("need");
  if (Array.from(draft.when.trim()).length > LIMITS.when) problems.push("when");
  if (Array.from(draft.details.trim()).length > LIMITS.details) {
    problems.push("details");
  }
  if (!draft.circleId) problems.push("circle");
  return problems;
}

export function actingRequestBody(
  draft: ActingDraft,
  lang: Language,
  whenLabel: string,
) {
  const when = draft.when.trim();
  const details = draft.details.trim();
  const lines = [
    draft.need.trim(),
    ...(when ? [`${whenLabel}: ${when}`] : []),
  ].join("\n");
  return {
    kind: "help" as const,
    raw_text: details ? `${lines}\n\n${details}` : lines,
    lang,
    home_circle_id: draft.circleId ?? "",
  };
}

export function classifySendFailure(status: number): SendFailure {
  if (status === 403) return "revoked";
  if (status === 400) return "destination";
  if (status === 401) return "session";
  if (status === 0) return "offline";
  return "failed";
}
