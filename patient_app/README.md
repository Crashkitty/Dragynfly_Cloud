# Dragonfly — Patient App

Flutter app for elderly diabetes-pilot participants. Five screens (Login,
Dashboard, Food Diary, Telemedicine placeholder, Profile) plus a bottom-nav
shell.

This folder should now be treated as a **prototype/reference implementation**.
The target production stack is moving to MERN with React-based patient and
provider surfaces and Node/Express services behind Cloudflare controls.

## Structure

```
patient_app/
  pubspec.yaml
  analysis_options.yaml
  lib/
    main.dart, app.dart
    theme/        — DESIGN.md → ThemeData
    routing/      — go_router config
    models/       — Participant, GlucoseReading, MealEntry
    services/     — AuthService, GlucoseService, BastClient
    screens/      — login, dashboard, food_diary, telemedicine, profile, shell
    widgets/      — DragonflyCard, GlucosePill, SectionLabel
```

## First-time setup

Flutter is not bundled. Once Flutter is installed (`flutter --version`),
from this directory:

```bash
# 1. Fill in iOS/Android/web/desktop platform shells. Flutter merges with
#    existing pubspec.yaml and lib/, so this is non-destructive.
flutter create .

# 2. Resolve dependencies
flutter pub get

# 3. Run on a connected device or simulator
flutter run
```

## Platform permissions to add after `flutter create .`

### iOS — `ios/Runner/Info.plist`

```xml
<key>NSCameraUsageDescription</key>
<string>Dragonfly uses your camera to take photos of your meals for the study.</string>
<key>NSFaceIDUsageDescription</key>
<string>Dragonfly uses Face ID to confirm it is you.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Dragonfly can attach photos of your meals.</string>
```

### Android — `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
```

Also set `MainActivity` to extend `FlutterFragmentActivity` for `local_auth`:

```kotlin
import io.flutter.embedding.android.FlutterFragmentActivity
class MainActivity: FlutterFragmentActivity()
```

## What the MVP does

- **Login**: 6-digit participant ID + first name. No password, no email, no
  SMS. Identity verified in person at study enrollment; the device is
  trusted after.
- **Dashboard**: latest glucose reading + 24h chart (simulated CGM plus
  logged readings via `GlucoseService`), today's summary (via `BastClient`),
  and quick actions for logging glucose, meals, and care-team contact.
- **Blood sugar logging**: manual meter or lancet entry with timestamp,
  reading context, optional notes, and optional photo evidence.
- **Food diary**: take a photo, type a description, optional carb count,
  save. Recent meals listed below.
- **Telemedicine**: placeholder — "Request a call" button. Real WebRTC
  integration is V2.
- **Profile**: name, enrollment date, sign out.

## What it does *not* do yet

- HIPAA-grade hardening (deferred per project decision)
- Real BAST AI integration (`BastClient` is in-memory)
- Real CGM import (Libre / HealthKit / Health Connect — V1.5)
- Video calling (V2)
- Food photo nutrient analysis (V2)
- Chinese localization (V1.5 — Simplified + Traditional planned)
- RFID-triggered session start at the clinic (future)

## Design source of truth

`/design/DESIGN.md` (sibling folder). The Flutter theme in
`lib/theme/tokens.dart` is a hand-translated mirror — when DESIGN.md
changes, update tokens.dart in the same commit.

```bash
# Lint the design system
cd ../design
npx @google/design.md lint DESIGN.md
```
