import type { Language, Region } from "./api";
import type {
  ConsentMethod,
  FamilyRelation,
  GrantScope,
} from "./family-consent";

type Effect = (caretaker: string, member: string, enabled: boolean) => string;

type ConsentCopy = {
  scopes: Record<
    GrantScope,
    { title: string; detail: (member: string) => string }
  >;
  scopeShort: Record<GrantScope, string>;
  effects: Record<GrantScope, Effect>;
  consent: Record<ConsentMethod, { title: string; detail: string }>;
  relations: Record<FamilyRelation, string>;
  regions: Record<Region, string>;
  you: string;
  cancel: string;
  backToFamily: string;
  actionFailed: string;
  home: {
    addMember: string;
    permissions: string;
    askFor: (name: string) => string;
    review: string;
    acceptTitle: (name: string) => string;
    acceptBody: (name: string) => string;
    accept: string;
    decline: string;
    notNow: string;
  };
  add: {
    title: string;
    subtitle: string;
    fullName: string;
    language: string;
    region: string;
    consentHeading: string;
    linkExisting: string;
    reviewPermissions: string;
    nameRequired: string;
    reviewTitle: (name: string) => string;
    reviewSubtitle: (name: string) => string;
    consentGiven: string;
    create: string;
    editDetails: string;
    doneTitle: (name: string) => string;
    doneBody: (name: string) => string;
    failed: string;
    unsure: string;
  };
  link: {
    title: string;
    subtitle: string;
    yourId: string;
    yourIdHint: string;
    share: string;
    shareMessage: (id: string) => string;
    shareFailed: string;
    theirId: string;
    theirIdHint: string;
    invalidId: string;
    relation: string;
    send: string;
    sentTitle: string;
    sentBody: string;
    notFound: string;
    exists: string;
    self: string;
  };
  permissions: {
    title: string;
    subtitle: string;
    actsForMe: string;
    actsForMeEmpty: string;
    iHelp: string;
    iHelpEmpty: string;
    links: string;
    linksEmpty: string;
    edit: string;
    view: string;
    endLink: string;
    noScopes: string;
    giveAccess: string;
    linkState: { pendingOut: string; pendingIn: string; accepted: string };
    endLinkTitle: (name: string) => string;
    endLinkBody: string;
  };
  grant: {
    memberTitle: (caretaker: string) => string;
    memberSubtitle: (caretaker: string) => string;
    caretakerTitle: (member: string) => string;
    caretakerSubtitle: (member: string) => string;
    managedSubtitle: (member: string) => string;
    yourAccount: string;
    managedAccount: string;
    ownAccount: string;
    readOnly: (member: string) => string;
    readOnlyManaged: (member: string) => string;
    delegatedSubtitle: (member: string) => string;
    endAccess: string;
    confirm: string;
    noChanges: string;
    confirmTitle: string;
    save: string;
    endMemberTitle: (caretaker: string) => string;
    endMemberBody: (caretaker: string) => string;
    endCaretakerTitle: (member: string) => string;
    endCaretakerBody: (member: string) => string;
    gone: string;
    notAllowed: (member: string) => string;
    saveFailed: string;
  };
  give: {
    title: string;
    subtitle: string;
    chooseWho: string;
    noCandidates: string;
    consentHeading: string;
    reviewTitle: (name: string) => string;
    reviewSubtitle: (name: string) => string;
    give: string;
    confirmTitle: (name: string) => string;
    noneSelected: string;
    exists: string;
  };
};

const en: ConsentCopy = {
  scopes: {
    can_post_requests: {
      title: "Post requests",
      detail: (member) => `Create and manage requests for ${member}.`,
    },
    can_chat: {
      title: "Send messages",
      detail: (member) => `Arrange help in ${member}’s name.`,
    },
    can_thank_and_pay: {
      title: "Send thank-you payments",
      detail: () => "Send an optional thank-you after help.",
    },
    can_view_activity: {
      title: "View activity",
      detail: () => "See requests, past help and thank-yous.",
    },
  },
  scopeShort: {
    can_post_requests: "Post requests",
    can_chat: "Messages",
    can_thank_and_pay: "Thank-you payments",
    can_view_activity: "View activity",
  },
  effects: {
    can_post_requests: (c, m, on) =>
      on
        ? `${c} will be able to post requests for ${m}.`
        : `${c} will no longer be able to post requests for ${m}.`,
    can_chat: (c, m, on) =>
      on
        ? `${c} will be able to send messages in ${m}’s name.`
        : `${c} will no longer be able to send messages in ${m}’s name.`,
    can_thank_and_pay: (c, m, on) =>
      on
        ? `${c} will be able to send thank-you payments for ${m}.`
        : `${c} will no longer be able to send thank-you payments for ${m}.`,
    can_view_activity: (c, m, on) =>
      on
        ? `${c} will be able to see ${m}’s requests and past help.`
        : `${c} will no longer be able to see ${m}’s requests and past help.`,
  },
  consent: {
    in_person: {
      title: "In person",
      detail: "Review permissions together.",
    },
    via_coordinator: {
      title: "With a coordinator",
      detail: "Ask the building secretary to help.",
    },
    phone_call: {
      title: "On a call",
      detail: "Talk through permissions on a shared phone.",
    },
  },
  relations: {
    parent: "Parent",
    child: "Child",
    sibling: "Brother or sister",
    spouse: "Partner",
    grandparent: "Grandparent",
    grandchild: "Grandchild",
    other: "Other family",
  },
  regions: { jp: "Japan", bd: "Bangladesh" },
  you: "you",
  cancel: "Cancel",
  backToFamily: "Back to Family",
  actionFailed: "That didn’t work. Nothing was changed. Try again.",
  home: {
    addMember: "Add a family member",
    permissions: "Review permissions",
    askFor: (name) => `Ask for help for ${name}`,
    review: "Review",
    acceptTitle: (name) => `Link with ${name}?`,
    acceptBody: (name) =>
      `Accepting only connects your accounts. ${name} can’t see your requests or act for you unless you give access in Permissions.`,
    accept: "Accept link",
    decline: "Decline",
    notNow: "Not now",
  },
  add: {
    title: "Add a family member",
    subtitle:
      "Ask their permission first. They can use Otagai through you even if they don’t have a phone.",
    fullName: "Full name",
    language: "Their language",
    region: "Where they live",
    consentHeading: "How will they give permission?",
    linkExisting: "Link an existing account",
    reviewPermissions: "Review permissions",
    nameRequired: "Enter their full name.",
    reviewTitle: (name) => `What can you do for ${name}?`,
    reviewSubtitle: (name) =>
      `Go through these with ${name}. Only the permissions switched on are saved.`,
    consentGiven: "Permission given",
    create: "Create account",
    editDetails: "Edit details",
    doneTitle: (name) => `${name} is set up`,
    doneBody: (name) =>
      `You can help ${name} with the permissions you chose. Before you can post requests for them, a circle leader needs to approve ${name} in a neighbourhood circle. That is a separate step.`,
    failed: "Could not create the account. Your details are still here.",
    unsure:
      "We couldn’t confirm whether the account was created. Check Family before trying again.",
  },
  link: {
    title: "Link an existing account",
    subtitle: "Both of you need Otagai. Share your member ID, or enter theirs.",
    yourId: "Your member ID",
    yourIdHint: "Share it with a family member so they can link with you.",
    share: "Share my ID",
    shareMessage: (id) => `My Otagai member ID: ${id}`,
    shareFailed:
      "Sharing isn’t available here. Press and hold the ID to copy it.",
    theirId: "Their member ID",
    theirIdHint:
      "Ask them to open Family › Add a family member › Link an existing account.",
    invalidId: "Enter the full member ID they shared.",
    relation: "They are your…",
    send: "Send link request",
    sentTitle: "Link request sent",
    sentBody:
      "It stays pending until they accept it in Family. Accepting only connects your accounts. It doesn’t give anyone access.",
    notFound: "No account matches that ID.",
    exists: "You already have a link with this person.",
    self: "That’s your own member ID.",
  },
  permissions: {
    title: "Permissions",
    subtitle:
      "See who can act for you and who you help. Either person can end access at any time.",
    actsForMe: "Who can act for you",
    actsForMeEmpty: "No one can act for you.",
    iHelp: "People you help",
    iHelpEmpty: "You aren’t helping anyone yet.",
    links: "Family links",
    linksEmpty: "No family links yet.",
    edit: "Edit",
    view: "View",
    endLink: "End link",
    noScopes: "No permissions",
    giveAccess: "Give someone access",
    linkState: {
      pendingOut: "Waiting for them to accept",
      pendingIn: "Asked to link with you",
      accepted: "Linked",
    },
    endLinkTitle: (name) => `End your link with ${name}?`,
    endLinkBody:
      "You’ll stop appearing in each other’s Family. Access either of you gave stays until it is ended in Permissions.",
  },
  grant: {
    memberTitle: (caretaker) => `What can ${caretaker} do?`,
    memberSubtitle: (caretaker) =>
      `You choose which permissions to give ${caretaker}. Either of you can end access at any time.`,
    caretakerTitle: (member) => `What you can do for ${member}`,
    caretakerSubtitle: (member) =>
      `${member} chooses which permissions to give you. Either of you can end access at any time.`,
    managedSubtitle: (member) =>
      `You manage ${member}’s account, so you choose these permissions.`,
    yourAccount: "Your account",
    managedAccount: "Managed account",
    ownAccount: "Has their own account",
    readOnly: (member) => `Only ${member} can change these.`,
    readOnlyManaged: (member) =>
      `Only the person who manages ${member}’s account can change these.`,
    delegatedSubtitle: (member) =>
      `The person who manages ${member}’s account chooses these permissions. You can end your access at any time.`,
    endAccess: "End access",
    confirm: "Confirm permissions",
    noChanges: "Nothing has changed yet.",
    confirmTitle: "Confirm these changes",
    save: "Save changes",
    endMemberTitle: (caretaker) => `End ${caretaker}’s access?`,
    endMemberBody: (caretaker) =>
      `${caretaker} will no longer be able to act for you or see your requests. To give access again, you’ll set it up from the start.`,
    endCaretakerTitle: (member) => `Stop helping ${member}?`,
    endCaretakerBody: (member) =>
      `You’ll no longer be able to act for ${member} or see their requests.`,
    gone: "This access has already ended.",
    notAllowed: (member) => `Only ${member} can change these permissions.`,
    saveFailed: "Could not save. Nothing was changed. Try again.",
  },
  give: {
    title: "Give someone access",
    subtitle: "Choose a linked family member and what they can do for you.",
    chooseWho: "Who can act for you?",
    noCandidates:
      "Link with a family member first. Only linked family can be given access.",
    consentHeading: "How did you agree?",
    reviewTitle: (name) => `What can ${name} do?`,
    reviewSubtitle: (name) =>
      `You choose which permissions to give ${name}. You can end access at any time.`,
    give: "Give access",
    confirmTitle: (name) => `${name} will be able to:`,
    noneSelected: "Switch on at least one permission.",
    exists: "This person can already act for you.",
  },
};

const ja: ConsentCopy = {
  scopes: {
    can_post_requests: {
      title: "依頼を出す",
      detail: (member) => `${member}の依頼を作成・管理します。`,
    },
    can_chat: {
      title: "メッセージを送る",
      detail: (member) => `${member}の名前で手助けの調整をします。`,
    },
    can_thank_and_pay: {
      title: "お礼の支払い",
      detail: () => "手助けのあと、任意のお礼を送ります。",
    },
    can_view_activity: {
      title: "活動を見る",
      detail: () => "依頼、これまでの手助け、お礼を見られます。",
    },
  },
  scopeShort: {
    can_post_requests: "依頼",
    can_chat: "メッセージ",
    can_thank_and_pay: "お礼の支払い",
    can_view_activity: "活動を見る",
  },
  effects: {
    can_post_requests: (c, m, on) =>
      on
        ? `${c}は${m}の依頼を出せるようになります。`
        : `${c}は${m}の依頼を出せなくなります。`,
    can_chat: (c, m, on) =>
      on
        ? `${c}は${m}の名前でメッセージを送れるようになります。`
        : `${c}は${m}の名前でメッセージを送れなくなります。`,
    can_thank_and_pay: (c, m, on) =>
      on
        ? `${c}は${m}のお礼の支払いができるようになります。`
        : `${c}は${m}のお礼の支払いができなくなります。`,
    can_view_activity: (c, m, on) =>
      on
        ? `${c}は${m}の依頼とこれまでの手助けを見られるようになります。`
        : `${c}は${m}の依頼とこれまでの手助けを見られなくなります。`,
  },
  consent: {
    in_person: { title: "対面で", detail: "一緒に許可の内容を確認します。" },
    via_coordinator: {
      title: "コーディネーターと",
      detail: "建物の世話役に手伝ってもらいます。",
    },
    phone_call: {
      title: "電話で",
      detail: "共有の電話で許可の内容を話し合います。",
    },
  },
  relations: {
    parent: "親",
    child: "子",
    sibling: "きょうだい",
    spouse: "配偶者・パートナー",
    grandparent: "祖父母",
    grandchild: "孫",
    other: "その他の家族",
  },
  regions: { jp: "日本", bd: "バングラデシュ" },
  you: "あなた",
  cancel: "キャンセル",
  backToFamily: "家族の画面に戻る",
  actionFailed:
    "うまくいきませんでした。何も変更されていません。もう一度お試しください。",
  home: {
    addMember: "家族を追加する",
    permissions: "許可を確認する",
    askFor: (name) => `${name}の代わりに手助けを頼む`,
    review: "確認",
    acceptTitle: (name) => `${name}とつながりますか？`,
    acceptBody: (name) =>
      `承認してもアカウントがつながるだけです。「許可」で設定しない限り、${name}はあなたの依頼を見たり、あなたの代わりに操作したりできません。`,
    accept: "承認する",
    decline: "断る",
    notNow: "あとで",
  },
  add: {
    title: "家族を追加する",
    subtitle:
      "まず本人の許可をもらってください。携帯電話を持っていなくても、あなたを通してOtagaiを使えます。",
    fullName: "氏名",
    language: "本人の言語",
    region: "住んでいる地域",
    consentHeading: "どのように許可をもらいますか？",
    linkExisting: "既存のアカウントとつながる",
    reviewPermissions: "許可を確認する",
    nameRequired: "氏名を入力してください。",
    reviewTitle: (name) => `${name}のために何ができますか？`,
    reviewSubtitle: (name) =>
      `${name}と一緒に確認してください。オンにした許可だけが保存されます。`,
    consentGiven: "許可の方法",
    create: "アカウントを作成",
    editDetails: "内容を修正する",
    doneTitle: (name) => `${name}のアカウントを作成しました`,
    doneBody: (name) =>
      `選んだ許可の範囲で${name}を手伝えます。${name}の依頼を出すには、別の手続きとして、サークルのリーダーに地域のサークルで承認してもらう必要があります。`,
    failed: "アカウントを作成できませんでした。入力内容は残っています。",
    unsure:
      "アカウントが作成されたか確認できませんでした。もう一度試す前に「家族」を確認してください。",
  },
  link: {
    title: "既存のアカウントとつながる",
    subtitle:
      "二人ともOtagaiが必要です。あなたの会員IDを共有するか、相手のIDを入力してください。",
    yourId: "あなたの会員ID",
    yourIdHint: "家族に共有すると、あなたとつながることができます。",
    share: "IDを共有",
    shareMessage: (id) => `私のOtagai会員ID：${id}`,
    shareFailed: "ここでは共有できません。IDを長押ししてコピーしてください。",
    theirId: "相手の会員ID",
    theirIdHint:
      "相手に「家族」›「家族を追加する」›「既存のアカウントとつながる」を開いてもらってください。",
    invalidId: "共有された会員IDをすべて入力してください。",
    relation: "相手はあなたの…",
    send: "つながりを申請する",
    sentTitle: "つながりを申請しました",
    sentBody:
      "相手が「家族」で承認するまで承認待ちのままです。承認してもアカウントがつながるだけで、誰にも許可は与えられません。",
    notFound: "そのIDのアカウントは見つかりません。",
    exists: "この方とはすでにつながりがあります。",
    self: "それはあなた自身の会員IDです。",
  },
  permissions: {
    title: "許可",
    subtitle:
      "あなたの代わりに操作できる人と、あなたが手伝っている人を確認できます。どちらからでもいつでも許可を終了できます。",
    actsForMe: "あなたの代わりに操作できる人",
    actsForMeEmpty: "あなたの代わりに操作できる人はいません。",
    iHelp: "あなたが手伝っている人",
    iHelpEmpty: "まだ誰も手伝っていません。",
    links: "家族のつながり",
    linksEmpty: "家族のつながりはまだありません。",
    edit: "編集",
    view: "表示",
    endLink: "つながりを終了",
    noScopes: "許可なし",
    giveAccess: "許可を与える",
    linkState: {
      pendingOut: "相手の承認を待っています",
      pendingIn: "つながりの申請が届いています",
      accepted: "つながり済み",
    },
    endLinkTitle: (name) => `${name}とのつながりを終了しますか？`,
    endLinkBody:
      "お互いの「家族」に表示されなくなります。与えた許可は「許可」で終了するまで残ります。",
  },
  grant: {
    memberTitle: (caretaker) => `${caretaker}は何ができますか？`,
    memberSubtitle: (caretaker) =>
      `${caretaker}に与える許可はあなたが選びます。どちらからでもいつでも許可を終了できます。`,
    caretakerTitle: (member) => `${member}のためにできること`,
    caretakerSubtitle: (member) =>
      `あなたへの許可は${member}が選びます。どちらからでもいつでも許可を終了できます。`,
    managedSubtitle: (member) =>
      `${member}のアカウントはあなたが管理しているため、許可はあなたが選びます。`,
    yourAccount: "あなたのアカウント",
    managedAccount: "管理しているアカウント",
    ownAccount: "本人のアカウント",
    readOnly: (member) => `変更できるのは${member}だけです。`,
    readOnlyManaged: (member) =>
      `変更できるのは${member}のアカウントを管理している人だけです。`,
    delegatedSubtitle: (member) =>
      `許可は${member}のアカウントを管理している人が選びます。あなたはいつでも許可を終了できます。`,
    endAccess: "許可を終了",
    confirm: "許可を確定する",
    noChanges: "まだ何も変更されていません。",
    confirmTitle: "変更内容の確認",
    save: "変更を保存",
    endMemberTitle: (caretaker) => `${caretaker}の許可を終了しますか？`,
    endMemberBody: (caretaker) =>
      `${caretaker}はあなたの代わりに操作したり、あなたの依頼を見たりできなくなります。もう一度許可するには、最初から設定し直します。`,
    endCaretakerTitle: (member) => `${member}の手伝いをやめますか？`,
    endCaretakerBody: (member) =>
      `${member}の代わりに操作したり、依頼を見たりできなくなります。`,
    gone: "この許可はすでに終了しています。",
    notAllowed: (member) => `この許可を変更できるのは${member}だけです。`,
    saveFailed:
      "保存できませんでした。何も変更されていません。もう一度お試しください。",
  },
  give: {
    title: "許可を与える",
    subtitle:
      "つながっている家族を選び、あなたのために何ができるかを決めます。",
    chooseWho: "誰があなたの代わりに操作しますか？",
    noCandidates:
      "まず家族とつながってください。許可を与えられるのはつながっている家族だけです。",
    consentHeading: "どのように合意しましたか？",
    reviewTitle: (name) => `${name}は何ができますか？`,
    reviewSubtitle: (name) =>
      `${name}に与える許可はあなたが選びます。いつでも許可を終了できます。`,
    give: "許可を与える",
    confirmTitle: (name) => `${name}ができるようになること：`,
    noneSelected: "少なくとも1つの許可をオンにしてください。",
    exists: "この方はすでにあなたの代わりに操作できます。",
  },
};

const bn: ConsentCopy = {
  scopes: {
    can_post_requests: {
      title: "অনুরোধ পোস্ট করা",
      detail: (member) => `${member}-এর হয়ে অনুরোধ তৈরি ও পরিচালনা করুন।`,
    },
    can_chat: {
      title: "বার্তা পাঠানো",
      detail: (member) => `${member}-এর নামে সাহায্যের ব্যবস্থা করুন।`,
    },
    can_thank_and_pay: {
      title: "ধন্যবাদের অর্থ পাঠানো",
      detail: () => "সাহায্যের পরে ইচ্ছামতো ধন্যবাদ পাঠান।",
    },
    can_view_activity: {
      title: "কার্যকলাপ দেখা",
      detail: () => "অনুরোধ, আগের সাহায্য ও ধন্যবাদ দেখুন।",
    },
  },
  scopeShort: {
    can_post_requests: "অনুরোধ",
    can_chat: "বার্তা",
    can_thank_and_pay: "ধন্যবাদের অর্থ",
    can_view_activity: "কার্যকলাপ দেখা",
  },
  effects: {
    can_post_requests: (c, m, on) =>
      on
        ? `${c} ${m}-এর হয়ে অনুরোধ পোস্ট করতে পারবেন।`
        : `${c} আর ${m}-এর হয়ে অনুরোধ পোস্ট করতে পারবেন না।`,
    can_chat: (c, m, on) =>
      on
        ? `${c} ${m}-এর নামে বার্তা পাঠাতে পারবেন।`
        : `${c} আর ${m}-এর নামে বার্তা পাঠাতে পারবেন না।`,
    can_thank_and_pay: (c, m, on) =>
      on
        ? `${c} ${m}-এর হয়ে ধন্যবাদের অর্থ পাঠাতে পারবেন।`
        : `${c} আর ${m}-এর হয়ে ধন্যবাদের অর্থ পাঠাতে পারবেন না।`,
    can_view_activity: (c, m, on) =>
      on
        ? `${c} ${m}-এর অনুরোধ ও আগের সাহায্য দেখতে পারবেন।`
        : `${c} আর ${m}-এর অনুরোধ ও আগের সাহায্য দেখতে পারবেন না।`,
  },
  consent: {
    in_person: { title: "সামনাসামনি", detail: "একসাথে অনুমতিগুলো দেখে নিন।" },
    via_coordinator: {
      title: "সমন্বয়কারীর সাথে",
      detail: "ভবনের সম্পাদককে সাহায্য করতে বলুন।",
    },
    phone_call: {
      title: "ফোনে",
      detail: "একটি শেয়ার করা ফোনে অনুমতি নিয়ে কথা বলুন।",
    },
  },
  relations: {
    parent: "মা বা বাবা",
    child: "সন্তান",
    sibling: "ভাই বা বোন",
    spouse: "স্বামী বা স্ত্রী",
    grandparent: "দাদা-দাদি বা নানা-নানি",
    grandchild: "নাতি-নাতনি",
    other: "অন্য আত্মীয়",
  },
  regions: { jp: "জাপান", bd: "বাংলাদেশ" },
  you: "আপনি",
  cancel: "বাতিল",
  backToFamily: "পরিবারে ফিরে যান",
  actionFailed: "কাজটি হয়নি। কিছুই বদলানো হয়নি। আবার চেষ্টা করুন।",
  home: {
    addMember: "পরিবারের সদস্য যোগ করুন",
    permissions: "অনুমতি দেখুন",
    askFor: (name) => `${name}-এর হয়ে সাহায্য চান`,
    review: "দেখুন",
    acceptTitle: (name) => `${name}-এর সাথে যুক্ত হবেন?`,
    acceptBody: (name) =>
      `গ্রহণ করলে শুধু আপনাদের অ্যাকাউন্ট যুক্ত হয়। আপনি অনুমতিতে না দিলে ${name} আপনার অনুরোধ দেখতে বা আপনার হয়ে কাজ করতে পারবেন না।`,
    accept: "সংযোগ গ্রহণ করুন",
    decline: "প্রত্যাখ্যান",
    notNow: "এখন নয়",
  },
  add: {
    title: "পরিবারের সদস্য যোগ করুন",
    subtitle:
      "আগে তাদের অনুমতি নিন। তাদের ফোন না থাকলেও তারা আপনার মাধ্যমে Otagai ব্যবহার করতে পারবেন।",
    fullName: "পুরো নাম",
    language: "তাদের ভাষা",
    region: "তারা কোথায় থাকেন",
    consentHeading: "তারা কীভাবে অনুমতি দেবেন?",
    linkExisting: "বিদ্যমান অ্যাকাউন্ট যুক্ত করুন",
    reviewPermissions: "অনুমতি দেখুন",
    nameRequired: "তাদের পুরো নাম লিখুন।",
    reviewTitle: (name) => `${name}-এর জন্য আপনি কী করতে পারবেন?`,
    reviewSubtitle: (name) =>
      `${name}-এর সাথে এগুলো দেখে নিন। শুধু চালু করা অনুমতিগুলো সংরক্ষিত হবে।`,
    consentGiven: "অনুমতি দেওয়ার উপায়",
    create: "অ্যাকাউন্ট তৈরি করুন",
    editDetails: "তথ্য বদলান",
    doneTitle: (name) => `${name}-এর অ্যাকাউন্ট তৈরি হয়েছে`,
    doneBody: (name) =>
      `আপনার বেছে নেওয়া অনুমতি দিয়ে ${name}-কে সাহায্য করতে পারবেন। তাদের হয়ে অনুরোধ পোস্ট করার আগে একজন সার্কেল লিডারকে ${name}-কে কোনো পাড়ার সার্কেলে অনুমোদন দিতে হবে। এটি আলাদা একটি ধাপ।`,
    failed: "অ্যাকাউন্ট তৈরি করা যায়নি। আপনার দেওয়া তথ্য রয়ে গেছে।",
    unsure:
      "অ্যাকাউন্টটি তৈরি হয়েছে কি না নিশ্চিত করা যায়নি। আবার চেষ্টা করার আগে পরিবার দেখে নিন।",
  },
  link: {
    title: "বিদ্যমান অ্যাকাউন্ট যুক্ত করুন",
    subtitle:
      "আপনাদের দুজনেরই Otagai লাগবে। আপনার সদস্য আইডি শেয়ার করুন, অথবা তাদেরটি লিখুন।",
    yourId: "আপনার সদস্য আইডি",
    yourIdHint:
      "পরিবারের সদস্যকে শেয়ার করুন, যাতে তারা আপনার সাথে যুক্ত হতে পারেন।",
    share: "আমার আইডি শেয়ার করুন",
    shareMessage: (id) => `আমার Otagai সদস্য আইডি: ${id}`,
    shareFailed: "এখানে শেয়ার করা যাচ্ছে না। কপি করতে আইডিটি চেপে ধরে রাখুন।",
    theirId: "তাদের সদস্য আইডি",
    theirIdHint:
      "তাদের পরিবার › পরিবারের সদস্য যোগ করুন › বিদ্যমান অ্যাকাউন্ট যুক্ত করুন খুলতে বলুন।",
    invalidId: "তারা যে পুরো সদস্য আইডি শেয়ার করেছেন সেটি লিখুন।",
    relation: "তারা আপনার…",
    send: "সংযোগের অনুরোধ পাঠান",
    sentTitle: "সংযোগের অনুরোধ পাঠানো হয়েছে",
    sentBody:
      "তারা পরিবার থেকে গ্রহণ না করা পর্যন্ত এটি অপেক্ষমাণ থাকবে। গ্রহণ করলে শুধু অ্যাকাউন্ট যুক্ত হয়, কাউকে অনুমতি দেওয়া হয় না।",
    notFound: "এই আইডির কোনো অ্যাকাউন্ট নেই।",
    exists: "এই ব্যক্তির সাথে আপনার আগে থেকেই সংযোগ আছে।",
    self: "এটি আপনার নিজের সদস্য আইডি।",
  },
  permissions: {
    title: "অনুমতি",
    subtitle:
      "কে আপনার হয়ে কাজ করতে পারেন আর আপনি কাকে সাহায্য করেন তা দেখুন। যে কেউ যেকোনো সময় অনুমতি শেষ করতে পারেন।",
    actsForMe: "কে আপনার হয়ে কাজ করতে পারেন",
    actsForMeEmpty: "কেউ আপনার হয়ে কাজ করতে পারেন না।",
    iHelp: "আপনি যাদের সাহায্য করেন",
    iHelpEmpty: "আপনি এখনো কাউকে সাহায্য করছেন না।",
    links: "পরিবারের সংযোগ",
    linksEmpty: "এখনো পরিবারের কোনো সংযোগ নেই।",
    edit: "বদলান",
    view: "দেখুন",
    endLink: "সংযোগ শেষ করুন",
    noScopes: "কোনো অনুমতি নেই",
    giveAccess: "কাউকে অনুমতি দিন",
    linkState: {
      pendingOut: "তাদের সম্মতির অপেক্ষায়",
      pendingIn: "আপনার সাথে যুক্ত হতে চেয়েছেন",
      accepted: "যুক্ত",
    },
    endLinkTitle: (name) => `${name}-এর সাথে সংযোগ শেষ করবেন?`,
    endLinkBody:
      "আপনারা আর একে অপরের পরিবারে দেখাবেন না। দেওয়া অনুমতি অনুমতি পাতা থেকে শেষ না করা পর্যন্ত থাকবে।",
  },
  grant: {
    memberTitle: (caretaker) => `${caretaker} কী করতে পারবেন?`,
    memberSubtitle: (caretaker) =>
      `${caretaker}-কে কোন অনুমতি দেবেন তা আপনি বেছে নেন। আপনারা যে কেউ যেকোনো সময় অনুমতি শেষ করতে পারেন।`,
    caretakerTitle: (member) => `${member}-এর জন্য আপনি যা করতে পারেন`,
    caretakerSubtitle: (member) =>
      `আপনাকে কোন অনুমতি দেবেন তা ${member} বেছে নেন। আপনারা যে কেউ যেকোনো সময় অনুমতি শেষ করতে পারেন।`,
    managedSubtitle: (member) =>
      `${member}-এর অ্যাকাউন্ট আপনি পরিচালনা করেন, তাই এই অনুমতিগুলো আপনি বেছে নেন।`,
    yourAccount: "আপনার অ্যাকাউন্ট",
    managedAccount: "পরিচালিত অ্যাকাউন্ট",
    ownAccount: "নিজের অ্যাকাউন্ট আছে",
    readOnly: (member) => `শুধু ${member} এগুলো বদলাতে পারেন।`,
    readOnlyManaged: (member) =>
      `শুধু যিনি ${member}-এর অ্যাকাউন্ট পরিচালনা করেন তিনিই এগুলো বদলাতে পারেন।`,
    delegatedSubtitle: (member) =>
      `যিনি ${member}-এর অ্যাকাউন্ট পরিচালনা করেন তিনি এই অনুমতিগুলো বেছে নেন। আপনি যেকোনো সময় আপনার অনুমতি শেষ করতে পারেন।`,
    endAccess: "অনুমতি শেষ করুন",
    confirm: "অনুমতি নিশ্চিত করুন",
    noChanges: "এখনো কিছু বদলানো হয়নি।",
    confirmTitle: "এই পরিবর্তনগুলো নিশ্চিত করুন",
    save: "পরিবর্তন সংরক্ষণ করুন",
    endMemberTitle: (caretaker) => `${caretaker}-এর অনুমতি শেষ করবেন?`,
    endMemberBody: (caretaker) =>
      `${caretaker} আর আপনার হয়ে কাজ করতে বা আপনার অনুরোধ দেখতে পারবেন না। আবার অনুমতি দিতে শুরু থেকে সেট করতে হবে।`,
    endCaretakerTitle: (member) => `${member}-কে সাহায্য করা বন্ধ করবেন?`,
    endCaretakerBody: (member) =>
      `আপনি আর ${member}-এর হয়ে কাজ করতে বা তাদের অনুরোধ দেখতে পারবেন না।`,
    gone: "এই অনুমতি আগেই শেষ হয়ে গেছে।",
    notAllowed: (member) => `শুধু ${member} এই অনুমতিগুলো বদলাতে পারেন।`,
    saveFailed: "সংরক্ষণ করা যায়নি। কিছুই বদলানো হয়নি। আবার চেষ্টা করুন।",
  },
  give: {
    title: "কাউকে অনুমতি দিন",
    subtitle:
      "একজন যুক্ত পরিবারের সদস্য বেছে নিন এবং তারা আপনার জন্য কী করতে পারবেন ঠিক করুন।",
    chooseWho: "কে আপনার হয়ে কাজ করবেন?",
    noCandidates:
      "আগে পরিবারের কোনো সদস্যের সাথে যুক্ত হন। শুধু যুক্ত পরিবারকেই অনুমতি দেওয়া যায়।",
    consentHeading: "আপনারা কীভাবে সম্মত হয়েছেন?",
    reviewTitle: (name) => `${name} কী করতে পারবেন?`,
    reviewSubtitle: (name) =>
      `${name}-কে কোন অনুমতি দেবেন তা আপনি বেছে নেন। যেকোনো সময় অনুমতি শেষ করতে পারেন।`,
    give: "অনুমতি দিন",
    confirmTitle: (name) => `${name} যা করতে পারবেন:`,
    noneSelected: "অন্তত একটি অনুমতি চালু করুন।",
    exists: "এই ব্যক্তি আগে থেকেই আপনার হয়ে কাজ করতে পারেন।",
  },
};

export const familyConsentCopy: Record<Language, ConsentCopy> = { en, ja, bn };
