enum GlucoseReadingSource { cgm, manual, lancet }

enum GlucoseReadingContext {
  preTaiyi,
  postTaiyi,
  beforeLunch,
  postLunch1To2h,
  postLunch3To4h,
  endOfDay,
}

enum GlucoseStatus { low, inRange, high, criticalLow, criticalHigh }

class GlucoseReading {
  final String? patientId;
  final DateTime time;
  final double mgdl;
  final GlucoseStatus status;
  final GlucoseReadingSource source;
  final String deviceName;
  final GlucoseReadingContext context;
  final String? notes;
  final String? photoPath;

  const GlucoseReading({
    this.patientId,
    required this.time,
    required this.mgdl,
    required this.status,
    required this.source,
    required this.deviceName,
    required this.context,
    this.notes,
    this.photoPath,
  });

  factory GlucoseReading.from({
    String? patientId,
    required DateTime time,
    required double mgdl,
    GlucoseReadingSource source = GlucoseReadingSource.cgm,
    String? deviceName,
    GlucoseReadingContext context = GlucoseReadingContext.endOfDay,
    String? notes,
    String? photoPath,
  }) {
    return GlucoseReading(
      patientId: patientId,
      time: time,
      mgdl: mgdl,
      status: _classify(mgdl),
      source: source,
      deviceName: deviceName ?? _defaultDeviceName(source),
      context: context,
      notes: notes,
      photoPath: photoPath,
    );
  }

  static GlucoseStatus _classify(double mgdl) {
    if (mgdl < 54) return GlucoseStatus.criticalLow;
    if (mgdl < 70) return GlucoseStatus.low;
    if (mgdl > 250) return GlucoseStatus.criticalHigh;
    if (mgdl > 180) return GlucoseStatus.high;
    return GlucoseStatus.inRange;
  }

  static String _defaultDeviceName(GlucoseReadingSource source) =>
      switch (source) {
        GlucoseReadingSource.cgm => 'Libre CGM',
        GlucoseReadingSource.manual => 'Manual meter',
        GlucoseReadingSource.lancet => 'Lancet meter',
      };

  String get statusLabel => switch (status) {
        GlucoseStatus.criticalLow => 'Critical low',
        GlucoseStatus.low => 'Low',
        GlucoseStatus.inRange => 'In range',
        GlucoseStatus.high => 'High',
        GlucoseStatus.criticalHigh => 'Critical high',
      };

  String get sourceLabel => switch (source) {
        GlucoseReadingSource.cgm => 'CGM',
        GlucoseReadingSource.manual => 'Manual meter',
        GlucoseReadingSource.lancet => 'Lancet',
      };

  String get contextLabel => switch (context) {
        GlucoseReadingContext.preTaiyi => 'Before Taiyi',
        GlucoseReadingContext.postTaiyi => 'After Taiyi',
        GlucoseReadingContext.beforeLunch => 'Before lunch',
        GlucoseReadingContext.postLunch1To2h => '1-2 hours after lunch',
        GlucoseReadingContext.postLunch3To4h => '3-4 hours after lunch',
        GlucoseReadingContext.endOfDay => 'End of day',
      };
}
