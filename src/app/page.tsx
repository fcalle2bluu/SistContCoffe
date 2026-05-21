"use client";

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/lib/supabase';
import ModalComprasVentas from '@/components/erp/ModalComprasVentas';
import ModalLibroDiario from '@/components/erp/ModalLibroDiario';
import ModalInventarioPeps from '@/components/erp/ModalInventarioPeps';
import ModalPeriodo from '@/components/erp/ModalPeriodo';
import { 
  TrendingUp, BookOpen, Layers, ShoppingCart, 
  Package, List, BarChart3, DollarSign, Plus, Download,
  CheckCircle2, XCircle, ArrowUpDown, Search
} from 'lucide-react';

export default function SistemaContableYanaloma() {
  const [activeTab, setActiveTab] = useState('estado_resultados');
  const [loading, setLoading] = useState(false);

  const [periodos, setPeriodos] = useState<any[]>([]);
  const [periodoActualId, setPeriodoActualId] = useState<number | null>(null);
  const [periodoActual, setPeriodoActual] = useState('CARGANDO...');
  const [showCVModal, setShowCVModal] = useState(false);
  const [showDiarioModal, setShowDiarioModal] = useState(false);
  const [showInvModal, setShowInvModal] = useState(false);
  const [showPeriodoModal, setShowPeriodoModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [transacciones, setTransacciones] = useState<any[]>([]);
  const [libroDiario, setLibroDiario] = useState<any[]>([]);
  const [planCuentas, setPlanCuentas] = useState<any[]>([]);
  const [sortAscending, setSortAscending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [invSortAscending, setInvSortAscending] = useState(false);
  const [invSearchTerm, setInvSearchTerm] = useState('');
  const [cuentaMayorActiva, setCuentaMayorActiva] = useState<string>('TODAS');
  
  // Fase 5 States
  const [productos, setProductos] = useState<any[]>([]);
  const [detallesTx, setDetallesTx] = useState<any[]>([]);
  const [movimientosInv, setMovimientosInv] = useState<any[]>([]);
  const [estadisticasRaw, setEstadisticasRaw] = useState<any[]>([]);
  const [costosData, setCostosData] = useState<any[]>([]);

  useEffect(() => {
    async function cargarDatosCore() {
      setLoading(true);
      
      const { data: perData } = await supabase.from('periodos_contables').select('*').order('fecha_inicio', { ascending: false });
      let currentPeriod = null;
      if (perData && perData.length > 0) {
        // De-duplicate by name
        const uniqueNames = new Set();
        const uniquePeriods = [];
        for (const p of perData) {
          if (!uniqueNames.has(p.nombre)) {
            uniqueNames.add(p.nombre);
            uniquePeriods.push(p);
          }
        }
        setPeriodos(uniquePeriods);
        const targetId = periodoActualId || uniquePeriods[0].id;
        if (!periodoActualId) setPeriodoActualId(targetId);
        currentPeriod = uniquePeriods.find(p => p.id === targetId) || uniquePeriods[0];
        setPeriodoActual(currentPeriod.nombre);
      }
      
      // 1. Fetching transacciones paginated (to bypass Supabase 1000 limit)
      let allTxData: any[] = [];
      let pageTx = 0;
      const pageSize = 1000;
      let keepFetchingTx = true;

      while (keepFetchingTx) {
        const start = pageTx * pageSize;
        const end = start + pageSize - 1;
        
        let pagedQuery = supabase.from('transacciones')
          .select('*')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .range(start, end);

        if (currentPeriod) {
          pagedQuery = pagedQuery.gte('fecha', currentPeriod.fecha_inicio).lte('fecha', currentPeriod.fecha_fin);
        }

        const { data: pageData, error } = await pagedQuery;
        if (error) {
          console.error("Error fetching page of transacciones:", error);
          break;
        }

        if (pageData && pageData.length > 0) {
          allTxData = allTxData.concat(pageData);
          if (pageData.length < pageSize) {
            keepFetchingTx = false;
          } else {
            pageTx++;
          }
        } else {
          keepFetchingTx = false;
        }
      }
      setTransacciones(allTxData);

      // 2. Fetching libro_diario paginated (to bypass Supabase 1000 limit)
      let allDiarioData: any[] = [];
      let pageDiario = 0;
      let keepFetchingDiario = true;

      while (keepFetchingDiario) {
        const start = pageDiario * pageSize;
        const end = start + pageSize - 1;
        
        let pagedQuery = supabase.from('libro_diario')
          .select('*')
          .order('fecha', { ascending: true })
          .order('nro_asiento', { ascending: true })
          .order('id', { ascending: true })
          .range(start, end);

        if (currentPeriod) {
          pagedQuery = pagedQuery.gte('fecha', currentPeriod.fecha_inicio).lte('fecha', currentPeriod.fecha_fin);
        }

        const { data: pageData, error } = await pagedQuery;
        if (error) {
          console.error("Error fetching page of libro_diario:", error);
          break;
        }

        if (pageData && pageData.length > 0) {
          allDiarioData = allDiarioData.concat(pageData);
          if (pageData.length < pageSize) {
            keepFetchingDiario = false;
          } else {
            pageDiario++;
          }
        } else {
          keepFetchingDiario = false;
        }
      }

      // Sort with complete data set
      const sortedDiario = [...allDiarioData].sort((a, b) => {
        const dateAStr = a.fecha ? new Date(a.fecha).toISOString().split('T')[0] : (a.created_at ? new Date(a.created_at).toISOString().split('T')[0] : '');
        const dateBStr = b.fecha ? new Date(b.fecha).toISOString().split('T')[0] : (b.created_at ? new Date(b.created_at).toISOString().split('T')[0] : '');
        if (dateAStr !== dateBStr) return dateAStr.localeCompare(dateBStr);

        const seatA = Number(a.nro_asiento || 0);
        const seatB = Number(b.nro_asiento || 0);
        if (seatA !== seatB) return seatA - seatB;

        return (a.id || 0) - (b.id || 0);
      });
      setLibroDiario(sortedDiario);

      // 3. Define queryInv for inventario
      let queryInv = supabase.from('movimientos_inventario').select('*').order('fecha', { ascending: true });
      if (currentPeriod) {
        queryInv = queryInv.gte('fecha', currentPeriod.fecha_inicio).lte('fecha', currentPeriod.fecha_fin);
      }

      const { data: cuentasData } = await supabase.from('cuentas_contables').select('*').order('codigo', { ascending: true });
      if (cuentasData) setPlanCuentas(cuentasData);

      const { data: prodData } = await supabase.from('productos').select('*');
      if (prodData) setProductos(prodData);

      const { data: detData } = await supabase.from('transaccion_detalles').select('*, transacciones(fecha, tipo_movimiento)');
      if (detData) setDetallesTx(detData);

      const { data: movData } = await queryInv;
      if (movData) setMovimientosInv(movData);

      const { data: estData } = await supabase.from('estadisticas_historicas').select('*');
      if (estData) setEstadisticasRaw(estData);

      const { data: costData } = await supabase.from('costos_recetas').select('*').order('id', { ascending: true });
      if (costData) setCostosData(costData);

      setLoading(false);
    }
    cargarDatosCore();
  }, [activeTab, periodoActualId, reloadKey]);

  const handleSaved = () => {
    setReloadKey(prev => prev + 1);
  };

  const handlePeriodoSaved = (newId: number) => {
    setPeriodoActualId(newId);
    setReloadKey(prev => prev + 1);
  };

  const formatNumber = (num: any) => Number(num || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    // Fix timezone issues for dates by parsing it correctly
    const d = new Date(dateString);
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // --- CÁLCULOS FASE 4 (MAYOR Y DIARIO) ---
  const diarioAgrupado = useMemo(() => {
    const grupos: Record<string, any> = {};
    libroDiario.forEach(mov => {
      const key = `${mov.nro_asiento}-${mov.fecha || mov.created_at}`;
      if (!grupos[key]) {
        grupos[key] = {
          nro_asiento: mov.nro_asiento,
          fecha: mov.fecha || mov.created_at,
          glosa: mov.glosa,
          movimientos: [],
          totalDebe: 0,
          totalHaber: 0
        };
      }
      grupos[key].movimientos.push(mov);
      grupos[key].totalDebe += Number(mov.debe || 0);
      grupos[key].totalHaber += Number(mov.haber || 0);
      if (!grupos[key].glosa && mov.glosa) grupos[key].glosa = mov.glosa;
    });
    return Object.values(grupos);
  }, [libroDiario]);

  const mayorPorCuenta = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    libroDiario.forEach(mov => {
      const code = mov.codigo_cuenta;
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(mov);
    });

    const result: any[] = [];
    Object.keys(grouped).sort().forEach(code => {
      const cuentaDetalle = planCuentas.find(c => c.codigo === code);
      const tipo = cuentaDetalle?.tipo || 'ACTIVO';
      const naturalezaDeudora = ['ACTIVO', 'EGRESO'].includes(tipo.toUpperCase());
      
      let saldoAcumulado = 0;
      const movimientos = grouped[code].map(mov => {
        const debe = Number(mov.debe || 0);
        const haber = Number(mov.haber || 0);
        if (naturalezaDeudora) saldoAcumulado = saldoAcumulado + debe - haber;
        else saldoAcumulado = saldoAcumulado + haber - debe;
        return { ...mov, saldoAcumulado };
      });

      result.push({
        codigo: code,
        nombre: cuentaDetalle?.nombre || 'CUENTA DESCONOCIDA',
        movimientos
      });
    });

    return result;
  }, [libroDiario, planCuentas]);

  // --- CÁLCULOS FASE 5 ---
  const plData = useMemo(() => {
    // ESTADO DE RESULTADOS BASADO EN EL LIBRO MAYOR (Doble Partida)
    
    // Función auxiliar para sumar saldos del libro diario
    const getSumaMayor = (codigos: string[], tipo: 'DEBE' | 'HABER') => {
      let suma = 0;
      libroDiario.forEach(mov => {
        if (codigos.includes(mov.codigo_cuenta)) {
          suma += Number(mov[tipo.toLowerCase()] || 0);
        }
      });
      return suma;
    };

    // 1. Ingresos (Suma del HABER)
    const vVentas = getSumaMayor(['5010101'], 'HABER');
    const vServicios = getSumaMayor(['1160101'], 'HABER');
    const totalIngresos = vVentas + vServicios;

    // 2. Costos (Suma del DEBE)
    const cInventario = getSumaMayor(['1160102'], 'DEBE'); // Tueste de Café
    const cInsumos = getSumaMayor(['11506', '11508'], 'DEBE'); // Insumos alimenticios
    const cManoObra = getSumaMayor(['2130103'], 'DEBE'); // Mano de obra
    const cSecundarios = getSumaMayor(['11402', '12705', '12706', '1130402', '11701'], 'DEBE'); // Limpieza, Básicos, Externos, Compras, Gas
    const totalCostos = cInventario + cInsumos + cManoObra + cSecundarios;

    // 3. Impuestos (Suma del DEBE/HABER)
    const iIT = getSumaMayor(['1160103'], 'DEBE'); // IT (Anticipo IT)
    const iIVA = getSumaMayor(['IVA'], 'HABER'); // IVA
    const totalImpuestos = iIT + iIVA;

    // Utilidad
    const utilidad = totalIngresos - totalCostos - totalImpuestos;

    // 4. Compatibilidad de Caja Diaria (Dashboard Compras y Ventas)
    const transaccionesIngreso = transacciones.filter(t => t.tipo_movimiento === 'INGRESO').reduce((acc, curr) => acc + Number(curr.monto_total || 0), 0);
    const transaccionesEgreso = transacciones.filter(t => t.tipo_movimiento === 'EGRESO').reduce((acc, curr) => acc + Number(curr.monto_total || 0), 0);

    // 5. Destacado (Extraídos de cuentas extraordinarias en el Libro Diario)
    const cuentasDestacadas = ['2130102', '40101', '12409'];
    const destacado = libroDiario
      .filter(mov => cuentasDestacadas.includes(mov.codigo_cuenta) && Number(mov.debe) > 0)
      .map(mov => ({
        id: mov.id,
        detalle: mov.glosa || 'Gasto Extraordinario',
        monto_total: Number(mov.debe)
      }));

    return { 
      vVentas, vServicios, totalIngresos, 
      cInventario, cInsumos, cManoObra, cSecundarios, totalCostos, 
      iIT, iIVA, totalImpuestos, 
      utilidad,
      destacado,
      ingresosVentas: transaccionesIngreso, 
      costosInventario: transaccionesEgreso
    };
  }, [libroDiario, transacciones]);

  const estadisticas = useMemo(() => {
    const matriz: any = {};
    estadisticasRaw.forEach(row => {
      const pNombre = row.producto;
      if (!matriz[pNombre]) {
        matriz[pNombre] = { nombre: pNombre, total: 0, days: Array(31).fill(0) };
      }
      const dayIndex = row.dia - 1;
      const qty = Number(row.cantidad || 0);
      if (dayIndex >= 0 && dayIndex < 31) {
        matriz[pNombre].days[dayIndex] += qty;
        matriz[pNombre].total += qty;
      }
    });
    return Object.values(matriz).sort((a: any, b: any) => b.total - a.total);
  }, [estadisticasRaw]);

  // The pepsData local calculation is removed because the DB natively handles exact inventory entries according to the new schema

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const applyStyles = (ws: any, colWidths: number[]) => {
      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "064E3B" } }, // Emerald 900
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };

      const cellStyle = {
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } }
        }
      };

      ws['!cols'] = colWidths.map(w => ({ wch: w }));

      for (let cell in ws) {
        if (cell[0] === '!') continue;
        const isHeader = cell.replace(/\D/g, '') === '1';
        ws[cell].s = isHeader ? headerStyle : cellStyle;
      }
    };

    // 1. ESTADO DE RESULTADOS
    const eerrData = [
      ["CONCEPTO", "PARCIAL (Bs)", "TOTAL (Bs)"],
      ["INGRESOS TOTALES", "", ""],
      ["Ventas", plData.vVentas, ""],
      ["Servicios", plData.vServicios, plData.totalIngresos],
      ["COSTOS TOTALES", "", ""],
      ["Inventario", plData.cInventario, ""],
      ["Insumos alimenticios", plData.cInsumos, ""],
      ["Mano de obra", plData.cManoObra, ""],
      ["Costos secundarios", plData.cSecundarios, plData.totalCostos],
      ["IMPUESTOS", "", ""],
      ["IT", plData.iIT, ""],
      ["IVA", plData.iIVA, plData.totalImpuestos],
      ["", "", ""],
      ["TOTAL (UTILIDAD NETA)", "", plData.utilidad],
      ["", "", ""],
      ["Destacado", "", ""]
    ];
    
    plData.destacado.forEach(d => {
      eerrData.push([d.detalle, Number(d.monto_total || 0), ""]);
    });
    const wsEerr = XLSX.utils.aoa_to_sheet(eerrData);
    applyStyles(wsEerr, [30, 15, 15]);
    XLSX.utils.book_append_sheet(wb, wsEerr, "ESTADO_RESULTADOS");

    // 2. LIBRO DIARIO
    const diarioData = [["FECHA", "N° ASIENTO", "DETALLE / CUENTA", "DEBE (Bs)", "HABER (Bs)"]];
    libroDiario.forEach(mov => {
      diarioData.push([
        formatDate(mov.fecha || mov.created_at),
        mov.nro_asiento || "-",
        `${mov.codigo_cuenta} ${mov.glosa ? `- ${mov.glosa}` : ""}`,
        mov.debe || 0,
        mov.haber || 0
      ]);
    });
    const wsDiario = XLSX.utils.aoa_to_sheet(diarioData);
    applyStyles(wsDiario, [15, 12, 45, 15, 15]);
    XLSX.utils.book_append_sheet(wb, wsDiario, "LIBRO_DIARIO");

    // 3. LIBRO MAYOR
    const mayorData = [["CUENTA", "FECHA", "REF", "DETALLE", "DEBE (Bs)", "HABER (Bs)", "SALDO ACUM. (Bs)"]];
    mayorPorCuenta.forEach(mayor => {
      mayorData.push([`${mayor.codigo} - ${mayor.nombre}`, "", "", "", "", "", ""]);
      mayor.movimientos.forEach((mov: any) => {
        mayorData.push([
          "",
          formatDate(mov.fecha || mov.created_at),
          mov.nro_asiento || "-",
          mov.glosa || "Asiento",
          mov.debe || 0,
          mov.haber || 0,
          mov.saldoAcumulado || 0
        ]);
      });
    });
    const wsMayor = XLSX.utils.aoa_to_sheet(mayorData);
    applyStyles(wsMayor, [35, 15, 10, 45, 15, 15, 20]);
    XLSX.utils.book_append_sheet(wb, wsMayor, "LIBRO_MAYOR");

    // 4. COMPRAS Y VENTAS
    const cvData = [
      ["N°", "FECHA", "DETALLE", "INGRESO", "EGRESO", "CAJA", "C.CHICA", "BANCO", "POS", "METODO PAGO", "FACTURA", "V.S/F. C CH", "V. BANCO", "COSTO C. CH", "COSTO BANCO"]
    ];
    transacciones.forEach(tx => {
      const val = Number(tx.monto_total || 0);
      cvData.push([
        tx.id,
        formatDate(tx.fecha || tx.created_at),
        tx.detalle || "-",
        tx.tipo_movimiento === 'INGRESO' ? val : 0,
        tx.tipo_movimiento === 'EGRESO' ? val : 0,
        Number(tx.caja || 0),
        Number(tx.c_chica || 0),
        Number(tx.banco || 0),
        Number(tx.pos || 0),
        tx.metodo_pago || "-",
        tx.tiene_factura ? "SI" : "NO",
        Number(tx.v_sf_cchica || 0),
        Number(tx.v_sf_banco || 0),
        Number(tx.costo_cchica || 0),
        Number(tx.costo_banco || 0)
      ]);
    });
    const wsCV = XLSX.utils.aoa_to_sheet(cvData);
    applyStyles(wsCV, [5, 15, 35, 12, 12, 12, 12, 12, 12, 15, 10, 15, 15, 15, 15]);
    XLSX.utils.book_append_sheet(wb, wsCV, "COMPRAS_Y_VENTAS");

    // 5. INVENTARIO PEPS
    const invData = [
      ["N°", "FECHA", "DETALLE", "ENTRADAS", "SALIDAS", "SALDO UNIDADES", "C/U", "DEBE", "HABER", "SALDO VALOR", "TIPO CAFE", "TIPO TUESTE", "CLIMA", "MERMA %", "MERMA KG", "TUESTE FINAL"]
    ];
    movimientosInv.forEach(mov => {
      invData.push([
        mov.id,
        formatDate(mov.fecha || mov.created_at),
        mov.detalle || "-",
        Number(mov.entradas || 0),
        Number(mov.salidas || 0),
        Number(mov.saldo_unidades || 0),
        Number(mov.costo_unitario || 0),
        Number(mov.debe || 0),
        Number(mov.haber || 0),
        Number(mov.saldo_valor || 0),
        mov.tipo_cafe || "-",
        mov.tipo_tueste || "-",
        mov.clima || "-",
        Number(mov.merma_porcentaje || 0),
        Number(mov.merma_tueste || 0),
        Number(mov.tueste_final || 0)
      ]);
    });
    const wsInv = XLSX.utils.aoa_to_sheet(invData);
    applyStyles(wsInv, [5, 15, 30, 12, 12, 18, 12, 12, 12, 15, 15, 15, 12, 12, 12, 15]);
    XLSX.utils.book_append_sheet(wb, wsInv, "INVENTARIO_PEPS");

    // 6. ESTADISTICAS
    const estData = [
      ["Nº", "DESCRIPCION", "TOTAL MES", ...Array.from({length: 31}, (_, i) => i + 1)]
    ];
    estadisticas.forEach((est: any, idx: number) => {
      estData.push([
        idx + 1,
        est.nombre,
        est.total,
        ...est.days
      ]);
    });
    const wsEst = XLSX.utils.aoa_to_sheet(estData);
    applyStyles(wsEst, [5, 30, 12, ...Array(31).fill(5)]);
    XLSX.utils.book_append_sheet(wb, wsEst, "ESTADISTICAS");

    // 7. COSTOS
    const costData = [
      ["PRODUCTO", "CAFE", "AGUA", "LECHE", "ENDULZANTE", "INSUMOS", "M.OBRA", "COSTO TOTAL", "PRECIO VENTA", "IMPUESTOS", "GANANCIA NETA"]
    ];
    costosData.forEach((c: any) => {
      costData.push([
        c.producto,
        Number(c.costo_cafe || 0),
        Number(c.costo_agua || 0),
        Number(c.costo_leche || 0),
        Number(c.costo_endulzante || 0),
        Number(c.costo_insumos || 0),
        Number(c.mano_obra || 0),
        Number(c.costo_total || 0),
        Number(c.precio_venta || 0),
        Number(c.impuestos || 0),
        Number(c.ganancia_neta || 0)
      ]);
    });
    const wsCostos = XLSX.utils.aoa_to_sheet(costData);
    applyStyles(wsCostos, [30, 12, 12, 12, 12, 12, 12, 15, 15, 15, 18]);
    XLSX.utils.book_append_sheet(wb, wsCostos, "COSTOS");

    XLSX.writeFile(wb, `ERP_Reporte_General_${periodoActual.replace(" ", "_")}.xlsx`);
  };

  const tabs = [
    { id: 'estado_resultados', name: 'ESTADO DE RESULTADOS', icon: TrendingUp },
    { id: 'libro_diario', name: 'LIBRO DIARIO', icon: BookOpen },
    { id: 'libro_mayor', name: 'LIBRO MAYOR', icon: Layers },
    { id: 'compras_ventas', name: 'COMPRAS Y VENTAS', icon: ShoppingCart },
    { id: 'inventario_peps', name: 'INVENTARIO (PEPS)', icon: Package },
    { id: 'plan_cuentas', name: 'PLAN DE CUENTAS', icon: List },
    { id: 'estadisticas', name: 'ESTADÍSTICAS', icon: BarChart3 },
    { id: 'costos', name: 'COSTOS', icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans antialiased">
      <header className="bg-emerald-800 text-white p-4 shadow-sm border-b border-emerald-950">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">THE ROASTING LAB / CAFÉ YANALOMA</h1>
            <p className="text-xs text-emerald-200 font-mono">Gestión Contable Integrada • Expresado en Bolivianos (Bs)</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-emerald-700 px-3 py-1 rounded border border-emerald-600">
              <span className="text-xs font-mono mr-2">Periodo:</span>
              <select 
                value={periodoActualId || ''} 
                onChange={(e) => {
                  if (e.target.value === 'NEW') setShowPeriodoModal(true);
                  else setPeriodoActualId(Number(e.target.value));
                }}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                {periodos.length === 0 && <option value="">Cargando...</option>}
                {periodos.map(p => (
                  <option key={p.id} value={p.id} className="text-gray-800">{p.nombre}</option>
                ))}
                <option disabled>──────────</option>
                <option value="NEW" className="font-bold text-emerald-800 bg-emerald-100">+ Añadir nuevo mes...</option>
              </select>
            </div>
            <a href="/pos" className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded shadow flex items-center gap-1.5 transition-colors">
              <ShoppingCart size={14} /> IR A CAJA (POS)
            </a>
            <button onClick={exportToExcel} className="bg-white hover:bg-gray-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded shadow flex items-center gap-1.5 transition-colors">
              <Download size={14} /> Exportar Reporte
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b shadow-sm overflow-x-auto whitespace-nowrap sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-xs font-bold tracking-wider uppercase border-b-4 transition-all ${
                  isActive ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
                {tab.name}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6">
        {loading ? (
           <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center text-gray-500 font-mono animate-pulse">
             Calculando y Sincronizando con Base de Datos...
           </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 overflow-x-auto">
            
            {/* 1. PESTAÑA: ESTADO DE RESULTADOS */}
            {activeTab === 'estado_resultados' && (
              <div>
                <h2 className="text-lg font-bold text-gray-700 mb-6 pb-2 border-b">ESTADO DE RESULTADOS - {periodoActual}</h2>
                <div className="max-w-2xl border rounded overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-600 font-mono border-b">
                      <tr>
                        <th className="px-6 py-3">Concepto</th>
                        <th className="px-6 py-3 text-right">Parcial (Bs)</th>
                        <th className="px-6 py-3 text-right">Total (Bs)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-medium text-gray-700">
                      <tr className="bg-emerald-50/40 font-bold"><td className="px-6 py-2.5" colSpan={3}>INGRESOS TOTALES</td></tr>
                      <tr><td className="px-6 py-2 pl-10 font-normal">Ventas</td><td className="px-6 py-2 text-right font-mono">{formatNumber(plData.vVentas)}</td><td></td></tr>
                      <tr className="border-b-2"><td className="px-6 py-2 pl-10 font-normal">Servicios</td><td className="px-6 py-2 text-right font-mono">{formatNumber(plData.vServicios)}</td><td className="px-6 py-2 text-right font-mono text-emerald-700">{formatNumber(plData.totalIngresos)}</td></tr>
                      
                      <tr className="bg-orange-50/40 font-bold"><td className="px-6 py-2.5" colSpan={3}>COSTOS TOTALES</td></tr>
                      <tr><td className="px-6 py-2 pl-10 font-normal">Inventario</td><td className="px-6 py-2 text-right font-mono">{formatNumber(plData.cInventario)}</td><td></td></tr>
                      <tr><td className="px-6 py-2 pl-10 font-normal">Insumos alimenticios</td><td className="px-6 py-2 text-right font-mono">{formatNumber(plData.cInsumos)}</td><td></td></tr>
                      <tr><td className="px-6 py-2 pl-10 font-normal">Mano de obra</td><td className="px-6 py-2 text-right font-mono">{formatNumber(plData.cManoObra)}</td><td></td></tr>
                      <tr className="border-b-2"><td className="px-6 py-2 pl-10 font-normal">Costos secundarios</td><td className="px-6 py-2 text-right font-mono">{formatNumber(plData.cSecundarios)}</td><td className="px-6 py-2 text-right font-mono text-orange-700">{formatNumber(plData.totalCostos)}</td></tr>
                      
                      <tr className="bg-red-50/40 font-bold"><td className="px-6 py-2.5" colSpan={3}>IMPUESTOS</td></tr>
                      <tr><td className="px-6 py-2 pl-10 font-normal">IT</td><td className="px-6 py-2 text-right font-mono">{formatNumber(plData.iIT)}</td><td></td></tr>
                      <tr className="border-b-2"><td className="px-6 py-2 pl-10 font-normal">IVA</td><td className="px-6 py-2 text-right font-mono">{formatNumber(plData.iIVA)}</td><td className="px-6 py-2 text-right font-mono text-red-700">{formatNumber(plData.totalImpuestos)}</td></tr>
                      
                      <tr className="bg-emerald-600 text-white font-bold text-base">
                        <td className="px-6 py-3">TOTAL (UTILIDAD NETA)</td>
                        <td></td>
                        <td className="px-6 py-3 text-right font-mono">{formatNumber(plData.utilidad)}</td>
                      </tr>

                      {/* ESPACIO EN BLANCO */}
                      <tr><td colSpan={3} className="h-8"></td></tr>

                      <tr className="bg-purple-50/40 font-bold"><td className="px-6 py-2.5" colSpan={3}>Destacado (Gastos Extraordinarios)</td></tr>
                      {plData.destacado.length === 0 && (
                        <tr><td colSpan={3} className="px-6 py-3 text-center text-gray-400 italic font-normal">No hay gastos destacados en este periodo.</td></tr>
                      )}
                      {plData.destacado.map((d: any) => (
                        <tr key={d.id} className="border-b border-gray-100">
                          <td className="px-6 py-2 pl-10 font-normal">{d.detalle}</td>
                          <td className="px-6 py-2 text-right font-mono text-purple-700">{formatNumber(d.monto_total)}</td>
                          <td></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. PESTAÑA: LIBRO DIARIO */}
            {activeTab === 'libro_diario' && (
              <div>
                <div className="flex justify-between items-center mb-4 pb-2 border-b">
                  <h2 className="text-lg font-bold text-gray-700">LIBRO DIARIO DE CONTABILIDAD</h2>
                  <button onClick={() => setShowDiarioModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                    <Plus size={14} /> Registrar Asiento
                  </button>
                </div>
                
                {diarioAgrupado.length === 0 && <div className="text-center py-10 text-gray-400">No hay asientos contables registrados.</div>}
                
                <div className="space-y-6">
                  {diarioAgrupado.map((asiento, idx) => (
                    <div key={idx} className="border rounded-lg shadow-sm overflow-hidden bg-white">
                      <div className="bg-emerald-900 text-white px-4 py-2 text-xs font-bold font-mono flex justify-between items-center">
                        <span>Asiento N° {asiento.nro_asiento || '-'}</span>
                        <span>Fecha: {formatDate(asiento.fecha)}</span>
                      </div>
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase font-mono border-b hidden sm:table-header-group">
                          <tr>
                            <th className="px-4 py-2 w-2/3">CUENTA CONTABLE</th>
                            <th className="px-4 py-2 text-right">DEBE (Bs)</th>
                            <th className="px-4 py-2 text-right">HABER (Bs)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y font-mono text-gray-700">
                          {asiento.movimientos.map((mov: any, movIdx: number) => {
                            const isHaber = Number(mov.haber || 0) > 0;
                            return (
                              <tr key={mov.id || movIdx} className="hover:bg-gray-50">
                                <td className={`px-4 py-2 ${isHaber ? 'pl-10' : ''}`}>
                                  <span className="font-bold text-emerald-800">{mov.codigo_cuenta}</span>
                                </td>
                                <td className="px-4 py-2 text-right">{Number(mov.debe || 0) > 0 ? formatNumber(mov.debe) : ''}</td>
                                <td className="px-4 py-2 text-right">{Number(mov.haber || 0) > 0 ? formatNumber(mov.haber) : ''}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t font-bold font-mono text-gray-800">
                          <tr>
                            <td className="px-4 py-2 text-right text-xs">SUMAS IGUALES</td>
                            <td className="px-4 py-2 text-right text-emerald-700 border-t-2 border-emerald-700 border-double">{formatNumber(asiento.totalDebe)}</td>
                            <td className="px-4 py-2 text-right text-emerald-700 border-t-2 border-emerald-700 border-double">{formatNumber(asiento.totalHaber)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      {asiento.glosa && (
                        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 italic border-t">
                          Glosa: {asiento.glosa}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. PESTAÑA: LIBRO MAYOR (SELECTOR DINÁMICO) */}
            {activeTab === 'libro_mayor' && (
              <div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-2 border-b gap-4">
                  <h2 className="text-lg font-bold text-gray-700">LIBRO MAYOR AUXILIAR</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">Cuenta:</span>
                    <select
                      value={cuentaMayorActiva}
                      onChange={(e) => setCuentaMayorActiva(e.target.value)}
                      className="border border-gray-300 rounded p-1.5 text-xs font-bold text-emerald-800 font-mono outline-none focus:ring-1 focus:ring-emerald-500 bg-white min-w-[250px]"
                    >
                      <option value="TODAS">-- SELECCIONE UNA CUENTA --</option>
                      {mayorPorCuenta.map(mayor => (
                        <option key={mayor.codigo} value={mayor.codigo}>{mayor.codigo} - {mayor.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {mayorPorCuenta.length === 0 && <p className="text-gray-500 text-center py-10">No hay movimientos registrados en ninguna cuenta.</p>}
                
                {cuentaMayorActiva === 'TODAS' ? (
                  <div className="text-center py-12 text-gray-500 border-2 border-dashed rounded-lg bg-gray-50">
                    <Layers size={32} className="mx-auto mb-3 text-gray-400" />
                    <p className="font-medium text-sm">Seleccione una cuenta contable en el menú desplegable superior</p>
                    <p className="text-xs text-gray-400 mt-1">para visualizar sus movimientos y saldo acumulado.</p>
                  </div>
                ) : (
                  mayorPorCuenta.filter(m => m.codigo === cuentaMayorActiva).map(mayor => (
                    <div key={mayor.codigo} className="mb-10">
                      <h3 className="text-sm font-bold text-emerald-800 bg-emerald-50 p-2.5 border-l-4 border-emerald-600 mb-3 shadow-sm flex items-center gap-2">
                        <Layers size={16} />
                        {mayor.codigo} - {mayor.nombre}
                      </h3>
                      <div className="border rounded overflow-hidden shadow-sm">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-stone-800 text-white font-mono">
                            <tr>
                              <th className="px-4 py-2 border-b border-stone-700">FECHA</th>
                              <th className="px-4 py-2 border-b border-stone-700 text-center">ASIENTO</th>
                              <th className="px-4 py-2 border-b border-stone-700 w-1/2">DETALLE / GLOSA</th>
                              <th className="px-4 py-2 border-b border-stone-700 text-right">DEBE (Bs)</th>
                              <th className="px-4 py-2 border-b border-stone-700 text-right">HABER (Bs)</th>
                              <th className="px-4 py-2 border-b border-emerald-900 text-right bg-emerald-900">SALDO ACUM.</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono divide-y text-gray-700 bg-white">
                            {mayor.movimientos.map((mov: any, idx: number) => (
                              <tr key={mov.id || idx} className="hover:bg-gray-50">
                                <td className="px-4 py-2 border-b">{formatDate(mov.fecha || mov.created_at)}</td>
                                <td className="px-4 py-2 border-b text-center font-bold">{mov.nro_asiento || '-'}</td>
                                <td className="px-4 py-2 border-b">{mov.glosa || 'Movimiento contable'}</td>
                                <td className="px-4 py-2 border-b text-right">{Number(mov.debe || 0) > 0 ? formatNumber(mov.debe) : ''}</td>
                                <td className="px-4 py-2 border-b text-right">{Number(mov.haber || 0) > 0 ? formatNumber(mov.haber) : ''}</td>
                                <td className="px-4 py-2 border-b text-right bg-gray-50 font-bold">{formatNumber(mov.saldoAcumulado)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 4. PESTAÑA: COMPRAS Y VENTAS */}
            {activeTab === 'compras_ventas' && (
              <div>
                <div className="flex justify-between items-center mb-6 pb-2 border-b">
                  <h2 className="text-lg font-bold text-gray-700">CUADRO DIARIO DE INGRESOS Y EGRESOS OPERATIVOS</h2>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="Buscar N°, Fecha, Detalle..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500 w-64"
                      />
                    </div>
                    <button onClick={() => setShowCVModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                      <Plus size={14} /> Registrar Movimiento
                    </button>
                  </div>
                </div>

                {/* RESUMEN KPI (Conclusiones) */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 mb-8">
                  {/* Total Ventas */}
                  <div className="bg-white border rounded-lg p-5 shadow-sm border-l-4 border-l-emerald-500">
                    <p className="text-xs font-bold text-gray-500 uppercase">Total de Ventas</p>
                    <p className="text-2xl font-mono font-bold text-emerald-700 mt-1">Bs {formatNumber(plData.ingresosVentas)}</p>
                    <div className="mt-3 text-sm text-gray-500 font-mono">
                      Prom. Diario: {formatNumber(plData.ingresosVentas / 23)}<br/>
                      Prom. Semanal: {formatNumber(plData.ingresosVentas / 4)}
                    </div>
                  </div>
                  {/* Total Gastos */}
                  <div className="bg-white border rounded-lg p-5 shadow-sm border-l-4 border-l-orange-500">
                    <p className="text-xs font-bold text-gray-500 uppercase">Total de Gastos</p>
                    <p className="text-2xl font-mono font-bold text-orange-700 mt-1">Bs {formatNumber(plData.totalCostos)}</p>
                    <div className="mt-3 text-sm text-gray-500 font-mono">
                      Prom. Diario: {formatNumber(plData.totalCostos / 23)}<br/>
                      Prom. Semanal: {formatNumber(plData.totalCostos / 4.5)}
                    </div>
                  </div>
                  {/* EERR & Impuestos */}
                  <div className="bg-white border rounded-lg p-5 shadow-sm border-l-4 border-l-purple-500">
                    <p className="text-xs font-bold text-gray-500 uppercase">E.E.R.R. (Utilidad)</p>
                    <p className="text-2xl font-mono font-bold text-purple-700 mt-1">Bs {formatNumber(plData.utilidad)}</p>
                    <div className="mt-3 text-sm text-gray-500 font-mono">
                      Impuestos: {formatNumber(plData.totalImpuestos)}<br/>
                      Días Trabajados: 23
                    </div>
                  </div>
                  {/* Cajas Totales */}
                  <div className="bg-white border rounded-lg p-5 shadow-sm border-l-4 border-l-blue-500">
                    <p className="text-xs font-bold text-gray-500 uppercase">Distribución Estimada</p>
                    <div className="mt-3 text-sm font-mono text-gray-600 leading-relaxed">
                      C. Chica: {formatNumber(plData.ingresosVentas * 0.4)}<br/>
                      Banco: {formatNumber(plData.ingresosVentas * 0.5)}<br/>
                      POS: {formatNumber(plData.ingresosVentas * 0.1)}
                    </div>
                  </div>
                </div>

                {/* TABLA PRINCIPAL DE DATOS */}
                <div className="overflow-x-auto border rounded shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-800 text-white font-mono whitespace-nowrap text-sm">
                      <tr>
                        <th className="p-3 border-b border-stone-700 text-center">N°</th>
                        <th className="p-3 border-b border-stone-700">
                          <button onClick={() => setSortAscending(!sortAscending)} className="flex items-center gap-1 hover:text-emerald-300 transition-colors uppercase">
                            FECHA <ArrowUpDown size={14} />
                          </button>
                        </th>
                        <th className="p-3 border-b border-stone-700 w-1/4">DETALLE</th>
                        <th className="p-3 border-b border-stone-700 text-right bg-emerald-900">INGRESO</th>
                        <th className="p-3 border-b border-stone-700 text-right bg-orange-900">EGRESO</th>
                        <th className="p-3 border-b border-stone-700 text-right">CAJA</th>
                        <th className="p-3 border-b border-stone-700 text-right">C.CHICA</th>
                        <th className="p-3 border-b border-stone-700 text-right">BANCO</th>
                        <th className="p-3 border-b border-stone-700 text-right">POS</th>
                        <th className="p-3 border-b border-stone-700 text-center">METODO PAGO</th>
                        <th className="p-3 border-b border-stone-700 text-center">FACTURA</th>
                        <th className="p-3 border-b border-stone-700 text-right bg-stone-900">V.S/F. C CH</th>
                        <th className="p-3 border-b border-stone-700 text-right bg-stone-900">V. BANCO</th>
                        <th className="p-3 border-b border-stone-700 text-right bg-stone-900 text-purple-300">COSTO C. CH</th>
                        <th className="p-3 border-b border-stone-700 text-right bg-stone-900 text-purple-300">COSTO BANCO</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono divide-y text-gray-700 bg-white">
                      {(() => {
                        const filteredTx = transacciones.filter(tx => {
                          if (!searchTerm) return true;
                          const term = searchTerm.toLowerCase();
                          const matchId = String(tx.id).includes(term);
                          const matchFecha = formatDate(tx.fecha || tx.created_at).toLowerCase().includes(term);
                          const matchDetalle = (tx.detalle || '').toLowerCase().includes(term);
                          return matchId || matchFecha || matchDetalle;
                        });

                        const sortedTx = [...filteredTx].sort((a, b) => {
                          const dA = new Date(a.fecha || a.created_at).getTime();
                          const dB = new Date(b.fecha || b.created_at).getTime();
                          if (sortAscending) {
                            return dA !== dB ? dA - dB : a.id - b.id;
                          } else {
                            return dA !== dB ? dB - dA : b.id - a.id;
                          }
                        });
                        
                        if (sortedTx.length === 0) return <tr><td colSpan={15} className="p-4 text-center text-gray-400">No se encontraron resultados para tu búsqueda.</td></tr>;
                        
                        return sortedTx.map((tx) => {
                          const isIngreso = tx.tipo_movimiento === 'INGRESO';
                          const isEgreso = tx.tipo_movimiento === 'EGRESO';
                          const val = Number(tx.monto_total || 0);
                          
                          const cCaja = Number(tx.caja || 0);
                          const cCChica = Number(tx.c_chica || 0);
                          const cBanco = Number(tx.banco || 0);
                          const cPos = Number(tx.pos || 0);
                          
                          const vSfCch = Number(tx.v_sf_cchica || 0);
                          const vBanco = Number(tx.v_sf_banco || 0);
                          
                          const cCh = Number(tx.costo_cchica || 0);
                          const cBancoCost = Number(tx.costo_banco || 0);

                          return (
                            <tr key={tx.id} className="hover:bg-gray-50">
                              <td className="p-3 text-center font-bold text-gray-500">{tx.id}</td>
                              <td className="p-3">{formatDate(tx.fecha || tx.created_at)}</td>
                              <td className="p-3 truncate max-w-xs">{tx.detalle || 'Operación'}</td>
                              <td className="p-3 text-right font-bold text-emerald-600 bg-emerald-50/30">{isIngreso && val > 0 ? formatNumber(val) : '-'}</td>
                              <td className="p-3 text-right font-bold text-orange-600 bg-orange-50/30">{isEgreso && val > 0 ? formatNumber(val) : '-'}</td>
                              
                              <td className="p-3 text-right">{cCaja > 0 ? formatNumber(cCaja) : '-'}</td>
                              <td className="p-3 text-right bg-gray-50">{cCChica > 0 ? formatNumber(cCChica) : '-'}</td>
                              <td className="p-3 text-right">{cBanco > 0 ? formatNumber(cBanco) : '-'}</td>
                              <td className="p-3 text-right bg-gray-50">{cPos > 0 ? formatNumber(cPos) : '-'}</td>
                              
                              <td className="p-3 text-center font-bold text-gray-600">{tx.metodo_pago || '-'}</td>
                              <td className="p-3 text-center">
                                {tx.tiene_factura ? (
                                  <CheckCircle2 size={18} className="mx-auto text-emerald-500" />
                                ) : (
                                  <XCircle size={18} className="mx-auto text-gray-300" />
                                )}
                              </td>
                              
                              <td className="p-3 text-right bg-gray-50 text-gray-600">{vSfCch > 0 ? formatNumber(vSfCch) : '-'}</td>
                              <td className="p-3 text-right bg-gray-50 text-gray-600">{vBanco > 0 ? formatNumber(vBanco) : '-'}</td>
                              <td className="p-3 text-right bg-purple-50/30 text-purple-700">{cCh > 0 ? formatNumber(cCh) : '-'}</td>
                              <td className="p-3 text-right bg-purple-50/30 text-purple-700">{cBancoCost > 0 ? formatNumber(cBancoCost) : '-'}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. PESTAÑA: INVENTARIO (PEPS) */}
            {activeTab === 'inventario_peps' && (
              <div>
                <div className="flex justify-between items-center mb-6 pb-2 border-b">
                  <h2 className="text-lg font-bold text-gray-700">VALORACIÓN DE INVENTARIO PEPS Y CONTROL DE PLANTA</h2>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="Buscar N°, Fecha, Detalle..." 
                        value={invSearchTerm}
                        onChange={(e) => setInvSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500 w-64"
                      />
                    </div>
                    <button onClick={() => setShowInvModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                      <Plus size={14} /> Registrar Movimiento
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border rounded shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-800 text-white font-mono whitespace-nowrap text-sm">
                      <tr>
                        <th className="p-3 border-b border-stone-700 text-center">N°</th>
                        <th className="p-3 border-b border-stone-700">
                          <button onClick={() => setInvSortAscending(!invSortAscending)} className="flex items-center gap-1 hover:text-emerald-300 transition-colors uppercase">
                            FECHA <ArrowUpDown size={14} />
                          </button>
                        </th>
                        <th className="p-3 border-b border-stone-700 w-1/5">DETALLE / REFERENCIA</th>
                        <th className="p-3 border-b border-stone-700 text-right text-emerald-300 bg-emerald-950">ENTRADAS</th>
                        <th className="p-3 border-b border-stone-700 text-right text-orange-300 bg-orange-950">SALIDAS</th>
                        <th className="p-3 border-b border-stone-700 text-right text-amber-300 bg-stone-900">SALDO KG</th>
                        <th className="p-3 border-b border-stone-700 text-right">C/U (Bs)</th>
                        <th className="p-3 border-b border-stone-700 text-right text-emerald-300 bg-emerald-950">DEBE</th>
                        <th className="p-3 border-b border-stone-700 text-right text-orange-300 bg-orange-950">HABER</th>
                        <th className="p-3 border-b border-stone-700 text-right text-amber-300 bg-stone-900">SALDO VALOR</th>
                        
                        <th className="p-3 border-b border-stone-700 text-center">TIPO CAFÉ</th>
                        <th className="p-3 border-b border-stone-700 text-center">TIPO TUESTE</th>
                        <th className="p-3 border-b border-stone-700 text-center">CLIMA</th>
                        <th className="p-3 border-b border-stone-700 text-right">MERMA %</th>
                        <th className="p-3 border-b border-stone-700 text-right">MERMA KG</th>
                        <th className="p-3 border-b border-stone-700 text-right font-bold text-emerald-400">TUESTE FINAL</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono divide-y text-gray-700 bg-white">
                      {(() => {
                        const filteredInv = movimientosInv.filter(mov => {
                          if (!invSearchTerm) return true;
                          const term = invSearchTerm.toLowerCase();
                          const matchId = String(mov.id).includes(term);
                          const matchFecha = formatDate(mov.fecha || mov.created_at).toLowerCase().includes(term);
                          const matchDetalle = (mov.detalle || '').toLowerCase().includes(term);
                          return matchId || matchFecha || matchDetalle;
                        });

                        const sortedInv = [...filteredInv].sort((a, b) => {
                          const dA = new Date(a.fecha || a.created_at).getTime();
                          const dB = new Date(b.fecha || b.created_at).getTime();
                          if (invSortAscending) {
                            return dA !== dB ? dA - dB : a.id - b.id;
                          } else {
                            return dA !== dB ? dB - dA : b.id - a.id;
                          }
                        });
                        
                        if (sortedInv.length === 0) return <tr><td colSpan={16} className="p-4 text-center text-gray-400">No se encontraron resultados para tu búsqueda.</td></tr>;
                        
                        return sortedInv.map((mov) => {
                          const entradas = Number(mov.entradas || 0);
                          const salidas = Number(mov.salidas || 0);
                          const saldoUnidades = Number(mov.saldo_unidades || 0);
                          const costoUni = Number(mov.costo_unitario || 0);
                          const debe = Number(mov.debe || 0);
                          const haber = Number(mov.haber || 0);
                          const saldoValor = Number(mov.saldo_valor || 0);
                          const mermaPorcentaje = Number(mov.merma_porcentaje || 0);
                          const mermaTueste = Number(mov.merma_tueste || 0);
                          const tuesteFinal = Number(mov.tueste_final || 0);

                          return (
                            <tr key={mov.id} className="hover:bg-gray-50">
                              <td className="p-3 text-center font-bold text-gray-500">{mov.id}</td>
                              <td className="p-3">{formatDate(mov.fecha || mov.created_at)}</td>
                              <td className="p-3 truncate max-w-xs">{mov.detalle || '-'}</td>
                              
                              <td className="p-3 text-right font-bold text-emerald-600 bg-emerald-50/30">{entradas > 0 ? formatNumber(entradas) : '-'}</td>
                              <td className="p-3 text-right font-bold text-orange-600 bg-orange-50/30">{salidas > 0 ? formatNumber(salidas) : '-'}</td>
                              <td className="p-3 text-right font-bold bg-stone-50">{saldoUnidades > 0 ? formatNumber(saldoUnidades) : '-'}</td>
                              
                              <td className="p-3 text-right">{costoUni > 0 ? formatNumber(costoUni) : '-'}</td>
                              <td className="p-3 text-right text-emerald-700 bg-emerald-50/30">{debe > 0 ? formatNumber(debe) : '-'}</td>
                              <td className="p-3 text-right text-orange-700 bg-orange-50/30">{haber > 0 ? formatNumber(haber) : '-'}</td>
                              <td className="p-3 text-right font-bold bg-stone-50">{saldoValor > 0 ? formatNumber(saldoValor) : '-'}</td>
                              
                              <td className="p-3 text-center text-gray-600">{mov.tipo_cafe || '-'}</td>
                              <td className="p-3 text-center text-gray-600">{mov.tipo_tueste || '-'}</td>
                              <td className="p-3 text-center text-gray-600">{mov.clima || '-'}</td>
                              
                              <td className="p-3 text-right text-gray-500">{mermaPorcentaje > 0 ? `${formatNumber(mermaPorcentaje)}%` : '-'}</td>
                              <td className="p-3 text-right text-gray-500">{mermaTueste > 0 ? formatNumber(mermaTueste) : '-'}</td>
                              <td className="p-3 text-right font-bold text-emerald-700 bg-emerald-50/30">{tuesteFinal > 0 ? formatNumber(tuesteFinal) : '-'}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. PESTAÑA: PLAN DE CUENTAS */}
            {activeTab === 'plan_cuentas' && (
              <div>
                <h2 className="text-lg font-bold text-gray-700 mb-4 pb-2 border-b">PLAN ÚNICO DE CUENTAS</h2>
                <div className="max-w-xl border rounded">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 font-mono text-xs">
                      <tr>
                        <th className="px-4 py-2 border-b w-1/3">CÓDIGO NOMENCLATURA</th>
                        <th className="px-4 py-2 border-b">DENOMINACIÓN DE CUENTA</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-gray-700 divide-y">
                      {planCuentas.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">El catálogo está vacío.</td></tr>}
                      {planCuentas.map((cuenta) => {
                        const isMain = cuenta.codigo.length <= 3 || cuenta.codigo.endsWith('00');
                        return (
                          <tr key={cuenta.codigo} className={isMain ? "bg-emerald-50/30 font-bold" : ""}>
                            <td className="px-4 py-1.5 border-b">{cuenta.codigo}</td>
                            <td className={`px-4 py-1.5 border-b ${!isMain ? "pl-10" : ""}`}>{cuenta.nombre}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. PESTAÑA: ESTADÍSTICAS */}
            {activeTab === 'estadisticas' && (
              <div>
                <h2 className="text-lg font-bold text-gray-700 mb-4 pb-2 border-b">MATRIZ CONTROL DE UNIDADES VENDIDAS AL DÍA</h2>
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-stone-800 text-white font-mono whitespace-nowrap">
                      <tr>
                        <th className="p-2 border text-center">Nº</th>
                        <th className="p-2 border">DESCRIPCIÓN DE ITEM</th>
                        <th className="p-2 border text-center bg-emerald-700">TOTAL MES</th>
                        {Array.from({ length: 31 }, (_, i) => <th key={i} className="p-1 border text-center w-8">{i + 1}</th>)}
                      </tr>
                    </thead>
                    <tbody className="font-mono text-gray-700 divide-y">
                      {estadisticas.length === 0 && <tr><td colSpan={34} className="p-4 text-center">No hay ventas en este periodo.</td></tr>}
                      {estadisticas.map((est: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="p-2 border text-center">{idx + 1}</td>
                          <td className="p-2 border font-medium whitespace-nowrap">{est.nombre}</td>
                          <td className="p-2 border text-center font-bold bg-emerald-50 text-emerald-800">{est.total}</td>
                          {est.days.map((qty: number, i: number) => (
                            <td key={i} className={`p-1 border text-center ${qty > 0 ? 'font-bold text-gray-800' : 'text-gray-300'}`}>
                              {qty > 0 ? qty : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 8. PESTAÑA: COSTOS */}
            {activeTab === 'costos' && (
              <div>
                <h2 className="text-lg font-bold text-gray-700 mb-4 pb-2 border-b">ESCANDALLOS Y COSTEO DE RECETAS POR BEBIDA</h2>
                <div className="overflow-x-auto border rounded shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-emerald-950 text-white font-mono whitespace-nowrap text-sm">
                      <tr>
                        <th className="p-3 border-b border-emerald-900">PRODUCTO / BEBIDA</th>
                        <th className="p-3 border-b border-emerald-900 text-right">CAFÉ (20g)</th>
                        <th className="p-3 border-b border-emerald-900 text-right">AGUA (50g)</th>
                        <th className="p-3 border-b border-emerald-900 text-right">LECHE</th>
                        <th className="p-3 border-b border-emerald-900 text-right">ENDULZANTE</th>
                        <th className="p-3 border-b border-emerald-900 text-right">INSUMOS/PACK</th>
                        <th className="p-3 border-b border-emerald-900 text-right">M. DE OBRA</th>
                        <th className="p-3 border-b border-emerald-900 text-right bg-stone-800 text-amber-400">COSTO TOTAL</th>
                        <th className="p-3 border-b border-emerald-900 text-right bg-emerald-800">PRECIO DE VENTA</th>
                        <th className="p-3 border-b border-emerald-900 text-right bg-red-800">IMPUESTOS (Bs)</th>
                        <th className="p-3 border-b border-emerald-900 text-right bg-emerald-600 text-white font-bold">GANANCIA NETA</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-gray-700 divide-y bg-white">
                      {costosData.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-gray-400">No hay productos ni recetas activas.</td></tr>}
                      {costosData.map((c: any) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="p-3 border-b font-bold text-gray-900">{c.producto}</td>
                          <td className="p-3 border-b text-right">Bs {formatNumber(c.costo_cafe)}</td>
                          <td className="p-3 border-b text-right">Bs {formatNumber(c.costo_agua)}</td>
                          <td className="p-3 border-b text-right">Bs {formatNumber(c.costo_leche)}</td>
                          <td className="p-3 border-b text-right">Bs {formatNumber(c.costo_endulzante)}</td>
                          <td className="p-3 border-b text-right">Bs {formatNumber(c.costo_insumos)}</td>
                          <td className="p-3 border-b text-right">Bs {formatNumber(c.mano_obra)}</td>
                          <td className="p-3 border-b text-right bg-stone-50 font-bold">Bs {formatNumber(c.costo_total)}</td>
                          <td className="p-3 border-b text-right bg-emerald-50/50 text-emerald-800 font-bold">Bs {formatNumber(c.precio_venta)}</td>
                          <td className="p-3 border-b text-right text-red-600">Bs {formatNumber(c.impuestos)}</td>
                          <td className="p-3 border-b text-right bg-emerald-50 text-emerald-700 font-bold text-sm">Bs {formatNumber(c.ganancia_neta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      <ModalComprasVentas isOpen={showCVModal} onClose={() => setShowCVModal(false)} onSaved={handleSaved} />
      <ModalLibroDiario isOpen={showDiarioModal} onClose={() => setShowDiarioModal(false)} onSaved={handleSaved} planCuentas={planCuentas} />
      <ModalInventarioPeps isOpen={showInvModal} onClose={() => setShowInvModal(false)} onSaved={handleSaved} />
      <ModalPeriodo isOpen={showPeriodoModal} onClose={() => setShowPeriodoModal(false)} onSaved={handlePeriodoSaved} />
    </div>
  );
}

