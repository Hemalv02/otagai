import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { useOnboarding } from "@/lib/onboarding";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { supabase } from "@/lib/supabase";

type Method = "phone" | "email";
type Country = "+81" | "+880";

function toE164(country: Country, local: string) {
  const digits = local.replace(/\D/g, "").replace(/^0+/, "");
  return `${country}${digits}`;
}

export default function SignIn() {
  const { state } = useOnboarding();
  const { t, locale } = useOnboardingText();
  const bodyStyle = localizedType("body", locale);
  const buttonStyle = localizedType("button", locale);
  const methods = [
    { value: "phone", label: t("phone") },
    { value: "email", label: t("email") },
  ] as const;
  const countries = [
    { value: "+81", label: t("japanCode") },
    { value: "+880", label: t("bangladeshCode") },
  ] as const;
  const [method, setMethod] = useState<Method>("phone");
  const [countryOverride, setCountry] = useState<Country | null>(null);
  const country = countryOverride ?? (state.region === "bd" ? "+880" : "+81");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = method === "phone" ? toE164(country, phone) : email.trim();
  const targetValid =
    method === "phone"
      ? /^\+[1-9]\d{8,14}$/.test(target)
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error: sendError } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({ phone: target })
        : await supabase.auth.signInWithOtp({
            email: target,
            options: { shouldCreateUser: true },
          });
    setBusy(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setCode("");
    setSentTo(target);
  }

  async function verifyCode() {
    if (!sentTo) {
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } =
      method === "phone"
        ? await supabase.auth.verifyOtp({
            phone: sentTo,
            token: code,
            type: "sms",
          })
        : await supabase.auth.verifyOtp({
            email: sentTo,
            token: code,
            type: "email",
          });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="gap-card-inset px-screen-gutter py-card-inset"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row flex-wrap items-center justify-between gap-related-gap">
            <Text className="type-wordmark text-action">Otagai</Text>
            <Button
              label={t("preferences")}
              variant="secondary"
              labelStyle={buttonStyle}
              onPress={() => router.push("/onboarding-preferences")}
            />
          </View>
          <Text
            className="type-screen-title text-ink"
            accessibilityRole="header"
            style={localizedType("screen-title", locale)}
          >
            {t("signIn")}
          </Text>

          {sentTo ? (
            <View className="gap-card-inset">
              <Text className="type-body text-secondary" style={bodyStyle}>
                {t("codeSent", { target: sentTo })}
              </Text>
              <Field
                label={t("code")}
                style={bodyStyle}
                labelStyle={bodyStyle}
                value={code}
                onChangeText={(value) =>
                  setCode(value.replace(/\D/g, "").slice(0, 6))
                }
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
              />
              <ErrorText>{error}</ErrorText>
              <Button
                label={t("signIn")}
                labelStyle={buttonStyle}
                onPress={verifyCode}
                busy={busy}
                disabled={code.length !== 6}
              />
              <Button
                label={t("changeTarget")}
                labelStyle={buttonStyle}
                variant="secondary"
                onPress={() => {
                  setSentTo(null);
                  setError(null);
                }}
              />
            </View>
          ) : (
            <View className="gap-card-inset">
              <Choice
                options={methods}
                labelStyle={() => bodyStyle}
                value={method}
                onChange={(value) => {
                  setMethod(value);
                  setError(null);
                }}
              />
              {method === "phone" ? (
                <>
                  <Choice
                    options={countries}
                    labelStyle={() => bodyStyle}
                    value={country}
                    onChange={setCountry}
                  />
                  <Field
                    label={t("phoneNumber")}
                    style={bodyStyle}
                    labelStyle={bodyStyle}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    placeholder={
                      country === "+880" ? "01712 345678" : "090 1234 5678"
                    }
                  />
                </>
              ) : (
                <Field
                  label={t("email")}
                  style={bodyStyle}
                  labelStyle={bodyStyle}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="you@example.com"
                />
              )}
              <ErrorText>{error}</ErrorText>
              <Button
                label={t("sendCode")}
                labelStyle={buttonStyle}
                onPress={sendCode}
                busy={busy}
                disabled={!targetValid}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
