import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_client.dart';

/// Reproductor configurado como ALARMA (no como música): usa el volumen de
/// alarma, suena aunque el celular esté en silencio/vibración y por el
/// parlante. Lo usan la alarma de pedidos de Cocina y los llamados de caja.
AudioPlayer crearReproductorAlarma() {
  final reproductor = AudioPlayer();
  reproductor.setAudioContext(AudioContext(
    android: const AudioContextAndroid(
      usageType: AndroidUsageType.alarm,
      contentType: AndroidContentType.sonification,
      audioFocus: AndroidAudioFocus.gainTransient,
      stayAwake: true,
    ),
    iOS: AudioContextIOS(category: AVAudioSessionCategory.playback),
  ));
  reproductor.setReleaseMode(ReleaseMode.stop);
  return reproductor;
}

Future<void> sonarAlarma(AudioPlayer reproductor, String archivo, {int vibraciones = 5}) async {
  try {
    await reproductor.stop();
    await reproductor.play(AssetSource('sounds/$archivo'), volume: 1.0);
  } catch (_) {
    SystemSound.play(SystemSoundType.alert);
  }
  for (var i = 0; i < vibraciones; i++) {
    Future.delayed(Duration(milliseconds: 600 * i), () => HapticFeedback.vibrate());
  }
}

/// Notificación del sistema (la que baja arriba de la pantalla) para los
/// llamados de la caja. Tocarla —o su botón "Ya voy"— avisa a la caja.
class AvisosLlamado {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _listo = false;
  static void Function(int llamadoId)? alResponder;

  static const _canal = AndroidNotificationDetails(
    'llamados_caja',
    'Llamados de la caja',
    channelDescription: 'Cuando el cajero aprieta "Llamar a cocina".',
    importance: Importance.max,
    priority: Priority.max,
    category: AndroidNotificationCategory.call,
    playSound: false, // suena la alarma propia de la app, más fuerte
    enableVibration: true,
    ongoing: true,
    autoCancel: true,
    actions: [
      AndroidNotificationAction('ya_voy', '✋ Ya voy', showsUserInterface: true, cancelNotification: true),
    ],
  );

  static Future<void> iniciar() async {
    if (_listo) return;
    _listo = true;
    await _plugin.initialize(
      const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
      onDidReceiveNotificationResponse: _respuesta,
    );
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    // Si la app se abrió tocando la notificación.
    final arranque = await _plugin.getNotificationAppLaunchDetails();
    final respuesta = arranque?.notificationResponse;
    if (arranque?.didNotificationLaunchApp == true && respuesta != null) _respuesta(respuesta);
  }

  static void _respuesta(NotificationResponse respuesta) {
    final id = int.tryParse(respuesta.payload ?? '');
    if (id != null) alResponder?.call(id);
  }

  static Future<void> mostrar(int llamadoId, String llamadoPor) async {
    try {
      await _plugin.show(
        llamadoId,
        '🔔 Te llaman de la caja',
        '$llamadoPor te necesita en la caja. Tocá para avisar que vas.',
        const NotificationDetails(android: _canal),
        payload: '$llamadoId',
      );
    } catch (_) {}
  }

  static Future<void> quitar(int llamadoId) async {
    try {
      await _plugin.cancel(llamadoId);
    } catch (_) {}
  }
}

/// Aviso grande arriba de la app mientras hay un llamado sin responder.
class BannerLlamado extends StatelessWidget {
  final String llamadoPor;
  final VoidCallback onYaVoy;
  const BannerLlamado({super.key, required this.llamadoPor, required this.onYaVoy});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFB91C1C),
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 12)],
      ),
      child: Row(
        children: [
          const Icon(Icons.notifications_active, color: Colors.white, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Te llaman de la caja',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
                Text(llamadoPor, style: const TextStyle(color: Colors.white70, fontSize: 13)),
              ],
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: const Color(0xFFB91C1C),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
            onPressed: onYaVoy,
            child: const Text('✋ Ya voy', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          ),
        ],
      ),
    );
  }
}

/// Consulta cada 4 s si la caja llamó. Mientras haya un llamado sin
/// responder: notificación arriba del celular, aviso rojo en la app y la
/// alarma repitiéndose cada 12 s hasta que alguien aprieta "Ya voy" (acá o
/// en otro celular).
class VigilanteLlamados {
  final Sesion sesion;
  final void Function() alCambiar;
  final AudioPlayer _reproductor = crearReproductorAlarma();
  Timer? _timer;
  DateTime _ultimoSonido = DateTime.fromMillisecondsSinceEpoch(0);
  List<Map<String, dynamic>> pendientes = [];
  final Set<int> _notificados = {};
  final Set<int> _respondidos = {};

  VigilanteLlamados({required this.sesion, required this.alCambiar});

  void iniciar() {
    AvisosLlamado.alResponder = responder;
    AvisosLlamado.iniciar();
    _consultar();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _consultar());
  }

  void detener() {
    _timer?.cancel();
    _reproductor.dispose();
    if (AvisosLlamado.alResponder == responder) AvisosLlamado.alResponder = null;
  }

  Future<void> _consultar() async {
    final todos = await ApiClient.llamadosCocina(sesion);
    if (todos == null) return;
    final lista = todos.where((l) => !_respondidos.contains(l['id'])).toList();
    final ids = lista.map((l) => l['id'] as int).toSet();
    // Los que respondió otra persona (o se cancelaron) dejan de avisar.
    for (final id in _notificados.difference(ids).toList()) {
      AvisosLlamado.quitar(id);
      _notificados.remove(id);
    }
    for (final l in lista) {
      final id = l['id'] as int;
      if (_notificados.add(id)) AvisosLlamado.mostrar(id, l['llamado_por'] as String? ?? 'La caja');
    }
    pendientes = lista;
    if (lista.isNotEmpty && DateTime.now().difference(_ultimoSonido).inSeconds >= 12) {
      _ultimoSonido = DateTime.now();
      sonarAlarma(_reproductor, 'llamado_caja.wav', vibraciones: 4);
    }
    if (lista.isEmpty) _reproductor.stop();
    alCambiar();
  }

  /// "Ya voy" (desde el aviso de la app o desde la notificación).
  Future<void> responder(int id) async {
    _respondidos.add(id);
    pendientes = pendientes.where((l) => l['id'] != id).toList();
    _notificados.remove(id);
    AvisosLlamado.quitar(id);
    if (pendientes.isEmpty) _reproductor.stop();
    alCambiar();
    await ApiClient.marcarLlamadoVisto(sesion, id);
  }
}
