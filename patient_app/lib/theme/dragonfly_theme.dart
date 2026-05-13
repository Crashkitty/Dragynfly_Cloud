import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'tokens.dart';

/// Builds a Material [ThemeData] from Dragonfly tokens.
///
/// Typography uses Inter via google_fonts. Sizes are deliberately larger than
/// Material defaults — the audience is elderly diabetes patients.
ThemeData buildDragonflyTheme() {
  final base = ThemeData.light(useMaterial3: true);

  final colorScheme = const ColorScheme(
    brightness: Brightness.light,
    primary: DragonflyTokens.primary,
    onPrimary: DragonflyTokens.onPrimary,
    primaryContainer: DragonflyTokens.primaryContainer,
    onPrimaryContainer: DragonflyTokens.onPrimaryContainer,
    secondary: DragonflyTokens.secondary,
    onSecondary: DragonflyTokens.onSecondary,
    tertiary: DragonflyTokens.tertiary,
    onTertiary: DragonflyTokens.onTertiary,
    error: DragonflyTokens.error,
    onError: DragonflyTokens.onError,
    surface: DragonflyTokens.surface,
    onSurface: DragonflyTokens.onSurface,
    outline: DragonflyTokens.outline,
  );

  final inter = GoogleFonts.interTextTheme(base.textTheme);

  final textTheme = inter.copyWith(
    displayLarge: inter.displayLarge?.copyWith(
      fontSize: 40,
      fontWeight: FontWeight.w700,
      height: 1.15,
      letterSpacing: -0.4,
      color: DragonflyTokens.onNeutral,
    ),
    headlineLarge: inter.headlineLarge?.copyWith(
      fontSize: 32,
      fontWeight: FontWeight.w700,
      height: 1.2,
      color: DragonflyTokens.onNeutral,
    ),
    headlineMedium: inter.headlineMedium?.copyWith(
      fontSize: 26,
      fontWeight: FontWeight.w600,
      height: 1.25,
      color: DragonflyTokens.onNeutral,
    ),
    headlineSmall: inter.headlineSmall?.copyWith(
      fontSize: 22,
      fontWeight: FontWeight.w600,
      height: 1.3,
      color: DragonflyTokens.onNeutral,
    ),
    bodyLarge: inter.bodyLarge?.copyWith(
      fontSize: 20,
      fontWeight: FontWeight.w400,
      height: 1.5,
      color: DragonflyTokens.onSurface,
    ),
    bodyMedium: inter.bodyMedium?.copyWith(
      fontSize: 18,
      fontWeight: FontWeight.w400,
      height: 1.5,
      color: DragonflyTokens.onSurface,
    ),
    labelLarge: inter.labelLarge?.copyWith(
      fontSize: 20,
      fontWeight: FontWeight.w600,
      height: 1.2,
      letterSpacing: 0.2,
      color: DragonflyTokens.onTertiary,
    ),
    labelMedium: inter.labelMedium?.copyWith(
      fontSize: 16,
      fontWeight: FontWeight.w500,
      height: 1.4,
      color: DragonflyTokens.onSurface,
    ),
  );

  return base.copyWith(
    colorScheme: colorScheme,
    scaffoldBackgroundColor: DragonflyTokens.neutral,
    canvasColor: DragonflyTokens.neutral,
    textTheme: textTheme,
    appBarTheme: AppBarTheme(
      backgroundColor: DragonflyTokens.neutral,
      foregroundColor: DragonflyTokens.onNeutral,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      toolbarHeight: DragonflyTokens.appBarHeight,
      titleTextStyle: textTheme.headlineMedium,
    ),
    cardTheme: CardThemeData(
      color: DragonflyTokens.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(DragonflyTokens.roundLg),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: DragonflyTokens.tertiary,
        foregroundColor: DragonflyTokens.onTertiary,
        textStyle: textTheme.labelLarge,
        minimumSize: const Size.fromHeight(DragonflyTokens.minTapTarget),
        padding: const EdgeInsets.symmetric(
          horizontal: DragonflyTokens.spaceLg,
          vertical: DragonflyTokens.spaceMd,
        ),
        shape: const StadiumBorder(),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: DragonflyTokens.primary,
        textStyle: textTheme.labelLarge?.copyWith(
          color: DragonflyTokens.primary,
        ),
        minimumSize: const Size.fromHeight(DragonflyTokens.minTapTarget),
        side: const BorderSide(color: DragonflyTokens.outline, width: 1.5),
        shape: const StadiumBorder(),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: DragonflyTokens.primary,
        textStyle: textTheme.labelLarge?.copyWith(
          color: DragonflyTokens.primary,
        ),
        minimumSize: const Size.fromHeight(DragonflyTokens.minTapTarget),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: DragonflyTokens.surface,
      hintStyle: textTheme.bodyLarge?.copyWith(color: DragonflyTokens.outline),
      labelStyle: textTheme.labelMedium?.copyWith(
        color: DragonflyTokens.secondary,
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: DragonflyTokens.spaceMd,
        vertical: DragonflyTokens.spaceLg,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(DragonflyTokens.roundMd),
        borderSide: const BorderSide(color: DragonflyTokens.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(DragonflyTokens.roundMd),
        borderSide: const BorderSide(color: DragonflyTokens.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(DragonflyTokens.roundMd),
        borderSide: const BorderSide(
          color: DragonflyTokens.primary,
          width: 2,
        ),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: DragonflyTokens.outline,
      thickness: 1,
      space: DragonflyTokens.spaceLg,
    ),
  );
}
