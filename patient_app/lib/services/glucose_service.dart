import 'dart:math';

import '../models/glucose_reading.dart';

/// Stub glucose source for the MVP.
///
/// Real implementation reads from HealthKit on iOS and Health Connect on
/// Android — both Dexcom and Abbott FreeStyle write to those stores via
/// their own apps, so we don't talk to sensors directly.
class GlucoseService {
  GlucoseService({Random? random}) : _random = random ?? Random(7) {
    _generatedReadings = _buildGeneratedSeries();
  }

  final Random _random;
  late final List<GlucoseReading> _generatedReadings;
  final List<GlucoseReading> _loggedReadings = [];

  /// Returns a fake last-24h time series at 15-minute intervals and merges in
  /// any manual or lancet readings logged in the app.
  List<GlucoseReading> last24Hours() {
    final merged = <GlucoseReading>[
      ..._generatedReadings,
      ..._loggedReadings,
    ]..sort((a, b) => a.time.compareTo(b.time));
    return merged;
  }

  GlucoseReading mostRecent() => last24Hours().last;

  void logReading(GlucoseReading reading) {
    _loggedReadings.add(reading);
    _loggedReadings.sort((a, b) => a.time.compareTo(b.time));
  }

  List<GlucoseReading> _buildGeneratedSeries() {
    final now = DateTime.now();
    const samples = 96; // 24h * 4
    return List.generate(samples, (i) {
      final t = now.subtract(Duration(minutes: 15 * (samples - i)));
      final base = 130 + 35 * sin(i / 8);
      final jitter = (_random.nextDouble() - 0.5) * 30;
      final mgdl = (base + jitter).clamp(58, 240).toDouble();
      return GlucoseReading.from(
        time: t,
        mgdl: mgdl,
        source: GlucoseReadingSource.cgm,
        deviceName: 'Simulated CGM',
        context: _contextFor(t),
      );
    });
  }

  GlucoseReadingContext _contextFor(DateTime time) {
    final hour = time.hour;
    if (hour < 10) return GlucoseReadingContext.preTaiyi;
    if (hour < 12) return GlucoseReadingContext.postTaiyi;
    if (hour < 14) return GlucoseReadingContext.beforeLunch;
    if (hour < 16) return GlucoseReadingContext.postLunch1To2h;
    if (hour < 18) return GlucoseReadingContext.postLunch3To4h;
    return GlucoseReadingContext.endOfDay;
  }
}
