import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save } from 'lucide-react';

export default function ModalInventarioPeps({ isOpen, onClose, onSaved }: { isOpen: boolean, onClose: () => void, onSaved: () => void }) {
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

    const { error } = await supabase.from('movimientos_inventario').insert([formData]);
    
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center">
          <h3 className="font-bold">Registrar Movimiento de Inventario / Tueste</h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1 rounded"><X size={20}/></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 text-sm text-gray-800">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1">Fecha</label>
              <input type="date" name="fecha" required value={formData.fecha} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div className="col-span-2">
              <label className="block font-bold mb-1">Detalle</label>
              <input type="text" name="detalle" required value={formData.detalle} onChange={handleChange} className="w-full border rounded p-2" placeholder="Ej: INVENTARIO INICIAL o TUESTE 1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-4">
            {/* Columna Izquierda: Entradas y Salidas */}
            <div>
              <h4 className="font-bold border-b pb-1 mb-3 text-emerald-800">Cantidades (Unidades)</h4>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold mb-1">ENTRADAS</label>
                  <input type="number" step="any" name="entradas" value={formData.entradas} onChange={handleChange} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">SALIDAS</label>
                  <input type="number" step="any" name="salidas" value={formData.salidas} onChange={handleChange} className="w-full border rounded p-2" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1">SALDO UNIDADES (Calcular manual o auto)</label>
                  <input type="number" step="any" name="saldo_unidades" value={formData.saldo_unidades} onChange={handleChange} className="w-full border rounded p-2 bg-gray-50" />
                </div>
              </div>

              <h4 className="font-bold border-b pb-1 mb-3 text-emerald-800">Valores (Bs)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1">COSTO UNITARIO (C/U)</label>
                  <input type="number" step="any" name="costo_unitario" value={formData.costo_unitario} onChange={handleChange} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">DEBE</label>
                  <input type="number" step="any" name="debe" value={formData.debe} onChange={handleChange} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">HABER</label>
                  <input type="number" step="any" name="haber" value={formData.haber} onChange={handleChange} className="w-full border rounded p-2" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1">SALDO VALOR (Bs)</label>
                  <input type="number" step="any" name="saldo_valor" value={formData.saldo_valor} onChange={handleChange} className="w-full border rounded p-2 bg-gray-50" />
                </div>
              </div>
            </div>

            {/* Columna Derecha: Tuestes */}
            <div>
              <h4 className="font-bold border-b pb-1 mb-3 text-emerald-800">Datos de Tueste</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1">TIPO DE CAFÉ</label>
                  <input type="text" name="tipo_cafe" value={formData.tipo_cafe} onChange={handleChange} className="w-full border rounded p-2" placeholder="BLEND, JAVA..." />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">TIPO DE TUESTE</label>
                  <input type="text" name="tipo_tueste" value={formData.tipo_tueste} onChange={handleChange} className="w-full border rounded p-2" placeholder="MEDIO, OSCURO..." />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">CLIMA</label>
                  <input type="text" name="clima" value={formData.clima} onChange={handleChange} className="w-full border rounded p-2" placeholder="Soleado..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1">MERMA %</label>
                    <input type="number" step="any" name="merma_porcentaje" value={formData.merma_porcentaje} onChange={handleChange} className="w-full border rounded p-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">MERMA TUESTE (Kg)</label>
                    <input type="number" step="any" name="merma_tueste" value={formData.merma_tueste} onChange={handleChange} className="w-full border rounded p-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">TUESTE FINAL</label>
                  <input type="number" step="any" name="tueste_final" value={formData.tueste_final} onChange={handleChange} className="w-full border rounded p-2" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 flex items-center gap-2">
              <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
