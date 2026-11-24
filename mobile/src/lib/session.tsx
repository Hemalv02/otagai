import type { Session } from "@supabase/supabase-js";
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

import { ApiError, api, type UserProfile } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  clearDeviceRegistration,
  removeDeviceRegistration,
} from "@/lib/device-push";

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
  deleteAccount: () => Promise<void>;
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
  const activeUserId = useRef<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      activeUserId.current = next?.user.id ?? null;
      setSession(next);
      setIsLoading(false);
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
    if (userId) await removeDeviceRegistration(userId).catch(() => undefined);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn("Could not sign out cleanly.", error.message);
    }
  }, [userId]);

  const deleteAccount = useCallback(async () => {
    if (!userId) throw new ApiError(401, "Sign in again to continue.");
    await api.deleteMyProfile({ authUserId: userId });
    void clearDeviceRegistration(userId).catch((error: unknown) => {
      console.warn("Could not clear this device's push registration.", error);
    });
    if (activeUserId.current !== userId) return;
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) console.warn("Could not revoke the session.", error.message);
    } catch (error) {
      console.warn(
        "Could not finish signing out after account deletion.",
        error,
      );
    } finally {
      setEntry((current) => (current?.userId === userId ? null : current));
      if (activeUserId.current === userId) {
        activeUserId.current = null;
        setSession(null);
      }
    }
  }, [userId]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading,
      profile,
      setProfile,
      reloadProfile,
      signOut,
      deleteAccount,
    }),
    [
      session,
      isLoading,
      profile,
      setProfile,
      reloadProfile,
      signOut,
      deleteAccount,
    ],
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
