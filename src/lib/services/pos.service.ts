import { supabase } from '../supabase';

export type Transaccion = {
  id?: number;
  tipo: 'VENTA' | 'COMPRA' | 'MERMA' | 'AJUSTE';
  monto_total: number;
  referencia: string | null;
  fecha?: string;
};

export type DetalleTransaccion = {
  id?: number;
  transaccion_id?: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

export const PosService = {
  async procesarVenta(total: number, items: { producto_id: number, cantidad: number, precio: number }[]) {
    // Para asegurar transaccionalidad real, deberíamos usar un RPC (Procedimiento Almacenado) en Supabase.
    // Como estamos desde el lado del cliente y para simplificar esta fase, haremos la inserción en cadena.
    
    // 1. Crear Transacción Principal
    const { data: txData, error: txError } = await supabase
      .from('transacciones')
      .insert([{
        tipo: 'VENTA',
        monto_total: total,
        referencia: `POS-${Date.now().toString().slice(-6)}`
      }])
      .select('id')
      .single();

    if (txError) throw new Error("Error al registrar la transacción madre: " + txError.message);
    const transaccion_id = txData.id;

    // 2. Insertar Detalles
    const detalles: DetalleTransaccion[] = items.map(item => ({
      transaccion_id,
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
      subtotal: item.cantidad * item.precio
    }));

    const { error: detError } = await supabase
      .from('detalles_transaccion')
      .insert(detalles);

    if (detError) throw new Error("Error al registrar los detalles de venta: " + detError.message);

    return transaccion_id;
  }
};
