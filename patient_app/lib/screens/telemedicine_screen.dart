import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import '../widgets/dragonfly_card.dart';

/// Placeholder for the telemedicine screen.
///
/// Real video + chat is a multi-week effort (WebRTC infra, signaling server,
/// HIPAA-eligible vendor). V1 ships the screen shell with a "request a call"
/// affordance that pings the BAST AI / staff and lets them call the
/// participant back through whatever channel they already use.
class TelemedicineScreen extends StatelessWidget {
  const TelemedicineScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Talk to your team')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(DragonflyTokens.spaceLg),
          child: Column(
            children: [
              const SizedBox(height: DragonflyTokens.spaceLg),
              DragonflyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Need to talk to a study nurse?',
                      style: theme.textTheme.headlineSmall,
                    ),
                    const SizedBox(height: DragonflyTokens.spaceMd),
                    Text(
                      'Tap the button below and someone will call you back '
                      'today. You will see your appointment time here when '
                      'one is scheduled.',
                      style: theme.textTheme.bodyLarge,
                    ),
                    const SizedBox(height: DragonflyTokens.spaceXl),
                    ElevatedButton(
                      onPressed: () => _ack(context),
                      child: const Text('Request a call'),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Text(
                'In an emergency, call 911.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: DragonflyTokens.secondary,
                ),
              ),
              const SizedBox(height: DragonflyTokens.spaceLg),
            ],
          ),
        ),
      ),
    );
  }

  void _ack(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Your study team will call you back today.'),
        duration: Duration(seconds: 3),
      ),
    );
  }
}
