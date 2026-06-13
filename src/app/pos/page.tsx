"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { ProductosService, Producto } from "@/lib/services/productos.service";
import { PosService } from "@/lib/services/pos.service";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  ShoppingCart, Plus, Minus, Trash2, Receipt, Coffee, Search, X, 
  Sparkles, RefreshCw, Layers, CreditCard, ChevronRight, CheckCircle,
  Percent, DollarSign, AlertCircle, ShoppingBag, Utensils, Edit3
} from "lucide-react";
import ModalProducto from "@/components/erp/ModalProducto";

type CartItem = Producto & { cantidad: number; isCustom?: boolean };

// Map categories to modern visual themes (emojis, premium colors, descriptive subtitles)
const getProductTheme = (producto: Producto) => {
  const name = producto.nombre.toLowerCase();
  const cat = (producto.categoria || "").toLowerCase();

  if (name.includes("espresso") || name.includes("doppio") || name.includes("americano")) {
    return {
      emoji: "☕",
      gradient: "from-amber-800 to-amber-950",
      bgLight: "bg-amber-50 text-amber-900 border-amber-200 hover:border-amber-400",
      iconColor: "text-amber-800",
      desc: "Café Puro Caliente"
    };
  }
  if (name.includes("cappuccino") || name.includes("latte") || name.includes("flat") || name.includes("moca") || name.includes("cortado") || name.includes("bombon") || name.includes("macchiato")) {
    return {
      emoji: "🥛",
      gradient: "from-amber-700 to-amber-900",
      bgLight: "bg-amber-100/60 text-amber-950 border-amber-300 hover:border-amber-500",
      iconColor: "text-amber-700",
      desc: "Café de Especialidad"
    };
  }
  if (name.includes("iced") || name.includes("cold") || name.includes("smoothie") || name.includes("frapuccino")) {
    return {
      emoji: "🧊",
      gradient: "from-cyan-600 to-blue-700",
      bgLight: "bg-cyan-50 text-cyan-900 border-cyan-200 hover:border-cyan-400",
      iconColor: "text-cyan-600",
      desc: "Bebida Fría / Hielo"
    };
  }
  if (name.includes("soda") || name.includes("jugo") || name.includes("agua")) {
    return {
      emoji: "🍹",
      gradient: "from-orange-400 to-red-600",
      bgLight: "bg-orange-50 text-orange-950 border-orange-200 hover:border-orange-400",
      iconColor: "text-orange-600",
      desc: "Refresco & Fruta"
    };
  }
  if (cat.includes("pastelería") || cat.includes("repostería") || name.includes("croissant") || name.includes("rollo") || name.includes("brownie") || name.includes("muffin") || name.includes("galleta") || name.includes("empanada") || name.includes("tiramisú") || name.includes("cheesecake") || name.includes("sándwich")) {
    return {
      emoji: "🥐",
      gradient: "from-yellow-500 to-amber-600",
      bgLight: "bg-yellow-50 text-yellow-950 border-yellow-200 hover:border-yellow-400",
      iconColor: "text-yellow-600",
      desc: "Pastelería de Barra"
    };
  }
  if (name.includes("infusión") || name.includes("té")) {
    return {
      emoji: "🍵",
      gradient: "from-emerald-500 to-teal-700",
      bgLight: "bg-emerald-50 text-emerald-950 border-emerald-200 hover:border-emerald-400",
      iconColor: "text-emerald-600",
      desc: "Té & Hierbas"
    };
  }
  if (name.includes("v-60") || name.includes("aeropress") || name.includes("prensa") || cat.includes("métodos")) {
    return {
      emoji: "🧪",
      gradient: "from-slate-600 to-slate-800",
      bgLight: "bg-slate-100 text-slate-900 border-slate-200 hover:border-slate-400",
      iconColor: "text-slate-700",
      desc: "Método Filtrado"
    };
  }
  if (name.includes("bolsa") || name.includes("café en grano") || cat.includes("bolsas")) {
    return {
      emoji: "🛍️",
      gradient: "from-emerald-800 to-emerald-950",
      bgLight: "bg-emerald-50 text-emerald-900 border-emerald-300 hover:border-emerald-500",
      iconColor: "text-emerald-700",
      desc: "Café en Grano / Molido"
    };
  }
  
  return {
    emoji: "✨",
    gradient: "from-stone-600 to-stone-850",
    bgLight: "bg-stone-50 text-stone-900 border-stone-200 hover:border-stone-400",
    iconColor: "text-stone-700",
    desc: "Varios"
  };
};

export default function POSPage() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("Todos");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Order Type & Discount States
  const [tipoPedido, setTipoPedido] = useState<'SITIO' | 'LLEVAR'>('SITIO');
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const [tipoDescuento, setTipoDescuento] = useState<'MONTO' | 'PORCENTAJE'>('MONTO');
  const [valorDescuento, setValorDescuento] = useState<number>(0);
  const [motivoDescuento, setMotivoDescuento] = useState<string>("");

  // Custom Item state
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customItem, setCustomItem] = useState({
    nombre: "",
    precio_venta: "",
    categoria: "Repostería / Pastelería"
  });

  // Checkout modal states
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutData, setCheckoutData] = useState({
    mesa: 'Mesa 1',
    customMesa: '',
    responsable: 'Turno Mañana',
    customResponsable: '',
    metodo_pago: 'EFECTIVO',
    pago: 0,
    cambio: 0,
    observacion: '',
    tiene_factura: true
  });

  // Tarea 2: Impresión de ticket
  const [ultimoTicket, setUltimoTicket] = useState<{ txId: number; items: any[]; total: number; extra: any } | null>(null);

  // reimpresión de tickets históricos del día
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [todayTickets, setTodayTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Shift management states
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [openShiftData, setOpenShiftData] = useState({
    turno: 'Turno Mañana',
    monto_inicial: 690.00
  });

  // Outflow (Egreso) modal states
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoData, setEgresoData] = useState({
    detalle: '',
    monto: '',
    categoria: 'Insumos alimenticios',
    tiene_factura: false
  });

  // Shift close modal states
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [efectivoRealContado, setEfectivoRealContado] = useState<number | ''>('');

  // Open Accounts (Cuentas Abiertas) States
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [selectedMesa, setSelectedMesa] = useState<string>("Mesa 1");
  const [customMesaName, setCustomMesaName] = useState<string>("");
  const [activePendingTxId, setActivePendingTxId] = useState<number | null>(null);

  // Shift summary (detailed desglose)
  const [shiftSummary, setShiftSummary] = useState({
    countEfectivo: 0,
    sumEfectivo: 0,
    countQr: 0,
    sumQr: 0,
    countPos: 0,
    sumPos: 0,
    totalVentas: 0,
    totalCount: 0
  });

  const fetchPendingTransactions = async () => {
    try {
      const data = await PosService.obtenerVentasPendientes();
      setPendingTransactions(data);
    } catch (err: any) {
      console.error("Error al cargar cuentas abiertas:", err.message);
    }
  };

  const handleGuardarCuentaAbierta = async () => {
    if (cart.length === 0) return toast.error("El ticket está vacío");
    setProcesando(true);
    try {
      const itemsToSave = [];
      for (const item of cart) {
        if (item.isCustom) {
          const created = await ProductosService.createProducto({
            nombre: item.nombre,
            categoria: item.categoria,
            precio_venta: item.precio_venta,
            es_inventariable: false
          });
          itemsToSave.push({
            producto_id: created.id,
            cantidad: item.cantidad,
            precio: item.precio_venta,
            nombre: item.nombre
          });
        } else {
          itemsToSave.push({
            producto_id: item.id,
            cantidad: item.cantidad,
            precio: item.precio_venta,
            nombre: item.nombre
          });
        }
      }

      const now = new Date();
      const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const finalMesa = selectedMesa === 'Otro' ? (customMesaName.trim() || 'Mesa') : selectedMesa;

      const extraData = {
        id: activePendingTxId || undefined,
        mesa: finalMesa,
        hora,
        responsable: currentUser?.nombre || 'Turno Mañana',
        tipo_pedido: tipoPedido,
        monto_descuento: montoDescuentoCalculado,
        motivo_descuento: valorDescuento > 0 ? motivoDescuento.trim() : undefined,
        estado: 'PENDIENTE' as const
      };

      const txId = await PosService.procesarVenta(total, itemsToSave, extraData);
      toast.success(`Cuenta guardada en ${finalMesa} (Ticket #${txId})`);

      setCart([]);
      setActivePendingTxId(null);
      setSelectedMesa("Mesa 1");
      setCustomMesaName("");
      setValorDescuento(0);
      setMotivoDescuento("");
      setShowDiscountSection(false);

      await fetchPendingTransactions();
    } catch (err: any) {
      toast.error("Error al guardar la cuenta: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const fetchShiftSummary = async () => {
    if (!activeShift) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('transacciones')
        .select('metodo_pago, monto_total')
        .eq('fecha', todayStr)
        .eq('responsable', activeShift.cashier)
        .eq('tipo_movimiento', 'INGRESO')
        .eq('estado', 'PAGADA');

      if (error) throw error;

      let countEfectivo = 0;
      let sumEfectivo = 0;
      let countQr = 0;
      let sumQr = 0;
      let countPos = 0;
      let sumPos = 0;

      data?.forEach(tx => {
        const val = Number(tx.monto_total || 0);
        if (tx.metodo_pago === 'EFECTIVO') {
          countEfectivo++;
          sumEfectivo += val;
        } else if (tx.metodo_pago === 'QR') {
          countQr++;
          sumQr += val;
        } else if (tx.metodo_pago === 'POS') {
          countPos++;
          sumPos += val;
        }
      });

      setShiftSummary({
        countEfectivo,
        sumEfectivo,
        countQr,
        sumQr,
        countPos,
        sumPos,
        totalVentas: sumEfectivo + sumQr + sumPos,
        totalCount: countEfectivo + countQr + countPos
      });
    } catch (err: any) {
      console.error("Error al obtener el desglose del turno:", err);
    }
  };

  const handleOpenCloseShiftModal = async () => {
    setEfectivoRealContado('');
    await fetchShiftSummary();
    setShowCloseShiftModal(true);
  };

  const fetchTodayTickets = async () => {
    setLoadingTickets(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('transacciones')
        .select('*')
        .eq('fecha', todayStr)
        .eq('tipo_movimiento', 'INGRESO')
        .order('id', { ascending: false });

      if (error) throw error;
      setTodayTickets(data || []);
    } catch (err: any) {
      toast.error("Error al cargar los tickets de hoy: " + err.message);
    } finally {
      setLoadingTickets(false);
    }
  };

  const imprimirTicketHistorico = async (tx: any) => {
    toast.info(`Cargando detalles de Venta #${tx.id}...`);
    try {
      const { data: details, error } = await supabase
        .from('detalles_transaccion')
        .select('cantidad, precio_unitario, producto_id, productos (nombre)')
        .eq('transaccion_id', tx.id);

      if (error) throw error;

      if (!details || details.length === 0) {
        toast.error("No se encontraron detalles para esta venta.");
        return;
      }

      // Map details to items format expected by imprimirTicket
      const mappedItems = details.map((d: any) => ({
        cantidad: d.cantidad,
        precio: Number(d.precio_unitario),
        nombre: d.productos?.nombre || 'Producto'
      }));

      const extraData = {
        fecha: tx.fecha,
        hora: tx.hora,
        responsable: tx.responsable,
        mesa: tx.mesa,
        metodo_pago: tx.metodo_pago,
        pago: Number(tx.pago || 0),
        cambio: Number(tx.cambio || 0),
        tipo_pedido: tx.tipo_pedido,
        monto_descuento: Number(tx.monto_descuento || 0),
        motivo_descuento: tx.motivo_descuento
      };

      imprimirTicket(tx.id, mappedItems, Number(tx.monto_total), extraData);
      toast.success("Impresión enviada.");
    } catch (err: any) {
      toast.error("Error al imprimir ticket: " + err.message);
    }
  };

  const imprimirTicket = (txId: number, items: any[], totalVal: number, extra: any) => {
    if (typeof window === "undefined") return;
    let iframe = document.getElementById("print-iframe") as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "print-iframe";
      iframe.style.position = "absolute";
      iframe.style.width = "0px";
      iframe.style.height = "0px";
      iframe.style.border = "none";
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const fechaStr = extra.fecha || new Date().toLocaleDateString('es-BO');
    const horaStr = extra.hora || new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    const mesaStr = extra.mesa || 'Consumir en Sitio';
    const tipoPedidoStr = extra.tipo_pedido === 'LLEVAR' ? 'Para Llevar (Takeaway)' : 'En Sitio (Servir)';
    
    const descuentoVal = Number(extra.monto_descuento || 0);
    const descuentoStr = descuentoVal > 0 
      ? `<tr><td style="padding: 2px 0;">DESCUENTO:</td><td style="text-align:right; padding: 2px 0;">-Bs. ${descuentoVal.toFixed(2)}</td></tr>
         <tr><td colspan="2" style="font-size: 9px; color: #333; padding-bottom: 4px;">Motivo: ${extra.motivo_descuento || 'Justificado'}</td></tr>` 
      : '';
      
    const pagoDetalles = extra.metodo_pago === 'EFECTIVO' 
      ? `<tr><td style="padding: 2px 0;">RECIBIDO:</td><td style="text-align:right; padding: 2px 0;">Bs. ${(extra.pago || 0).toFixed(2)}</td></tr>
         <tr><td style="padding: 2px 0; font-weight: bold;">CAMBIO:</td><td style="text-align:right; padding: 2px 0; font-weight: bold;">Bs. ${(extra.cambio || 0).toFixed(2)}</td></tr>`
      : '';

    const itemsRows = items.map(item => `
      <tr>
        <td style="padding: 4px 0; vertical-align: top;">${item.cantidad} x</td>
        <td style="padding: 4px 0; vertical-align: top;">
          ${item.nombre}
        </td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top;">Bs. ${(item.precio * item.cantidad).toFixed(2)}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <html>
      <head>
        <title>Ticket #${txId}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 72mm;
            margin: 0;
            padding: 8px;
            font-size: 11px;
            color: #000;
            line-height: 1.25;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .header { margin-bottom: 10px; }
          .title { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
          .subtitle { font-size: 9px; margin-top: 1px; }
          .separator { border-top: 1px dashed #000; margin: 6px 0; }
          .item-table { width: 100%; border-collapse: collapse; }
          .item-table th, .item-table td { font-size: 10px; }
          .item-table th { border-bottom: 1px solid #000; padding-bottom: 3px; font-weight: bold; }
          .totals { margin-top: 6px; width: 100%; border-top: 1px dashed #000; padding-top: 4px; }
          .totals td { padding: 1.5px 0; font-size: 10px; }
          .footer { margin-top: 16px; font-size: 9px; border-top: 1px dashed #000; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header text-center">
          <div class="title">CAFÉ YANALOMA</div>
          <div class="subtitle">Cultura & Especialidad de Café</div>
          <div style="font-size: 8px;">La Paz - Bolivia</div>
        </div>
        <div class="separator"></div>
        <div style="font-size: 9px;">
          <div><b>TICKET NRO:</b> #${txId}</div>
          <div><b>FECHA:</b> ${fechaStr} ${horaStr}</div>
          <div><b>RESPONSABLE:</b> ${extra.responsable}</div>
          <div><b>MODO PEDIDO:</b> ${tipoPedidoStr}</div>
          ${extra.mesa ? `<div><b>UBICACIÓN:</b> ${mesaStr}</div>` : ''}
        </div>
        <div class="separator"></div>
        <table class="item-table">
          <thead>
            <tr>
              <th align="left" style="width: 15%;">CANT</th>
              <th align="left">PRODUCTO</th>
              <th align="right" style="width: 25%;">SUBT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        
        <table class="totals">
          <tr>
            <td style="padding: 2px 0;">SUBTOTAL:</td>
            <td style="text-align:right; padding: 2px 0;">Bs. ${(totalVal + descuentoVal).toFixed(2)}</td>
          </tr>
          ${descuentoStr}
          <tr class="bold" style="font-size: 11px;">
            <td style="padding: 2px 0;">TOTAL A PAGAR:</td>
            <td style="text-align:right; padding: 2px 0;">Bs. ${totalVal.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 2px 0;">MÉTODO PAGO:</td>
            <td style="text-align:right; padding: 2px 0;">${extra.metodo_pago}</td>
          </tr>
          ${pagoDetalles}
        </table>
        
        <div class="footer text-center">
          <div>¡Muchas gracias por su visita!</div>
          <div style="font-size: 7.5px; margin-top: 3px; color: #444;">Desarrollado por Café Yanaloma</div>
        </div>
      </body>
      </html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 250);
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('yanaloma_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.role === 'otro') {
          alert("Acceso denegado: su rol de consulta no permite usar la caja POS.");
          window.location.href = '/';
          return;
        }
        setCurrentUser(parsed);
        setCheckoutData(prev => ({
          ...prev,
          responsable: parsed.nombre
        }));
      } catch (e) {
        console.error("Error parsing user from localStorage:", e);
      }
    }

    const storedShift = localStorage.getItem('yanaloma_shift');
    if (storedShift) {
      try {
        setActiveShift(JSON.parse(storedShift));
      } catch (e) {
        console.error("Error parsing activeShift from localStorage:", e);
      }
    }

    setUserLoaded(true);
    fetchProductos();
    fetchPendingTransactions();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);

    const cleanUser = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('username', cleanUser)
        .eq('password', cleanPass)
        .maybeSingle();

      if (data) {
        if (data.role === 'otro') {
          setAuthError('Acceso denegado: su rol de consulta no permite usar la caja POS.');
          setAuthSubmitting(false);
          return;
        }
        localStorage.setItem('yanaloma_user', JSON.stringify(data));
        setCurrentUser(data);
        setCheckoutData(prev => ({
          ...prev,
          responsable: data.nombre
        }));
        toast.success(`¡Bienvenido a Caja, ${data.nombre}!`);
      } else {
        const localSeedUsers = [
          { username: 'admin', password: 'admin123', role: 'admin', nombre: 'Administrador Yanaloma' },
          { username: 'cajero', password: 'cajero123', role: 'cajero', nombre: 'Cajero de Turno' },
          { username: 'otro', password: 'otro123', role: 'otro', nombre: 'Consultor Contable' }
        ];

        const localMatch = localSeedUsers.find(u => u.username === cleanUser && u.password === cleanPass);
        if (localMatch) {
          if (localMatch.role === 'otro') {
            setAuthError('Acceso denegado: su rol de consulta no permite usar la caja POS.');
            setAuthSubmitting(false);
            return;
          }
          localStorage.setItem('yanaloma_user', JSON.stringify(localMatch));
          setCurrentUser(localMatch);
          setCheckoutData(prev => ({
            ...prev,
            responsable: localMatch.nombre
          }));
          toast.success(`¡Bienvenido a Caja, ${localMatch.nombre}! (Local)`);
        } else {
          setAuthError('Credenciales incorrectas. Intente nuevamente.');
        }
      }
    } catch (err: any) {
      console.error("Database auth error, trying local fallback:", err);
      const localSeedUsers = [
        { username: 'admin', password: 'admin123', role: 'admin', nombre: 'Administrador Yanaloma' },
        { username: 'cajero', password: 'cajero123', role: 'cajero', nombre: 'Cajero de Turno' },
        { username: 'otro', password: 'otro123', role: 'otro', nombre: 'Consultor Contable' }
      ];

      const localMatch = localSeedUsers.find(u => u.username === cleanUser && u.password === cleanPass);
      if (localMatch) {
        if (localMatch.role === 'otro') {
          setAuthError('Acceso denegado: su rol de consulta no permite usar la caja POS.');
          setAuthSubmitting(false);
          return;
        }
        localStorage.setItem('yanaloma_user', JSON.stringify(localMatch));
        setCurrentUser(localMatch);
        setCheckoutData(prev => ({
          ...prev,
          responsable: localMatch.nombre
        }));
        toast.success(`¡Bienvenido a Caja, ${localMatch.nombre}! (Local)`);
      } else {
        setAuthError('Credenciales incorrectas o error de conexión con la base de datos.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  async function fetchProductos() {
    try {
      const data = await ProductosService.getProductos();
      // Keep only active sellable products
      setProductos(data.filter(p => p.precio_venta > 0));
    } catch (error: any) {
      toast.error("Error al cargar menú: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteProduct = async (id: number, nombre: string) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar el producto "${nombre}" de forma permanente del catálogo?`)) return;
    try {
      await ProductosService.deleteProducto(id);
      toast.success("Producto eliminado con éxito");
      await fetchProductos();
    } catch (e: any) {
      toast.error("Error al eliminar producto: " + e.message);
    }
  };

  const handleEditProduct = (producto: Producto) => {
    setEditingProduct(producto);
    setShowProductModal(true);
  };

  // --- Cart Logic ---
  const addToCart = (producto: Producto) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === producto.id && !item.isCustom);
      if (existing) {
        return prev.map(item => item.id === producto.id && !item.isCustom ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, { ...producto, cantidad: 1 }];
    });
    toast.success(`${producto.nombre} añadido al ticket`, { duration: 1000 });
  };

  const addCustomToCart = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(customItem.precio_venta);
    if (!customItem.nombre.trim() || isNaN(price) || price <= 0) {
      return toast.error("Por favor ingresa un nombre y precio válidos");
    }

    const virtualProduct: CartItem = {
      id: Math.round(-Date.now() + Math.random() * 1000), // safe virtual negative id
      nombre: customItem.nombre.trim(),
      categoria: customItem.categoria,
      precio_venta: price,
      es_inventariable: false,
      cantidad: 1,
      isCustom: true
    };

    setCart(prev => [...prev, virtualProduct]);
    setCustomItem({ nombre: "", precio_venta: "", categoria: "Repostería / Pastelería" });
    setShowCustomForm(false);
    toast.success(`Producto personalizado añadido`, { duration: 1500 });
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

  // --- Financial Calculations (Including Discounts) ---
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0);
  }, [cart]);

  const montoDescuentoCalculado = useMemo(() => {
    if (valorDescuento <= 0) return 0;
    if (tipoDescuento === 'PORCENTAJE') {
      return Number(((subtotal * valorDescuento) / 100).toFixed(2));
    }
    return Math.min(valorDescuento, subtotal);
  }, [subtotal, tipoDescuento, valorDescuento]);

  const total = useMemo(() => {
    return Math.max(0, Number((subtotal - montoDescuentoCalculado).toFixed(2)));
  }, [subtotal, montoDescuentoCalculado]);

  // Check if discount fields are valid (Motivo is mandatory if discount > 0)
  const isDescuentoInvalido = useMemo(() => {
    return valorDescuento > 0 && !motivoDescuento.trim();
  }, [valorDescuento, motivoDescuento]);

  // Available categories in the menu dynamically
  const categoriesList = useMemo(() => {
    const list = new Set<string>();
    productos.forEach(p => {
      if (p.categoria) list.add(p.categoria);
    });
    return ["Todos", ...Array.from(list)];
  }, [productos]);

  // Filter products by category and search term
  const filteredProductos = useMemo(() => {
    return productos.filter(p => {
      const matchCategory = activeCategory === "Todos" || p.categoria === activeCategory;
      const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.categoria || "").toLowerCase().includes(searchTerm.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [productos, activeCategory, searchTerm]);

  // --- Modal Open ---
  const openCheckout = () => {
    if (cart.length === 0) return toast.error("El carrito está vacío");
    if (isDescuentoInvalido) {
      return toast.error("Debes justificar el descuento antes de proceder");
    }
    setCheckoutData({
      mesa: tipoPedido === 'LLEVAR' ? 'Llevar' : 'Mesa 1',
      customMesa: '',
      responsable: 'Turno Mañana',
      customResponsable: '',
      metodo_pago: 'EFECTIVO',
      pago: total,
      cambio: 0,
      observacion: '',
      tiene_factura: true
    });
    setShowCheckoutModal(true);
  };

  const handleCheckoutDataChange = (name: string, value: any) => {
    setCheckoutData(prev => {
      const updated = { ...prev, [name]: value };
      
      if (updated.metodo_pago === 'EFECTIVO') {
        const payAmount = Number(updated.pago) || 0;
        updated.cambio = Math.max(0, Number((payAmount - total).toFixed(2)));
      } else {
        updated.pago = total;
        updated.cambio = 0;
      }
      return updated;
    });
  };

  // --- Checkout Execution ---
  const handleCheckoutSubmit = async () => {
    setProcesando(true);

    try {
      // 1. Process custom items on the fly to save them in database so we satisfy foreign key constraints
      const itemsToSave = [];
      for (const item of cart) {
        if (item.isCustom) {
          // Create product on the fly first
          const created = await ProductosService.createProducto({
            nombre: item.nombre,
            categoria: item.categoria,
            precio_venta: item.precio_venta,
            es_inventariable: false
          });
          itemsToSave.push({
            producto_id: created.id,
            cantidad: item.cantidad,
            precio: item.precio_venta,
            nombre: item.nombre
          });
        } else {
          itemsToSave.push({
            producto_id: item.id,
            cantidad: item.cantidad,
            precio: item.precio_venta,
            nombre: item.nombre
          });
        }
      }

      const now = new Date();
      const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const finalMesa = checkoutData.mesa === 'Otro' ? (checkoutData.customMesa.trim() || 'Mesa') : checkoutData.mesa;
      const finalResponsable = checkoutData.responsable === 'Otro' ? (checkoutData.customResponsable.trim() || 'Operador') : checkoutData.responsable;

      const extraData = {
        id: activePendingTxId || undefined,
        mesa: tipoPedido === 'LLEVAR' ? 'Llevar' : (finalMesa || 'Mesa 1'),
        hora,
        responsable: finalResponsable || 'Turno Mañana',
        metodo_pago: checkoutData.metodo_pago,
        pago: Number(checkoutData.pago),
        cambio: Number(checkoutData.cambio),
        observacion: checkoutData.observacion.trim() || undefined,
        tiene_factura: checkoutData.tiene_factura,
        // Added fields for discounts and order types
        tipo_pedido: tipoPedido,
        monto_descuento: montoDescuentoCalculado,
        motivo_descuento: valorDescuento > 0 ? motivoDescuento.trim() : undefined,
        estado: 'PAGADA' as const // Finalizada y cobrada
      };

      const txId = await PosService.procesarVenta(total, itemsToSave, extraData);
      toast.success(`¡Venta #${txId} registrada exitosamente!`);

      // Update active shift sales totals
      const storedShift = localStorage.getItem('yanaloma_shift');
      if (storedShift) {
        try {
          const parsedShift = JSON.parse(storedShift);
          if (checkoutData.metodo_pago === 'EFECTIVO') {
            parsedShift.ventas_efectivo = Number((parsedShift.ventas_efectivo + total).toFixed(2));
          } else if (checkoutData.metodo_pago === 'QR') {
            parsedShift.total_qr = Number((parsedShift.total_qr + total).toFixed(2));
          } else if (checkoutData.metodo_pago === 'POS') {
            parsedShift.total_tarjeta = Number((parsedShift.total_tarjeta + total).toFixed(2));
          }
          localStorage.setItem('yanaloma_shift', JSON.stringify(parsedShift));
          setActiveShift(parsedShift);
        } catch (e) {
          console.error("Error updating shift total on checkout:", e);
        }
      }

      // Guardar información del último ticket para reimpresiones
      const ticketInfo = {
        txId,
        items: itemsToSave,
        total,
        extra: {
          ...extraData,
          fecha: now.toLocaleDateString('es-BO')
        }
      };
      setUltimoTicket(ticketInfo);

      // Disparar la impresión automática
      try {
        imprimirTicket(txId, itemsToSave, total, extraData);
      } catch (printErr) {
        console.error("Error al imprimir ticket automáticamente:", printErr);
      }
      
      // Reset POS states
      fetchProductos();
      setCart([]);
      setActivePendingTxId(null);
      setSelectedMesa("Mesa 1");
      setCustomMesaName("");
      setValorDescuento(0);
      setMotivoDescuento("");
      setShowDiscountSection(false);
      setShowCheckoutModal(false);
      
      // Actualizar el dashboard de cuentas abiertas
      await fetchPendingTransactions();
    } catch (error: any) {
      toast.error("Error al procesar el cobro: " + error.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleEgresoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoVal = Number(egresoData.monto);
    if (!egresoData.detalle.trim() || isNaN(montoVal) || montoVal <= 0) {
      return toast.error("Por favor ingrese un detalle y monto válidos.");
    }

    setProcesando(true);

    try {
      const now = new Date();
      const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const fecha = now.toISOString().split('T')[0];

      // Auto-suggest accounts based on category
      let codigo_debe = '40101'; // Otros / Gastos Administrativos
      const cat = egresoData.categoria;
      if (cat === 'Insumos alimenticios') {
        codigo_debe = '11506';
      } else if (cat === 'Costos secundarios') {
        codigo_debe = '12706';
      } else if (cat === 'Servicios básicos') {
        codigo_debe = '12705';
      }

      const txData = {
        fecha,
        detalle: egresoData.detalle.trim(),
        tipo_movimiento: 'EGRESO',
        categoria: cat,
        monto_total: montoVal,
        caja: 0,
        c_chica: montoVal, // egreso comes out of Cashier Caja Chica
        banco: 0,
        pos: 0,
        metodo_pago: 'EFECTIVO',
        tiene_factura: egresoData.tiene_factura,
        responsable: currentUser.nombre,
        hora,
        codigo_debe,
        codigo_haber: '1110102' // Caja Chica
      };

      // 1. Insert into supabase
      let transaccion_id = null;
      try {
        const { data: inserted, error: txError } = await supabase
          .from('transacciones')
          .insert([txData])
          .select('id')
          .single();
        if (txError) throw txError;
        transaccion_id = inserted.id;
      } catch (err) {
        console.error("Supabase insert failed, using local generated ID", err);
        transaccion_id = -Date.now();
      }

      // 2. Insert Double Entry seat into libro_diario
      try {
        const { data: maxSeatData } = await supabase
          .from('libro_diario')
          .select('nro_asiento')
          .order('nro_asiento', { ascending: false })
          .limit(1);
        const nextSeat = maxSeatData && maxSeatData.length > 0 ? (Number(maxSeatData[0].nro_asiento) || 0) + 1 : 1;

        const glosaDiario = `EGRESO Caja POS - ${egresoData.detalle.trim()}`;

        await supabase
          .from('libro_diario')
          .insert([
            {
              fecha,
              nro_asiento: nextSeat,
              transaccion_id: transaccion_id > 0 ? transaccion_id : null,
              codigo_cuenta: codigo_debe,
              debe: montoVal,
              haber: 0,
              glosa: glosaDiario
            },
            {
              fecha,
              nro_asiento: nextSeat,
              transaccion_id: transaccion_id > 0 ? transaccion_id : null,
              codigo_cuenta: '1110102', // Caja Chica
              debe: 0,
              haber: montoVal,
              glosa: glosaDiario
            }
          ]);
      } catch (ldErr) {
        console.error("Failed to insert libro_diario entries for POS egreso:", ldErr);
      }

      // Update local shift accumulation
      if (activeShift) {
        const updatedShift = {
          ...activeShift,
          egresos_efectivo: Number((activeShift.egresos_efectivo + montoVal).toFixed(2))
        };
        localStorage.setItem('yanaloma_shift', JSON.stringify(updatedShift));
        setActiveShift(updatedShift);
      }

      toast.success("Egreso registrado exitosamente.");
      setShowEgresoModal(false);
      setEgresoData({
        detalle: '',
        monto: '',
        categoria: 'Insumos alimenticios',
        tiene_factura: false
      });
    } catch (err: any) {
      toast.error("Error al registrar el egreso: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleCloseShiftSubmit = async () => {
    if (efectivoRealContado === '' || isNaN(Number(efectivoRealContado))) {
      return toast.error("Por favor ingrese el efectivo real contado.");
    }
    
    setProcesando(true);
    
    try {
      const now = new Date();
      const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const fecha = now.toISOString().split('T')[0];
      const real = Number(efectivoRealContado);
      const esperado = activeShift.monto_inicial + shiftSummary.sumEfectivo - activeShift.egresos_efectivo;
      const diferencia = real - esperado;

      const detail = `CIERRE TURNO: ${activeShift.turno} - Cajero: ${activeShift.cashier}`;
      
      const closeTxData = {
        fecha,
        detalle: detail,
        tipo_movimiento: 'INGRESO', // neutral close record
        categoria: 'Otros',
        monto_total: shiftSummary.sumEfectivo,
        caja: 0,
        c_chica: real, // final cash in drawer
        banco: shiftSummary.sumQr,
        pos: shiftSummary.sumPos,
        metodo_pago: 'EFECTIVO',
        tiene_factura: false,
        responsable: activeShift.cashier,
        hora,
        codigo_debe: '1110102',
        codigo_haber: '1110102',
        observacion: `Cierre de Turno. Ef. Inicial: Bs. ${activeShift.monto_inicial.toFixed(2)}. Ef. Real: Bs. ${real.toFixed(2)}. Ef. Esperado: Bs. ${esperado.toFixed(2)}. Dif: Bs. ${diferencia.toFixed(2)}. QR: Bs. ${shiftSummary.sumQr.toFixed(2)} (${shiftSummary.countQr} vtas). POS: Bs. ${shiftSummary.sumPos.toFixed(2)} (${shiftSummary.countPos} vtas). Ventas Totales: Bs. ${shiftSummary.totalVentas.toFixed(2)} (${shiftSummary.totalCount} vtas).`
      };

      // 1. Insert closure transaction in Supabase
      try {
        await supabase.from('transacciones').insert([closeTxData]);
      } catch (err) {
        console.error("Failed to insert closure transaction in DB:", err);
      }

      // 2. Clear shift from localStorage
      localStorage.removeItem('yanaloma_shift');
      setActiveShift(null);
      setEfectivoRealContado('');
      setShowCloseShiftModal(false);
      
      toast.success("Turno cerrado exitosamente.");
    } catch (err: any) {
      toast.error("Error al cerrar el turno: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  if (!userLoaded) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center font-sans">
        <div className="text-center text-stone-200">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-mono text-sm tracking-wider uppercase">Cargando POS Yanaloma...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-stone-955 flex items-center justify-center font-sans relative overflow-hidden" style={{
        backgroundImage: 'radial-gradient(circle at center, #064e3b 0%, #0c0a09 100%)'
      }}>
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="w-full max-w-md mx-4 z-10">
          <div className="bg-stone-900/80 backdrop-blur-xl border border-stone-850 rounded-2xl p-8 shadow-2xl relative">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-t-2xl"></div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-tr from-emerald-700 to-emerald-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg border border-emerald-400/25 mb-4">
                <Coffee className="text-white" size={32} />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight text-center">CAFÉ YANALOMA</h2>
              <p className="text-xs text-stone-400 uppercase tracking-widest font-bold mt-1 text-center">PUNTO DE VENTA (POS)</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2 font-mono">Usuario</label>
                <input 
                  type="text" 
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-950 border border-stone-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder-stone-600 font-mono"
                  placeholder="Ingrese su usuario..."
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2 font-mono">Contraseña</label>
                <input 
                  type="password" 
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-950 border border-stone-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder-stone-600 font-mono"
                  placeholder="••••••••"
                  required
                />
              </div>
              {authError && (
                <div className="bg-red-950/40 border border-red-900/50 text-red-200 text-xs py-2.5 px-3.5 rounded-lg font-bold flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{authError}</span>
                </div>
              )}
              <button 
                type="submit" 
                disabled={authSubmitting}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-950/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] duration-150 cursor-pointer"
              >
                {authSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : 'Iniciar Sesión'}
              </button>
            </form>
            <div className="mt-8 pt-6 border-t border-stone-850 text-center">
              <p className="text-[10px] text-stone-500 font-mono">© 2026 The Roasting Lab S.R.L.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Guard: Prevent 'otro' (consultor) role users from accessing the POS screen
  if (currentUser.role === 'otro') {
    return (
      <div className="min-h-screen bg-stone-955 flex items-center justify-center font-sans">
        <div className="text-center text-stone-200">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-mono text-sm tracking-wider uppercase">Acceso Denegado. Redirigiendo...</p>
        </div>
      </div>
    );
  }

  if (!activeShift && currentUser?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-stone-955 flex items-center justify-center font-sans relative overflow-hidden" style={{
        backgroundImage: 'radial-gradient(circle at center, #064e3b 0%, #0c0a09 100%)'
      }}>
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="w-full max-w-md mx-4 z-10">
          <div className="bg-stone-900/80 backdrop-blur-xl border border-stone-850 rounded-2xl p-8 shadow-2xl relative">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-t-2xl"></div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-tr from-emerald-700 to-emerald-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg border border-emerald-400/25 mb-4">
                <Coffee className="text-white" size={32} />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight text-center">CAFÉ YANALOMA</h2>
              <p className="text-xs text-stone-400 uppercase tracking-widest font-bold mt-1 text-center font-mono">APERTURA DE TURNO Y CAJA</p>
              <p className="text-[10px] text-emerald-400 font-mono mt-2 text-center">Cajero activo: {currentUser.nombre}</p>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2 font-mono">Seleccione su Turno</label>
                <select 
                  value={openShiftData.turno}
                  onChange={(e) => setOpenShiftData(prev => ({ ...prev, turno: e.target.value }))}
                  className="w-full px-4 py-3 bg-stone-950 border border-stone-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-sans font-bold cursor-pointer"
                >
                  <option value="Turno Mañana">Turno Mañana</option>
                  <option value="Turno Tarde">Turno Tarde</option>
                  <option value="Turno Noche">Turno Noche</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2 font-mono">Monto Inicial en Caja (Bs.)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={openShiftData.monto_inicial || ""}
                  onChange={(e) => setOpenShiftData(prev => ({ ...prev, monto_inicial: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-stone-950 border border-stone-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder-stone-600 font-mono font-bold"
                  placeholder="690.00"
                  required
                />
              </div>
              <button 
                type="button" 
                onClick={async () => {
                  const now = new Date();
                  const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                  const fecha = now.toISOString().split('T')[0];
                  
                  // Auto-insert "Ingreso a Caja" record to match CSV
                  try {
                    const txOpening = {
                      fecha,
                      detalle: 'Ingreso a Caja',
                      tipo_movimiento: 'INGRESO',
                      categoria: 'Otros',
                      monto_total: openShiftData.monto_inicial,
                      caja: 0,
                      c_chica: openShiftData.monto_inicial,
                      banco: 0,
                      pos: 0,
                      metodo_pago: 'EFECTIVO',
                      tiene_factura: false,
                      responsable: currentUser.nombre,
                      hora,
                      codigo_debe: '1110102',
                      codigo_haber: '1110102'
                    };
                    await supabase.from('transacciones').insert([txOpening]);
                  } catch (openingErr) {
                    console.error("Failed to insert opening transaction:", openingErr);
                  }

                  const newShift = {
                    cashier: currentUser.nombre,
                    turno: openShiftData.turno,
                    monto_inicial: Number(openShiftData.monto_inicial),
                    ventas_efectivo: 0,
                    egresos_efectivo: 0,
                    total_tarjeta: 0,
                    total_qr: 0,
                    date: now.toLocaleDateString('es-BO')
                  };
                  localStorage.setItem('yanaloma_shift', JSON.stringify(newShift));
                  setActiveShift(newShift);
                  toast.success(`Turno abierto: ${openShiftData.turno}`);
                }}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-950/20 transition-all flex items-center justify-center gap-2 hover:scale-[1.01] duration-150 cursor-pointer"
              >
                Abrir Caja y Turno
              </button>
              
              <button 
                type="button"
                onClick={() => {
                  localStorage.removeItem('yanaloma_user');
                  setCurrentUser(null);
                  toast.info("Sesión cerrada");
                  window.location.reload();
                }}
                className="w-full py-2.5 px-4 bg-stone-850 hover:bg-stone-750 text-stone-300 rounded-xl text-xs font-bold transition-all text-center border border-stone-850 mt-2 cursor-pointer"
              >
                Cerrar Sesión Cajero
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-stone-50 text-stone-850 font-sans antialiased overflow-hidden">
      
      {/* Panel Izquierdo: Catálogo y Categorías */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r">
        
        {/* Header Superior POS */}
        <div className="p-4 bg-emerald-800 text-white shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-900 rounded-lg text-amber-400">
              <Coffee className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight uppercase">Caja Registradora POS</h1>
              <p className="text-[10px] text-emerald-200 font-mono">CAFÉ YANALOMA • OPERANDO COMO: {currentUser.nombre.toUpperCase()}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {activeShift ? (
              <div className="hidden lg:flex flex-col bg-emerald-955/80 border border-emerald-700 px-3 py-1 rounded-xl font-mono text-[10px] leading-tight text-white select-none">
                <span className="text-[8px] uppercase font-bold text-emerald-300">Caja: {activeShift.turno}</span>
                <span className="font-bold text-amber-300">Bs. {(activeShift.monto_inicial + activeShift.ventas_efectivo - activeShift.egresos_efectivo).toFixed(2)}</span>
              </div>
            ) : currentUser?.role === 'admin' ? (
              <div className="hidden lg:flex flex-col bg-emerald-955/80 border border-emerald-700 px-3 py-1 rounded-xl font-mono text-[10px] leading-tight text-white select-none">
                <span className="text-[8px] uppercase font-bold text-emerald-300">Rol: {currentUser.role.toUpperCase()}</span>
                <span className="font-bold text-amber-300">Sin Turno Activo</span>
              </div>
            ) : null}
            <button 
              onClick={() => {
                setLoading(true);
                fetchProductos();
              }}
              title="Actualizar catálogo"
              className="p-2 rounded-lg bg-emerald-900/50 hover:bg-emerald-950 border border-emerald-700 transition-colors text-white"
            >
              <RefreshCw size={16} />
            </button>
            <button 
              onClick={() => setShowCustomForm(true)}
              className="bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center"
            >
              <Plus size={15} /> ➕ Personalizado
            </button>
            <button 
              type="button"
              onClick={() => {
                fetchTodayTickets();
                setShowReprintModal(true);
              }}
              className="bg-zinc-700 hover:bg-zinc-650 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center"
            >
              <Receipt size={15} /> 🖨️ Re-imprimir Ticket
            </button>
            <button 
              type="button"
              onClick={() => setShowEgresoModal(true)}
              className="bg-red-700 hover:bg-red-650 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center"
            >
              💸 Registrar Egreso
            </button>
            {activeShift && (
              <button 
                type="button"
                onClick={handleOpenCloseShiftModal}
                className="bg-amber-750 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center"
              >
                🔑 Cerrar Turno
              </button>
            )}
            {currentUser?.role === 'admin' && (
              <a href="/" className="bg-emerald-900 hover:bg-emerald-950 text-white text-xs font-bold px-4 py-2 rounded-lg border border-emerald-700 transition-all text-center">
                Volver al ERP
              </a>
            )}
            <button 
              type="button"
              onClick={() => {
                localStorage.removeItem('yanaloma_user');
                setCurrentUser(null);
                toast.info("Sesión cerrada");
                window.location.reload();
              }}
              className="bg-red-800 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg border border-red-750 transition-all text-center active:scale-95"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Buscador y Pestañas de Categoría */}
        <div className="bg-white border-b p-4 space-y-4">
          {/* Fila de Buscador */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-stone-400" />
              <input 
                type="text" 
                placeholder="Buscar producto por nombre o categoría..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 bg-stone-50 font-medium"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")} 
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setShowProductModal(true);
                }}
                className="bg-emerald-800 hover:bg-emerald-750 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 transition-all shrink-0 active:scale-95 cursor-pointer"
              >
                <Plus size={15} /> Añadir Producto
              </button>
            )}
          </div>

          {/* Fila de Categorías - Scrollable Horizontal */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin whitespace-nowrap">
            {categoriesList.map(cat => {
              const isActive = activeCategory === cat;
              let icon = "📂";
              if (cat === "Todos") icon = "📦";
              else if (cat.includes("Caliente")) icon = "☕";
              else if (cat.includes("Fría")) icon = "🧊";
              else if (cat.includes("Pastelería") || cat.includes("Repostería")) icon = "🥐";
              else if (cat.includes("Bolsas")) icon = "🛍️";
              else if (cat.includes("Bebidas")) icon = "🍹";
              else if (cat.includes("Infusiones")) icon = "🍵";
              else if (cat.includes("Métodos")) icon = "🧪";

              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all active:scale-95 ${
                    isActive 
                      ? 'bg-emerald-800 text-white border-emerald-900 shadow-sm scale-102 font-extrabold' 
                      : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-850'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Panel de Monitorización de Mesas y Cuentas Abiertas en Tiempo Real */}
        <div className="bg-white border-b p-4 space-y-3 shadow-inner">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              🪑 Mesas & Cuentas Activas
            </h3>
            <span className="text-[10px] bg-amber-50 text-amber-700 font-extrabold px-2.5 py-0.5 rounded border border-amber-200">
              {pendingTransactions.length} Cuentas Abiertas
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Llevar"].map((tableName) => {
              const pendingTx = pendingTransactions.find(t => t.mesa === tableName);
              const isSelected = selectedMesa === tableName;
              
              return (
                <button
                  key={tableName}
                  type="button"
                  onClick={() => {
                    setSelectedMesa(tableName);
                    if (pendingTx) {
                      setCart(pendingTx.items);
                      setActivePendingTxId(pendingTx.id);
                      setTipoPedido(pendingTx.tipo_pedido || 'SITIO');
                      if (pendingTx.monto_descuento > 0) {
                        setValorDescuento(pendingTx.monto_descuento);
                        setMotivoDescuento(pendingTx.motivo_descuento || "Descuento");
                        setTipoDescuento('MONTO');
                        setShowDiscountSection(true);
                      } else {
                        setValorDescuento(0);
                        setMotivoDescuento("");
                        setShowDiscountSection(false);
                      }
                      toast.info(`Cargada ${tableName} con Bs. ${pendingTx.monto_total.toFixed(2)}`);
                    } else {
                      setActivePendingTxId(null);
                    }
                  }}
                  className={`px-4 py-3 rounded-2xl border text-xs font-bold transition-all flex flex-col items-center justify-between min-w-[100px] h-20 active:scale-95 shadow-sm cursor-pointer ${
                    pendingTx 
                      ? (isSelected 
                          ? 'bg-amber-600 text-white border-amber-700 scale-102 ring-2 ring-amber-500/25 font-extrabold' 
                          : 'bg-amber-50 border-amber-250 text-amber-900 hover:bg-amber-100 hover:border-amber-400')
                      : (isSelected 
                          ? 'bg-emerald-800 text-white border-emerald-900 scale-102 font-extrabold'
                          : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100')
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span>{tableName === 'Llevar' ? '🛍️' : '🪑'}</span>
                    <span>{tableName}</span>
                  </div>
                  <span className="text-[10px] font-mono mt-1.5 leading-none">
                    {pendingTx ? `Bs. ${pendingTx.monto_total.toFixed(2)}` : 'Libre'}
                  </span>
                </button>
              );
            })}

            {pendingTransactions
              .filter(t => !["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Llevar"].includes(t.mesa))
              .map((pendingTx) => {
                const isSelected = selectedMesa === pendingTx.mesa;
                return (
                  <button
                    key={pendingTx.id}
                    type="button"
                    onClick={() => {
                      setSelectedMesa(pendingTx.mesa);
                      setCart(pendingTx.items);
                      setActivePendingTxId(pendingTx.id);
                      setTipoPedido(pendingTx.tipo_pedido || 'SITIO');
                      if (pendingTx.monto_descuento > 0) {
                        setValorDescuento(pendingTx.monto_descuento);
                        setMotivoDescuento(pendingTx.motivo_descuento || "Descuento");
                        setTipoDescuento('MONTO');
                        setShowDiscountSection(true);
                      } else {
                        setValorDescuento(0);
                        setMotivoDescuento("");
                        setShowDiscountSection(false);
                      }
                      toast.info(`Cargada Cuenta ${pendingTx.mesa} con Bs. ${pendingTx.monto_total.toFixed(2)}`);
                    }}
                    className={`px-4 py-3 rounded-2xl border text-xs font-bold transition-all flex flex-col items-center justify-between min-w-[100px] h-20 active:scale-95 shadow-sm cursor-pointer ${
                      isSelected 
                        ? 'bg-amber-600 text-white border-amber-700 scale-102 ring-2 ring-amber-500/25 font-extrabold' 
                        : 'bg-amber-50 border-amber-250 text-amber-900 hover:bg-amber-100 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-center gap-1 w-full justify-center">
                      <span>👤</span>
                      <span className="truncate max-w-[70px]">{pendingTx.mesa}</span>
                    </div>
                    <span className="text-[10px] font-mono mt-1.5 leading-none">
                      Bs. {pendingTx.monto_total.toFixed(2)}
                    </span>
                  </button>
                );
              })}

            <button
              type="button"
              onClick={() => {
                const name = window.prompt("Ingrese el nombre de la mesa o cliente:");
                if (name && name.trim()) {
                  const cleanName = name.trim();
                  setSelectedMesa(cleanName);
                  setActivePendingTxId(null);
                  toast.success(`Cuenta temporal '${cleanName}' activa. Agrega productos.`);
                }
              }}
              className="px-4 py-3 rounded-2xl border border-dashed border-stone-300 text-stone-500 hover:border-stone-400 hover:bg-stone-100/50 text-xs font-bold transition-all flex flex-col items-center justify-center min-w-[100px] h-20 active:scale-95 cursor-pointer"
            >
              <span>➕</span>
              <span className="text-[9px] mt-1 font-mono leading-none">Personalizada</span>
            </button>
          </div>
        </div>

        {/* Catálogo Grid de Productos */}
        <div className="flex-1 overflow-y-auto p-4 bg-stone-50/50 scrollbar-thin">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 mt-20 gap-3">
              <RefreshCw className="w-10 h-10 animate-spin text-emerald-700" />
              <p className="font-mono text-sm">Cargando catálogo de productos...</p>
            </div>
          ) : filteredProductos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 mt-20 gap-3">
              <Layers className="w-12 h-12 opacity-30" />
              <p className="font-bold text-sm">No se encontraron productos en esta categoría.</p>
              <button 
                onClick={() => { setActiveCategory("Todos"); setSearchTerm(""); }} 
                className="text-xs text-emerald-700 hover:underline font-bold"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-24">
              {filteredProductos.map(producto => {
                const theme = getProductTheme(producto);
                return (
                  <div
                    key={producto.id} 
                    onClick={() => addToCart(producto)}
                    className={`group cursor-pointer bg-white border ${theme.bgLight} rounded-2xl shadow-sm p-3.5 flex flex-col justify-between h-40 transition-all duration-300 hover:shadow-md hover:scale-103 hover:-translate-y-0.5 active:scale-95 select-none relative`}
                  >
                    {/* Tarjeta superior con gradiente sutil de categoría */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 font-mono leading-none mb-1">
                          {theme.desc}
                        </span>
                        <span className="font-bold text-xs leading-snug text-stone-850 group-hover:text-emerald-800 transition-colors line-clamp-3">
                          {producto.nombre}
                        </span>
                      </div>
                      
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-base shadow-sm group-hover:rotate-12 transition-transform duration-300`}>
                        {theme.emoji}
                      </div>
                    </div>

                    {/* Botones de Administración en hover */}
                    {currentUser?.role === 'admin' && (
                      <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditProduct(producto);
                          }}
                          className="w-7 h-7 bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-150 hover:border-emerald-700 rounded-lg shadow-sm flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                          title="Modificar producto"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProduct(producto.id, producto.nombre);
                          }}
                          className="w-7 h-7 bg-red-50 hover:bg-red-650 text-red-650 hover:text-white border border-red-150 hover:border-red-600 rounded-lg shadow-sm flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                          title="Eliminar producto"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}

                    {/* Fila inferior con el precio oficial */}
                    <div className="flex items-center justify-between border-t border-dashed border-stone-150 pt-2.5 mt-2">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold text-stone-400 uppercase font-mono">Precio</span>
                        <span className="text-emerald-800 font-black text-sm leading-none font-mono mt-0.5">
                          Bs. {producto.precio_venta.toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-800 group-hover:bg-emerald-700 group-hover:text-white flex items-center justify-center transition-all">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Panel Derecho: Ticket de Ventas */}
      <div className="w-full md:w-96 bg-white flex flex-col h-[50vh] md:h-full shadow-2xl z-10">
        
        {/* Ticket Header */}
        <div className="p-4 bg-stone-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-500" />
            <h2 className="font-black text-sm tracking-wide uppercase">Ticket de Venta</h2>
          </div>
          <span className="bg-stone-800 text-amber-400 px-3 py-1 rounded-full text-xs font-mono font-bold border border-stone-700">
            {cart.reduce((acc, curr) => acc + curr.cantidad, 0)} uds
          </span>
        </div>

        {/* Mesa Activa Info Bar */}
        <div className="bg-stone-100 border-b border-stone-200 px-4 py-2 flex justify-between items-center text-xs font-bold text-stone-700">
          <span className="flex items-center gap-1.5">
            📍 Cuenta Activa: <strong className="text-emerald-800 font-extrabold uppercase">{selectedMesa}</strong>
          </span>
          {activePendingTxId && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-250 font-mono">
                Abierta (id #{activePendingTxId})
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente la cuenta de ${selectedMesa}? Se perderán todos los consumos.`)) {
                    setProcesando(true);
                    try {
                      await PosService.eliminarTransaccion(activePendingTxId);
                      toast.success("Cuenta eliminada con éxito.");
                      setCart([]);
                      setActivePendingTxId(null);
                      setSelectedMesa("Mesa 1");
                      await fetchPendingTransactions();
                    } catch (e: any) {
                      toast.error("Error al eliminar la cuenta: " + e.message);
                    } finally {
                      setProcesando(false);
                    }
                  }
                }}
                className="text-[9px] bg-red-100 hover:bg-red-200 text-red-700 px-1.5 py-0.5 rounded border border-red-200 font-bold active:scale-95 cursor-pointer"
              >
                Eliminar 🗑️
              </button>
            </div>
          )}
        </div>

        {/* Lista de Compra */}
        <div className="flex-1 overflow-y-auto p-4 bg-stone-50/40 scrollbar-thin">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 mt-20 gap-4">
              <div className="p-5 bg-stone-100 rounded-full border border-stone-200">
                <Receipt className="w-12 h-12 opacity-30 text-stone-500" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">El ticket está vacío</p>
              <p className="text-[10px] text-stone-400 text-center max-w-[200px]">Haz clic en los productos para agregarlos aquí.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => {
                const theme = getProductTheme(item);
                return (
                  <div key={item.id} className="flex flex-col gap-2.5 p-3.5 bg-white border border-stone-200/80 rounded-2xl shadow-sm hover:border-stone-300 transition-all">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-start gap-2">
                        <span className="text-base select-none mt-0.5">{theme.emoji}</span>
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-stone-800 leading-snug">{item.nombre}</span>
                          {item.isCustom ? (
                            <span className="text-[8px] bg-amber-50 text-amber-700 font-extrabold px-1.5 py-0.5 rounded border border-amber-250 mt-1 uppercase w-max font-mono">Personalizado</span>
                          ) : (
                            <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">{item.categoria || 'Menú'}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end">
                        <span className="font-black text-xs font-mono text-stone-900">Bs. {(item.precio_venta * item.cantidad).toFixed(2)}</span>
                        <span className="text-[9px] font-bold text-stone-400 font-mono mt-0.5">({item.precio_venta.toFixed(2)} c/u)</span>
                      </div>
                    </div>

                    {/* Modificadores de Cantidad */}
                    <div className="flex items-center justify-between border-t border-stone-100 pt-2.5 mt-1.5">
                      <div className="flex items-center border border-stone-200 bg-stone-50 rounded-xl overflow-hidden shadow-inner">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className="h-7 w-8 hover:bg-stone-200 active:scale-90 text-stone-600 flex items-center justify-center font-bold transition-all"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-xs font-black text-stone-800 font-mono bg-white h-7 flex items-center justify-center border-x">{item.cantidad}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="h-7 w-8 hover:bg-stone-200 active:scale-90 text-stone-600 flex items-center justify-center font-bold transition-all"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="h-8 w-8 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl flex items-center justify-center transition-all active:scale-90 border border-transparent hover:border-red-100"
                        title="Quitar del ticket"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sección de Ajustes Contables: Tipo de Pedido y Descuentos */}
        {cart.length > 0 && (
          <div className="p-4 bg-stone-50 border-t border-stone-200 space-y-3.5">
            
            {/* 1. Selector de Tipo de Pedido */}
            <div>
              <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5 font-mono">Tipo de Pedido</span>
              <div className="flex bg-stone-200 p-0.5 rounded-lg gap-0.5 border border-stone-250 shadow-inner">
                <button
                  type="button"
                  onClick={() => setTipoPedido('SITIO')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-bold transition-all active:scale-95 ${
                    tipoPedido === 'SITIO' 
                      ? 'bg-white text-emerald-800 shadow-sm' 
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Utensils size={13} />
                  <span>En Sitio (Taza)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoPedido('LLEVAR')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-bold transition-all active:scale-95 ${
                    tipoPedido === 'LLEVAR' 
                      ? 'bg-emerald-800 text-white shadow-sm font-extrabold' 
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <ShoppingBag size={13} />
                  <span>Para Llevar</span>
                </button>
              </div>
              {tipoPedido === 'LLEVAR' && (
                <p className="text-[9px] text-emerald-700 font-bold font-sans mt-1">
                  📦 ¡Modo Para Llevar activo! Se descontarán automáticamente vasos/bolsas del inventario de empaques.
                </p>
              )}
            </div>

            {/* 2. Sección de Descuento Manual Dinámico */}
            <div className="border-t border-dashed border-stone-250 pt-2.5">
              <button
                type="button"
                onClick={() => setShowDiscountSection(prev => !prev)}
                className="flex items-center justify-between w-full text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors py-0.5"
              >
                <span className="flex items-center gap-1">🏷️ ¿Aplicar descuento manual?</span>
                <span className="text-[10px] font-bold text-emerald-700">{showDiscountSection ? 'Ocultar ▲' : 'Aplicar ▼'}</span>
              </button>

              {showDiscountSection && (
                <div className="mt-2.5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Fila de controles de Descuento */}
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input 
                        type="number"
                        step="any"
                        placeholder="0.00"
                        min="0"
                        value={valorDescuento || ""}
                        onChange={(e) => setValorDescuento(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 py-1.5 border border-stone-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 font-mono font-bold bg-white"
                      />
                      <span className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-[10px] text-stone-400 font-bold">
                        {tipoDescuento === 'MONTO' ? 'Bs' : '%'}
                      </span>
                    </div>

                    <div className="flex bg-stone-200 p-0.5 rounded-lg gap-0.5 border">
                      <button
                        type="button"
                        onClick={() => setTipoDescuento('MONTO')}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                          tipoDescuento === 'MONTO' ? 'bg-white text-amber-700 shadow-sm' : 'text-stone-500'
                        }`}
                      >
                        Bs
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoDescuento('PORCENTAJE')}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                          tipoDescuento === 'PORCENTAJE' ? 'bg-white text-amber-700 shadow-sm' : 'text-stone-500'
                        }`}
                      >
                        %
                      </button>
                    </div>
                  </div>

                  {/* Justificación obligatoria si descuento > 0 */}
                  {valorDescuento > 0 && (
                    <div className="space-y-1 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-1">
                          <AlertCircle size={10} /> Justificación Obligatoria *
                        </label>
                        <span className="text-[8px] text-stone-400">(Taza de cliente, falta gramaje, etc.)</span>
                      </div>
                      <input 
                        type="text"
                        placeholder="Escribe el motivo del descuento aquí..."
                        required
                        value={motivoDescuento}
                        onChange={(e) => setMotivoDescuento(e.target.value)}
                        className={`w-full p-2 border rounded-lg text-xs outline-none font-medium focus:ring-2 bg-white ${
                          !motivoDescuento.trim() 
                            ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500 shadow-sm shadow-red-50' 
                            : 'border-stone-200 focus:ring-amber-500/20 focus:border-amber-600'
                        }`}
                      />
                      {!motivoDescuento.trim() && (
                        <p className="text-[8.5px] text-red-500 font-bold leading-none mt-0.5">⚠️ No se puede cobrar hasta rellenar la justificación.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Sección de Resumen y Cobro */}
        <div className="p-4 bg-white border-t border-stone-200 space-y-4">
          {/* Subtotal, Descuento y Total Desglosados */}
          {valorDescuento > 0 && (
            <div className="space-y-1.5 border-b border-dashed pb-2.5 text-xs font-semibold text-stone-600">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono">Bs. {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>Descuento aplicado ({tipoDescuento === 'PORCENTAJE' ? `${valorDescuento}%` : 'Monto'}):</span>
                <span className="font-mono">- Bs. {montoDescuentoCalculado.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-baseline">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest font-mono">Total a pagar:</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-extrabold text-emerald-800">Bs.</span>
              <span className="text-4xl font-black text-emerald-800 font-mono tracking-tight">{total.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            {selectedMesa && selectedMesa !== "Llevar" && (
              <Button
                type="button"
                onClick={handleGuardarCuentaAbierta}
                disabled={cart.length === 0 || procesando}
                className="flex-1 h-14 bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-1.5 active:scale-99"
              >
                💾 GUARDAR CUENTA
              </Button>
            )}
            <Button 
              className={`h-14 text-base font-extrabold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 tracking-wider ${
                isDescuentoInvalido 
                  ? 'bg-stone-300 text-stone-500 border border-stone-200 cursor-not-allowed shadow-none' 
                  : 'bg-emerald-700 hover:bg-emerald-600 text-white hover:shadow-emerald-700/10 active:scale-99'
              } ${selectedMesa && selectedMesa !== "Llevar" ? 'w-1/2' : 'w-full'}`} 
              disabled={cart.length === 0 || procesando || isDescuentoInvalido}
              onClick={openCheckout}
            >
              <ShoppingCart size={18} />
              {procesando ? "..." : "COBRAR"}
            </Button>
          </div>
        </div>
      </div>

      {/* MODAL: ITEM PERSONALIZADO AL VUELO */}
      {showCustomForm && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={addCustomToCart} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-amber-600 text-white p-4 flex justify-between items-center border-b">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <h3 className="font-bold text-sm uppercase tracking-wider">Añadir Item Personalizado</h3>
              </div>
              <button type="button" onClick={() => setShowCustomForm(false)} className="p-1 rounded-lg hover:bg-amber-700 text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs font-medium text-stone-850">
              <div>
                <label className="block text-stone-500 font-bold mb-1 uppercase tracking-wider">Nombre del Item</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Desayuno Especial, Extra Barra, etc."
                  value={customItem.nombre}
                  onChange={(e) => setCustomItem(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-500 font-bold mb-1 uppercase tracking-wider">Precio de Venta (Bs)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={customItem.precio_venta}
                    onChange={(e) => setCustomItem(prev => ({ ...prev, precio_venta: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-stone-500 font-bold mb-1 uppercase tracking-wider">Categoría</label>
                  <select 
                    value={customItem.categoria}
                    onChange={(e) => setCustomItem(prev => ({ ...prev, categoria: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 bg-stone-50 font-bold"
                  >
                    <option value="Repostería / Pastelería">Repostería</option>
                    <option value="Cafetería Caliente">Cafetería Caliente</option>
                    <option value="Cafetería Fría">Cafetería Fría</option>
                    <option value="Bebidas / Sodas">Bebidas</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 bg-stone-50 border-t">
              <button 
                type="button" 
                onClick={() => setShowCustomForm(false)} 
                className="px-4 py-2 border rounded-lg font-bold text-stone-600 hover:bg-stone-100 transition-colors text-xs"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-colors text-xs flex items-center gap-1.5 shadow"
              >
                <Plus size={14} /> Añadir al ticket
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE COBRO AUTOMÁTICO */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-stone-150 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-stone-900 text-white p-5 flex justify-between items-center border-b shadow-sm">
              <div>
                <h3 className="text-base font-black tracking-wider uppercase flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-400" />
                  Detalle del Cobro
                </h3>
                <p className="text-[10px] text-stone-400 font-mono mt-0.5">VENTA AUTOMATIZADA CONTABLE</p>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-bold tracking-wider text-stone-400 block font-mono">Total Oficial</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">Bs. {total.toFixed(2)}</span>
              </div>
            </div>

            {/* Modal Body */}
            <ScrollArea className="flex-1 p-6 space-y-5 text-xs text-stone-850 font-medium overflow-y-auto">
              
              {/* Responsable & Mesa */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 mb-1.5 uppercase tracking-wider">Responsable del Turno</label>
                  <select 
                    value={checkoutData.responsable} 
                    onChange={(e) => handleCheckoutDataChange('responsable', e.target.value)}
                    className="w-full border border-stone-200 rounded-xl p-3 bg-stone-50 font-bold cursor-pointer"
                  >
                    <option value="Turno Mañana">Turno Mañana</option>
                    <option value="Turno Tarde">Turno Tarde</option>
                    <option value="Turno Noche">Turno Noche</option>
                    <option value="Marco Luis">Marco Luis</option>
                    <option value="Otro">Otro Responsable...</option>
                  </select>
                  {checkoutData.responsable === 'Otro' && (
                    <input 
                      type="text" 
                      placeholder="Nombre del responsable"
                      value={checkoutData.customResponsable}
                      onChange={(e) => handleCheckoutDataChange('customResponsable', e.target.value)}
                      className="w-full border rounded-xl p-2.5 mt-2 font-sans"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-500 mb-1.5 uppercase tracking-wider">Mesa / Ubicación</label>
                  <select 
                    value={checkoutData.mesa} 
                    disabled={tipoPedido === 'LLEVAR'}
                    onChange={(e) => handleCheckoutDataChange('mesa', e.target.value)}
                    className="w-full border border-stone-200 rounded-xl p-3 bg-stone-50 font-bold cursor-pointer disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed"
                  >
                    <option value="Llevar">Para Llevar (Takeaway)</option>
                    <option value="Mesa 1">Mesa 1</option>
                    <option value="Mesa 2">Mesa 2</option>
                    <option value="Mesa 3">Mesa 3</option>
                    <option value="Mesa 4">Mesa 4</option>
                    <option value="Mesa 5">Mesa 5</option>
                    <option value="Mesa 6">Mesa 6</option>
                    <option value="Otro">Otra Mesa...</option>
                  </select>
                  {checkoutData.mesa === 'Otro' && tipoPedido !== 'LLEVAR' && (
                    <input 
                      type="text" 
                      placeholder="Número o nombre de mesa"
                      value={checkoutData.customMesa}
                      onChange={(e) => handleCheckoutDataChange('customMesa', e.target.value)}
                      className="w-full border rounded-xl p-2.5 mt-2 font-sans"
                    />
                  )}
                </div>
              </div>

              {/* Método de Pago & Facturación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 mb-1.5 uppercase tracking-wider">Método de Pago</label>
                  <div className="flex bg-stone-100 p-1 rounded-xl gap-1 border border-stone-200 shadow-inner">
                    {['EFECTIVO', 'QR', 'POS'].map((method) => {
                      const isActive = checkoutData.metodo_pago === method;
                      let activeStyle = '';
                      if (isActive) {
                        if (method === 'EFECTIVO') activeStyle = 'bg-emerald-800 text-white shadow-md';
                        else if (method === 'QR') activeStyle = 'bg-blue-700 text-white shadow-md';
                        else activeStyle = 'bg-purple-750 text-white shadow-md';
                      }
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => handleCheckoutDataChange('metodo_pago', method)}
                          className={`flex-1 text-center py-2.5 rounded-lg font-black text-[10px] tracking-wider transition-all active:scale-95 ${
                            isActive ? activeStyle : 'text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          {method}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-3 cursor-pointer select-none border border-stone-250 rounded-xl p-3 bg-white hover:bg-stone-50 transition-colors shadow-sm">
                    <input 
                      type="checkbox" 
                      checked={checkoutData.tiene_factura}
                      onChange={(e) => handleCheckoutDataChange('tiene_factura', e.target.checked)}
                      className="h-4.5 w-4.5 rounded border-stone-300 text-emerald-800 focus:ring-emerald-700 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="font-extrabold text-stone-700 text-xs">Generar Factura</span>
                      <span className="text-[9px] text-stone-400">Marcar SI para débito fiscal</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Cálculos de Pago en Efectivo con Billetes Bolivianos */}
              {checkoutData.metodo_pago === 'EFECTIVO' ? (
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-4 animate-in fade-in slide-in-from-top-3 duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Dinero Recibido (Billetes Bs.)</label>
                    <div className="flex flex-wrap gap-1.5">
                      <button 
                        type="button" 
                        onClick={() => handleCheckoutDataChange('pago', total)} 
                        className="text-[9px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black px-2.5 py-1.5 rounded-lg border border-emerald-200 transition-colors active:scale-95"
                      >
                        Dinero Justo
                      </button>
                      {[
                        { val: 10, style: 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200' },
                        { val: 20, style: 'bg-orange-50 hover:bg-orange-100 text-orange-900 border-orange-200' },
                        { val: 50, style: 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200' },
                        { val: 100, style: 'bg-red-50 hover:bg-red-100 text-red-800 border-red-200' },
                        { val: 200, style: 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-250' }
                      ].map(({ val, style }) => (
                        <button
                          key={val}
                          type="button"
                          disabled={val < total}
                          onClick={() => handleCheckoutDataChange('pago', val)}
                          className={`text-[9px] px-2.5 py-1.5 rounded-lg font-black border transition-colors active:scale-95 ${
                            val < total 
                              ? 'bg-stone-100 text-stone-300 border-stone-200 cursor-not-allowed' 
                              : style
                          }`}
                        >
                          Bs. {val}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00"
                        value={checkoutData.pago || ''}
                        onChange={(e) => handleCheckoutDataChange('pago', Number(e.target.value))}
                        className="w-full border border-stone-300 rounded-xl p-3 text-xl font-black text-stone-900 bg-white font-mono shadow-inner outline-none focus:ring-2 focus:ring-emerald-700/20"
                        autoFocus
                      />
                    </div>
                    <div className="flex flex-col justify-center items-end bg-amber-50/50 border border-amber-100 rounded-xl px-4 py-2">
                      <span className="text-[9px] text-amber-700 font-extrabold tracking-widest uppercase">Cambio a Devolver</span>
                      <span className="text-2xl font-black text-amber-700 font-mono">
                        Bs. {checkoutData.cambio.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-stone-50 border border-stone-150 rounded-2xl p-4 text-center text-stone-500 font-mono text-[10px] leading-relaxed shadow-inner">
                  📱 Cobro electrónico seleccionado. Los fondos se registrarán automáticamente en la cuenta de <strong className="text-stone-700">{checkoutData.metodo_pago === 'QR' ? 'BANCO BISA' : 'LINKSER / POS'}</strong> por la cantidad exacta de <strong className="text-emerald-800">Bs. {total.toFixed(2)}</strong>.
                </div>
              )}

              {/* Observación de la Venta */}
              <div>
                <label className="block text-[10px] font-bold text-stone-500 mb-1.5 uppercase tracking-wider">Notas u Observación de la Venta</label>
                <input 
                  type="text" 
                  placeholder="Ej: Cliente habitual, pago QR Bisa, sin hielo..."
                  value={checkoutData.observacion}
                  onChange={(e) => handleCheckoutDataChange('observacion', e.target.value)}
                  className="w-full border border-stone-200 rounded-xl p-3 font-medium outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-600 bg-stone-50"
                />
              </div>

            </ScrollArea>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-4 bg-stone-50 border-t shadow-inner">
              <button 
                type="button" 
                onClick={() => setShowCheckoutModal(false)} 
                className="px-5 py-2.5 border rounded-xl font-bold text-stone-600 hover:bg-stone-100 transition-colors"
                disabled={procesando}
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleCheckoutSubmit}
                className="px-7 py-2.5 bg-emerald-850 hover:bg-emerald-800 text-white rounded-xl font-black tracking-wider transition-colors flex items-center gap-2 shadow"
                disabled={procesando || (checkoutData.metodo_pago === 'EFECTIVO' && checkoutData.pago < total)}
              >
                {procesando ? 'Procesando Venta...' : 'CONFIRMAR Y REGISTRAR VENTA'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: RE-IMPRIMIR TICKETS DEL DÍA */}
      {showReprintModal && (
        <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-stone-150 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            {/* Modal Header */}
            <div className="bg-stone-900 text-white p-5 flex justify-between items-center border-b shadow-sm">
              <div>
                <h3 className="text-base font-black tracking-wider uppercase flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-500" />
                  Re-imprimir Comprobantes del Día
                </h3>
                <p className="text-[10px] text-stone-400 font-mono mt-0.5">HISTORIAL DE VENTAS DE HOY</p>
              </div>
              <button 
                onClick={() => setShowReprintModal(false)}
                className="p-1 rounded-lg hover:bg-stone-850 text-stone-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <ScrollArea className="flex-1 p-6 space-y-4">
              {loadingTickets ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-stone-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
                  <p className="text-xs font-mono">Buscando ventas del día...</p>
                </div>
              ) : todayTickets.length === 0 ? (
                <div className="text-center py-10 text-stone-400 italic text-xs">
                  No se registraron ventas en el día de hoy.
                </div>
              ) : (
                <div className="space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {todayTickets.map((tx) => (
                    <div 
                      key={tx.id} 
                      className="flex items-center justify-between p-3.5 bg-stone-50 border rounded-2xl hover:border-stone-300 hover:bg-stone-100/50 transition-all text-xs font-mono"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-black text-stone-900 font-mono">Venta #{tx.id}</span>
                          <span className="text-[9px] bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded font-bold font-mono">{tx.hora || '--:--'}</span>
                          <span className="text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-100 px-1.5 py-0.5 rounded font-bold font-mono">{tx.tipo_pedido || 'SITIO'}</span>
                        </div>
                        <div className="text-[10px] text-stone-500 truncate" title={tx.detalle}>
                          {tx.detalle || 'Venta general'}
                        </div>
                        <div className="text-[9px] text-stone-400 font-sans mt-0.5">
                          Mesa/Ubicación: <strong className="text-stone-600 font-semibold">{tx.mesa || 'Consumir en Sitio'}</strong> • Cajero: {tx.responsable || 'Caja'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[9px] text-stone-400 block uppercase font-sans">Total</span>
                          <strong className="text-emerald-800 text-sm font-mono font-black">Bs. {Number(tx.monto_total || 0).toFixed(2)}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => imprimirTicketHistorico(tx)}
                          className="p-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl shadow-md transition-all active:scale-90 flex items-center justify-center"
                          title="Imprimir"
                        >
                          <Receipt size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t flex justify-end">
              <button 
                type="button"
                onClick={() => setShowReprintModal(false)}
                className="px-5 py-2 border rounded-xl font-bold text-stone-600 hover:bg-stone-200 transition-colors text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR EGRESO CAJERO */}
      {showEgresoModal && (
        <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleEgresoSubmit} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-150 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-red-800 text-white p-5 flex justify-between items-center border-b shadow-sm">
              <div className="flex items-center gap-2">
                <DollarSign size={18} className="text-red-300" />
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider">Registrar Salida / Egreso</h3>
                  <p className="text-[9px] text-red-200 font-mono">EGRESO AUTOMATIZADO CONTABLE</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowEgresoModal(false)} className="p-1 rounded-lg hover:bg-red-900 text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs font-medium text-stone-850">
              <div>
                <label className="block text-stone-500 font-bold mb-1.5 uppercase tracking-wider">Concepto o Detalle *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Pago de garrafa de gas, compra pan, etc."
                  value={egresoData.detalle}
                  onChange={(e) => setEgresoData(prev => ({ ...prev, detalle: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 bg-stone-50 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-500 font-bold mb-1.5 uppercase tracking-wider">Monto (Bs.) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={egresoData.monto}
                    onChange={(e) => setEgresoData(prev => ({ ...prev, monto: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-stone-500 font-bold mb-1.5 uppercase tracking-wider">Categoría</label>
                  <select 
                    value={egresoData.categoria}
                    onChange={(e) => setEgresoData(prev => ({ ...prev, categoria: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 bg-stone-50 font-bold cursor-pointer"
                  >
                    <option value="Insumos alimenticios">Insumos alimenticios</option>
                    <option value="Costos secundarios">Costos secundarios</option>
                    <option value="Servicios básicos">Servicios básicos</option>
                    <option value="Otros">Otros / Administración</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between border border-stone-200 rounded-xl p-3 bg-stone-50 shadow-inner">
                <div className="flex flex-col">
                  <span className="font-extrabold text-stone-700 text-xs">¿Tiene Factura?</span>
                  <span className="text-[9px] text-stone-400">Marcar si se cuenta con factura oficial</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={egresoData.tiene_factura}
                  onChange={(e) => setEgresoData(prev => ({ ...prev, tiene_factura: e.target.checked }))}
                  className="h-5 w-5 rounded border-stone-300 text-red-700 focus:ring-red-600 cursor-pointer"
                />
              </div>

              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-800 text-[10px] leading-relaxed font-sans">
                ⚠️ <strong>Nota:</strong> Los fondos se descontarán inmediatamente del dinero en caja del turno en curso (Caja Chica). Se generará automáticamente un asiento de partida doble en el Libro Diario.
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 bg-stone-50 border-t shadow-inner">
              <button 
                type="button" 
                onClick={() => setShowEgresoModal(false)} 
                className="px-4 py-2 border rounded-xl font-bold text-stone-600 hover:bg-stone-100 transition-colors text-xs"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-red-700 text-white rounded-xl font-bold hover:bg-red-800 transition-colors text-xs flex items-center gap-1.5 shadow"
              >
                Registrar Egreso
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CIERRE DE TURNO / CAJA */}
      {showCloseShiftModal && activeShift && (
        <div className="fixed inset-0 bg-stone-955/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-150 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-amber-700 text-white p-5 flex justify-between items-center border-b shadow-sm">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-200 animate-bounce" />
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider">Cerrar Turno y Arqueo</h3>
                  <p className="text-[9px] text-amber-100 font-mono">RESUMEN FINAL DE CAJA</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowCloseShiftModal(false)} className="p-1 rounded-lg hover:bg-amber-800 text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs font-medium text-stone-850">
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-2.5 font-mono text-[11px] text-stone-700 shadow-inner">
                <div className="flex justify-between border-b pb-1 border-stone-200"><span className="text-stone-400">CAJERO:</span><span className="font-bold">{activeShift.cashier}</span></div>
                <div className="flex justify-between border-b pb-1 border-stone-200"><span className="text-stone-400">TURNO:</span><span className="font-bold text-amber-750">{activeShift.turno}</span></div>
                <div className="flex justify-between border-b pb-1 border-stone-200"><span className="text-stone-400">FECHA:</span><span>{activeShift.date}</span></div>
                
                <div className="h-2"></div>
                <div className="flex justify-between text-stone-600"><span className="font-sans">Saldo Inicial en Caja:</span><span className="font-bold">Bs. {activeShift.monto_inicial.toFixed(2)}</span></div>
                <div className="flex justify-between text-emerald-700"><span className="font-sans">(+) Ventas en Efectivo:</span><span className="font-bold">+Bs. {shiftSummary.sumEfectivo.toFixed(2)} <span className="text-[9px] text-stone-450 font-normal">({shiftSummary.countEfectivo} vtas)</span></span></div>
                <div className="flex justify-between text-red-700"><span className="font-sans">(-) Egresos en Efectivo:</span><span className="font-bold">-Bs. {activeShift.egresos_efectivo.toFixed(2)}</span></div>
                
                <div className="border-t border-dashed border-stone-400 my-1.5 pt-1.5 flex justify-between text-[11px] text-stone-900 font-bold">
                  <span>EFECTIVO ESPERADO EN CAJA:</span>
                  <span className="text-amber-800 font-mono">Bs. {(activeShift.monto_inicial + shiftSummary.sumEfectivo - activeShift.egresos_efectivo).toFixed(2)}</span>
                </div>

                <div className="border-t border-dashed border-stone-300 my-1.5 pt-1.5 space-y-1 text-stone-605">
                  <div className="font-sans font-bold text-[9px] text-stone-400 uppercase tracking-wider">Conciliación Bancaria / POS</div>
                  <div className="flex justify-between text-blue-700"><span>Ventas QR Bisa:</span><span className="font-bold">Bs. {shiftSummary.sumQr.toFixed(2)} <span className="text-[9px] text-stone-450 font-normal">({shiftSummary.countQr} vtas)</span></span></div>
                  <div className="flex justify-between text-purple-700"><span>Ventas Tarjeta POS:</span><span className="font-bold">Bs. {shiftSummary.sumPos.toFixed(2)} <span className="text-[9px] text-stone-450 font-normal">({shiftSummary.countPos} vtas)</span></span></div>
                </div>

                <div className="border-t border-dashed border-stone-450 my-2 pt-2 flex justify-between text-xs text-stone-900 font-black">
                  <span>TOTAL DE VENTAS TURNO:</span>
                  <span className="text-emerald-800 font-mono">Bs. {shiftSummary.totalVentas.toFixed(2)} <span className="text-[9px] text-stone-500 font-bold">({shiftSummary.totalCount} vtas)</span></span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-500 mb-1.5 uppercase tracking-wider">Efectivo Real Contado en Cajón (Bs.) *</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={efectivoRealContado}
                  onChange={(e) => setEfectivoRealContado(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-xl p-3 text-xl font-black text-stone-900 bg-white font-mono shadow-inner outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {efectivoRealContado !== '' && (
                <div className={`p-3 rounded-xl border text-[11px] font-mono flex justify-between items-center ${
                  (Number(efectivoRealContado) - (activeShift.monto_inicial + shiftSummary.sumEfectivo - activeShift.egresos_efectivo)) >= 0 
                    ? 'bg-emerald-50 border-emerald-150 text-emerald-800' 
                    : 'bg-red-50 border-red-150 text-red-800'
                }`}>
                  <span className="font-sans font-bold">Diferencia (Sobrante/Faltante):</span>
                  <span className="font-black text-sm">
                    Bs. {(Number(efectivoRealContado) - (activeShift.monto_inicial + shiftSummary.sumEfectivo - activeShift.egresos_efectivo)).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-4 bg-stone-50 border-t shadow-inner">
              <button 
                type="button" 
                onClick={() => setShowCloseShiftModal(false)} 
                className="px-4 py-2 border rounded-xl font-bold text-stone-600 hover:bg-stone-100 transition-colors text-xs"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleCloseShiftSubmit}
                className="px-6 py-2 bg-amber-700 text-white rounded-xl font-bold hover:bg-amber-800 transition-colors text-xs flex items-center gap-1.5 shadow"
              >
                Registrar y Cerrar Turno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Producto para agregar/editar */}
      <ModalProducto 
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false);
          setEditingProduct(null);
        }}
        onSaved={fetchProductos}
        editingProduct={editingProduct}
        existingCategories={categoriesList}
      />

    </div>
  );
}
