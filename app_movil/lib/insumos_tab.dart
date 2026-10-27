import 'package:flutter/material.dart';

import 'api_client.dart';

const _colorAcento = Color(0xFFD97706);
const _colorTarjeta = Color(0xFF161616);
const _colorLinea = Color(0xFF2A2A2A);

String _cantidad(num v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();

String _diaMes(String iso) {
  final d = DateTime.parse(iso);
  return '${d.day}/${d.month}';
}

/// Anchos relativos de las columnas de la planilla:
/// PRODUCTO · INGRESO · FECHA · USO · CANT. FINAL.
const _flexColumnas = [30, 18, 16, 24, 20];

/// Pestaña "Insumos" (todos los usuarios), igual que la planilla de Excel:
/// arriba la fila fija de títulos y abajo una fila por cada insumo que se
/// agrega (producto, cantidad que ingresó, fecha, para qué se usó y cuánto
/// quedó). Tocando "Uso" o "Cant. final" se anotan después.
class InsumosTab extends StatefulWidget {
  final Sesion sesion;
  /// Solo para pruebas: reemplaza la consulta al servidor.
  final Future<Map<String, dynamic>?> Function(String? mes)? cargarDatos;
  const InsumosTab({super.key, required this.sesion, this.cargarDatos});

  @override
  State<InsumosTab> createState() => _InsumosTabState();
}

class _InsumosTabState extends State<InsumosTab> {
  Map<String, dynamic>? _datos;
  String? _mes;
  bool _cargando = true;
  bool _huboError = false;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar({String? mes}) async {
    setState(() => _cargando = _datos == null);
    final datos = await (widget.cargarDatos ?? (m) => ApiClient.insumos(widget.sesion, mes: m))(mes ?? _mes);
    if (!mounted) return;
    setState(() {
      _cargando = false;
      _huboError = datos == null;
      if (datos != null) {
        _datos = datos;
        _mes = datos['mes'] as String;
      }
    });
  }

  void _aviso(String texto, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor: error ? Colors.red.shade800 : const Color(0xFF15803D),
      content: Text(texto, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
    ));
  }

  Future<void> _nuevaFila() async {
    final datos = _datos;
    if (datos == null) return;
    final guardado = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF111111),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _FormularioInsumo(sesion: widget.sesion, datos: datos),
    );
    if (guardado == true) {
      _aviso('Insumo agregado ✓');
      // Vuelve al mes actual para que se vea la fila recién cargada.
      _cargar(mes: (_datos?['hoy'] as String).substring(0, 7));
    }
  }

  Future<void> _eliminar(Map<String, dynamic> c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _colorTarjeta,
        title: const Text('¿Eliminar esta fila?', style: TextStyle(color: Colors.white)),
        content: Text('${c['detalle']} — ingreso ${_cantidad(c['cantidad'] as num)}',
            style: const TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final error = await ApiClient.eliminarInsumo(widget.sesion, c['id'] as int);
    if (!mounted) return;
    if (error != null) {
      _aviso(error, error: true);
    } else {
      _aviso('Fila eliminada');
      _cargar();
    }
  }

  /// Pide para qué se usó el insumo (ej. BROWNIE).
  Future<void> _anotarUso(Map<String, dynamic> c) async {
    final ctrl = TextEditingController(text: (c['para_que'] as String?) ?? '');
    final valor = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _colorTarjeta,
        title: Text('¿Para qué se usó ${c['detalle']}?', style: const TextStyle(color: Colors.white, fontSize: 18)),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          style: const TextStyle(color: Colors.white, fontSize: 18),
          decoration: const InputDecoration(labelText: 'Uso', hintText: 'Ej: BROWNIE'),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _colorAcento),
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    if (valor == null) return;
    final error = await ApiClient.anotarUsoInsumo(widget.sesion, c['id'] as int, valor.trim());
    if (!mounted) return;
    if (error != null) {
      _aviso(error, error: true);
    } else {
      _aviso('Uso anotado ✓');
      _cargar();
    }
  }

  /// Pide cuánto queda del insumo, con atajos "Se acabó" y "Está entero".
  Future<void> _anotarFinal(Map<String, dynamic> c) async {
    final inicial = c['cantidad'] as num;
    final medida = (c['medida'] as String?) ?? '';
    final actual = c['cantidad_final'] as num?;
    final ctrl = TextEditingController(text: actual == null ? '' : _cantidad(actual));
    final valor = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setD) {
        final n = double.tryParse(ctrl.text.trim().replaceAll(',', '.'));
        final fuera = n != null && (n < 0 || n > inicial);
        return AlertDialog(
          backgroundColor: _colorTarjeta,
          title: Text('¿Cuánto queda de ${c['detalle']}?', style: const TextStyle(color: Colors.white, fontSize: 18)),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Ingresaron ${_cantidad(inicial)} $medida', style: const TextStyle(color: Colors.white54)),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
              decoration: InputDecoration(labelText: 'Cantidad final', suffixText: medida),
              onChanged: (_) => setD(() {}),
              onSubmitted: (v) => Navigator.pop(ctx, v),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: OutlinedButton(onPressed: () => Navigator.pop(ctx, '0'), child: const Text('Se acabó (0)')),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, _cantidad(inicial)),
                  child: const Text('Está entero'),
                ),
              ),
            ]),
            if (n != null) ...[
              const SizedBox(height: 12),
              Text(
                fuera ? 'Tiene que estar entre 0 y ${_cantidad(inicial)}.' : 'Se usaron ${_cantidad(inicial - n)} $medida',
                style: TextStyle(color: fuera ? Colors.redAccent : _colorAcento, fontWeight: FontWeight.bold),
              ),
            ],
          ]),
          actions: [
            if (actual != null)
              TextButton(
                onPressed: () => Navigator.pop(ctx, ''),
                child: Text('Borrar', style: TextStyle(color: Colors.red.shade300)),
              ),
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: _colorAcento),
              onPressed: () => Navigator.pop(ctx, ctrl.text),
              child: const Text('Guardar'),
            ),
          ],
        );
      }),
    );
    if (valor == null) return;
    final error = await ApiClient.anotarFinalInsumo(widget.sesion, c['id'] as int, valor.trim());
    if (!mounted) return;
    if (error != null) {
      _aviso(error, error: true);
    } else {
      _aviso(valor.trim().isEmpty ? 'Cantidad final borrada' : 'Cantidad final anotada ✓');
      _cargar();
    }
  }

  void _verDetalle(Map<String, dynamic> c) {
    final medida = (c['medida'] as String?) ?? '';
    final fin = c['cantidad_final'] as num?;
    final usado = c['uso'] as num?;
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF111111),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Fila N° ${c['nro']}', style: const TextStyle(color: Colors.white38, fontSize: 12)),
              Text(c['detalle'] as String,
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              _filaDetalle(Icons.input, 'Ingreso', '${_cantidad(c['cantidad'] as num)} $medida'),
              _filaDetalle(Icons.event, 'Fecha', _diaMes(c['fecha'] as String)),
              _filaDetalle(Icons.restaurant, 'Uso', (c['para_que'] as String?) ?? '—', alTocar: () {
                Navigator.pop(ctx);
                _anotarUso(c);
              }),
              _filaDetalle(Icons.inventory_2_outlined, 'Cant. final', fin == null ? '—' : '${_cantidad(fin)} $medida',
                  alTocar: () {
                Navigator.pop(ctx);
                _anotarFinal(c);
              }),
              if (usado != null) _filaDetalle(Icons.trending_down, 'Se usaron', '${_cantidad(usado)} $medida'),
              _filaDetalle(Icons.edit_note, 'Lo cargó', (c['responsable'] as String?) ?? '—'),
              if (c['puede_eliminar'] == true) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red.shade300,
                      side: BorderSide(color: Colors.red.shade300),
                      padding: const EdgeInsets.all(14),
                    ),
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Eliminar esta fila'),
                    onPressed: () {
                      Navigator.pop(ctx);
                      _eliminar(c);
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _filaDetalle(IconData icono, String etiqueta, String valor, {VoidCallback? alTocar}) {
    return InkWell(
      onTap: alTocar,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icono, color: _colorAcento, size: 18),
          const SizedBox(width: 10),
          SizedBox(width: 92, child: Text(etiqueta, style: const TextStyle(color: Colors.white38, fontSize: 13))),
          Expanded(child: Text(valor, style: const TextStyle(color: Colors.white, fontSize: 14))),
          if (alTocar != null) const Icon(Icons.edit, color: Colors.white24, size: 16),
        ]),
      ),
    );
  }

  /// Una celda de la planilla. Las que se pueden tocar (Uso, Cant. final)
  /// muestran "Anotar" en naranja mientras estén vacías.
  Widget _celda(int columna, Widget hijo, {VoidCallback? alTocar, bool ultima = false}) {
    final contenido = Container(
      constraints: const BoxConstraints(minHeight: 48),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
      alignment: columna == 0 || columna == 3 ? Alignment.centerLeft : Alignment.center,
      decoration: BoxDecoration(
        border: Border(right: ultima ? BorderSide.none : const BorderSide(color: _colorLinea)),
      ),
      child: hijo,
    );
    return Expanded(
      flex: _flexColumnas[columna],
      child: alTocar == null ? contenido : InkWell(onTap: alTocar, child: contenido),
    );
  }

  Widget _encabezado() {
    const estilo = TextStyle(color: _colorAcento, fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 0.3);
    const titulos = ['PRODUCTO', 'INGRESO', 'FECHA', 'USO', 'CANT. FINAL'];
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF241A0C),
        border: Border(bottom: BorderSide(color: _colorAcento, width: 1.5)),
      ),
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = 0; i < titulos.length; i++)
            _celda(i, Text(titulos[i], style: estilo, textAlign: i == 0 || i == 3 ? TextAlign.left : TextAlign.center),
                ultima: i == titulos.length - 1),
        ]),
      ),
    );
  }

  Widget _fila(Map<String, dynamic> c, int indice) {
    final medida = (c['medida'] as String?) ?? '';
    final uso = c['para_que'] as String?;
    final fin = c['cantidad_final'] as num?;
    const blanco = TextStyle(color: Colors.white, fontSize: 14);
    const anotar = TextStyle(color: _colorAcento, fontSize: 12, fontWeight: FontWeight.bold);
    Widget numero(num v) => Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_cantidad(v), style: blanco.copyWith(fontWeight: FontWeight.bold, fontSize: 15)),
          if (medida.isNotEmpty && medida != 'UNIDAD')
            Text(medida.toLowerCase(),
                style: const TextStyle(color: Colors.white38, fontSize: 10), overflow: TextOverflow.ellipsis),
        ]);
    return Container(
      color: indice.isEven ? _colorTarjeta : const Color(0xFF1B1B1B),
      child: InkWell(
        onTap: () => _verDetalle(c),
        child: Container(
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _colorLinea))),
          child: IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _celda(0, Text(c['detalle'] as String, style: blanco.copyWith(fontWeight: FontWeight.w600))),
              _celda(1, numero(c['cantidad'] as num)),
              _celda(2, Text(_diaMes(c['fecha'] as String), style: const TextStyle(color: Colors.white70, fontSize: 13))),
              _celda(3, Text(uso ?? 'Anotar', style: uso == null ? anotar : blanco), alTocar: () => _anotarUso(c)),
              _celda(4, fin == null ? const Text('Anotar', style: anotar) : numero(fin),
                  alTocar: () => _anotarFinal(c), ultima: true),
            ]),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) return const Center(child: CircularProgressIndicator(color: _colorAcento));
    final datos = _datos;
    if (datos == null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('No se pudo cargar Control de Insumos.', style: TextStyle(color: Colors.white38)),
          TextButton(onPressed: _cargar, child: const Text('Reintentar')),
        ]),
      );
    }
    // El servidor las manda de la más nueva a la más vieja; en la planilla
    // van en orden de carga, como en el Excel.
    final filas = (datos['compras'] as List).cast<Map<String, dynamic>>().reversed.toList();
    final mesSiguiente = datos['mes_siguiente'] as String?;

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _colorAcento,
        foregroundColor: Colors.white,
        onPressed: _nuevaFila,
        icon: const Icon(Icons.add),
        label: const Text('Agregar insumo', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // Mes
          Row(children: [
            IconButton(
              icon: const Icon(Icons.chevron_left, color: Colors.white70),
              onPressed: () => _cargar(mes: datos['mes_anterior'] as String),
            ),
            Expanded(
              child: Column(children: [
                Text(datos['mes_nombre'] as String,
                    style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                Text('${filas.length} ${filas.length == 1 ? 'insumo' : 'insumos'}',
                    style: const TextStyle(color: Colors.white38, fontSize: 12)),
              ]),
            ),
            IconButton(
              icon: Icon(Icons.chevron_right, color: mesSiguiente == null ? Colors.white12 : Colors.white70),
              onPressed: mesSiguiente == null ? null : () => _cargar(mes: mesSiguiente),
            ),
          ]),
          if (_huboError)
            const Padding(
              padding: EdgeInsets.only(bottom: 6),
              child: Text('Sin conexión: mostrando lo último que se cargó.',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.orangeAccent, fontSize: 12)),
            ),
          const SizedBox(height: 4),
          // Planilla: la fila de títulos queda fija y las filas bajan.
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: _colorTarjeta,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                border: Border.all(color: _colorLinea),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _encabezado(),
                Expanded(
                  child: RefreshIndicator(
                    color: _colorAcento,
                    onRefresh: _cargar,
                    child: filas.isEmpty
                        ? ListView(children: const [
                            Padding(
                              padding: EdgeInsets.only(top: 60),
                              child: Text('Todavía no hay insumos este mes.\nToca "Agregar insumo" para cargar el primero.',
                                  textAlign: TextAlign.center, style: TextStyle(color: Colors.white38)),
                            ),
                          ])
                        : ListView.builder(
                            padding: const EdgeInsets.only(bottom: 96),
                            itemCount: filas.length,
                            itemBuilder: (_, i) => _fila(filas[i], i),
                          ),
                  ),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Formulario para agregar una fila: producto (con sugerencias de lo de
/// siempre), cantidad que ingresó, fecha, uso y, si ya se sabe, la cantidad
/// final.
class _FormularioInsumo extends StatefulWidget {
  final Sesion sesion;
  final Map<String, dynamic> datos;
  const _FormularioInsumo({required this.sesion, required this.datos});

  @override
  State<_FormularioInsumo> createState() => _FormularioInsumoState();
}

class _FormularioInsumoState extends State<_FormularioInsumo> {
  TextEditingController? _producto;
  int _versionListas = 0;
  final _ingreso = TextEditingController();
  final _uso = TextEditingController();
  final _final = TextEditingController();
  late DateTime _fecha;
  late List<String> _medidas;
  String? _medida;
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fecha = DateTime.parse(widget.datos['hoy'] as String);
    _medidas = (widget.datos['medidas'] as List).cast<String>();
    _medida = _medidas.contains('UNIDAD') ? 'UNIDAD' : (_medidas.isNotEmpty ? _medidas.first : null);
  }

  double? _num(TextEditingController c) => double.tryParse(c.text.trim().replaceAll(',', '.'));

  Future<void> _elegirFecha() async {
    final hoy = DateTime.parse(widget.datos['hoy'] as String);
    final elegida = await showDatePicker(
      context: context,
      initialDate: _fecha,
      firstDate: hoy.subtract(const Duration(days: 365)),
      lastDate: hoy,
    );
    if (elegida != null) setState(() => _fecha = elegida);
  }

  Future<void> _nuevaMedida() async {
    final ctrl = TextEditingController();
    final nombre = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _colorTarjeta,
        title: const Text('Nueva medida', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(hintText: 'Ej: MAPLE'),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _colorAcento),
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            child: const Text('Agregar'),
          ),
        ],
      ),
    );
    // Siempre se redibuja el desplegable: si se canceló, vuelve a mostrar
    // lo que estaba elegido en vez de "+ Otra…".
    setState(() => _versionListas++);
    if (nombre == null || nombre.trim().isEmpty) return;
    final guardado = await ApiClient.agregarReferenciaInsumo(widget.sesion, 'medidas', nombre.trim());
    if (guardado == null || !mounted) return;
    setState(() {
      _versionListas++;
      if (!_medidas.contains(guardado)) _medidas = [..._medidas, guardado]..sort();
      _medida = guardado;
    });
  }

  Future<void> _guardar() async {
    final producto = _producto?.text.trim() ?? '';
    final ingreso = _num(_ingreso);
    final fin = _final.text.trim().isEmpty ? null : _num(_final);
    if (producto.isEmpty) {
      setState(() => _error = 'Escribe el producto.');
      return;
    }
    if (ingreso == null || ingreso <= 0) {
      setState(() => _error = 'La cantidad de ingreso tiene que ser mayor a 0.');
      return;
    }
    if (_final.text.trim().isNotEmpty && (fin == null || fin < 0 || fin > ingreso)) {
      setState(() => _error = 'La cantidad final tiene que estar entre 0 y ${_cantidad(ingreso)}.');
      return;
    }
    String dos(int n) => n.toString().padLeft(2, '0');
    setState(() {
      _guardando = true;
      _error = null;
    });
    final error = await ApiClient.registrarInsumo(widget.sesion, {
      'fecha': '${_fecha.year}-${dos(_fecha.month)}-${dos(_fecha.day)}',
      'detalle': producto,
      'cantidad': ingreso.toString(),
      'medida': _medida ?? '',
      'uso': _uso.text.trim(),
      'cantidad_final': fin?.toString() ?? '',
    });
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context, true);
    } else {
      setState(() {
        _guardando = false;
        _error = error;
      });
    }
  }

  InputDecoration _deco(String etiqueta, {String? ayuda, Widget? sufijo}) => InputDecoration(
        labelText: etiqueta,
        hintText: ayuda,
        suffixIcon: sufijo,
        filled: true,
        fillColor: const Color(0xFF1C1C1C),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      );

  @override
  Widget build(BuildContext context) {
    final frecuentes = (widget.datos['detalles_frecuentes'] as List).cast<String>();
    final hoy = DateTime.parse(widget.datos['hoy'] as String);
    final esHoy = _fecha.year == hoy.year && _fecha.month == hoy.month && _fecha.day == hoy.day;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                    width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 14),
              const Text('Agregar insumo',
                  style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),

              // Producto, con sugerencias de lo de siempre
              Autocomplete<String>(
                optionsBuilder: (v) {
                  final q = v.text.trim().toLowerCase();
                  if (q.isEmpty) return const Iterable<String>.empty();
                  return frecuentes.where((d) => d.toLowerCase().contains(q)).take(6);
                },
                fieldViewBuilder: (context, ctrl, foco, alEnviar) {
                  _producto = ctrl;
                  return TextField(
                    controller: ctrl,
                    focusNode: foco,
                    textCapitalization: TextCapitalization.characters,
                    style: const TextStyle(color: Colors.white),
                    decoration: _deco('Producto', ayuda: 'Ej: HUEVOS'),
                  );
                },
              ),
              const SizedBox(height: 12),

              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _ingreso,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(color: Colors.white),
                    decoration: _deco('Ingreso cantidad', ayuda: 'Ej: 30'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('medida-$_medida-$_versionListas'),
                    initialValue: _medida,
                    isExpanded: true,
                    dropdownColor: const Color(0xFF1C1C1C),
                    decoration: _deco('Medida'),
                    items: [
                      for (final m in _medidas) DropdownMenuItem(value: m, child: Text(m)),
                      const DropdownMenuItem(value: '__nueva__', child: Text('+ Otra medida…', style: TextStyle(color: _colorAcento))),
                    ],
                    onChanged: (v) {
                      if (v == '__nueva__') {
                        _nuevaMedida();
                      } else {
                        setState(() => _medida = v);
                      }
                    },
                  ),
                ),
              ]),
              const SizedBox(height: 12),

              // Fecha
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: _elegirFecha,
                child: InputDecorator(
                  decoration: _deco('Fecha', sufijo: const Icon(Icons.calendar_month, color: _colorAcento)),
                  child: Text(
                    esHoy ? 'Hoy (${_fecha.day}/${_fecha.month})' : '${_fecha.day}/${_fecha.month}/${_fecha.year}',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _uso,
                textCapitalization: TextCapitalization.characters,
                style: const TextStyle(color: Colors.white),
                decoration: _deco('Uso (para qué)', ayuda: 'Ej: BROWNIE'),
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _final,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(color: Colors.white),
                decoration: _deco('Cantidad final (opcional)', ayuda: 'Se puede anotar después'),
              ),

              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ],
              const SizedBox(height: 18),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: _colorAcento, padding: const EdgeInsets.all(16)),
                onPressed: _guardando ? null : _guardar,
                icon: _guardando
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.check),
                label: Text(_guardando ? 'Guardando…' : 'Guardar fila',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
