import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const String baseUrl = 'https://sistcontcoffe.onrender.com';

/// Sesión guardada del usuario logueado en la app: la cookie que devuelve
/// el servidor al hacer login, más su nombre y rol (leídos directo de la
/// cookie, que no está encriptada, solo firmada).
class Sesion {
  final String cookie;
  final String nombre;
  final String role;

  Sesion({required this.cookie, required this.nombre, required this.role});

  Map<String, String> toMap() => {'cookie': cookie, 'nombre': nombre, 'role': role};

  static Sesion? fromMap(Map<String, String?> map) {
    if (map['cookie'] == null || map['nombre'] == null) return null;
    return Sesion(cookie: map['cookie']!, nombre: map['nombre']!, role: map['role'] ?? '');
  }
}

Map<String, dynamic>? _decodificarPayloadCookie(String cookieHeader) {
  // cookieHeader viene como "yanaloma_session=<payload>.<firma>; ..."
  final valor = cookieHeader.split(';').first.split('=').skip(1).join('=');
  final partes = valor.split('.');
  if (partes.length < 2) return null;
  var payload = partes[0];
  payload += '=' * ((4 - payload.length % 4) % 4);
  try {
    final decodificado = utf8.decode(base64Url.decode(payload));
    return jsonDecode(decodificado) as Map<String, dynamic>;
  } catch (_) {
    return null;
  }
}

class ApiClient {
  static const _claveCookie = 'sesion_cookie';
  static const _claveNombre = 'sesion_nombre';
  static const _claveRole = 'sesion_role';

  static Future<Sesion?> cargarSesionGuardada() async {
    final prefs = await SharedPreferences.getInstance();
    return Sesion.fromMap({
      'cookie': prefs.getString(_claveCookie),
      'nombre': prefs.getString(_claveNombre),
      'role': prefs.getString(_claveRole),
    });
  }

  static Future<void> guardarSesion(Sesion sesion) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_claveCookie, sesion.cookie);
    await prefs.setString(_claveNombre, sesion.nombre);
    await prefs.setString(_claveRole, sesion.role);
  }

  static Future<void> borrarSesion() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_claveCookie);
    await prefs.remove(_claveNombre);
    await prefs.remove(_claveRole);
  }

  /// Intenta iniciar sesión contra el mismo backend web. Devuelve la Sesion
  /// si funcionó, o null si el usuario/contraseña están mal.
  static Future<Sesion?> login(String username, String password) async {
    final peticion = http.Request('POST', Uri.parse('$baseUrl/login'))
      ..followRedirects = false
      ..bodyFields = {'username': username, 'password': password};
    final streamed = await peticion.send();
    await streamed.stream.drain<void>();

    if (streamed.statusCode != 303) return null;
    final setCookie = streamed.headers['set-cookie'];
    if (setCookie == null) return null;

    final cookie = setCookie.split(';').first;
    final datos = _decodificarPayloadCookie(setCookie);
    if (datos == null) return null;

    final sesion = Sesion(
      cookie: cookie,
      nombre: datos['nombre'] as String? ?? username,
      role: datos['role'] as String? ?? '',
    );
    await guardarSesion(sesion);
    return sesion;
  }

  /// Trae el resumen de asistencias propias del usuario logueado: total
  /// histórico, si ya marcó hoy, y las últimas fechas marcadas.
  static Future<Map<String, dynamic>?> misAsistencias(Sesion sesion) async {
    try {
      final resp = await http.get(
        Uri.parse('$baseUrl/api/asistencia/mias'),
        headers: {'Cookie': sesion.cookie},
      );
      if (resp.statusCode != 200) return null;
      return jsonDecode(resp.body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// Trae los pedidos en vivo para la pantalla de Cocina (pagados del turno
  /// actual + cuentas pendientes), igual que la pestaña Cocina del sistema web.
  static Future<List<Map<String, dynamic>>?> pedidosCocina(Sesion sesion) async {
    try {
      final resp = await http.get(
        Uri.parse('$baseUrl/api/cocina/pedidos'),
        headers: {'Cookie': sesion.cookie},
      );
      if (resp.statusCode != 200) return null;
      final datos = jsonDecode(resp.body);
      if (datos is! List) return null;
      return datos.cast<Map<String, dynamic>>();
    } catch (_) {
      return null;
    }
  }

  /// Llamados de la caja ("Llamar a cocina") que todavía nadie respondió.
  static Future<List<Map<String, dynamic>>?> llamadosCocina(Sesion sesion) async {
    try {
      final resp = await http.get(Uri.parse('$baseUrl/api/cocina/llamados'), headers: {'Cookie': sesion.cookie});
      if (resp.statusCode != 200) return null;
      final datos = jsonDecode(resp.body);
      if (datos is! List) return null;
      return datos.cast<Map<String, dynamic>>();
    } catch (_) {
      return null;
    }
  }

  /// "Ya voy": avisa a la caja que alguien vio el llamado y va para allá.
  static Future<bool> marcarLlamadoVisto(Sesion sesion, int id) async {
    try {
      final resp = await http.post(Uri.parse('$baseUrl/api/cocina/llamados/$id/visto'), headers: {'Cookie': sesion.cookie});
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Trae la lista de turnos (Control de Turnos), solo para admins.
  static Future<List<Map<String, dynamic>>?> turnos(Sesion sesion) async {
    try {
      final resp = await http.get(Uri.parse('$baseUrl/api/turnos'), headers: {'Cookie': sesion.cookie});
      if (resp.statusCode != 200) return null;
      final datos = jsonDecode(resp.body);
      if (datos is! List) return null;
      return datos.cast<Map<String, dynamic>>();
    } catch (_) {
      return null;
    }
  }

  /// Trae el detalle de un turno (ventas, movimientos de caja, resumen de
  /// pagos), solo para admins.
  static Future<Map<String, dynamic>?> turnoDetalle(Sesion sesion, int id) async {
    try {
      final resp = await http.get(Uri.parse('$baseUrl/api/turnos/$id'), headers: {'Cookie': sesion.cookie});
      if (resp.statusCode != 200) return null;
      final datos = jsonDecode(resp.body);
      if (datos is! Map<String, dynamic>) return null;
      return datos;
    } catch (_) {
      return null;
    }
  }

  /// Escanea el QR de asistencia: pega el token al endpoint del backend
  /// usando la cookie de la sesión guardada.
  static Future<Map<String, dynamic>> marcarAsistencia(Sesion sesion, String token) async {
    final resp = await http.post(
      Uri.parse('$baseUrl/api/asistencia/marcar?token=$token'),
      headers: {'Cookie': sesion.cookie},
    );
    if (resp.statusCode == 303 || resp.statusCode == 401) {
      return {'ok': false, 'error': 'Tu sesión expiró. Volvé a iniciar sesión.'};
    }
    try {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    } catch (_) {
      return {'ok': false, 'error': 'No se pudo leer la respuesta del servidor.'};
    }
  }
}

/// Un QR de asistencia válido apunta siempre a esta ruta del backend; el
/// token va en la query string.
String? extraerTokenAsistencia(String contenidoQr) {
  final uri = Uri.tryParse(contenidoQr);
  if (uri == null || !uri.path.endsWith('/api/asistencia/marcar')) return null;
  return uri.queryParameters['token'];
}
