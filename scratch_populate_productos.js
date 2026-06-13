const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://recpbqwsjbmcairosqny.supabase.co', 'sb_publishable_6z0K5wCa61POtgr1sT-MaQ_NprtxSnV');

const products = [
  { nombre: 'Espresso', categoria: 'Cafetería Caliente', precio_venta: 10.00, es_inventariable: false },
  { nombre: 'Doppio (Espresso Doble)', categoria: 'Cafetería Caliente', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Cortado', categoria: 'Cafetería Caliente', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Americano', categoria: 'Cafetería Caliente', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Cappuccino', categoria: 'Cafetería Caliente', precio_venta: 18.00, es_inventariable: false },
  { nombre: 'Cappuccino Doble', categoria: 'Cafetería Caliente', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Latte', categoria: 'Cafetería Caliente', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Flat White', categoria: 'Cafetería Caliente', precio_venta: 18.00, es_inventariable: false },
  { nombre: 'Mocaccino', categoria: 'Cafetería Caliente', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Bombon', categoria: 'Cafetería Caliente', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Matcha Latte', categoria: 'Cafetería Caliente', precio_venta: 18.00, es_inventariable: false },
  { nombre: 'Chai Latte', categoria: 'Cafetería Caliente', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Chocolate', categoria: 'Cafetería Caliente', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Iced Latte', categoria: 'Cafetería Fría', precio_venta: 22.00, es_inventariable: false },
  { nombre: 'Iced Mocaccino', categoria: 'Cafetería Fría', precio_venta: 22.00, es_inventariable: false },
  { nombre: 'Espresso Tonic', categoria: 'Cafetería Fría', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Affogato', categoria: 'Cafetería Fría', precio_venta: 18.00, es_inventariable: false },
  { nombre: 'Cold Brew', categoria: 'Cafetería Fría', precio_venta: 18.00, es_inventariable: false },
  { nombre: 'Smoothie de Café', categoria: 'Cafetería Fría', precio_venta: 24.00, es_inventariable: false },
  { nombre: 'Croissant Relleno', categoria: 'Repostería / Pastelería', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Rollo de Canela', categoria: 'Repostería / Pastelería', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Brownie', categoria: 'Repostería / Pastelería', precio_venta: 14.00, es_inventariable: false },
  { nombre: 'Brownie c/ Helado', categoria: 'Repostería / Pastelería', precio_venta: 18.00, es_inventariable: false },
  { nombre: 'Muffin', categoria: 'Repostería / Pastelería', precio_venta: 12.00, es_inventariable: false },
  { nombre: 'Galleta', categoria: 'Repostería / Pastelería', precio_venta: 8.00, es_inventariable: false },
  { nombre: 'Empanada', categoria: 'Repostería / Pastelería', precio_venta: 10.00, es_inventariable: false },
  { nombre: 'Tiramisú', categoria: 'Repostería / Pastelería', precio_venta: 22.00, es_inventariable: false },
  { nombre: 'Cheesecake', categoria: 'Repostería / Pastelería', precio_venta: 14.00, es_inventariable: false },
  { nombre: 'Sándwich', categoria: 'Repostería / Pastelería', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Soda Floral', categoria: 'Bebidas / Sodas', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Soda de Jamaica', categoria: 'Bebidas / Sodas', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Jugo Natural', categoria: 'Bebidas / Sodas', precio_venta: 15.00, es_inventariable: false },
  { nombre: 'Jugo con Leche', categoria: 'Bebidas / Sodas', precio_venta: 18.00, es_inventariable: false },
  { nombre: 'Agua Embotellada', categoria: 'Bebidas / Sodas', precio_venta: 9.00, es_inventariable: false },
  { nombre: 'Infusión Amazónica', categoria: 'Infusiones', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Infusión Floral', categoria: 'Infusiones', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'Infusión Sultana', categoria: 'Infusiones', precio_venta: 16.00, es_inventariable: false },
  { nombre: 'V-60', categoria: 'Métodos de Extracción', precio_venta: 26.00, es_inventariable: false },
  { nombre: 'Aeropress', categoria: 'Métodos de Extracción', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Prensa Francesa', categoria: 'Métodos de Extracción', precio_venta: 20.00, es_inventariable: false },
  { nombre: 'Bolsa Café 250g (Grano)', categoria: 'Bolsas de Café', precio_venta: 60.00, es_inventariable: true },
  { nombre: 'Bolsa Café 250g (Molido)', categoria: 'Bolsas de Café', precio_venta: 60.00, es_inventariable: true },
  { nombre: 'Bolsa Café 250g JAVA', categoria: 'Bolsas de Café', precio_venta: 90.00, es_inventariable: true },
  { nombre: 'Bolsa Café 500g', categoria: 'Bolsas de Café', precio_venta: 110.00, es_inventariable: true },
  { nombre: 'Bolsa Café 1kg', categoria: 'Bolsas de Café', precio_venta: 200.00, es_inventariable: true }
];

async function main() {
  console.log("Checking if products table is empty...");
  const { data: existing, error: checkError } = await supabase.from('productos').select('id');
  if (checkError) {
    console.error("Check Error:", checkError);
    return;
  }
  
  if (existing && existing.length > 0) {
    console.log(`Table already contains ${existing.length} products. Deleting all first to re-populate...`);
    const { error: delError } = await supabase.from('productos').delete().gt('id', 0);
    if (delError) {
      console.error("Delete Error:", delError);
      return;
    }
  }

  console.log(`Inserting ${products.length} products with real prices...`);
  const { data: inserted, error: insError } = await supabase.from('productos').insert(products).select();
  if (insError) {
    console.error("Insert Error:", insError);
  } else {
    console.log(`Successfully populated ${inserted.length} products!`);
  }
}
main();
