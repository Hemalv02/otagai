import type {
  FamilyLink,
  Language,
  ProfileSummary,
  ProxyGrant,
  RequestSummary,
} from "./api";

export type FamilyAccount = {
  id: string;
  name: string;
  isSelf: boolean;
  canViewActivity: boolean;
};

export type LinkStanding =
  | "pending-outgoing"
  | "pending-incoming"
  | "can-view"
  | "activity-hidden"
  | "no-permission";

export type FamilyLinkRow = {
  id: string;
  personId: string;
  name: string;
  standing: LinkStanding;
};

export type StatusLinkStanding = Exclude<
  LinkStanding,
  "can-view" | "activity-hidden"
>;

export type StatusLinkRow = FamilyLinkRow & { standing: StatusLinkStanding };

export type FamilyOverview = {
  accounts: FamilyAccount[];
  links: FamilyLinkRow[];
};

export type RequestsView =
  | { status: "loading" }
  | { status: "ready"; items: RequestSummary[]; refreshFailed: boolean }
  | { status: "error"; message: string }
  | { status: "denied" };

export type RequestsEntry = { accountId: string; view: RequestsView };

export type RequestsResult =
  | { ok: true; items: RequestSummary[] }
  | { ok: false; denied: boolean; message: string };

const FORBIDDEN = 403;

const dateLocales: Record<Language, string> = {
  en: "en-GB",
  ja: "ja-JP",
  bn: "bn-BD",
};

export function buildFamilyOverview(
  self: ProfileSummary,
  links: readonly FamilyLink[],
  grants: readonly ProxyGrant[],
): FamilyOverview {
  const grantsByMember = new Map<string, ProxyGrant>();
  for (const grant of grants) {
    if (
      grant.other &&
      grant.caretaker_user_id === self.id &&
      grant.member_user_id !== self.id &&
      !grantsByMember.has(grant.member_user_id)
    ) {
      grantsByMember.set(grant.member_user_id, grant);
    }
  }

  const accounts: FamilyAccount[] = [
    {
      id: self.id,
      name: self.display_name,
      isSelf: true,
      canViewActivity: true,
    },
    ...Array.from(grantsByMember.values(), (grant) => ({
      id: grant.member_user_id,
      name: grant.other?.display_name ?? "",
      isSelf: false,
      canViewActivity: grant.can_view_activity,
    })),
  ];

  const rows = links.flatMap((link): FamilyLinkRow[] => {
    if (!link.other || link.status === "revoked") return [];
    return [
      {
        id: link.id,
        personId: link.other.id,
        name: link.other.display_name,
        standing: linkStanding(
          self.id,
          link,
          grantsByMember.get(link.other.id),
        ),
      },
    ];
  });

  return { accounts, links: rows };
}

function linkStanding(
  selfId: string,
  link: FamilyLink,
  grant: ProxyGrant | undefined,
): LinkStanding {
  if (link.status === "pending") {
    return link.user_id === selfId ? "pending-outgoing" : "pending-incoming";
  }
  if (!grant) return "no-permission";
  return grant.can_view_activity ? "can-view" : "activity-hidden";
}

export function selectAccount(
  accounts: readonly FamilyAccount[],
  selectedId: string | null,
): FamilyAccount {
  return accounts.find((account) => account.id === selectedId) ?? accounts[0];
}

export function statusLinks(links: readonly FamilyLinkRow[]): StatusLinkRow[] {
  return links.filter(
    (link): link is StatusLinkRow =>
      link.standing !== "can-view" && link.standing !== "activity-hidden",
  );
}

export function retainSelection(
  accounts: readonly FamilyAccount[],
  selectedId: string | null,
): string | null {
  return accounts.some((account) => account.id === selectedId)
    ? selectedId
    : null;
}

export function failureResult(status: number, message: string): RequestsResult {
  return { ok: false, denied: status === FORBIDDEN, message };
}

export function nextRequestsEntry(
  previous: RequestsEntry | null,
  accountId: string,
  result: RequestsResult,
): RequestsEntry {
  if (result.ok) {
    const items = result.items.filter(
      (item) => item.status === "open" && item.requester_user_id === accountId,
    );
    return {
      accountId,
      view: { status: "ready", items, refreshFailed: false },
    };
  }
  if (result.denied) return { accountId, view: { status: "denied" } };
  if (previous?.accountId === accountId && previous.view.status === "ready") {
    return { accountId, view: { ...previous.view, refreshFailed: true } };
  }
  return { accountId, view: { status: "error", message: result.message } };
}

export function requestsViewFor(
  entry: RequestsEntry | null,
  account: FamilyAccount,
): RequestsView | { status: "no-permission" } {
  if (!account.canViewActivity) return { status: "no-permission" };
  if (entry?.accountId !== account.id) return { status: "loading" };
  return entry.view;
}

export function formatDateTime(
  iso: string,
  locale: Language,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(dateLocales[locale], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(new Date(iso));
}

export function formatDate(
  iso: string,
  locale: Language,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(dateLocales[locale], {
    month: "short",
    day: "numeric",
    ...options,
  }).format(new Date(iso));
}

export function formatNeededWindow(
  from: string | null,
  until: string | null,
  locale: Language,
  options: Intl.DateTimeFormatOptions = {},
): string | null {
  const start = from ? formatDateTime(from, locale, options) : null;
  const end = until ? formatDateTime(until, locale, options) : null;
  if (from && until && start && end) {
    const day = { ...options, year: "numeric" } as const;
    const sameDay =
      formatDate(from, locale, day) === formatDate(until, locale, day);
    if (sameDay) {
      const time = new Intl.DateTimeFormat(dateLocales[locale], {
        hour: "numeric",
        minute: "2-digit",
        ...options,
      }).format(new Date(until));
      return `${start} – ${time}`;
    }
    return `${start} – ${end}`;
  }
  if (start) return start;
  if (end) return `– ${end}`;
  return null;
}
