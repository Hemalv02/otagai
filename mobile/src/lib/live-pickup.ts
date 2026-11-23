import {
  ApiError,
  request,
  type Exchange,
  type Language,
  type Media,
} from "@/lib/api";

export type PickupItem = {
  id: string;
  label: string;
  quantity: number;
  present: boolean | null;
  disputed_by_user_id: string | null;
  dispute_note: string | null;
};

export type PickupCheck = {
  id: string;
  phase: string;
  items: PickupItem[];
  media_ids: string[];
  lender_confirmed_at: string | null;
  borrower_confirmed_at: string | null;
};

export type Part = { label: string; quantity: number };
type ItemChanges = Partial<
  Part & { present: boolean | null; dispute_note: string | null }
>;

export function pickupApi(authUserId: string) {
  function get<T>(path: string) {
    return request<T>(path, { authUserId });
  }

  function send<T>(path: string, method: string, body?: object) {
    return request<T>(path, {
      authUserId,
      method,
      body: body instanceof FormData ? body : body && JSON.stringify(body),
    });
  }

  const checks = (id: string) => `/exchanges/${id}/handover-checks`;
  const check = (id: string) => `/handover-checks/${id}`;
  const find = async (id: string) =>
    (await get<{ items: PickupCheck[] }>(checks(id))).items.find(
      (row) => row.phase === "pickup",
    ) ?? null;

  return {
    exchange: (id: string) => get<Exchange>(`/exchanges/${id}`),
    find,
    async start(id: string) {
      try {
        return await send<PickupCheck>(checks(id), "POST", { phase: "pickup" });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const existing = await find(id);
          if (existing) return existing;
        }
        throw error;
      }
    },
    media: (id: string) => get<Media>(`/media/${id}`),
    upload: (body: FormData) => send<Media>("/media", "POST", body),
    attach: (id: string, mediaId: string) =>
      send<PickupCheck>(`${check(id)}/media`, "POST", { media_ids: [mediaId] }),
    suggest: (id: string, lang: Language) =>
      send<{ items: Part[] }>(`${check(id)}/suggestions`, "POST", { lang }),
    add: (id: string, part: Part) =>
      send<PickupCheck>(`${check(id)}/items`, "POST", part),
    edit: (id: string, itemId: string, body: ItemChanges) =>
      send<PickupCheck>(`${check(id)}/items/${itemId}`, "PATCH", body),
    remove: (id: string, itemId: string) =>
      send<void>(`${check(id)}/items/${itemId}`, "DELETE"),
    confirm: (id: string) => send<PickupCheck>(`${check(id)}/confirm`, "POST"),
    record: (id: string) =>
      send<Exchange>(`/exchanges/${id}/hand-over`, "POST"),
  };
}

const en = {
  title: "Pickup checklist",
  intro: "Check what’s included, then both confirm the handover.",
  start: "Start checklist",
  camera: "Take photo",
  library: "Choose photo",
  permission: "Allow camera access to take a pickup photo.",
  photo: "Pickup photo",
  photoError: "Couldn’t show all pickup photos. Refresh to try again.",
  retryPhoto: "Retry attaching photo",
  suggest: "Suggest items from photos",
  suggestions: "Photo suggestions",
  review: "Add an item only after you’ve checked it together.",
  emptySuggestions:
    "No additional items were identified. You can add items by hand.",
  use: "Add",
  items: "Items to check",
  empty: "Add an item to start checking the pickup.",
  add: "Add item",
  edit: "Edit",
  label: "Item name",
  amount: "Quantity",
  present: "Present",
  missing: "Missing",
  unchecked: "To check",
  dispute: "What needs checking?",
  note: "Note from your neighbour",
  clear: "Clear note",
  discard: "Remove item",
  save: "Save",
  confirmed: "Confirmed",
  waiting: "Waiting",
  you: "You",
  neighbour: "Your neighbour",
  confirm: "Confirm pickup",
  record: "Record pickup",
  refresh: "Refresh checklist",
  complete: "Pickup recorded",
  change: "Changes clear any previous confirmations.",
  failure: "Couldn’t save the change. Refresh and try again.",
  changedPhoto:
    "The photo couldn’t be attached. Try again with a supported image.",
  aiFailure:
    "Photo suggestions are unavailable. You can still add items by hand.",
};

const ja: typeof en = {
  title: "受け渡しチェックリスト",
  intro: "品物を一緒に確認し、お二人で受け渡しを確定してください。",
  start: "確認を始める",
  camera: "写真を撮る",
  library: "写真を選ぶ",
  permission: "受け渡しを撮影するにはカメラへのアクセスを許可してください。",
  photo: "受け渡し写真",
  photoError: "一部の写真を表示できませんでした。再読み込みしてください。",
  retryPhoto: "写真の添付を再試行",
  suggest: "写真から品物を提案",
  suggestions: "写真からの提案",
  review: "一緒に確認した品物を追加してください。",
  emptySuggestions: "追加の候補はありません。品物は手動で追加できます。",
  use: "追加",
  items: "確認する品物",
  empty: "品物を追加して受け渡しを確認してください。",
  add: "品物を追加",
  edit: "編集",
  label: "品物の名前",
  amount: "数量",
  present: "あり",
  missing: "不足",
  unchecked: "未確認",
  dispute: "確認が必要な点",
  note: "相手からのメモ",
  clear: "メモを消去",
  discard: "品物を削除",
  save: "保存",
  confirmed: "確認済み",
  waiting: "確認待ち",
  you: "あなた",
  neighbour: "相手",
  confirm: "受け渡しを確認",
  record: "受け渡しを記録",
  refresh: "リストを再読み込み",
  complete: "受け渡しを記録しました",
  change: "変更すると、これまでの確認が取り消されます。",
  failure: "変更を保存できませんでした。再読み込みしてお試しください。",
  changedPhoto:
    "写真を添付できませんでした。対応している画像でお試しください。",
  aiFailure: "写真から提案できませんでした。品物は手動で追加できます。",
};

const bn: typeof en = {
  title: "হস্তান্তরের তালিকা",
  intro: "কী কী আছে মিলিয়ে দেখে দুজনেই হস্তান্তর নিশ্চিত করুন।",
  start: "তালিকা শুরু করুন",
  camera: "ছবি তুলুন",
  library: "ছবি বেছে নিন",
  permission: "হস্তান্তরের ছবি তুলতে ক্যামেরা ব্যবহারের অনুমতি দিন।",
  photo: "হস্তান্তরের ছবি",
  photoError: "সব ছবি দেখা যায়নি। আবার লোড করুন।",
  retryPhoto: "ছবি আবার যুক্ত করুন",
  suggest: "ছবি থেকে পরামর্শ নিন",
  suggestions: "ছবি থেকে পাওয়া পরামর্শ",
  review: "একসঙ্গে যাচাই করার পর জিনিসটি যোগ করুন।",
  emptySuggestions: "আর কোনো জিনিস চিহ্নিত হয়নি। নিজে থেকে যোগ করতে পারেন।",
  use: "যোগ করুন",
  items: "যা মিলিয়ে দেখবেন",
  empty: "হস্তান্তর যাচাই করতে একটি জিনিস যোগ করুন।",
  add: "জিনিস যোগ করুন",
  edit: "সম্পাদনা",
  label: "জিনিসের নাম",
  amount: "পরিমাণ",
  present: "আছে",
  missing: "নেই",
  unchecked: "যাচাই বাকি",
  dispute: "কী মিলিয়ে দেখতে হবে?",
  note: "প্রতিবেশীর নোট",
  clear: "নোট মুছুন",
  discard: "জিনিস সরান",
  save: "সংরক্ষণ",
  confirmed: "নিশ্চিত",
  waiting: "অপেক্ষায়",
  you: "আপনি",
  neighbour: "প্রতিবেশী",
  confirm: "হস্তান্তর নিশ্চিত করুন",
  record: "হস্তান্তর নথিভুক্ত করুন",
  refresh: "তালিকা আবার লোড করুন",
  complete: "হস্তান্তর নথিভুক্ত হয়েছে",
  change: "পরিবর্তন করলে আগের নিশ্চিতকরণ মুছে যাবে।",
  failure: "পরিবর্তন সংরক্ষণ করা যায়নি। আবার লোড করে চেষ্টা করুন।",
  changedPhoto: "ছবি যুক্ত করা যায়নি। সমর্থিত ছবি দিয়ে চেষ্টা করুন।",
  aiFailure:
    "ছবি থেকে পরামর্শ পাওয়া যাচ্ছে না। নিজে থেকে জিনিস যোগ করতে পারেন।",
};

export const livePickupCopy = { en, ja, bn };
