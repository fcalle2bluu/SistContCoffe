import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TabPlanCuentasProps {
  cuentas: any[];
}

export function TabPlanCuentas({ cuentas }: TabPlanCuentasProps) {
  const getBadgeColor = (tipo: string) => {
    switch (tipo?.toUpperCase()) {
      case "ACTIVO": return "bg-blue-950/40 text-blue-400";
      case "PASIVO": return "bg-red-950/40 text-red-400";
      case "PATRIMONIO": return "bg-purple-950/40 text-purple-400";
      case "INGRESO": return "bg-green-950/40 text-green-400";
      case "EGRESO": return "bg-orange-950/40 text-orange-400";
      default: return "bg-stone-800 text-stone-300";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold border-l-4 border-amber-600 pl-3 text-stone-100">PLAN ÚNICO DE CUENTAS (CATÁLOGO)</h2>
          <p className="text-sm text-stone-500 font-mono mt-1">Estructura jerárquica de cuentas contables.</p>
        </div>
      </div>

      <div className="border border-stone-800 rounded-md bg-stone-900">
        <Table>
          <TableHeader className="bg-stone-900">
            <TableRow className="border-stone-800 hover:bg-transparent">
              <TableHead className="w-[150px] text-stone-400 uppercase text-xs">Código</TableHead>
              <TableHead className="text-stone-400 uppercase text-xs">Nombre de la Cuenta</TableHead>
              <TableHead className="text-stone-400 uppercase text-xs">Tipo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuentas.length === 0 ? (
              <TableRow className="border-stone-700 hover:bg-stone-800"><TableCell colSpan={3} className="text-center py-10 text-stone-500">No hay cuentas cargadas.</TableCell></TableRow>
            ) : (
              cuentas.map((cuenta) => (
                <TableRow key={cuenta.codigo} className="border-stone-700 hover:bg-stone-800">
                  <TableCell className="font-mono font-medium text-stone-200">{cuenta.codigo}</TableCell>
                  <TableCell className="font-medium text-stone-200">{cuenta.nombre}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getBadgeColor(cuenta.tipo)}`}>
                      {cuenta.tipo}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
