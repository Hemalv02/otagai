import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, ErrorText, Field } from "@/components/ui";
import {
  authErrorKey,
  codeInput,
  validCode,
  validEmail,
  validNewPassword,
} from "@/lib/email-auth";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { createTemporaryAuthClient, supabase } from "@/lib/supabase";

const actions = {
  login: { title: "signIn", submit: "signIn" },
  signup: { title: "joinOtagai", submit: "createAccount" },
  "confirm-email": { title: "checkEmail", submit: "verifyEmail" },
  "forgot-password": { title: "resetPassword", submit: "sendResetCode" },
  "confirm-recovery": { title: "checkEmail", submit: "verifyResetCode" },
  "new-password": { title: "chooseNewPassword", submit: "savePassword" },
} as const;

type Step = keyof typeof actions;
type Notice =
  | "confirmationResent"
  | "emailVerified"
  | "resetCodeResent"
  | "passwordUpdated";
type Failure = ReturnType<typeof authErrorKey>;
type TemporaryAuthClient = ReturnType<typeof createTemporaryAuthClient>;

function discardTemporaryClient(client: TemporaryAuthClient, signedIn: boolean) {
  const revoke = signedIn
    ? client.auth.signOut({ scope: "local" })
    : Promise.resolve();
  void revoke.finally(() => client.auth.dispose()).catch(() => undefined);
}

export default function SignIn() {
  const localizedType = useLocalizedType();
  const { t, locale } = useOnboardingText();
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const submitting = useRef(false);
  const recovery = useRef<TemporaryAuthClient | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recovery.current) discardTemporaryClient(recovery.current, true);
      recovery.current = null;
    };
  }, []);

  const address = email.trim();
  const enteringCode = step === "confirm-email" || step === "confirm-recovery";
  const enteringEmail =
    step === "login" || step === "signup" || step === "forgot-password";
  const newPassword = step === "signup" || step === "new-password";
  const showPassword = step === "login" || newPassword;
  const passwordsDiffer =
    step === "new-password" && confirmation.length > 0 && password !== confirmation;
  const valid = {
    login: validEmail(address) && Boolean(password),
    signup: validEmail(address) && validNewPassword(password),
    "confirm-email": validCode(code),
    "forgot-password": validEmail(address),
    "confirm-recovery": validCode(code),
    "new-password": validNewPassword(password, confirmation),
  }[step];

  const body = localizedType("body", locale);
  const button = localizedType("button", locale);
  const label = localizedType("field-label", locale);

  function show(next: Step) {
    setStep(next);
    setPassword("");
    setConfirmation("");
    setCode("");
    setNotice(null);
    setError(null);
    if (next !== "new-password" && recovery.current) {
      discardTemporaryClient(recovery.current, true);
      recovery.current = null;
    }
  }

  async function run(action: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch {
      setError("authFailed");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function sendCode(kind: "signup" | "recovery") {
    return kind === "signup"
      ? supabase.auth.resend({ type: "signup", email: address })
      : supabase.auth.resetPasswordForEmail(address);
  }

  function resend(kind: "signup" | "recovery", fromLogin = false) {
    if (submitting.current) return;
    if (fromLogin) show("confirm-email");
    void run(async () => {
      const { error: failure } = await sendCode(kind);
      if (failure) {
        setError(authErrorKey(failure.code));
        return;
      }
      setCode("");
      setNotice(kind === "signup" ? "confirmationResent" : "resetCodeResent");
    });
  }

  function submit() {
    if (!valid) return;
    void run(async () => {
      switch (step) {
        case "login": {
          const { error: failure } = await supabase.auth.signInWithPassword({
            email: address,
            password,
          });
          if (failure) setError(authErrorKey(failure.code));
          return;
        }
        case "signup": {
          const { data, error: failure } = await supabase.auth.signUp({
            email: address,
            password,
          });
          if (failure) setError(authErrorKey(failure.code));
          else if (!data.session) show("confirm-email");
          return;
        }
        case "forgot-password": {
          const { error: failure } = await sendCode("recovery");
          if (failure) setError(authErrorKey(failure.code));
          else show("confirm-recovery");
          return;
        }
        case "confirm-email":
        case "confirm-recovery": {
          const client = createTemporaryAuthClient();
          let signedIn = false;
          try {
            const { data, error: failure } = await client.auth.verifyOtp({
              email: address,
              token: code,
              type: step === "confirm-email" ? "signup" : "recovery",
            });
            signedIn = Boolean(data.session);
            if (!mounted.current) return;
            if (failure || !signedIn) {
              setError(authErrorKey(failure?.code));
              return;
            }
            if (step === "confirm-email") {
              show("login");
              setNotice("emailVerified");
            } else {
              recovery.current = client;
              show("new-password");
            }
          } finally {
            if (recovery.current !== client) {
              discardTemporaryClient(client, signedIn);
            }
          }
          return;
        }
        case "new-password": {
          const client = recovery.current;
          if (!client) {
            show("forgot-password");
            return;
          }
          const { error: failure } = await client.auth.updateUser({ password });
          if (failure) {
            if (failure.status === 401 || failure.code === "session_not_found") {
              show("forgot-password");
              setError("invalidAuthCode");
            } else {
              setError(authErrorKey(failure.code));
            }
            return;
          }
          show("login");
          setNotice("passwordUpdated");
        }
      }
    });
  }

  const detail =
    step === "confirm-email"
      ? t("confirmEmail", { email: address })
      : step === "confirm-recovery"
        ? t("resetEmail", { email: address })
        : step === "forgot-password"
          ? t("resetIntro")
          : null;

  return (
    <OnboardingScreen
      keyboard
      action={
        <OnboardingLink
          label={t("preferences")}
          onPress={() => router.push("/onboarding-preferences")}
          disabled={busy}
        />
      }
    >
      <View className="gap-related-gap">
        <Text
          accessibilityRole="header"
          className="text-ink"
          style={localizedType("screen-title", locale)}
        >
          {t(actions[step].title)}
        </Text>
        {detail ? (
          <Text className="text-secondary" style={body}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View className="gap-card-inset">
        {enteringEmail ? (
          <Field
            label={t("email")}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (error) setError(null);
            }}
            style={body}
            labelStyle={label}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder="you@example.com"
          />
        ) : null}
        {showPassword ? (
          <View className="gap-related-gap">
            <Field
              key={step}
              label={t(step === "new-password" ? "newPassword" : "password")}
              value={password}
              onChangeText={setPassword}
              style={body}
              labelStyle={label}
              secureTextEntry
              textContentType={newPassword ? "newPassword" : "password"}
              autoComplete={newPassword ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              onSubmitEditing={step === "new-password" ? undefined : submit}
            />
            {newPassword ? (
              <Text
                className="text-secondary"
                style={localizedType("supporting", locale)}
              >
                {t("passwordHint")}
              </Text>
            ) : null}
          </View>
        ) : null}
        {step === "new-password" ? (
          <Field
            label={t("confirmPassword")}
            value={confirmation}
            onChangeText={setConfirmation}
            labelStyle={label}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={submit}
          />
        ) : null}
        {enteringCode ? (
          <Field
            label={t("emailCode")}
            value={code}
            onChangeText={(value) => setCode(codeInput(value))}
            labelStyle={label}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            keyboardType="number-pad"
            editable={!busy}
          />
        ) : null}
      </View>
      {error || passwordsDiffer ? (
        <ErrorText>{t(error ?? "passwordMismatch")}</ErrorText>
      ) : null}
      {notice ? (
        <Text accessibilityRole="alert" className="text-action" style={body}>
          {t(notice)}
        </Text>
      ) : null}
      <View className="gap-related-gap">
        <Button
          label={t(actions[step].submit)}
          labelStyle={button}
          onPress={submit}
          busy={busy}
          disabled={!valid}
        />
        {step === "login" ? (
          <>
            {error === "emailUnconfirmed" ? (
              <Button
                variant="text"
                label={t("resendConfirmation")}
                labelStyle={label}
                disabled={busy || !validEmail(address)}
                onPress={() => resend("signup", true)}
              />
            ) : null}
            <Button
              variant="text"
              label={t("forgotPassword")}
              labelStyle={label}
              disabled={busy}
              onPress={() => show("forgot-password")}
            />
            <Button
              variant="text"
              label={t("createAccount")}
              labelStyle={label}
              disabled={busy}
              onPress={() => show("signup")}
            />
          </>
        ) : (
          <>
            {enteringCode ? (
              <Button
                variant="text"
                label={t(
                  step === "confirm-email"
                    ? "resendConfirmation"
                    : "resendResetCode",
                )}
                labelStyle={label}
                disabled={busy}
                onPress={() =>
                  resend(step === "confirm-email" ? "signup" : "recovery")
                }
              />
            ) : null}
            <Button
              variant="text"
              label={t(step === "signup" ? "alreadyHaveAccount" : "backToSignIn")}
              labelStyle={label}
              disabled={busy}
              onPress={() => show("login")}
            />
          </>
        )}
      </View>
    </OnboardingScreen>
  );
}
