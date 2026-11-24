import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

import { request, type Language } from "@/lib/api";
import { requestNotificationId } from "@/lib/request-ripple";

const channelId = "requests";
const projectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
  Constants.easConfig?.projectId ??
  Constants.expoConfig?.extra?.eas?.projectId;
const native = Platform.OS === "ios" || Platform.OS === "android";
export const supportsDevicePush = Boolean(
  native &&
    projectId &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient,
);

const keyFor = (userId: string) => `otagai.push-registration.${userId}`;
type Notifications = typeof import("expo-notifications");

let registrationWork: Promise<unknown> = Promise.resolve();

function queue<T>(work: () => Promise<T>): Promise<T> {
  const next = registrationWork.then(work, work);
  registrationWork = next;
  return next;
}

function allowed(
  permission: Awaited<ReturnType<Notifications["getPermissionsAsync"]>>,
  api: Notifications,
) {
  return (
    permission.granted ||
    permission.ios?.status === api.IosAuthorizationStatus.PROVISIONAL
  );
}

export function getDeviceRegistration(userId: string) {
  return AsyncStorage.getItem(keyFor(userId));
}

export function clearDeviceRegistration(userId: string) {
  return queue(() => AsyncStorage.removeItem(keyFor(userId)));
}

export function removeDeviceRegistration(userId: string) {
  return queue(async () => {
    const id = await getDeviceRegistration(userId);
    if (!id) return;
    await request<void>(`/users/me/push-tokens/${id}`, {
      method: "DELETE",
      authUserId: userId,
    });
    await AsyncStorage.removeItem(keyFor(userId));
  });
}

export function registerDevice(
  userId: string,
  interactive: boolean,
  channelName: string,
) {
  return queue(async () => {
    if (!supportsDevicePush || !projectId) return "unavailable";
    const api = await import("expo-notifications");
    if (Platform.OS === "android") {
      await api.setNotificationChannelAsync(channelId, {
        name: channelName,
        importance: api.AndroidImportance.DEFAULT,
      });
    }
    let permission = await api.getPermissionsAsync();
    if (!allowed(permission, api) && permission.canAskAgain && interactive) {
      permission = await api.requestPermissionsAsync();
    }
    if (!allowed(permission, api)) return "denied";
    const token = await api.getExpoPushTokenAsync({ projectId });
    const { id } = await request<{ id: string }>("/users/me/push-tokens", {
      authUserId: userId,
      method: "POST",
      body: JSON.stringify({ expo_token: token.data, platform: Platform.OS }),
    });
    const previous = await getDeviceRegistration(userId);
    await AsyncStorage.setItem(keyFor(userId), id);
    if (previous && previous !== id) {
      await request<void>(`/users/me/push-tokens/${previous}`, {
        method: "DELETE",
        authUserId: userId,
      });
    }
    return "registered";
  });
}

export async function listenForRequestNotification(open: (id: string) => void) {
  if (!supportsDevicePush) return;
  const api = await import("expo-notifications");
  const respond = (
    response: import("expo-notifications").NotificationResponse,
  ) => {
    if (response.actionIdentifier !== api.DEFAULT_ACTION_IDENTIFIER) return;
    const data = response.notification.request.content.data;
    const id = requestNotificationId(data?.type, data?.request_id);
    if (id) open(id);
    api.clearLastNotificationResponse();
  };
  const subscription = api.addNotificationResponseReceivedListener(respond);
  const initial = api.getLastNotificationResponse();
  if (initial) respond(initial);
  return () => subscription.remove();
}

export const devicePushCopy: Record<
  Language,
  {
    title: string;
    enable: string;
    disable: string;
    enabled: string;
    unavailable: string;
    denied: string;
    failed: string;
    channel: string;
  }
> = {
  en: {
    title: "Request alerts on this device",
    enable: "Enable device alerts",
    disable: "Disable device alerts",
    enabled: "This device can receive request alerts.",
    unavailable:
      "Request alerts are available in the installed Otagai app. You can still check your inbox here.",
    denied:
      "Allow notifications for Otagai in your device settings and try again.",
    failed: "Couldn’t update alerts for this device. Try again.",
    channel: "Neighbour requests",
  },
  ja: {
    title: "この端末の依頼通知",
    enable: "端末の通知を有効にする",
    disable: "端末の通知を無効にする",
    enabled: "この端末で依頼の通知を受け取れます。",
    unavailable:
      "端末通知はインストールしたOtagaiアプリで利用できます。ここでも受信箱を確認できます。",
    denied: "端末の設定でOtagaiの通知を許可してからお試しください。",
    failed: "端末の通知を更新できませんでした。もう一度お試しください。",
    channel: "近所からの依頼",
  },
  bn: {
    title: "এই ডিভাইসে অনুরোধের বার্তা",
    enable: "ডিভাইসের বার্তা চালু করুন",
    disable: "ডিভাইসের বার্তা বন্ধ করুন",
    enabled: "এই ডিভাইসে অনুরোধের বার্তা আসবে।",
    unavailable:
      "ইনস্টল করা Otagai অ্যাপে ডিভাইসের বার্তা পাওয়া যাবে। এখানে ইনবক্স দেখতে পারবেন।",
    denied: "ডিভাইস সেটিংসে Otagai-এর বিজ্ঞপ্তি চালু করে আবার চেষ্টা করুন।",
    failed: "ডিভাইসের বিজ্ঞপ্তি বদলানো যায়নি। আবার চেষ্টা করুন।",
    channel: "প্রতিবেশীর অনুরোধ",
  },
};
