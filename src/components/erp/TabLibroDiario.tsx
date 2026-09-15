import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TabLibroDiarioProps {
  libroDiario: any[];
}

export function TabLibroDiario({ libroDiario }: TabLibroDiarioProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold border-l-4 border-amber-600 pl-3 mb-6 text-stone-100">LIBRO DIARIO - ASIENTOS CONTABLES</h2>
        <p className="text-sm text-stone-500 font-mono mb-4">Asientos contables analíticos de la gestión.</p>
      </div>

      <div className="border border-stone-800 rounded-md bg-stone-900">
        <Table>
          <TableHeader className="bg-stone-900">
            <TableRow className="border-stone-800 hover:bg-transparent">
              <TableHead className="w-[100px] text-stone-400 uppercase text-xs">Nro. Asiento</TableHead>
              <TableHead className="text-stone-400 uppercase text-xs">Fecha</TableHead>
              <TableHead className="text-stone-400 uppercase text-xs">Cuenta</TableHead>
              <TableHead className="text-stone-400 uppercase text-xs">Detalle / Glosa</TableHead>
              <TableHead className="text-right text-stone-400 uppercase text-xs">Debe (Bs)</TableHead>
              <TableHead className="text-right text-stone-400 uppercase text-xs">Haber (Bs)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {libroDiario.length === 0 ? (
              <TableRow className="border-stone-850 hover:bg-stone-850"><TableCell colSpan={6} className="text-center py-10 text-stone-500">No hay asientos registrados en este periodo.</TableCell></TableRow>
            ) : (
              libroDiario.map((asiento, idx) => (
                <TableRow key={asiento.id || idx} className="border-stone-850 hover:bg-stone-850">
                  <TableCell className="font-mono font-medium text-stone-200">{asiento.nro_asiento}</TableCell>
                  <TableCell className="text-stone-500">{new Date(asiento.fecha || asiento.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium text-stone-200">{asiento.codigo_cuenta || asiento.cuenta_codigo}</TableCell>
                  <TableCell className="text-stone-200">{asiento.detalle || asiento.glosa}</TableCell>
                  <TableCell className="text-right font-mono text-amber-400">{Number(asiento.debe || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-amber-400">{Number(asiento.haber || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
