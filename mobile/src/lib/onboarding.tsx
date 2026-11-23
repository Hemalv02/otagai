import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  advanceOnboarding,
  defaultOnboarding,
  finishOnboarding,
  type OnboardingPreferences,
  type OnboardingState,
  readOnboarding,
} from "@/lib/onboarding-state";

const storageKey = "otagai.onboarding.v1";
type OnboardingContextValue = {
  state: OnboardingState;
  ready: boolean;
  saving: boolean;
  savePreferences: (preferences: OnboardingPreferences) => Promise<void>;
  advance: (from: 1 | 2) => Promise<void>;
  complete: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(defaultOnboarding);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const saved = readOnboarding(await AsyncStorage.getItem(storageKey));
        if (active) setState(saved);
      } catch (error) {
        console.warn("Could not restore onboarding preferences.", error);
      } finally {
        if (active) setReady(true);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (next: OnboardingState) => {
    if (writing.current) return;
    writing.current = true;
    setSaving(true);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      setState(next);
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }, []);

  const savePreferences = useCallback(
    (preferences: OnboardingPreferences) =>
      persist({ ...state, ...preferences }),
    [persist, state],
  );
  const advance = useCallback(
    async (from: 1 | 2) => {
      const next = advanceOnboarding(state, from);
      if (next !== state) await persist(next);
    },
    [persist, state],
  );
  const complete = useCallback(
    async () => persist(finishOnboarding(state)),
    [persist, state],
  );
  const value = useMemo(
    () => ({ state, ready, saving, savePreferences, advance, complete }),
    [state, ready, saving, savePreferences, advance, complete],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value)
    throw new Error("useOnboarding must be used inside OnboardingProvider.");
  return value;
}
