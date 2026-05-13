import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../models/meal_entry.dart';
import '../services/bast_client.dart';
import '../theme/tokens.dart';
import '../widgets/dragonfly_card.dart';
import '../widgets/section_label.dart';

class FoodDiaryScreen extends StatefulWidget {
  final BastClient bast;
  const FoodDiaryScreen({super.key, required this.bast});

  @override
  State<FoodDiaryScreen> createState() => _FoodDiaryScreenState();
}

class _FoodDiaryScreenState extends State<FoodDiaryScreen> {
  final _picker = ImagePicker();
  final _descController = TextEditingController();
  final _carbsController = TextEditingController();
  final _uuid = const Uuid();
  XFile? _photo;
  List<MealEntry> _meals = const [];

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _descController.dispose();
    _carbsController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    final m = await widget.bast.recentMeals();
    if (mounted) setState(() => _meals = m);
  }

  Future<void> _takePhoto() async {
    final x = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (x != null && mounted) setState(() => _photo = x);
  }

  Future<void> _save() async {
    if (_descController.text.trim().isEmpty) return;
    await widget.bast.recordMeal(
      MealEntry(
        id: _uuid.v4(),
        time: DateTime.now(),
        description: _descController.text.trim(),
        imagePath: _photo?.path,
        carbsGrams: int.tryParse(_carbsController.text.trim()),
      ),
    );
    if (!mounted) return;
    setState(() {
      _photo = null;
      _descController.clear();
      _carbsController.clear();
    });
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Food diary')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            DragonflyTokens.spaceLg,
            DragonflyTokens.spaceSm,
            DragonflyTokens.spaceLg,
            DragonflyTokens.spaceXl,
          ),
          children: [
            DragonflyCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Add a meal',
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: DragonflyTokens.spaceMd),
                  AspectRatio(
                    aspectRatio: 4 / 3,
                    child: GestureDetector(
                      onTap: _takePhoto,
                      child: Container(
                        decoration: BoxDecoration(
                          color: DragonflyTokens.neutral,
                          borderRadius: BorderRadius.circular(
                            DragonflyTokens.roundMd,
                          ),
                          border: Border.all(
                            color: DragonflyTokens.outline,
                            style: BorderStyle.solid,
                            width: 1,
                          ),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: _photo == null
                            ? const Center(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.add_a_photo_outlined,
                                      size: 48,
                                      color: DragonflyTokens.primary,
                                    ),
                                    SizedBox(
                                      height: DragonflyTokens.spaceSm,
                                    ),
                                    Text(
                                      'Tap to take a photo',
                                      style: TextStyle(
                                        fontSize: 18,
                                        color: DragonflyTokens.secondary,
                                      ),
                                    ),
                                  ],
                                ),
                              )
                            : Image.file(File(_photo!.path), fit: BoxFit.cover),
                      ),
                    ),
                  ),
                  const SizedBox(height: DragonflyTokens.spaceLg),
                  Text(
                    'What did you eat?',
                    style: theme.textTheme.labelMedium,
                  ),
                  const SizedBox(height: DragonflyTokens.spaceSm),
                  TextField(
                    controller: _descController,
                    maxLines: 3,
                    style: theme.textTheme.bodyLarge,
                    decoration: const InputDecoration(
                      hintText: 'A bowl of oatmeal with berries',
                    ),
                  ),
                  const SizedBox(height: DragonflyTokens.spaceLg),
                  Text(
                    'Carbs (grams) — optional',
                    style: theme.textTheme.labelMedium,
                  ),
                  const SizedBox(height: DragonflyTokens.spaceSm),
                  TextField(
                    controller: _carbsController,
                    keyboardType: TextInputType.number,
                    style: theme.textTheme.bodyLarge,
                    decoration: const InputDecoration(hintText: '45'),
                  ),
                  const SizedBox(height: DragonflyTokens.spaceXl),
                  ElevatedButton(
                    onPressed: _save,
                    child: const Text('Save meal'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: DragonflyTokens.spaceLg),
            const SectionLabel('Recent meals'),
            if (_meals.isEmpty)
              DragonflyCard(
                child: Text(
                  'Your meals will appear here.',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: DragonflyTokens.secondary,
                  ),
                ),
              ),
            for (final m in _meals) ...[
              _MealCard(meal: m),
              const SizedBox(height: DragonflyTokens.spaceMd),
            ],
          ],
        ),
      ),
    );
  }
}

class _MealCard extends StatelessWidget {
  final MealEntry meal;
  const _MealCard({required this.meal});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = DateFormat.MMMd().add_jm();
    return DragonflyCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (meal.imagePath != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(DragonflyTokens.roundMd),
              child: Image.file(
                File(meal.imagePath!),
                width: 80,
                height: 80,
                fit: BoxFit.cover,
              ),
            )
          else
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: DragonflyTokens.neutral,
                borderRadius: BorderRadius.circular(DragonflyTokens.roundMd),
              ),
              child: const Icon(
                Icons.restaurant_outlined,
                color: DragonflyTokens.secondary,
                size: 32,
              ),
            ),
          const SizedBox(width: DragonflyTokens.spaceMd),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(meal.description, style: theme.textTheme.bodyLarge),
                const SizedBox(height: DragonflyTokens.spaceXs),
                Text(
                  fmt.format(meal.time),
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: DragonflyTokens.secondary,
                  ),
                ),
                if (meal.carbsGrams != null) ...[
                  const SizedBox(height: DragonflyTokens.spaceXs),
                  Text(
                    '${meal.carbsGrams} g carbs',
                    style: theme.textTheme.labelMedium,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
