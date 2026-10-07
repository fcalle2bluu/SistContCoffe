import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'api_client.dart';
import 'insumos_tab.dart';
import 'llamados.dart';
import 'turnos_tab.dart';
import 'update_checker.dart';

void main() {
  runApp(const YanalomaApp());
}

const _colorAcento = Color(0xFFD97706);
const _colorFondo = Color(0xFF0A0A0A);

class YanalomaApp extends StatelessWidget {
  const YanalomaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Asistencia Yanaloma',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: _colorAcento,
        scaffoldBackgroundColor: _colorFondo,
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      home: const _Arranque(),
    );
  }
}

/// Decide, al abrir la app, si ya hay una sesión guardada o hace falta login.
class _Arranque extends StatefulWidget {
  const _Arranque();

  @override
  State<_Arranque> createState() => _ArranqueState();
}

class _ArranqueState extends State<_Arranque> {
  Sesion? _sesion;
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    ApiClient.cargarSesionGuardada().then((sesion) {
      setState(() {
        _sesion = sesion;
        _cargando = false;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: _colorAcento)));
    }
    if (_sesion == null) {
      return LoginScreen(onLogin: (s) => setState(() => _sesion = s));
    }
    return _HomeShell(sesion: _sesion!, onLogout: () => setState(() => _sesion = null));
  }
}

class LoginScreen extends StatefulWidget {
  final void Function(Sesion) onLogin;
  const LoginScreen({super.key, required this.onLogin});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usuarioCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _enviando = false;
  String? _error;

  Future<void> _iniciarSesion() async {
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      final sesion = await ApiClient.login(_usuarioCtrl.text.trim(), _passwordCtrl.text);
      if (sesion == null) {
        setState(() => _error = 'Usuario o contraseña incorrectos.');
      } else {
        widget.onLogin(sesion);
      }
    } catch (_) {
      setState(() => _error = 'No se pudo conectar. Revisá tu internet.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('CAFÉ YANALOMA', style: TextStyle(color: Colors.white54, letterSpacing: 2)),
                const SizedBox(height: 4),
                const Text('Asistencia', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                const SizedBox(height: 32),
                TextField(
                  controller: _usuarioCtrl,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(labelText: 'Usuario'),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordCtrl,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(labelText: 'Contraseña'),
                  obscureText: true,
                  onSubmitted: (_) => _enviando ? null : _iniciarSesion(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _enviando ? null : _iniciarSesion,
                    style: FilledButton.styleFrom(backgroundColor: _colorAcento, padding: const EdgeInsets.all(16)),
                    child: _enviando
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Iniciar sesión'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Contenedor de las dos pestañas de la app (Asistencia y Cocina), con la
/// barra superior compartida que muestra la versión instalada.
class _HomeShell extends StatefulWidget {
  final Sesion sesion;
  final VoidCallback onLogout;
  const _HomeShell({required this.sesion, required this.onLogout});

  @override
  State<_HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<_HomeShell> {
  int _tab = 0;
  String? _version;
  InfoActualizacion? _actualizacionDisponible;
  Timer? _timerActualizacion;
  late final VigilanteLlamados _llamados;

  @override
  void initState() {
    super.initState();
    _llamados = VigilanteLlamados(sesion: widget.sesion, alCambiar: () {
      if (mounted) setState(() {});
    })
      ..iniciar();
    _revisarActualizaciones();
    _timerActualizacion = Timer.periodic(const Duration(minutes: 2), (_) => _chequeoSilencioso());
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _version = 'v${info.version}');
    });
  }

  @override
  void dispose() {
    _timerActualizacion?.cancel();
    _llamados.detener();
    super.dispose();
  }

  Future<void> _yaVoy(int id) async {
    await _llamados.responder(id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      backgroundColor: Color(0xFF15803D),
      content: Text('Listo: la caja ya sabe que vas.', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
    ));
  }

  /// Chequeo de fondo (sin diálogo) para que la esquina de arriba muestre
  /// "Actualizar" apenas exista una versión nueva, sin que el usuario tenga
  /// que tocar nada.
  Future<void> _chequeoSilencioso() async {
    final info = await revisarSiHayActualizacion();
    if (mounted) setState(() => _actualizacionDisponible = info);
  }

  Future<void> _revisarActualizaciones({bool mostrarSiNoHay = false}) async {
    final info = await revisarSiHayActualizacion();
    if (mounted) setState(() => _actualizacionDisponible = info);
    if (info == null) {
      if (mostrarSiNoHay && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ya tenés la última versión instalada.')),
        );
      }
      return;
    }
    if (!mounted) return;

    final aceptar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF161616),
        title: const Text('Actualización disponible', style: TextStyle(color: Colors.white)),
        content: Text(
          'Hay una nueva versión de la app (${info.tag}). ¿Descargarla e instalarla ahora?',
          style: const TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Después')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _colorAcento),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Actualizar'),
          ),
        ],
      ),
    );
    if (aceptar != true || !mounted) return;

    final progreso = ValueNotifier<double>(0);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF161616),
        content: ValueListenableBuilder<double>(
          valueListenable: progreso,
          builder: (_, valor, _) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Descargando actualización...', style: TextStyle(color: Colors.white70)),
              const SizedBox(height: 12),
              LinearProgressIndicator(value: valor == 0 ? null : valor, color: _colorAcento),
            ],
          ),
        ),
      ),
    );
    try {
      await descargarEInstalarActualizacion(info, (p) => progreso.value = p);
    } catch (_) {
      // Si falla la descarga simplemente se queda en la versión actual;
      // se vuelve a ofrecer la próxima vez que abra la app.
    } finally {
      if (mounted) Navigator.of(context, rootNavigator: true).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final esAdmin = widget.sesion.role == 'admin';
    final paginas = [
      _AsistenciaTab(sesion: widget.sesion, onLogout: widget.onLogout),
      _CocinaTab(sesion: widget.sesion),
      InsumosTab(sesion: widget.sesion),
      if (esAdmin) TurnosTab(sesion: widget.sesion),
    ];
    final destinos = [
      const NavigationDestination(icon: Icon(Icons.qr_code_scanner), label: 'Asistencia'),
      const NavigationDestination(icon: Icon(Icons.restaurant), label: 'Cocina'),
      const NavigationDestination(icon: Icon(Icons.inventory_2_outlined), label: 'Insumos'),
      if (esAdmin) const NavigationDestination(icon: Icon(Icons.point_of_sale), label: 'Turnos'),
    ];
    final tabActual = _tab < paginas.length ? _tab : 0;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: _colorFondo,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: const SizedBox.shrink(),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(right: 16),
              child: GestureDetector(
                onTap: () => _revisarActualizaciones(mostrarSiNoHay: true),
                child: _actualizacionDisponible != null
                    ? const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.arrow_circle_up, color: _colorAcento, size: 16),
                          SizedBox(width: 4),
                          Text('Actualizar', style: TextStyle(color: _colorAcento, fontSize: 12, fontWeight: FontWeight.bold)),
                        ],
                      )
                    : Text(_version ?? '', style: const TextStyle(color: Colors.white38, fontSize: 12)),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            for (final l in _llamados.pendientes)
              BannerLlamado(
                llamadoPor: '${l['llamado_por']}',
                onYaVoy: () => _yaVoy(l['id'] as int),
              ),
            Expanded(
              child: IndexedStack(
                index: tabActual,
                children: paginas,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF141414),
        indicatorColor: _colorAcento.withValues(alpha: 0.25),
        selectedIndex: tabActual,
        onDestinationSelected: (i) {
          // En Cocina la pantalla no se apaga: si se apaga, la app deja de
          // consultar pedidos y no puede sonar.
          WakelockPlus.toggle(enable: i == 1);
          setState(() => _tab = i);
        },
        destinations: destinos,
      ),
    );
  }
}

String _claveFecha(DateTime d) {
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${dos(d.month)}-${dos(d.day)}';
}

String _formatearDuracion(int segundosTotales) {
  final h = segundosTotales ~/ 3600;
  final m = (segundosTotales % 3600) ~/ 60;
  final s = segundosTotales % 60;
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${h}h ${dos(m)}m ${dos(s)}s';
}

/// Segundos trabajados en ese día: null si el día sigue abierto (todavía sin
/// salida) o si no hay entrada registrada.
int? _segundosDelDia(Map<String, dynamic> dia) {
  final entradaIso = dia['entrada'] as String?;
  final salidaIso = dia['salida'] as String?;
  if (entradaIso == null || salidaIso == null) return null;
  return DateTime.parse(salidaIso).difference(DateTime.parse(entradaIso)).inSeconds;
}

const _nombresMes = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const _nombresMesCorto = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/// Pestaña de asistencia: escanear el QR (entrada/salida), ver el contador de
/// horas trabajadas, el calendario del mes y el historial completo.
class _AsistenciaTab extends StatefulWidget {
  final Sesion sesion;
  final VoidCallback onLogout;
  const _AsistenciaTab({required this.sesion, required this.onLogout});

  @override
  State<_AsistenciaTab> createState() => _AsistenciaTabState();
}

class _AsistenciaTabState extends State<_AsistenciaTab> {
  List<Map<String, dynamic>> _dias = [];
  bool _cargando = true;
  bool _huboError = false;

  @override
  void initState() {
    super.initState();
    _cargarHistorial();
  }

  Future<void> _cargarHistorial() async {
    setState(() => _cargando = true);
    final resumen = await ApiClient.misAsistencias(widget.sesion);
    if (!mounted) return;
    if (resumen == null) {
      setState(() {
        _huboError = true;
        _cargando = false;
      });
      return;
    }
    setState(() {
      _dias = (resumen['dias'] as List? ?? []).cast<Map<String, dynamic>>();
      _huboError = false;
      _cargando = false;
    });
  }

  Future<void> _cerrarSesion() async {
    await ApiClient.borrarSesion();
    widget.onLogout();
  }

  Future<void> _abrirEscaner() async {
    final resultado = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => _EscanerPage(sesion: widget.sesion)),
    );
    if (resultado == null || !mounted) return;
    final ok = resultado['ok'] == true;
    final tipo = resultado['tipo'] as String?;
    final etiquetaTipo = tipo == 'salida' ? 'Salida' : 'Entrada';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: ok ? Colors.green.shade700 : Colors.red.shade700,
        content: Text(ok
            ? '¡$etiquetaTipo registrada, ${resultado['nombre']}!'
            : (resultado['error'] as String? ?? 'No se pudo registrar la asistencia.')),
      ),
    );
    _cargarHistorial();
  }

  String _formatearHora(String? iso) {
    if (iso == null) return '—';
    final dt = DateTime.parse(iso).toLocal();
    String dos(int n) => n.toString().padLeft(2, '0');
    return '${dos(dt.hour)}:${dos(dt.minute)}';
  }

  String _formatearFecha(String fechaIso) {
    final partes = fechaIso.split('-');
    final dia = int.parse(partes[2]);
    final mes = int.parse(partes[1]);
    return '$dia ${_nombresMesCorto[mes - 1]} ${partes[0]}';
  }

  Widget _estadoHoy() {
    final hoyIso = _claveFecha(DateTime.now());
    Map<String, dynamic>? dia;
    for (final d in _dias) {
      if (d['fecha'] == hoyIso) {
        dia = d;
        break;
      }
    }
    String texto;
    Color color;
    if (dia == null) {
      texto = 'Todavía no registraste tu entrada hoy.';
      color = Colors.white60;
    } else if (dia['salida'] == null) {
      texto = 'Entrada registrada — falta tu salida.';
      color = Colors.orangeAccent;
    } else {
      final segundos = _segundosDelDia(dia);
      texto = 'Jornada de hoy completa (${segundos != null ? _formatearDuracion(segundos) : "—"}).';
      color = Colors.greenAccent;
    }
    return Text(texto, textAlign: TextAlign.center, style: TextStyle(color: color, fontSize: 13));
  }

  @override
  Widget build(BuildContext context) {
    final diasPorFecha = {for (final d in _dias) d['fecha'] as String: d};

    return RefreshIndicator(
      onRefresh: _cargarHistorial,
      color: _colorAcento,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Hola, ${widget.sesion.nombre}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _abrirEscaner,
              style: FilledButton.styleFrom(backgroundColor: _colorAcento, padding: const EdgeInsets.all(16)),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Escanear QR de asistencia'),
            ),
          ),
          const SizedBox(height: 10),
          _estadoHoy(),
          const SizedBox(height: 20),
          if (_cargando)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: _colorAcento)))
          else if (_huboError)
            const Text('No se pudo cargar tu historial de asistencia.',
                textAlign: TextAlign.center, style: TextStyle(color: Colors.white38))
          else ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 24),
              decoration: BoxDecoration(
                color: _colorAcento.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _colorAcento.withValues(alpha: 0.35)),
              ),
              child: _ContadorHoras(dias: _dias),
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(16)),
              child: _CalendarioAsistencia(diasPorFecha: diasPorFecha),
            ),
            const SizedBox(height: 24),
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('Historial completo', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 8),
            if (_dias.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text('Todavía no tenés asistencias registradas.', style: TextStyle(color: Colors.white38)),
              )
            else
              ..._dias.map((dia) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(10)),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(_formatearFecha(dia['fecha'] as String), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                        Row(children: [
                          const Icon(Icons.login, color: Colors.greenAccent, size: 14),
                          const SizedBox(width: 3),
                          Text(_formatearHora(dia['entrada'] as String?), style: const TextStyle(color: Colors.white70, fontSize: 13)),
                          const SizedBox(width: 12),
                          const Icon(Icons.logout, color: Colors.orangeAccent, size: 14),
                          const SizedBox(width: 3),
                          Text(_formatearHora(dia['salida'] as String?), style: const TextStyle(color: Colors.white70, fontSize: 13)),
                        ]),
                        Text(
                          () {
                            final segundos = _segundosDelDia(dia);
                            return segundos != null ? _formatearDuracion(segundos) : '—';
                          }(),
                          style: const TextStyle(color: _colorAcento, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ],
                    ),
                  )),
          ],
          const SizedBox(height: 24),
          Center(
            child: TextButton(onPressed: _cerrarSesion, child: const Text('Cerrar sesión', style: TextStyle(color: Colors.white38))),
          ),
        ],
      ),
    );
  }
}

/// Contador grande de horas trabajadas, con segundos. Si la jornada de hoy
/// sigue abierta (hay entrada pero no salida), tiquea en vivo cada segundo.
class _ContadorHoras extends StatefulWidget {
  final List<Map<String, dynamic>> dias;
  const _ContadorHoras({required this.dias});

  @override
  State<_ContadorHoras> createState() => _ContadorHorasState();
}

class _ContadorHorasState extends State<_ContadorHoras> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _reprogramarTicker();
  }

  @override
  void didUpdateWidget(covariant _ContadorHoras oldWidget) {
    super.didUpdateWidget(oldWidget);
    _reprogramarTicker();
  }

  void _reprogramarTicker() {
    _ticker?.cancel();
    _ticker = _hayJornadaAbiertaHoy()
        ? Timer.periodic(const Duration(seconds: 1), (_) {
            if (mounted) setState(() {});
          })
        : null;
  }

  bool _hayJornadaAbiertaHoy() {
    final hoyIso = _claveFecha(DateTime.now());
    for (final d in widget.dias) {
      if (d['fecha'] == hoyIso && d['entrada'] != null && d['salida'] == null) return true;
    }
    return false;
  }

  int _segundosTotales() {
    var total = 0;
    final hoyIso = _claveFecha(DateTime.now());
    for (final d in widget.dias) {
      final entradaIso = d['entrada'] as String?;
      if (entradaIso == null) continue;
      final salidaIso = d['salida'] as String?;
      final entrada = DateTime.parse(entradaIso);
      if (salidaIso != null) {
        total += DateTime.parse(salidaIso).difference(entrada).inSeconds;
      } else if (d['fecha'] == hoyIso) {
        total += DateTime.now().difference(entrada).inSeconds;
      }
    }
    return total;
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(_formatearDuracion(_segundosTotales()),
            style: const TextStyle(color: _colorAcento, fontSize: 34, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        const Text('Horas trabajadas en total', style: TextStyle(color: Colors.white60, fontSize: 13)),
      ],
    );
  }
}

/// Calendario mensual simple: cada día se colorea según si esa fecha tiene
/// jornada completa (entrada+salida), solo entrada, o nada, con navegación
/// entre meses para ver el historial completo.
class _CalendarioAsistencia extends StatefulWidget {
  final Map<String, Map<String, dynamic>> diasPorFecha;
  const _CalendarioAsistencia({required this.diasPorFecha});

  @override
  State<_CalendarioAsistencia> createState() => _CalendarioAsistenciaState();
}

class _CalendarioAsistenciaState extends State<_CalendarioAsistencia> {
  late DateTime _mes;

  @override
  void initState() {
    super.initState();
    final ahora = DateTime.now();
    _mes = DateTime(ahora.year, ahora.month, 1);
  }

  void _cambiarMes(int delta) => setState(() => _mes = DateTime(_mes.year, _mes.month + delta, 1));

  @override
  Widget build(BuildContext context) {
    final primerDiaSemana = _mes.weekday; // 1 = lunes ... 7 = domingo
    final diasEnMes = DateTime(_mes.year, _mes.month + 1, 0).day;
    final hoy = DateTime.now();

    final celdas = <Widget>[];
    for (var i = 1; i < primerDiaSemana; i++) {
      celdas.add(const SizedBox());
    }
    for (var dia = 1; dia <= diasEnMes; dia++) {
      final fecha = DateTime(_mes.year, _mes.month, dia);
      final info = widget.diasPorFecha[_claveFecha(fecha)];
      final Color color;
      if (info == null) {
        color = Colors.white.withValues(alpha: 0.06);
      } else if (info['entrada'] != null && info['salida'] != null) {
        color = Colors.green.shade700;
      } else {
        color = Colors.orange.shade700;
      }
      final esHoy = fecha.year == hoy.year && fecha.month == hoy.month && fecha.day == hoy.day;
      celdas.add(Container(
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(6),
          border: esHoy ? Border.all(color: Colors.white, width: 1.5) : null,
        ),
        alignment: Alignment.center,
        child: Text('$dia', style: TextStyle(color: info == null ? Colors.white38 : Colors.white, fontSize: 12)),
      ));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(onPressed: () => _cambiarMes(-1), icon: const Icon(Icons.chevron_left, color: Colors.white70)),
            Text('${_nombresMes[_mes.month - 1]} ${_mes.year}',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            IconButton(onPressed: () => _cambiarMes(1), icon: const Icon(Icons.chevron_right, color: Colors.white70)),
          ],
        ),
        const Row(
          children: [
            Expanded(child: Center(child: Text('L', style: TextStyle(color: Colors.white38, fontSize: 11)))),
            Expanded(child: Center(child: Text('M', style: TextStyle(color: Colors.white38, fontSize: 11)))),
            Expanded(child: Center(child: Text('X', style: TextStyle(color: Colors.white38, fontSize: 11)))),
            Expanded(child: Center(child: Text('J', style: TextStyle(color: Colors.white38, fontSize: 11)))),
            Expanded(child: Center(child: Text('V', style: TextStyle(color: Colors.white38, fontSize: 11)))),
            Expanded(child: Center(child: Text('S', style: TextStyle(color: Colors.white38, fontSize: 11)))),
            Expanded(child: Center(child: Text('D', style: TextStyle(color: Colors.white38, fontSize: 11)))),
          ],
        ),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.3,
          children: celdas,
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 14,
          runSpacing: 6,
          children: [
            _leyenda(Colors.green.shade700, 'Completo'),
            _leyenda(Colors.orange.shade700, 'Solo entrada'),
            _leyenda(Colors.white.withValues(alpha: 0.06), 'Sin marca'),
          ],
        ),
      ],
    );
  }

  Widget _leyenda(Color color, String texto) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 12, height: 12, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
      const SizedBox(width: 4),
      Text(texto, style: const TextStyle(color: Colors.white60, fontSize: 11)),
    ]);
  }
}

/// Pestaña de Cocina: la misma vista en vivo que la del sistema web (pedidos
/// pagados del turno actual + cuentas pendientes), solo lectura, con sonido
/// y vibración cuando aparece un pedido nuevo. Se actualiza sola cada 4s.
class _CocinaTab extends StatefulWidget {
  final Sesion sesion;
  const _CocinaTab({required this.sesion});

  @override
  State<_CocinaTab> createState() => _CocinaTabState();
}

class _CocinaTabState extends State<_CocinaTab> {
  Timer? _temporizador;
  final AudioPlayer _reproductor = crearReproductorAlarma();
  List<Map<String, dynamic>> _pedidos = [];
  /// Cantidad de productos de COCINA (comida y pastelería; lo de barra no
  /// suena) que tenía cada pedido en la consulta anterior: suena si aparece
  /// un pedido con algo de cocina o si a una mesa le agregan más.
  Map<int, double> _vistos = {};
  bool _primeraCarga = true;
  bool _cargando = true;
  bool _huboError = false;

  @override
  void initState() {
    super.initState();
    _cargar();
    _temporizador = Timer.periodic(const Duration(seconds: 4), (_) => _cargar());
  }

  @override
  void dispose() {
    _temporizador?.cancel();
    _reproductor.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    final pedidos = await ApiClient.pedidosCocina(widget.sesion);
    if (!mounted) return;
    if (pedidos == null) {
      setState(() {
        _huboError = true;
        _cargando = false;
      });
      return;
    }
    final actuales = {
      for (final p in pedidos)
        p['id'] as int: (p['cant_cocina'] as num?)?.toDouble() ??
            (p['productos'] as List).fold<double>(0, (t, it) => t + ((it as Map)['cantidad'] as num).toDouble()),
    };
    final hayNuevo = actuales.entries.any((e) => e.value > (_vistos[e.key] ?? 0));
    if (!_primeraCarga && hayNuevo) {
      _alertar();
    }
    _primeraCarga = false;
    _vistos = actuales;
    setState(() {
      _pedidos = pedidos;
      _cargando = false;
      _huboError = false;
    });
  }

  Future<void> _alertar() => sonarAlarma(_reproductor, 'alerta_cocina.wav');

  String _formatearHora(String? iso) {
    if (iso == null) return '';
    final dt = DateTime.parse(iso).toLocal();
    String dos(int n) => n.toString().padLeft(2, '0');
    return '${dos(dt.hour)}:${dos(dt.minute)}';
  }

  String _formatearCantidad(dynamic cantidad) {
    if (cantidad is num) {
      return cantidad == cantidad.roundToDouble() ? cantidad.toInt().toString() : cantidad.toString();
    }
    return '$cantidad';
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Center(child: CircularProgressIndicator(color: _colorAcento));
    }
    if (_huboError && _pedidos.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('No se pudo conectar con el sistema.', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white38)),
        ),
      );
    }
    return Column(children: [
      Align(
        alignment: Alignment.centerRight,
        child: TextButton.icon(
          onPressed: _alertar,
          icon: const Icon(Icons.volume_up, color: _colorAcento, size: 18),
          label: const Text('Probar sonido', style: TextStyle(color: _colorAcento)),
        ),
      ),
      Expanded(child: _lista()),
    ]);
  }

  Widget _lista() {
    return RefreshIndicator(
      onRefresh: _cargar,
      color: _colorAcento,
      child: _pedidos.isEmpty
          ? ListView(
              children: const [
                Padding(
                  padding: EdgeInsets.only(top: 120),
                  child: Text(
                    'No hay pedidos pendientes de cocinar por ahora.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white38, fontSize: 16),
                  ),
                ),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _pedidos.length,
              itemBuilder: (_, i) {
                final p = _pedidos[i];
                final pendiente = p['pendiente'] as bool;
                final productos = (p['productos'] as List).cast<Map<String, dynamic>>();
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: pendiente ? Colors.orange.withValues(alpha: 0.12) : Colors.green.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: pendiente ? Colors.orange.withValues(alpha: 0.4) : Colors.green.withValues(alpha: 0.35)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${p['mesa']}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: pendiente ? Colors.orange.shade700 : Colors.green.shade700,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(pendiente ? 'PENDIENTE' : 'PAGADO',
                                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      if (productos.isEmpty)
                        const Text('Sin productos', style: TextStyle(color: Colors.white38, fontSize: 13))
                      else
                        ...productos.map((it) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              child: Text('${_formatearCantidad(it['cantidad'])}× ${it['nombre']}',
                                  style: it['cocina'] == false
                                      ? const TextStyle(color: Colors.white38)
                                      : const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                            )),
                      const SizedBox(height: 10),
                      Text(_formatearHora(p['hora'] as String?), style: const TextStyle(color: Colors.white38, fontSize: 12)),
                    ],
                  ),
                );
              },
            ),
    );
  }
}

class _EscanerPage extends StatefulWidget {
  final Sesion sesion;
  const _EscanerPage({required this.sesion});

  @override
  State<_EscanerPage> createState() => _EscanerPageState();
}

class _EscanerPageState extends State<_EscanerPage> {
  final MobileScannerController _controller = MobileScannerController();
  bool _procesando = false;

  Future<void> _onDetect(BarcodeCapture captura) async {
    if (_procesando) return;
    final valor = captura.barcodes.firstOrNull?.rawValue;
    if (valor == null) return;

    final token = extraerTokenAsistencia(valor);
    if (token == null) return;

    setState(() => _procesando = true);
    final resultado = await ApiClient.marcarAsistencia(widget.sesion, token);
    if (mounted) Navigator.of(context).pop(resultado);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: _colorFondo,
        title: const Text('Escaneando...'),
      ),
      body: Stack(
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          if (_procesando) const Center(child: CircularProgressIndicator(color: _colorAcento)),
        ],
      ),
    );
  }
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
