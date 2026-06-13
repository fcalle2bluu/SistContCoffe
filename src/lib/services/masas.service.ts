import { supabase } from '../supabase';

export type Masa = {
  id: number;
  nombre: string;
  stock_actual: number;
  unidad_medida: string;
  stock_minimo: number;
  costo_unitario: number;
  created_at?: string;
};

export type MovimientoMasa = {
  id: number;
  masa_id: number;
  tipo_movimiento: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  motivo: string;
  fecha: string;
  creado_por?: string;
  created_at?: string;
  masa_nombre?: string;
  masa_unidad?: string;
};

const DEFAULT_MASAS: Masa[] = [
  { id: 1, nombre: 'Masa de Croissant', stock_actual: 5.0, unidad_medida: 'kg', stock_minimo: 2.0, costo_unitario: 15.50 },
  { id: 2, nombre: 'Masa de Pan de Chocolate', stock_actual: 4.0, unidad_medida: 'kg', stock_minimo: 1.5, costo_unitario: 18.00 },
  { id: 3, nombre: 'Masa Brioche', stock_actual: 3.0, unidad_medida: 'kg', stock_minimo: 1.0, costo_unitario: 12.00 },
  { id: 4, nombre: 'Masa de Hojaldre', stock_actual: 6.0, unidad_medida: 'kg', stock_minimo: 2.0, costo_unitario: 14.50 },
  { id: 5, nombre: 'Masa Madre', stock_actual: 2.5, unidad_medida: 'kg', stock_minimo: 0.5, costo_unitario: 8.00 }
];

const getLocalMasas = (): Masa[] => {
  if (typeof window === 'undefined') return DEFAULT_MASAS;
  const stored = localStorage.getItem('yanaloma_masas');
  if (!stored) {
    localStorage.setItem('yanaloma_masas', JSON.stringify(DEFAULT_MASAS));
    return DEFAULT_MASAS;
  }
  return JSON.parse(stored);
};

const setLocalMasas = (masas: Masa[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('yanaloma_masas', JSON.stringify(masas));
  }
};

const getLocalMovimientos = (): MovimientoMasa[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('yanaloma_movimientos_masas');
  return stored ? JSON.parse(stored) : [];
};

const setLocalMovimientos = (movs: MovimientoMasa[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('yanaloma_movimientos_masas', JSON.stringify(movs));
  }
};

export const MasasService = {
  async getMasas(): Promise<Masa[]> {
    try {
      const { data, error } = await supabase
        .from('inventario_masas')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      return data as Masa[];
    } catch (e) {
      console.warn("Supabase getMasas failed, falling back to localStorage", e);
      return getLocalMasas();
    }
  },

  async createMasa(masa: Omit<Masa, 'id' | 'created_at'>): Promise<Masa> {
    try {
      const { data, error } = await supabase
        .from('inventario_masas')
        .insert([masa])
        .select()
        .single();

      if (error) throw error;
      return data as Masa;
    } catch (e) {
      console.warn("Supabase createMasa failed, falling back to localStorage", e);
      const masas = getLocalMasas();
      const newId = masas.length > 0 ? Math.max(...masas.map(m => m.id)) + 1 : 1;
      const newMasa: Masa = {
        ...masa,
        id: newId,
        created_at: new Date().toISOString()
      };
      masas.push(newMasa);
      setLocalMasas(masas);
      return newMasa;
    }
  },

  async updateMasa(id: number, masa: Partial<Omit<Masa, 'id' | 'created_at'>>): Promise<Masa> {
    try {
      const { data, error } = await supabase
        .from('inventario_masas')
        .update(masa)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Masa;
    } catch (e) {
      console.warn("Supabase updateMasa failed, falling back to localStorage", e);
      const masas = getLocalMasas();
      const updated = masas.map(m => {
        if (m.id === id) {
          return { ...m, ...masa };
        }
        return m;
      });
      setLocalMasas(updated);
      return updated.find(m => m.id === id) as Masa;
    }
  },

  async deleteMasa(id: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('inventario_masas')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (e) {
      console.warn("Supabase deleteMasa failed, falling back to localStorage", e);
      const masas = getLocalMasas();
      const filtered = masas.filter(m => m.id !== id);
      setLocalMasas(filtered);

      const movs = getLocalMovimientos();
      const filteredMovs = movs.filter(m => m.masa_id !== id);
      setLocalMovimientos(filteredMovs);
    }
  },

  async getMovimientos(): Promise<MovimientoMasa[]> {
    try {
      const { data, error } = await supabase
        .from('movimientos_masas')
        .select('*, inventario_masas(nombre, unidad_medida)')
        .order('id', { ascending: false });

      if (error) throw error;
      return (data as any[]).map(item => ({
        ...item,
        masa_nombre: item.inventario_masas?.nombre || 'Desconocido',
        masa_unidad: item.inventario_masas?.unidad_medida || 'kg'
      })) as MovimientoMasa[];
    } catch (e) {
      console.warn("Supabase getMovimientos failed, falling back to localStorage", e);
      const movs = getLocalMovimientos();
      const masas = getLocalMasas();
      return movs.map(m => {
        const found = masas.find(x => x.id === m.masa_id);
        return {
          ...m,
          masa_nombre: found ? found.nombre : 'Desconocido',
          masa_unidad: found ? found.unidad_medida : 'kg'
        };
      });
    }
  },

  async createMovimiento(mov: Omit<MovimientoMasa, 'id' | 'created_at'>): Promise<MovimientoMasa> {
    try {
      const { data, error } = await supabase
        .from('movimientos_masas')
        .insert([mov])
        .select()
        .single();

      if (error) throw error;

      // Update stock on Supabase
      const { data: mData } = await supabase
        .from('inventario_masas')
        .select('stock_actual')
        .eq('id', mov.masa_id)
        .single();

      if (mData) {
        const diff = mov.tipo_movimiento === 'ENTRADA' ? mov.cantidad : -mov.cantidad;
        const newStock = Number((Number(mData.stock_actual) + diff).toFixed(3));
        await supabase
          .from('inventario_masas')
          .update({ stock_actual: newStock })
          .eq('id', mov.masa_id);
      }

      return data as MovimientoMasa;
    } catch (e) {
      console.warn("Supabase createMovimiento failed, falling back to localStorage", e);
      const movs = getLocalMovimientos();
      const newId = movs.length > 0 ? Math.max(...movs.map(m => m.id)) + 1 : 1;
      const newMov: MovimientoMasa = {
        ...mov,
        id: newId,
        created_at: new Date().toISOString()
      };
      movs.unshift(newMov);
      setLocalMovimientos(movs);

      // Update stock locally
      const masas = getLocalMasas();
      const updated = masas.map(m => {
        if (m.id === mov.masa_id) {
          const diff = mov.tipo_movimiento === 'ENTRADA' ? mov.cantidad : -mov.cantidad;
          return {
            ...m,
            stock_actual: Number((m.stock_actual + diff).toFixed(3))
          };
        }
        return m;
      });
      setLocalMasas(updated);
      return newMov;
    }
  }
};
