import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TabPlanCuentasProps {
  cuentas: any[];
}

export function TabPlanCuentas({ cuentas }: TabPlanCuentasProps) {
  const getBadgeColor = (tipo: string) => {
    switch (tipo?.toUpperCase()) {
      case "ACTIVO": return "bg-blue-100 text-blue-800";
      case "PASIVO": return "bg-red-100 text-red-800";
      case "PATRIMONIO": return "bg-purple-100 text-purple-800";
      case "INGRESO": return "bg-green-100 text-green-800";
      case "EGRESO": return "bg-orange-100 text-orange-800";
      default: return "bg-stone-100 text-stone-800";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold border-l-4 border-amber-600 pl-3">PLAN ÚNICO DE CUENTAS (CATÁLOGO)</h2>
          <p className="text-sm text-stone-500 font-mono mt-1">Estructura jerárquica de cuentas contables.</p>
        </div>
      </div>

      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Código</TableHead>
              <TableHead>Nombre de la Cuenta</TableHead>
              <TableHead>Tipo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuentas.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center py-10 text-stone-500">No hay cuentas cargadas.</TableCell></TableRow>
            ) : (
              cuentas.map((cuenta) => (
                <TableRow key={cuenta.codigo}>
                  <TableCell className="font-mono font-medium">{cuenta.codigo}</TableCell>
                  <TableCell className="font-medium text-stone-700">{cuenta.nombre}</TableCell>
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
