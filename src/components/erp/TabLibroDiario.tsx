import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TabLibroDiarioProps {
  libroDiario: any[];
}

export function TabLibroDiario({ libroDiario }: TabLibroDiarioProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold border-l-4 border-amber-600 pl-3 mb-6">LIBRO DIARIO - ASIENTOS CONTABLES</h2>
        <p className="text-sm text-stone-500 font-mono mb-4">Asientos contables analíticos de la gestión.</p>
      </div>

      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Nro. Asiento</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>Detalle / Glosa</TableHead>
              <TableHead className="text-right">Debe (Bs)</TableHead>
              <TableHead className="text-right">Haber (Bs)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {libroDiario.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-stone-500">No hay asientos registrados en este periodo.</TableCell></TableRow>
            ) : (
              libroDiario.map((asiento, idx) => (
                <TableRow key={asiento.id || idx}>
                  <TableCell className="font-mono font-medium">{asiento.nro_asiento}</TableCell>
                  <TableCell className="text-stone-500">{new Date(asiento.fecha || asiento.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium text-stone-700">{asiento.codigo_cuenta || asiento.cuenta_codigo}</TableCell>
                  <TableCell>{asiento.detalle || asiento.glosa}</TableCell>
                  <TableCell className="text-right font-mono">{Number(asiento.debe || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{Number(asiento.haber || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
