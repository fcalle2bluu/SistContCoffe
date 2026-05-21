"use client";

import { useEffect, useState, useMemo } from "react";
import { ProductosService, Producto } from "@/lib/services/productos.service";
import { PosService } from "@/lib/services/pos.service";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, Trash2, Receipt, Coffee } from "lucide-react";

type CartItem = Producto & { cantidad: number };

export default function POSPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    fetchProductos();
  }, []);

  async function fetchProductos() {
    try {
      // Obtenemos solo los productos que tienen precio (vendibles)
      const data = await ProductosService.getProductos();
      setProductos(data.filter(p => p.precio_venta > 0));
    } catch (error: any) {
      toast.error("Error al cargar menú: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Cart Logic ---
  const addToCart = (producto: Producto) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === producto.id);
      if (existing) {
        return prev.map(item => item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, { ...producto, cantidad: 1 }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQuantity = item.cantidad + delta;
        return newQuantity > 0 ? { ...item, cantidad: newQuantity } : item;
      }
      return item;
    }));
  };

  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0);
  }, [cart]);

  // --- Checkout ---
  const handleCheckout = async () => {
    if (cart.length === 0) return toast.error("El carrito está vacío");
    setProcesando(true);

    try {
      const itemsToSave = cart.map(item => ({
        producto_id: item.id,
        cantidad: item.cantidad,
        precio: item.precio_venta
      }));

      const txId = await PosService.procesarVenta(total, itemsToSave);
      toast.success(`¡Venta #${txId} registrada exitosamente!`);
      setCart([]); // Vaciamos carrito
    } catch (error: any) {
      toast.error("Error al procesar el cobro: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-theme(spacing.16))] md:h-screen w-full bg-stone-100/50">
      
      {/* Panel Izquierdo: Catálogo */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-4 bg-white border-b">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Coffee className="w-6 h-6 text-amber-600" /> 
            Menú POS
          </h1>
          <p className="text-sm text-muted-foreground">Toca un producto para añadirlo al ticket.</p>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Cargando menú...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
              {productos.map(producto => (
                <Card 
                  key={producto.id} 
                  className="cursor-pointer hover:border-amber-400 hover:shadow-md transition-all active:scale-95 flex flex-col justify-between h-32"
                  onClick={() => addToCart(producto)}
                >
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full gap-2">
                    <span className="font-semibold text-sm leading-tight text-balance">{producto.nombre}</span>
                    <span className="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-md text-xs">
                      Bs. {producto.precio_venta.toFixed(2)}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Panel Derecho: Ticket / Carrito */}
      <div className="w-full md:w-96 bg-white border-l flex flex-col h-[50vh] md:h-full shadow-xl z-10">
        <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> Ticket Actual</h2>
          <span className="bg-stone-800 px-2 py-1 rounded-full text-xs font-medium">{cart.length} ítems</span>
        </div>

        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 mt-20 gap-4">
              <Receipt className="w-16 h-16 opacity-20" />
              <p>El ticket está vacío</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="flex flex-col gap-2 p-3 bg-stone-50 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-sm">{item.nombre}</span>
                    <span className="font-bold text-sm">Bs. {(item.precio_venta * item.cantidad).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center border bg-white rounded-md">
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7 rounded-none" onClick={() => updateQuantity(item.id, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{item.cantidad}</span>
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7 rounded-none" onClick={() => updateQuantity(item.id, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeFromCart(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Totales y Cobro */}
        <div className="p-4 bg-stone-50 border-t space-y-4">
          <div className="flex justify-between items-center text-lg">
            <span className="text-muted-foreground">Total:</span>
            <span className="text-3xl font-black text-green-600">Bs. {total.toFixed(2)}</span>
          </div>
          <Button 
            className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700" 
            disabled={cart.length === 0 || procesando}
            onClick={handleCheckout}
          >
            {procesando ? "Procesando..." : "Cobrar Ticket"}
          </Button>
        </div>
      </div>
      
    </div>
  );
}
