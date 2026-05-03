require('dotenv').config({ path: '../backend/.env' });
const { Client } = require('pg');
const fs         = require('fs');
const path       = require('path');

const CONNECTION_STRING = process.env.DATABASE_URL;

async function pushSchema() {
  const client = new Client({ connectionString: CONNECTION_STRING });

  console.log('🔌 Connecting to Neon PostgreSQL...');
  await client.connect();
  console.log('✅ Connected\n');

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  console.log('🚀 Pushing schema...');
  await client.query(sql);
  console.log('✅ Schema pushed successfully!\n');

  // Verify tables created
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  console.log('📋 Tables in database:');
  result.rows.forEach(r => console.log('   •', r.table_name));

  // Verify categories seeded
  const cats = await client.query('SELECT name, tamil_name FROM categories ORDER BY sort_order');
  console.log('\n🗂️  Categories seeded:');
  cats.rows.forEach(r => console.log(`   • ${r.name} (${r.tamil_name})`));

  // Verify coupons seeded
  const coupons = await client.query('SELECT code, discount_type, discount_value FROM coupons');
  console.log('\n🏷️  Coupons seeded:');
  coupons.rows.forEach(r => console.log(`   • ${r.code} — ${r.discount_value}${r.discount_type === 'percentage' ? '%' : '₹'} off`));

  await client.end();
  console.log('\n🎉 Done! Your Neon database is ready.');
}

pushSchema().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
