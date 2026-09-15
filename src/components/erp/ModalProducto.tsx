import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Producto, ProductosService } from '@/lib/services/productos.service';

export default function ModalProducto({
  isOpen,
  onClose,
  onSaved,
  editingProduct = null,
  existingCategories = []
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingProduct?: Producto | null;
  existingCategories: string[];
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    categoria: '',
    precio_venta: 0,
    es_inventariable: false
  });
  const [customCategory, setCustomCategory] = useState('');
  const [useCustomCategory, setUseCustomCategory] = useState(false);

  useEffect(() => {
    const listCats = existingCategories.filter(c => c !== "Todos");
    if (editingProduct && isOpen) {
      setFormData({
        nombre: editingProduct.nombre,
        categoria: editingProduct.categoria || '',
        precio_venta: editingProduct.precio_venta,
        es_inventariable: !!editingProduct.es_inventariable
      });
      setUseCustomCategory(false);
      setCustomCategory('');
    } else if (isOpen) {
      setFormData({
        nombre: '',
        categoria: listCats[0] || '',
        precio_venta: 0,
        es_inventariable: false
      });
      setUseCustomCategory(false);
      setCustomCategory('');
    }
  }, [editingProduct, isOpen, existingCategories]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' 
      ? (e.target as HTMLInputElement).checked 
      : (type === 'number' ? Number(value) : value);
    
    setFormData(prev => ({
      ...prev,
      [name]: val
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      alert("Por favor ingrese el nombre del producto.");
      return;
    }

    const finalCategory = useCustomCategory ? customCategory.trim() : formData.categoria;
    if (!finalCategory) {
      alert("Por favor seleccione o ingrese una categoría.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        categoria: finalCategory,
        precio_venta: Number(formData.precio_venta),
        es_inventariable: formData.es_inventariable
      };

      if (editingProduct) {
        await ProductosService.updateProducto(editingProduct.id, payload);
      } else {
        await ProductosService.createProducto(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert("Error al guardar producto: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const listCats = existingCategories.filter(c => c !== "Todos");

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-emerald-800 p-4 text-white flex justify-between items-center border-b border-emerald-900">
          <h3 className="font-bold text-sm tracking-wide uppercase">
            {editingProduct ? 'Modificar Producto' : 'Añadir Nuevo Producto'}
          </h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1.5 rounded-lg transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 text-sm text-stone-200 space-y-5">
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Nombre del Producto *</label>
            <input
              type="text"
              name="nombre"
              required
              value={formData.nombre}
              onChange={handleChange}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-stone-600 font-medium"
              placeholder="Ej: Latte Doble, Croissant Almendra..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Categoría *</label>
            {!useCustomCategory ? (
              <div className="flex gap-2">
                <select
                  name="categoria"
                  value={formData.categoria}
                  onChange={handleChange}
                  className="flex-1 bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white font-medium"
                >
                  {listCats.length === 0 && <option value="">No hay categorías</option>}
                  {listCats.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseCustomCategory(true)}
                  className="px-3 py-2 border border-stone-700 hover:border-stone-600 rounded-xl text-xs font-bold text-emerald-400 hover:bg-stone-800 transition-colors"
                >
                  Nueva
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  required
                  className="flex-1 bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-stone-600 font-medium"
                  placeholder="Ej: Cafetería Fría, Extras..."
                />
                <button
                  type="button"
                  onClick={() => setUseCustomCategory(false)}
                  className="px-3 py-2 border border-stone-700 hover:border-stone-600 rounded-xl text-xs font-bold text-stone-300 hover:bg-stone-800 transition-colors"
                >
                  Listado
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase mb-1.5 font-mono">Precio de Venta (Bs) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="precio_venta"
              required
              value={formData.precio_venta}
              onChange={handleChange}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-base font-bold text-amber-400 placeholder-stone-600"
              placeholder="0.00"
            />
          </div>

          <div className="flex items-center pt-2">
            <input
              type="checkbox"
              id="es_inventariable"
              name="es_inventariable"
              checked={formData.es_inventariable}
              onChange={handleChange}
              className="mr-2.5 h-4.5 w-4.5 rounded border-stone-700 accent-emerald-600 focus:ring-emerald-500/20 cursor-pointer"
            />
            <label htmlFor="es_inventariable" className="font-bold text-stone-300 cursor-pointer select-none">¿Es un producto inventariable?</label>
          </div>
          <p className="text-[10px] text-stone-500 pl-7 leading-relaxed">
            Activar solo para productos en empaque que se descuentan de almacén físico al ser vendidos (como bolsas de café de 250g/500g/1kg).
          </p>

          <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-stone-800">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-stone-700 rounded-xl font-bold text-stone-300 hover:bg-stone-800 transition-colors cursor-pointer">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-emerald-950/10">
              <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
