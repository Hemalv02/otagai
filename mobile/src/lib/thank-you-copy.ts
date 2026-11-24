import type { Language } from "@/lib/api";

const en = {
  incomplete:
    "You can send a thank-you after both neighbours confirm the help is complete.",
  returnFavour: "Return the favour",
  favourFor: (name: string) =>
    `If you have time, here’s what ${name} could use help with.`,
  favourDetail:
    "If you have time, here’s what your neighbour could use help with.",
  points: (amount: number) => `Send ${amount} thank-you points`,
  pointsDetail: "Add points to your private thank-you.",
  demo: "Try a demo payment",
  demoDetail: "A payment simulation. No money moves.",
  demoMethod: (amount: string, provider: string) =>
    `${amount} · ${provider} demo`,
  demoDone: "Demo payment simulated. Your note was sent privately.",
  demoSubmit: "Simulate payment and send note",
  draftHelpReceived: (task: string) =>
    `They helped me with this request: ${task}`,
  draftHelpGiven: (task: string) => `I helped with their request: ${task}`,
  draftLoanReceived: (task: string) => `They lent me: ${task}`,
  draftLoanGiven: (task: string) => `I lent them: ${task}`,
};

export const thankYouCopy: Record<Language, typeof en> = {
  en,
  ja: {
    incomplete: "お二人が助け合いの完了を確認した後にお礼を送れます。",
    returnFavour: "お返しにお手伝い",
    favourFor: (name) => `時間があれば、${name}のお願いをのぞいてみませんか。`,
    favourDetail: "時間があれば、ご近所の方のお願いをのぞいてみませんか。",
    points: (n) => `お礼ポイントを${n}ポイント送る`,
    pointsDetail: "相手だけに届くメッセージにポイントを添えます。",
    demo: "支払いのデモを試す",
    demoDetail: "支払いのシミュレーションです。実際のお金は動きません。",
    demoMethod: (amount, provider) => `${amount} · ${provider}のデモ`,
    demoDone:
      "支払いをシミュレーションしました。メッセージは相手にだけ届きます。",
    demoSubmit: "支払いをシミュレーションしてメッセージを送る",
    draftHelpReceived: (t) => `次のお願いを手伝ってくれました：${t}`,
    draftHelpGiven: (t) => `相手の次のお願いを手伝いました：${t}`,
    draftLoanReceived: (t) => `相手が貸してくれたもの：${t}`,
    draftLoanGiven: (t) => `相手に貸したもの：${t}`,
  },
  bn: {
    incomplete: "দুজনেই সাহায্য শেষ হয়েছে বলে নিশ্চিত করলে ধন্যবাদ পাঠাতে পারবেন।",
    returnFavour: "পাল্টা সাহায্য করুন",
    favourFor: (name) => `সময় থাকলে দেখুন, ${name} কোন কাজে সাহায্য চাইছেন।`,
    favourDetail: "সময় থাকলে দেখুন, আপনার প্রতিবেশী কোন কাজে সাহায্য চাইছেন।",
    points: (n) => `${n.toLocaleString("bn")} ধন্যবাদ পয়েন্ট পাঠান`,
    pointsDetail: "ব্যক্তিগত ধন্যবাদ বার্তার সঙ্গে পয়েন্ট যোগ করুন।",
    demo: "ডেমো পেমেন্ট চেষ্টা করুন",
    demoDetail: "এটি শুধু পেমেন্টের অনুকরণ। কোনো টাকা লেনদেন হবে না।",
    demoMethod: (amount, provider) => `${amount} · ${provider} ডেমো`,
    demoDone:
      "ডেমো পেমেন্ট অনুকরণ করা হয়েছে। আপনার বার্তা ব্যক্তিগতভাবে পাঠানো হয়েছে।",
    demoSubmit: "ডেমো পেমেন্ট করে বার্তা পাঠান",
    draftHelpReceived: (t) => `এই অনুরোধে তাঁরা আমাকে সাহায্য করেছেন: ${t}`,
    draftHelpGiven: (t) => `আমি তাঁদের এই অনুরোধে সাহায্য করেছি: ${t}`,
    draftLoanReceived: (t) => `তাঁরা আমাকে যা ধার দিয়েছেন: ${t}`,
    draftLoanGiven: (t) => `আমি তাঁদের যা ধার দিয়েছি: ${t}`,
  },
};
