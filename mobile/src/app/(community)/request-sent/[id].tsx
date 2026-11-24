import { Redirect, useLocalSearchParams } from "expo-router";

import { legacyReceiptHref } from "@/lib/legacy-community-routes";

export default function RequestSentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={legacyReceiptHref(id)} />;
}
