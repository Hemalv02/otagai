# Request push notifications

The API delivers request inbox entries and records the sender’s delivery receipt without EAS. A separate dispatcher sends an optional device alert for each eligible registered device. It checks the recipient’s push preference, quiet hours, and eligibility before sending.

The Android app uses package `com.hemalv02.otagai` in [Firebase project `otagai-ec3af`](https://console.firebase.google.com/project/otagai-ec3af/overview) and is linked to [Expo project `@hemalllll/otagai`](https://expo.dev/accounts/hemalllll/projects/otagai). The Android client configuration is at `mobile/google-services.json`.

## Link the preview build

From `mobile/`, sign in with `pnpm dlx eas-cli@latest login`. If Otagai already has an Expo project, link its project ID with `pnpm dlx eas-cli@latest init --id <project-id>`. For a new project, run `pnpm dlx eas-cli@latest init` and select the team that will own it. Use `pnpm dlx eas-cli@latest project:info` to verify the linked project. Set `ios.bundleIdentifier` and `android.package` in `mobile/app.json` to the app identifiers registered with Apple and Firebase. Expo Notifications uses the linked EAS project ID at runtime. [EAS CLI reference](https://docs.expo.dev/eas/cli/)

The `preview` build profile produces installable internal builds. In the EAS project’s Preview environment, set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_KEY` for the test deployment. Use a backend URL the phones can reach, such as a staging HTTPS URL. A loopback address points to the phone itself. Use the Supabase publishable key. [Expo environment variables](https://docs.expo.dev/eas/environment-variables/)

## Configure providers and build

- **iOS** requires an Apple Developer team with permission to configure APNs and signing. Register the test iPhone with `pnpm dlx eas-cli@latest device:create`. Configure or reuse the APNs key with `pnpm dlx eas-cli@latest credentials --platform ios`, then run `pnpm dlx eas-cli@latest build --platform ios --profile preview`. [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) · [iOS internal distribution](https://docs.expo.dev/build/internal-distribution/)
- **Android** already has its FCM v1 credential assigned in EAS. Run `pnpm dlx eas-cli@latest build --platform android --profile preview` to build the installable APK. The app creates the Android channel named `requests`. Use EAS Credentials if the FCM service account key ever needs replacement. [FCM v1 setup](https://docs.expo.dev/push-notifications/fcm-credentials/)

Install the preview build and enable device alerts under **Settings → Notification preferences**. Apply backend migrations on the test deployment with `docker compose run --rm backend alembic upgrade head` and start the workers with `docker compose up -d --build ripple-scheduler push-dispatch`. If push security is enabled for the EAS project, set `EXPO_ACCESS_TOKEN` in the backend environment.

## Device verification to run after setup

- Use a sender and a second verified account with a registered device. Post a request that reaches the second account’s inbox and check the alert on the locked phone. Tapping it should open the request on that account.
- Repeat on iOS and Android. Save quiet hours that cover the test time, post again, and confirm the inbox updates immediately. Then check that the device alert is delivered when quiet hours end, provided that the request is still open.
- Repeat with a matched or cancelled request during quiet hours. The queued alert should be dropped.
- Verify `notifications.pushed_at` after Expo returns a successful receipt. This confirms provider acceptance. Confirm display and routing on the device itself.
