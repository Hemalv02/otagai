# Request push notifications

The API delivers request inbox entries and records the sender’s delivery receipt without EAS. A separate dispatcher sends an optional device alert for each eligible registered device. It checks the recipient’s push preference, quiet hours, and eligibility before sending.

## Device setup

1. Link the mobile app to the Otagai EAS project. Configure the iOS bundle identifier and Android application ID for the app’s Apple and Google projects.
2. Configure APNs for iOS and FCM v1 for Android in EAS. The mobile app already includes the Expo Notifications config plugin and creates the Android channel named `requests`.
3. Build and install the app. The project ID comes from the linked app configuration or `EXPO_PUBLIC_EAS_PROJECT_ID`. Enable device alerts in Otagai’s Notification Preferences. The Expo Go build continues to provide the inbox.
4. Apply backend migrations with `docker compose run --rm backend alembic upgrade head`. Start the workers with `docker compose up -d --build ripple-scheduler push-dispatch`. If push security is enabled for the EAS project, set `EXPO_ACCESS_TOKEN` in the backend environment. Keep the token in backend configuration.

## Device verification to run after setup

- Use a sender and a second verified account with a registered device. Post a request that reaches the second account’s inbox and check the alert on the locked phone. Tapping it should open the request on that account.
- Repeat on iOS and Android. Save quiet hours that cover the test time, post again, and confirm the inbox updates immediately. Then check that the device alert is delivered when quiet hours end, provided that the request is still open.
- Repeat with a matched or cancelled request during quiet hours. The queued alert should be dropped.
- Verify `notifications.pushed_at` after Expo returns a successful receipt. This confirms provider acceptance. Confirm display and routing on the device itself.
