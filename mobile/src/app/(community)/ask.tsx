import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { CommunityScreen } from "@/components/community-screen";
import { RequestNotice } from "@/components/request-notice";
import { Button, Field } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import { listingText, useDemoListings } from "@/lib/demo-listings";
import { lendingCopy } from "@/lib/lending-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestCopy, suggestRequestTitle } from "@/lib/request-demo-copy";

export default function AskScreen() {
  const { listingId } = useLocalSearchParams<{ listingId?: string }>();
  const { locale } = useOnboardingText();
  const { setAskDraft } = useCommunityDemo();
  const copy = requestCopy[locale];
  const lending = lendingCopy[locale];
  const { listings } = useDemoListings();
  const listing = listings.find((item) => item.id === listingId);
  const listingTitle = listing ? listingText(listing.title, locale) : "";
  const isLoan = listing?.kind === "tool";
  const [description, setDescription] = useState("");

  function review() {
    if (!description.trim()) return;
    setAskDraft({
      title: listingTitle || suggestRequestTitle(description),
      description: description.trim(),
      ...(listing ? { listingId: listing.id } : {}),
    });
    router.push("/ask-review");
  }

  return (
    <CommunityScreen
      back
      keyboard
      title={
        listing
          ? isLoan
            ? lending.askToBorrow
            : lending.askForHelp
          : copy.askTitle
      }
      subtitle={listingTitle || copy.askSubtitle}
      footer={
        <Button
          label={copy.review}
          labelStyle={localizedType("button", locale)}
          disabled={!description.trim()}
          onPress={review}
        />
      }
    >
      <Field
        label={isLoan ? copy.useToolFor : copy.taskLabel}
        labelStyle={localizedType("field-label", locale)}
        style={[localizedType("body", locale), { minHeight: 104 }]}
        placeholder={copy.taskExample}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
      />
      <RequestNotice
        title={copy.chooseToSend}
        detail={copy.privateUntilReview}
        locale={locale}
      />
    </CommunityScreen>
  );
}
