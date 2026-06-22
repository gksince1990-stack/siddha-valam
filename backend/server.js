// ══════════════════════════════════════════════════════════════
//  சித்த வளம் (Siddha Valam) — Backend Server
//  Node.js + Express + MongoDB + Image Upload + Stock Management
// ══════════════════════════════════════════════════════════════

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const path       = require('path');
const Razorpay   = require('razorpay');
const nodemailer = require('nodemailer');
const crypto   = require('crypto');
const multer   = require('multer');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve admin panel at /admin
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// ─── MULTER — Image Upload ───────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `product_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ─── MONGODB CONNECTION ──────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/siddha-valam')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err));

// ─── MODELS ──────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  tamil:       { type: String },
  cat:         { type: String, required: true },
  emoji:       { type: String, default: '🌿' },
  image:       { type: String, default: '' },
  desc:        { type: String },
  ingredients: { type: String, default: '' },
  howToUse:    { type: String, default: '' },
  price:       { type: Number, required: true },
  oldPrice:    { type: Number, default: null },
  badge:       { type: String, default: null },
  rating:      { type: Number, default: 4.5 },
  reviews:     { type: Number, default: 0 },
  stock:       { type: Number, default: 100 },
  weight:      { type: String, default: '' },
  featured:    { type: Boolean, default: false },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

const customerSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  phone:     { type: String, default: '' },
  password:  { type: String, required: true },
  addresses: [{ street: String, city: String, state: String, pin: String, label: String }],
}, { timestamps: true });

const couponSchema = new mongoose.Schema({
  code:      { type: String, required: true, unique: true, uppercase: true },
  type:      { type: String, enum: ['percent','flat'], default: 'percent' },
  value:     { type: Number, required: true },
  minOrder:  { type: Number, default: 0 },
  maxUses:   { type: Number, default: 1000 },
  usedCount: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null },
  active:    { type: Boolean, default: true },
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  orderId:       { type: String, unique: true },
  customer: {
    name:    String,
    phone:   String,
    email:   String,
    address: {
      street: String,
      city:   String,
      pin:    String,
      state:  String,
    }
  },
  items: [{
    id:    mongoose.Schema.Types.Mixed,
    name:  String,
    emoji: String,
    price: Number,
    qty:   Number,
  }],
  total:             { type: Number },
  payMethod:         { type: String, default: 'razorpay' },
  status:            { type: String, default: 'pending', enum: ['pending','processing','shipped','delivered','cancelled'] },
  paymentStatus:     { type: String, default: 'pending' },
  razorpayOrderId:   String,
  razorpayPaymentId: String,
  trackingNumber:    { type: String, default: '' },
}, { timestamps: true });

const subscriberSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  subscribedAt: { type: Date, default: Date.now },
  active:       { type: Boolean, default: true }
});

const Product    = mongoose.model('Product',    productSchema);
const Order      = mongoose.model('Order',      orderSchema);
const Coupon     = mongoose.model('Coupon',     couponSchema);
const Customer   = mongoose.model('Customer',   customerSchema);
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// ─── NODEMAILER TRANSPORTER ──────────────────────────────────
function getMailer() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

// ─── RAZORPAY ────────────────────────────────────────────────
const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID     || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const razorpayReady = RAZORPAY_KEY_ID.startsWith('rzp_');

const razorpay = new Razorpay({
  key_id:     RAZORPAY_KEY_ID     || 'placeholder',
  key_secret: RAZORPAY_KEY_SECRET || 'placeholder',
});

function generateOrderId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `SV${Date.now().toString().slice(-4)}${num}`;
}

// ─── STOCK HELPER ────────────────────────────────────────────
async function deductStock(items) {
  for (const item of items) {
    await Product.findByIdAndUpdate(
      item.id,
      { $inc: { stock: -item.qty } }
    );
  }
}

// ══════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════

app.get('/api/config', (req, res) => {
  res.json({ razorpayReady, razorpayKeyId: razorpayReady ? RAZORPAY_KEY_ID : null });
});

// ══════════════════════════════════════════════════════════════
//  IMAGE UPLOAD
// ══════════════════════════════════════════════════════════════

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, filename: req.file.filename, url: `/uploads/${req.file.filename}` });
});

// Delete old image when product image is replaced
app.delete('/api/upload/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════
//  PRODUCT ROUTES
// ══════════════════════════════════════════════════════════════

app.get('/api/products', async (req, res) => {
  try {
    const filter = { active: true };
    if (req.query.featured === 'true') filter.featured = true;
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product && product.image) {
      const imgPath = path.join(__dirname, 'uploads', product.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    await Product.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true, message: 'Product removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Low-stock alert endpoint ──────────────────────────────────
app.get('/api/products/alerts/low-stock', async (req, res) => {
  try {
    const low = await Product.find({ active: true, stock: { $lte: 10 } }).select('name stock emoji');
    res.json({ success: true, data: low });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ORDER ROUTES
// ══════════════════════════════════════════════════════════════

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create order (COD or Sandbox)
app.post('/api/orders', async (req, res) => {
  try {
    // Check stock for all items first
    for (const item of (req.body.items || [])) {
      const product = await Product.findById(item.id);
      if (product && product.stock < item.qty) {
        return res.status(400).json({ success: false, error: `"${item.name}" is out of stock` });
      }
    }
    const orderId = generateOrderId();
    const order = new Order({ ...req.body, orderId });
    await order.save();
    await deductStock(req.body.items || []);
    console.log(`📦 New Order: ${orderId} — ₹${order.total} — ${order.customer?.name}`);
    res.json({ success: true, orderId, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST create Razorpay payment order
app.post('/api/orders/create-payment', async (req, res) => {
  try {
    const { amount, currency = 'INR', orderData } = req.body;
    const razorpayOrder = await razorpay.orders.create({ amount, currency, receipt: generateOrderId() });
    const orderId = generateOrderId();
    const order = new Order({
      ...orderData,
      orderId,
      razorpayOrderId: razorpayOrder.id,
      status: 'pending',
      paymentStatus: 'pending',
    });
    await order.save();
    res.json({ success: true, razorpayOrderId: razorpayOrder.id, orderId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST verify Razorpay payment
app.post('/api/orders/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = req.body;
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET || 'placeholder')
      .update(body)
      .digest('hex');
    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { paymentStatus: 'paid', razorpayPaymentId: razorpay_payment_id, status: 'processing' },
      { new: true }
    );
    if (order) await deductStock(order.items || []);
    console.log(`✅ Payment verified: ${razorpay_payment_id}`);
    res.json({ success: true, message: 'Payment verified' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH update order status (Admin)
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status, trackingNumber } = req.body;
    const update = { status };
    if (trackingNumber !== undefined) update.trackingNumber = trackingNumber;
    await Order.findOneAndUpdate({ orderId: req.params.id }, update);
    console.log(`📋 Order ${req.params.id} → ${status}`);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  STATS (Dashboard)
// ══════════════════════════════════════════════════════════════
app.get('/api/stats', async (req, res) => {
  try {
    const [totalOrders, totalProducts, pendingOrders, recentOrders, revenue] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments({ active: true }),
      Order.countDocuments({ status: 'pending' }),
      Order.find().sort({ createdAt: -1 }).limit(5),
      Order.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    ]);
    res.json({ success: true, data: { totalOrders, totalProducts, pendingOrders, recentOrders, totalRevenue: revenue[0]?.total || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  CUSTOMERS (aggregated from orders)
// ══════════════════════════════════════════════════════════════
app.get('/api/customers', async (req, res) => {
  try {
    const orders = await Order.find({}, 'customer items total createdAt orderId').sort({ createdAt: -1 });
    const map = {};
    orders.forEach(o => {
      const key = o.customer?.phone || o.customer?.email || o.customer?.name;
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          name:      o.customer.name,
          phone:     o.customer.phone,
          email:     o.customer.email,
          addresses: [],
          orders:    [],
          totalSpent: 0,
          firstOrder: o.createdAt,
          lastOrder:  o.createdAt,
        };
      }
      // Collect unique addresses
      const addr = o.customer.address;
      if (addr) {
        const addrKey = `${addr.street}|${addr.pin}`;
        if (!map[key].addresses.find(a => `${a.street}|${a.pin}` === addrKey)) {
          map[key].addresses.push(addr);
        }
      }
      map[key].orders.push({ orderId: o.orderId, total: o.total, date: o.createdAt, itemCount: o.items?.length || 0 });
      map[key].totalSpent += o.total || 0;
      if (new Date(o.createdAt) > new Date(map[key].lastOrder)) map[key].lastOrder = o.createdAt;
    });
    res.json({ success: true, data: Object.values(map) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  COUPON ROUTES
// ══════════════════════════════════════════════════════════════
app.get('/api/coupons', async (req, res) => {
  try {
    const coupons = await Coupon.find({ active: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: coupons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/coupons', async (req, res) => {
  try {
    const coupon = new Coupon(req.body);
    await coupon.save();
    res.json({ success: true, data: coupon });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/coupons/:id', async (req, res) => {
  try {
    await Coupon.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Validate coupon at checkout
app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true });
    if (!coupon) return res.json({ success: false, error: 'Invalid coupon code' });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return res.json({ success: false, error: 'Coupon has expired' });
    if (coupon.usedCount >= coupon.maxUses) return res.json({ success: false, error: 'Coupon usage limit reached' });
    if (orderTotal < coupon.minOrder) return res.json({ success: false, error: `Minimum order ₹${coupon.minOrder} required` });
    const discount = coupon.type === 'percent' ? Math.round(orderTotal * coupon.value / 100) : coupon.value;
    res.json({ success: true, discount, type: coupon.type, value: coupon.value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════════

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    const existing = await Customer.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, error: 'An account with this email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const customer = new Customer({ name, email: email.toLowerCase(), phone: phone || '', password: hashed });
    await customer.save();
    const user = { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone };
    console.log(`👤 New customer: ${name} (${email})`);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password are required' });
    const customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) return res.status(401).json({ success: false, error: 'No account found with this email' });
    const valid = await bcrypt.compare(password, customer.password);
    if (!valid) return res.status(401).json({ success: false, error: 'Incorrect password' });
    const user = { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone };
    console.log(`✅ Login: ${customer.name} (${email})`);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get profile
app.get('/api/auth/profile/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).select('-password');
    if (!customer) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user: customer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save address to profile
app.post('/api/auth/address/:id', async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $push: { addresses: req.body } },
      { new: true }
    ).select('-password');
    res.json({ success: true, addresses: customer.addresses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  REGISTERED CUSTOMERS (from Customer model, merged with orders)
// ══════════════════════════════════════════════════════════════
app.get('/api/registered-customers', async (req, res) => {
  try {
    const customers = await Customer.find().select('-password').sort({ createdAt: -1 });
    const orders    = await Order.find({}, 'customer items total createdAt orderId');

    const result = customers.map(c => {
      const custOrders = orders.filter(o =>
        (o.customer?.email && o.customer.email === c.email) ||
        (o.customer?.phone && o.customer.phone === c.phone)
      );
      const totalSpent = custOrders.reduce((s, o) => s + (o.total || 0), 0);
      const addrSet = {};
      custOrders.forEach(o => {
        if (o.customer?.address) {
          const k = `${o.customer.address.street}|${o.customer.address.pin}`;
          if (!addrSet[k]) addrSet[k] = o.customer.address;
        }
      });
      const allAddresses = [...(c.addresses || []), ...Object.values(addrSet)];
      // deduplicate by street+pin
      const seen = new Set();
      const addresses = allAddresses.filter(a => {
        const k = `${a.street}|${a.pin}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      return {
        id:         c._id,
        name:       c.name,
        email:      c.email,
        phone:      c.phone,
        addresses,
        orderCount: custOrders.length,
        totalSpent,
        orders: custOrders.map(o => ({ orderId: o.orderId, total: o.total, date: o.createdAt, itemCount: o.items?.length || 0 })),
        registeredAt: c.createdAt,
        lastOrder: custOrders.length ? custOrders.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))[0].createdAt : null
      };
    });
    res.json({ success: true, data: result, total: result.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  SUBSCRIBERS
// ══════════════════════════════════════════════════════════════

// Subscribe (public)
app.post('/api/subscribers', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ success: false, error: 'Valid email required' });
    const existing = await Subscriber.findOne({ email });
    if (existing) {
      if (!existing.active) { existing.active = true; await existing.save(); }
      return res.json({ success: true, message: 'Already subscribed! Welcome back.' });
    }
    await new Subscriber({ email }).save();
    console.log(`📧 New subscriber: ${email}`);
    res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all subscribers (admin)
app.get('/api/subscribers', async (req, res) => {
  try {
    const subs = await Subscriber.find().sort({ subscribedAt: -1 });
    res.json({ success: true, data: subs, total: subs.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Unsubscribe / delete
app.delete('/api/subscribers/:id', async (req, res) => {
  try {
    await Subscriber.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send blast email to all active subscribers (admin)
app.post('/api/subscribers/send-blast', async (req, res) => {
  try {
    const { subject, message, imageUrl } = req.body;
    if (!subject || !message) return res.status(400).json({ success: false, error: 'Subject and message required' });

    const subs = await Subscriber.find({ active: true });
    if (!subs.length) return res.json({ success: false, error: 'No active subscribers' });

    const emails = subs.map(s => s.email);
    const htmlBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#FAF7F0;border-radius:12px;overflow:hidden">
        <div style="background:#1E3A1E;padding:24px;text-align:center">
          <div style="font-size:22px;color:white;font-weight:600">சித்த வளம்</div>
          <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,0.5);text-transform:uppercase">Siddha Valam</div>
        </div>
        ${imageUrl ? `<img src="${imageUrl}" style="width:100%;max-height:300px;object-fit:cover">` : ''}
        <div style="padding:32px">
          <h2 style="color:#1E3A1E;margin-bottom:16px">${subject}</h2>
          <div style="font-size:15px;color:#7A6550;line-height:1.8;white-space:pre-wrap">${message}</div>
          <div style="margin-top:32px;text-align:center">
            <a href="http://localhost:3000" style="background:#1E3A1E;color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Shop Now 🌿</a>
          </div>
        </div>
        <div style="background:#E2D5C0;padding:16px;text-align:center;font-size:12px;color:#7A6550">
          You received this because you subscribed at சித்த வளம் · <a href="#" style="color:#C8762A">Unsubscribe</a>
        </div>
      </div>`;

    const mailer = getMailer();
    if (mailer) {
      await mailer.sendMail({
        from: `"சித்த வளம்" <${process.env.SMTP_USER}>`,
        bcc: emails,
        subject,
        html: htmlBody
      });
      console.log(`📬 Blast sent to ${emails.length} subscribers`);
      res.json({ success: true, sent: emails.length, message: `Email sent to ${emails.length} subscribers` });
    } else {
      // SMTP not configured — log preview
      console.log(`\n📬 BLAST PREVIEW (SMTP not configured)\nTo: ${emails.join(', ')}\nSubject: ${subject}\nMessage: ${message}\n`);
      res.json({ success: true, sent: emails.length, preview: true, message: `Preview logged to console. Configure SMTP_USER + SMTP_PASS in .env to send real emails.` });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── OTP Store (in-memory) ─────────────────────────────────────
const otpStore = new Map(); // phone -> { otp, expires }

// Send OTP
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone number required' });
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(phone, { otp, expires: Date.now() + 10 * 60 * 1000 });
    console.log(`\n📱 OTP for ${phone}: ✦ ${otp} ✦  (valid 10 min)\n`);
    res.json({ success: true, message: 'OTP sent', devOtp: otp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phone, otp, name } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, error: 'Phone and OTP required' });
    const record = otpStore.get(phone);
    if (!record) return res.status(400).json({ success: false, error: 'OTP expired or not sent. Please resend.' });
    if (Date.now() > record.expires) { otpStore.delete(phone); return res.status(400).json({ success: false, error: 'OTP expired. Please resend.' }); }
    if (record.otp !== String(otp)) return res.status(400).json({ success: false, error: 'Incorrect OTP. Try again.' });
    otpStore.delete(phone);
    let customer = await Customer.findOne({ phone });
    if (!customer) {
      customer = new Customer({ name: name || 'Customer', phone, email: '', password: await bcrypt.hash(Math.random().toString(36), 6) });
      await customer.save();
    }
    const user = { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone };
    console.log(`✅ Phone login: ${phone}`);
    res.json({ success: true, user, isNew: !customer.email });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Auth
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    let customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) {
      customer = new Customer({ name: name || email.split('@')[0], email: email.toLowerCase(), phone: '', password: await bcrypt.hash(Math.random().toString(36), 6) });
      await customer.save();
      console.log(`👤 New Google customer: ${email}`);
    }
    const user = { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone };
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Orders — filter by status support ────────────────────────
// (override GET /api/orders to support ?status= filter)
// Already defined above; Express uses the first matching route,
// so add a separate route for filtered orders via query params
// The existing /api/orders already returns all; filtering is done client-side.

// ─── CATCH-ALL ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`🌿 சித்த வளம் server running at http://localhost:${PORT}`);
  console.log(`🧑‍💼 Admin panel at http://localhost:${PORT}/admin`);
});
