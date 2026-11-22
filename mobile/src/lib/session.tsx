import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ApiError, api, type UserProfile } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type ProfileState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; profile: UserProfile }
  | { status: "error"; message: string };

type ProfileEntry = { userId: string; state: ProfileState };

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
  profile: ProfileState;
  setProfile: (profile: UserProfile) => void;
  reloadProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const loading: ProfileState = { status: "loading" };

async function fetchProfile(): Promise<ProfileState> {
  try {
    return { status: "ready", profile: await api.getMyProfile() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { status: "missing" };
    }
    if (error instanceof ApiError && error.status === 401) {
      await supabase.auth.signOut();
      return loading;
    }
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not load profile.",
    };
  }
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [entry, setEntry] = useState<ProfileEntry | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn("Could not restore the session.", error.message);
        }
        setSession(data.session);
      })
      .finally(() => setIsLoading(false));

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) {
      return;
    }
    let active = true;
    fetchProfile().then((state) => {
      if (active) {
        setEntry({ userId, state });
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const profile = userId && entry?.userId === userId ? entry.state : loading;

  const reloadProfile = useCallback(async () => {
    if (!userId) {
      return;
    }
    setEntry({ userId, state: loading });
    setEntry({ userId, state: await fetchProfile() });
  }, [userId]);

  const setProfile = useCallback(
    (next: UserProfile) => {
      if (userId) {
        setEntry({ userId, state: { status: "ready", profile: next } });
      }
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn("Could not sign out cleanly.", error.message);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading,
      profile,
      setProfile,
      reloadProfile,
      signOut,
    }),
    [session, isLoading, profile, setProfile, reloadProfile, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider.");
  }
  return value;
}
