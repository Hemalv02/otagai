import type { UpdateMyProfile, UserProfile } from "./api";

type ProfileText = Pick<
  UserProfile,
  "display_name" | "intro" | "happy_to_help_with"
>;

export function buildProfilePatch(
  profile: ProfileText,
  draft: { displayName: string; intro: string; helpWith: string },
): UpdateMyProfile {
  const patch: UpdateMyProfile = {};
  const name = draft.displayName.trim();
  const intro = draft.intro.trim() || null;
  const help = draft.helpWith.trim() || null;
  if (
    draft.displayName !== profile.display_name &&
    name !== profile.display_name
  ) {
    patch.display_name = name;
  }
  if (draft.intro !== (profile.intro ?? "") && intro !== profile.intro) {
    patch.intro = intro;
  }
  if (
    draft.helpWith !== (profile.happy_to_help_with ?? "") &&
    help !== profile.happy_to_help_with
  ) {
    patch.happy_to_help_with = help;
  }
  return patch;
}

export function textSizeOptions(current: number) {
  return [...new Set([100, 125, 150, current])].sort((a, b) => a - b);
}
