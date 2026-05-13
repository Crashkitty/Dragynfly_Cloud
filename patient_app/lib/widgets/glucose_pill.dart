import 'package:flutter/material.dart';

import '../models/glucose_reading.dart';
import '../theme/tokens.dart';

class GlucosePill extends StatelessWidget {
  final GlucoseStatus status;
  final String label;

  const GlucosePill({super.key, required this.status, required this.label});

  factory GlucosePill.from(GlucoseReading reading) =>
      GlucosePill(status: reading.status, label: reading.statusLabel);

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _palette(status);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: DragonflyTokens.spaceMd,
        vertical: DragonflyTokens.spaceSm,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(DragonflyTokens.roundFull),
      ),
      child: Text(
        label,
        style: Theme.of(context)
            .textTheme
            .labelMedium
            ?.copyWith(color: fg, fontWeight: FontWeight.w600),
      ),
    );
  }

  (Color, Color) _palette(GlucoseStatus s) => switch (s) {
        GlucoseStatus.inRange => (
            DragonflyTokens.success,
            DragonflyTokens.onSuccess,
          ),
        GlucoseStatus.low ||
        GlucoseStatus.high =>
          (DragonflyTokens.warning, DragonflyTokens.onWarning),
        GlucoseStatus.criticalLow ||
        GlucoseStatus.criticalHigh =>
          (DragonflyTokens.error, DragonflyTokens.onError),
      };
}
