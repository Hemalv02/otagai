import { Image, type ImageSource } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { Button } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import { useMemberships } from "@/lib/memberships";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

const homeCopy = {
  en: {
    greet: (name: string) => `Hello, ${name}`,
    ask: "Ask",
    lend: "Lend",
    browse: "Browse tools and skills",
    nearby: "Available nearby",
    today: "Today",
    drill: "Cordless hammer drill",
    cutter: "Grass cutter",
    available: "Available",
    weekend: "This weekend",
    empty: "There are no open requests in your circle.",
    demo: "Demo activity",
    preview: (name: string) => `Preview as ${name}`,
    backToYou: "Return to my view",
  },
  ja: {
    greet: (name: string) => `こんにちは、${name}`,
    ask: "お願いする",
    lend: "貸す",
    browse: "道具とスキルを探す",
    nearby: "近所で借りられるもの",
    today: "今日",
    drill: "充電式振動ドリル",
    cutter: "草刈り機",
    available: "貸出可能",
    weekend: "今週末",
    empty: "サークルに募集中の依頼はありません。",
    demo: "デモのアクティビティ",
    preview: (name: string) => `${name}の画面を見る`,
    backToYou: "自分の画面に戻る",
  },
  bn: {
    greet: (name: string) => `স্বাগতম, ${name}`,
    ask: "সাহায্য চাই",
    lend: "ধার দিন",
    browse: "সরঞ্জাম ও দক্ষতা খুঁজুন",
    nearby: "কাছাকাছি পাওয়া যাবে",
    today: "আজ",
    drill: "কর্ডলেস হ্যামার ড্রিল",
    cutter: "ঘাস কাটার যন্ত্র",
    available: "পাওয়া যাবে",
    weekend: "এই সপ্তাহান্তে",
    empty: "আপনার দলে কোনো খোলা অনুরোধ নেই।",
    demo: "ডেমো কার্যকলাপ",
    preview: (name: string) => `${name} হিসেবে দেখুন`,
    backToYou: "নিজের ভিউতে ফিরুন",
  },
};

function HomeRow({
  title,
  description,
  detail,
  photo,
  portrait,
  onPress,
}: {
  title: string;
  description: string;
  detail: string;
  photo?: ImageSource;
  portrait?: boolean;
  onPress: () => void;
}) {
  const { locale } = useOnboardingText();
  const supporting = localizedType("supporting", locale);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, description, detail]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={styles.row}
    >
      {photo ? (
        <Image
          source={photo}
          style={[styles.thumbnail, portrait && styles.portrait]}
          contentFit="cover"
          accessible={false}
        />
      ) : null}
      <View style={styles.rowCopy}>
        <Text style={[localizedType("field-label", locale), styles.ink]}>
          {title}
        </Text>
        <Text style={[supporting, styles.secondary]}>{description}</Text>
      </View>
      {detail ? (
        <Text style={[supporting, styles.rowDetail]}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

export default function Home() {
  const { state } = useMemberships();
  const { t, locale } = useOnboardingText();
  const circle =
    state.status === "ready"
      ? state.items.find((membership) => membership.status === "approved")
          ?.circle
      : undefined;
  const circleName =
    circle?.name_translations[locale] ??
    circle?.name ??
    t("circleNameFallback");
  return (
    <CircleHome
      circleName={
        typeof circleName === "string" ? circleName : t("circleNameFallback")
      }
    />
  );
}

function CircleHome({ circleName }: { circleName: string }) {
  const { locale } = useOnboardingText();
  const { actor, people, requests, switchActor } = useCommunityDemo();
  const copy = homeCopy[locale];
  const sectionTitle = localizedType("section-heading", locale);
  const label = localizedType("field-label", locale);
  const button = localizedType("button", locale);
  const supporting = localizedType("supporting", locale);
  const openRequests = requests.filter(
    (request) => request.createdBy !== actor && request.status === "open",
  );

  return (
    <CommunityScreen
      title={copy.greet(people[actor].name)}
      eyebrow={circleName}
    >
      <View style={styles.actions}>
        <Button
          label={copy.ask}
          labelStyle={button}
          style={styles.action}
          onPress={() => router.push("/ask")}
        />
        <Button
          label={copy.lend}
          labelStyle={[button, styles.green]}
          style={[styles.action, styles.secondaryButton]}
          variant="secondary"
          onPress={() => router.push("/tools/add")}
        />
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[sectionTitle, styles.ink]}>
          {copy.nearby}
        </Text>
        <Button
          label={copy.browse}
          labelStyle={label}
          variant="text"
          onPress={() => router.navigate("/tools")}
        />
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[sectionTitle, styles.ink]}>
          {copy.today}
        </Text>
        {openRequests.length ? (
          openRequests.map((request) => (
            <HomeRow
              key={request.id}
              title={request.title}
              description={people[request.createdBy].name}
              detail={request.timing}
              photo={
                request.id === "carry-rice"
                  ? require("../../../../assets/images/lending-tanaka-thumbnail.png")
                  : undefined
              }
              portrait
              onPress={() =>
                router.push({
                  pathname: "/requests/[id]",
                  params: { id: request.id },
                })
              }
            />
          ))
        ) : (
          <Text style={[supporting, styles.secondary]}>{copy.empty}</Text>
        )}
      </View>
      <View style={styles.demo}>
        <Text style={[supporting, styles.secondary]}>{copy.demo}</Text>
        <Button
          variant="text"
          label={
            actor === "member"
              ? copy.preview(people.neighbour.name)
              : copy.backToYou
          }
          labelStyle={label}
          onPress={switchActor}
        />
      </View>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing["control-gap"] },
  action: { flex: 1 },
  secondaryButton: { borderColor: colors.control },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  green: { color: colors.action },
  section: { gap: spacing["related-gap"] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    minHeight: 64,
    paddingVertical: 4,
    borderRadius: controls.radius,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  portrait: { borderRadius: 28 },
  rowCopy: { flex: 1 },
  rowDetail: { color: colors.action, textAlign: "right", maxWidth: "30%" },
  demo: {
    borderTopWidth: 1,
    borderColor: colors.rule,
    paddingTop: spacing["related-gap"],
  },
});
