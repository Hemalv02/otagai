import type { Language } from "@/lib/api";

const en = {
  returnTitle: (item: string, day: string) => `Return the ${item} by ${day}`,
  lenderTitle: (day: string) => `Return planned for ${day}`,
  borrowedFrom: (name: string) => `Borrowed from ${name}`,
  lentTo: (name: string) => `Lent to ${name}`,
  returnBy: (time: string) => `Return by ${time}`,
  pickedUp: "Picked up",
  pickupPlanned: "Pickup planned",
  returnPlanned: "Return planned",
  due: "Due",
  overdue: "Overdue",
  returned: "Returned",
  needTime: "Need a little more time?",
  suggested: "Suggested message you can edit",
  askOneDay: "Ask for one more day",
  closeDate: "Cancel extension request",
  recordReturn: "Record return",
  draft: (
    name: string | null,
    item: string,
    proposed: string,
    current: string | null,
  ) =>
    `Hello${name ? `, ${name}` : ""}. Would it be all right if I returned the ${item} on ${proposed}?${current ? ` I can keep ${current} if that’s easier.` : ""}`,
  preferencesBody: "Choose when to receive push notifications.",
  nearby: "Nearby requests",
  nearbyDetail: "Relevant requests in your circle.",
  matches: "Matches",
  matchesDetail: "When a neighbour accepts or offers to help.",
  messages: "Messages",
  messagesDetail: "New messages from neighbours.",
  reminders: "Reminders",
  remindersDetail: "Arranged handovers, returns and visits.",
  thanks: "Thank-yous",
  thanksDetail: "Notes and thank-yous you receive.",
  inboxActivity: "These updates stay in your inbox when push is paused.",
  quietDetail: "Pause notifications overnight.",
  off: "Off",
  done: "Done",
  resume: "Resume push notifications",
  saveNotifications: "Save notifications",
};

export const activityScreenCopy: Record<Language, typeof en> = {
  en,
  ja: {
    returnTitle: (item, day) => `${day}までに${item}を返却`,
    lenderTitle: (day) => `${day}に返却予定`,
    borrowedFrom: (name) => `${name}から借りています`,
    lentTo: (name) => `${name}に貸しています`,
    returnBy: (time) => `${time}までに返却`,
    pickedUp: "受け取り済み",
    pickupPlanned: "受け取り予定",
    returnPlanned: "返却予定",
    due: "返却予定",
    overdue: "期限経過",
    returned: "返却済み",
    needTime: "もう少し時間が必要ですか？",
    suggested: "編集できるメッセージ案",
    askOneDay: "もう1日借りたいとお願いする",
    closeDate: "延長依頼を閉じる",
    recordReturn: "返却を記録",
    draft: (name, item, proposed, current) =>
      `${name ? `${name}、` : ""}こんにちは。${item}の返却を${proposed}に延ばしてもよろしいでしょうか。${current ? `難しい場合は予定どおり${current}に返却します。` : ""}`,
    preferencesBody: "プッシュ通知を受け取る時間を選びましょう。",
    nearby: "近所の依頼",
    nearbyDetail: "サークル内の関連する依頼。",
    matches: "マッチング",
    matchesDetail: "ご近所の人が申し出や依頼を受けたとき。",
    messages: "メッセージ",
    messagesDetail: "ご近所の人から届く新しいメッセージ。",
    reminders: "リマインダー",
    remindersDetail: "受け渡し、返却、訪問の予定。",
    thanks: "お礼",
    thanksDetail: "届いたお礼やメッセージ。",
    inboxActivity:
      "プッシュ通知を止めても、これらのお知らせはアプリで確認できます。",
    quietDetail: "夜間の通知を休みます。",
    off: "オフ",
    done: "完了",
    resume: "プッシュ通知を再開",
    saveNotifications: "通知設定を保存",
  },
  bn: {
    returnTitle: (item, day) => `${day}-এর মধ্যে ${item} ফেরত দিন`,
    lenderTitle: (day) => `${day} ফেরত দেওয়ার কথা`,
    borrowedFrom: (name) => `${name}-এর কাছ থেকে ধার নেওয়া`,
    lentTo: (name) => `${name}-কে ধার দেওয়া`,
    returnBy: (time) => `${time}-এর মধ্যে ফেরত দিন`,
    pickedUp: "নেওয়া হয়েছে",
    pickupPlanned: "নেওয়ার কথা",
    returnPlanned: "ফেরত দেওয়ার কথা",
    due: "ফেরতের সময়",
    overdue: "সময় পেরিয়েছে",
    returned: "ফেরত দেওয়া হয়েছে",
    needTime: "আরেকটু সময় দরকার?",
    suggested: "এই খসড়া বার্তা বদলাতে পারেন",
    askOneDay: "আরও এক দিন রাখার অনুরোধ করুন",
    closeDate: "সময় বাড়ানোর অনুরোধ বন্ধ করুন",
    recordReturn: "ফেরত দেওয়া নথিভুক্ত করুন",
    draft: (name, item, proposed, current) =>
      `হ্যালো${name ? `, ${name}` : ""}। ${proposed} তারিখে ${item} ফেরত দিলে কি ঠিক হবে?${current ? ` অসুবিধা হলে আগের মতো ${current} তারিখেই ফেরত দেব।` : ""}`,
    preferencesBody: "কখন পুশ বিজ্ঞপ্তি পাবেন তা বেছে নিন।",
    nearby: "কাছাকাছি অনুরোধ",
    nearbyDetail: "আপনার দলের প্রাসঙ্গিক অনুরোধ।",
    matches: "মিল পাওয়া",
    matchesDetail: "কেউ সাহায্যের প্রস্তাব দিলে বা গ্রহণ করলে।",
    messages: "বার্তা",
    messagesDetail: "প্রতিবেশীদের নতুন বার্তা।",
    reminders: "মনে করিয়ে দেওয়া",
    remindersDetail: "নির্ধারিত হস্তান্তর, ফেরত ও দেখা করার সময়।",
    thanks: "ধন্যবাদ",
    thanksDetail: "আপনার জন্য পাঠানো ধন্যবাদ ও বার্তা।",
    inboxActivity: "পুশ বন্ধ থাকলেও এই খবরগুলো অ্যাপের বিজ্ঞপ্তিতে থাকবে।",
    quietDetail: "রাতে বিজ্ঞপ্তি বিরতি দিন।",
    off: "বন্ধ",
    done: "ঠিক আছে",
    resume: "পুশ বিজ্ঞপ্তি চালু করুন",
    saveNotifications: "বিজ্ঞপ্তি সংরক্ষণ করুন",
  },
};

export const activityLocale = (locale: Language) =>
  locale === "bn" ? "bn-BD" : locale === "ja" ? "ja-JP" : "en-GB";

export function activityTime(date: Date, locale: Language) {
  return date.toLocaleTimeString(activityLocale(locale), {
    hour: "numeric",
    ...(date.getMinutes() || locale !== "en"
      ? { minute: "2-digit" as const }
      : {}),
    hour12: locale === "en",
  });
}

export function activityDay(
  value: string,
  locale: Language,
  weekdayOnly = false,
) {
  return new Date(value)
    .toLocaleDateString(
      activityLocale(locale),
      weekdayOnly
        ? { weekday: "long" }
        : { weekday: "short", day: "numeric", month: "short" },
    )
    .replaceAll(",", "");
}

export function activityAppointment(value: string, locale: Language) {
  const day = activityDay(value, locale, true);
  const time = activityTime(new Date(value), locale);
  return locale === "en" ? `${day} at ${time}` : `${day} ${time}`;
}

export function quietHoursSummary(
  start: string | null,
  end: string | null,
  locale: Language,
) {
  if (!start || !end) return activityScreenCopy[locale].off;
  const time = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return activityTime(new Date(2000, 0, 1, hour, minute), locale);
  };
  return `${time(start)}–${time(end)}`;
}
