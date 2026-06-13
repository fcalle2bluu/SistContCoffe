import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save } from 'lucide-react';

export default function ModalLibroDiario({ 
  isOpen, 
  onClose, 
  onSaved, 
  planCuentas,
  editingDiario = null
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSaved: () => void, 
  planCuentas: any[],
  editingDiario?: any
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    nro_asiento: '',
    codigo_cuenta: '',
    glosa: '',
    debe: 0,
    haber: 0
  });

  // Load journal entry in edit mode
  React.useEffect(() => {
    if (editingDiario && isOpen) {
      setFormData({
        fecha: editingDiario.fecha || new Date().toISOString().split('T')[0],
        nro_asiento: editingDiario.nro_asiento !== undefined ? String(editingDiario.nro_asiento) : '',
        codigo_cuenta: editingDiario.codigo_cuenta || '',
        glosa: editingDiario.glosa || '',
        debe: Number(editingDiario.debe || 0),
        haber: Number(editingDiario.haber || 0)
      });
    } else if (isOpen) {
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        nro_asiento: '',
        codigo_cuenta: '',
        glosa: '',
        debe: 0,
        haber: 0
      });
    }
  }, [editingDiario, isOpen]);

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

    const payload = {
      fecha: formData.fecha,
      nro_asiento: Number(formData.nro_asiento),
      codigo_cuenta: formData.codigo_cuenta,
      glosa: formData.glosa,
      debe: formData.debe,
      haber: formData.haber
    };

    let error;
    if (editingDiario) {
      const { error: updateError } = await supabase
        .from('libro_diario')
        .update(payload)
        .eq('id', editingDiario.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('libro_diario')
        .insert([payload]);
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center">
          <h3 className="font-bold">Registrar Asiento Contable</h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1 rounded"><X size={20}/></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 text-sm text-gray-800">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-bold mb-1">Fecha</label>
              <input type="date" name="fecha" required value={formData.fecha} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block font-bold mb-1">Nº Asiento</label>
              <input type="number" name="nro_asiento" required value={formData.nro_asiento} onChange={handleChange} className="w-full border rounded p-2" />
            </div>
            <div className="col-span-2">
              <label className="block font-bold mb-1">Cuenta Contable</label>
              <select name="codigo_cuenta" required value={formData.codigo_cuenta} onChange={handleChange} className="w-full border rounded p-2 font-mono text-xs">
                <option value="">Seleccione una cuenta...</option>
                {planCuentas.map(c => (
                  <option key={c.codigo} value={c.codigo}>{c.codigo} - {c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block font-bold mb-1">Detalle / Glosa</label>
              <input type="text" name="glosa" required value={formData.glosa} onChange={handleChange} className="w-full border rounded p-2" placeholder="Explicación del asiento" />
            </div>
          </div>

          <h4 className="font-bold border-b pb-1 mb-3 text-emerald-800">Importes (Bs)</h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold mb-1">DEBE</label>
              <input type="number" step="0.01" name="debe" value={formData.debe} onChange={handleChange} className="w-full border rounded p-2 font-mono text-lg text-emerald-700" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">HABER</label>
              <input type="number" step="0.01" name="haber" value={formData.haber} onChange={handleChange} className="w-full border rounded p-2 font-mono text-lg text-orange-700" />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 flex items-center gap-2">
              <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Asiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
