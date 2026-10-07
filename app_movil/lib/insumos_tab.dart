import 'package:flutter/material.dart';

import 'api_client.dart';

const _colorAcento = Color(0xFFD97706);
const _colorTarjeta = Color(0xFF161616);

String _bs(num v) => 'Bs ${v.toStringAsFixed(2)}';

String _cantidad(num v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();

const _diasSemana = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const _meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

String _tituloDia(String iso, String hoyIso) {
  final d = DateTime.parse(iso);
  final hoy = DateTime.parse(hoyIso);
  if (iso == hoyIso) return 'Hoy';
  if (hoy.difference(d).inDays == 1) return 'Ayer';
  return '${_diasSemana[d.weekday - 1][0].toUpperCase()}${_diasSemana[d.weekday - 1].substring(1)} ${d.day} ${_meses[d.month - 1]}';
}

/// Pestaña "Insumos" (todos los usuarios): lo mismo que Control de Insumos
/// de la web — compras del mes agrupadas por día, con su total, y un botón
/// grande para registrar una compra nueva.
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

  Future<void> _nuevaCompra() async {
    final datos = _datos;
    if (datos == null) return;
    final guardado = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF111111),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _FormularioCompra(sesion: widget.sesion, datos: datos),
    );
    if (guardado == true) {
      _aviso('Compra registrada ✓');
      // Vuelve al mes actual para que se vea la compra recién cargada.
      _cargar(mes: (_datos?['hoy'] as String).substring(0, 7));
    }
  }

  Future<void> _eliminar(Map<String, dynamic> c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _colorTarjeta,
        title: const Text('¿Eliminar esta compra?', style: TextStyle(color: Colors.white)),
        content: Text('${c['detalle']} — ${_bs(c['total'] as num)}', style: const TextStyle(color: Colors.white70)),
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
      _aviso('Compra eliminada');
      _cargar();
    }
  }

  void _verDetalle(Map<String, dynamic> c) {
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
              Text(c['detalle'] as String,
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text(_bs(c['total'] as num),
                  style: const TextStyle(color: _colorAcento, fontSize: 26, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              _filaDetalle(Icons.event, 'Fecha', _tituloDia(c['fecha'] as String, _datos!['hoy'] as String)),
              _filaDetalle(Icons.scale, 'Cantidad',
                  '${_cantidad(c['cantidad'] as num)} ${c['medida'] ?? ''} × ${_bs(c['precio_unitario'] as num)}'),
              _filaDetalle(Icons.receipt_long, 'Respaldo', (c['respaldo'] as String?) ?? 'Sin respaldo'),
              _filaDetalle(Icons.person_outline, 'Lo pidió', (c['solicitante'] as String?) ?? '—'),
              _filaDetalle(Icons.edit_note, 'Lo registró', (c['responsable'] as String?) ?? '—'),
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
                    label: const Text('Eliminar esta compra'),
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

  Widget _filaDetalle(IconData icono, String etiqueta, String valor) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icono, color: _colorAcento, size: 18),
        const SizedBox(width: 10),
        SizedBox(width: 92, child: Text(etiqueta, style: const TextStyle(color: Colors.white38, fontSize: 13))),
        Expanded(child: Text(valor, style: const TextStyle(color: Colors.white, fontSize: 14))),
      ]),
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
    final compras = (datos['compras'] as List).cast<Map<String, dynamic>>();
    final porDia = <String, List<Map<String, dynamic>>>{};
    for (final c in compras) {
      porDia.putIfAbsent(c['fecha'] as String, () => []).add(c);
    }
    final mesSiguiente = datos['mes_siguiente'] as String?;

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _colorAcento,
        foregroundColor: Colors.white,
        onPressed: _nuevaCompra,
        icon: const Icon(Icons.add_shopping_cart),
        label: const Text('Registrar compra', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: RefreshIndicator(
        color: _colorAcento,
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            // Mes y total
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: _colorTarjeta,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _colorAcento.withValues(alpha: 0.4)),
              ),
              child: Column(children: [
                Row(children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left, color: Colors.white70),
                    onPressed: () => _cargar(mes: datos['mes_anterior'] as String),
                  ),
                  Expanded(
                    child: Text(datos['mes_nombre'] as String,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                  ),
                  IconButton(
                    icon: Icon(Icons.chevron_right, color: mesSiguiente == null ? Colors.white12 : Colors.white70),
                    onPressed: mesSiguiente == null ? null : () => _cargar(mes: mesSiguiente),
                  ),
                ]),
                const SizedBox(height: 4),
                const Text('Gastado en insumos', style: TextStyle(color: Colors.white38, fontSize: 12)),
                Text(_bs(datos['total'] as num),
                    style: const TextStyle(color: _colorAcento, fontSize: 30, fontWeight: FontWeight.w800)),
                Text('${compras.length} ${compras.length == 1 ? 'compra' : 'compras'}',
                    style: const TextStyle(color: Colors.white54, fontSize: 12)),
              ]),
            ),
            if (_huboError)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Sin conexión: mostrando lo último que se cargó.',
                    textAlign: TextAlign.center, style: TextStyle(color: Colors.orangeAccent, fontSize: 12)),
              ),
            if (compras.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 60),
                child: Column(children: [
                  Icon(Icons.inventory_2_outlined, color: Colors.white24, size: 48),
                  SizedBox(height: 10),
                  Text('Todavía no hay compras este mes.\nToca "Registrar compra" para cargar la primera.',
                      textAlign: TextAlign.center, style: TextStyle(color: Colors.white38)),
                ]),
              ),
            for (final dia in porDia.entries) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
                child: Row(children: [
                  Text(_tituloDia(dia.key, datos['hoy'] as String),
                      style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
                  const Spacer(),
                  Text(_bs(dia.value.fold<num>(0, (t, c) => t + (c['total'] as num))),
                      style: const TextStyle(color: Colors.white38, fontSize: 12)),
                ]),
              ),
              for (final c in dia.value)
                Card(
                  color: _colorTarjeta,
                  margin: const EdgeInsets.only(bottom: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: ListTile(
                    onTap: () => _verDetalle(c),
                    title: Text(c['detalle'] as String,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      '${_cantidad(c['cantidad'] as num)} ${c['medida'] ?? ''} × ${_bs(c['precio_unitario'] as num)}'
                      '${c['solicitante'] != null ? ' · ${c['solicitante']}' : ''}',
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                    trailing: Text(_bs(c['total'] as num),
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Formulario para registrar una compra: lo que se compró (con sugerencias
/// de lo que se compra seguido), cantidad + medida, precio unitario con el
/// total calculado en vivo, fecha, respaldo y quién lo pidió.
class _FormularioCompra extends StatefulWidget {
  final Sesion sesion;
  final Map<String, dynamic> datos;
  const _FormularioCompra({required this.sesion, required this.datos});

  @override
  State<_FormularioCompra> createState() => _FormularioCompraState();
}

class _FormularioCompraState extends State<_FormularioCompra> {
  TextEditingController? _detalle;
  int _versionListas = 0;
  final _cantidad = TextEditingController(text: '1');
  final _precio = TextEditingController();
  final _respaldo = TextEditingController();
  late DateTime _fecha;
  late List<String> _medidas;
  late List<String> _solicitantes;
  String? _medida;
  String? _solicitante;
  bool _conFactura = false;
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fecha = DateTime.parse(widget.datos['hoy'] as String);
    _medidas = (widget.datos['medidas'] as List).cast<String>();
    _solicitantes = (widget.datos['solicitantes'] as List).cast<String>();
    _medida = _medidas.contains('UNIDAD') ? 'UNIDAD' : (_medidas.isNotEmpty ? _medidas.first : null);
    _solicitante = _solicitantes.contains(widget.sesion.nombre) ? widget.sesion.nombre : null;
    for (final c in [_cantidad, _precio]) {
      c.addListener(() => setState(() {}));
    }
  }

  double? _num(TextEditingController c) => double.tryParse(c.text.trim().replaceAll(',', '.'));

  double get _total => (_num(_cantidad) ?? 0) * (_num(_precio) ?? 0);

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

  Future<String?> _pedirNombre(String titulo, String ejemplo) {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _colorTarjeta,
        title: Text(titulo, style: const TextStyle(color: Colors.white)),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(hintText: ejemplo),
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
  }

  Future<void> _nuevaReferencia(String tipo) async {
    final esMedida = tipo == 'medidas';
    final nombre = await _pedirNombre(esMedida ? 'Nueva medida' : 'Nuevo solicitante', esMedida ? 'Ej: ONZAS' : 'Ej: Freddy');
    // Siempre se redibujan los desplegables: si se canceló, vuelven a mostrar
    // lo que estaba elegido en vez de "+ Otra…".
    setState(() => _versionListas++);
    if (nombre == null || nombre.trim().isEmpty) return;
    final guardado = await ApiClient.agregarReferenciaInsumo(widget.sesion, tipo, nombre.trim());
    if (guardado == null || !mounted) return;
    setState(() {
      _versionListas++;
      if (esMedida) {
        if (!_medidas.contains(guardado)) _medidas = [..._medidas, guardado]..sort();
        _medida = guardado;
      } else {
        if (!_solicitantes.contains(guardado)) _solicitantes = [..._solicitantes, guardado]..sort();
        _solicitante = guardado;
      }
    });
  }

  Future<void> _guardar() async {
    final cantidad = _num(_cantidad);
    final precio = _num(_precio);
    final detalle = _detalle?.text.trim() ?? '';
    if (detalle.isEmpty) {
      setState(() => _error = 'Escribe qué compraste.');
      return;
    }
    if (cantidad == null || cantidad <= 0) {
      setState(() => _error = 'La cantidad tiene que ser mayor a 0.');
      return;
    }
    if (precio == null || precio < 0) {
      setState(() => _error = 'Escribe el precio por unidad.');
      return;
    }
    String dos(int n) => n.toString().padLeft(2, '0');
    var respaldo = _respaldo.text.trim();
    if (_conFactura && respaldo.isNotEmpty && !respaldo.toLowerCase().contains('factura')) {
      respaldo = 'Según Factura N° $respaldo';
    }
    setState(() {
      _guardando = true;
      _error = null;
    });
    final error = await ApiClient.registrarInsumo(widget.sesion, {
      'fecha': '${_fecha.year}-${dos(_fecha.month)}-${dos(_fecha.day)}',
      'detalle': detalle,
      'cantidad': cantidad.toString(),
      'medida': _medida ?? '',
      'precio_unitario': precio.toString(),
      'respaldo': respaldo.isEmpty ? 'Sin respaldo' : respaldo,
      'solicitante': _solicitante ?? '',
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
              const Text('Registrar compra',
                  style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),

              // Qué se compró, con sugerencias de lo de siempre
              Autocomplete<String>(
                optionsBuilder: (v) {
                  final q = v.text.trim().toLowerCase();
                  if (q.isEmpty) return const Iterable<String>.empty();
                  return frecuentes.where((d) => d.toLowerCase().contains(q)).take(6);
                },
                fieldViewBuilder: (context, ctrl, foco, alEnviar) {
                  _detalle = ctrl;
                  return TextField(
                    controller: ctrl,
                    focusNode: foco,
                    textCapitalization: TextCapitalization.sentences,
                    style: const TextStyle(color: Colors.white),
                    decoration: _deco('¿Qué compraste?', ayuda: 'Ej: Leche deslactosada'),
                  );
                },
              ),
              const SizedBox(height: 12),

              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _cantidad,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(color: Colors.white),
                    decoration: _deco('Cantidad'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
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
                        _nuevaReferencia('medidas');
                      } else {
                        setState(() => _medida = v);
                      }
                    },
                  ),
                ),
              ]),
              const SizedBox(height: 12),

              TextField(
                controller: _precio,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(color: Colors.white),
                decoration: _deco('Precio por unidad (Bs)', ayuda: 'Ej: 8.90'),
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: _colorAcento.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(children: [
                  const Text('Total', style: TextStyle(color: Colors.white70)),
                  const Spacer(),
                  Text(_bs(_total),
                      style: const TextStyle(color: _colorAcento, fontSize: 20, fontWeight: FontWeight.w800)),
                ]),
              ),
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

              // Respaldo
              Row(children: [
                const Text('¿Tiene factura?', style: TextStyle(color: Colors.white70)),
                const Spacer(),
                ChoiceChip(
                  label: const Text('Sin factura'),
                  selected: !_conFactura,
                  onSelected: (_) => setState(() => _conFactura = false),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Con factura'),
                  selected: _conFactura,
                  selectedColor: _colorAcento.withValues(alpha: 0.4),
                  onSelected: (_) => setState(() => _conFactura = true),
                ),
              ]),
              const SizedBox(height: 8),
              TextField(
                controller: _respaldo,
                style: const TextStyle(color: Colors.white),
                decoration: _deco(
                  _conFactura ? 'N° de factura y proveedor' : 'Respaldo (opcional)',
                  ayuda: _conFactura ? 'Ej: 676683 por HIPERMAXI S.A.' : 'Ej: Recibo, nota de venta…',
                ),
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                key: ValueKey('solicitante-$_solicitante-$_versionListas'),
                initialValue: _solicitante,
                isExpanded: true,
                dropdownColor: const Color(0xFF1C1C1C),
                decoration: _deco('¿Quién lo pidió?'),
                items: [
                  for (final s in _solicitantes) DropdownMenuItem(value: s, child: Text(s)),
                  const DropdownMenuItem(value: '__nuevo__', child: Text('+ Otra persona…', style: TextStyle(color: _colorAcento))),
                ],
                onChanged: (v) {
                  if (v == '__nuevo__') {
                    _nuevaReferencia('solicitantes');
                  } else {
                    setState(() => _solicitante = v);
                  }
                },
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
                label: Text(_guardando ? 'Guardando…' : 'Guardar compra',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
