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
  async procesarVenta(
    total: number,
    items: { producto_id: number, cantidad: number, precio: number, nombre?: string }[],
    extraData?: {
      id?: number; // Para actualizar una cuenta abierta existente
      fecha?: string;
      mesa?: string;
      hora?: string;
      responsable?: string;
      metodo_pago?: string;
      pago?: number;
      cambio?: number;
      observacion?: string;
      tiene_factura?: boolean;
      tipo_pedido?: 'SITIO' | 'LLEVAR';
      monto_descuento?: number;
      motivo_descuento?: string;
      estado?: 'PAGADA' | 'PENDIENTE'; // Nuevo campo
    }
  ) {
    const estado = extraData?.estado || 'PAGADA';
    const metodoPago = extraData?.metodo_pago || 'EFECTIVO';
    const tieneFactura = extraData?.tiene_factura !== false; // default true
    const tipoPedido = extraData?.tipo_pedido || 'SITIO';
    const montoDescuento = extraData?.monto_descuento || 0;
    const motivoDescuento = extraData?.motivo_descuento || null;
    const isPending = estado === 'PENDIENTE';
    
    // Distribute total to corresponding ledger accounts (solo si está pagada)
    let cCChica = 0;
    let cBanco = 0;
    let cPos = 0;
    
    if (!isPending) {
      if (metodoPago === 'EFECTIVO') {
        cCChica = total;
      } else if (metodoPago === 'QR') {
        cBanco = total;
      } else if (metodoPago === 'POS') {
        cPos = total;
      }
    }

    // Ventas sin factura (solo si está pagada)
    let vSfCchica = 0;
    let vSfBanco = 0;
    if (!isPending && !tieneFactura) {
      if (metodoPago === 'EFECTIVO') {
        vSfCchica = total;
      } else if (metodoPago === 'QR') {
        vSfBanco = total;
      }
    }

    // Construct detalle string
    const detalleStr = items.map(item => `${item.cantidad} ${item.nombre || 'Producto'}`).join(', ');

    // Determine DEBE and HABER account codes (solo si está pagada)
    // EFECTIVO -> Caja Chica, QR -> Banco Bisa (liquidación directa), POS/Tarjeta -> cuenta propia (liquidación con demora)
    const codigoDebe = isPending ? null : (
      metodoPago === 'EFECTIVO' ? '1110102' :
      metodoPago === 'POS' ? '1110105' :
      '1110103'
    );
    const codigoHaber = isPending ? null : '5010101'; // 5010101 = Ventas

    const transactionPayload = {
      fecha: extraData?.fecha || new Date().toISOString().split('T')[0],
      detalle: detalleStr || 'Venta POS',
      tipo_movimiento: 'INGRESO',
      monto_total: total,
      metodo_pago: isPending ? null : metodoPago,
      tiene_factura: isPending ? null : tieneFactura,
      caja: 0,
      c_chica: cCChica,
      banco: cBanco,
      pos: cPos,
      v_sf_cchica: vSfCchica,
      v_sf_banco: vSfBanco,
      costo_cchica: 0,
      costo_banco: 0,
      categoria: 'Ventas',
      mesa: extraData?.mesa || null,
      hora: extraData?.hora || null,
      responsable: extraData?.responsable || null,
      pago: isPending ? 0 : (extraData?.pago || 0),
      cambio: isPending ? 0 : (extraData?.cambio || 0),
      observacion: extraData?.observacion || null,
      tipo_pedido: tipoPedido,
      monto_descuento: montoDescuento,
      motivo_descuento: motivoDescuento,
      codigo_debe: codigoDebe,
      codigo_haber: codigoHaber,
      estado: estado
    };

    let transaccion_id = extraData?.id;

    if (transaccion_id) {
      // 1. Actualizar Transacción Principal
      const { error: updateError } = await supabase
        .from('transacciones')
        .update(transactionPayload)
        .eq('id', transaccion_id);

      if (updateError) throw new Error("Error al actualizar la transacción: " + updateError.message);
    } else {
      // 1. Crear Transacción Principal Nueva
      const { data: txData, error: txError } = await supabase
        .from('transacciones')
        .insert([transactionPayload])
        .select('id')
        .single();

      if (txError) throw new Error("Error al registrar la transacción madre: " + txError.message);
      transaccion_id = txData.id;
    }

    if (!transaccion_id) {
      throw new Error("No se pudo obtener o generar el ID de la transacción.");
    }

    // 1.5. Si está PAGADA, registrar/actualizar el Asiento de Partida Doble en libro_diario
    if (!isPending) {
      // Si la transacción ya tenía asientos (porque era pendiente y ahora se cobra), los limpiamos
      const { error: cleanLdError } = await supabase
        .from('libro_diario')
        .delete()
        .eq('transaccion_id', transaccion_id);
      if (cleanLdError) console.error("Error al limpiar asientos contables antiguos:", cleanLdError.message);

      const { data: nextSeatData, error: seatError } = await supabase.rpc('siguiente_nro_asiento');
      if (seatError) throw new Error("Error al generar el número de asiento: " + seatError.message);
      const nextSeat = nextSeatData;

      const fechaTx = extraData?.fecha || new Date().toISOString().split('T')[0];
      const glosaTx = `Ingreso Venta POS - ${detalleStr || 'Venta POS'}`;
      const montoBruto = total + montoDescuento;

      const asientos = [
        {
          fecha: fechaTx,
          nro_asiento: nextSeat,
          transaccion_id: transaccion_id,
          codigo_cuenta: codigoDebe,
          debe: total,
          haber: 0,
          glosa: glosaTx
        },
        {
          fecha: fechaTx,
          nro_asiento: nextSeat,
          transaccion_id: transaccion_id,
          codigo_cuenta: codigoHaber,
          debe: 0,
          haber: montoBruto,
          glosa: glosaTx
        }
      ];

      // Si hubo descuento, se debita "Descuentos sobre Ventas" por el monto rebajado para
      // que Ventas quede registrada a precio de lista y el descuento quede auditable.
      if (montoDescuento > 0) {
        asientos.push({
          fecha: fechaTx,
          nro_asiento: nextSeat,
          transaccion_id: transaccion_id,
          codigo_cuenta: '5010103',
          debe: montoDescuento,
          haber: 0,
          glosa: `Descuento aplicado - ${motivoDescuento || glosaTx}`
        });
      }

      const { error: ldError } = await supabase
        .from('libro_diario')
        .insert(asientos);

      if (ldError) throw new Error("Error al registrar el asiento de partida doble en el Libro Diario: " + ldError.message);
    } else {
      // Si se guarda como PENDIENTE, nos aseguramos de borrar cualquier asiento contable previo por seguridad
      await supabase
        .from('libro_diario')
        .delete()
        .eq('transaccion_id', transaccion_id);
    }

    // 2. Limpiar y re-insertar Detalles de Transacción
    const { error: cleanDetError } = await supabase
      .from('detalles_transaccion')
      .delete()
      .eq('transaccion_id', transaccion_id);

    if (cleanDetError) throw new Error("Error al limpiar los detalles de venta anteriores: " + cleanDetError.message);

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

    // 3. AUTOMATIZACIÓN DE INVENTARIO: Deducción Condicional de Empaques si es 'LLEVAR' (solo si está PAGADA)
    if (!isPending && tipoPedido === 'LLEVAR') {
      try {
        // 3a. Query the packaging items from 'productos' dynamically by category
        const { data: packagingList } = await supabase
          .from('productos')
          .select('id, nombre')
          .eq('categoria', 'Insumos de Empaque');

        if (packagingList && packagingList.length > 0) {
          // 3b. Fetch the actual categories and names of all items in the current transaction
          const productIds = items.map(item => item.producto_id);
          const { data: productDetails } = await supabase
            .from('productos')
            .select('id, nombre, categoria')
            .in('id', productIds);

          if (productDetails && productDetails.length > 0) {
            let totalCups = 0;
            let totalBags = 0;

            items.forEach(item => {
              const detail = productDetails.find(p => p.id === item.producto_id);
              if (detail) {
                const catLower = (detail.categoria || "").toLowerCase();
                const nameLower = (detail.nombre || "").toLowerCase();

                // Beverage check: Category has Caliente or Fría, or name matches hot/cold beverages
                const isBeverage = catLower.includes("caliente") || 
                                   catLower.includes("fría") ||
                                   nameLower.includes("latte") || 
                                   nameLower.includes("cappuccino") || 
                                   nameLower.includes("espresso") || 
                                   nameLower.includes("flat white") || 
                                   nameLower.includes("moca") || 
                                   nameLower.includes("cortado") || 
                                   nameLower.includes("bombon") ||
                                   nameLower.includes("matcha") || 
                                   nameLower.includes("chai") || 
                                   nameLower.includes("chocolate") || 
                                   nameLower.includes("frapuccino") || 
                                   nameLower.includes("cold brew") || 
                                   nameLower.includes("infusión") || 
                                   nameLower.includes("soda") || 
                                   nameLower.includes("jugo");

                // Bagged coffee check: Category has "bolsas", or name contains "bolsa"
                const isBaggedCoffee = catLower.includes("bolsas") || 
                                       nameLower.includes("bolsa");

                if (isBeverage) {
                  totalCups += item.cantidad;
                } else if (isBaggedCoffee) {
                  totalBags += item.cantidad;
                }
              }
            });

            // Limpiamos cualquier movimiento de inventario automático previo para esta transacción (evitar duplicados al re-cobrar)
            await supabase
              .from('movimientos_inventario')
              .delete()
              .eq('tipo_operacion', 'SALIDA')
              .like('detalle', `Descuento aut. por Venta para Llevar #${transaccion_id}%`);

            // 3c. Decrement Vaso de Cartón if needed
            if (totalCups > 0) {
              const vasoItem = packagingList.find(p => p.nombre.toLowerCase().includes("vaso"));
              if (vasoItem) {
                const { error: invErr1 } = await supabase
                  .from('movimientos_inventario')
                  .insert([{
                    fecha: extraData?.fecha || new Date().toISOString().split('T')[0],
                    producto_id: vasoItem.id,
                    tipo_operacion: 'SALIDA',
                    cantidad: totalCups,
                    entradas: 0,
                    salidas: totalCups,
                    detalle: `Descuento aut. por Venta para Llevar #${transaccion_id} (${totalCups} vasos)`,
                    costo_unitario: 0,
                    debe: 0,
                    haber: 0,
                    saldo_unidades: 0,
                    saldo_valor: 0
                  }]);
                if (invErr1) console.error("Error decrementing packaging vaso:", invErr1.message);
              }
            }

            // 3d. Decrement Bolsa de Papel if needed
            if (totalBags > 0) {
              const bolsaItem = packagingList.find(p => p.nombre.toLowerCase().includes("bolsa"));
              if (bolsaItem) {
                const { error: invErr2 } = await supabase
                  .from('movimientos_inventario')
                  .insert([{
                    fecha: extraData?.fecha || new Date().toISOString().split('T')[0],
                    producto_id: bolsaItem.id,
                    tipo_operacion: 'SALIDA',
                    cantidad: totalBags,
                    entradas: 0,
                    salidas: totalBags,
                    detalle: `Descuento aut. por Venta para Llevar #${transaccion_id} (${totalBags} bolsas)`,
                    costo_unitario: 0,
                    debe: 0,
                    haber: 0,
                    saldo_unidades: 0,
                    saldo_valor: 0
                  }]);
                if (invErr2) console.error("Error decrementing packaging bolsa:", invErr2.message);
              }
            }
          }
        }
      } catch (err: any) {
        console.error("Error in conditional packaging inventory deduction:", err.message || err);
      }
    }

    return transaccion_id;
  },

  async obtenerVentasPendientes() {
    const { data: txs, error: txError } = await supabase
      .from('transacciones')
      .select('*')
      .eq('estado', 'PENDIENTE')
      .order('id', { ascending: true });

    if (txError) throw txError;

    const result = [];
    for (const tx of (txs || [])) {
      const { data: details, error: detError } = await supabase
        .from('detalles_transaccion')
        .select('*, productos(*)')
        .eq('transaccion_id', tx.id);

      if (detError) throw detError;

      const mappedItems = (details || []).map((d: any) => ({
        id: d.producto_id,
        nombre: d.productos?.nombre || 'Producto Desconocido',
        categoria: d.productos?.categoria || 'Otros',
        precio_venta: Number(d.precio_unitario),
        es_inventariable: d.productos?.es_inventariable || false,
        cantidad: d.cantidad
      }));

      result.push({
        ...tx,
        items: mappedItems
      });
    }

    return result;
  },

  async eliminarTransaccion(id: number) {
    const { error } = await supabase
      .from('transacciones')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};
