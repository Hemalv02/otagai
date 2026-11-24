import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import type { Language, RequestSummary } from "@/lib/api";
import { familyConsentCopy } from "@/lib/family-consent-copy";
import { familyCopy } from "@/lib/family-copy";
import {
  type FamilyAccount,
  formatDate,
  formatNeededWindow,
  type StatusLinkRow,
} from "@/lib/family-state";
import { liveRequestCopy } from "@/lib/live-request-copy";
import type { RequestStatus } from "@/lib/requests-api";
import { useLocalizedType } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

type Tone = "action" | "clay" | "secondary";

const THUMBNAIL_SIZE = 56;
const STATUS_WIDTH = 92;

export function initial(value: string, locale: Language) {
  return Array.from(value.trim())[0]?.toLocaleUpperCase(locale) ?? "?";
}

export function Thumbnail({
  letter,
  shape,
  locale,
}: {
  letter: string;
  shape: "round" | "square";
  locale: Language;
}) {
  const localizedType = useLocalizedType();
  return (
    <View
      accessible={false}
      style={[
        styles.thumbnail,
        shape === "round" ? styles.round : styles.square,
      ]}
    >
      <Text style={[localizedType("card-title", locale), styles.action]}>
        {letter}
      </Text>
    </View>
  );
}

export function ListRow({
  thumbnail,
  title,
  titleLines,
  detail,
  detailTone = "secondary",
  status,
  statusTone = "action",
  locale,
  children,
}: {
  thumbnail: ReactNode;
  title: string;
  titleLines?: number;
  detail: string;
  detailTone?: Tone;
  status: string;
  statusTone?: Tone;
  locale: Language;
  children?: ReactNode;
}) {
  const localizedType = useLocalizedType();
  const supporting = localizedType("supporting", locale);
  return (
    <View style={styles.row}>
      {thumbnail}
      <View style={styles.rowCopy}>
        <Text
          numberOfLines={titleLines}
          style={[localizedType("field-label", locale), styles.ink]}
        >
          {title}
        </Text>
        <Text style={[supporting, styles[detailTone]]}>{detail}</Text>
        {children}
      </View>
      <Text style={[supporting, styles.status, styles[statusTone]]}>
        {status}
      </Text>
    </View>
  );
}

export function AccountList({
  accounts,
  links,
  selectedId,
  circleName,
  onSelect,
  onReviewLink,
  locale,
}: {
  accounts: readonly FamilyAccount[];
  links: readonly StatusLinkRow[];
  selectedId: string;
  circleName: string | null;
  onSelect: (accountId: string) => void;
  onReviewLink: (link: StatusLinkRow) => void;
  locale: Language;
}) {
  const localizedType = useLocalizedType();
  const copy = familyCopy[locale];
  const consent = familyConsentCopy[locale];

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[localizedType("section-heading", locale), styles.ink]}
      >
        {copy.chooseWho}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={copy.chooseWho}
        style={styles.list}
      >
        {accounts.map((account) => {
          const selected = account.id === selectedId;
          const detail = account.isSelf
            ? [copy.yourAccount, circleName].filter(Boolean).join(" · ")
            : account.canViewActivity
              ? copy.canView
              : copy.activityHidden;
          return (
            <Pressable
              key={account.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${account.name}, ${detail}`}
              onPress={() => onSelect(account.id)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <ListRow
                thumbnail={
                  <Thumbnail
                    letter={initial(account.name, locale)}
                    shape="round"
                    locale={locale}
                  />
                }
                title={account.name}
                detail={detail}
                detailTone={account.canViewActivity ? "secondary" : "clay"}
                status={selected ? copy.active : copy.switchTo}
                locale={locale}
              />
            </Pressable>
          );
        })}
      </View>
      {links.length > 0 ? (
        <View style={styles.list}>
          {links.map((link) => {
            const incoming = link.standing === "pending-incoming";
            const row = (
              <ListRow
                thumbnail={
                  <Thumbnail
                    letter={initial(link.name, locale)}
                    shape="round"
                    locale={locale}
                  />
                }
                title={link.name}
                detail={copy.linkDetail[link.standing]}
                status={
                  incoming
                    ? consent.home.review
                    : link.standing === "no-permission"
                      ? copy.linkStatus.noAccess
                      : copy.linkStatus.pending
                }
                statusTone={incoming ? "action" : "clay"}
                locale={locale}
              />
            );
            const label = `${link.name}, ${copy.linkDetail[link.standing]}`;
            return incoming ? (
              <Pressable
                key={link.id}
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${consent.home.review}`}
                onPress={() => onReviewLink(link)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                {row}
              </Pressable>
            ) : (
              <View key={link.id} accessible accessibilityLabel={label}>
                {row}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const familyRequestManage = {
  en: "Open request",
  ja: "お願いを開く",
  bn: "অনুরোধ খুলুন",
};

export function FamilyRequestRow({
  request,
  locale,
  onOpen,
}: {
  request: RequestSummary;
  locale: Language;
  onOpen: () => void;
}) {
  const localizedType = useLocalizedType();
  const [expanded, setExpanded] = useState(false);
  const copy = familyCopy[locale];
  const supporting = localizedType("supporting", locale);
  const kind = copy.kinds[request.kind] ?? request.kind;
  const when =
    formatNeededWindow(request.needed_from, request.needed_until, locale) ??
    copy.anyTime;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? copy.hideDetails : copy.showDetails}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <ListRow
          thumbnail={
            <Thumbnail
              letter={initial(kind, locale)}
              shape="square"
              locale={locale}
            />
          }
          title={request.polite_text}
          titleLines={expanded ? undefined : 2}
          detail={`${kind} · ${when}`}
          status={
            liveRequestCopy[locale].status[request.status as RequestStatus] ??
            request.status
          }
          locale={locale}
        >
          {expanded ? (
            <>
              <Text style={[supporting, styles.secondary]}>
                {copy.posted} · {formatDate(request.created_at, locale)}
              </Text>
              <Text style={[supporting, styles.secondary]}>
                {copy.audience} ·{" "}
                {copy.ripple[request.ripple_stage] ?? request.ripple_stage}
              </Text>
            </>
          ) : null}
          <Text style={[localizedType("field-label", locale), styles.action]}>
            {expanded ? copy.hideDetails : copy.showDetails}
          </Text>
        </ListRow>
      </Pressable>
      <Button
        label={familyRequestManage[locale]}
        variant="text"
        labelStyle={localizedType("field-label", locale)}
        onPress={onOpen}
      />
    </View>
  );
}

function SkeletonRows({ shape }: { shape: "round" | "square" }) {
  return (
    <>
      {[0, 1].map((key) => (
        <View key={key} style={styles.row}>
          <View
            style={[
              styles.thumbnail,
              shape === "round" ? styles.round : styles.square,
            ]}
          />
          <View style={styles.rowCopy}>
            <View style={[styles.bone, styles.boneMedium]} />
            <View style={[styles.bone, styles.boneShort]} />
          </View>
        </View>
      ))}
    </>
  );
}

export function RequestSkeleton({ locale }: { locale: Language }) {
  return (
    <View
      accessible
      accessibilityLabel={familyCopy[locale].loading}
      accessibilityState={{ busy: true }}
      style={styles.list}
    >
      <SkeletonRows shape="square" />
    </View>
  );
}

export function AccountSkeleton() {
  return (
    <View accessible={false} style={styles.list}>
      <SkeletonRows shape="round" />
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
  const localizedType = useLocalizedType();
  return (
    <View
      accessibilityRole={tone === "alert" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "alert" ? "assertive" : "none"}
      style={styles.notice}
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
  section: { gap: spacing["card-inset"] },
  list: { gap: spacing["card-inset"] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    minHeight: 54,
  },
  rowCopy: {
    flex: 1,
    minHeight: controls["touch-target"],
    paddingTop: 4,
    paddingBottom: 5,
  },
  status: { minWidth: STATUS_WIDTH, maxWidth: 120, textAlign: "right" },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.wash,
  },
  round: { borderRadius: THUMBNAIL_SIZE / 2 },
  square: { borderRadius: controls.radius },
  pressed: { opacity: 0.7 },
  bone: {
    height: 16,
    borderRadius: 4,
    marginVertical: 4,
    backgroundColor: colors.wash,
  },
  boneShort: { width: "40%" },
  boneMedium: { width: "70%" },
  notice: {
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  noticeAction: { marginTop: 4 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  action: { color: colors.action },
  clay: { color: colors.clay },
});
