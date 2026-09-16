// Formatea fechas SOLO en Server Components. Si un Client Component formatea
// con Intl/toLocaleString, el ICU del servidor (Node) y del navegador pueden
// producir textos con espacios distintos (NBSP vs espacio normal) para
// "a. m./p. m.", causando errores de hidratación en React.
export function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
}

export function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-BO");
}
