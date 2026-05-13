import 'package:flutter/material.dart';

import '../theme/tokens.dart';

class DragonflyCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  const DragonflyCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(DragonflyTokens.spaceLg),
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(DragonflyTokens.roundLg);
    final container = DecoratedBox(
      decoration: BoxDecoration(
        color: DragonflyTokens.surface,
        borderRadius: radius,
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F1A1F22),
            blurRadius: 3,
            offset: Offset(0, 1),
          ),
          BoxShadow(
            color: Color(0x0A1A1F22),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Padding(padding: padding, child: child),
    );
    if (onTap == null) return container;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: radius,
        child: container,
      ),
    );
  }
}
