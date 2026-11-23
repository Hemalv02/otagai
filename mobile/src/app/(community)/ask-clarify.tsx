import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { Button } from "@/components/ui";
import { analyzeAsk, type WallMaterial } from "@/lib/ask-suggestions";
import { askSuggestionsCopy } from "@/lib/ask-suggestions-copy";
import { useCommunityDemo } from "@/lib/community-demo";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

const selectedIcon = require("../../../assets/images/community/ask-choice-selected.svg");
const unselectedIcon = require("../../../assets/images/community/ask-choice-empty.svg");
const materials = ["masonry", "wood"] as const;

export default function ClarifyAskScreen() {
  const { locale } = useOnboardingText();
  const { askDraft, setAskDraft } = useCommunityDemo();
  const copy = askSuggestionsCopy[locale];
  const task = analyzeAsk(askDraft?.description ?? "", askDraft?.wall);
  const [selected, setSelected] = useState<WallMaterial | undefined>(
    task.wall === "unsure" ? undefined : task.wall,
  );
  const label = localizedType("field-label", locale);
  const body = localizedType("supporting", locale);
  const button = localizedType("button", locale);

  function showSuggestions(wall: WallMaterial) {
    if (!askDraft) return;
    setAskDraft({ ...askDraft, wall });
    router.push("/ask-suggestions");
  }

  if (!askDraft || task.topic !== "shelf") {
    return (
      <CommunityScreen back title={copy.describe}>
        <Button
          label={copy.describe}
          labelStyle={button}
          onPress={() => router.replace("/ask")}
        />
      </CommunityScreen>
    );
  }

  return (
    <CommunityScreen
      title={copy.wallTitle}
      subtitle={copy.wallDescription}
      back
      footer={
        <Button
          label={copy.see}
          labelStyle={button}
          disabled={!selected}
          onPress={() => {
            if (selected) showSuggestions(selected);
          }}
        />
      }
    >
      <View style={styles.photoGroup}>
        <Image
          source={require("../../../assets/images/community/ask-shelf-wall.png")}
          contentFit="cover"
          accessible={false}
          style={styles.photo}
        />
        <Text style={[body, styles.secondary]}>{copy.exampleWall}</Text>
      </View>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {materials.map((material) => {
          const checked = selected === material;
          return (
            <Pressable
              key={material}
              accessibilityRole="radio"
              accessibilityLabel={copy[material]}
              accessibilityHint={copy[`${material}Detail`]}
              accessibilityState={{ checked }}
              style={[styles.option, checked && styles.selected]}
              onPress={() => setSelected(material)}
            >
              <Image
                source={checked ? selectedIcon : unselectedIcon}
                style={styles.indicator}
                accessible={false}
              />
              <View style={styles.optionCopy}>
                <Text style={[label, styles.ink]}>{copy[material]}</Text>
                <Text style={[body, styles.secondary]}>
                  {copy[`${material}Detail`]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View>
        <Button
          variant="text"
          label={copy.unsure}
          labelStyle={label}
          onPress={() => {
            setSelected(undefined);
            showSuggestions("unsure");
          }}
        />
        <Button
          variant="text"
          label={copy.edit}
          labelStyle={label}
          onPress={() =>
            router.dismissTo({ pathname: "/ask", params: { edit: "1" } })
          }
        />
      </View>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  photoGroup: { gap: 4 },
  photo: {
    height: 144,
    width: "100%",
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  options: { gap: spacing["card-inset"] },
  option: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: spacing["related-gap"],
    borderWidth: 1,
    borderColor: colors.control,
    borderRadius: controls.radius,
  },
  selected: { borderColor: colors.action, backgroundColor: colors.wash },
  indicator: { width: 22, height: 22 },
  optionCopy: { flex: 1 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
