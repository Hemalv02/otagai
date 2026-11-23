import type { CircleMembership, Language, Region } from "./api";

export type OnboardingPreferences = {
  language: Language;
  region: Region;
};

type OnboardingStep = 1 | 2 | 3;
export type OnboardingState = OnboardingPreferences & {
  step: OnboardingStep;
  completed: boolean;
};

export const defaultOnboarding: OnboardingState = {
  language: "en",
  region: "jp",
  step: 1,
  completed: false,
};

export function readOnboarding(raw: string | null): OnboardingState {
  if (raw === null) return defaultOnboarding;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaultOnboarding;
    }
    const { language, region, completed, step } = value as Partial<
      Record<keyof OnboardingState, unknown>
    >;
    const restoredStep = step === 2 || step === 3 ? step : 1;
    return {
      language:
        language === "en" || language === "ja" || language === "bn"
          ? language
          : defaultOnboarding.language,
      region:
        region === "jp" || region === "bd" ? region : defaultOnboarding.region,
      step: restoredStep,
      completed: completed === true && restoredStep === 3,
    };
  } catch {
    return defaultOnboarding;
  }
}

export function advanceOnboarding(
  state: OnboardingState,
  from: 1 | 2,
): OnboardingState {
  if (state.step < from)
    throw new Error("Onboarding steps must be completed in order.");
  const nextStep = from === 1 ? 2 : 3;
  return state.step >= nextStep ? state : { ...state, step: nextStep };
}

export function finishOnboarding(state: OnboardingState): OnboardingState {
  if (state.step !== 3)
    throw new Error("Visit the final onboarding screen before continuing.");
  return { ...state, completed: true };
}

export function getLaunchRoute({
  signedIn,
  needsProfile,
  needsCircle = false,
  completed,
}: {
  signedIn: boolean;
  needsProfile: boolean;
  needsCircle?: boolean;
  completed: boolean;
}) {
  if (signedIn && needsProfile) return "profile-setup";
  if (signedIn && needsCircle) return "find-circle";
  if (signedIn) return "index";
  return completed ? "sign-in" : "welcome";
}

export function getCircleAccess(
  statuses: readonly CircleMembership["status"][],
) {
  if (statuses.includes("approved")) return "approved";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("rejected") || statuses.includes("removed"))
    return "rejected";
  return "none";
}
