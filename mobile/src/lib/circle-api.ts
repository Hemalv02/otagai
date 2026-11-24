import {
  type CircleDetail,
  type MembershipRole,
  type Page,
  request,
} from "@/lib/api";
import type { ReportReason, ReportTarget } from "@/lib/neighbour-api";

export type MembershipStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "removed"
  | "left";

export type MembershipDetail = {
  circle_id: string;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  joined_via: string;
  created_at: string;
  decided_at: string | null;
};

export type RosterMembership = MembershipDetail & {
  display_name: string | null;
};

export type CircleInvite = {
  id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  auto_approve: boolean;
  revoked_at: string | null;
  created_at: string;
};

export type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

export type CircleReport = {
  id: string;
  target_type: ReportTarget;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  circle_id: string | null;
  created_at: string;
};

export type Decision = "approve" | "reject" | "remove";

function pagePath(
  path: string,
  filters: Record<string, string> = {},
  cursor?: string | null,
) {
  const query = new URLSearchParams({ limit: "20", ...filters });
  if (cursor) query.set("cursor", cursor);
  return `${path}?${query}`;
}

export function circleApi(authUserId: string) {
  function get<T>(path: string) {
    return request<T>(path, { authUserId });
  }
  function post<T>(path: string, body?: unknown) {
    return request<T>(path, {
      authUserId,
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const circleId = (id: string) => encodeURIComponent(id);

  return {
    circle: (id: string) => get<CircleDetail>(`/circles/${circleId(id)}`),
    profile: (id: string) =>
      get<{ id: string; display_name: string }>(
        `/users/${encodeURIComponent(id)}`,
      ),
    listing: (id: string) =>
      get<{ title: string }>(`/listings/${encodeURIComponent(id)}`),
    members: (id: string, status?: MembershipStatus, cursor?: string | null) =>
      get<Page<RosterMembership>>(
        pagePath(
          `/circles/${circleId(id)}/memberships`,
          status ? { status } : {},
          cursor,
        ),
      ),
    decide: (id: string, memberId: string, decision: Decision) =>
      post<MembershipDetail>(
        `/circles/${circleId(id)}/memberships/${encodeURIComponent(
          memberId,
        )}/${decision}`,
      ),
    invites: (id: string, cursor?: string | null) =>
      get<Page<CircleInvite>>(
        pagePath(`/circles/${circleId(id)}/invites`, {}, cursor),
      ),
    createInvite: (id: string, body: { auto_approve: boolean }) =>
      post<CircleInvite>(`/circles/${circleId(id)}/invites`, body),
    revokeInvite: (id: string, inviteId: string) =>
      post<CircleInvite>(
        `/circles/${circleId(id)}/invites/${encodeURIComponent(
          inviteId,
        )}/revoke`,
      ),
    reports: (id: string, statuses: ReportStatus[], cursor?: string | null) =>
      get<Page<CircleReport>>(
        pagePath(
          `/circles/${circleId(id)}/reports`,
          statuses.length ? { status: statuses.join(",") } : {},
          cursor,
        ),
      ),
    resolveReport: (reportId: string, dismiss: boolean) =>
      post<CircleReport>(
        `/reports/${encodeURIComponent(reportId)}/${
          dismiss ? "dismiss" : "resolve"
        }`,
      ),
    myReports: (cursor?: string | null) =>
      get<Page<CircleReport>>(pagePath("/users/me/reports", {}, cursor)),
  };
}
