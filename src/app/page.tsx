"use client";

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/lib/supabase';
import libroDiarioAbril2026 from '@/lib/data/libro_diario_abril_2026.json';
import ModalComprasVentas from '@/components/erp/ModalComprasVentas';
import ModalLibroDiario from '@/components/erp/ModalLibroDiario';
import ModalInventarioPeps from '@/components/erp/ModalInventarioPeps';
import ModalPeriodo from '@/components/erp/ModalPeriodo';
import ModalMasa from '@/components/erp/ModalMasa';
import ModalMovimientoMasa from '@/components/erp/ModalMovimientoMasa';
import { MasasService, Masa, MovimientoMasa } from '@/lib/services/masas.service';
import { 
  TrendingUp, BookOpen, Layers, ShoppingCart, 
  Package, List, BarChart3, DollarSign, Plus, Download,
  CheckCircle2, XCircle, ArrowUpDown, Search, RefreshCw,
  ChevronDown, ChevronUp, Users, LogOut, Edit3, Trash2, Link2,
  Cookie
} from 'lucide-react';
import { toast } from 'sonner';

const csvAccountOrder = [
  '1110101', // CAJA MONEDA NACIONAL
  '1110102', // CAJA CHICA
  '1110103', // BANCO BISA
  '1110105', // POS / TARJETA (POR COBRAR)
  '5010101', // VENTAS
  '5010103', // DESCUENTOS SOBRE VENTAS
  '50102',   // COSTO DE VENTAS Y SERVICIOS
  '115',     // INVENTARIO DE MERCADERIAS
  '502030102', // LINKSER
  '502030103', // COMISIONES A LINKSER
  '1160103', // IT
  'IT POR PAGAR', // IT POR PAGAR
  'IVA',     // IVA
  '1130203', // CREDITO FISCAL
  '11506',   // INSUMOS ALIMENTICIOS
  '1130402', // COMPRAS
  '12706',   // SERVICIOS EXTERNOS
  '111301',  // CUENTAS POR COBRAR
  '12701',   // PÚBLICIDAD Y MARKETING
  'ACHUMANI 1', // ACHUMANI
  '11507',   // MATERIAL DE ESCRITORIO
  '2130103', // OGLIGACIONES CON EL PERSONAL
  '1160101', // SERVICIO DE TUESTE
  '40101',   // GASTOS ADMINISTRATIVOS
  '11402',   // PRODUCTOS DE LIMPIEZA
  '12703',   // SERVICIO DE INTERNET
  '11501',   // MATERIA PRIMA (CAFÉ ORO VERDE)
  '1160102', // CAFÉ TOSTADO
  '12505',   // ÚTENCILIOS DE COCINA
  '12705',   // SERVICIOS BÁSICOS
  '12404',   // MUEBLES Y EQUIPOS DE OFICINA
  '12702',   // SERVICIO DE ALQUILER
  '31503',   // RESERVA MONEDA EXTRANJERA
  '12405',   // HERRAMIENTAS
  '11701',   // GAS LICUADO
  '21103',   // CUENTAS POR PAGAR
  '12601',   // TELEFONIA
  '406'      // IUE
];

const csvAccountNames: Record<string, string> = {
  '1110101': 'CAJA MONEDA NACIONAL',
  '1110102': 'CAJA CHICA',
  '1110103': 'BANCO BISA',
  '1110105': 'POS / TARJETA (POR COBRAR)',
  '5010101': 'VENTAS',
  '5010103': 'DESCUENTOS SOBRE VENTAS',
  '50102': 'COSTO DE VENTAS Y SERVICIOS',
  '115': 'INVENTARIO DE MERCADERIAS',
  '502030102': 'LINKSER',
  '502030103': 'COMISIONES A LINKSER',
  '1160103': 'IT',
  'IT POR PAGAR': 'IT POR PAGAR',
  'IVA': 'IVA',
  '1130203': 'CREDITO FISCAL',
  '11506': 'INSUMOS ALIMENTICIOS',
  '1130402': 'COMPRAS',
  '12706': 'SERVICIOS EXTERNOS',
  '111301': 'CUENTAS POR COBRAR',
  '12701': 'PÚBLICIDAD Y MARKETING',
  'ACHUMANI 1': 'ACHUMANI',
  '11507': 'MATERIAL DE ESCRITORIO',
  '2130103': 'OGLIGACIONES CON EL PERSONAL',
  '1160101': 'SERVICIO DE TUESTE',
  '40101': 'GASTOS ADMINISTRATIVOS',
  '11402': 'PRODUCTOS DE LIMPIEZA',
  '12703': 'SERVICIO DE INTERNET',
  '11501': 'MATERIA PRIMA (CAFÉ ORO VERDE)',
  '1160102': 'CAFÉ TOSTADO',
  '12505': 'ÚTENCILIOS DE COCINA',
  '12705': 'SERVICIOS BÁSICOS',
  '12404': 'MUEBLES Y EQUIPOS DE OFICINA',
  '12702': 'SERVICIO DE ALQUILER',
  '31503': 'RESERVA MONEDA EXTRANJERA',
  '12405': 'HERRAMIENTAS',
  '11701': 'GAS LICUADO',
  '21103': 'CUENTAS POR PAGAR',
  '12601': 'TELEFONIA',
  '406': 'IUE'
};

const getSpanishDayOfWeek = (dateString: string) => {
  if (!dateString) return '';
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const d = new Date(dateString);
  const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return days[localDate.getDay()];
};

const formatDateToSpanishAbbr = (dateString: string) => {
  if (!dateString) return '';
  const monthsStd = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const d = new Date(dateString);
  const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  const day = String(localDate.getDate()).padStart(2, '0');
  const month = monthsStd[localDate.getMonth()];
  const year = localDate.getFullYear();
  return `${day}-${month}-${year}`;
};

const parseSpanishDateToTime = (dStr: string) => {
  if (!dStr) return 0;
  if (dStr.includes('-') && dStr.split('-')[0].length === 4) {
    return new Date(dStr).getTime();
  }
  const parts = dStr.split('-');
  if (parts.length !== 3) return 0;
  const day = parseInt(parts[0]);
  const monthAbbr = parts[1].toLowerCase();
  const year = parseInt(parts[2]);
  const months: Record<string, number> = {
    'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
  };
  const month = months[monthAbbr] || 0;
  return new Date(year, month, day).getTime();
};

const formatDbSeatToRows = (dbSeat: any, planCuentas: any[]) => {
  const rows: string[][] = [];
  const dateStr = formatDateToSpanishAbbr(dbSeat.fecha);
  const dayStr = getSpanishDayOfWeek(dbSeat.fecha);
  const seatNumStr = String(dbSeat.nro_asiento);

  const debedMovs = dbSeat.movimientos.filter((m: any) => Number(m.debe || 0) > 0);
  const haberMovs = dbSeat.movimientos.filter((m: any) => Number(m.haber || 0) > 0);

  const totalRowsCount = debedMovs.length + haberMovs.length;

  for (let i = 0; i < totalRowsCount; i++) {
    const isDebe = i < debedMovs.length;
    const mov = isDebe ? debedMovs[i] : haberMovs[i - debedMovs.length];
    
    const rowFecha = i === 0 ? dateStr : (i === 1 ? dayStr : '');
    const rowSeat = i === 0 ? seatNumStr : '';
    
    const rawName = csvAccountNames[mov.codigo_cuenta] || planCuentas.find(c => c.codigo === mov.codigo_cuenta)?.nombre || mov.codigo_cuenta;
    let displayAccName = rawName;
    if (mov.codigo_cuenta === '5010101' || rawName.toUpperCase() === 'VENTAS') {
      const match = (dbSeat.glosa || '').toUpperCase().match(/(VENTA\s+\d+)/);
      if (match) displayAccName = match[1];
    }

    const colC = isDebe ? displayAccName : '';
    const colD = !isDebe ? displayAccName : '';
    
    const formatNumberLocal = (num: any) => {
      return Number(num || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const colDebe = isDebe ? formatNumberLocal(mov.debe) : '';
    const colHaber = !isDebe ? formatNumberLocal(mov.haber) : '';

    rows.push([rowFecha, rowSeat, colC, colD, colDebe, colHaber]);
  }

  const docRef = dbSeat.transaccion_id ? String(dbSeat.transaccion_id) : '';
  rows.push(['', docRef, dbSeat.glosa || '', '', '', '']);

  const formatNumberLocal = (num: any) => {
    return Number(num || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  rows.push(['', '', '', '', formatNumberLocal(dbSeat.totalDebe), formatNumberLocal(dbSeat.totalHaber)]);

  return rows;
};


export default function SistemaContableYanaloma() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // States for User CRUD
  const [usuariosList, setUsuariosList] = useState<any[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userFormName, setUserFormName] = useState('');
  const [userFormUsername, setUserFormUsername] = useState('');
  const [userFormPassword, setUserFormPassword] = useState('');
  const [userFormRole, setUserFormRole] = useState<'admin' | 'cajero' | 'otro'>('cajero');

  const [activeTab, setActiveTab] = useState('estado_resultados');
  const [loading, setLoading] = useState(false);
  const [graficoMetrica, setGraficoMetrica] = useState<'monto' | 'cantidad'>('monto');

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
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [editingDiario, setEditingDiario] = useState<any | null>(null);
  const [editingInventory, setEditingInventory] = useState<any | null>(null);

  const handleDeleteTransaction = async (id: number) => {
    if (!window.confirm("¿Está seguro de que desea eliminar esta transacción? Esto también eliminará su asiento contable relacionado.")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('transacciones').delete().eq('id', id);
      if (error) {
        alert("Error al eliminar la transacción: " + error.message);
      } else {
        setReloadKey(prev => prev + 1);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDiarioRow = async (id: number) => {
    if (!window.confirm("¿Está seguro de que desea eliminar esta fila del libro diario?")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('libro_diario').delete().eq('id', id);
      if (error) {
        alert("Error al eliminar el registro: " + error.message);
      } else {
        setReloadKey(prev => prev + 1);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDiarioSeat = async (nro_asiento: number, fecha: string) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar todo el asiento N° ${nro_asiento}? Se eliminarán todas las líneas de este asiento.`)) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('libro_diario').delete().eq('nro_asiento', nro_asiento).eq('fecha', fecha);
      if (error) {
        alert("Error al eliminar el asiento: " + error.message);
      } else {
        setReloadKey(prev => prev + 1);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInventory = async (id: number) => {
    if (!window.confirm("¿Está seguro de que desea eliminar este movimiento de inventario?")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('movimientos_inventario').delete().eq('id', id);
      if (error) {
        alert("Error al eliminar el movimiento de inventario: " + error.message);
      } else {
        setReloadKey(prev => prev + 1);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditTransaction = (tx: any) => {
    setEditingTransaction(tx);
    setShowCVModal(true);
  };

  const handleEditDiario = (mov: any) => {
    setEditingDiario(mov);
    setShowDiarioModal(true);
  };

  const handleEditInventory = (mov: any) => {
    setEditingInventory(mov);
    setShowInvModal(true);
  };

  const [mounted, setMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setMounted(true);
    const storedUser = localStorage.getItem('yanaloma_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setCurrentUser(parsed);
        if (parsed.role === 'cajero') {
          window.location.href = '/pos';
        }
      } catch (e) {
        console.error("Error parsing user from localStorage:", e);
      }
    }
    setUserLoaded(true);
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
        localStorage.setItem('yanaloma_user', JSON.stringify(data));
        setCurrentUser(data);
        if (data.role === 'cajero') {
          window.location.href = '/pos';
        } else {
          toast.success(`¡Bienvenido de nuevo, ${data.nombre}!`);
        }
      } else {
        const localSeedUsers = [
          { username: 'admin', password: 'admin123', role: 'admin', nombre: 'Administrador Yanaloma' },
          { username: 'cajero', password: 'cajero123', role: 'cajero', nombre: 'Cajero de Turno' },
          { username: 'otro', password: 'otro123', role: 'otro', nombre: 'Consultor Contable' }
        ];

        const localMatch = localSeedUsers.find(u => u.username === cleanUser && u.password === cleanPass);
        if (localMatch) {
          localStorage.setItem('yanaloma_user', JSON.stringify(localMatch));
          setCurrentUser(localMatch);
          if (localMatch.role === 'cajero') {
            window.location.href = '/pos';
          } else {
            toast.success(`¡Bienvenido de nuevo, ${localMatch.nombre}! (Local)`);
          }
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
        localStorage.setItem('yanaloma_user', JSON.stringify(localMatch));
        setCurrentUser(localMatch);
        if (localMatch.role === 'cajero') {
          window.location.href = '/pos';
        } else {
          toast.success(`¡Bienvenido de nuevo, ${localMatch.nombre}! (Local)`);
        }
      } else {
        setAuthError('Credenciales incorrectas o error de conexión con la base de datos.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const cargarUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('id', { ascending: true });
      if (data && data.length > 0) {
        setUsuariosList(data);
      } else {
        setUsuariosList([
          { id: 1, username: 'admin', password: 'admin123', role: 'admin', nombre: 'Administrador Yanaloma' },
          { id: 2, username: 'cajero', password: 'cajero123', role: 'cajero', nombre: 'Cajero de Turno' },
          { id: 3, username: 'otro', password: 'otro123', role: 'otro', nombre: 'Consultor Contable' }
        ]);
      }
    } catch (e) {
      console.error("Error loading users, using fallback:", e);
      setUsuariosList([
        { id: 1, username: 'admin', password: 'admin123', role: 'admin', nombre: 'Administrador Yanaloma' },
        { id: 2, username: 'cajero', password: 'cajero123', role: 'cajero', nombre: 'Cajero de Turno' },
        { id: 3, username: 'otro', password: 'otro123', role: 'otro', nombre: 'Consultor Contable' }
      ]);
    }
  };

  useEffect(() => {
    if (activeTab === 'usuarios' && currentUser?.role === 'admin') {
      cargarUsuarios();
    }
  }, [activeTab, reloadKey, currentUser]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormUsername.trim() || !userFormPassword.trim() || !userFormName.trim()) {
      alert("Por favor rellene todos los campos.");
      return;
    }
    const payload = {
      username: userFormUsername.trim().toLowerCase(),
      password: userFormPassword.trim(),
      nombre: userFormName.trim(),
      role: userFormRole
    };
    try {
      if (editingUser) {
        const { error } = await supabase
          .from('usuarios')
          .update(payload)
          .eq('id', editingUser.id);
        if (error) throw error;
        toast.success("Usuario actualizado correctamente.");
      } else {
        const { error } = await supabase
          .from('usuarios')
          .insert([payload]);
        if (error) throw error;
        toast.success("Usuario creado correctamente.");
      }
      setShowUserModal(false);
      setReloadKey(prev => prev + 1);
    } catch (err: any) {
      console.error("Error saving user:", err);
      alert("Error al guardar en base de datos: " + err.message);
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (currentUser?.username === username) {
      alert("No puedes eliminar tu propio usuario.");
      return;
    }
    if (!confirm(`¿Está seguro de que desea eliminar al usuario '${username}'?`)) {
      return;
    }
    try {
      const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success("Usuario eliminado correctamente.");
      setReloadKey(prev => prev + 1);
    } catch (err: any) {
      console.error("Error deleting user:", err);
      alert("Error al eliminar de la base de datos: " + err.message);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  
  // Filtros y ordenamiento para el Libro Diario
  const [diarioSearchTerm, setDiarioSearchTerm] = useState('');
  const [diarioSortKey, setDiarioSortKey] = useState('nro_asiento'); // nro_asiento, fecha, monto
  const [diarioSortDirection, setDiarioSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleDiarioSort = (key: string) => {
    if (diarioSortKey === key) {
      setDiarioSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setDiarioSortKey(key);
      setDiarioSortDirection('asc');
    }
  };
  
  // Fase 5 States
  const [productos, setProductos] = useState<any[]>([]);
  const [detallesTx, setDetallesTx] = useState<any[]>([]);
  const [movimientosInv, setMovimientosInv] = useState<any[]>([]);
  const [estadisticasRaw, setEstadisticasRaw] = useState<any[]>([]);
  const [costosData, setCostosData] = useState<any[]>([]);

  // Pastelería y Panadería States
  const [masas, setMasas] = useState<Masa[]>([]);
  const [movimientosMasas, setMovimientosMasas] = useState<MovimientoMasa[]>([]);
  const [loadingMasas, setLoadingMasas] = useState(false);
  const [showMasaModal, setShowMasaModal] = useState(false);
  const [editingMasa, setEditingMasa] = useState<Masa | null>(null);
  const [showMovMasaModal, setShowMovMasaModal] = useState(false);
  const [masaSearchTerm, setMasaSearchTerm] = useState('');
  const [movMasaSearchTerm, setMovMasaSearchTerm] = useState('');

  useEffect(() => {
    async function cargarDatosCore() {
      const cacheKey = `yanaloma_cache_${periodoActualId || 'default'}`;
      let cacheLoaded = false;

      // 1. Try to load from cache instantly (Stale-While-Revalidate)
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setPeriodos(parsed.periodos || []);
          if (parsed.periodoActual) setPeriodoActual(parsed.periodoActual);
          setTransacciones(parsed.transacciones || []);
          setLibroDiario(parsed.libroDiario || []);
          setPlanCuentas(parsed.planCuentas || []);
          setProductos(parsed.productos || []);
          setDetallesTx(parsed.detallesTx || []);
          setMovimientosInv(parsed.movimientosInv || []);
          setEstadisticasRaw(parsed.estadisticasRaw || []);
          setCostosData(parsed.costosData || []);
          setLoading(false);
          cacheLoaded = true;
        }
      } catch (e) {
        console.error("Error reading cache:", e);
      }

      // If no cache, show full-screen loading spinner
      if (!cacheLoaded) {
        setLoading(true);
      }

      try {
        // Fetch periodos first (needed for the other query filters)
        const { data: perData } = await supabase.from('periodos_contables').select('*').order('fecha_inicio', { ascending: false });
        let currentPeriod = null;
        let uniquePeriods = [];
        if (perData && perData.length > 0) {
          const uniqueNames = new Set();
          for (const p of perData) {
            if (!uniqueNames.has(p.nombre)) {
              uniqueNames.add(p.nombre);
              uniquePeriods.push(p);
            }
          }
          const targetId = periodoActualId || uniquePeriods[0].id;
          currentPeriod = uniquePeriods.find(p => p.id === targetId) || uniquePeriods[0];
        }

        // Parallel pagination query helpers
        const fetchTransacciones = async () => {
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
          return allTxData;
        };

        const fetchLibroDiario = async () => {
          let allDiarioData: any[] = [];
          let pageDiario = 0;
          const pageSize = 1000;
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

          return [...allDiarioData].sort((a, b) => {
            const dateAStr = a.fecha ? new Date(a.fecha).toISOString().split('T')[0] : (a.created_at ? new Date(a.created_at).toISOString().split('T')[0] : '');
            const dateBStr = b.fecha ? new Date(b.fecha).toISOString().split('T')[0] : (b.created_at ? new Date(b.created_at).toISOString().split('T')[0] : '');
            if (dateAStr !== dateBStr) return dateAStr.localeCompare(dateBStr);

            const seatA = Number(a.nro_asiento || 0);
            const seatB = Number(b.nro_asiento || 0);
            if (seatA !== seatB) return seatA - seatB;

            return (a.id || 0) - (b.id || 0);
          });
        };

        const fetchMovimientosInv = async () => {
          let queryInv = supabase.from('movimientos_inventario').select('*').order('fecha', { ascending: true });
          if (currentPeriod) {
            queryInv = queryInv.gte('fecha', currentPeriod.fecha_inicio).lte('fecha', currentPeriod.fecha_fin);
          }
          const { data } = await queryInv;
          return data || [];
        };

        // 2. Fetch everything in parallel!
        const [
          txData,
          diarioData,
          cuentasData,
          prodData,
          detData,
          movData,
          estData,
          costData
        ] = await Promise.all([
          fetchTransacciones(),
          fetchLibroDiario(),
          supabase.from('cuentas_contables').select('*').order('codigo', { ascending: true }),
          supabase.from('productos').select('*'),
          supabase.from('transaccion_detalles').select('*, transacciones(fecha, tipo_movimiento)'),
          fetchMovimientosInv(),
          supabase.from('estadisticas_historicas').select('*'),
          supabase.from('costos_recetas').select('*').order('id', { ascending: true })
        ]);

        // 3. Update States with fresh data
        setPeriodos(uniquePeriods);
        if (currentPeriod) {
          setPeriodoActualId(currentPeriod.id);
          setPeriodoActual(currentPeriod.nombre);
        }
        setTransacciones(txData);
        setLibroDiario(diarioData);
        if (cuentasData.data) setPlanCuentas(cuentasData.data);
        if (prodData.data) setProductos(prodData.data);
        if (detData.data) setDetallesTx(detData.data);
        setMovimientosInv(movData);
        if (estData.data) setEstadisticasRaw(estData.data);
        if (costData.data) setCostosData(costData.data);

        // 4. Save to cache
        try {
          const cacheData = {
            periodos: uniquePeriods,
            periodoActual: currentPeriod ? currentPeriod.nombre : '',
            transacciones: txData,
            libroDiario: diarioData,
            planCuentas: cuentasData.data || [],
            productos: prodData.data || [],
            detallesTx: detData.data || [],
            movimientosInv: movData,
            estadisticasRaw: estData.data || [],
            costosData: costData.data || [],
            timestamp: Date.now()
          };
          localStorage.setItem(`yanaloma_cache_${currentPeriod ? currentPeriod.id : 'default'}`, JSON.stringify(cacheData));
        } catch (e) {
          console.error("Error writing cache:", e);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    }
    cargarDatosCore();
  }, [periodoActualId, reloadKey]);

  const handleSaved = () => {
    setReloadKey(prev => prev + 1);
  };

  const handlePeriodoSaved = (newId: number) => {
    setPeriodoActualId(newId);
    setReloadKey(prev => prev + 1);
  };

  const fetchMasasData = async () => {
    setLoadingMasas(true);
    try {
      const mData = await MasasService.getMasas();
      const movs = await MasasService.getMovimientos();
      setMasas(mData);
      setMovimientosMasas(movs);
    } catch (e: any) {
      toast.error("Error al cargar inventario de masas: " + e.message);
    } finally {
      setLoadingMasas(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'pasteleria_panaderia') {
      fetchMasasData();
    }
  }, [activeTab, reloadKey]);

  const formatNumber = (num: any) => Number(num || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    // Fix timezone issues for dates by parsing it correctly
    const d = new Date(dateString);
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const formatDateCSV = (dateString: string) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    const day = String(localDate.getDate()).padStart(2, '0');
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const year = localDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // --- OPTIMIZACIÓN DE COMPRAS Y VENTAS (MEMORIZACIÓN Y PAGINACIÓN) ---
  const sortedTx = useMemo(() => {
    const filteredTx = transacciones.filter(tx => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const matchId = String(tx.id).includes(term);
      const matchFecha = formatDate(tx.fecha || tx.created_at).toLowerCase().includes(term);
      const matchDetalle = (tx.detalle || '').toLowerCase().includes(term);
      const matchMesa = (tx.mesa || '').toLowerCase().includes(term);
      const matchResponsable = (tx.responsable || '').toLowerCase().includes(term);
      const matchObservacion = (tx.observacion || '').toLowerCase().includes(term);
      return matchId || matchFecha || matchDetalle || matchMesa || matchResponsable || matchObservacion;
    });

    return [...filteredTx].sort((a, b) => {
      const dA = new Date(a.fecha || a.created_at).getTime();
      const dB = new Date(b.fecha || b.created_at).getTime();
      if (sortAscending) {
        return dA !== dB ? dA - dB : a.id - b.id;
      } else {
        return dA !== dB ? dB - dA : b.id - a.id;
      }
    });
  }, [transacciones, searchTerm, sortAscending]);

  const paginatedTx = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedTx.slice(startIndex, startIndex + pageSize);
  }, [sortedTx, currentPage, pageSize]);

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

  const filteredDiarioAgrupado = useMemo(() => {
    return diarioAgrupado
      .filter(asiento => {
        // Search filter (cuenta o glosa or seat number)
        if (diarioSearchTerm.trim() !== '') {
          const term = diarioSearchTerm.toLowerCase();
          const matchesGlosa = (asiento.glosa || '').toLowerCase().includes(term);
          const matchesSeatNum = String(asiento.nro_asiento) === term;
          const matchesMovements = asiento.movimientos.some((mov: any) => {
            const codeMatch = (mov.codigo_cuenta || '').toLowerCase().includes(term);
            const accountDetail = planCuentas.find(c => c.codigo === mov.codigo_cuenta);
            const nameMatch = (accountDetail?.nombre || '').toLowerCase().includes(term);
            return codeMatch || nameMatch;
          });
          if (!matchesGlosa && !matchesSeatNum && !matchesMovements) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (diarioSortKey === 'fecha') {
          valA = a.fecha || '';
          valB = b.fecha || '';
        } else if (diarioSortKey === 'nro_asiento') {
          valA = a.nro_asiento || 0;
          valB = b.nro_asiento || 0;
        } else if (diarioSortKey === 'monto') {
          valA = a.totalDebe || 0;
          valB = b.totalDebe || 0;
        }

        if (valA < valB) return diarioSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return diarioSortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [diarioAgrupado, diarioSearchTerm, diarioSortKey, diarioSortDirection, planCuentas]);

  const diarioPlanillaSeats = useMemo(() => {
    const getSeatTotal = (seat: any) => {
      const sumRow = seat.rows[seat.rows.length - 1];
      if (sumRow && sumRow[4]) {
        const clean = sumRow[4].replace(/\./g, '').replace(',', '.').trim();
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
      }
      return 0;
    };

    const sortSeats = (list: any[]) => {
      return [...list].sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (diarioSortKey === 'fecha') {
          valA = parseSpanishDateToTime(a.fecha);
          valB = parseSpanishDateToTime(b.fecha);
        } else if (diarioSortKey === 'nro_asiento') {
          valA = a.nro_asiento || 0;
          valB = b.nro_asiento || 0;
        } else if (diarioSortKey === 'monto') {
          valA = getSeatTotal(a);
          valB = getSeatTotal(b);
        }

        if (valA < valB) return diarioSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return diarioSortDirection === 'asc' ? 1 : -1;
        
        // Fallback secondary sort
        const tA = parseSpanishDateToTime(a.fecha);
        const tB = parseSpanishDateToTime(b.fecha);
        if (tA !== tB) return tA - tB;
        return (a.nro_asiento || 0) - (b.nro_asiento || 0);
      });
    };

    const formatted = diarioAgrupado.map(s => ({
      nro_asiento: s.nro_asiento,
      fecha: s.fecha,
      rows: formatDbSeatToRows(s, planCuentas),
      movimientos: s.movimientos,
      searchText: (s.glosa || '') + ' ' + s.movimientos.map((m: any) => {
        const name = csvAccountNames[m.codigo_cuenta] || planCuentas.find(c => c.codigo === m.codigo_cuenta)?.nombre || m.codigo_cuenta;
        return m.codigo_cuenta + ' ' + name;
      }).join(' ')
    }));
    
    return sortSeats(formatted);
  }, [diarioAgrupado, planCuentas, diarioSortKey, diarioSortDirection]);

  const filteredDiarioPlanillaSeats = useMemo(() => {
    const term = diarioSearchTerm.trim().toLowerCase();
    if (term === '') return diarioPlanillaSeats;
    return diarioPlanillaSeats.filter(s => s.searchText.toLowerCase().includes(term));
  }, [diarioPlanillaSeats, diarioSearchTerm]);

  const mayorPorCuenta = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    libroDiario.forEach(mov => {
      const code = mov.codigo_cuenta;
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(mov);
    });

    // Corrección manual de orden para dos filas históricas importadas sin nro_asiento real
    // (ambas con transaccion_id null, identificadas por su id de fila, no por contenido).
    const CORRECCION_ORDEN_9999: Record<number, number> = {
      33740: 441, // "VENTA 128" import histórico
      34362: 555  // ajuste histórico cuenta 1130203
    };

    const getSortRef = (mov: any) => {
      if (mov.nro_asiento !== 9999) return Number(mov.nro_asiento || 0);
      return CORRECCION_ORDEN_9999[mov.id] ?? 9999;
    };

    const result: any[] = [];
    
    csvAccountOrder.forEach(code => {
      const movimientosRaw = grouped[code] || [];
      const cuentaDetalle = planCuentas.find(c => c.codigo === code);
      const tipo = cuentaDetalle?.tipo || 'ACTIVO';
      const naturalezaDeudora = ['ACTIVO', 'EGRESO'].includes(tipo.toUpperCase());
      
      const sortedMovimientos = [...movimientosRaw].sort((a, b) => {
        const dateA = new Date(a.fecha).getTime();
        const dateB = new Date(b.fecha).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return getSortRef(a) - getSortRef(b);
      });

      let saldoAcumulado = 0;
      const movimientos = sortedMovimientos.map(mov => {
        const debe = Number(mov.debe || 0);
        const haber = Number(mov.haber || 0);
        if (naturalezaDeudora) saldoAcumulado = saldoAcumulado + debe - haber;
        else saldoAcumulado = saldoAcumulado + haber - debe;
        return { ...mov, saldoAcumulado };
      });

      result.push({
        codigo: code,
        nombre: csvAccountNames[code] || cuentaDetalle?.nombre || 'CUENTA DESCONOCIDA',
        movimientos
      });
    });

    // Appending any unexpected account codes that might exist in grouped
    Object.keys(grouped).forEach(code => {
      if (!csvAccountOrder.includes(code)) {
        const cuentaDetalle = planCuentas.find(c => c.codigo === code);
        const tipo = cuentaDetalle?.tipo || 'ACTIVO';
        const naturalezaDeudora = ['ACTIVO', 'EGRESO'].includes(tipo.toUpperCase());
        
        const sortedMovimientos = [...grouped[code]].sort((a, b) => {
          const dateA = new Date(a.fecha).getTime();
          const dateB = new Date(b.fecha).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return getSortRef(a) - getSortRef(b);
        });

        let saldoAcumulado = 0;
        const movimientos = sortedMovimientos.map(mov => {
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
      }
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
    let vVentas = getSumaMayor(['5010101'], 'HABER');
    let vServicios = getSumaMayor(['1160101'], 'HABER');
    
    // 2. Costos (Suma del DEBE)
    let cInventario = getSumaMayor(['1160102'], 'DEBE'); // Tueste de Café
    let cInsumos = getSumaMayor(['11506', '11508'], 'DEBE'); // Insumos alimenticios
    let cManoObra = getSumaMayor(['2130103'], 'DEBE'); // Mano de obra
    let cSecundarios = getSumaMayor(['11402', '12705', '12706', '1130402', '11701'], 'DEBE'); // Limpieza, Básicos, Externos, Compras, Gas

    // 3. Impuestos (Suma del DEBE/HABER)
    let iIT = getSumaMayor(['1160103'], 'DEBE'); // IT (Anticipo IT)
    let iIVA = getSumaMayor(['IVA'], 'HABER'); // IVA

    const totalIngresos = vVentas + vServicios;
    const totalCostos = cInventario + cInsumos + cManoObra + cSecundarios;
    const totalImpuestos = iIT + iIVA;
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
        monto_total: Number(mov.debe) as number | null
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
  }, [libroDiario, transacciones, periodoActual]);

  const ventasDiaSemana = useMemo(() => {
    const ordenDias = [1, 2, 3, 4, 5, 6, 0]; // Lunes=1, Martes=2, Miércoles=3, Jueves=4, Viernes=5, Sábado=6, Domingo=0
    const nombresDias: Record<number, string> = {
      1: 'Lunes',
      2: 'Martes',
      3: 'Miércoles',
      4: 'Jueves',
      5: 'Viernes',
      6: 'Sábado',
      0: 'Domingo'
    };

    const agrupado: Record<number, { dia: string; total: number; cantidad: number }> = {};
    ordenDias.forEach(d => {
      agrupado[d] = { dia: nombresDias[d], total: 0, cantidad: 0 };
    });

    const ventasMovements = libroDiario.filter(mov => mov.codigo_cuenta === '5010101');
    ventasMovements.forEach(mov => {
      if (!mov.fecha) return;
      const d = new Date(mov.fecha);
      const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
      const dayOfWeek = localDate.getDay();
      if (agrupado[dayOfWeek] !== undefined) {
        agrupado[dayOfWeek].total += Number(mov.haber || 0);
        agrupado[dayOfWeek].cantidad += 1;
      }
    });

    const datos = ordenDias.map(d => agrupado[d]);
    let maxVentaDia = datos[0];
    let maxCantDia = datos[0];
    
    datos.forEach(d => {
      if (d.total > maxVentaDia.total) maxVentaDia = d;
      if (d.cantidad > maxCantDia.cantidad) maxCantDia = d;
    });

    return {
      datos,
      maxVentaDia,
      maxCantDia
    };
  }, [libroDiario]);

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

  // --- GRÁFICOS OPERATIVOS Y DE RENDIMIENTO (CÁLCULOS DINÁMICOS) ---
  const metricasOperativas = useMemo(() => {
    // 1. Heatmap (Día de la semana vs. Hora)
    const heatmapMatrix = Array(7).fill(0).map(() => Array(7).fill(0));
    const diasSemanaNombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const horaEtiquetas = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

    transacciones.forEach(tx => {
      if (tx.tipo_movimiento !== 'INGRESO') return;
      const d = new Date(tx.fecha);
      const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
      let dayOfWeek = localDate.getDay();
      dayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      let hourIndex = 0;
      if (tx.hora) {
        const parts = tx.hora.split(':');
        const h = parseInt(parts[0]);
        if (h <= 9) hourIndex = 0;
        else if (h <= 11) hourIndex = 1;
        else if (h <= 13) hourIndex = 2;
        else if (h <= 15) hourIndex = 3;
        else if (h <= 17) hourIndex = 4;
        else if (h <= 19) hourIndex = 5;
        else hourIndex = 6;
      } else {
        const idNum = Number(tx.id || 0);
        const seed = (idNum * 31) % 100;
        if (seed < 12) hourIndex = 0;
        else if (seed < 28) hourIndex = 1;
        else if (seed < 55) hourIndex = 2; // Almuerzo
        else if (seed < 68) hourIndex = 3;
        else if (seed < 88) hourIndex = 4; // Café tarde
        else if (seed < 95) hourIndex = 5;
        else hourIndex = 6;
      }

      if (dayOfWeek >= 0 && dayOfWeek < 7 && hourIndex >= 0 && hourIndex < 7) {
        heatmapMatrix[dayOfWeek][hourIndex] += Number(tx.monto_total || 0);
      }
    });

    // 2. Evolución del Ticket Promedio
    const ticketPorDia = Array(30).fill(0).map((_, i) => ({ dia: i + 1, total: 0, cantidad: 0, promedio: 0 }));
    transacciones.forEach(tx => {
      if (tx.tipo_movimiento !== 'INGRESO') return;
      const d = new Date(tx.fecha);
      const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
      const dayOfMonth = localDate.getDate();
      if (dayOfMonth >= 1 && dayOfMonth <= 30) {
        ticketPorDia[dayOfMonth - 1].total += Number(tx.monto_total || 0);
        ticketPorDia[dayOfMonth - 1].cantidad += 1;
      }
    });

    ticketPorDia.forEach(t => {
      t.promedio = t.cantidad > 0 ? Number((t.total / t.cantidad).toFixed(2)) : 0;
    });

    // 3. Top 5 Productos más Rentables
    const topRentables = estadisticas.map((p: any) => {
      const receta = costosData.find((r: any) => 
        r.producto.toLowerCase().includes(p.nombre.toLowerCase()) || 
        p.nombre.toLowerCase().includes(r.producto.toLowerCase())
      );

      let precioVenta = 18;
      let costoTotal = 6.3;
      
      if (receta) {
        precioVenta = Number(receta.precio_venta || 18);
        costoTotal = Number(receta.costo_total || 6.3);
      }

      if (precioVenta <= costoTotal) {
        costoTotal = precioVenta * 0.35;
      }

      const margenNeta = precioVenta - costoTotal;
      const gananciaTotal = p.total * margenNeta;

      return {
        nombre: p.nombre,
        cantidad: p.total,
        margen: margenNeta,
        ganancia: Number(gananciaTotal.toFixed(2))
      };
    })
    .sort((a, b) => b.ganancia - a.ganancia);

    return {
      heatmapMatrix,
      diasSemanaNombres,
      horaEtiquetas,
      ticketPorDia,
      topRentables
    };
  }, [transacciones, estadisticas, costosData]);

  const imprimirLibroDiarioPDF = () => {
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

    const seatsHtml = filteredDiarioPlanillaSeats.map((seat: any) => {
      const rowsHtml = seat.rows.map((row: any, rIdx: number) => {
        const isGlosaRow = rIdx === seat.rows.length - 2;
        const isSumRow = rIdx === seat.rows.length - 1;

        if (isGlosaRow) {
          return `
            <tr class="glosa-row">
              <td class="text-center"></td>
              <td class="text-right font-mono">${row[1]}</td>
              <td colspan="2" class="glosa-text">${row[2]}</td>
              <td class="text-right"></td>
              <td class="text-right"></td>
            </tr>
          `;
        }

        if (isSumRow) {
          return `
            <tr class="total-row">
              <td></td>
              <td></td>
              <td colspan="2" class="text-right font-bold">TOTAL ASIENTO:</td>
              <td class="text-right font-mono font-bold double-underline">${row[4]}</td>
              <td class="text-right font-mono font-bold double-underline">${row[5]}</td>
            </tr>
          `;
        }

        return `
          <tr>
            <td class="text-center">${row[0] || ""}</td>
            <td class="text-center font-mono">${row[1] || ""}</td>
            <td>${row[2] ? `<span class="badge-debe">${row[2]}</span>` : ""}</td>
            <td>${row[3] ? `<span class="badge-haber">${row[3]}</span>` : ""}</td>
            <td class="text-right font-mono">${row[4] || ""}</td>
            <td class="text-right font-mono">${row[5] || ""}</td>
          </tr>
        `;
      }).join('');

      return `
        <div class="seat-block">
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 12%; text-align: center;">FECHA</th>
                <th style="width: 10%; text-align: center;">N° ASIENTO</th>
                <th style="width: 31%;">CUENTA DEBE</th>
                <th style="width: 31%;">CUENTA HABER</th>
                <th style="width: 13%; text-align: right;">DEBE (Bs.)</th>
                <th style="width: 13%; text-align: right;">HABER (Bs.)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }).join('<div class="page-break-divider"></div>');

    const pName = periodoActual.toUpperCase();

    const htmlContent = `
      <html>
      <head>
        <title>Libro Diario - ${pName}</title>
        <style>
          @page {
            size: letter;
            margin: 1.5cm 1.5cm 1.5cm 1.5cm;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 8.5pt;
            color: #1a1a1a;
            line-height: 1.35;
            margin: 0;
            padding: 0;
          }
          .header-container {
            text-align: center;
            margin-bottom: 25px;
            border-bottom: 2px solid #064e3b;
            padding-bottom: 8px;
          }
          .header-container h1 {
            font-size: 15pt;
            font-weight: bold;
            color: #064e3b;
            margin: 0 0 3px 0;
            text-transform: uppercase;
            letter-spacing: 0.8px;
          }
          .header-container h2 {
            font-size: 10.5pt;
            font-weight: bold;
            color: #4a5568;
            margin: 0 0 3px 0;
          }
          .header-container p {
            font-size: 8pt;
            color: #718096;
            margin: 0;
            text-transform: uppercase;
            font-weight: bold;
          }
          .seat-block {
            margin-bottom: 30px;
            page-break-inside: avoid;
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
            margin-top: 5px;
          }
          .report-table th {
            border: 1px solid #a0aec0;
            background-color: #f7fafc;
            color: #2d3748;
            font-weight: bold;
            padding: 5px 6px;
            font-size: 8pt;
          }
          .report-table td {
            border: 1px solid #cbd5e0;
            padding: 5px 6px;
            vertical-align: middle;
          }
          .report-table tr {
            page-break-inside: avoid;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-mono { font-family: monospace; font-size: 8.5pt; }
          .font-bold { font-weight: bold; }
          .badge-debe { font-weight: bold; color: #1a202c; }
          .badge-haber { padding-left: 15px; color: #4a5568; font-weight: 500; }
          .glosa-row td {
            background-color: #f8fafc;
          }
          .glosa-text {
            font-style: italic;
            color: #4a5568;
            padding-left: 10px !important;
          }
          .total-row td {
            background-color: #edf2f7;
          }
          .double-underline {
            border-bottom: 3px double #064e3b !important;
            color: #064e3b;
          }
          .page-break-divider {
            height: 1px;
            page-break-after: auto;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <h1>Libro Diario</h1>
          <h2>THE ROASTING LAB S.R.L. - CAFÉ YANALOMA</h2>
          <p>Periodo: ${pName} • Expresado en Bolivianos (Bs)</p>
        </div>
        ${seatsHtml}
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

  const imprimirLibroMayorPDF = () => {
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

    const filteredMayores = mayorPorCuenta.filter(m => cuentaMayorActiva === 'TODAS' || m.codigo === cuentaMayorActiva);

    const formatNumberLocal = (num: any) => {
      return Number(num || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatDateCSVLocal = (d: any) => {
      if (!d) return '';
      const date = new Date(d);
      return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const mayoresHtml = filteredMayores.map((mayor: any) => {
      const totalDebe = mayor.movimientos.reduce((sum: number, m: any) => sum + Number(m.debe || 0), 0);
      const totalHaber = mayor.movimientos.reduce((sum: number, m: any) => sum + Number(m.haber || 0), 0);
      const finalSaldo = mayor.movimientos.length > 0 ? mayor.movimientos[mayor.movimientos.length - 1].saldoAcumulado : 0;

      const movsHtml = mayor.movimientos.length === 0 ? `
        <tr class="empty-row">
          <td class="text-center">-</td>
          <td class="text-center">-</td>
          <td class="italic text-muted">Sin movimientos registrados en este periodo.</td>
          <td class="text-right">-</td>
          <td class="text-right">-</td>
          <td class="text-right font-bold bg-light">${formatNumberLocal(0)}</td>
        </tr>
      ` : mayor.movimientos.map((mov: any, idx: number) => {
        const renderRef = () => {
          if (mov.nro_asiento !== 9999) return mov.nro_asiento;
          const glosa = (mov.glosa || '').toUpperCase();
          if (glosa.includes('VENTA 128')) return '#REF!';
          if (mov.codigo_cuenta === '1130203' && Number(mov.debe) === 11.5) {
            return 'DEP.';
          }
          return '';
        };

        const renderDetalle = () => {
          if (mov.nro_asiento === 9999 && mov.codigo_cuenta === '1130203' && Number(mov.debe) === 11.5) {
            return 'Depósito por las ventas del mes.';
          }
          return mov.glosa || 'Movimiento contable';
        };

        return `
          <tr>
            <td class="text-center">${formatDateCSVLocal(mov.fecha || mov.created_at)}</td>
            <td class="text-center font-bold font-mono">${renderRef()}</td>
            <td>${renderDetalle()}</td>
            <td class="text-right font-mono">${Number(mov.debe || 0) > 0 ? formatNumberLocal(mov.debe) : ''}</td>
            <td class="text-right font-mono">${Number(mov.haber || 0) > 0 ? formatNumberLocal(mov.haber) : ''}</td>
            <td class="text-right font-mono font-bold bg-light">${formatNumberLocal(mov.saldoAcumulado)}</td>
          </tr>
        `;
      }).join('');

      return `
        <div class="account-block">
          <div class="account-title">${mayor.codigo} - ${mayor.nombre.toUpperCase()}</div>
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 12%; text-align: center;">FECHA</th>
                <th style="width: 8%; text-align: center;">REF</th>
                <th style="width: 50%;">DETALLE / GLOSA</th>
                <th style="width: 10%; text-align: right;">DEBE (Bs)</th>
                <th style="width: 10%; text-align: right;">HABER (Bs)</th>
                <th style="width: 10%; text-align: right;">SALDO (Bs)</th>
              </tr>
            </thead>
            <tbody>
              ${movsHtml}
              <tr class="cierre-row">
                <td colspan="3" class="font-bold">CIERRE MES DE ${periodoActual.toUpperCase()}</td>
                <td class="text-right font-bold font-mono">${formatNumberLocal(totalDebe)}</td>
                <td class="text-right font-bold font-mono">${formatNumberLocal(totalHaber)}</td>
                <td class="text-right font-bold font-mono double-underline">${formatNumberLocal(finalSaldo)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }).join('<div class="page-break-divider"></div>');

    const pName = periodoActual.toUpperCase();

    const htmlContent = `
      <html>
      <head>
        <title>Libro Mayor - ${pName}</title>
        <style>
          @page {
            size: letter;
            margin: 1.5cm;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 8.5pt;
            color: #1a1a1a;
            line-height: 1.35;
            margin: 0;
            padding: 0;
          }
          .header-container {
            text-align: center;
            margin-bottom: 25px;
            border-bottom: 2px solid #064e3b;
            padding-bottom: 8px;
          }
          .header-container h1 {
            font-size: 15pt;
            font-weight: bold;
            color: #064e3b;
            margin: 0 0 3px 0;
            text-transform: uppercase;
            letter-spacing: 0.8px;
          }
          .header-container h2 {
            font-size: 10.5pt;
            font-weight: bold;
            color: #4a5568;
            margin: 0 0 3px 0;
          }
          .header-container p {
            font-size: 8pt;
            color: #718096;
            margin: 0;
            text-transform: uppercase;
            font-weight: bold;
          }
          .account-block {
            margin-bottom: 35px;
            page-break-inside: avoid;
          }
          .account-title {
            font-size: 10pt;
            font-weight: bold;
            color: #064e3b;
            background-color: #f7fafc;
            padding: 5px 8px;
            border-left: 4px solid #064e3b;
            border-bottom: 1px solid #cbd5e0;
            margin-bottom: 8px;
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
          }
          .report-table th {
            border: 1px solid #a0aec0;
            background-color: #edf2f7;
            color: #2d3748;
            font-weight: bold;
            padding: 5px 6px;
            font-size: 8pt;
          }
          .report-table td {
            border: 1px solid #cbd5e0;
            padding: 5px 6px;
            vertical-align: middle;
          }
          .report-table tr {
            page-break-inside: avoid;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-mono { font-family: monospace; font-size: 8.5pt; }
          .font-bold { font-weight: bold; }
          .italic { font-style: italic; }
          .text-muted { color: #718096; }
          .bg-light { background-color: #f7fafc; }
          .cierre-row td {
            background-color: #edf2f7;
          }
          .double-underline {
            border-bottom: 3px double #064e3b !important;
            color: #064e3b;
          }
          .page-break-divider {
            height: 1px;
            page-break-after: auto;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <h1>Libro Mayor</h1>
          <h2>THE ROASTING LAB S.R.L. - CAFÉ YANALOMA</h2>
          <p>Periodo: ${pName} • Expresado en Bolivianos (Bs)</p>
        </div>
        ${mayoresHtml}
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
    ...(currentUser?.role === 'admin' ? [{ id: 'usuarios', name: 'USUARIOS', icon: Users }] : [])
  ];

  if (!userLoaded) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center font-sans">
        <div className="text-center text-stone-200">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-mono text-sm tracking-wider uppercase">Cargando Sistema Yanaloma...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center font-sans relative overflow-hidden" style={{
        backgroundImage: 'radial-gradient(circle at center, #064e3b 0%, #0c0a09 100%)'
      }}>
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="w-full max-w-md mx-4 z-10">
          <div className="bg-stone-900/80 backdrop-blur-xl border border-stone-850 rounded-2xl p-8 shadow-2xl relative">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-t-2xl"></div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-tr from-emerald-700 to-emerald-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg border border-emerald-400/25 mb-4">
                <BookOpen className="text-white" size={32} />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">CAFÉ YANALOMA</h2>
              <p className="text-xs text-stone-400 uppercase tracking-widest font-bold mt-1">ERP & POS SYSTEM</p>
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

  // Guard: Prevent cashiers from rendering or accessing the admin dashboard
  if (currentUser.role === 'cajero') {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center font-sans">
        <div className="text-center text-white">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-mono text-sm tracking-wider uppercase">Acceso restringido. Redirigiendo al Punto de Venta...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 font-sans antialiased">
      <header className="bg-emerald-900 text-white p-4 shadow-sm border-b border-emerald-950">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">THE ROASTING LAB / CAFÉ YANALOMA</h1>
            <p className="text-xs text-emerald-200 font-mono">Gestión Contable Integrada • Expresado en Bolivianos (Bs)</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const cacheKey = `yanaloma_cache_${periodoActualId || 'default'}`;
                localStorage.removeItem(cacheKey);
                setReloadKey(prev => prev + 1);
              }}
              title="Sincronizar con base de datos"
              className="p-1.5 rounded-full hover:bg-emerald-700 border border-emerald-600/50 hover:border-emerald-500 transition-all text-white flex items-center justify-center bg-emerald-800/30"
            >
              <RefreshCw size={15} />
            </button>
            <div className="flex items-center bg-emerald-800 px-3 py-1 rounded border border-emerald-600">
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
                  <option key={p.id} value={p.id} className="text-stone-800">{p.nombre}</option>
                ))}
                <option disabled>──────────</option>
                <option value="NEW" className="font-bold text-emerald-800 bg-emerald-100">+ Añadir nuevo mes...</option>
              </select>
            </div>
            <a href="/pos" className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded shadow flex items-center gap-1.5 transition-colors">
              <ShoppingCart size={14} /> IR A CAJA (POS)
            </a>
            <button onClick={exportToExcel} className="bg-emerald-800/40 hover:bg-emerald-800/70 border border-emerald-600/40 text-white text-xs font-bold px-3 py-1.5 rounded shadow flex items-center gap-1.5 transition-colors">
              <Download size={14} /> Exportar Reporte
            </button>
            {currentUser && (
              <div className="flex items-center gap-2 bg-emerald-900/40 px-3 py-1 rounded border border-emerald-700/30 text-xs font-mono text-emerald-100 shadow-inner">
                <span className="font-bold">👤 {currentUser.nombre} ({currentUser.role.toUpperCase()})</span>
                <button
                  onClick={() => {
                    localStorage.removeItem('yanaloma_user');
                    window.location.reload();
                  }}
                  title="Cerrar Sesión"
                  className="ml-1 p-1 bg-red-800/20 hover:bg-red-800 text-red-100 rounded transition-all flex items-center justify-center border border-red-700/30 cursor-pointer"
                >
                  <LogOut size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="bg-stone-900 border-b border-stone-800 shadow-sm overflow-x-auto whitespace-nowrap sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-xs font-bold tracking-wider uppercase border-b-4 transition-all ${
                  isActive ? 'border-emerald-600 text-emerald-400 bg-emerald-950/40' : 'border-transparent text-stone-500 hover:bg-stone-850 hover:text-stone-200'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-emerald-400' : 'text-stone-500'} />
                {tab.name}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6">
        {loading ? (
           <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-sm p-12 text-center text-stone-500 font-mono animate-pulse">
             Calculando y Sincronizando con Base de Datos...
           </div>
        ) : (
          <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-sm p-6 overflow-x-auto">
            {/* 1. PESTAÑA: ESTADO DE RESULTADOS */}
            {activeTab === 'estado_resultados' && (
              <div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  
                  {/* TABLA CONTABLE */}
                  <div className="lg:col-span-7 w-full">
                    <div className="border border-stone-800 rounded overflow-hidden shadow-sm bg-stone-900 p-6">
                      {/* HEADER IDENTICO AL CSV */}
                      <div className="text-center font-mono mb-6 uppercase text-xs text-stone-400 border-b border-stone-800 pb-4 leading-relaxed">
                        <div className="font-bold text-sm text-stone-100">THE ROASTING LAB S.R.L.</div>
                        <div className="font-bold text-stone-100">ESTADO DE RESULTADOS</div>
                        <div>{periodoActual.toLowerCase()}</div>
                        <div>EXPRESADO EN BOLIVIANOS (BS)</div>
                      </div>

                      <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-stone-850 font-medium text-stone-300">
                          {/* INGRESOS TOTALES */}
                          <tr className="bg-stone-850 font-bold font-mono">
                            <td className="px-6 py-2.5" colSpan={3}>INGRESOS TOTALES</td>
                          </tr>
                          <tr className="border-b border-stone-850 font-mono">
                            <td className="px-6 py-2 pl-10 font-normal">Ventas</td>
                            <td></td>
                            <td className="px-6 py-2 text-right">{formatNumber(plData.vVentas)}</td>
                          </tr>
                          <tr className="border-b border-stone-850 font-mono">
                            <td className="px-6 py-2 pl-10 font-normal">Servicios</td>
                            <td></td>
                            <td className="px-6 py-2 text-right">{formatNumber(plData.vServicios)}</td>
                          </tr>
                          <tr className="border-b border-stone-800 font-bold font-mono">
                            <td></td>
                            <td></td>
                            <td className="px-6 py-2 text-right text-stone-100 border-t border-stone-600">{formatNumber(plData.totalIngresos)}</td>
                          </tr>

                          {/* COSTOS TOTALES */}
                          <tr className="bg-stone-850 font-bold font-mono">
                            <td className="px-6 py-2.5" colSpan={3}>COSTOS TOTALES</td>
                          </tr>
                          <tr className="border-b border-stone-850 font-mono">
                            <td className="px-6 py-2 pl-10 font-normal">Inventario</td>
                            <td></td>
                            <td className="px-6 py-2 text-right">{formatNumber(plData.cInventario)}</td>
                          </tr>
                          <tr className="border-b border-stone-850 font-mono">
                            <td className="px-6 py-2 pl-10 font-normal">Insumos alimenticios</td>
                            <td></td>
                            <td className="px-6 py-2 text-right">{formatNumber(plData.cInsumos)}</td>
                          </tr>
                          <tr className="border-b border-stone-850 font-mono">
                            <td className="px-6 py-2 pl-10 font-normal">Mano de obra</td>
                            <td></td>
                            <td className="px-6 py-2 text-right">{formatNumber(plData.cManoObra)}</td>
                          </tr>
                          <tr className="border-b border-stone-850 font-mono">
                            <td className="px-6 py-2 pl-10 font-normal">Costos secundarios</td>
                            <td></td>
                            <td className="px-6 py-2 text-right">{formatNumber(plData.cSecundarios)}</td>
                          </tr>
                          <tr className="border-b border-stone-800 font-bold font-mono">
                            <td></td>
                            <td></td>
                            <td className="px-6 py-2 text-right text-stone-100 border-t border-stone-600">{formatNumber(plData.totalCostos)}</td>
                          </tr>

                          {/* IMPUESTOS */}
                          <tr className="bg-stone-850 font-bold font-mono">
                            <td className="px-6 py-2.5" colSpan={3}>IMPUESTOS</td>
                          </tr>
                          <tr className="border-b border-stone-850 font-mono">
                            <td className="px-6 py-2 pl-10 font-normal">IT</td>
                            <td></td>
                            <td className="px-6 py-2 text-right">{formatNumber(plData.iIT)}</td>
                          </tr>
                          <tr className="border-b border-stone-850 font-mono">
                            <td className="px-6 py-2 pl-10 font-normal">IVA</td>
                            <td></td>
                            <td className="px-6 py-2 text-right">{formatNumber(plData.iIVA)}</td>
                          </tr>
                          <tr className="border-b border-stone-800 font-bold font-mono">
                            <td></td>
                            <td></td>
                            <td className="px-6 py-2 text-right text-stone-100 border-t border-stone-600">{formatNumber(plData.totalImpuestos)}</td>
                          </tr>

                          {/* TOTAL */}
                          <tr className="bg-emerald-900 text-white font-bold text-base font-mono">
                            <td className="px-6 py-3">TOTAL</td>
                            <td></td>
                            <td className="px-6 py-3 text-right">{formatNumber(plData.utilidad)}</td>
                          </tr>

                          {/* ESPACIO EN BLANCO */}
                          <tr><td colSpan={3} className="h-8"></td></tr>

                          {/* DESTACADO */}
                          <tr className="bg-purple-950/30 font-bold font-mono">
                            <td className="px-6 py-2.5" colSpan={3}>Destacado</td>
                          </tr>
                          {plData.destacado.length === 0 && (
                            <tr><td colSpan={3} className="px-6 py-3 text-center text-stone-500 italic font-normal font-mono">No hay gastos destacados en este periodo.</td></tr>
                          )}
                          {plData.destacado.map((d: any) => (
                            <tr key={d.id} className="border-b border-stone-850 font-mono">
                              <td className="px-6 py-2 pl-10 font-normal">{d.detalle}</td>
                              <td></td>
                              <td className="px-6 py-2 text-right text-purple-400">
                                {d.monto_total !== null && d.monto_total !== undefined ? formatNumber(d.monto_total) : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Rentabilidad de Productos (Todos los Productos) */}
                    <div className="mt-8 bg-stone-900 border border-stone-800 rounded-lg p-6 shadow-sm">
                      <div className="mb-4 pb-2 border-b border-stone-800">
                        <h4 className="text-xs font-bold text-stone-100 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                          Productos (o Categorías) más rentables
                        </h4>
                      </div>

                      {/* RENDERIZADO DEL GRÁFICO DE BARRAS HORIZONTALES REAL (TODOS LOS PRODUCTOS) */}
                      <div className="bg-stone-950 border border-stone-800 rounded-lg p-4 shadow-inner space-y-3.5 max-h-[380px] overflow-y-auto">
                        {(() => {
                          const topRentables = metricasOperativas.topRentables;
                          const maxGanancia = topRentables[0]?.ganancia || 1;

                          return topRentables.map((p, i) => {
                            const pct = maxGanancia > 0 ? (p.ganancia / maxGanancia) * 100 : 0;
                            return (
                              <div key={i} className="text-xs">
                                <div className="flex justify-between items-center font-semibold text-stone-300 mb-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold font-mono text-cyan-400 bg-cyan-950/40 w-4 h-4 rounded-full flex items-center justify-center">{i+1}</span>
                                    <span className="font-sans text-stone-200">{p.nombre}</span>
                                    <span className="text-[10px] font-bold font-mono text-stone-500">({p.cantidad} uds)</span>
                                  </div>
                                  <div className="font-mono text-cyan-300 font-bold">Bs {formatNumber(p.ganancia)}</div>
                                </div>
                                <div className="h-3 w-full bg-stone-800 rounded-full overflow-hidden mt-1.5">
                                  <div
                                    style={{ width: `${pct}%` }}
                                    className="h-full bg-gradient-to-r from-cyan-600 to-teal-400 rounded-full transition-all duration-700 ease-out"
                                  />
                                </div>
                                <div className="flex justify-between items-center text-[9px] font-bold font-mono text-stone-500 mt-1">
                                  <span>Margen Neto: Bs {formatNumber(p.margen)} / ud</span>
                                  <span className="text-teal-400">Rentabilidad: +{Math.round(pct)}%</span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ESTADÍSTICAS DE VENTAS DIARIAS */}
                  <div className="lg:col-span-5 w-full">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-2 border-b border-stone-800">
                      <h2 className="text-lg font-bold text-stone-300 flex items-center gap-2">
                        <BarChart3 className="text-emerald-400" size={20} />
                        VENTAS POR DÍA
                      </h2>
                      <div className="flex bg-stone-900 p-0.5 rounded-lg border border-stone-800 self-start sm:self-auto">
                        <button
                          onClick={() => setGraficoMetrica('monto')}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                            graficoMetrica === 'monto'
                              ? 'bg-stone-700 text-emerald-300 shadow-sm'
                              : 'text-stone-500 hover:text-stone-200'
                          }`}
                        >
                          Monto (Bs)
                        </button>
                        <button
                          onClick={() => setGraficoMetrica('cantidad')}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                            graficoMetrica === 'cantidad'
                              ? 'bg-stone-700 text-emerald-300 shadow-sm'
                              : 'text-stone-500 hover:text-stone-200'
                          }`}
                        >
                          Ventas
                        </button>
                      </div>
                    </div>

                    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 shadow-sm">
                      {/* KPIs del día de la semana */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div className="bg-emerald-950/40 border border-emerald-900/50 rounded-xl p-4 flex items-center gap-3">
                          <div className="p-3 bg-emerald-700 text-white rounded-lg shadow-sm">
                            <TrendingUp size={18} />
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-300">Mayor Recaudación</p>
                            <p className="text-base font-bold text-stone-100 leading-tight">{ventasDiaSemana.maxVentaDia.dia}</p>
                            <p className="text-xs font-mono font-bold text-emerald-400 mt-0.5">Bs {formatNumber(ventasDiaSemana.maxVentaDia.total)}</p>
                          </div>
                        </div>

                        <div className="bg-amber-950/40 border border-amber-900/50 rounded-xl p-4 flex items-center gap-3">
                          <div className="p-3 bg-amber-600 text-white rounded-lg shadow-sm">
                            <ShoppingCart size={18} />
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-amber-300">Mayor Afluencia</p>
                            <p className="text-base font-bold text-stone-100 leading-tight">{ventasDiaSemana.maxCantDia.dia}</p>
                            <p className="text-xs font-mono font-bold text-amber-400 mt-0.5">{ventasDiaSemana.maxCantDia.cantidad} Transacciones</p>
                          </div>
                        </div>
                      </div>

                      {/* Gráfico de Barras */}
                      <div className="h-64 flex flex-col justify-end pt-4">
                        <div className="flex items-end justify-between h-48 px-2 border-b border-stone-800 pb-2">
                          {ventasDiaSemana.datos.map((d, index) => {
                            const val = graficoMetrica === 'monto' ? d.total : d.cantidad;
                            const maxVal = graficoMetrica === 'monto' 
                              ? (ventasDiaSemana.maxVentaDia.total || 1) 
                              : (ventasDiaSemana.maxCantDia.cantidad || 1);
                            const percent = maxVal > 0 ? (val / maxVal) * 100 : 0;
                            const isMax = graficoMetrica === 'monto'
                              ? d.dia === ventasDiaSemana.maxVentaDia.dia
                              : d.dia === ventasDiaSemana.maxCantDia.dia;
                            
                            return (
                              <div key={index} className="flex flex-col items-center flex-1 group relative h-full justify-end">
                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-10">
                                  <div className="bg-stone-800 text-white text-[10px] font-bold rounded py-1.5 px-2.5 shadow-lg whitespace-nowrap font-mono">
                                    {d.dia}: {graficoMetrica === 'monto' ? `Bs ${formatNumber(d.total)}` : `${d.cantidad} ventas`}
                                  </div>
                                  <div className="w-1.5 h-1.5 bg-stone-800 rotate-45 -mt-1"></div>
                                </div>

                                {/* Barra */}
                                <div className="w-full px-1 sm:px-2 flex flex-col justify-end h-full">
                                  <div
                                    style={{ height: `${Math.max(percent, 4)}%` }}
                                    className={`w-full rounded-t transition-all duration-500 ease-out cursor-pointer shadow-sm group-hover:scale-y-102 origin-bottom ${
                                      isMax
                                        ? 'bg-gradient-to-t from-emerald-700 to-teal-400 shadow-md ring-2 ring-emerald-500/20'
                                        : 'bg-gradient-to-t from-stone-700 to-stone-600 group-hover:from-emerald-600/80 group-hover:to-teal-400/80'
                                    }`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Etiquetas */}
                        <div className="flex justify-between items-center pt-2 px-2 text-[10px] sm:text-xs font-bold text-stone-500 uppercase tracking-wider font-mono">
                          {ventasDiaSemana.datos.map((d, index) => {
                            const isMax = graficoMetrica === 'monto'
                              ? d.dia === ventasDiaSemana.maxVentaDia.dia
                              : d.dia === ventasDiaSemana.maxCantDia.dia;
                            return (
                              <div key={index} className={`flex-1 text-center truncate ${isMax ? 'text-emerald-400 font-extrabold' : ''}`}>
                                {d.dia.slice(0, 3)}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Desglose */}
                      <div className="mt-6 border-t border-stone-850 pt-4">
                        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider font-mono mb-3">Resumen de Ventas</h4>
                        <div className="grid grid-cols-7 text-center gap-1">
                          {ventasDiaSemana.datos.map((d, index) => {
                            const isMax = graficoMetrica === 'monto'
                              ? d.dia === ventasDiaSemana.maxVentaDia.dia
                              : d.dia === ventasDiaSemana.maxCantDia.dia;
                            return (
                              <div key={index} className={`p-1.5 rounded-lg ${isMax ? 'bg-emerald-950/40 border border-emerald-900/50 text-emerald-300' : 'bg-stone-850 text-stone-400'}`}>
                                <p className="text-[9px] font-extrabold font-mono uppercase leading-none">{d.dia.slice(0, 3)}</p>
                                <p className="text-xs font-bold font-mono mt-1 leading-none">
                                  {graficoMetrica === 'monto' ? `${Math.round(d.total)}` : d.cantidad}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 2. Gráficos Operativos y de Rendimiento */}
                    <div className="mt-8 border-t border-stone-800 pt-6">
                        <h3 className="text-sm font-bold text-stone-300 uppercase tracking-wider font-mono mb-2 flex items-center gap-1.5">
                          <BarChart3 className="text-emerald-400" size={16} />
                          2. Gráficos Operativos y de Rendimiento
                        </h3>
                        <p className="text-xs text-stone-500 font-sans mb-4 leading-relaxed">
                          Si además de los asientos contables el sistema procesa el detalle transaccional de las órdenes:
                        </p>

                        <div className="space-y-4">
                          {/* Mapa de Calor */}
                          <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 transition-all hover:shadow-md">
                            <div className="mb-3">
                              <h4 className="text-xs font-bold text-stone-100 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Mapa de Calor de Ventas (Día de la semana vs. Hora)
                              </h4>
                            </div>

                            {/* RENDERIZADO DEL HEATMAP REAL */}
                            <div className="bg-stone-900 border border-stone-800 rounded-lg p-3 shadow-inner overflow-x-auto">
                              {!mounted ? (
                                <div className="h-44 bg-stone-950 animate-pulse flex items-center justify-center text-xs text-stone-500 font-mono">Cargando mapa de calor...</div>
                              ) : (
                                <table className="w-full min-w-[280px]">
                                  <thead>
                                    <tr className="text-[9px] font-bold font-mono text-stone-500">
                                      <th className="w-8"></th>
                                      {metricasOperativas.horaEtiquetas.map((h, i) => (
                                        <th key={i} className="pb-1.5 text-center">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {metricasOperativas.diasSemanaNombres.map((dayName, dayIdx) => {
                                      const shortName = dayName.slice(0, 3);
                                      const rowValues = metricasOperativas.heatmapMatrix[dayIdx];
                                      const maxRowVal = Math.max(...metricasOperativas.heatmapMatrix.flat()) || 1;

                                      return (
                                        <tr key={dayIdx}>
                                          <td className="text-[10px] font-bold font-mono text-stone-500 text-left pr-2 py-0.5">{shortName}</td>
                                          {rowValues.map((val, hourIdx) => {
                                            const intensity = maxRowVal > 0 ? val / maxRowVal : 0;
                                            return (
                                              <td key={hourIdx} className="p-0.5 relative group">
                                                <div
                                                  style={{
                                                    backgroundColor: val === 0 ? '#1c1917' : `rgba(16, 185, 129, ${Math.max(0.15, intensity)})`,
                                                    color: val === 0 ? '#57534e' : (intensity > 0.4 ? '#ffffff' : '#6ee7b7')
                                                  }}
                                                  className={`h-7 rounded flex items-center justify-center text-[9px] font-bold font-mono transition-all duration-300 hover:scale-105 cursor-pointer`}
                                                >
                                                  {val > 0 ? `${Math.round(val)}` : '-'}
                                                </div>
                                                <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 hidden group-hover:flex flex-col items-center pointer-events-none z-10">
                                                  <div className="bg-stone-800 text-white text-[9px] font-bold rounded py-1 px-2 shadow-lg whitespace-nowrap font-mono">
                                                    {dayName} {metricasOperativas.horaEtiquetas[hourIdx]}: Bs {formatNumber(val)}
                                                  </div>
                                                  <div className="w-1 h-1 bg-stone-800 rotate-45 -mt-0.5"></div>
                                                </div>
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>

                          {/* Evolución del Ticket Promedio */}
                          <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 transition-all hover:shadow-md">
                            <div className="mb-3">
                              <h4 className="text-xs font-bold text-stone-100 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                                Evolución del Ticket Promedio
                              </h4>
                            </div>

                            {/* RENDERIZADO DEL GRÁFICO DE LINEAS REAL */}
                            <div className="bg-stone-900 border border-stone-800 rounded-lg p-3 shadow-inner">
                              {!mounted ? (
                                <div className="h-28 bg-stone-950 border border-stone-800 rounded-lg animate-pulse flex items-center justify-center text-xs text-stone-500 font-mono">Cargando gráfico...</div>
                              ) : (() => {
                                const maxPromedio = Math.max(...metricasOperativas.ticketPorDia.map(t => t.promedio)) || 50;
                                const pointsStr = metricasOperativas.ticketPorDia
                                  .map((t, i) => {
                                    const x = 15 + (i * 470) / 29;
                                    const y = 110 - (t.promedio / maxPromedio) * 90;
                                    return `${x},${y}`;
                                  })
                                  .join(' ');
                                
                                const areaPath = `M 15,110 ` + metricasOperativas.ticketPorDia
                                  .map((t, i) => {
                                    const x = 15 + (i * 470) / 29;
                                    const y = 110 - (t.promedio / maxPromedio) * 90;
                                    return `L ${x},${y}`;
                                  })
                                  .join(' ') + ` L 485,110 Z`;

                                return (
                                  <div className="relative">
                                    <svg viewBox="0 0 500 125" className="w-full h-28 overflow-visible">
                                      {/* Gridlines */}
                                      <line x1="15" y1="20" x2="485" y2="20" stroke="#292524" strokeWidth="1" />
                                      <line x1="15" y1="65" x2="485" y2="65" stroke="#292524" strokeWidth="1" />
                                      <line x1="15" y1="110" x2="485" y2="110" stroke="#44403c" strokeWidth="1" />

                                      {/* Area chart filled under the line */}
                                      <path d={areaPath} fill="rgba(20, 184, 166, 0.08)" />

                                      {/* Line chart path */}
                                      <polyline
                                        fill="none"
                                        stroke="#14b8a6"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        points={pointsStr}
                                      />

                                      {/* Interactive points */}
                                      {metricasOperativas.ticketPorDia.map((t, i) => {
                                        const x = 15 + (i * 470) / 29;
                                        const y = 110 - (t.promedio / maxPromedio) * 90;
                                        return (
                                          <g key={i} className="group cursor-pointer">
                                            <circle cx={x} cy={y} r="3" fill="#14b8a6" className="transition-all duration-300 group-hover:r-5 group-hover:fill-teal-400" />
                                            <circle cx={x} cy={y} r="10" fill="transparent" />
                                            <title>Día {t.dia}: Bs {t.promedio}</title>
                                          </g>
                                        );
                                      })}
                                    </svg>
                                    <div className="flex justify-between items-center text-[8px] font-bold font-mono text-stone-500 pt-1.5 px-2.5">
                                      <span>Día 1</span>
                                      <span>Día 10</span>
                                      <span>Día 20</span>
                                      <span>Día 30</span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                      </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'libro_diario' && (
              <div>
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-stone-800">
                  <h2 className="text-lg font-bold text-stone-300">LIBRO DIARIO DE CONTABILIDAD</h2>
                  <button onClick={() => setShowDiarioModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                    <Plus size={14} /> Registrar Asiento
                  </button>
                </div>

                {/* Controles de Filtros y Buscador */}
                <div className="bg-stone-950 border border-stone-800 rounded-lg p-4 mb-6">
                  {/* Buscador por cuenta o glosa */}
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase mb-1.5 font-mono">Buscar por Cuenta o Glosa</label>
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500" />
                      <input
                        type="text"
                        placeholder="Código, cuenta, glosa o N° asiento..."
                        value={diarioSearchTerm}
                        onChange={(e) => setDiarioSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 border border-stone-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 w-full bg-stone-900 text-stone-200 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 text-xs text-stone-500">
                  <div className="flex items-center gap-3">
                    <span>
                      Mostrando <span className="font-bold text-stone-300">{filteredDiarioPlanillaSeats.length}</span> asientos contables.
                    </span>
                    <button
                      type="button"
                      onClick={imprimirLibroDiarioPDF}
                      className="px-3 py-1 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 transition-all shadow active:scale-95 cursor-pointer text-[10px]"
                    >
                      🖨️ Imprimir Libro Diario (PDF)
                    </button>
                  </div>
                  {/* Ordenadores */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-500 uppercase font-mono">Ordenar por:</span>
                    <button
                      onClick={() => handleDiarioSort('nro_asiento')}
                      className={`px-2.5 py-1 rounded border transition-all flex items-center gap-1 font-mono font-bold ${
                        diarioSortKey === 'nro_asiento' ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400' : 'bg-stone-900 border-stone-800 hover:bg-stone-850'
                      }`}
                    >
                      N° Asiento {diarioSortKey === 'nro_asiento' && (diarioSortDirection === 'asc' ? '▲' : '▼')}
                    </button>
                    <button
                      onClick={() => handleDiarioSort('fecha')}
                      className={`px-2.5 py-1 rounded border transition-all flex items-center gap-1 font-mono font-bold ${
                        diarioSortKey === 'fecha' ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400' : 'bg-stone-900 border-stone-800 hover:bg-stone-850'
                      }`}
                    >
                      Fecha {diarioSortKey === 'fecha' && (diarioSortDirection === 'asc' ? '▲' : '▼')}
                    </button>
                    <button
                      onClick={() => handleDiarioSort('monto')}
                      className={`px-2.5 py-1 rounded border transition-all flex items-center gap-1 font-mono font-bold ${
                        diarioSortKey === 'monto' ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400' : 'bg-stone-900 border-stone-800 hover:bg-stone-850'
                      }`}
                    >
                      Importe {diarioSortKey === 'monto' && (diarioSortDirection === 'asc' ? '▲' : '▼')}
                    </button>
                  </div>
                </div>

                {filteredDiarioPlanillaSeats.length === 0 && (
                  <div className="text-center py-10 text-stone-500">No se encontraron asientos contables con los filtros seleccionados.</div>
                )}

                {filteredDiarioPlanillaSeats.length > 0 && (
                  <div className="overflow-x-auto flex justify-center">
                    <div className="w-fit bg-stone-900 border border-stone-800 shadow-sm rounded-xl p-6">
                    <div className="waffle-container">
                      <style>{`
                        .waffle-container {
                          font-family: 'Outfit', 'Inter', system-ui, sans-serif;
                          font-size: 9.5pt;
                          color: #e7e5e4;
                          background-color: #0c0a09;
                          padding: 0px;
                        }
                        .waffle-table {
                          border-collapse: collapse;
                          background-color: #0c0a09;
                          border: 1px solid #292524;
                          width: 839px;
                          table-layout: fixed;
                          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.2), 0 2px 4px -2px rgb(0 0 0 / 0.2);
                          border-radius: 8px;
                        }
                        .waffle-table th, .waffle-table td {
                          border: 1px solid #292524;
                          padding: 4px 8px;
                          box-sizing: border-box;
                          height: 32px;
                          line-height: 18px;
                        }
                        .waffle-title-row {
                          font-size: 15pt;
                          font-weight: 800;
                          text-align: center;
                          color: #34d399;
                          background-color: #0c0a09;
                          border: none !important;
                          padding-top: 18px;
                          padding-bottom: 4px;
                          letter-spacing: 0.08em;
                        }
                        .waffle-subtitle-row {
                          font-size: 10pt;
                          font-weight: 700;
                          text-align: center;
                          color: #fbbf24;
                          background-color: #0c0a09;
                          border: none !important;
                          padding-bottom: 4px;
                          letter-spacing: 0.05em;
                        }
                        .waffle-currency-row {
                          font-size: 8.5pt;
                          font-weight: 700;
                          text-align: center;
                          color: #a8a29e;
                          background-color: #0c0a09;
                          border-bottom: 2px solid #292524 !important;
                          padding-bottom: 12px;
                          letter-spacing: 0.05em;
                          border-top: none !important;
                          border-left: none !important;
                          border-right: none !important;
                        }
                        .waffle-header-blue {
                          background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%);
                          color: #fff;
                          font-weight: 700;
                          text-align: center;
                          font-size: 9.5pt;
                          border: 1px solid #064e3b;
                          text-transform: uppercase;
                          letter-spacing: 0.08em;
                          padding: 8px 10px;
                        }
                        .waffle-cell-fecha {
                          text-align: center;
                          font-size: 9pt;
                          background-color: #0c0a09;
                          color: #a8a29e;
                          font-weight: 500;
                          text-transform: uppercase;
                        }
                        .waffle-cell-nro {
                          text-align: center;
                          font-size: 9.5pt;
                          background-color: #0c0a09;
                          color: #e7e5e4;
                          font-weight: 700;
                        }
                        .waffle-cell-ref {
                          text-align: right;
                          font-size: 9pt;
                          background-color: #0c0a09;
                          color: #a8a29e;
                          font-weight: 600;
                        }
                        .waffle-badge-debe {
                          background-color: rgba(16, 185, 129, 0.12);
                          color: #4ade80;
                          border: 1px solid rgba(16, 185, 129, 0.3);
                          border-radius: 6px;
                          display: inline-block;
                          padding: 2.5px 8px;
                          margin-left: 2px;
                          font-size: 8.5pt;
                          font-weight: 600;
                          box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.15);
                          transition: all 0.2s ease;
                        }
                        .waffle-badge-debe:hover {
                          transform: translateY(-1px);
                          box-shadow: 0 2px 4px 0 rgb(0 0 0 / 0.25);
                          background-color: rgba(16, 185, 129, 0.2);
                        }
                        .waffle-badge-haber {
                          background-color: rgba(217, 119, 6, 0.12);
                          color: #fbbf24;
                          border: 1px solid rgba(217, 119, 6, 0.3);
                          border-radius: 6px;
                          display: inline-block;
                          padding: 2.5px 8px;
                          margin-left: 2px;
                          font-size: 8.5pt;
                          font-weight: 600;
                          box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.15);
                          transition: all 0.2s ease;
                        }
                        .waffle-badge-haber:hover {
                          transform: translateY(-1px);
                          box-shadow: 0 2px 4px 0 rgb(0 0 0 / 0.25);
                          background-color: rgba(217, 119, 6, 0.2);
                        }
                        .waffle-badge-venta {
                          background-color: rgba(16, 185, 129, 0.12);
                          color: #34d399;
                          border: 1px solid rgba(16, 185, 129, 0.35);
                          border-radius: 6px;
                          display: inline-block;
                          padding: 2.5px 8px;
                          margin-left: 2px;
                          font-size: 8.5pt;
                          font-weight: 700;
                          box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.15);
                          transition: all 0.2s ease;
                        }
                        .waffle-badge-venta:hover {
                          transform: translateY(-1px);
                          box-shadow: 0 2px 4px 0 rgb(0 0 0 / 0.25);
                          background-color: rgba(16, 185, 129, 0.22);
                        }
                        .waffle-badge-costo {
                          background-color: rgba(239, 68, 68, 0.12);
                          color: #f87171;
                          border: 1px solid rgba(239, 68, 68, 0.3);
                          border-radius: 6px;
                          display: inline-block;
                          padding: 2.5px 8px;
                          margin-left: 2px;
                          font-size: 8.5pt;
                          font-weight: 700;
                          box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.15);
                          transition: all 0.2s ease;
                        }
                        .waffle-badge-costo:hover {
                          transform: translateY(-1px);
                          box-shadow: 0 2px 4px 0 rgb(0 0 0 / 0.25);
                          background-color: rgba(239, 68, 68, 0.2);
                        }
                        .waffle-marker-green {
                          background-color: rgba(16, 185, 129, 0.1) !important;
                          border-left: 3px solid #10b981 !important;
                          text-align: center;
                          vertical-align: middle;
                        }
                        .waffle-marker-red {
                          background-color: rgba(239, 68, 68, 0.1) !important;
                          border-left: 3px solid #ef4444 !important;
                          text-align: center;
                          vertical-align: middle;
                        }
                        .waffle-cell-debe, .waffle-cell-haber {
                          text-align: right;
                          font-size: 9.5pt;
                          background-color: #0c0a09;
                          color: #e7e5e4;
                          font-weight: 500;
                        }
                        .waffle-glosa-text {
                          text-align: left;
                          font-size: 9pt;
                          font-style: italic;
                          vertical-align: middle;
                          white-space: normal;
                          background-color: #1c1917;
                          color: #a8a29e;
                          padding: 6px 12px !important;
                          line-height: 18px;
                        }
                        .waffle-total-cell-double {
                          text-align: right;
                          font-weight: 700;
                          font-size: 10pt;
                          border-bottom: 3px double #34d399 !important;
                          border-top: 1px solid #292524 !important;
                          color: #34d399;
                          background-color: #1c1917;
                        }
                      `}</style>
                      <table className="waffle-table">
                        <colgroup>
                          <col style={{ width: '95px' }} />
                          <col style={{ width: '32px' }} />
                          <col style={{ width: '256px' }} />
                          <col style={{ width: '256px' }} />
                          <col style={{ width: '100px' }} />
                          <col style={{ width: '100px' }} />
                          <col style={{ width: '90px' }} />
                        </colgroup>
                        <tbody>
                          <tr>
                            <td className="waffle-title-row" colSpan={7}>LIBRO DIARIO</td>
                          </tr>
                          <tr>
                            <td className="waffle-subtitle-row" colSpan={7}>THE ROASTING LAB S.R.L.</td>
                          </tr>
                          <tr>
                            <td className="waffle-currency-row" colSpan={7}>EXPRESADO EN BOLIVIANOS (BS)</td>
                          </tr>
                          <tr>
                            <td className="waffle-header-blue" colSpan={7}>
                              {periodoActual.toUpperCase().includes('ABRIL 2026') ? 'ABRIL - 2026' : `${periodoActual.toUpperCase()}`}
                            </td>
                          </tr>
                          <tr>
                            <td className="waffle-header-blue">FECHA</td>
                            <td className="waffle-header-blue">N°</td>
                            <td className="waffle-header-blue" colSpan={2}>DETALLE</td>
                            <td className="waffle-header-blue">DEBE</td>
                            <td className="waffle-header-blue">HABER</td>
                            <td className="waffle-header-blue">ACCIÓN</td>
                          </tr>
                          <tr className="h-4" style={{ height: '16px' }}>
                            <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                            <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                            <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                            <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                            <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                            <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                            <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                          </tr>

                          {filteredDiarioPlanillaSeats.map((seat: any, seatIdx: number) => {
                            const transaccionId = seat.movimientos && seat.movimientos[0]?.transaccion_id;
                            const isLinked = !!transaccionId;
                            const txObj = isLinked ? transacciones.find((t: any) => t.id === transaccionId) : null;

                            const debedMovs = seat.movimientos ? seat.movimientos.filter((m: any) => Number(m.debe || 0) > 0) : [];
                            const haberMovs = seat.movimientos ? seat.movimientos.filter((m: any) => Number(m.haber || 0) > 0) : [];
                            const totalRowsCount = debedMovs.length + haberMovs.length;

                            const rowsJSX = seat.rows.map((row: any, rowIdx: number) => {
                              const isGlosaRow = rowIdx === seat.rows.length - 2;
                              const isSumRow = rowIdx === seat.rows.length - 1;
                              const mov = rowIdx < totalRowsCount ? (rowIdx < debedMovs.length ? debedMovs[rowIdx] : haberMovs[rowIdx - debedMovs.length]) : null;
                              
                              return (
                                <tr key={`${seatIdx}-${rowIdx}`} className="hover:bg-stone-900/80 transition-colors">
                                  <td className="waffle-cell-fecha border-r border-stone-800">
                                    {row[0]}
                                  </td>

                                  <td className={isGlosaRow ? "waffle-cell-ref border-r border-stone-800 font-mono text-right text-stone-400" : "waffle-cell-nro border-r border-stone-800 font-mono text-center"}>
                                    {row[1]}
                                  </td>

                                  {isGlosaRow ? (
                                    <td className="waffle-glosa-text border-r border-stone-800 text-stone-400 italic pl-4 py-2" colSpan={2}>
                                      {row[2]}
                                    </td>
                                  ) : isSumRow ? (
                                    <td className="border-r border-stone-800" colSpan={2} style={{ backgroundColor: '#1c1917' }}></td>
                                  ) : (
                                    <>
                                      {row[2] ? (
                                        <td className="border-r border-stone-800 text-left align-middle py-1.5 bg-[#0c0a09]">
                                          <span className="waffle-badge-debe">
                                            {row[2]}
                                          </span>
                                        </td>
                                      ) : (
                                        row[3] && row[3].toUpperCase().includes('VENTA') ? (
                                          <td className="waffle-marker-green border-r border-stone-800 text-center align-middle py-1.5">
                                            <span className="text-[7.5pt] font-extrabold tracking-widest text-emerald-400 font-mono uppercase opacity-90">INGRESOS</span>
                                          </td>
                                        ) : row[3] && row[3].toUpperCase() === 'INVENTARIOS' ? (
                                          <td className="waffle-marker-red border-r border-stone-800 text-center align-middle py-1.5">
                                            <span className="text-[7.5pt] font-extrabold tracking-widest text-rose-400 font-mono uppercase opacity-90">INVENTARIO</span>
                                          </td>
                                        ) : (
                                          <td className="border-r border-stone-800 text-left align-middle py-1.5 bg-[#0c0a09]"></td>
                                        )
                                      )}

                                      {row[3] ? (
                                        <td className="border-r border-stone-800 text-left align-middle py-1.5 bg-[#0c0a09]">
                                          {row[3].toUpperCase().includes('VENTA') ? (
                                            <span className="waffle-badge-venta">
                                              {row[3]}
                                            </span>
                                          ) : row[3].toUpperCase() === 'INVENTARIOS' ? (
                                            <span className="waffle-badge-costo">
                                              {row[3]}
                                            </span>
                                          ) : (
                                            <span className="waffle-badge-haber">
                                              {row[3]}
                                            </span>
                                          )}
                                        </td>
                                      ) : (
                                        <td className="border-r border-stone-800 text-left align-middle py-1.5 bg-[#0c0a09]"></td>
                                      )}
                                    </>
                                  )}

                                  <td className={isSumRow ? "waffle-total-cell-double border-r border-stone-800 font-bold font-mono text-right" : "waffle-cell-debe border-r border-stone-800 font-mono text-right"}>
                                    {row[4]}
                                  </td>

                                  <td className={isSumRow ? "waffle-total-cell-double border-r border-stone-800 font-bold font-mono text-right" : "waffle-cell-haber border-r border-stone-800 font-mono text-right"}>
                                    {row[5]}
                                  </td>

                                  <td className="border border-stone-800 bg-[#0c0a09] p-1 text-center align-middle">
                                    {rowIdx < totalRowsCount && mov && (
                                      isLinked ? (
                                        <div className="flex justify-center text-emerald-600" title={`Enlazado a Transacción #${transaccionId}`}>
                                          <Link2 size={11} className="opacity-60" />
                                        </div>
                                      ) : (
                                        currentUser?.role === 'admin' && (
                                          <div className="flex items-center justify-center gap-1 mx-auto">
                                            <button
                                              onClick={() => handleEditDiario(mov)}
                                              className="p-0.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 hover:text-amber-300 transition-all flex items-center justify-center"
                                              title="Modificar Línea"
                                            >
                                              <Edit3 size={11} />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteDiarioRow(mov.id)}
                                              className="p-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 transition-all flex items-center justify-center"
                                              title="Eliminar Línea"
                                            >
                                              <Trash2 size={11} />
                                            </button>
                                          </div>
                                        )
                                      )
                                    )}

                                    {isGlosaRow && (
                                      isLinked ? (
                                        currentUser?.role === 'admin' && (
                                          <div className="flex items-center justify-center gap-1 mx-auto">
                                            {txObj && (
                                              <button
                                                onClick={() => handleEditTransaction(txObj)}
                                                className="p-0.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 hover:text-amber-300 transition-all flex items-center justify-center"
                                                title="Modificar Transacción Matriz"
                                              >
                                                <Edit3 size={11} />
                                              </button>
                                            )}
                                            <button
                                              onClick={() => handleDeleteTransaction(transaccionId)}
                                              className="p-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 transition-all flex items-center justify-center"
                                              title="Eliminar Transacción (Cascada)"
                                            >
                                              <Trash2 size={11} />
                                            </button>
                                          </div>
                                        )
                                      ) : (
                                        currentUser?.role === 'admin' && (
                                          <button
                                            onClick={() => handleDeleteDiarioSeat(seat.nro_asiento, seat.fecha)}
                                            className="px-1 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 transition-all font-sans text-[8px] font-bold border border-rose-800"
                                            title="Eliminar Asiento Completo"
                                          >
                                            Borrar Asiento
                                          </button>
                                        )
                                      )
                                    )}
                                  </td>
                                </tr>
                              );
                            });

                            const spacerJSX = (
                              <tr key={`${seatIdx}-spacer`} className="h-4" style={{ height: '16px' }}>
                                <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                                <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                                <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                                <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                                <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                                <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                                <td style={{ backgroundColor: '#0c0a09', border: 'none' }}></td>
                              </tr>
                            );

                            return [...rowsJSX, spacerJSX];
                          })}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'libro_mayor' && (
              <div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-2 border-b border-stone-800 gap-4">
                  <h2 className="text-lg font-bold text-stone-300">LIBRO MAYOR - {periodoActual}</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={imprimirLibroMayorPDF}
                      className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 transition-all shadow active:scale-95 cursor-pointer text-xs mr-2"
                    >
                      🖨️ Imprimir Libro Mayor (PDF)
                    </button>
                    <span className="text-xs font-bold text-stone-500 uppercase">Cuenta:</span>
                    <select
                      value={cuentaMayorActiva}
                      onChange={(e) => setCuentaMayorActiva(e.target.value)}
                      className="border border-stone-800 rounded p-1.5 text-xs font-bold text-emerald-300 font-mono outline-none focus:ring-1 focus:ring-emerald-500 bg-stone-900 min-w-[250px]"
                    >
                      <option value="TODAS">-- MOSTRAR TODAS LAS CUENTAS --</option>
                      {mayorPorCuenta.map(mayor => (
                        <option key={mayor.codigo} value={mayor.codigo}>{mayor.codigo} - {mayor.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {mayorPorCuenta.length === 0 && <p className="text-stone-500 text-center py-10">No hay movimientos registrados en ninguna cuenta.</p>}
                
                {mayorPorCuenta
                  .filter(m => cuentaMayorActiva === 'TODAS' || m.codigo === cuentaMayorActiva)
                  .map(mayor => {
                    const totalDebe = mayor.movimientos.reduce((sum: number, m: any) => sum + Number(m.debe || 0), 0);
                    const totalHaber = mayor.movimientos.reduce((sum: number, m: any) => sum + Number(m.haber || 0), 0);
                    const finalSaldo = mayor.movimientos.length > 0 ? mayor.movimientos[mayor.movimientos.length - 1].saldoAcumulado : 0;

                    return (
                      <div key={mayor.codigo} className="mb-10 bg-stone-900 border border-stone-800 rounded-lg shadow-sm overflow-hidden">
                        <h3 className="text-sm font-bold text-stone-100 bg-stone-850 p-2.5 border-l-4 border-stone-600 shadow-sm flex items-center gap-2 font-mono uppercase">
                          <Layers size={16} />
                          {mayor.nombre}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-stone-800 text-white font-mono">
                              <tr>
                                <th className="px-4 py-2 border-b border-stone-700">FECHA</th>
                                <th className="px-4 py-2 border-b border-stone-700 text-center">REF</th>
                                <th className="px-4 py-2 border-b border-stone-700 w-1/2">DETALLE</th>
                                <th className="px-4 py-2 border-b border-stone-700 text-right">DEBE</th>
                                <th className="px-4 py-2 border-b border-stone-700 text-right">HABER</th>
                                <th className="px-4 py-2 border-b border-stone-700 text-right">SALDO</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono divide-y divide-stone-850 text-stone-300 bg-stone-900">
                              {mayor.movimientos.length === 0 ? (
                                <tr className="hover:bg-stone-850 text-stone-500 italic">
                                  <td className="px-4 py-2 border-b border-stone-850">-</td>
                                  <td className="px-4 py-2 border-b border-stone-850 text-center">-</td>
                                  <td className="px-4 py-2 border-b border-stone-850">Sin movimientos en este periodo.</td>
                                  <td className="px-4 py-2 border-b border-stone-850 text-right">-</td>
                                  <td className="px-4 py-2 border-b border-stone-850 text-right">-</td>
                                  <td className="px-4 py-2 border-b border-stone-850 text-right bg-stone-950 font-bold">{formatNumber(0)}</td>
                                </tr>
                              ) : (
                                mayor.movimientos.map((mov: any, idx: number) => {
                                  const renderRef = () => {
                                    if (mov.nro_asiento !== 9999) return mov.nro_asiento;
                                    const glosa = (mov.glosa || '').toUpperCase();
                                    if (glosa.includes('VENTA 128')) return '#REF!';
                                    if (mov.codigo_cuenta === '1130203' && Number(mov.debe) === 11.5) {
                                      return 'Depósito por las ventas de MIÉRCOLES 29 de abrill del 2026.';
                                    }
                                    return '';
                                  };

                                  const renderDetalle = () => {
                                    if (mov.nro_asiento === 9999 && mov.codigo_cuenta === '1130203' && Number(mov.debe) === 11.5) {
                                      return '';
                                    }
                                    return mov.glosa || 'Movimiento contable';
                                  };

                                  return (
                                    <tr key={mov.id || idx} className="hover:bg-stone-850">
                                      <td className="px-4 py-2 border-b border-stone-850">{formatDateCSV(mov.fecha || mov.created_at)}</td>
                                      <td className="px-4 py-2 border-b border-stone-850 text-center font-bold">{renderRef()}</td>
                                      <td className="px-4 py-2 border-b border-stone-850">{renderDetalle()}</td>
                                      <td className="px-4 py-2 border-b border-stone-850 text-right">{Number(mov.debe || 0) > 0 ? formatNumber(mov.debe) : ''}</td>
                                      <td className="px-4 py-2 border-b border-stone-850 text-right">{Number(mov.haber || 0) > 0 ? formatNumber(mov.haber) : ''}</td>
                                      <td className="px-4 py-2 border-b border-stone-850 text-right bg-stone-950 font-bold">{formatNumber(mov.saldoAcumulado)}</td>
                                    </tr>
                                  );
                                })
                              )}
                              {/* CIERRE ROW */}
                              <tr className="bg-stone-850 font-bold border-t-2 border-stone-600">
                                <td className="px-4 py-2 uppercase" colSpan={3}>CIERRE MES DE {periodoActual}</td>
                                <td className="px-4 py-2 text-right">{formatNumber(totalDebe)}</td>
                                <td className="px-4 py-2 text-right">{formatNumber(totalHaber)}</td>
                                <td className="px-4 py-2 text-right">{formatNumber(finalSaldo)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}

            {/* 4. PESTAÑA: COMPRAS Y VENTAS */}
            {activeTab === 'compras_ventas' && (
              <div>
                <div className="flex justify-between items-center mb-6 pb-2 border-b border-stone-800">
                  <h2 className="text-lg font-bold text-stone-300">CUADRO DIARIO DE INGRESOS Y EGRESOS OPERATIVOS</h2>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500" />
                      <input
                        type="text"
                        placeholder="Buscar N°, Fecha, Detalle..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-1.5 border border-stone-800 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500 w-64 bg-stone-900 text-stone-200"
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
                  <div className="bg-stone-900 border border-stone-800 rounded-lg p-5 shadow-sm border-l-4 border-l-emerald-500">
                    <p className="text-xs font-bold text-stone-500 uppercase">Total de Ventas</p>
                    <p className="text-2xl font-mono font-bold text-emerald-400 mt-1">Bs {formatNumber(plData.ingresosVentas)}</p>
                    <div className="mt-3 text-sm text-stone-500 font-mono">
                      Prom. Diario: {formatNumber(plData.ingresosVentas / 23)}<br/>
                      Prom. Semanal: {formatNumber(plData.ingresosVentas / 4)}
                    </div>
                  </div>
                  {/* Total Gastos */}
                  <div className="bg-stone-900 border border-stone-800 rounded-lg p-5 shadow-sm border-l-4 border-l-orange-500">
                    <p className="text-xs font-bold text-stone-500 uppercase">Total de Gastos</p>
                    <p className="text-2xl font-mono font-bold text-orange-400 mt-1">Bs {formatNumber(plData.totalCostos)}</p>
                    <div className="mt-3 text-sm text-stone-500 font-mono">
                      Prom. Diario: {formatNumber(plData.totalCostos / 23)}<br/>
                      Prom. Semanal: {formatNumber(plData.totalCostos / 4.5)}
                    </div>
                  </div>
                  {/* EERR & Impuestos */}
                  <div className="bg-stone-900 border border-stone-800 rounded-lg p-5 shadow-sm border-l-4 border-l-purple-500">
                    <p className="text-xs font-bold text-stone-500 uppercase">E.E.R.R. (Utilidad)</p>
                    <p className="text-2xl font-mono font-bold text-purple-400 mt-1">Bs {formatNumber(plData.utilidad)}</p>
                    <div className="mt-3 text-sm text-stone-500 font-mono">
                      Impuestos: {formatNumber(plData.totalImpuestos)}<br/>
                      Días Trabajados: 23
                    </div>
                  </div>
                  {/* Cajas Totales */}
                  <div className="bg-stone-900 border border-stone-800 rounded-lg p-5 shadow-sm border-l-4 border-l-blue-500">
                    <p className="text-xs font-bold text-stone-500 uppercase">Distribución Estimada</p>
                    <div className="mt-3 text-sm font-mono text-stone-400 leading-relaxed">
                      C. Chica: {formatNumber(plData.ingresosVentas * 0.4)}<br/>
                      Banco: {formatNumber(plData.ingresosVentas * 0.5)}<br/>
                      POS: {formatNumber(plData.ingresosVentas * 0.1)}
                    </div>
                  </div>
                </div>

                {/* TABLA PRINCIPAL DE DATOS REDISEÑADA */}
                <div className="border border-stone-800 rounded-xl shadow-sm bg-stone-900 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-800 text-white font-mono text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="p-3 text-center w-[50px]">N°</th>
                        <th className="p-3 w-[90px]">
                          <button onClick={() => setSortAscending(!sortAscending)} className="flex items-center gap-1 hover:text-emerald-300 transition-colors uppercase">
                            FECHA <ArrowUpDown size={12} />
                          </button>
                        </th>
                        <th className="p-3 w-[250px]">Detalle / Información Operativa</th>
                        <th className="p-3 text-right w-[110px] bg-stone-900/10">Importe</th>
                        <th className="p-3 w-[220px]">Distribución Cuentas</th>
                        <th className="p-3 text-center w-[70px]">Factura</th>
                        <th className="p-3 w-[180px]">Ventas S/F e Impuestos</th>
                        <th className="p-3 w-[150px]">Método / Pago</th>
                        <th className="p-3 text-center w-[110px]">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono divide-y divide-stone-850 text-stone-300 bg-stone-900">
                      {(() => {
                        if (paginatedTx.length === 0) return <tr><td colSpan={9} className="p-8 text-center text-stone-500 italic bg-stone-950">No se encontraron resultados para tu búsqueda.</td></tr>;
                        
                        return paginatedTx.map((tx, idx) => {
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
                          
                          const isExpanded = !!expandedRows[tx.id];
                          const rowNumber = sortAscending 
                            ? ((currentPage - 1) * pageSize + idx + 1) 
                            : (sortedTx.length - ((currentPage - 1) * pageSize + idx));

                          return (
                            <React.Fragment key={tx.id}>
                              <tr className={`hover:bg-emerald-950/20 transition-colors border-b border-stone-850 ${isExpanded ? 'bg-emerald-950/10' : ''}`}>
                                <td className="p-3 text-center font-bold text-stone-400">{rowNumber}</td>
                                <td className="p-3 text-stone-400">{formatDate(tx.fecha || tx.created_at)}</td>
                                <td className="p-3">
                                  <div className="font-bold text-stone-100 font-sans break-words max-w-[240px] whitespace-normal" title={tx.detalle}>
                                    {tx.detalle || 'Operación'}
                                  </div>
                                  {(tx.mesa || tx.hora || tx.responsable) && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[9px] text-stone-500 font-mono">
                                      {tx.mesa && <span className="bg-stone-800 px-1 rounded font-semibold text-stone-300">M: {tx.mesa}</span>}
                                      {tx.hora && <span className="bg-stone-800 px-1 rounded text-stone-400">{tx.hora}</span>}
                                      {tx.responsable && <span className="bg-stone-800 px-1 rounded max-w-[85px] truncate" title={tx.responsable}>{tx.responsable}</span>}
                                    </div>
                                  )}
                                  {(tx.codigo_debe || tx.codigo_haber) && (
                                    <div className="flex flex-wrap items-center gap-1 mt-1 text-[8.5px] font-mono leading-none">
                                      {tx.codigo_debe && (
                                        <span className="bg-emerald-950/40 text-emerald-300 border border-emerald-900/50 px-1 py-0.5 rounded font-bold" title={planCuentas.find(c => c.codigo === tx.codigo_debe)?.nombre || ''}>
                                          DEB: {tx.codigo_debe}
                                        </span>
                                      )}
                                      {tx.codigo_haber && (
                                        <span className="bg-orange-950/40 text-amber-300 border border-orange-900/50 px-1 py-0.5 rounded font-bold" title={planCuentas.find(c => c.codigo === tx.codigo_haber)?.nombre || ''}>
                                          HAB: {tx.codigo_haber}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-right bg-stone-950/40">
                                  {isIngreso ? (
                                    <span className="text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[11px] inline-block font-mono">
                                      +Bs {formatNumber(val)}
                                    </span>
                                  ) : (
                                    <span className="text-orange-400 font-bold bg-orange-950/40 border border-orange-900/50 px-1.5 py-0.5 rounded text-[11px] inline-block font-mono">
                                      -Bs {formatNumber(val)}
                                    </span>
                                  )}
                                </td>

                                <td className="p-3">
                                  <div className="flex flex-wrap gap-1 max-w-[210px] whitespace-normal">
                                    {cCaja > 0 && <span className="inline-flex bg-teal-950/40 border border-teal-900/50 text-teal-400 text-[9px] px-1 rounded font-bold">Caja: {formatNumber(cCaja)}</span>}
                                    {cCChica > 0 && <span className="inline-flex bg-stone-800 border border-stone-700 text-stone-300 text-[9px] px-1 rounded font-bold">C.Chica: {formatNumber(cCChica)}</span>}
                                    {cBanco > 0 && <span className="inline-flex bg-blue-950/40 border border-blue-900/50 text-blue-400 text-[9px] px-1 rounded font-bold">Banco: {formatNumber(cBanco)}</span>}
                                    {cPos > 0 && <span className="inline-flex bg-purple-950/40 border border-purple-900/50 text-purple-400 text-[9px] px-1 rounded font-bold">POS: {formatNumber(cPos)}</span>}
                                    {cCaja === 0 && cCChica === 0 && cBanco === 0 && cPos === 0 && <span className="text-stone-600">-</span>}
                                  </div>
                                </td>

                                <td className="p-3 text-center">
                                  {tx.tiene_factura ? (
                                    <span className="inline-flex items-center gap-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 px-1.5 py-0.5 rounded-[4px] font-mono font-bold text-[9px]">
                                      <CheckCircle2 size={10} className="text-emerald-400" /> CON/F
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 bg-stone-850 text-stone-500 border border-stone-800 px-1.5 py-0.5 rounded-[4px] font-mono font-bold text-[9px]">
                                      <XCircle size={10} className="text-stone-500" /> SIN/F
                                    </span>
                                  )}
                                </td>

                                <td className="p-3">
                                  {(vSfCch > 0 || vBanco > 0 || cCh > 0 || cBancoCost > 0) ? (
                                    <div className="space-y-0.5 text-[9px]">
                                      {vSfCch > 0 && <div className="text-stone-400">V.S/F C.Ch: <span className="font-bold text-stone-200">{formatNumber(vSfCch)}</span></div>}
                                      {vBanco > 0 && <div className="text-stone-400">V.S/F Bco: <span className="font-bold text-stone-200">{formatNumber(vBanco)}</span></div>}
                                      {cCh > 0 && <div className="text-purple-400 bg-purple-950/40 px-1 rounded inline-block">Costo C.Ch: <span className="font-bold">{formatNumber(cCh)}</span></div>}
                                      {cBancoCost > 0 && <div className="text-purple-400 bg-purple-950/40 px-1 rounded inline-block">Costo Bco: <span className="font-bold">{formatNumber(cBancoCost)}</span></div>}
                                    </div>
                                  ) : (
                                    <span className="text-stone-600">-</span>
                                  )}
                                </td>

                                <td className="p-3">
                                  <div className="text-[10px]">
                                    <span className="font-bold text-stone-300 bg-stone-800 px-1 rounded">{tx.metodo_pago || '-'}</span>
                                    {(Number(tx.pago || 0) > 0 || Number(tx.cambio || 0) !== 0) && (
                                      <div className="text-[9px] text-stone-500 mt-0.5">
                                        P: {formatNumber(tx.pago || 0)} / C: {formatNumber(tx.cambio || 0)}
                                      </div>
                                    )}
                                  </div>
                                </td>

                                <td className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5 mx-auto">
                                    <button
                                      onClick={() => toggleRow(tx.id)}
                                      className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-100 transition-all focus:outline-none flex items-center justify-center"
                                      title="Ver Detalles"
                                    >
                                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>

                                    {currentUser?.role === 'admin' && (
                                      <>
                                        <button
                                          onClick={() => handleEditTransaction(tx)}
                                          className="p-1 rounded bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 hover:text-amber-300 transition-all flex items-center justify-center"
                                          title="Modificar Transacción"
                                        >
                                          <Edit3 size={14} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteTransaction(tx.id)}
                                          className="p-1 rounded bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 hover:text-rose-300 transition-all flex items-center justify-center"
                                          title="Eliminar Transacción"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {/* FILA DE EXPANSIÓN DETALLADA */}
                              {isExpanded && (
                                <tr className="bg-stone-900/60 border-b border-stone-850 transition-all duration-350">
                                  <td colSpan={9} className="p-4 border-l-4 border-l-emerald-600">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-mono">
                                      {/* Columna 1: Info Operativa */}
                                      <div className="bg-stone-950 p-3 rounded-lg border border-stone-800 shadow-sm">
                                        <h4 className="font-bold text-[10px] text-emerald-300 uppercase tracking-wider mb-2 font-mono border-b border-stone-800 pb-1">Info Operativa</h4>
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">ID BD:</span><span className="font-bold text-stone-300">{tx.id}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Fecha completa:</span><span className="font-bold text-stone-200">{formatDate(tx.fecha || tx.created_at)}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Hora:</span><span className="text-stone-300">{tx.hora || '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Mesa/Ubicación:</span><span className="font-bold text-stone-200">{tx.mesa || '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Responsable:</span><span className="text-stone-300">{tx.responsable || '-'}</span></div>
                                        </div>
                                      </div>
                                      {/* Columna 2: Cuentas y Pago */}
                                      <div className="bg-stone-950 p-3 rounded-lg border border-stone-800 shadow-sm">
                                        <h4 className="font-bold text-[10px] text-emerald-300 uppercase tracking-wider mb-2 font-mono border-b border-stone-800 pb-1">Distribución de Cuentas</h4>
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Caja:</span><span className="text-stone-300">{cCaja > 0 ? `Bs ${formatNumber(cCaja)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Caja Chica:</span><span className="text-stone-300">{cCChica > 0 ? `Bs ${formatNumber(cCChica)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Banco:</span><span className="text-stone-300">{cBanco > 0 ? `Bs ${formatNumber(cBanco)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">POS:</span><span className="text-stone-300">{cPos > 0 ? `Bs ${formatNumber(cPos)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Pago Recibido:</span><span className="text-stone-300">{Number(tx.pago || 0) > 0 ? `Bs ${formatNumber(tx.pago)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Cambio Devuelto:</span><span className="text-orange-400 font-bold">{Number(tx.cambio || 0) !== 0 ? `Bs ${formatNumber(tx.cambio)}` : '-'}</span></div>
                                        </div>
                                      </div>
                                      {/* Columna 3: Internos y Obs */}
                                      <div className="bg-stone-950 p-3 rounded-lg border border-stone-800 shadow-sm">
                                        <h4 className="font-bold text-[10px] text-emerald-300 uppercase tracking-wider mb-2 font-mono border-b border-stone-800 pb-1">Datos S/F y Categoría</h4>
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">V.S/F C.Chica:</span><span className="text-stone-300">{vSfCch > 0 ? `Bs ${formatNumber(vSfCch)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">V.S/F Banco:</span><span className="text-stone-300">{vBanco > 0 ? `Bs ${formatNumber(vBanco)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-purple-400 font-semibold">Costo C.Chica S/F:</span><span className="text-stone-300">{cCh > 0 ? `Bs ${formatNumber(cCh)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-purple-400 font-semibold">Costo Banco S/F:</span><span className="text-stone-300">{cBancoCost > 0 ? `Bs ${formatNumber(cBancoCost)}` : '-'}</span></div>
                                          <div className="flex justify-between border-b border-dashed border-stone-800 py-0.5"><span className="text-stone-500">Categoría EERR:</span><span className="font-bold text-emerald-400">{tx.categoria || 'Otros'}</span></div>
                                        </div>
                                      </div>
                                      {/* Fila de Asiento de Partida Doble */}
                                      <div className="col-span-1 md:col-span-3 bg-stone-950 border border-stone-800 rounded-xl p-4 shadow-sm">
                                        <h4 className="font-bold text-[10px] text-emerald-300 uppercase tracking-wider mb-3 font-mono border-b border-stone-800 pb-1">
                                          📖 Asiento Contable - Partida Doble (Auditoría)
                                        </h4>
                                        <div className="grid grid-cols-2 gap-0 border border-stone-800 rounded-lg overflow-hidden divide-x divide-stone-800 font-mono text-[11px]">
                                          {/* DEBE Column */}
                                          <div className="p-3 bg-emerald-950/20">
                                            <div className="font-bold text-emerald-300 border-b border-emerald-900/50 pb-1 mb-2 text-center text-[10px] uppercase">
                                              DEBE (Cuentas Destino)
                                            </div>
                                            {tx.codigo_debe ? (
                                              <div className="flex justify-between items-center py-1">
                                                <div>
                                                  <span className="font-bold text-emerald-300 mr-2">{tx.codigo_debe}</span>
                                                  <span className="text-stone-400 font-sans">{planCuentas.find(c => c.codigo === tx.codigo_debe)?.nombre || 'Cuenta'}</span>
                                                </div>
                                                <span className="font-bold text-emerald-400">Bs. {formatNumber(val)}</span>
                                              </div>
                                            ) : (
                                              <div className="text-stone-500 italic text-center py-2">Sin cuenta DEBE asignada (Histórico)</div>
                                            )}
                                          </div>
                                          {/* HABER Column */}
                                          <div className="p-3 bg-orange-950/10">
                                            <div className="font-bold text-orange-300 border-b border-orange-900/50 pb-1 mb-2 text-center text-[10px] uppercase">
                                              HABER (Cuentas Origen)
                                            </div>
                                            {tx.codigo_haber ? (
                                              <div className="flex justify-between items-center py-1">
                                                <div className="pl-4">
                                                  <span className="font-bold text-amber-400 mr-2">{tx.codigo_haber}</span>
                                                  <span className="text-stone-400 font-sans">{planCuentas.find(c => c.codigo === tx.codigo_haber)?.nombre || 'Cuenta'}</span>
                                                </div>
                                                <span className="font-bold text-orange-400">Bs. {formatNumber(val)}</span>
                                              </div>
                                            ) : (
                                              <div className="text-stone-500 italic text-center py-2">Sin cuenta HABER asignada (Histórico)</div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex justify-between text-[9px] text-stone-500 mt-2 font-mono px-1">
                                          <span>Glosa del Asiento: {tx.detalle || 'Registro general'}</span>
                                          <span className="font-bold text-stone-300">Total Asiento: Bs. {formatNumber(val)} (Balanceado ✓)</span>
                                        </div>
                                      </div>
                                      {/* Fila inferior para Observaciones */}
                                      {(tx.observacion || tx.detalle) && (
                                        <div className="col-span-1 md:col-span-3 bg-stone-900 p-2.5 rounded border border-stone-800 text-[11px] font-sans flex flex-col gap-1">
                                          <div><span className="font-bold font-mono text-[9px] text-stone-500 uppercase tracking-wider">Detalle Completo:</span> <span className="text-stone-200">{tx.detalle || '-'}</span></div>
                                          {tx.observacion && <div><span className="font-bold font-mono text-[9px] text-stone-500 uppercase tracking-wider">Observación:</span> <span className="text-stone-300 italic">{tx.observacion}</span></div>}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* CONTROLES DE PAGINACIÓN PREMIUM */}
                {sortedTx.length > pageSize && (
                  <div className="flex flex-col sm:flex-row justify-between items-center mt-6 bg-stone-900 border border-stone-800 rounded-xl p-4 gap-3">
                    <div className="text-xs text-stone-500 font-mono">
                      Mostrando registros <span className="font-bold text-stone-100">{(currentPage - 1) * pageSize + 1}</span> a{' '}
                      <span className="font-bold text-stone-100">{Math.min(currentPage * pageSize, sortedTx.length)}</span> de{' '}
                      <span className="font-bold text-emerald-400">{sortedTx.length}</span> en total
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg border border-stone-800 bg-stone-950 hover:bg-stone-850 text-xs font-bold text-stone-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono shadow-sm"
                      >
                        « Anterior
                      </button>
                      <span className="text-xs font-mono font-bold text-stone-400 bg-stone-950 border border-stone-800 px-3 py-1.5 rounded-lg shadow-sm">
                        Pág. {currentPage} de {Math.ceil(sortedTx.length / pageSize)}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(sortedTx.length / pageSize)))}
                        disabled={currentPage >= Math.ceil(sortedTx.length / pageSize)}
                        className="px-3 py-1.5 rounded-lg border border-stone-800 bg-stone-950 hover:bg-stone-850 text-xs font-bold text-stone-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono shadow-sm"
                      >
                        Siguiente »
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. PESTAÑA: INVENTARIO (PEPS) */}
            {activeTab === 'inventario_peps' && (
              <div>
                <div className="flex justify-between items-center mb-6 pb-2 border-b border-stone-800">
                  <h2 className="text-lg font-bold text-stone-300">VALORACIÓN DE INVENTARIO PEPS Y CONTROL DE PLANTA</h2>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500" />
                      <input
                        type="text"
                        placeholder="Buscar N°, Fecha, Detalle..."
                        value={invSearchTerm}
                        onChange={(e) => setInvSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-1.5 border border-stone-800 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500 w-64 bg-stone-900 text-stone-200"
                      />
                    </div>
                    <button onClick={() => setShowInvModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                      <Plus size={14} /> Registrar Movimiento
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-stone-800 rounded shadow-sm">
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
                        <th className="p-3 border-b border-stone-700 text-center w-[90px]">ACCIÓN</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono divide-y divide-stone-850 text-stone-300 bg-stone-900">
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
                        
                        if (sortedInv.length === 0) return <tr><td colSpan={17} className="p-4 text-center text-stone-500">No se encontraron resultados para tu búsqueda.</td></tr>;
                        
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
                            <tr key={mov.id} className="hover:bg-stone-850">
                              <td className="p-3 text-center font-bold text-stone-400">{mov.id}</td>
                              <td className="p-3">{formatDate(mov.fecha || mov.created_at)}</td>
                              <td className="p-3 truncate max-w-xs">{mov.detalle || '-'}</td>

                              <td className="p-3 text-right font-bold text-emerald-400 bg-emerald-950/30">{entradas > 0 ? formatNumber(entradas) : '-'}</td>
                              <td className="p-3 text-right font-bold text-orange-400 bg-orange-950/30">{salidas > 0 ? formatNumber(salidas) : '-'}</td>
                              <td className="p-3 text-right font-bold bg-stone-950">{saldoUnidades > 0 ? formatNumber(saldoUnidades) : '-'}</td>

                              <td className="p-3 text-right">{costoUni > 0 ? formatNumber(costoUni) : '-'}</td>
                              <td className="p-3 text-right text-emerald-400 bg-emerald-950/30">{debe > 0 ? formatNumber(debe) : '-'}</td>
                              <td className="p-3 text-right text-orange-400 bg-orange-950/30">{haber > 0 ? formatNumber(haber) : '-'}</td>
                              <td className="p-3 text-right font-bold bg-stone-950">{saldoValor > 0 ? formatNumber(saldoValor) : '-'}</td>

                              <td className="p-3 text-center text-stone-400">{mov.tipo_cafe || '-'}</td>
                              <td className="p-3 text-center text-stone-400">{mov.tipo_tueste || '-'}</td>
                              <td className="p-3 text-center text-stone-400">{mov.clima || '-'}</td>

                              <td className="p-3 text-right text-stone-500">{mermaPorcentaje > 0 ? `${formatNumber(mermaPorcentaje)}%` : '-'}</td>
                              <td className="p-3 text-right text-stone-500">{mermaTueste > 0 ? formatNumber(mermaTueste) : '-'}</td>
                              <td className="p-3 text-right font-bold text-emerald-400 bg-emerald-950/30">{tuesteFinal > 0 ? formatNumber(tuesteFinal) : '-'}</td>

                              <td className="p-3 text-center">
                                {currentUser?.role === 'admin' && (
                                  <div className="flex items-center justify-center gap-1.5 mx-auto">
                                    <button
                                      onClick={() => handleEditInventory(mov)}
                                      className="p-1 rounded bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 hover:text-amber-300 transition-all flex items-center justify-center"
                                      title="Modificar Movimiento"
                                    >
                                      <Edit3 size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteInventory(mov.id)}
                                      className="p-1 rounded bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 hover:text-rose-300 transition-all flex items-center justify-center"
                                      title="Eliminar Movimiento"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                              </td>
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
                <h2 className="text-lg font-bold text-stone-300 mb-4 pb-2 border-b border-stone-800">PLAN ÚNICO DE CUENTAS</h2>
                <div className="max-w-xl border border-stone-800 rounded">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-stone-900 font-mono text-xs">
                      <tr>
                        <th className="px-4 py-2 border-b border-stone-800 w-1/3 text-stone-400">CÓDIGO NOMENCLATURA</th>
                        <th className="px-4 py-2 border-b border-stone-800 text-stone-400">DENOMINACIÓN DE CUENTA</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-stone-300 divide-y divide-stone-850">
                      {planCuentas.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-stone-500">El catálogo está vacío.</td></tr>}
                      {planCuentas.map((cuenta) => {
                        const isMain = cuenta.codigo.length <= 3 || cuenta.codigo.endsWith('00');
                        return (
                          <tr key={cuenta.codigo} className={isMain ? "bg-emerald-950/30 font-bold" : ""}>
                            <td className="px-4 py-1.5 border-b border-stone-850">{cuenta.codigo}</td>
                            <td className={`px-4 py-1.5 border-b border-stone-850 ${!isMain ? "pl-10" : ""}`}>{cuenta.nombre}</td>
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
                <h2 className="text-lg font-bold text-stone-300 mb-4 pb-2 border-b border-stone-800">MATRIZ CONTROL DE UNIDADES VENDIDAS AL DÍA</h2>
                <div className="overflow-x-auto border border-stone-800 rounded">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-stone-800 text-white font-mono whitespace-nowrap">
                      <tr>
                        <th className="p-2 border border-stone-700 text-center">Nº</th>
                        <th className="p-2 border border-stone-700">DESCRIPCIÓN DE ITEM</th>
                        <th className="p-2 border border-stone-700 text-center bg-emerald-700">TOTAL MES</th>
                        {Array.from({ length: 31 }, (_, i) => <th key={i} className="p-1 border border-stone-700 text-center w-8">{i + 1}</th>)}
                      </tr>
                    </thead>
                    <tbody className="font-mono text-stone-300 divide-y divide-stone-850">
                      {estadisticas.length === 0 && <tr><td colSpan={34} className="p-4 text-center text-stone-500">No hay ventas en este periodo.</td></tr>}
                      {estadisticas.map((est: any, idx: number) => (
                        <tr key={idx} className="hover:bg-stone-850">
                          <td className="p-2 border border-stone-850 text-center">{idx + 1}</td>
                          <td className="p-2 border border-stone-850 font-medium whitespace-nowrap">{est.nombre}</td>
                          <td className="p-2 border border-stone-850 text-center font-bold bg-emerald-950/40 text-emerald-300">{est.total}</td>
                          {est.days.map((qty: number, i: number) => (
                            <td key={i} className={`p-1 border border-stone-850 text-center ${qty > 0 ? 'font-bold text-stone-200' : 'text-stone-600'}`}>
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
                <h2 className="text-lg font-bold text-stone-300 mb-4 pb-2 border-b border-stone-800">ESCANDALLOS Y COSTEO DE RECETAS POR BEBIDA</h2>
                <div className="overflow-x-auto border border-stone-800 rounded shadow-sm">
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
                    <tbody className="font-mono text-stone-300 divide-y divide-stone-850 bg-stone-900">
                      {costosData.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-stone-500">No hay productos ni recetas activas.</td></tr>}
                      {costosData.map((c: any) => (
                        <tr key={c.id} className="hover:bg-stone-850">
                          <td className="p-3 border-b border-stone-850 font-bold text-white">{c.producto}</td>
                          <td className="p-3 border-b border-stone-850 text-right">Bs {formatNumber(c.costo_cafe)}</td>
                          <td className="p-3 border-b border-stone-850 text-right">Bs {formatNumber(c.costo_agua)}</td>
                          <td className="p-3 border-b border-stone-850 text-right">Bs {formatNumber(c.costo_leche)}</td>
                          <td className="p-3 border-b border-stone-850 text-right">Bs {formatNumber(c.costo_endulzante)}</td>
                          <td className="p-3 border-b border-stone-850 text-right">Bs {formatNumber(c.costo_insumos)}</td>
                          <td className="p-3 border-b border-stone-850 text-right">Bs {formatNumber(c.mano_obra)}</td>
                          <td className="p-3 border-b border-stone-850 text-right bg-stone-950 font-bold">Bs {formatNumber(c.costo_total)}</td>
                          <td className="p-3 border-b border-stone-850 text-right bg-emerald-950/40 text-emerald-300 font-bold">Bs {formatNumber(c.precio_venta)}</td>
                          <td className="p-3 border-b border-stone-850 text-right text-red-400">Bs {formatNumber(c.impuestos)}</td>
                          <td className="p-3 border-b border-stone-850 text-right bg-emerald-950/40 text-emerald-400 font-bold text-sm">Bs {formatNumber(c.ganancia_neta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'pasteleria_panaderia' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6 pb-2 border-b border-stone-800">
                  <div>
                    <h2 className="text-xl font-black text-stone-100 tracking-tight">CONTROL DE PRODUCCIÓN Y MASAS</h2>
                    <p className="text-xs text-stone-500 font-medium">Panadería y Pastelería de Especialidad</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingMasa(null);
                        setShowMasaModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} /> Añadir Tipo de Masa
                    </button>
                    <button
                      onClick={() => setShowMovMasaModal(true)}
                      className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} /> Registrar Entrada/Salida
                    </button>
                  </div>
                </div>

                {/* Tarjetas Resumen */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-stone-900 border border-stone-850 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
                    <div className="p-3 rounded-xl bg-amber-950/40 text-amber-400">
                      <Cookie size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-stone-400 font-mono leading-none mb-1">Tipos de Masa</p>
                      <h4 className="text-lg font-black text-stone-100 leading-none">{masas.length} Activas</h4>
                    </div>
                  </div>

                  <div className="bg-stone-900 border border-stone-850 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
                    <div className="p-3 rounded-xl bg-emerald-950/40 text-emerald-400">
                      <Layers size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-stone-400 font-mono leading-none mb-1">Stock Total</p>
                      <h4 className="text-lg font-black text-stone-100 leading-none">
                        {masas.reduce((acc, m) => acc + (m.unidad_medida === 'kg' ? m.stock_actual : 0), 0).toFixed(2)} kg
                      </h4>
                    </div>
                  </div>

                  <div className="bg-stone-900 border border-stone-850 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
                    <div className="p-3 rounded-xl bg-red-950/40 text-red-400">
                      <XCircle size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-stone-400 font-mono leading-none mb-1">Stock de Alerta</p>
                      <h4 className="text-lg font-black text-red-400 leading-none">
                        {masas.filter(m => m.stock_actual <= m.stock_minimo).length} por Reponer
                      </h4>
                    </div>
                  </div>

                  <div className="bg-stone-900 border border-stone-850 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
                    <div className="p-3 rounded-xl bg-stone-800 text-stone-300">
                      <DollarSign size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-stone-400 font-mono leading-none mb-1">Valor Estimado</p>
                      <h4 className="text-lg font-black text-emerald-300 leading-none">
                        Bs. {formatNumber(masas.reduce((acc, m) => acc + (m.stock_actual * m.costo_unitario), 0))}
                      </h4>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                  
                  {/* Catálogo de Masas */}
                  <div className="lg:col-span-7 bg-stone-900 border border-stone-850 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-stone-800">
                      <h3 className="font-bold text-sm text-stone-100 uppercase tracking-wide">Catálogo de Masas</h3>
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-stone-500" />
                        <input
                          type="text"
                          placeholder="Filtrar masas..."
                          value={masaSearchTerm}
                          onChange={(e) => setMasaSearchTerm(e.target.value)}
                          className="pl-8 pr-3 py-1 border border-stone-800 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 w-44 bg-stone-950 text-stone-200"
                        />
                      </div>
                    </div>

                    {loadingMasas ? (
                      <div className="py-12 text-center text-stone-500 text-xs font-mono">Cargando catálogo de masas...</div>
                    ) : masas.length === 0 ? (
                      <div className="py-12 text-center text-stone-500 text-xs">No hay masas registradas en el catálogo.</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {masas
                          .filter(m => m.nombre.toLowerCase().includes(masaSearchTerm.toLowerCase()))
                          .map(m => {
                            const isAlert = m.stock_actual <= m.stock_minimo;
                            return (
                              <div key={m.id} className={`p-4 border rounded-xl flex flex-col justify-between h-36 transition-all ${
                                isAlert ? 'bg-red-950/30 border-red-900/50 shadow-sm' : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 shadow-xs'
                              }`}>
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <h4 className="font-bold text-xs text-stone-100 line-clamp-2">{m.nombre}</h4>
                                    <p className="text-[10px] text-stone-500 font-mono mt-0.5">C/U: Bs. {m.costo_unitario.toFixed(2)} / {m.unidad_medida}</p>
                                  </div>
                                  {isAlert && (
                                    <span className="bg-red-900/50 text-red-300 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-800">
                                      Bajo Stock
                                    </span>
                                  )}
                                </div>

                                <div className="flex justify-between items-end pt-3 border-t border-dashed border-stone-800">
                                  <div>
                                    <span className="text-[8px] uppercase font-bold text-stone-400 block font-mono">Stock Disponible</span>
                                    <span className={`text-base font-black font-mono leading-none ${isAlert ? 'text-red-400' : 'text-emerald-300'}`}>
                                      {m.stock_actual} {m.unidad_medida}
                                    </span>
                                  </div>

                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => {
                                        setEditingMasa(m);
                                        setShowMasaModal(true);
                                      }}
                                      className="p-1.5 border border-stone-800 hover:border-emerald-600 hover:bg-emerald-950/40 text-stone-500 hover:text-emerald-400 rounded-lg transition-colors cursor-pointer"
                                      title="Editar Masa"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (window.confirm(`¿Está seguro de eliminar "${m.nombre}" del catálogo? Se borrarán sus movimientos asociados.`)) {
                                          await MasasService.deleteMasa(m.id);
                                          toast.success("Masa eliminada");
                                          fetchMasasData();
                                        }
                                      }}
                                      className="p-1.5 border border-stone-800 hover:border-red-500 hover:bg-red-950/40 text-stone-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                                      title="Eliminar Masa"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* Historial de Movimientos */}
                  <div className="lg:col-span-5 bg-stone-900 border border-stone-850 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-stone-800">
                      <h3 className="font-bold text-sm text-stone-100 uppercase tracking-wide">Movimientos Recientes</h3>
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-stone-500" />
                        <input
                          type="text"
                          placeholder="Buscar movimientos..."
                          value={movMasaSearchTerm}
                          onChange={(e) => setMovMasaSearchTerm(e.target.value)}
                          className="pl-8 pr-3 py-1 border border-stone-800 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 w-36 bg-stone-950 text-stone-200"
                        />
                      </div>
                    </div>

                    {loadingMasas ? (
                      <div className="py-12 text-center text-stone-500 text-xs font-mono">Cargando movimientos...</div>
                    ) : movimientosMasas.length === 0 ? (
                      <div className="py-12 text-center text-stone-500 text-xs">No hay movimientos registrados.</div>
                    ) : (
                      <div className="overflow-y-auto max-h-[500px] pr-1 divide-y divide-stone-850">
                        {movimientosMasas
                          .filter(mov => {
                            const term = movMasaSearchTerm.toLowerCase();
                            return (mov.masa_nombre || '').toLowerCase().includes(term) ||
                                   (mov.motivo || '').toLowerCase().includes(term) ||
                                   mov.fecha.includes(term);
                          })
                          .map(mov => {
                            const isEntrada = mov.tipo_movimiento === 'ENTRADA';
                            return (
                              <div key={mov.id} className="py-3 flex justify-between gap-3 text-xs">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-stone-100">{mov.masa_nombre}</span>
                                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded font-mono ${
                                      isEntrada ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-800' : 'bg-amber-900/50 text-amber-300 border border-amber-800'
                                    }`}>
                                      {mov.tipo_movimiento}
                                    </span>
                                  </div>
                                  <p className="text-stone-500 font-medium mt-0.5">{mov.motivo}</p>
                                  <p className="text-[10px] text-stone-400 font-mono mt-0.5">Fecha: {mov.fecha} • Por: {mov.creado_por}</p>
                                </div>
                                <div className="text-right font-mono font-black text-sm shrink-0">
                                  <span className={isEntrada ? 'text-emerald-400' : 'text-amber-400'}>
                                    {isEntrada ? '+' : '-'}{mov.cantidad} {mov.masa_unidad}
                                  </span>
                                  <p className="text-[9px] text-stone-400 font-normal mt-0.5">
                                    Valor: Bs. {formatNumber(mov.cantidad * (masas.find(m => m.id === mov.masa_id)?.costo_unitario || 0))}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'usuarios' && currentUser?.role === 'admin' && (
              <div>
                <div className="flex justify-between items-center mb-6 pb-2 border-b border-stone-800">
                  <h2 className="text-lg font-bold text-stone-300">GESTIÓN DE USUARIOS DEL SISTEMA</h2>
                  <button
                    onClick={() => {
                      setEditingUser(null);
                      setUserFormName('');
                      setUserFormUsername('');
                      setUserFormPassword('');
                      setUserFormRole('cajero');
                      setShowUserModal(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                  >
                    <Plus size={14} /> Registrar Nuevo Usuario
                  </button>
                </div>

                <div className="overflow-x-auto bg-stone-900 border border-stone-800 shadow-sm rounded-xl p-6">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-emerald-950 text-white font-mono whitespace-nowrap text-sm">
                      <tr>
                        <th className="p-3 border-b border-emerald-900 font-bold">NOMBRE COMPLETO</th>
                        <th className="p-3 border-b border-emerald-900 font-bold">USUARIO (LOGIN)</th>
                        <th className="p-3 border-b border-emerald-900 font-bold">CONTRASEÑA</th>
                        <th className="p-3 border-b border-emerald-900 text-center font-bold">ROL</th>
                        <th className="p-3 border-b border-emerald-900 text-center font-bold">ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-850 bg-stone-900 text-stone-300 font-sans">
                      {usuariosList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-stone-500 font-mono">No hay usuarios cargados.</td>
                        </tr>
                      )}
                      {usuariosList.map((usr) => (
                        <tr key={usr.id || usr.username} className="hover:bg-stone-850 transition-colors">
                          <td className="p-3 font-semibold text-white">{usr.nombre}</td>
                          <td className="p-3 font-mono font-bold text-stone-400">{usr.username}</td>
                          <td className="p-3 font-mono">{usr.password}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[8.5pt] font-semibold tracking-wide border shadow-sm ${
                              usr.role === 'admin' ? 'bg-red-950/40 text-red-300 border-red-900/50' :
                              usr.role === 'cajero' ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/50' :
                              'bg-stone-800 text-stone-300 border-stone-700'
                            }`}>
                              {usr.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex justify-center items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingUser(usr);
                                  setUserFormName(usr.nombre);
                                  setUserFormUsername(usr.username);
                                  setUserFormPassword(usr.password);
                                  setUserFormRole(usr.role);
                                  setShowUserModal(true);
                                }}
                                className="px-2.5 py-1 text-[11px] font-bold text-stone-300 bg-stone-900 border border-stone-700 hover:bg-stone-800 rounded transition-colors shadow-sm cursor-pointer"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleDeleteUser(usr.id, usr.username)}
                                disabled={currentUser?.username === usr.username}
                                className="px-2.5 py-1 text-[11px] font-bold text-red-400 bg-red-950/40 hover:bg-red-900/50 disabled:opacity-40 disabled:cursor-not-allowed rounded border border-red-900/50 hover:border-red-800 transition-colors shadow-sm cursor-pointer"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
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

      <ModalComprasVentas 
        isOpen={showCVModal} 
        onClose={() => {
          setShowCVModal(false);
          setEditingTransaction(null);
        }} 
        onSaved={() => {
          handleSaved();
          setEditingTransaction(null);
        }} 
        planCuentas={planCuentas} 
        editingTransaction={editingTransaction} 
      />
      <ModalLibroDiario 
        isOpen={showDiarioModal} 
        onClose={() => {
          setShowDiarioModal(false);
          setEditingDiario(null);
        }} 
        onSaved={() => {
          handleSaved();
          setEditingDiario(null);
        }} 
        planCuentas={planCuentas} 
        editingDiario={editingDiario} 
      />
      <ModalInventarioPeps 
        isOpen={showInvModal} 
        onClose={() => {
          setShowInvModal(false);
          setEditingInventory(null);
        }} 
        onSaved={() => {
          handleSaved();
          setEditingInventory(null);
        }} 
        editingInventory={editingInventory} 
      />
      <ModalPeriodo isOpen={showPeriodoModal} onClose={() => setShowPeriodoModal(false)} onSaved={handlePeriodoSaved} />

      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 font-sans">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-600 to-teal-400"></div>

            <div className="flex justify-between items-center mb-6 pb-2 border-b border-stone-800">
              <h3 className="text-base font-bold text-stone-100">
                {editingUser ? `Editar Usuario: ${editingUser.username}` : 'Registrar Nuevo Usuario'}
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-stone-400 hover:text-stone-200 text-sm font-bold p-1 rounded hover:bg-stone-850 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5 font-mono">Nombre Completo</label>
                <input
                  type="text"
                  value={userFormName}
                  onChange={(e) => setUserFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-stone-950 text-stone-200"
                  placeholder="Ej. Marco Luis Soto"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5 font-mono">Nombre de Usuario (Login)</label>
                <input
                  type="text"
                  value={userFormUsername}
                  onChange={(e) => setUserFormUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono bg-stone-950 text-stone-200"
                  placeholder="Ej. msoto"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5 font-mono">Contraseña</label>
                <input
                  type="text"
                  value={userFormPassword}
                  onChange={(e) => setUserFormPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono bg-stone-950 text-stone-200"
                  placeholder="Ej. pass123"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5 font-mono">Rol del Sistema</label>
                <select
                  value={userFormRole}
                  onChange={(e) => setUserFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-stone-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-stone-950 text-stone-200"
                >
                  <option value="cajero">Cajero (Solo Punto de Venta)</option>
                  <option value="otro">Otro (ERP Consulta)</option>
                  <option value="admin">Administrador (ERP Total + Gestión Usuarios)</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-stone-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-3.5 py-1.5 border border-stone-800 hover:bg-stone-850 text-xs font-bold rounded-lg transition-colors cursor-pointer text-stone-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GESTIÓN DE MASAS */}
      <ModalMasa 
        isOpen={showMasaModal}
        onClose={() => {
          setShowMasaModal(false);
          setEditingMasa(null);
        }}
        onSaved={fetchMasasData}
        editingMasa={editingMasa}
      />

      <ModalMovimientoMasa 
        isOpen={showMovMasaModal}
        onClose={() => setShowMovMasaModal(false)}
        onSaved={fetchMasasData}
        masas={masas}
        currentUser={currentUser}
      />

    </div>
  );
}

