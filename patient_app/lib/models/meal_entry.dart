class MealEntry {
  final String id;
  final DateTime time;
  final String description;
  final String? imagePath;
  final int? carbsGrams;

  const MealEntry({
    required this.id,
    required this.time,
    required this.description,
    this.imagePath,
    this.carbsGrams,
  });
}
