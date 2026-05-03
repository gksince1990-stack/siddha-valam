// ══════════════════════════════════════════════════════════════
//  சித்த வளம் (Siddha Valam) — Backend Server
//  Node.js + Express + MongoDB
// ══════════════════════════════════════════════════════════════

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve admin panel at /admin
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// ─── MONGODB CONNECTION ──────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/siddha-valam')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err));

// ─── MODELS ──────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  tamil:    { type: String },
  cat:      { type: String, required: true },
  emoji:    { type: String, default: '🌿' },
  desc:     { type: String },
  price:    { type: Number, required: true },
  oldPrice: { type: Number, default: null },
  badge:    { type: String, default: null },  // 'best' | 'new' | 'sale' | null
  rating:   { type: Number, default: 4.5 },
  reviews:  { type: Number, default: 0 },
  stock:    { type: Number, default: 100 },
  weight:   { type: String, default: '' },
  active:   { type: Boolean, default: true },
  // ✏️  ADD NEW FIELDS HERE — just add a new line below:
  // expiryDate: { type: String, default: '' },
  // ingredients: { type: String, default: '' },
  // discount: { type: Number, default: 0 },
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
    id:    Number,
    name:  String,
    emoji: String,
    price: Number,
    qty:   Number,
  }],
  total:          { type: Number },
  payMethod:      { type: String, default: 'razorpay' },
  status:         { type: String, default: 'pending', enum: ['pending','processing','shipped','delivered','cancelled'] },
  paymentStatus:  { type: String, default: 'pending' },
  razorpayOrderId:  String,
  razorpayPaymentId: String,
  // ✏️  ADD NEW ORDER FIELDS HERE:
  // deliveryNotes: { type: String, default: '' },
  // couponUsed: { type: String, default: '' },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
const Order   = mongoose.model('Order', orderSchema);

// ─── RAZORPAY ────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || 'YOUR_KEY_ID',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET',
});

// ─── HELPER: Generate Order ID ───────────────────────────────
function generateOrderId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `SV${Date.now().toString().slice(-4)}${num}`;
}

// ══════════════════════════════════════════════════════════════
//  PRODUCT ROUTES
// ══════════════════════════════════════════════════════════════

// GET all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({ active: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create product (Admin only)
app.post('/api/products', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT update product (Admin only)
app.put('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE product (Admin only)
app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ORDER ROUTES
// ══════════════════════════════════════════════════════════════

// GET all orders (Admin)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single order
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create order (COD)
app.post('/api/orders', async (req, res) => {
  try {
    const orderId = generateOrderId();
    const order = new Order({ ...req.body, orderId });
    await order.save();
    console.log(`📦 New Order: ${orderId} — ₹${order.total} — ${order.customer.name}`);
    res.json({ success: true, orderId, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST create Razorpay payment order
app.post('/api/orders/create-payment', async (req, res) => {
  try {
    const { amount, currency = 'INR', orderData } = req.body;
    const razorpayOrder = await razorpay.orders.create({
      amount,           // amount in paise (rupees × 100)
      currency,
      receipt: generateOrderId(),
    });
    // Save pending order
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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET')
      .update(body)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }

    // Update order as paid
    await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { paymentStatus: 'paid', razorpayPaymentId: razorpay_payment_id, status: 'processing' }
    );
    console.log(`✅ Payment verified: ${razorpay_payment_id}`);
    res.json({ success: true, message: 'Payment verified' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH update order status (Admin)
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await Order.findOneAndUpdate({ orderId: req.params.id }, { status });
    console.log(`📋 Order ${req.params.id} → ${status}`);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
//  CATCH-ALL: serve index.html for all other routes
// ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`🌿 சித்த வளம் server running at http://localhost:${PORT}`);
  console.log(`🧑‍💼 Admin panel at http://localhost:${PORT}/admin`);
});
