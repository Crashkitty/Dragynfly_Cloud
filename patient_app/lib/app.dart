import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'routing/app_router.dart';
import 'services/auth_service.dart';
import 'services/bast_client.dart';
import 'services/glucose_service.dart';
import 'theme/dragonfly_theme.dart';

class DragonflyApp extends StatefulWidget {
  const DragonflyApp({super.key});

  @override
  State<DragonflyApp> createState() => _DragonflyAppState();
}

class _DragonflyAppState extends State<DragonflyApp> {
  late final AuthService _auth;
  late final BastClient _bast;
  late final GlucoseService _glucose;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _auth = AuthService();
    _bast = InMemoryBastClient();
    _glucose = GlucoseService();
    _router = buildRouter(auth: _auth, bast: _bast, glucose: _glucose);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Dragonfly',
      debugShowCheckedModeBanner: false,
      theme: buildDragonflyTheme(),
      routerConfig: _router,
    );
  }
}
