import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save } from 'lucide-react';

export default function ModalInventarioPeps({ 
  isOpen, 
  onClose, 
  onSaved,
  editingInventory = null
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSaved: () => void,
  editingInventory?: any
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    detalle: '',
    entradas: 0,
    salidas: 0,
    saldo_unidades: 0,
    costo_unitario: 0,
    debe: 0,
    haber: 0,
    saldo_valor: 0,
    tipo_cafe: '',
    tipo_tueste: '',
    clima: '',
    merma_porcentaje: 0,
    merma_tueste: 0,
    tueste_final: 0
  });

  // Load inventory movement in edit mode
  React.useEffect(() => {
    if (editingInventory && isOpen) {
      setFormData({
        fecha: editingInventory.fecha || new Date().toISOString().split('T')[0],
        detalle: editingInventory.detalle || '',
        entradas: Number(editingInventory.entradas || 0),
        salidas: Number(editingInventory.salidas || 0),
        saldo_unidades: Number(editingInventory.saldo_unidades || 0),
        costo_unitario: Number(editingInventory.costo_unitario || 0),
        debe: Number(editingInventory.debe || 0),
        haber: Number(editingInventory.haber || 0),
        saldo_valor: Number(editingInventory.saldo_valor || 0),
        tipo_cafe: editingInventory.tipo_cafe || '',
        tipo_tueste: editingInventory.tipo_tueste || '',
        clima: editingInventory.clima || '',
        merma_porcentaje: Number(editingInventory.merma_porcentaje || 0),
        merma_tueste: Number(editingInventory.merma_tueste || 0),
        tueste_final: Number(editingInventory.tueste_final || 0)
      });
    } else if (isOpen) {
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        detalle: '',
        entradas: 0,
        salidas: 0,
        saldo_unidades: 0,
        costo_unitario: 0,
        debe: 0,
        haber: 0,
        saldo_valor: 0,
        tipo_cafe: '',
        tipo_tueste: '',
        clima: '',
        merma_porcentaje: 0,
        merma_tueste: 0,
        tueste_final: 0
      });
    }
  }, [editingInventory, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: any) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let error;
    if (editingInventory) {
      const { error: updateError } = await supabase
        .from('movimientos_inventario')
        .update(formData)
        .eq('id', editingInventory.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('movimientos_inventario')
        .insert([formData]);
      error = insertError;
    }
    
    setLoading(false);
    if (error) {
      alert("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-2xl shadow-black/40 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center">
          <h3 className="font-bold">Registrar Movimiento de Inventario / Tueste</h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1 rounded"><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 text-sm text-stone-200">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1 text-stone-300">Fecha</label>
              <input type="date" name="fecha" required value={formData.fecha} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div className="col-span-2">
              <label className="block font-bold mb-1 text-stone-300">Detalle</label>
              <input type="text" name="detalle" required value={formData.detalle} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Ej: INVENTARIO INICIAL o TUESTE 1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-4">
            {/* Columna Izquierda: Entradas y Salidas */}
            <div>
              <h4 className="font-bold border-b border-stone-800 pb-1 mb-3 text-emerald-400">Cantidades (Unidades)</h4>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-stone-300">ENTRADAS</label>
                  <input type="number" step="any" name="entradas" value={formData.entradas} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-stone-300">SALIDAS</label>
                  <input type="number" step="any" name="salidas" value={formData.salidas} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 text-stone-300">SALDO UNIDADES (Calcular manual o auto)</label>
                  <input type="number" step="any" name="saldo_unidades" value={formData.saldo_unidades} onChange={handleChange} className="w-full bg-stone-900 border border-stone-800 rounded-lg p-2 text-amber-400" />
                </div>
              </div>

              <h4 className="font-bold border-b border-stone-800 pb-1 mb-3 text-emerald-400">Valores (Bs)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 text-stone-300">COSTO UNITARIO (C/U)</label>
                  <input type="number" step="any" name="costo_unitario" value={formData.costo_unitario} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-stone-300">DEBE</label>
                  <input type="number" step="any" name="debe" value={formData.debe} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-stone-300">HABER</label>
                  <input type="number" step="any" name="haber" value={formData.haber} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 text-stone-300">SALDO VALOR (Bs)</label>
                  <input type="number" step="any" name="saldo_valor" value={formData.saldo_valor} onChange={handleChange} className="w-full bg-stone-900 border border-stone-800 rounded-lg p-2 text-amber-400" />
                </div>
              </div>
            </div>

            {/* Columna Derecha: Tuestes */}
            <div>
              <h4 className="font-bold border-b border-stone-800 pb-1 mb-3 text-emerald-400">Datos de Tueste</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-stone-300">TIPO DE CAFÉ</label>
                  <input type="text" name="tipo_cafe" value={formData.tipo_cafe} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="BLEND, JAVA..." />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-stone-300">TIPO DE TUESTE</label>
                  <input type="text" name="tipo_tueste" value={formData.tipo_tueste} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="MEDIO, OSCURO..." />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-stone-300">CLIMA</label>
                  <input type="text" name="clima" value={formData.clima} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Soleado..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1 text-stone-300">MERMA %</label>
                    <input type="number" step="any" name="merma_porcentaje" value={formData.merma_porcentaje} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1 text-stone-300">MERMA TUESTE (Kg)</label>
                    <input type="number" step="any" name="merma_tueste" value={formData.merma_tueste} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-stone-300">TUESTE FINAL</label>
                  <input type="number" step="any" name="tueste_final" value={formData.tueste_final} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-stone-700 rounded font-bold text-stone-300 hover:bg-stone-800">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 flex items-center gap-2">
              <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
