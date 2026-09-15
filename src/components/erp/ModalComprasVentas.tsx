import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save, AlertCircle } from 'lucide-react';

export default function ModalComprasVentas({ 
  isOpen, 
  onClose, 
  onSaved, 
  planCuentas = [],
  editingTransaction = null
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSaved: () => void, 
  planCuentas: any[],
  editingTransaction?: any
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    detalle: '',
    tipo_movimiento: 'INGRESO',
    categoria: 'Ventas',
    monto_total: 0,
    caja: 0,
    c_chica: 0,
    banco: 0,
    pos: 0,
    metodo_pago: 'EFECTIVO',
    tiene_factura: true,
    v_sf_cchica: 0,
    v_sf_banco: 0,
    costo_cchica: 0,
    costo_banco: 0,
    mesa: '',
    hora: '',
    responsable: '',
    pago: 0,
    cambio: 0,
    observacion: '',
    codigo_debe: '',
    codigo_haber: ''
  });

  // Load transaction in edit mode
  useEffect(() => {
    if (editingTransaction && isOpen) {
      setFormData({
        fecha: editingTransaction.fecha || new Date().toISOString().split('T')[0],
        detalle: editingTransaction.detalle || '',
        tipo_movimiento: editingTransaction.tipo_movimiento || 'INGRESO',
        categoria: editingTransaction.categoria || 'Ventas',
        monto_total: Number(editingTransaction.monto_total || 0),
        caja: Number(editingTransaction.caja || 0),
        c_chica: Number(editingTransaction.c_chica || 0),
        banco: Number(editingTransaction.banco || 0),
        pos: Number(editingTransaction.pos || 0),
        metodo_pago: editingTransaction.metodo_pago || 'EFECTIVO',
        tiene_factura: editingTransaction.tiene_factura !== false,
        v_sf_cchica: Number(editingTransaction.v_sf_cchica || 0),
        v_sf_banco: Number(editingTransaction.v_sf_banco || 0),
        costo_cchica: Number(editingTransaction.costo_cchica || 0),
        costo_banco: Number(editingTransaction.costo_banco || 0),
        mesa: editingTransaction.mesa || '',
        hora: editingTransaction.hora || '',
        responsable: editingTransaction.responsable || '',
        pago: Number(editingTransaction.pago || 0),
        cambio: Number(editingTransaction.cambio || 0),
        observacion: editingTransaction.observacion || '',
        codigo_debe: editingTransaction.codigo_debe || '',
        codigo_haber: editingTransaction.codigo_haber || ''
      });
      lastKeys.current = `${editingTransaction.tipo_movimiento}-${editingTransaction.metodo_pago}-${editingTransaction.categoria}`;
    } else if (isOpen) {
      // Reset to default for fresh record
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        detalle: '',
        tipo_movimiento: 'INGRESO',
        categoria: 'Ventas',
        monto_total: 0,
        caja: 0,
        c_chica: 0,
        banco: 0,
        pos: 0,
        metodo_pago: 'EFECTIVO',
        tiene_factura: true,
        v_sf_cchica: 0,
        v_sf_banco: 0,
        costo_cchica: 0,
        costo_banco: 0,
        mesa: '',
        hora: '',
        responsable: '',
        pago: 0,
        cambio: 0,
        observacion: '',
        codigo_debe: '',
        codigo_haber: ''
      });
      lastKeys.current = '';
    }
  }, [editingTransaction, isOpen]);

  // Auto-suggestions for DEBE and HABER based on transaction type, category, and payment method
  const lastKeys = useRef('');
  useEffect(() => {
    if (!isOpen) return;
    // If editing and we just loaded the data, skip suggestions to avoid overwriting database accounts
    if (editingTransaction && lastKeys.current === `${formData.tipo_movimiento}-${formData.metodo_pago}-${formData.categoria}`) {
      return;
    }
    const currentKeys = `${formData.tipo_movimiento}-${formData.metodo_pago}-${formData.categoria}`;
    if (lastKeys.current === currentKeys) return;
    lastKeys.current = currentKeys;

    let defaultDebe = '';
    let defaultHaber = '';
    
    const met = formData.metodo_pago.toUpperCase().trim();
    const cat = formData.categoria;
    const isIngreso = formData.tipo_movimiento === 'INGRESO';
    
    if (isIngreso) {
      // DEBE (Where money goes): Caja/Banco
      if (met === 'EFECTIVO') {
        defaultDebe = '1110102'; // Caja Chica
      } else if (met === 'QR') {
        defaultDebe = '1110103'; // Banco Bisa
      } else if (met === 'POS') {
        defaultDebe = '1110105'; // POS / Tarjeta (por cobrar)
      }
      
      // HABER (Source of revenue): Ventas/Servicios
      if (cat === 'Ventas') {
        defaultHaber = '5010101'; // VENTAS
      } else if (cat === 'Servicios') {
        defaultHaber = '1160101'; // SERVICIO DE TUESTE
      }
    } else {
      // EGRESO
      // DEBE (Where money goes/Expense): Gastos/Costos
      if (cat === 'Inventario') {
        defaultDebe = '115'; // INVENTARIOS / INVENTARIO DE MERCADERIAS
      } else if (cat === 'Insumos alimenticios') {
        defaultDebe = '11506'; // INSUMOS ALIMENTICIOS
      } else if (cat === 'Mano de obra') {
        defaultDebe = '2130103'; // OBLIGACIONES CON EL PERSONAL
      } else if (cat === 'Servicios básicos') {
        defaultDebe = '12705'; // SERVICIOS BÁSICOS
      } else if (cat === 'Costos secundarios') {
        defaultDebe = '12706'; // SERVICIOS EXTERNOS
      } else if (cat === 'IT') {
        defaultDebe = '1160103'; // Anticipo del IT
      } else if (cat === 'IVA') {
        defaultDebe = '1130203'; // CRÉDITO FISCAL
      } else if (cat === 'Otros') {
        defaultDebe = '40101'; // GASTOS ADMINISTRATIVOS
      }
      
      // HABER (Where money comes from): Caja/Banco
      if (met === 'EFECTIVO') {
        defaultHaber = '1110102'; // Caja Chica
      } else if (met === 'QR' || met === 'POS') {
        defaultHaber = '1110103'; // Banco Bisa
      }
    }
    
    setFormData(prev => ({
      ...prev,
      codigo_debe: defaultDebe,
      codigo_haber: defaultHaber
    }));
  }, [formData.tipo_movimiento, formData.metodo_pago, formData.categoria, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
      };

      // Auto-calculate cambio if payment or total values change
      if (name === 'pago' || name === 'monto_total' || ['caja', 'c_chica', 'banco', 'pos'].includes(name)) {
        const totalVal = updated.monto_total || (updated.caja + updated.c_chica + updated.banco + updated.pos);
        if (updated.pago > 0 && totalVal > 0) {
          updated.cambio = Number((updated.pago - totalVal).toFixed(2));
        }
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.codigo_debe || !formData.codigo_haber) {
      alert("Por favor seleccione ambas cuentas para cumplir con el principio de Partida Doble.");
      return;
    }

    setLoading(true);
    
    // Auto-calculate monto_total based on the specific columns if the user doesn't type it
    const totalCalc = formData.caja + formData.c_chica + formData.banco + formData.pos;
    const finalTotal = formData.monto_total || totalCalc;
    
    const finalData = {
      fecha: formData.fecha,
      detalle: formData.detalle,
      tipo_movimiento: formData.tipo_movimiento,
      categoria: formData.categoria,
      monto_total: finalTotal,
      caja: formData.caja,
      c_chica: formData.c_chica,
      banco: formData.banco,
      pos: formData.pos,
      metodo_pago: formData.metodo_pago,
      tiene_factura: formData.tiene_factura,
      v_sf_cchica: formData.v_sf_cchica,
      v_sf_banco: formData.v_sf_banco,
      costo_cchica: formData.costo_cchica,
      costo_banco: formData.costo_banco,
      mesa: formData.mesa.trim() || null,
      hora: formData.hora.trim() || null,
      responsable: formData.responsable.trim() || null,
      pago: formData.pago,
      cambio: formData.cambio,
      observacion: formData.observacion.trim() || null,
      codigo_debe: formData.codigo_debe,
      codigo_haber: formData.codigo_haber
    };

    // 1. Save Transaction (Insert or Update)
    let transaccion_id = null;
    let seatNo = null;

    if (editingTransaction) {
      transaccion_id = editingTransaction.id;
      const { error: txError } = await supabase
        .from('transacciones')
        .update(finalData)
        .eq('id', transaccion_id);
      
      if (txError) {
        setLoading(false);
        alert("Error al guardar la transacción: " + txError.message);
        return;
      }

      // Retrieve original seat number from libro_diario
      const { data: oldLd } = await supabase
        .from('libro_diario')
        .select('nro_asiento')
        .eq('transaccion_id', transaccion_id)
        .limit(1);

      if (oldLd && oldLd.length > 0) {
        seatNo = oldLd[0].nro_asiento;
      } else {
        const { data: nextSeat, error: seatError } = await supabase.rpc('siguiente_nro_asiento');
        if (seatError) {
          setLoading(false);
          alert("Error al generar el número de asiento: " + seatError.message);
          return;
        }
        seatNo = nextSeat;
      }

      // Clear previous journal entries for this transaction
      await supabase.from('libro_diario').delete().eq('transaccion_id', transaccion_id);
    } else {
      const { data: txData, error: txError } = await supabase
        .from('transacciones')
        .insert([finalData])
        .select('id')
        .single();
      
      if (txError) {
        setLoading(false);
        alert("Error al guardar la transacción: " + txError.message);
        return;
      }

      transaccion_id = txData.id;

      const { data: nextSeat, error: seatError } = await supabase.rpc('siguiente_nro_asiento');
      if (seatError) {
        setLoading(false);
        alert("Error al generar el número de asiento: " + seatError.message);
        return;
      }
      seatNo = nextSeat;
    }

    // 2. Insert Balanced Double Entry rows in 'libro_diario'
    try {
      const glosaDiario = `${formData.tipo_movimiento} Contable - ${formData.detalle || formData.categoria}`;

      const { error: ldError } = await supabase
        .from('libro_diario')
        .insert([
          {
            fecha: formData.fecha,
            nro_asiento: seatNo,
            transaccion_id: transaccion_id,
            codigo_cuenta: formData.codigo_debe,
            debe: finalTotal,
            haber: 0,
            glosa: glosaDiario
          },
          {
            fecha: formData.fecha,
            nro_asiento: seatNo,
            transaccion_id: transaccion_id,
            codigo_cuenta: formData.codigo_haber,
            debe: 0,
            haber: finalTotal,
            glosa: glosaDiario
          }
        ]);

      if (ldError) {
        throw new Error(ldError.message);
      }

      setLoading(false);
      onSaved();
      onClose();
    } catch (err: any) {
      setLoading(false);
      alert("Transacción registrada, pero falló al crear el asiento en Libro Diario: " + err.message);
    }
  };

  // Filter accounts for dropdown selectors to make them clean (showing code and name)
  const availableAccounts = planCuentas.filter(c => c.codigo && c.nombre);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-2xl shadow-black/40 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center">
          <h3 className="font-bold">Registrar Transacción (Partida Doble)</h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1 rounded"><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 text-sm text-stone-200">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1 text-stone-300">Fecha</label>
              <input type="date" name="fecha" required value={formData.fecha} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block font-bold mb-1 text-stone-300">Tipo de Movimiento</label>
              <select name="tipo_movimiento" value={formData.tipo_movimiento} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
                <option value="INGRESO">INGRESO</option>
                <option value="EGRESO">EGRESO</option>
              </select>
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold mb-1 text-stone-300">Categoría (Estado de Resultados)</label>
                <select name="categoria" value={formData.categoria} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
                  <optgroup label="INGRESOS">
                    <option value="Ventas">Ventas</option>
                    <option value="Servicios">Servicios</option>
                  </optgroup>
                  <optgroup label="COSTOS">
                    <option value="Inventario">Inventario</option>
                    <option value="Insumos alimenticios">Insumos alimenticios</option>
                    <option value="Mano de obra">Mano de obra</option>
                    <option value="Costos secundarios">Costos secundarios</option>
                  </optgroup>
                  <optgroup label="IMPUESTOS">
                    <option value="IT">IT</option>
                    <option value="IVA">IVA</option>
                  </optgroup>
                  <optgroup label="OTROS">
                    <option value="Destacado">Destacado (Gastos Extraordinarios)</option>
                    <option value="Otros">Otros</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-stone-300">Detalle / Glosa</label>
                <input type="text" name="detalle" required value={formData.detalle} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Ej: Venta de café molido, Pago energía..." />
              </div>
            </div>
          </div>

          <h4 className="font-bold border-b border-stone-800 pb-1 mb-3 text-emerald-400">Detalles Operativos</h4>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1 text-stone-300">Mesa / Ubicación</label>
              <input type="text" name="mesa" value={formData.mesa} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Ej: Mesa 3, Llevar, -" />
            </div>
            <div>
              <label className="block font-bold mb-1 text-stone-300">Hora</label>
              <input type="text" name="hora" value={formData.hora} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Ej: 07:48, 14:30" />
            </div>
            <div>
              <label className="block font-bold mb-1 text-stone-300">Responsable</label>
              <input type="text" name="responsable" value={formData.responsable} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Ej: Turno Mañana, Marco Luis" />
            </div>
          </div>

          <h4 className="font-bold border-b border-stone-800 pb-1 mb-3 text-emerald-400">Cuentas Receptoras / Emisoras (Bs)</h4>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold mb-1 text-stone-300">CAJA</label>
              <input type="number" step="0.01" name="caja" value={formData.caja} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 text-stone-300">C. CHICA</label>
              <input type="number" step="0.01" name="c_chica" value={formData.c_chica} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 text-stone-300">BANCO</label>
              <input type="number" step="0.01" name="banco" value={formData.banco} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 text-stone-300">POS</label>
              <input type="number" step="0.01" name="pos" value={formData.pos} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
          </div>

          <h4 className="font-bold border-b border-stone-800 pb-1 mb-3 text-emerald-400 flex items-center gap-1.5">
            Partida Doble (Cuentas Contables Obligatorias)
          </h4>
          <div className="grid grid-cols-2 gap-4 mb-4 bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-xl">
            <div>
              <label className="block text-xs font-black text-emerald-400 mb-1.5 uppercase tracking-wide">
                Cuenta Destino (DEBE / A dónde va) *
              </label>
              <select
                name="codigo_debe"
                required
                value={formData.codigo_debe}
                onChange={handleChange}
                className="w-full bg-stone-950 border border-emerald-900/60 rounded-lg p-2.5 font-mono text-xs text-white hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Seleccione cuenta destino (DEBE)...</option>
                {availableAccounts.map(c => (
                  <option key={c.codigo} value={c.codigo}>{c.codigo} - {c.nombre}</option>
                ))}
              </select>
              <p className="text-[9.5px] text-stone-500 mt-1">Representa el destino del dinero (Activo/Gasto).</p>
            </div>
            <div>
              <label className="block text-xs font-black text-amber-400 mb-1.5 uppercase tracking-wide">
                Cuenta Origen (HABER / De dónde viene) *
              </label>
              <select
                name="codigo_haber"
                required
                value={formData.codigo_haber}
                onChange={handleChange}
                className="w-full bg-stone-950 border border-amber-900/60 rounded-lg p-2.5 font-mono text-xs text-white hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="">Seleccione cuenta origen (HABER)...</option>
                {availableAccounts.map(c => (
                  <option key={c.codigo} value={c.codigo}>{c.codigo} - {c.nombre}</option>
                ))}
              </select>
              <p className="text-[9.5px] text-stone-500 mt-1">Representa el origen de los fondos (Caja/Ingreso/Pasivo).</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1 text-stone-300">Monto Total Oficial</label>
              <input type="number" step="0.01" name="monto_total" value={formData.monto_total} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-amber-400 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-bold" />
            </div>
            <div>
              <label className="block font-bold mb-1 text-stone-300">Método de Pago</label>
              <input type="text" name="metodo_pago" value={formData.metodo_pago} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="EFECTIVO, QR..." />
            </div>
            <div className="flex items-center mt-6">
              <input type="checkbox" id="tiene_factura" name="tiene_factura" checked={formData.tiene_factura} onChange={handleChange} className="mr-2 h-4 w-4 accent-emerald-600" />
              <label htmlFor="tiene_factura" className="font-bold cursor-pointer text-stone-300">¿Tiene Factura?</label>
            </div>
            <div>
              <label className="block font-bold mb-1 text-stone-300">Pago (Dinero Recibido)</label>
              <input type="number" step="0.01" name="pago" value={formData.pago} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Ej: 100" />
            </div>
            <div>
              <label className="block font-bold mb-1 text-stone-300">Cambio (Devuelto)</label>
              <input type="number" step="0.01" name="cambio" value={formData.cambio} onChange={handleChange} className="w-full bg-stone-900 border border-stone-800 rounded-lg p-2 text-amber-400" readOnly />
            </div>
            <div>
              <label className="block font-bold mb-1 text-stone-300">Observación</label>
              <input type="text" name="observacion" value={formData.observacion} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Ej: Ninguna" />
            </div>
          </div>

          <h4 className="font-bold border-b border-stone-800 pb-1 mb-3 text-emerald-400">Datos Internos / Costos (Bs)</h4>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold mb-1 text-stone-300">V.S/F C.CHICA</label>
              <input type="number" step="0.01" name="v_sf_cchica" value={formData.v_sf_cchica} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 text-stone-300">V. BANCO</label>
              <input type="number" step="0.01" name="v_sf_banco" value={formData.v_sf_banco} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 text-stone-300">COSTO C.CHICA</label>
              <input type="number" step="0.01" name="costo_cchica" value={formData.costo_cchica} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 text-stone-300">COSTO BANCO</label>
              <input type="number" step="0.01" name="costo_banco" value={formData.costo_banco} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-stone-700 rounded font-bold text-stone-300 hover:bg-stone-800">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 flex items-center gap-2">
              <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Registro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
