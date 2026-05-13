import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/tokens.dart';

/// Bottom-nav shell wrapping the four primary destinations.
class HomeShell extends StatelessWidget {
  final Widget child;
  const HomeShell({super.key, required this.child});

  static const _tabs = <_Tab>[
    _Tab(label: 'Home', icon: Icons.home_outlined, route: '/home'),
    _Tab(label: 'Logs', icon: Icons.list_alt_outlined, route: '/logs'),
    _Tab(label: 'Chat', icon: Icons.chat_bubble_outline, route: '/chat'),
    _Tab(label: 'Profile', icon: Icons.person_outline, route: '/profile'),
  ];

  int _indexFor(String location) {
    for (var i = 0; i < _tabs.length; i++) {
      if (location.startsWith(_tabs[i].route)) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final selected = _indexFor(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        height: DragonflyTokens.bottomNavHeight,
        backgroundColor: DragonflyTokens.surface,
        indicatorColor: DragonflyTokens.primaryContainer,
        selectedIndex: selected,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        onDestinationSelected: (i) => context.go(_tabs[i].route),
        destinations: [
          for (final t in _tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.icon, color: DragonflyTokens.primary),
              label: t.label,
            ),
        ],
      ),
    );
  }
}

class _Tab {
  final String label;
  final IconData icon;
  final String route;
  const _Tab({required this.label, required this.icon, required this.route});
}
