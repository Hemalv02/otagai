import { useState } from "react";

import { ConfirmSheet, SheetLine } from "@/components/family-forms";
import { ErrorText } from "@/components/ui";
import type { Language } from "@/lib/api";
import { familyApi } from "@/lib/family-api";
import { familyConsentCopy } from "@/lib/family-consent-copy";

export type ReviewedLink = { id: string; name: string };

export function LinkReviewSheet({
  link,
  authUserId,
  onClose,
  onChanged,
  locale,
}: {
  link: ReviewedLink | null;
  authUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
  locale: Language;
}) {
  const copy = familyConsentCopy[locale];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function decide(accept: boolean) {
    if (!link || !authUserId) return;
    setBusy(true);
    setFailed(false);
    try {
      const write = { authUserId };
      if (accept) await familyApi.acceptLink(link.id, write);
      else await familyApi.endLink(link.id, write);
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setFailed(false);
    onClose();
  }

  return (
    <ConfirmSheet
      visible={link !== null}
      title={link ? copy.home.acceptTitle(link.name) : ""}
      confirmLabel={copy.home.accept}
      secondaryLabel={copy.home.decline}
      cancelLabel={copy.home.notNow}
      onConfirm={() => void decide(true)}
      onSecondary={() => void decide(false)}
      onCancel={close}
      busy={busy}
      locale={locale}
    >
      {link ? (
        <SheetLine locale={locale}>{copy.home.acceptBody(link.name)}</SheetLine>
      ) : null}
      {failed ? <ErrorText>{copy.actionFailed}</ErrorText> : null}
    </ConfirmSheet>
  );
}
