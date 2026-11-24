import { router } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, ErrorText, Field } from "@/components/ui";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { supabase } from "@/lib/supabase";

function errorKey(code: string | undefined) {
  switch (code) {
    case "email_address_invalid":
      return "invalidEmail";
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailUnconfirmed";
    case "weak_password":
      return "weakPassword";
    case "user_already_exists":
    case "email_exists":
      return "accountExists";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "authRateLimited";
    default:
      return "authFailed";
  }
}

export default function SignIn() {
  const localizedType = useLocalizedType();
  const { t, locale } = useOnboardingText();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof errorKey> | null>(null);
  const submitting = useRef(false);

  const address = email.trim();
  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) &&
    password.length >= (register ? 8 : 1);
  const body = localizedType("body", locale);
  const button = localizedType("button", locale);
  const label = localizedType("field-label", locale);

  function switchForm(next: boolean) {
    if (submitting.current) return;
    setRegister(next);
    setConfirmation(null);
    setResendSent(false);
    setError(null);
    setPassword("");
  }

  async function submit() {
    if (!valid || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const credentials = { email: address, password };
      const { data, error: failure } = register
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
      if (failure) {
        setError(errorKey(failure.code));
        return;
      }
      setPassword("");
      if (register && !data.session) setConfirmation(address);
    } catch {
      setError("authFailed");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (!confirmation || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setResendSent(false);
    try {
      const { error: failure } = await supabase.auth.resend({
        type: "signup",
        email: confirmation,
      });
      if (failure) setError(errorKey(failure.code));
      else setResendSent(true);
    } catch {
      setError("authFailed");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

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
          {t(confirmation ? "checkEmail" : register ? "joinOtagai" : "signIn")}
        </Text>
        {confirmation ? (
          <Text className="text-secondary" style={body}>
            {t("confirmEmail", { email: confirmation })}
          </Text>
        ) : null}
      </View>
      {confirmation ? (
        resendSent ? (
          <Text accessibilityRole="alert" className="text-action" style={body}>
            {t("confirmationResent")}
          </Text>
        ) : null
      ) : (
        <View className="gap-card-inset">
          <Field
            label={t("email")}
            value={email}
            onChangeText={setEmail}
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
          <View className="gap-related-gap">
            <Field
              key={register ? "new-password" : "password"}
              label={t("password")}
              value={password}
              onChangeText={setPassword}
              style={body}
              labelStyle={label}
              secureTextEntry
              textContentType={register ? "newPassword" : "password"}
              autoComplete={register ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            {register ? (
              <Text
                className="text-secondary"
                style={localizedType("supporting", locale)}
              >
                {t("passwordHint")}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      {error ? <ErrorText>{t(error)}</ErrorText> : null}
      <View className="gap-related-gap">
        {confirmation ? (
          <>
            <Button
              label={t("backToSignIn")}
              labelStyle={button}
              disabled={busy}
              onPress={() => switchForm(false)}
            />
            <Button
              variant="text"
              label={t("resendConfirmation")}
              labelStyle={label}
              disabled={busy}
              onPress={resend}
            />
          </>
        ) : (
          <>
            <Button
              label={t(register ? "createAccount" : "signIn")}
              labelStyle={button}
              onPress={submit}
              busy={busy}
              disabled={!valid}
            />
            <Button
              variant="text"
              label={t(register ? "alreadyHaveAccount" : "createAccount")}
              labelStyle={label}
              onPress={() => switchForm(!register)}
              disabled={busy}
            />
          </>
        )}
      </View>
    </OnboardingScreen>
  );
}
