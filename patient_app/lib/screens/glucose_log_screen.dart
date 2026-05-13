import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../models/glucose_reading.dart';
import '../models/participant.dart';
import '../services/auth_service.dart';
import '../services/bast_client.dart';
import '../services/glucose_service.dart';
import '../theme/tokens.dart';
import '../widgets/dragonfly_card.dart';

class GlucoseLogScreen extends StatefulWidget {
  final AuthService auth;
  final BastClient bast;
  final GlucoseService glucose;

  const GlucoseLogScreen({
    super.key,
    required this.auth,
    required this.bast,
    required this.glucose,
  });

  @override
  State<GlucoseLogScreen> createState() => _GlucoseLogScreenState();
}

class _GlucoseLogScreenState extends State<GlucoseLogScreen> {
  final _formKey = GlobalKey<FormState>();
  final _valueController = TextEditingController();
  final _notesController = TextEditingController();
  final _picker = ImagePicker();
  GlucoseReadingSource _source = GlucoseReadingSource.manual;
  GlucoseReadingContext _context = GlucoseReadingContext.preTaiyi;
  DateTime _timestamp = DateTime.now();
  Participant? _participant;
  XFile? _photo;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadParticipant();
  }

  @override
  void dispose() {
    _valueController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadParticipant() async {
    final participant = await widget.auth.currentParticipant();
    if (!mounted) return;
    setState(() => _participant = participant);
  }

  Future<void> _pickTimestamp() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _timestamp,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_timestamp),
    );
    if (time == null || !mounted) return;

    setState(() {
      _timestamp = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  Future<void> _takePhoto() async {
    final photo = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (photo != null && mounted) {
      setState(() => _photo = photo);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _saving = true);
    final notes = _notesController.text.trim();
    final reading = GlucoseReading.from(
      patientId: _participant?.id,
      time: _timestamp,
      mgdl: double.parse(_valueController.text.trim()),
      source: _source,
      context: _context,
      notes: notes.isEmpty ? null : notes,
      photoPath: _photo?.path,
    );

    widget.glucose.logReading(reading);
    await widget.bast.recordGlucose(reading);

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Glucose reading saved.')),
    );
    context.pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final timestampLabel = DateFormat.MMMd().add_jm().format(_timestamp);

    return Scaffold(
      appBar: AppBar(title: const Text('Log glucose')),
      body: SafeArea(
        child: Form(
          key: _formKey,
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
                      'Add a blood sugar reading',
                      style: theme.textTheme.headlineSmall,
                    ),
                    const SizedBox(height: DragonflyTokens.spaceSm),
                    Text(
                      _participant == null
                          ? 'Record the reading from your meter.'
                          : 'Recording for ${_participant!.firstName}.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: DragonflyTokens.secondary,
                      ),
                    ),
                    const SizedBox(height: DragonflyTokens.spaceLg),
                    Text(
                      'Reading (mg/dL)',
                      style: theme.textTheme.labelMedium,
                    ),
                    const SizedBox(height: DragonflyTokens.spaceSm),
                    TextFormField(
                      controller: _valueController,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(3),
                      ],
                      style: theme.textTheme.bodyLarge,
                      decoration: const InputDecoration(hintText: '128'),
                      validator: _validateReading,
                    ),
                    const SizedBox(height: DragonflyTokens.spaceLg),
                    Text('Source', style: theme.textTheme.labelMedium),
                    const SizedBox(height: DragonflyTokens.spaceSm),
                    DropdownButtonFormField<GlucoseReadingSource>(
                      value: _source,
                      items: GlucoseReadingSource.values
                          .where((source) => source != GlucoseReadingSource.cgm)
                          .map(
                            (source) => DropdownMenuItem(
                              value: source,
                              child: Text(_sourceLabel(source)),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => _source = value);
                      },
                    ),
                    const SizedBox(height: DragonflyTokens.spaceLg),
                    Text('Reading context', style: theme.textTheme.labelMedium),
                    const SizedBox(height: DragonflyTokens.spaceSm),
                    DropdownButtonFormField<GlucoseReadingContext>(
                      value: _context,
                      items: GlucoseReadingContext.values
                          .map(
                            (contextValue) => DropdownMenuItem(
                              value: contextValue,
                              child: Text(_contextLabel(contextValue)),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => _context = value);
                      },
                    ),
                    const SizedBox(height: DragonflyTokens.spaceLg),
                    Text('Time of reading', style: theme.textTheme.labelMedium),
                    const SizedBox(height: DragonflyTokens.spaceSm),
                    OutlinedButton.icon(
                      onPressed: _pickTimestamp,
                      icon: const Icon(Icons.schedule_outlined),
                      label: Text(timestampLabel),
                    ),
                    const SizedBox(height: DragonflyTokens.spaceLg),
                    Text(
                      'Notes — optional',
                      style: theme.textTheme.labelMedium,
                    ),
                    const SizedBox(height: DragonflyTokens.spaceSm),
                    TextField(
                      controller: _notesController,
                      maxLines: 3,
                      style: theme.textTheme.bodyLarge,
                      decoration: const InputDecoration(
                        hintText: 'Felt dizzy after Taiyi session',
                      ),
                    ),
                    const SizedBox(height: DragonflyTokens.spaceLg),
                    Text(
                      'Photo evidence — optional',
                      style: theme.textTheme.labelMedium,
                    ),
                    const SizedBox(height: DragonflyTokens.spaceSm),
                    if (_photo != null) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(
                          DragonflyTokens.roundMd,
                        ),
                        child: Image.file(
                          File(_photo!.path),
                          height: 180,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(height: DragonflyTokens.spaceMd),
                    ],
                    OutlinedButton.icon(
                      onPressed: _takePhoto,
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: Text(
                        _photo == null ? 'Take meter photo' : 'Retake photo',
                      ),
                    ),
                    const SizedBox(height: DragonflyTokens.spaceXl),
                    ElevatedButton(
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: DragonflyTokens.onTertiary,
                              ),
                            )
                          : const Text('Save glucose reading'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: DragonflyTokens.spaceLg),
              DragonflyCard(
                child: Text(
                  'Libre and other CGM sync paths are modeled for the MVP but '
                  'real device import remains a later integration milestone.',
                  style: theme.textTheme.bodyLarge,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _validateReading(String? value) {
    final parsed = double.tryParse(value?.trim() ?? '');
    if (parsed == null) return 'Enter a glucose value.';
    if (parsed < 20 || parsed > 600) {
      return 'Enter a value between 20 and 600.';
    }
    return null;
  }

  String _sourceLabel(GlucoseReadingSource source) => switch (source) {
        GlucoseReadingSource.cgm => 'CGM',
        GlucoseReadingSource.manual => 'Manual meter',
        GlucoseReadingSource.lancet => 'Lancet',
      };

  String _contextLabel(GlucoseReadingContext context) => switch (context) {
        GlucoseReadingContext.preTaiyi => 'Before Taiyi',
        GlucoseReadingContext.postTaiyi => 'After Taiyi',
        GlucoseReadingContext.beforeLunch => 'Before lunch',
        GlucoseReadingContext.postLunch1To2h => '1-2 hours after lunch',
        GlucoseReadingContext.postLunch3To4h => '3-4 hours after lunch',
        GlucoseReadingContext.endOfDay => 'End of day',
      };
}
