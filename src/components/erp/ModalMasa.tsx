import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Masa, MasasService } from '@/lib/services/masas.service';
import { toast } from 'sonner';

export default function ModalMasa({
  isOpen,
  onClose,
  onSaved,
  editingMasa = null
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingMasa?: Masa | null;
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    unidad_medida: 'kg',
    stock_minimo: 0,
    costo_unitario: 0
  });

  useEffect(() => {
    if (editingMasa && isOpen) {
      setFormData({
        nombre: editingMasa.nombre,
        unidad_medida: editingMasa.unidad_medida || 'kg',
        stock_minimo: editingMasa.stock_minimo,
        costo_unitario: editingMasa.costo_unitario
      });
    } else if (isOpen) {
      setFormData({
        nombre: '',
        unidad_medida: 'kg',
        stock_minimo: 1.0,
        costo_unitario: 10.0
      });
    }
  }, [editingMasa, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'nombre' || name === 'unidad_medida' ? value : Number(value)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast.error("Por favor ingrese el nombre de la masa.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        unidad_medida: formData.unidad_medida,
        stock_minimo: Number(formData.stock_minimo),
        costo_unitario: Number(formData.costo_unitario),
        stock_actual: editingMasa ? editingMasa.stock_actual : 0 // Starts at 0 for new
      };

      if (editingMasa) {
        await MasasService.updateMasa(editingMasa.id, payload);
        toast.success("Masa actualizada con éxito.");
      } else {
        await MasasService.createMasa(payload);
        toast.success("Masa creada con éxito.");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error("Error al guardar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center border-b border-emerald-900">
          <h3 className="font-bold text-sm tracking-wide uppercase">
            {editingMasa ? 'Modificar Masa' : 'Añadir Nueva Masa'}
          </h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1.5 rounded-lg transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 text-sm text-stone-200 space-y-5">
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Nombre de la Masa *</label>
            <input
              type="text"
              name="nombre"
              required
              value={formData.nombre}
              onChange={handleChange}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-stone-600 font-medium"
              placeholder="Ej: Masa Croissant, Masa de Hojaldre..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Unidad de Medida *</label>
              <select
                name="unidad_medida"
                value={formData.unidad_medida}
                onChange={handleChange}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white font-medium cursor-pointer"
              >
                <option value="kg">Kilogramos (kg)</option>
                <option value="g">Gramos (g)</option>
                <option value="unidades">Unidades (bolas/porciones)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Costo Unitario (Bs) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="costo_unitario"
                required
                value={formData.costo_unitario}
                onChange={handleChange}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-amber-400 placeholder-stone-600 font-mono"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Stock Mínimo de Alerta *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="stock_minimo"
              required
              value={formData.stock_minimo}
              onChange={handleChange}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-stone-600 font-mono"
              placeholder="0.00"
            />
            <p className="text-[10px] text-stone-500 mt-1 pl-1">
              Se mostrará una alerta visual si el stock de esta masa cae por debajo de este valor.
            </p>
          </div>

          <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-stone-800">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-stone-700 rounded-xl font-bold text-stone-300 hover:bg-stone-800 transition-colors cursor-pointer">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow">
              <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Masa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
