import type { Language } from "@/lib/api";

const en = {
  suggestDetails: "Suggest details",
  suggestAgain: "Suggest again",
  suggesting: "Looking at your photo…",
  suggestHint: "Suggestions fill empty fields. Your edits stay.",
  unclear:
    "We couldn’t tell what this is. Fill in the details yourself or try another photo.",
  failed:
    "Suggestions aren’t available right now. You can fill in the form yourself.",
  rateLimited: "You’ve asked for a lot of suggestions. Try again later.",
  photoNotReady: "The photo is still processing. Try again in a moment.",
  includedParts: "Included parts (one per line)",
  riskyTitle: "Offered as help, not a loan",
  riskyDetail:
    "Items in this category are risky to lend. You’ll offer your help with it instead.",
  categoryUnmatched: "Choose a category: we couldn’t match the suggestion.",
  suggestedDetails: "Details from your photo",
  brand: "Brand",
  model: "Model",
  condition: "Condition",
  moreDetails: "Other details",
  dismiss: "Remove",
  unsure: "Not sure. Please check.",
};

const copy: Record<Language, typeof en> = {
  en,
  ja: {
    suggestDetails: "写真から候補を出す",
    suggestAgain: "もう一度候補を出す",
    suggesting: "写真を確認しています…",
    suggestHint: "候補は空の項目に入ります。編集した内容はそのままです。",
    unclear:
      "何の写真か分かりませんでした。ご自身で入力するか、別の写真をお試しください。",
    failed: "いま候補を出せません。フォームにご自身で入力できます。",
    rateLimited: "候補の依頼が多すぎます。しばらくしてからお試しください。",
    photoNotReady: "写真を処理中です。少し待ってからもう一度お試しください。",
    includedParts: "付属品（1行に1つ）",
    riskyTitle: "貸し出しではなく手助けとして提供",
    riskyDetail:
      "このカテゴリは貸し出しに危険があります。代わりに手助けを申し出ることになります。",
    categoryUnmatched:
      "カテゴリを選んでください。候補に合うものがありませんでした。",
    suggestedDetails: "写真から分かった内容",
    brand: "ブランド",
    model: "型番",
    condition: "状態",
    moreDetails: "その他の情報",
    dismiss: "削除",
    unsure: "自信がありません。確認してください。",
  },
  bn: {
    suggestDetails: "ছবি থেকে তথ্য প্রস্তাব করুন",
    suggestAgain: "আবার প্রস্তাব করুন",
    suggesting: "আপনার ছবি দেখা হচ্ছে…",
    suggestHint: "প্রস্তাব ফাঁকা ঘরে বসে। আপনার সম্পাদনা থাকবে।",
    unclear: "এটি কী বোঝা গেল না। নিজে তথ্য লিখুন বা অন্য ছবি চেষ্টা করুন।",
    failed: "এখন প্রস্তাব পাওয়া যাচ্ছে না। আপনি নিজে ফর্ম পূরণ করতে পারেন।",
    rateLimited: "আপনি অনেক প্রস্তাব চেয়েছেন। পরে আবার চেষ্টা করুন।",
    photoNotReady: "ছবিটি এখনও প্রক্রিয়া হচ্ছে। একটু পরে আবার চেষ্টা করুন।",
    includedParts: "সঙ্গে থাকা অংশ (প্রতি লাইনে একটি)",
    riskyTitle: "ধার নয়, সাহায্য হিসেবে দেওয়া হবে",
    riskyDetail:
      "এই বিভাগের জিনিস ধার দেওয়া ঝুঁকিপূর্ণ। এর বদলে আপনি সাহায্যের প্রস্তাব দেবেন।",
    categoryUnmatched: "একটি বিভাগ বেছে নিন: প্রস্তাবের সঙ্গে মেলানো যায়নি।",
    suggestedDetails: "ছবি থেকে পাওয়া তথ্য",
    brand: "ব্র্যান্ড",
    model: "মডেল",
    condition: "অবস্থা",
    moreDetails: "অন্যান্য তথ্য",
    dismiss: "সরান",
    unsure: "নিশ্চিত নই। দয়া করে দেখে নিন।",
  },
};

export const draftCopy = copy;
