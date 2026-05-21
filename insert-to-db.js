require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    console.log("Reading inserts.json...");
    const data = JSON.parse(fs.readFileSync('inserts.json', 'utf8'));
    console.log(`Found ${data.length} records to insert.`);
    
    // We can insert them in chunks to avoid overwhelming the database
    const chunkSize = 100;
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        
        console.log(`Inserting chunk ${i/chunkSize + 1} of ${Math.ceil(data.length/chunkSize)}...`);
        
        const { error } = await supabase.from('libro_diario').insert(chunk);
        
        if (error) {
            console.error("Error inserting chunk:", JSON.stringify(error, null, 2));
            return;
        }
    }
    
    console.log("✅ Successfully inserted all records into libro_diario!");
}

main();
