import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Masa, MasasService } from '@/lib/services/masas.service';
import { toast } from 'sonner';

export default function ModalMovimientoMasa({
  isOpen,
  onClose,
  onSaved,
  masas = [],
  currentUser = null
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  masas: Masa[];
  currentUser: any;
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    masa_id: '',
    tipo_movimiento: 'ENTRADA' as 'ENTRADA' | 'SALIDA',
    cantidad: '',
    motivo: '',
    fecha: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        masa_id: masas[0]?.id?.toString() || '',
        tipo_movimiento: 'ENTRADA',
        cantidad: '',
        motivo: 'Producción diaria',
        fecha: new Date().toISOString().split('T')[0]
      });
    }
  }, [isOpen, masas]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTipoChange = (tipo: 'ENTRADA' | 'SALIDA') => {
    setFormData(prev => ({
      ...prev,
      tipo_movimiento: tipo,
      motivo: tipo === 'ENTRADA' ? 'Producción diaria' : 'Uso en panadería / merma'
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const masaId = Number(formData.masa_id);
    const cantidad = Number(formData.cantidad);

    if (isNaN(masaId) || !masaId) {
      toast.error("Por favor seleccione una masa.");
      return;
    }
    if (isNaN(cantidad) || cantidad <= 0) {
      toast.error("Por favor ingrese una cantidad válida mayor a cero.");
      return;
    }

    // Validate exit quantity against stock
    if (formData.tipo_movimiento === 'SALIDA') {
      const selectedMasa = masas.find(m => m.id === masaId);
      if (selectedMasa && selectedMasa.stock_actual < cantidad) {
        if (!window.confirm(`El stock actual de "${selectedMasa.nombre}" es de ${selectedMasa.stock_actual} ${selectedMasa.unidad_medida}. ¿Desea registrar una salida de ${cantidad} ${selectedMasa.unidad_medida} resultando en stock negativo?`)) {
          return;
        }
      }
    }

    setLoading(true);
    try {
      const payload = {
        masa_id: masaId,
        tipo_movimiento: formData.tipo_movimiento,
        cantidad,
        motivo: formData.motivo.trim(),
        fecha: formData.fecha,
        creado_por: currentUser?.nombre || 'Usuario ERP'
      };

      await MasasService.createMovimiento(payload);
      toast.success("Movimiento registrado con éxito.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error("Error al registrar movimiento: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center border-b border-emerald-900">
          <h3 className="font-bold text-sm tracking-wide uppercase">
            Registrar Movimiento de Masa
          </h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1.5 rounded-lg transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 text-sm text-stone-200 space-y-5">
          {/* Selector de Entrada/Salida */}
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase mb-2 font-mono">Tipo de Transacción</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTipoChange('ENTRADA')}
                className={`py-2 px-4 rounded-xl font-bold transition-all border text-center cursor-pointer ${
                  formData.tipo_movimiento === 'ENTRADA'
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/20'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:bg-stone-800'
                }`}
              >
                📥 ENTRADA (Producción)
              </button>
              <button
                type="button"
                onClick={() => handleTipoChange('SALIDA')}
                className={`py-2 px-4 rounded-xl font-bold transition-all border text-center cursor-pointer ${
                  formData.tipo_movimiento === 'SALIDA'
                    ? 'bg-amber-950/30 border-amber-500 text-amber-400 ring-2 ring-amber-500/20'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:bg-stone-800'
                }`}
              >
                📤 SALIDA (Consumo/Uso)
              </button>
            </div>
          </div>

          {/* Masa Select */}
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Seleccionar Masa *</label>
            <select
              name="masa_id"
              required
              value={formData.masa_id}
              onChange={handleChange}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white font-medium cursor-pointer"
            >
              <option value="" disabled>Seleccione una masa...</option>
              {masas.map(m => (
                <option key={m.id} value={m.id}>
                  {m.nombre} (Stock actual: {m.stock_actual} {m.unidad_medida})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Cantidad */}
            <div>
              <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Cantidad *</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  name="cantidad"
                  required
                  placeholder="0.00"
                  value={formData.cantidad}
                  onChange={handleChange}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-amber-400 placeholder-stone-600 font-mono text-base font-bold"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-stone-500 font-bold text-xs select-none">
                  {masas.find(m => m.id === Number(formData.masa_id))?.unidad_medida || 'unid'}
                </span>
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Fecha *</label>
              <input
                type="date"
                name="fecha"
                required
                value={formData.fecha}
                onChange={handleChange}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white font-mono"
              />
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Motivo o Referencia *</label>
            <input
              type="text"
              name="motivo"
              required
              placeholder={formData.tipo_movimiento === 'ENTRADA' ? "Ej: Producción del día" : "Ej: Uso para croissants horneados, merma..."}
              value={formData.motivo}
              onChange={handleChange}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-stone-600 font-medium"
            />
          </div>

          <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-stone-800">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-stone-700 rounded-xl font-bold text-stone-300 hover:bg-stone-800 transition-colors cursor-pointer">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow">
              <Save size={16} /> {loading ? 'Registrando...' : 'Registrar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
