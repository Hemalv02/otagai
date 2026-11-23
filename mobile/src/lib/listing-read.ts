import { ApiError, type CategoryNode, type Language } from "./api";

export function requestApiError(error: unknown): "transient" | "auth" | "invalid" | "unavailable" | "error" {
  if (!(error instanceof ApiError)) return "error";
  if (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500) return "transient";
  if (error.status === 401 || error.status === 403) return "auth";
  if (error.status === 422 || error.status === 400) return "invalid";
  if (error.status === 404) return "unavailable";
  return "error";
}

export function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children)]);
}

export function categoryName(node: CategoryNode, locale: Language): string {
  const name = node.names[locale] ?? node.names.en ?? node.names.ja ?? Object.values(node.names).find((value) => typeof value === "string");
  return typeof name === "string" ? name : node.slug;
}

export const listingReadCopy = {
  en: { auth: "Sign in again to see listings.", invalid: "Check your search or filters.", unavailable: "This listing is no longer available.", error: "Could not load this information.", transient: "Could not connect. Check your connection and try again.", titleSearch: "Search listing titles", titleHint: "Search by title.", readOnly: "Requests are not available here yet.", lend: "Available to lend", help_only: "Help offered", lend_or_help: "Lending or help offered" },
  ja: { auth: "掲載を見るには再度ログインしてください。", invalid: "検索語や絞り込みを確認してください。", unavailable: "この掲載は現在利用できません。", error: "情報を読み込めませんでした。", transient: "接続できませんでした。通信環境を確認して再試行してください。", titleSearch: "掲載タイトルを検索", titleHint: "タイトルで検索します。", readOnly: "ここからの依頼はまだ利用できません。", lend: "貸し出し可", help_only: "お手伝いできます", lend_or_help: "貸し出しまたはお手伝い" },
  bn: { auth: "তালিকা দেখতে আবার সাইন ইন করুন।", invalid: "অনুসন্ধান বা ফিল্টার যাচাই করুন।", unavailable: "এই তালিকাটি এখন আর পাওয়া যাচ্ছে না।", error: "তথ্য লোড করা যায়নি।", transient: "সংযোগ করা যায়নি। সংযোগ যাচাই করে আবার চেষ্টা করুন।", titleSearch: "তালিকার শিরোনাম খুঁজুন", titleHint: "শিরোনাম দিয়ে খুঁজুন।", readOnly: "এখান থেকে অনুরোধ করা এখনো সম্ভব নয়।", lend: "ধার দেওয়া যাবে", help_only: "সাহায্য দেওয়া হবে", lend_or_help: "ধার বা সাহায্য দেওয়া হবে" },
} as const;
