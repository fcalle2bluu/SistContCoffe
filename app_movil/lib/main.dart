import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'api_client.dart';
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

  @override
  void initState() {
    super.initState();
    _revisarActualizaciones();
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _version = 'v${info.version}');
    });
  }

  Future<void> _revisarActualizaciones({bool mostrarSiNoHay = false}) async {
    final info = await revisarSiHayActualizacion();
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
                child: Text(_version ?? '', style: const TextStyle(color: Colors.white38, fontSize: 12)),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: IndexedStack(
          index: _tab,
          children: [
            _AsistenciaTab(sesion: widget.sesion, onLogout: widget.onLogout),
            _CocinaTab(sesion: widget.sesion),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF141414),
        indicatorColor: _colorAcento.withValues(alpha: 0.25),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.qr_code_scanner), label: 'Asistencia'),
          NavigationDestination(icon: Icon(Icons.restaurant), label: 'Cocina'),
        ],
      ),
    );
  }
}

/// Pestaña de asistencia: escanear el QR y ver el resumen propio (igual que
/// la única pantalla que tenía la app antes de agregar Cocina).
class _AsistenciaTab extends StatefulWidget {
  final Sesion sesion;
  final VoidCallback onLogout;
  const _AsistenciaTab({required this.sesion, required this.onLogout});

  @override
  State<_AsistenciaTab> createState() => _AsistenciaTabState();
}

class _AsistenciaTabState extends State<_AsistenciaTab> {
  Map<String, dynamic>? _resumen;
  bool _cargandoResumen = true;

  @override
  void initState() {
    super.initState();
    _cargarResumen();
  }

  Future<void> _cargarResumen() async {
    setState(() => _cargandoResumen = true);
    final resumen = await ApiClient.misAsistencias(widget.sesion);
    if (!mounted) return;
    setState(() {
      _resumen = resumen;
      _cargandoResumen = false;
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
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: ok ? Colors.green.shade700 : Colors.red.shade700,
        content: Text(ok
            ? '¡Asistencia registrada, ${resultado['nombre']}!'
            : (resultado['error'] as String? ?? 'No se pudo registrar la asistencia.')),
      ),
    );
    _cargarResumen();
  }

  String _formatearFechaHora(String iso) {
    final dt = DateTime.parse(iso).toLocal();
    String dos(int n) => n.toString().padLeft(2, '0');
    return '${dos(dt.day)}/${dos(dt.month)} ${dos(dt.hour)}:${dos(dt.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final total = _resumen?['total'] as int?;
    final yaHoy = _resumen?['ya_hoy'] as bool? ?? false;
    final ultimas = (_resumen?['ultimas'] as List?)?.cast<String>() ?? const <String>[];

    return RefreshIndicator(
      onRefresh: _cargarResumen,
      color: _colorAcento,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 8),
          const Icon(Icons.qr_code_scanner, color: _colorAcento, size: 64),
          const SizedBox(height: 16),
          Text('Hola, ${widget.sesion.nombre}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text(
            'Escaneá el código QR que muestra el encargado para registrar tu asistencia de hoy.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white60),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _abrirEscaner,
              style: FilledButton.styleFrom(backgroundColor: _colorAcento, padding: const EdgeInsets.all(18)),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Escanear QR de asistencia'),
            ),
          ),
          const SizedBox(height: 28),
          if (_cargandoResumen)
            const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator(color: _colorAcento)))
          else if (_resumen == null)
            const Text('No se pudo cargar tu historial de asistencia.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white38))
          else ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  Column(children: [
                    Text('$total', style: const TextStyle(color: _colorAcento, fontSize: 28, fontWeight: FontWeight.bold)),
                    const Text('Asistencias totales', style: TextStyle(color: Colors.white60, fontSize: 12)),
                  ]),
                  Column(children: [
                    Icon(yaHoy ? Icons.check_circle : Icons.radio_button_unchecked,
                        color: yaHoy ? Colors.greenAccent : Colors.white38, size: 28),
                    Text(yaHoy ? 'Ya marcaste hoy' : 'Todavía no marcaste hoy',
                        style: const TextStyle(color: Colors.white60, fontSize: 12)),
                  ]),
                ],
              ),
            ),
            if (ultimas.isNotEmpty) ...[
              const SizedBox(height: 20),
              const Align(alignment: Alignment.centerLeft, child: Text('Últimas veces', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold))),
              const SizedBox(height: 8),
              ...ultimas.map((iso) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      const Icon(Icons.history, color: Colors.white38, size: 16),
                      const SizedBox(width: 8),
                      Text(_formatearFechaHora(iso), style: const TextStyle(color: Colors.white70)),
                    ]),
                  )),
            ],
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
  List<Map<String, dynamic>> _pedidos = [];
  Set<int> _vistos = {};
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
    final idsActuales = pedidos.map((p) => p['id'] as int).toSet();
    if (!_primeraCarga && idsActuales.difference(_vistos).isNotEmpty) {
      _alertar();
    }
    _primeraCarga = false;
    _vistos = idsActuales;
    setState(() {
      _pedidos = pedidos;
      _cargando = false;
      _huboError = false;
    });
  }

  void _alertar() {
    for (final delay in [0, 260, 520]) {
      Future.delayed(Duration(milliseconds: delay), () => SystemSound.play(SystemSoundType.alert));
    }
    for (final delay in [0, 300, 600]) {
      Future.delayed(Duration(milliseconds: delay), () => HapticFeedback.vibrate());
    }
  }

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
                                  style: const TextStyle(color: Colors.white70)),
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
