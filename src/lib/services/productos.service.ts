import { supabase } from '../supabase';

export type Producto = {
  id: number;
  nombre: string;
  categoria: string | null;
  precio_venta: number;
  es_inventariable: boolean;
};

export const ProductosService = {
  async getProductos() {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    return data as Producto[];
  },

  async createProducto(producto: Omit<Producto, 'id'>) {
    const { data, error } = await supabase
      .from('productos')
      .insert([producto])
      .select()
      .single();

    if (error) throw error;
    return data as Producto;
  },

  async deleteProducto(id: number) {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async updateProducto(id: number, producto: Partial<Omit<Producto, 'id'>>) {
    const { data, error } = await supabase
      .from('productos')
      .update(producto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Producto;
  }
};
