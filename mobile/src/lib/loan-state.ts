import type { Exchange } from "@/lib/api";

type LoanState = Pick<
  Exchange,
  | "status"
  | "requester_user_id"
  | "helper_user_id"
  | "requester_confirmed_at"
  | "helper_confirmed_at"
>;

export function loanStage(loan: LoanState, accountId: string | null) {
  const borrower = accountId === loan.requester_user_id;
  if (!borrower && accountId !== loan.helper_user_id) return "closed";

  switch (loan.status) {
    case "scheduled":
      return "pickup";
    case "active":
      return "return";
    case "returned": {
      const confirmed = borrower
        ? loan.requester_confirmed_at
        : loan.helper_confirmed_at;
      return confirmed ? "waiting" : "confirm";
    }
    case "completed":
      return "completed";
    default:
      return "closed";
  }
}
