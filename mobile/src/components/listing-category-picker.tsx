import { Host, Picker } from "@expo/ui";

import { listingCategories, type ListingCategory } from "@/lib/demo-listings";
import { lendingCopy } from "@/lib/lending-copy";
import { useOnboardingText } from "@/lib/onboarding-i18n";
import { colors } from "@/theme/tokens.json";

export function ListingCategoryPicker({
  value,
  onChange,
  filter = false,
  disabled = false,
}: {
  value: ListingCategory | "";
  onChange: (value: ListingCategory | "") => void;
  filter?: boolean;
  disabled?: boolean;
}) {
  const { locale } = useOnboardingText();
  const copy = lendingCopy[locale];

  return (
    <Host matchContents seedColor={colors.action}>
      <Picker<ListingCategory | "">
        selectedValue={value}
        onValueChange={onChange}
        enabled={!disabled}
        accessibilityLabel={copy.category}
      >
        <Picker.Item
          label={filter ? copy.allCategories : copy.categoryPrompt}
          value=""
        />
        {listingCategories.map((category) => (
          <Picker.Item
            key={category}
            label={copy.categories[category]}
            value={category}
          />
        ))}
      </Picker>
    </Host>
  );
}
