import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save } from 'lucide-react';

export default function ModalComprasVentas({ isOpen, onClose, onSaved }: { isOpen: boolean, onClose: () => void, onSaved: () => void }) {
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
    costo_banco: 0
  });

  if (!isOpen) return null;

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Auto-calculate monto_total based on the specific columns if the user doesn't type it
    const totalCalc = formData.caja + formData.c_chica + formData.banco + formData.pos;
    const finalData = {
      ...formData,
      monto_total: formData.monto_total || totalCalc
    };

    const { error } = await supabase.from('transacciones').insert([finalData]);
    
    setLoading(false);
    if (error) {
      alert("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center">
          <h3 className="font-bold">Registrar Transacción (Compras y Ventas)</h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1 rounded"><X size={20}/></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 text-sm text-gray-800">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1">Fecha</label>
              <input type="date" name="fecha" required value={formData.fecha} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block font-bold mb-1">Tipo de Movimiento</label>
              <select name="tipo_movimiento" value={formData.tipo_movimiento} onChange={handleChange} className="w-full border rounded p-2">
                <option value="INGRESO">INGRESO</option>
                <option value="EGRESO">EGRESO</option>
              </select>
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold mb-1">Categoría (Estado de Resultados)</label>
                <select name="categoria" value={formData.categoria} onChange={handleChange} className="w-full border rounded p-2 bg-emerald-50">
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
                <label className="block font-bold mb-1">Detalle</label>
                <input type="text" name="detalle" required value={formData.detalle} onChange={handleChange} className="w-full border rounded p-2" placeholder="Ej: 2 lattes, 1 Chai..." />
              </div>
            </div>
          </div>

          <h4 className="font-bold border-b pb-1 mb-3 text-emerald-800">Cuentas Receptoras / Emisoras (Bs)</h4>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold mb-1">CAJA</label>
              <input type="number" step="0.01" name="caja" value={formData.caja} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">C. CHICA</label>
              <input type="number" step="0.01" name="c_chica" value={formData.c_chica} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">BANCO</label>
              <input type="number" step="0.01" name="banco" value={formData.banco} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">POS</label>
              <input type="number" step="0.01" name="pos" value={formData.pos} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1">Monto Total Oficial</label>
              <input type="number" step="0.01" name="monto_total" value={formData.monto_total} onChange={handleChange} className="w-full border rounded p-2 bg-gray-50" />
            </div>
            <div>
              <label className="block font-bold mb-1">Método de Pago</label>
              <input type="text" name="metodo_pago" value={formData.metodo_pago} onChange={handleChange} className="w-full border rounded p-2" placeholder="EFECTIVO, QR..." />
            </div>
            <div className="flex items-center mt-6">
              <input type="checkbox" id="tiene_factura" name="tiene_factura" checked={formData.tiene_factura} onChange={handleChange} className="mr-2 h-4 w-4" />
              <label htmlFor="tiene_factura" className="font-bold cursor-pointer">¿Tiene Factura?</label>
            </div>
          </div>

          <h4 className="font-bold border-b pb-1 mb-3 text-emerald-800">Datos Internos / Costos (Bs)</h4>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold mb-1">V.S/F C.CHICA</label>
              <input type="number" step="0.01" name="v_sf_cchica" value={formData.v_sf_cchica} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">V. BANCO</label>
              <input type="number" step="0.01" name="v_sf_banco" value={formData.v_sf_banco} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">COSTO C.CHICA</label>
              <input type="number" step="0.01" name="costo_cchica" value={formData.costo_cchica} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">COSTO BANCO</label>
              <input type="number" step="0.01" name="costo_banco" value={formData.costo_banco} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 flex items-center gap-2">
              <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Registro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
