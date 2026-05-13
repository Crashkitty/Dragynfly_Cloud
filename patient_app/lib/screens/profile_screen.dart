import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models/participant.dart';
import '../services/auth_service.dart';
import '../theme/tokens.dart';
import '../widgets/dragonfly_card.dart';

class ProfileScreen extends StatefulWidget {
  final AuthService auth;
  const ProfileScreen({super.key, required this.auth});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Participant? _p;

  @override
  void initState() {
    super.initState();
    widget.auth.currentParticipant().then((p) {
      if (mounted) setState(() => _p = p);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = DateFormat.yMMMd();
    return Scaffold(
      appBar: AppBar(title: const Text('My profile')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(DragonflyTokens.spaceLg),
          children: [
            DragonflyCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _p?.firstName ?? '...',
                    style: theme.textTheme.headlineMedium,
                  ),
                  const SizedBox(height: DragonflyTokens.spaceXs),
                  Text(
                    _p == null
                        ? ''
                        : 'Joined ${fmt.format(_p!.enrolledAt)}',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: DragonflyTokens.secondary,
                    ),
                  ),
                  const SizedBox(height: DragonflyTokens.spaceLg),
                  Text(
                    'Participant ID',
                    style: theme.textTheme.labelMedium,
                  ),
                  Text(
                    _p?.id ?? '',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      letterSpacing: 4,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: DragonflyTokens.spaceLg),
            OutlinedButton(
              onPressed: () async {
                await widget.auth.signOut();
                if (context.mounted) context.go('/login');
              },
              child: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }
}
