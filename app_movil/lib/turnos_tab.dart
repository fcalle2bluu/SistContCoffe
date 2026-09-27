import 'package:flutter/material.dart';

import 'api_client.dart';

const _colorAcento = Color(0xFFD97706);
const _colorFondo = Color(0xFF0A0A0A);

String _formatearFechaHora(String? iso) {
  if (iso == null) return '—';
  final dt = DateTime.parse(iso).toLocal();
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${dos(dt.day)}/${dos(dt.month)} ${dos(dt.hour)}:${dos(dt.minute)}';
}

String _formatearHora(String? iso) {
  if (iso == null) return '—';
  final dt = DateTime.parse(iso).toLocal();
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${dos(dt.hour)}:${dos(dt.minute)}';
}

String _bs(num? v) => v == null ? '—' : 'Bs ${v.toStringAsFixed(2)}';

/// Pestaña "Control de Turnos" (solo admin): lista compacta de turnos, cada
/// uno como tarjeta (sin tablas ni scroll horizontal) que lleva al detalle.
class TurnosTab extends StatefulWidget {
  final Sesion sesion;
  const TurnosTab({super.key, required this.sesion});

  @override
  State<TurnosTab> createState() => _TurnosTabState();
}

class _TurnosTabState extends State<TurnosTab> {
  List<Map<String, dynamic>> _turnos = [];
  bool _cargando = true;
  bool _huboError = false;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    final turnos = await ApiClient.turnos(widget.sesion);
    if (!mounted) return;
    if (turnos == null) {
      setState(() {
        _huboError = true;
        _cargando = false;
      });
      return;
    }
    setState(() {
      _turnos = turnos;
      _huboError = false;
      _cargando = false;
    });
  }

  Widget _dato(IconData icono, String texto) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icono, color: _colorAcento, size: 14),
      const SizedBox(width: 4),
      Text(texto, style: const TextStyle(color: Colors.white70, fontSize: 12)),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Center(child: CircularProgressIndicator(color: _colorAcento));
    }
    if (_huboError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('No se pudo cargar Control de Turnos.',
              textAlign: TextAlign.center, style: const TextStyle(color: Colors.white38)),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _cargar,
      color: _colorAcento,
      child: _turnos.isEmpty
          ? ListView(
              children: const [
                Padding(
                  padding: EdgeInsets.only(top: 120),
                  child: Text('Todavía no hay turnos registrados.',
                      textAlign: TextAlign.center, style: TextStyle(color: Colors.white38)),
                ),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _turnos.length,
              itemBuilder: (_, i) {
                final t = _turnos[i];
                final abierto = t['estado'] == 'abierto';
                return InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => TurnoDetallePage(
                        sesion: widget.sesion,
                        turnoId: t['id'] as int,
                        numero: t['numero'] as int,
                      ),
                    ),
                  ),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: abierto ? Colors.greenAccent.withValues(alpha: 0.4) : Colors.white12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Turno #${t['numero']}',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: abierto ? Colors.green.shade700 : Colors.white24,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(abierto ? 'ABIERTO' : 'CERRADO',
                                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text('${t['responsable']}', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                        const SizedBox(height: 8),
                        Wrap(spacing: 16, runSpacing: 4, children: [
                          _dato(Icons.receipt_long, '${t['cantidad_ventas']} ventas'),
                          _dato(Icons.payments, _bs(t['total_ventas'] as num?)),
                          _dato(Icons.swap_horiz, '${t['cantidad_movimientos']} mov.'),
                        ]),
                        const SizedBox(height: 6),
                        Text(
                          abierto
                              ? 'Abierto ${_formatearFechaHora(t['abierto_en'] as String?)}'
                              : '${_formatearFechaHora(t['abierto_en'] as String?)} → ${_formatearFechaHora(t['cerrado_en'] as String?)}',
                          style: const TextStyle(color: Colors.white38, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}

/// Detalle de un turno: resumen de montos, ventas por tipo de pago, lista de
/// ventas y de movimientos de caja. Todo en columnas que se envuelven solas
/// (Wrap/Column), nunca en tablas, para que no haga falta scrollear al costado.
class TurnoDetallePage extends StatefulWidget {
  final Sesion sesion;
  final int turnoId;
  final int numero;
  const TurnoDetallePage({super.key, required this.sesion, required this.turnoId, required this.numero});

  @override
  State<TurnoDetallePage> createState() => _TurnoDetallePageState();
}

class _TurnoDetallePageState extends State<TurnoDetallePage> {
  Map<String, dynamic>? _detalle;
  bool _cargando = true;
  bool _huboError = false;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    final detalle = await ApiClient.turnoDetalle(widget.sesion, widget.turnoId);
    if (!mounted) return;
    if (detalle == null) {
      setState(() {
        _huboError = true;
        _cargando = false;
      });
      return;
    }
    setState(() {
      _detalle = detalle;
      _huboError = false;
      _cargando = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _colorFondo,
      appBar: AppBar(backgroundColor: _colorFondo, title: Text('Turno #${widget.numero}')),
      body: _cargando
          ? const Center(child: CircularProgressIndicator(color: _colorAcento))
          : (_huboError || _detalle == null)
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('No se pudo cargar el turno.', style: const TextStyle(color: Colors.white38)),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _cargar,
                  color: _colorAcento,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: _construirContenido(),
                  ),
                ),
    );
  }

  List<Widget> _construirContenido() {
    final turno = _detalle!['turno'] as Map<String, dynamic>;
    final resumen = _detalle!['resumen'] as Map<String, dynamic>;
    final resumenPagos = (_detalle!['resumen_pagos'] as Map).cast<String, dynamic>();
    final ordenes = (_detalle!['ordenes'] as List).cast<Map<String, dynamic>>();
    final movimientos = (_detalle!['movimientos'] as List).cast<Map<String, dynamic>>();
    final abierto = turno['estado'] == 'abierto';
    final estadoArqueo = resumen['estado_arqueo'] as String?;

    return [
      _tarjeta(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Expanded(
                child: Text('${turno['responsable']}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: abierto ? Colors.green.shade700 : Colors.white24,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(abierto ? 'ABIERTO' : 'CERRADO',
                    style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
              ),
            ]),
            const SizedBox(height: 6),
            Text(
              abierto
                  ? 'Abierto ${_formatearFechaHora(turno['abierto_en'] as String?)}'
                  : '${_formatearFechaHora(turno['abierto_en'] as String?)} → ${_formatearFechaHora(turno['cerrado_en'] as String?)}',
              style: const TextStyle(color: Colors.white60, fontSize: 12),
            ),
            const SizedBox(height: 14),
            Wrap(spacing: 24, runSpacing: 10, children: [
              _stat('Monto inicial', _bs(turno['monto_inicial'] as num?)),
              _stat('Monto final declarado', _bs(turno['monto_final_declarado'] as num?)),
              _stat('Efectivo teórico', _bs(resumen['efectivo_teorico'] as num?)),
            ]),
            if (estadoArqueo != null) ...[
              const SizedBox(height: 12),
              _chipArqueo(estadoArqueo, (resumen['diferencia_arqueo'] as num).toDouble()),
            ],
          ],
        ),
      ),
      const SizedBox(height: 14),
      _tarjeta(
        titulo: 'Resumen del turno',
        child: Wrap(spacing: 24, runSpacing: 10, children: [
          _stat('Ventas', _bs(resumen['ventas_totales'] as num?)),
          _stat('Egresos', _bs(resumen['egresos_totales'] as num?)),
          _stat('Ingresos a caja', _bs(resumen['ingresos_caja_totales'] as num?)),
          _stat('Reposiciones', _bs(resumen['reposiciones_totales'] as num?)),
        ]),
      ),
      if (resumenPagos.isNotEmpty) ...[
        const SizedBox(height: 14),
        _tarjeta(
          titulo: 'Ventas por tipo de pago',
          child: Column(
            children: resumenPagos.entries.map((e) {
              final v = e.value as Map<String, dynamic>;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('${e.key} (${v['cantidad']})', style: const TextStyle(color: Colors.white70)),
                  Text(_bs(v['monto'] as num?), style: const TextStyle(color: _colorAcento, fontWeight: FontWeight.bold)),
                ]),
              );
            }).toList(),
          ),
        ),
      ],
      const SizedBox(height: 14),
      _tarjeta(
        titulo: 'Ventas (${ordenes.length})',
        child: ordenes.isEmpty
            ? const Text('Sin ventas en este turno.', style: TextStyle(color: Colors.white38, fontSize: 13))
            : Column(children: ordenes.map(_filaOrden).toList()),
      ),
      const SizedBox(height: 14),
      _tarjeta(
        titulo: 'Movimientos de caja (${movimientos.length})',
        child: movimientos.isEmpty
            ? const Text('Sin movimientos de caja en este turno.', style: TextStyle(color: Colors.white38, fontSize: 13))
            : Column(children: movimientos.map(_filaMovimiento).toList()),
      ),
      const SizedBox(height: 16),
    ];
  }

  Widget _filaOrden(Map<String, dynamic> o) {
    final estado = o['estado'] as String;
    final Color color;
    switch (estado) {
      case 'cobrada':
        color = Colors.greenAccent;
        break;
      case 'cancelada':
        color = Colors.redAccent;
        break;
      default:
        color = Colors.orangeAccent;
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 4), child: Icon(Icons.circle, color: color, size: 8)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Mesa ${o['mesa']} · ${o['tipo_pago'] ?? estado}',
                    style: const TextStyle(color: Colors.white70, fontSize: 13)),
                Text('${o['responsable']} · ${_formatearHora(o['hora'] as String?)}',
                    style: const TextStyle(color: Colors.white38, fontSize: 11)),
              ],
            ),
          ),
          Text(_bs(o['total'] as num?), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _filaMovimiento(Map<String, dynamic> m) {
    final tipo = m['tipo'] as String;
    final esEgreso = tipo == 'egreso';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Icon(esEgreso ? Icons.arrow_upward : Icons.arrow_downward,
                color: esEgreso ? Colors.redAccent : Colors.greenAccent, size: 14),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${m['motivo'] ?? m['categoria'] ?? tipo}', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                Text('${m['responsable']} · ${_formatearHora(m['hora'] as String?)}',
                    style: const TextStyle(color: Colors.white38, fontSize: 11)),
              ],
            ),
          ),
          Text(_bs(m['monto'] as num?),
              style: TextStyle(color: esEgreso ? Colors.redAccent : Colors.greenAccent, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _chipArqueo(String estado, double diferencia) {
    final Color color;
    final String texto;
    switch (estado) {
      case 'completo':
        color = Colors.green.shade700;
        texto = 'Arqueo completo';
        break;
      case 'sobra':
        color = Colors.blue.shade700;
        texto = 'Sobran ${diferencia.toStringAsFixed(2)} Bs';
        break;
      default:
        color = Colors.red.shade700;
        texto = 'Faltan ${diferencia.toStringAsFixed(2)} Bs';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
      child: Text(texto, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
    );
  }

  Widget _stat(String etiqueta, String valor) {
    return SizedBox(
      width: 150,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(valor, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
          Text(etiqueta, style: const TextStyle(color: Colors.white38, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _tarjeta({String? titulo, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (titulo != null) ...[
            Text(titulo, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 10),
          ],
          child,
        ],
      ),
    );
  }
}
