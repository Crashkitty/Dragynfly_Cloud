import '../models/glucose_reading.dart';
import '../models/meal_entry.dart';

/// Thin client for BAST AI — the multi-agent platform that backs storage,
/// organization, and analysis (per spec § 4.1) and powers AI summaries on
/// the provider dashboard (spec § 3.2).
///
/// In V1 this is an in-memory stub. Real auth + endpoints are TBD; the
/// interface is shaped so the implementation can swap behind it without
/// changing call sites.
abstract class BastClient {
  Future<void> recordGlucose(GlucoseReading reading);
  Future<void> recordMeal(MealEntry entry);
  Future<List<MealEntry>> recentMeals({int limit = 20});
  Future<String> dailySummary();
}

class InMemoryBastClient implements BastClient {
  final List<GlucoseReading> _glucose = [];
  final List<MealEntry> _meals = [];

  @override
  Future<void> recordGlucose(GlucoseReading reading) async {
    _glucose.add(reading);
  }

  @override
  Future<void> recordMeal(MealEntry entry) async {
    _meals.insert(0, entry);
  }

  @override
  Future<List<MealEntry>> recentMeals({int limit = 20}) async {
    return _meals.take(limit).toList();
  }

  @override
  Future<String> dailySummary() async {
    final inRange = _glucose
        .where((r) => r.status == GlucoseStatus.inRange)
        .length;
    final total = _glucose.length;
    if (total == 0) {
      return 'No participant-submitted readings yet today. Logged glucose, '
          'meal, and telemedicine updates will appear here for staff review.';
    }
    final pct = (inRange / total * 100).round();
    return 'You are in your target range $pct% of the time today. '
        'Keep going — every reading helps the study.';
  }
}
