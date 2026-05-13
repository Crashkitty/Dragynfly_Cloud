import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

import '../models/participant.dart';

/// Auth for the MVP: a 6-digit participant ID issued at enrollment, entered
/// once, and re-confirmed via biometrics on subsequent app opens.
///
/// No passwords. No email. No SMS. Identity verification happened in-person
/// at enrollment; the app trusts the device after that.
class AuthService {
  AuthService({FlutterSecureStorage? storage, LocalAuthentication? localAuth})
      : _storage = storage ?? const FlutterSecureStorage(),
        _localAuth = localAuth ?? LocalAuthentication();

  static const _kParticipantId = 'participant_id';
  static const _kFirstName = 'participant_first_name';
  static const _kEnrolledAt = 'participant_enrolled_at';

  final FlutterSecureStorage _storage;
  final LocalAuthentication _localAuth;

  /// First-time activation. The 6-digit code is validated server-side in
  /// production; for the MVP, any 6-digit numeric code is accepted and a
  /// stub participant record is stored on device.
  Future<Participant> activate({
    required String participantId,
    required String firstName,
  }) async {
    if (!_isValidParticipantId(participantId)) {
      throw const FormatException('Participant ID must be 6 digits.');
    }
    final now = DateTime.now();
    await _storage.write(key: _kParticipantId, value: participantId);
    await _storage.write(key: _kFirstName, value: firstName);
    await _storage.write(key: _kEnrolledAt, value: now.toIso8601String());
    return Participant(
      id: participantId,
      firstName: firstName,
      enrolledAt: now,
    );
  }

  Future<Participant?> currentParticipant() async {
    final id = await _storage.read(key: _kParticipantId);
    final firstName = await _storage.read(key: _kFirstName);
    final enrolledAt = await _storage.read(key: _kEnrolledAt);
    if (id == null || firstName == null || enrolledAt == null) return null;
    return Participant(
      id: id,
      firstName: firstName,
      enrolledAt: DateTime.parse(enrolledAt),
    );
  }

  Future<bool> biometricsAvailable() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      final canCheck = await _localAuth.canCheckBiometrics;
      return supported && canCheck;
    } on Exception {
      return false;
    }
  }

  Future<bool> authenticateWithBiometrics() async {
    try {
      return await _localAuth.authenticate(
        localizedReason: 'Confirm it is you to open Dragonfly',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
    } on Exception {
      return false;
    }
  }

  Future<void> signOut() => _storage.deleteAll();

  bool _isValidParticipantId(String code) =>
      RegExp(r'^\d{6}$').hasMatch(code);
}
