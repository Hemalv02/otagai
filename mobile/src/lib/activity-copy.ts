import type { Language, Notification } from "@/lib/api";

const en = {
  loans: "Loans",
  loan: "Loan details",
  unnamedLoan: "Borrowed item",
  noLoans: "No current loans.",
  due: "Return by",
  noDate: "Not arranged yet",
  pickup: "Pickup",
  place: "Pickup location",
  borrowed: "You’re borrowing",
  lent: "You’re lending",
  overdue: "The return date has passed. You can ask for a little more time.",
  lenderOverdue:
    "The return date has passed. An extension can give your neighbour more time.",
  extend: "Ask for more time",
  newDate: "New return date (YYYY-MM-DD)",
  dateHelp:
    "Choose a later date. The current return time is kept, in your device’s local time.",
  message: "Message (optional)",
  send: "Send extension request",
  history: "Extension history",
  pending: "Waiting for the lender",
  accepted: "Extension accepted",
  declined: "Extension declined",
  accept: "Accept extension",
  decline: "Decline extension",
  noHistory: "No extension requests yet.",
  invalidDate: "Choose a valid future date later than the current return date.",
  conflict:
    "This loan changed. The latest exchange and extension history have been reloaded.",
  unavailable:
    "This loan is unavailable. It may have ended, or you may not have access.",
  draft: (from: string, to: string) =>
    `Could I please keep this until ${to}${from ? ` instead of ${from}` : ""}? Thank you.`,
  notifications: "Notifications",
  preferences: "Notification preferences",
  all: "All",
  unread: "Unread",
  noNotifications:
    "No activity yet. New requests, offers and updates will appear here.",
  noUnread: "You’re all caught up.",
  markRead: "Mark read",
  markAll: "Mark all read",
  read: "Read",
  viewLoan: "View loan",
  quiet: "Quiet hours",
  quietHelp: "Choose when to pause and resume push notifications.",
  start: "Start time",
  end: "End time",
  pause: "Pause push notifications",
  pauseHelp:
    "Your in-app inbox stays available while push notifications are paused.",
  save: "Save preferences",
  saved: "Preferences saved.",
  timeError: "Choose different start and end times.",
  typedTimeError:
    "Enter both times in 24-hour HH:mm format, with different start and end times.",
  loading: "Loading…",
  retry: "Try again",
  refresh: "Refresh",
  loadMore: "Load more",
  loadError: "Could not load this. Check your connection and try again.",
  actionError: "Could not save this change. Please try again.",
  timeZone: "Time zone",
  nextDay: "One more day",
  noLongerActive: "This loan is no longer active.",
};

type ActivityCopy = typeof en;
export const activityCopy: Record<Language, ActivityCopy> = {
  en,
  ja: {
    loans: "貸し借り",
    loan: "貸し借りの詳細",
    unnamedLoan: "借りているもの",
    noLoans: "現在、貸し借り中のものはありません。",
    due: "返却期限",
    noDate: "まだ決まっていません",
    pickup: "受け渡し日時",
    place: "受け渡し場所",
    borrowed: "借りています",
    lent: "貸しています",
    overdue:
      "返却期限を過ぎています。もう少し時間が必要なら、延長をお願いできます。",
    lenderOverdue:
      "返却期限を過ぎています。延長すると、相手にもう少し時間をあげられます。",
    extend: "延長をお願いする",
    newDate: "新しい返却日（YYYY-MM-DD）",
    dateHelp:
      "現在の期限より後の日付を選んでください。返却時刻は端末の現地時間で引き継がれます。",
    message: "メッセージ（任意）",
    send: "延長をお願いする",
    history: "延長の履歴",
    pending: "貸し手の返事を待っています",
    accepted: "延長が承認されました",
    declined: "延長は見送られました",
    accept: "延長を承認",
    decline: "延長を断る",
    noHistory: "延長の依頼はまだありません。",
    invalidDate: "現在の返却期限より後の、有効な未来の日付を選んでください。",
    conflict:
      "貸し借りの情報が更新されました。最新の内容と延長履歴を読み込みました。",
    unavailable:
      "この貸し借りは表示できません。終了したか、アクセス権がない可能性があります。",
    draft: (from, to) =>
      `${from ? `返却予定の${from}から、` : ""}${to}までお借りしてもよろしいでしょうか。ありがとうございます。`,
    notifications: "お知らせ",
    preferences: "通知設定",
    all: "すべて",
    unread: "未読",
    noNotifications:
      "まだお知らせはありません。依頼や申し出などの更新がここに表示されます。",
    noUnread: "未読のお知らせはありません。",
    markRead: "既読にする",
    markAll: "すべて既読にする",
    read: "既読",
    viewLoan: "貸し借りを見る",
    quiet: "通知を休む時間",
    quietHelp: "プッシュ通知を停止する時刻と再開する時刻を選んでください。",
    start: "開始時刻",
    end: "終了時刻",
    pause: "プッシュ通知を一時停止",
    pauseHelp: "プッシュ通知を止めても、アプリ内のお知らせは確認できます。",
    save: "設定を保存",
    saved: "設定を保存しました。",
    timeError: "開始時刻と終了時刻は別の時刻を選んでください。",
    typedTimeError:
      "開始と終了を異なる時刻で、24時間表記のHH:mm形式で入力してください。",
    loading: "読み込み中…",
    retry: "再試行",
    refresh: "更新",
    loadMore: "もっと見る",
    loadError: "読み込めませんでした。接続を確認して、もう一度お試しください。",
    actionError: "変更を保存できませんでした。もう一度お試しください。",
    timeZone: "タイムゾーン",
    nextDay: "もう1日",
    noLongerActive: "この貸し借りは終了しています。",
  },
  bn: {
    loans: "ধার দেওয়া ও নেওয়া",
    loan: "ধারের বিবরণ",
    unnamedLoan: "ধার নেওয়া জিনিস",
    noLoans: "এখন কোনো চলমান ধার নেই।",
    due: "ফেরতের সময়",
    noDate: "এখনো ঠিক হয়নি",
    pickup: "নেওয়ার সময়",
    place: "নেওয়ার স্থান",
    borrowed: "আপনি ধার নিচ্ছেন",
    lent: "আপনি ধার দিচ্ছেন",
    overdue: "ফেরতের সময় পেরিয়ে গেছে। প্রয়োজন হলে আরেকটু সময় চাইতে পারেন।",
    lenderOverdue:
      "ফেরতের সময় পেরিয়ে গেছে। সময় বাড়ালে আপনার প্রতিবেশী আরেকটু সময় পাবেন।",
    extend: "আরও সময় চাইুন",
    newDate: "নতুন ফেরতের তারিখ (YYYY-MM-DD)",
    dateHelp:
      "বর্তমান সময়সীমার পরের তারিখ বেছে নিন। আপনার ডিভাইসের স্থানীয় সময় অনুযায়ী ফেরতের সময় একই থাকবে।",
    message: "বার্তা (ঐচ্ছিক)",
    send: "সময় বাড়ানোর অনুরোধ পাঠান",
    history: "সময় বাড়ানোর ইতিহাস",
    pending: "ধারদাতার উত্তরের অপেক্ষায়",
    accepted: "সময় বাড়ানো হয়েছে",
    declined: "সময় বাড়ানোর অনুরোধ গ্রহণ করা হয়নি",
    accept: "সময় বাড়াতে রাজি",
    decline: "অনুরোধ ফিরিয়ে দিন",
    noHistory: "এখনো সময় বাড়ানোর অনুরোধ নেই।",
    invalidDate: "বর্তমান ফেরতের সময়ের পরের একটি সঠিক ভবিষ্যৎ তারিখ দিন।",
    conflict:
      "ধারের তথ্য বদলেছে। সর্বশেষ তথ্য ও অনুরোধের ইতিহাস আবার আনা হয়েছে।",
    unavailable:
      "এই ধারের তথ্য পাওয়া যাচ্ছে না। এটি শেষ হয়েছে বা আপনার দেখার অনুমতি নেই।",
    draft: (from, to) =>
      `${from ? `${from}-এর বদলে ` : ""}${to} পর্যন্ত জিনিসটি রাখতে পারি কি? ধন্যবাদ।`,
    notifications: "বিজ্ঞপ্তি",
    preferences: "বিজ্ঞপ্তির পছন্দ",
    all: "সব",
    unread: "অপঠিত",
    noNotifications:
      "এখনো কোনো খবর নেই। নতুন অনুরোধ, প্রস্তাব ও খবর এখানে দেখা যাবে।",
    noUnread: "সব বিজ্ঞপ্তি পড়া হয়েছে।",
    markRead: "পড়া হয়েছে",
    markAll: "সব পড়া হয়েছে চিহ্নিত করুন",
    read: "পঠিত",
    viewLoan: "ধারের বিবরণ দেখুন",
    quiet: "নীরব সময়",
    quietHelp: "পুশ বিজ্ঞপ্তি কখন বন্ধ ও আবার চালু হবে তা বেছে নিন।",
    start: "শুরুর সময়",
    end: "শেষের সময়",
    pause: "পুশ বিজ্ঞপ্তি বিরতি দিন",
    pauseHelp:
      "পুশ বিজ্ঞপ্তি বন্ধ থাকলেও অ্যাপের ভেতরে বিজ্ঞপ্তি দেখতে পারবেন।",
    save: "পছন্দ সংরক্ষণ করুন",
    saved: "পছন্দ সংরক্ষণ হয়েছে।",
    timeError: "শুরু ও শেষের জন্য আলাদা সময় বেছে নিন।",
    typedTimeError:
      "২৪ ঘণ্টার HH:mm বিন্যাসে শুরু ও শেষের ভিন্ন দুটি সময় দিন।",
    loading: "লোড হচ্ছে…",
    retry: "আবার চেষ্টা করুন",
    refresh: "আবার আনুন",
    loadMore: "আরও দেখুন",
    loadError: "তথ্য আনা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।",
    actionError: "পরিবর্তন সংরক্ষণ হয়নি। আবার চেষ্টা করুন।",
    timeZone: "সময় অঞ্চল",
    nextDay: "আরও এক দিন",
    noLongerActive: "এই ধার আর চলমান নেই।",
  },
};

const events: Record<Language, Record<string, string>> = {
  en: {
    request_nearby: "A neighbour has asked for help nearby.",
    request_family: "A family member shared a request.",
    request_han: "Your circle received a request.",
    request_association: "Your association received a request.",
    request_direct: "A neighbour sent you a request.",
    response_received: "You received a response to your request.",
    response_accepted: "Your offer was accepted.",
    response_superseded: "Another offer was chosen for this request.",
    message: "You have a new message.",
    reminder: "A reminder about your exchange.",
    extension: "A neighbour requested more time for a loan.",
    accepted: "Your loan extension was accepted.",
    declined: "Your loan extension was declined.",
    thank_you: "A neighbour sent a thank-you.",
    membership_decided: "Your circle membership has been updated.",
    proxy_granted: "Your permission to help another member has been updated.",
    unknown: "There’s an update for you.",
  },
  ja: {
    request_nearby: "近所で助けを求めている人がいます。",
    request_family: "家族から依頼が届きました。",
    request_han: "サークルに依頼が届きました。",
    request_association: "町内会に依頼が届きました。",
    request_direct: "あなたに依頼が届きました。",
    response_received: "依頼に返事が届きました。",
    response_accepted: "あなたの申し出が承認されました。",
    response_superseded: "この依頼では別の申し出が選ばれました。",
    message: "新しいメッセージが届きました。",
    reminder: "貸し借りについてのリマインダーです。",
    extension: "貸し借りの延長依頼が届きました。",
    accepted: "延長が承認されました。",
    declined: "延長の依頼は見送られました。",
    thank_you: "お礼が届きました。",
    membership_decided: "サークルの参加状況が更新されました。",
    proxy_granted: "他のメンバーを支援する権限が更新されました。",
    unknown: "新しいお知らせがあります。",
  },
  bn: {
    request_nearby: "কাছাকাছি একজন প্রতিবেশী সাহায্য চেয়েছেন।",
    request_family: "পরিবারের একজন অনুরোধ পাঠিয়েছেন।",
    request_han: "আপনার সার্কেলে একটি অনুরোধ এসেছে।",
    request_association: "আপনার সমিতিতে একটি অনুরোধ এসেছে।",
    request_direct: "একজন প্রতিবেশী আপনাকে অনুরোধ পাঠিয়েছেন।",
    response_received: "আপনার অনুরোধের উত্তর এসেছে।",
    response_accepted: "আপনার প্রস্তাব গ্রহণ করা হয়েছে।",
    response_superseded: "এই অনুরোধে অন্য একটি প্রস্তাব বেছে নেওয়া হয়েছে।",
    message: "আপনার একটি নতুন বার্তা এসেছে।",
    reminder: "আপনার বিনিময় সম্পর্কে মনে করিয়ে দেওয়া হচ্ছে।",
    extension: "একজন প্রতিবেশী ধারের সময় বাড়াতে চেয়েছেন।",
    accepted: "আপনার ধারের সময় বাড়ানো হয়েছে।",
    declined: "আপনার সময় বাড়ানোর অনুরোধ গ্রহণ করা হয়নি।",
    thank_you: "একজন প্রতিবেশী ধন্যবাদ পাঠিয়েছেন।",
    membership_decided: "আপনার দলের সদস্যতার অবস্থা বদলেছে।",
    proxy_granted: "অন্য সদস্যকে সাহায্য করার অনুমতি বদলেছে।",
    unknown: "আপনার জন্য নতুন খবর আছে।",
  },
};

export function notificationDescription(item: Notification, locale: Language) {
  const stage = item.payload.ripple_stage;
  const key =
    item.type === "request_nearby" &&
    (stage === "family" || stage === "han" || stage === "association")
      ? `request_${stage}`
      : item.type === "extension" && typeof item.payload.accepted === "boolean"
        ? item.payload.accepted
          ? "accepted"
          : "declined"
        : item.type;
  const description = events[locale][key] ?? events[locale].unknown;
  const title = item.payload.listing_title ?? item.payload.request_title;
  return typeof title === "string" && title.trim()
    ? `${description} ${title}`
    : description;
}

export function formatActivityDate(value: string | null, locale: Language) {
  if (!value || !Number.isFinite(new Date(value).getTime()))
    return activityCopy[locale].noDate;
  return new Date(value).toLocaleString(
    locale === "bn" ? "bn-BD" : locale === "ja" ? "ja-JP" : "en-GB",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

export function localDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function extensionDate(value: string, reference: Date): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const result = new Date(reference);
  result.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return localDateInput(result) === value ? result : null;
}

export function extensionDraftDays(
  selected: Date | null,
  currentDue: Date,
  now: number,
): number | undefined {
  if (!selected) return undefined;
  const reference = new Date(Math.max(currentDue.getTime(), now));
  const days =
    (Date.parse(localDateInput(selected)) - Date.parse(localDateInput(reference))) /
    86_400_000;
  return days >= 1 && days <= 60 ? days : undefined;
}
