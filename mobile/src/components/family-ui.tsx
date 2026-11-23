import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import type { Language, RequestSummary } from "@/lib/api";
import { familyCopy } from "@/lib/family-copy";
import {
  type FamilyAccount,
  type FamilyLinkRow,
  formatDate,
  formatNeededWindow,
  type LinkStanding,
} from "@/lib/family-state";
import { localizedType } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

const attention: ReadonlySet<LinkStanding> = new Set([
  "pending-outgoing",
  "pending-incoming",
  "activity-hidden",
  "no-permission",
]);

function initial(name: string, locale: Language) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase(locale) ?? "?";
}

export function AccountSwitcher({
  accounts,
  selectedId,
  onSelect,
  locale,
}: {
  accounts: readonly FamilyAccount[];
  selectedId: string;
  onSelect: (accountId: string) => void;
  locale: Language;
}) {
  const copy = familyCopy[locale];
  const label = localizedType("field-label", locale);
  const supporting = localizedType("supporting", locale);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.accounts}
      style={styles.bleed}
      contentContainerStyle={[styles.switcher, styles.bleedContent]}
    >
      {accounts.map((account) => {
        const selected = account.id === selectedId;
        const title = account.isSelf ? copy.you : account.name;
        const detail = account.isSelf
          ? account.name
          : account.canViewActivity
            ? copy.canView
            : copy.activityHidden;
        return (
          <Pressable
            key={account.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${title}, ${detail}`}
            onPress={() => onSelect(account.id)}
            style={({ pressed }) => [
              styles.account,
              selected && styles.accountSelected,
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[styles.avatar, selected && styles.avatarSelected]}
              accessible={false}
            >
              <Text style={[label, selected ? styles.onAction : styles.action]}>
                {initial(account.name, locale)}
              </Text>
            </View>
            <View style={styles.accountCopy}>
              <Text numberOfLines={1} style={[label, styles.ink]}>
                {title}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  supporting,
                  account.canViewActivity ? styles.secondary : styles.clay,
                ]}
              >
                {detail}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function LinkedFamily({
  links,
  locale,
}: {
  links: readonly FamilyLinkRow[];
  locale: Language;
}) {
  const copy = familyCopy[locale];
  const supporting = localizedType("supporting", locale);

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[localizedType("card-title", locale), styles.ink]}
      >
        {copy.linkedPeople}
      </Text>
      <View style={styles.linkList}>
        {links.map((link, index) => {
          const flagged = attention.has(link.standing);
          return (
            <View
              key={link.id}
              accessible
              accessibilityLabel={`${link.name}, ${copy.standing[link.standing]}`}
              style={[styles.linkRow, index > 0 && styles.linkDivider]}
            >
              <View
                style={[
                  styles.dot,
                  flagged ? styles.dotClay : styles.dotAction,
                ]}
              />
              <View style={styles.accountCopy}>
                <Text
                  style={[localizedType("field-label", locale), styles.ink]}
                >
                  {link.name}
                </Text>
                <Text
                  style={[supporting, flagged ? styles.clay : styles.secondary]}
                >
                  {copy.standing[link.standing]}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function FamilyRequestCard({
  request,
  locale,
}: {
  request: RequestSummary;
  locale: Language;
}) {
  const [expanded, setExpanded] = useState(false);
  const copy = familyCopy[locale];
  const label = localizedType("field-label", locale);
  const supporting = localizedType("supporting", locale);
  const when =
    formatNeededWindow(request.needed_from, request.needed_until, locale) ??
    copy.anyTime;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityHint={expanded ? copy.hideDetails : copy.showDetails}
      onPress={() => setExpanded((value) => !value)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.tags}>
        <Text style={[supporting, styles.tag, styles.ink]}>
          {copy.kinds[request.kind] ?? request.kind}
        </Text>
        <Text style={[supporting, styles.tag, styles.openTag]}>
          {copy.open}
        </Text>
      </View>
      <Text
        numberOfLines={expanded ? undefined : 3}
        style={[localizedType("body", locale), styles.ink]}
      >
        {request.polite_text}
      </Text>
      <DetailLine label={copy.needed} value={when} locale={locale} />
      {expanded ? (
        <>
          <DetailLine
            label={copy.posted}
            value={formatDate(request.created_at, locale)}
            locale={locale}
          />
          <DetailLine
            label={copy.audience}
            value={copy.ripple[request.ripple_stage] ?? request.ripple_stage}
            locale={locale}
          />
        </>
      ) : null}
      <Text style={[label, styles.action]}>
        {expanded ? copy.hideDetails : copy.showDetails}
      </Text>
    </Pressable>
  );
}

function DetailLine({
  label,
  value,
  locale,
}: {
  label: string;
  value: string;
  locale: Language;
}) {
  const supporting = localizedType("supporting", locale);
  return (
    <Text style={[supporting, styles.secondary]}>
      <Text style={[localizedType("field-label", locale), styles.secondary]}>
        {label}
      </Text>
      {"  "}
      {value}
    </Text>
  );
}

export function RequestSkeleton({ locale }: { locale: Language }) {
  return (
    <View
      accessible
      accessibilityLabel={familyCopy[locale].loading}
      accessibilityState={{ busy: true }}
      style={styles.section}
    >
      {[0, 1].map((key) => (
        <View key={key} style={styles.card}>
          <View style={[styles.bone, styles.boneShort]} />
          <View style={styles.bone} />
          <View style={[styles.bone, styles.boneMedium]} />
        </View>
      ))}
    </View>
  );
}

export function AccountSkeleton() {
  return (
    <View style={styles.switcher} accessible={false}>
      {[0, 1].map((key) => (
        <View key={key} style={[styles.account, styles.accountBone]} />
      ))}
    </View>
  );
}

export function FamilyNotice({
  title,
  body,
  actionLabel,
  onAction,
  tone = "calm",
  locale,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "calm" | "alert";
  locale: Language;
}) {
  return (
    <View
      accessibilityRole={tone === "alert" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "alert" ? "assertive" : "none"}
      style={[styles.notice, tone === "alert" && styles.noticeAlert]}
    >
      <Text style={[localizedType("field-label", locale), styles.ink]}>
        {title}
      </Text>
      {body ? (
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          labelStyle={localizedType("field-label", locale)}
          variant="secondary"
          onPress={onAction}
          style={styles.noticeAction}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  switcher: { gap: spacing["related-gap"], paddingVertical: 2 },
  bleed: { marginHorizontal: -spacing["screen-gutter"] },
  bleedContent: { paddingHorizontal: spacing["screen-gutter"] },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["related-gap"],
    minHeight: controls["touch-target"] + 16,
    minWidth: 156,
    maxWidth: 240,
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: spacing["related-gap"],
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: controls.radius,
    backgroundColor: colors.canvas,
  },
  accountSelected: {
    borderColor: colors.action,
    borderWidth: controls["focus-width"],
    backgroundColor: colors.wash,
  },
  accountBone: { backgroundColor: colors.wash, borderColor: colors.wash },
  accountCopy: { flexShrink: 1, gap: 2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.wash,
  },
  avatarSelected: { backgroundColor: colors.action },
  pressed: { opacity: 0.7 },
  section: { gap: spacing["related-gap"] },
  linkList: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: controls.radius,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing["control-gap"],
    padding: spacing["card-inset"],
  },
  linkDivider: { borderTopWidth: 1, borderColor: colors.rule },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 8 },
  dotAction: { backgroundColor: colors.action },
  dotClay: { backgroundColor: colors.clay },
  card: {
    borderColor: colors.rule,
    borderRadius: controls.radius,
    borderWidth: 1,
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
    backgroundColor: colors.canvas,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing["related-gap"] },
  tag: {
    paddingHorizontal: spacing["related-gap"],
    borderRadius: 4,
    backgroundColor: colors.paper,
    overflow: "hidden",
  },
  openTag: { backgroundColor: colors.wash, color: colors.action },
  bone: {
    height: 16,
    borderRadius: 4,
    backgroundColor: colors.wash,
  },
  boneShort: { width: "30%" },
  boneMedium: { width: "60%" },
  notice: {
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  noticeAlert: { borderLeftWidth: 4, borderLeftColor: colors.clay },
  noticeAction: { marginTop: 4 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  action: { color: colors.action },
  onAction: { color: colors["on-action"] },
  clay: { color: colors.clay },
});
