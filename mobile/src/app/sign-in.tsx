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
import { supabase } from "@/lib/supabase";

type Method = "phone" | "email";
type Country = "+81" | "+880";

const methods = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
] as const;

const countries = [
  { value: "+81", label: "Japan +81" },
  { value: "+880", label: "Bangladesh +880" },
] as const;

function toE164(country: Country, local: string) {
  const digits = local.replace(/\D/g, "").replace(/^0+/, "");
  return `${country}${digits}`;
}

export default function SignIn() {
  const [method, setMethod] = useState<Method>("phone");
  const [country, setCountry] = useState<Country>("+81");
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
          <Text className="type-wordmark text-action">Otagai</Text>
          <Text className="type-screen-title text-ink">Sign in</Text>

          {sentTo ? (
            <View className="gap-card-inset">
              <Text className="type-body text-secondary">
                We sent a 6-digit code to {sentTo}.
              </Text>
              <Field
                label="Code"
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
                label="Sign in"
                onPress={verifyCode}
                busy={busy}
                disabled={code.length !== 6}
              />
              <Button
                label="Use a different number or email"
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
                    value={country}
                    onChange={setCountry}
                  />
                  <Field
                    label="Phone number"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    placeholder="090 1234 5678"
                  />
                </>
              ) : (
                <Field
                  label="Email"
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
                label="Send code"
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
