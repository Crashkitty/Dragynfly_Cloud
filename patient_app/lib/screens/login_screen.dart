import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../services/auth_service.dart';
import '../theme/tokens.dart';

class LoginScreen extends StatefulWidget {
  final AuthService auth;
  const LoginScreen({super.key, required this.auth});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _idController = TextEditingController();
  final _nameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _idController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _activate() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.activate(
        participantId: _idController.text.trim(),
        firstName: _nameController.text.trim(),
      );
      if (mounted) context.go('/home');
    } on Exception catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(
            horizontal: DragonflyTokens.spaceLg,
            vertical: DragonflyTokens.spaceXl,
          ),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: DragonflyTokens.space2xl),
                Text('Dragonfly', style: theme.textTheme.displayLarge),
                const SizedBox(height: DragonflyTokens.spaceSm),
                Text(
                  'Welcome to your study app.',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: DragonflyTokens.secondary,
                  ),
                ),
                const SizedBox(height: DragonflyTokens.space2xl),

                Text('Your first name', style: theme.textTheme.labelMedium),
                const SizedBox(height: DragonflyTokens.spaceSm),
                TextFormField(
                  controller: _nameController,
                  textCapitalization: TextCapitalization.words,
                  style: theme.textTheme.bodyLarge,
                  decoration: const InputDecoration(hintText: 'Mary'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),

                const SizedBox(height: DragonflyTokens.spaceLg),
                Text(
                  'Your 6-digit code',
                  style: theme.textTheme.labelMedium,
                ),
                const SizedBox(height: DragonflyTokens.spaceXs),
                Text(
                  'Look on the card the study staff gave you.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: DragonflyTokens.secondary,
                  ),
                ),
                const SizedBox(height: DragonflyTokens.spaceSm),
                TextFormField(
                  controller: _idController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  textAlign: TextAlign.center,
                  style: theme.textTheme.displayLarge?.copyWith(
                    fontSize: 36,
                    letterSpacing: 8,
                  ),
                  decoration: const InputDecoration(hintText: '------'),
                  validator: (v) => (v == null || v.length != 6)
                      ? 'Enter the 6-digit code'
                      : null,
                ),

                if (_error != null) ...[
                  const SizedBox(height: DragonflyTokens.spaceLg),
                  Text(
                    _error!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: DragonflyTokens.error,
                    ),
                  ),
                ],

                const SizedBox(height: DragonflyTokens.space2xl),
                ElevatedButton(
                  onPressed: _busy ? null : _activate,
                  child: _busy
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: DragonflyTokens.onTertiary,
                          ),
                        )
                      : const Text('Open my study app'),
                ),
                const SizedBox(height: DragonflyTokens.spaceMd),
                OutlinedButton(
                  onPressed: _busy ? null : () => _showHelp(context),
                  child: const Text('I need help'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showHelp(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: DragonflyTokens.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(DragonflyTokens.roundXl),
        ),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(DragonflyTokens.spaceLg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              "Don't have a code?",
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: DragonflyTokens.spaceMd),
            Text(
              'Ask the study staff at your next visit. They will give you '
              'a card with your 6-digit code on it.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: DragonflyTokens.spaceXl),
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Got it'),
            ),
            const SizedBox(height: DragonflyTokens.spaceMd),
          ],
        ),
      ),
    );
  }
}
