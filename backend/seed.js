require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

// ── Schemas ────────────────────────────────────────────────────────────────

const ProductSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  tamil:       { type: String, default: '' },
  slug:        { type: String, required: true, unique: true },
  cat:         { type: String, required: true, enum: ['Oils','Churna','Kadha','Skin','Ghee','Immunity'] },
  emoji:       { type: String, default: '🌿' },
  images:      [{ url: String, publicId: String, alt: String }],
  desc:        { type: String, default: '' },
  price:       { type: Number, required: true },
  oldPrice:    { type: Number },
  badge:       { type: String, enum: ['best','new','sale', null] },
  rating:      { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  stock:       { type: Number, default: 100 },
  weight:      { type: String, default: '' },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true },
  phone:     { type: String },
  role:      { type: String, enum: ['customer','admin'], default: 'customer' },
  addresses: [{ street: String, city: String, pin: String, state: String, isDefault: Boolean }],
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

const CouponSchema = new mongoose.Schema({
  code:          { type: String, required: true, unique: true, uppercase: true },
  discountType:  { type: String, enum: ['percentage','fixed'], required: true },
  discountValue: { type: Number, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount:   { type: Number },
  usageLimit:    { type: Number, default: 0 },
  usedCount:     { type: Number, default: 0 },
  expiresAt:     { type: Date },
  active:        { type: Boolean, default: true },
}, { timestamps: true });

const Product = mongoose.model('Product', ProductSchema);
const User    = mongoose.model('User', UserSchema);
const Coupon  = mongoose.model('Coupon', CouponSchema);

// ── Seed Data ──────────────────────────────────────────────────────────────

const PRODUCTS = [
  {
    name: 'Brahmi Hair Oil', tamil: 'பிரம்மி கேசதைலம்', slug: 'brahmi-hair-oil',
    cat: 'Oils', emoji: '🫙', desc: 'Traditional Brahmi-infused oil for hair growth and scalp nourishment.',
    price: 299, oldPrice: 399, badge: 'best', rating: 4.8, reviewCount: 142, stock: 85, weight: '200ml',
  },
  {
    name: 'Triphala Churna', tamil: 'திரிபலா சூர்ணம்', slug: 'triphala-churna',
    cat: 'Churna', emoji: '🌿', desc: 'Classic three-fruit blend for digestion and detox.',
    price: 199, oldPrice: 250, badge: 'best', rating: 4.7, reviewCount: 98, stock: 120, weight: '100g',
  },
  {
    name: 'Dashmool Kadha', tamil: 'தசமூல கஷாயம்', slug: 'dashmool-kadha',
    cat: 'Kadha', emoji: '🍵', desc: 'Ten-root herbal decoction for joint pain and inflammation.',
    price: 349, oldPrice: null, badge: 'new', rating: 4.6, reviewCount: 45, stock: 60, weight: '500ml',
  },
  {
    name: 'Kumkumadi Tailam', tamil: 'குங்குமாதி தைலம்', slug: 'kumkumadi-tailam',
    cat: 'Skin', emoji: '✨', desc: 'Luxurious saffron face oil for glowing and even-toned skin.',
    price: 599, oldPrice: 799, badge: 'best', rating: 4.9, reviewCount: 210, stock: 40, weight: '30ml',
  },
  {
    name: 'Ashwagandha Churna', tamil: 'அஸ்வகந்தா சூர்ணம்', slug: 'ashwagandha-churna',
    cat: 'Churna', emoji: '💪', desc: 'Adaptogenic root powder for stress relief and vitality.',
    price: 249, oldPrice: 299, badge: 'sale', rating: 4.7, reviewCount: 176, stock: 200, weight: '100g',
  },
  {
    name: 'Medicated Cow Ghee', tamil: 'மருத்துவ நெய்', slug: 'medicated-cow-ghee',
    cat: 'Ghee', emoji: '🧈', desc: 'Pure A2 cow ghee infused with traditional herbs.',
    price: 799, oldPrice: 999, badge: 'best', rating: 4.8, reviewCount: 88, stock: 50, weight: '500g',
  },
  {
    name: 'Neem Nourishing Oil', tamil: 'வேப்ப எண்ணெய்', slug: 'neem-nourishing-oil',
    cat: 'Oils', emoji: '🌱', desc: 'Cold-pressed neem oil for skin and scalp infections.',
    price: 179, oldPrice: null, badge: 'new', rating: 4.5, reviewCount: 33, stock: 150, weight: '100ml',
  },
  {
    name: 'Trikatu Churna', tamil: 'திரிகடு சூர்ணம்', slug: 'trikatu-churna',
    cat: 'Churna', emoji: '🌶️', desc: 'Three-pepper blend to kindle digestive fire and metabolism.',
    price: 149, oldPrice: 199, badge: null, rating: 4.4, reviewCount: 57, stock: 90, weight: '50g',
  },
  {
    name: 'Immunity Kadha', tamil: 'நோய் எதிர்ப்பு கஷாயம்', slug: 'immunity-kadha',
    cat: 'Immunity', emoji: '🛡️', desc: 'Daily immunity booster with tulsi, ginger and giloy.',
    price: 299, oldPrice: 349, badge: 'best', rating: 4.8, reviewCount: 321, stock: 110, weight: '400ml',
  },
  {
    name: 'Turmeric Face Pack', tamil: 'மஞ்சள் முகப்பூச்சு', slug: 'turmeric-face-pack',
    cat: 'Skin', emoji: '🌟', desc: 'Brightening face mask with raw turmeric and chandan.',
    price: 249, oldPrice: 299, badge: 'new', rating: 4.6, reviewCount: 72, stock: 70, weight: '75g',
  },
  {
    name: 'Shatavari Churna', tamil: 'சதாவரி சூர்ணம்', slug: 'shatavari-churna',
    cat: 'Churna', emoji: '🌸', desc: 'Women\'s wellness tonic for hormonal balance and vitality.',
    price: 329, oldPrice: null, badge: 'new', rating: 4.7, reviewCount: 94, stock: 80, weight: '100g',
  },
  {
    name: 'Brahmi Ghrita', tamil: 'பிரம்மி க்ரிதம்', slug: 'brahmi-ghrita',
    cat: 'Ghee', emoji: '🧠', desc: 'Brahmi-infused ghee for memory, focus and mental clarity.',
    price: 699, oldPrice: 849, badge: 'best', rating: 4.9, reviewCount: 115, stock: 45, weight: '250g',
  },
];

const COUPONS = [
  {
    code: 'SIDDHA20',
    discountType: 'percentage',
    discountValue: 20,
    minOrderValue: 0,
    maxDiscount: 500,
    usageLimit: 0,
    active: true,
  },
  {
    code: 'WELCOME100',
    discountType: 'fixed',
    discountValue: 100,
    minOrderValue: 499,
    usageLimit: 1,
    active: true,
  },
];

// ── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');

  // Products
  console.log('📦 Seeding products...');
  await Product.deleteMany({});
  const products = await Product.insertMany(PRODUCTS);
  console.log(`   ✅ ${products.length} products inserted`);

  // Admin user (plain password — change after first login)
  console.log('\n👤 Seeding admin user...');
  await User.deleteMany({ role: 'admin' });
  await User.create({
    name:     'Siddha Valam Admin',
    email:    'admin@siddha-valam.com',
    password: 'Admin@2024',   // Change this immediately after seeding
    role:     'admin',
    isActive: true,
  });
  console.log('   ✅ Admin user created');
  console.log('   📧 Email:    admin@siddha-valam.com');
  console.log('   🔑 Password: Admin@2024  ← Change this!');

  // Coupons
  console.log('\n🏷️  Seeding coupons...');
  await Coupon.deleteMany({});
  const coupons = await Coupon.insertMany(COUPONS);
  console.log(`   ✅ ${coupons.length} coupons inserted (SIDDHA20, WELCOME100)`);

  console.log('\n🎉 Seed complete! Collections in MongoDB:');
  console.log('   • products  →', products.length, 'documents');
  console.log('   • users     → 1 admin document');
  console.log('   • coupons   →', coupons.length, 'documents');

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected. Done.');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
