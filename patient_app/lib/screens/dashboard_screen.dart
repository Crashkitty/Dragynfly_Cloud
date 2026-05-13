import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models/glucose_reading.dart';
import '../models/participant.dart';
import '../services/auth_service.dart';
import '../services/bast_client.dart';
import '../services/glucose_service.dart';
import '../theme/tokens.dart';
import '../widgets/dragonfly_card.dart';
import '../widgets/glucose_pill.dart';
import '../widgets/section_label.dart';

class DashboardScreen extends StatefulWidget {
  final AuthService auth;
  final GlucoseService glucose;
  final BastClient bast;

  const DashboardScreen({
    super.key,
    required this.auth,
    required this.glucose,
    required this.bast,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Participant? _participant;
  late List<GlucoseReading> _readings;
  String _summary = '';

  @override
  void initState() {
    super.initState();
    _readings = widget.glucose.last24Hours();
    _load();
  }

  Future<void> _load() async {
    final p = await widget.auth.currentParticipant();
    final s = await widget.bast.dailySummary();
    if (!mounted) return;
    setState(() {
      _participant = p;
      _summary = s;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final latest = _readings.last;
    final greeting = _participant == null
        ? 'Hello'
        : 'Hello, ${_participant!.firstName}';
    final latestMeta = '${latest.sourceLabel} • ${latest.contextLabel} • '
        '${DateFormat.MMMd().add_jm().format(latest.time)}';

    return Scaffold(
      appBar: AppBar(title: Text(greeting)),
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
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Latest glucose',
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: DragonflyTokens.spaceMd),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        latest.mgdl.toStringAsFixed(0),
                        style: theme.textTheme.displayLarge?.copyWith(
                          fontSize: 56,
                          height: 1.0,
                        ),
                      ),
                      const SizedBox(width: DragonflyTokens.spaceSm),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          'mg/dL',
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: DragonflyTokens.secondary,
                          ),
                        ),
                      ),
                      const Spacer(),
                      GlucosePill.from(latest),
                    ],
                  ),
                  const SizedBox(height: DragonflyTokens.spaceMd),
                  Text(
                    latestMeta,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: DragonflyTokens.secondary,
                    ),
                  ),
                  const SizedBox(height: DragonflyTokens.spaceMd),
                  SizedBox(height: 160, child: _GlucoseChart(_readings)),
                ],
              ),
            ),
            const SizedBox(height: DragonflyTokens.spaceLg),
            DragonflyCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Today's summary", style: theme.textTheme.headlineSmall),
                  const SizedBox(height: DragonflyTokens.spaceMd),
                  Text(
                    _summary.isEmpty
                        ? 'Loading your day…'
                        : _summary,
                    style: theme.textTheme.bodyLarge,
                  ),
                ],
              ),
            ),
            const SizedBox(height: DragonflyTokens.spaceLg),
            const SectionLabel('Quick actions'),
            _QuickAction(
              icon: Icons.water_drop_outlined,
              label: 'Log a glucose reading',
              onTap: () {
                context.push<bool>('/home/glucose-log').then((saved) {
                  if (saved != true || !mounted) return;
                  setState(() => _readings = widget.glucose.last24Hours());
                  _load();
                });
              },
            ),
            const SizedBox(height: DragonflyTokens.spaceMd),
            _QuickAction(
              icon: Icons.restaurant_outlined,
              label: 'Add a meal',
              onTap: () => context.go('/logs'),
            ),
            const SizedBox(height: DragonflyTokens.spaceMd),
            _QuickAction(
              icon: Icons.call_outlined,
              label: 'Request a call',
              onTap: () => context.go('/chat'),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return DragonflyCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(
        horizontal: DragonflyTokens.spaceLg,
        vertical: DragonflyTokens.spaceMd,
      ),
      child: Row(
        children: [
          Icon(icon, size: 32, color: DragonflyTokens.primary),
          const SizedBox(width: DragonflyTokens.spaceMd),
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
          const Icon(
            Icons.chevron_right,
            color: DragonflyTokens.secondary,
            size: 28,
          ),
        ],
      ),
    );
  }
}

class _GlucoseChart extends StatelessWidget {
  final List<GlucoseReading> readings;
  const _GlucoseChart(this.readings);

  @override
  Widget build(BuildContext context) {
    if (readings.isEmpty) return const SizedBox.shrink();
    final spots = <FlSpot>[
      for (var i = 0; i < readings.length; i++)
        FlSpot(i.toDouble(), readings[i].mgdl),
    ];
    return LineChart(
      LineChartData(
        minY: 40,
        maxY: 260,
        titlesData: const FlTitlesData(show: false),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: 60,
          getDrawingHorizontalLine: (_) => const FlLine(
            color: DragonflyTokens.outline,
            strokeWidth: 0.5,
            dashArray: [4, 4],
          ),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            curveSmoothness: 0.2,
            color: DragonflyTokens.primary,
            barWidth: 3,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: DragonflyTokens.primaryContainer.withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }
}
