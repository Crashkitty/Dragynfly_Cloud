import 'package:flutter/material.dart';

import '../theme/tokens.dart';

class SectionLabel extends StatelessWidget {
  final String text;
  const SectionLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(
        left: DragonflyTokens.spaceXs,
        bottom: DragonflyTokens.spaceSm,
      ),
      child: Text(
        text,
        style: Theme.of(context).textTheme.headlineSmall,
      ),
    );
  }
}
