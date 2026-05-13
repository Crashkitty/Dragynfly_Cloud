import 'package:flutter/material.dart';

/// Dragonfly design tokens.
///
/// Sourced from /design/DESIGN.md. Do not edit values here without updating
/// the DESIGN.md spec — the spec is the source of truth, this file is a
/// hand-translated mirror so the Flutter side has type-safe constants.
class DragonflyTokens {
  DragonflyTokens._();

  // Colors
  static const Color primary = Color(0xFF0E5A6F);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primaryContainer = Color(0xFFC7E8EE);
  static const Color onPrimaryContainer = Color(0xFF002731);
  static const Color secondary = Color(0xFF4A5C66);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color tertiary = Color(0xFF9E4A1F);
  static const Color tertiaryPressed = Color(0xFF7D3815);
  static const Color onTertiary = Color(0xFFFFFFFF);
  static const Color neutral = Color(0xFFFAF7F2);
  static const Color onNeutral = Color(0xFF1A1F22);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color onSurface = Color(0xFF1A1F22);
  static const Color outline = Color(0xFFB5BDC2);
  static const Color success = Color(0xFF2E6B47);
  static const Color onSuccess = Color(0xFFFFFFFF);
  static const Color warning = Color(0xFF8F5215);
  static const Color onWarning = Color(0xFFFFFFFF);
  static const Color error = Color(0xFFB23121);
  static const Color onError = Color(0xFFFFFFFF);

  // Spacing (4-base)
  static const double spaceXs = 4;
  static const double spaceSm = 8;
  static const double spaceMd = 16;
  static const double spaceLg = 24;
  static const double spaceXl = 32;
  static const double space2xl = 48;
  static const double space3xl = 64;

  // Rounded
  static const double roundSm = 8;
  static const double roundMd = 12;
  static const double roundLg = 20;
  static const double roundXl = 28;
  static const double roundFull = 9999;

  // Sizes
  static const double minTapTarget = 64;
  static const double appBarHeight = 72;
  static const double bottomNavHeight = 88;
}
