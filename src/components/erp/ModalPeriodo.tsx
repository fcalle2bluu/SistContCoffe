import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save } from 'lucide-react';

export default function ModalPeriodo({ isOpen, onClose, onSaved }: { isOpen: boolean, onClose: () => void, onSaved: (newId: number) => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    tipo_periodo: 'MES',
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
    fecha_inicio: '',
    fecha_fin: ''
  });

  if (!isOpen) return null;

  const handleChange = (e: any) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const autoFillDates = () => {
    const y = formData.anio;
    const m = formData.mes;
    if (y && m) {
      const firstDay = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(y, m, 0).toISOString().split('T')[0];
      
      const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
      
      setFormData(prev => ({
        ...prev,
        nombre: `${meses[m - 1]} ${y}`,
        fecha_inicio: firstDay,
        fecha_fin: lastDay
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.from('periodos_contables').insert([formData]).select();
    
    setLoading(false);
    if (error) {
      alert("Error al guardar: " + error.message);
    } else if (data && data.length > 0) {
      onSaved(data[0].id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden flex flex-col">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center">
          <h3 className="font-bold">Añadir Nuevo Periodo</h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1 rounded"><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 text-sm text-stone-200">

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1 text-stone-300">Mes (1-12)</label>
              <input type="number" min="1" max="12" name="mes" value={formData.mes} onChange={handleChange} onBlur={autoFillDates} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block font-bold mb-1 text-stone-300">Año</label>
              <input type="number" name="anio" value={formData.anio} onChange={handleChange} onBlur={autoFillDates} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block font-bold mb-1 text-stone-300">Nombre del Periodo</label>
            <input type="text" name="nombre" required value={formData.nombre} onChange={handleChange} className="w-full bg-stone-900 border border-stone-800 rounded-lg p-2 text-amber-400 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-bold" placeholder="MAYO 2026" />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block font-bold mb-1 text-xs text-stone-300">FECHA INICIO</label>
              <input type="date" name="fecha_inicio" required value={formData.fecha_inicio} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-xs text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block font-bold mb-1 text-xs text-stone-300">FECHA FIN</label>
              <input type="date" name="fecha_fin" required value={formData.fecha_fin} onChange={handleChange} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-xs text-white placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-stone-700 rounded font-bold text-stone-300 hover:bg-stone-800">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 flex items-center gap-2">
              <Save size={16} /> {loading ? 'Guardando...' : 'Crear Periodo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
