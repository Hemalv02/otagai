import type { Language } from "./api";
import type { DraftRelationship } from "./request-wording";

type WordingCopy = {
  rewrite: string;
  relationship: string;
  relationships: Record<DraftRelationship, string>;
  language: string;
  memberLanguage: string;
  generate: string;
  use: string;
  restore: string;
  failed: string;
  edited: string;
};

export const wordingCopy: Record<Language | "vi", WordingCopy> = {
  en: {
    rewrite: "Rewrite with AI",
    relationship: "Relationship and tone",
    relationships: {
      neighbor: "Neighbours · polite",
      elder: "Elders · respectful",
      family: "Close family · casual",
    },
    language: "Request language",
    memberLanguage: "Family member’s language",
    generate: "Preview wording",
    use: "Use this wording",
    restore: "Restore original wording",
    failed: "Could not rewrite the request. You can keep editing your wording.",
    edited: "Request wording",
  },
  ja: {
    rewrite: "AIで文章を整える",
    relationship: "どなたへの依頼ですか？",
    relationships: {
      neighbor: "ご近所の方・丁寧語",
      elder: "年上の方・敬語",
      family: "親しい家族・普段の言葉",
    },
    language: "依頼の言語",
    memberLanguage: "ご本人の言語",
    generate: "文章案を見る",
    use: "この文章を使う",
    restore: "元の文章に戻す",
    failed:
      "文章案を作成できませんでした。入力した文章はそのまま編集できます。",
    edited: "依頼の文章",
  },
  bn: {
    rewrite: "AI দিয়ে ভাষা সাজান",
    relationship: "কাদের কাছে অনুরোধ করছেন?",
    relationships: {
      neighbor: "প্রতিবেশী · ভদ্র ভাষা",
      elder: "বয়োজ্যেষ্ঠ · সম্মানসূচক ভাষা",
      family: "ঘনিষ্ঠ পরিবার · ঘরোয়া ভাষা",
    },
    language: "অনুরোধের ভাষা",
    memberLanguage: "পরিবারের সদস্যের ভাষা",
    generate: "প্রস্তাবিত লেখা দেখুন",
    use: "এই লেখা ব্যবহার করুন",
    restore: "আগের লেখায় ফিরুন",
    failed: "অনুরোধের ভাষা সাজানো যায়নি। আপনার লেখা সম্পাদনা করতে পারেন।",
    edited: "অনুরোধের লেখা",
  },
  vi: {
    rewrite: "Viết lại bằng AI",
    relationship: "Bạn muốn nhờ ai?",
    relationships: {
      neighbor: "Hàng xóm · lịch sự",
      elder: "Người lớn tuổi · kính trọng",
      family: "Người thân · thân mật",
    },
    language: "Ngôn ngữ của lời nhờ",
    memberLanguage: "Ngôn ngữ của người thân",
    generate: "Xem trước lời nhờ",
    use: "Dùng lời nhờ này",
    restore: "Khôi phục lời nhờ ban đầu",
    failed: "Không thể viết lại lời nhờ. Bạn vẫn có thể sửa lời nhờ của mình.",
    edited: "Nội dung lời nhờ",
  },
};

export const draftLanguages: readonly Language[] = ["ja", "en", "bn"];

export const draftLanguageNames: Record<Language | "vi", string> = {
  ja: "日本語",
  en: "English",
  bn: "বাংলা",
  vi: "Tiếng Việt",
};
