import { supabase } from '../supabase';

export type CuentaContable = {
  codigo: string;
  nombre: string;
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'EGRESO';
  created_at?: string;
};

export const CuentasService = {
  async getCuentas() {
    const { data, error } = await supabase
      .from('cuentas_contables')
      .select('*')
      .order('codigo', { ascending: true });

    if (error) throw error;
    return data as CuentaContable[];
  },

  async createCuenta(cuenta: Omit<CuentaContable, 'created_at'>) {
    const { data, error } = await supabase
      .from('cuentas_contables')
      .insert([cuenta])
      .select()
      .single();

    if (error) throw error;
    return data as CuentaContable;
  },

  async deleteCuenta(codigo: string) {
    const { error } = await supabase
      .from('cuentas_contables')
      .delete()
      .eq('codigo', codigo);

    if (error) throw error;
  }
};
