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
  en: { auth: "Sign in again to see listings.", invalid: "Check your search or filters.", unavailable: "This listing is no longer available.", error: "Could not load this information.", transient: "Could not connect. Check your connection and try again.", titleHint: "Search by title.", readOnly: "Requests are not available here yet." },
  ja: { auth: "掲載を見るには再度ログインしてください。", invalid: "検索語や絞り込みを確認してください。", unavailable: "この掲載は現在利用できません。", error: "情報を読み込めませんでした。", transient: "接続できませんでした。通信環境を確認して再試行してください。", titleHint: "タイトルで検索します。", readOnly: "ここからの依頼はまだ利用できません。" },
  bn: { auth: "তালিকা দেখতে আবার সাইন ইন করুন।", invalid: "অনুসন্ধান বা ফিল্টার যাচাই করুন।", unavailable: "এই তালিকাটি এখন আর পাওয়া যাচ্ছে না।", error: "তথ্য লোড করা যায়নি।", transient: "সংযোগ করা যায়নি। সংযোগ যাচাই করে আবার চেষ্টা করুন।", titleHint: "শিরোনাম দিয়ে খুঁজুন।", readOnly: "এখান থেকে অনুরোধ করা এখনো সম্ভব নয়।" },
} as const;
