import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/dashboard_screen.dart';
import '../screens/food_diary_screen.dart';
import '../screens/glucose_log_screen.dart';
import '../screens/login_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/shell.dart';
import '../screens/telemedicine_screen.dart';
import '../services/auth_service.dart';
import '../services/bast_client.dart';
import '../services/glucose_service.dart';

GoRouter buildRouter({
  required AuthService auth,
  required BastClient bast,
  required GlucoseService glucose,
}) {
  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) async {
      final p = await auth.currentParticipant();
      final goingToLogin = state.matchedLocation == '/login';
      if (p == null && !goingToLogin) return '/login';
      if (p != null && goingToLogin) return '/home';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, __) => LoginScreen(auth: auth),
      ),
      ShellRoute(
        builder: (_, __, child) => HomeShell(child: child),
        routes: [
          GoRoute(
            path: '/home',
            builder: (_, __) => DashboardScreen(
              auth: auth,
              glucose: glucose,
              bast: bast,
            ),
          ),
          GoRoute(
            path: '/home/glucose-log',
            builder: (_, __) => GlucoseLogScreen(
              auth: auth,
              bast: bast,
              glucose: glucose,
            ),
          ),
          GoRoute(
            path: '/logs',
            builder: (_, __) => FoodDiaryScreen(bast: bast),
          ),
          GoRoute(
            path: '/chat',
            builder: (_, __) => const TelemedicineScreen(),
          ),
          GoRoute(
            path: '/profile',
            builder: (_, __) => ProfileScreen(auth: auth),
          ),
        ],
      ),
    ],
  );
}
