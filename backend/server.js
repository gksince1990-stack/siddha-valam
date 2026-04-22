// ══════════════════════════════════════════════════════════════
//  சித்த வளம் (Siddha Valam) — Production Backend v2
//  Node.js + Express + MongoDB + Razorpay + WhatsApp + SMS
// ══════════════════════════════════════════════════════════════

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const path       = require('path');
const Razorpay   = require('razorpay');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// ─── MONGODB ─────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/siddha-valam')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err));

// ─── MODELS ──────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  tamil:       { type: String },
  cat:         { type: String, required: true },
  emoji:       { type: String, default: '🌿' },
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
  active:      { type: Boolean, default: true },
  featured:    { type: Boolean, default: false },
  // ✏️ ADD NEW FIELDS HERE:
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  orderId:     { type: String, unique: true },
  customer: {
    name:    String,
    phone:   String,
    email:   String,
    address: { street: String, city: String, pin: String, state: String }
  },
  items: [{ id: mongoose.Schema.Types.Mixed, name: String, emoji: String, price: Number, qty: Number }],
  subtotal:          { type: Number },
  discount:          { type: Number, default: 0 },
  shipping:          { type: Number, default: 60 },
  total:             { type: Number },
  couponCode:        { type: String, default: '' },
  payMethod:         { type: String, default: 'razorpay' },
  status:            { type: String, default: 'pending', enum: ['pending','processing','shipped','delivered','cancelled'] },
  paymentStatus:     { type: String, default: 'pending' },
  razorpayOrderId:   String,
  razorpayPaymentId: String,
  trackingNumber:    { type: String, default: '' },
  notes:             { type: String, default: '' },
  // ✏️ ADD NEW ORDER FIELDS HERE:
}, { timestamps: true });

const couponSchema = new mongoose.Schema({
  code:       { type: String, required: true, unique: true, uppercase: true },
  type:       { type: String, enum: ['percent','flat'], default: 'percent' },
  value:      { type: Number, required: true },
  minOrder:   { type: Number, default: 0 },
  maxUses:    { type: Number, default: 1000 },
  usedCount:  { type: Number, default: 0 },
  active:     { type: Boolean, default: true },
  expiresAt:  { type: Date, default: null },
}, { timestamps: true });

const subscriberSchema = new mongoose.Schema({
  email: { type: String, unique: true, lowercase: true },
}, { timestamps: true });

const Product    = mongoose.model('Product',    productSchema);
const Order      = mongoose.model('Order',      orderSchema);
const Coupon     = mongoose.model('Coupon',     couponSchema);
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// ─── RAZORPAY ────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || 'YOUR_KEY_ID',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET',
});

// ─── EMAIL ────────────────────────────────────────────────────
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

async function sendEmail(to, subject, html) {
  if (!transporter) return;
  try {
    await transporter.sendMail({ from: `சித்த வளம் <${process.env.EMAIL_USER}>`, to, subject, html });
    console.log(`📧 Email sent to ${to}`);
  } catch (e) { console.log('Email error:', e.message); }
}

// ─── WHATSAPP via Twilio ─────────────────────────────────────
async function sendWhatsApp(to, message) {
  if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN) return;
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`;
    const body = new URLSearchParams({
      From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM || '+14155238886'}`,
      To:   `whatsapp:+91${to.replace(/\D/g, '').slice(-10)}`,
      Body: message
    });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_SID}:${process.env.TWILIO_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const data = await resp.json();
    if (data.sid) console.log(`💬 WhatsApp sent to ${to}`);
    else console.log('WhatsApp error:', data.message);
  } catch (e) { console.log('WhatsApp error:', e.message); }
}

// ─── SMS via Twilio ───────────────────────────────────────────
async function sendSMS(to, message) {
  if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN || !process.env.TWILIO_SMS_FROM) return;
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`;
    const body = new URLSearchParams({
      From: process.env.TWILIO_SMS_FROM,
      To:   `+91${to.replace(/\D/g, '').slice(-10)}`,
      Body: message
    });
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_SID}:${process.env.TWILIO_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    console.log(`📱 SMS sent to ${to}`);
  } catch (e) { console.log('SMS error:', e.message); }
}

// ─── ORDER NOTIFICATIONS ──────────────────────────────────────
async function notifyNewOrder(order) {
  const itemsList = order.items.map(i => `${i.emoji} ${i.name} x${i.qty} = ₹${i.price * i.qty}`).join('\n');
  const waMsg = `🌿 *சித்த வளம் — Order Confirmed!*\n\nHi ${order.customer.name},\n\nYour order *${order.orderId}* is confirmed!\n\n${itemsList}\n\n💰 Total: ₹${order.total}\n📦 We'll deliver to ${order.customer.address.city} in 2-4 days.\n\nThank you for choosing Siddha Valam! 🙏`;
  
  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FAF7F0">
      <div style="background:#1E3A1E;padding:24px 32px">
        <h1 style="color:white;margin:0;font-size:22px">சித்த வளம் 🌿</h1>
        <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px">Order Confirmed!</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#1E3A1E">Thank you, ${order.customer.name}! 🙏</h2>
        <p style="color:#7A6550">Your order <strong>${order.orderId}</strong> has been placed successfully.</p>
        <div style="background:white;border:1px solid #E2D5C0;border-radius:8px;padding:20px;margin:20px 0">
          ${order.items.map(i => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0e8d8"><span>${i.emoji} ${i.name} × ${i.qty}</span><strong>₹${i.price * i.qty}</strong></div>`).join('')}
          <div style="display:flex;justify-content:space-between;padding:12px 0 0;font-size:18px;color:#1E3A1E"><strong>Total</strong><strong>₹${order.total}</strong></div>
        </div>
        <p style="color:#7A6550"><strong>Delivery Address:</strong><br>${order.customer.address.street}, ${order.customer.address.city} — ${order.customer.address.pin}, ${order.customer.address.state}</p>
        <p style="color:#7A6550">Expected delivery: <strong>2–4 business days</strong></p>
        <p style="color:#C8762A;font-size:13px">For queries, WhatsApp us at ${process.env.SHOP_WHATSAPP || '+91 99628 05303'}</p>
      </div>
    </div>`;

  await sendWhatsApp(order.customer.phone, waMsg);
  await sendSMS(order.customer.phone, `சித்த வளம்: Order ${order.orderId} confirmed! Total ₹${order.total}. Delivery in 2-4 days. Thank you!`);
  await sendEmail(order.customer.email, `Order Confirmed — ${order.orderId} | சித்த வளம்`, emailHtml);
}

async function notifyStatusUpdate(order) {
  const statusEmoji = { processing:'⚙️', shipped:'🚚', delivered:'✅', cancelled:'❌' };
  const msg = `${statusEmoji[order.status]||'📦'} *சித்த வளம்* — Order ${order.orderId} is now *${order.status.toUpperCase()}*!${order.trackingNumber ? `\n\n🔍 Tracking: ${order.trackingNumber}` : ''}\n\nThank you for shopping with us! 🌿`;
  await sendWhatsApp(order.customer.phone, msg);
  await sendSMS(order.customer.phone, `Siddha Valam: Order ${order.orderId} is now ${order.status.toUpperCase()}.${order.trackingNumber ? ` Track: ${order.trackingNumber}` : ''}`);
}

// ─── HELPERS ─────────────────────────────────────────────────
function genOrderId() {
  return `SV${Date.now().toString().slice(-5)}${Math.floor(1000 + Math.random() * 9000)}`;
}

// ══════════════════════════════════════════════════════════════
//  API ROUTES
// ══════════════════════════════════════════════════════════════

// ── PRODUCTS ──────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const filter = { active: true };
    if (req.query.cat && req.query.cat !== 'All') filter.cat = req.query.cat;
    if (req.query.featured === 'true') filter.featured = true;
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: product });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = await new Product(req.body).save();
    res.json({ success: true, data: product });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: product });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── COUPONS ───────────────────────────────────────────────────
app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true });
    if (!coupon) return res.json({ success: false, error: 'Invalid coupon code' });
    if (coupon.expiresAt && new Date() > coupon.expiresAt) return res.json({ success: false, error: 'Coupon expired' });
    if (coupon.usedCount >= coupon.maxUses) return res.json({ success: false, error: 'Coupon limit reached' });
    if (orderTotal < coupon.minOrder) return res.json({ success: false, error: `Min order ₹${coupon.minOrder}` });
    const discount = coupon.type === 'percent'
      ? Math.round(orderTotal * coupon.value / 100)
      : coupon.value;
    res.json({ success: true, discount, type: coupon.type, value: coupon.value });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/coupons', async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ success: true, data: coupons });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/coupons', async (req, res) => {
  try {
    const coupon = await new Coupon(req.body).save();
    res.json({ success: true, data: coupon });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

app.delete('/api/coupons/:id', async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── ORDERS ────────────────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// COD order
app.post('/api/orders', async (req, res) => {
  try {
    const orderId = genOrderId();
    const order = await new Order({ ...req.body, orderId }).save();
    console.log(`📦 New Order: ${orderId} — ₹${order.total} — ${order.customer.name}`);
    // Update coupon usage
    if (req.body.couponCode) {
      await Coupon.findOneAndUpdate({ code: req.body.couponCode.toUpperCase() }, { $inc: { usedCount: 1 } });
    }
    await notifyNewOrder(order);
    res.json({ success: true, orderId, data: order });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// Razorpay payment
app.post('/api/orders/create-payment', async (req, res) => {
  try {
    const { amount, currency = 'INR', orderData } = req.body;
    const razorpayOrder = await razorpay.orders.create({ amount, currency, receipt: genOrderId() });
    const orderId = genOrderId();
    const order = await new Order({
      ...orderData,
      orderId,
      razorpayOrderId: razorpayOrder.id,
      status: 'pending',
      paymentStatus: 'pending'
    }).save();
    res.json({ success: true, razorpayOrderId: razorpayOrder.id, orderId, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/orders/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    if (expected !== razorpay_signature)
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { paymentStatus: 'paid', razorpayPaymentId: razorpay_payment_id, status: 'processing' },
      { new: true }
    );
    if (order) await notifyNewOrder(order);
    console.log(`✅ Payment verified: ${razorpay_payment_id}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status, trackingNumber } = req.body;
    const update = { status };
    if (trackingNumber) update.trackingNumber = trackingNumber;
    const order = await Order.findOneAndUpdate({ orderId: req.params.id }, update, { new: true });
    if (order) await notifyStatusUpdate(order);
    console.log(`📋 Order ${req.params.id} → ${status}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── STATS (Admin Dashboard) ───────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [totalOrders, totalRevArr, totalProducts, recentOrders] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
      Product.countDocuments({ active: true }),
      Order.find().sort({ createdAt: -1 }).limit(5),
    ]);
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const totalRevenue = totalRevArr[0]?.total || 0;
    res.json({ success: true, data: { totalOrders, totalRevenue, totalProducts, pendingOrders, recentOrders } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── NEWSLETTER ────────────────────────────────────────────────
app.post('/api/subscribe', async (req, res) => {
  try {
    await new Subscriber({ email: req.body.email }).save();
    res.json({ success: true });
  } catch (err) {
    if (err.code === 11000) return res.json({ success: true }); // already subscribed
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── SEED DEFAULT DATA ─────────────────────────────────────────
app.post('/api/seed', async (req, res) => {
  try {
    const count = await Product.countDocuments();
    if (count > 0) return res.json({ success: true, message: 'Already seeded' });
    
    await Product.insertMany([
      { name:'Brahmi Hair Oil',tamil:'பிரம்மி தலை எண்ணெய்',cat:'Oils',emoji:'🫙',desc:'Cold-pressed with Brahmi & Bhringraj for hair growth',ingredients:'Brahmi, Bhringraj, Coconut Oil, Neem',howToUse:'Apply warm oil to scalp, massage for 10 mins, leave 1 hour',price:299,oldPrice:399,badge:'best',rating:4.8,reviews:142,stock:50,featured:true },
      { name:'Triphala Churna',tamil:'திரிபலா சூரணம்',cat:'Churna',emoji:'🌾',desc:'3-fruit blend for digestion and detox',ingredients:'Amla, Haritaki, Bibhitaki',howToUse:'½ tsp in warm water before bed',price:180,oldPrice:null,badge:'new',rating:4.6,reviews:89,stock:80,featured:true },
      { name:'Tulsi Kadha Mix',tamil:'துளசி கஷாயம்',cat:'Kadha',emoji:'🍵',desc:'Immunity-boosting herbal kadha',ingredients:'Tulsi, Ginger, Cinnamon, Black Pepper',howToUse:'Boil 1 tsp in 200ml water, strain and drink warm',price:149,oldPrice:199,badge:'sale',rating:4.9,reviews:213,stock:120,featured:true },
      { name:'Kumkumadi Tailam',tamil:'குங்குமாதி தைலம்',cat:'Skin',emoji:'✨',desc:'Saffron face oil for glowing skin',ingredients:'Saffron, Sandalwood, Vetiver, Sesame Oil',howToUse:'3-4 drops on clean face at night',price:549,oldPrice:699,badge:'best',rating:4.7,reviews:98,stock:35,featured:true },
      { name:'Ashwagandha Churna',tamil:'அஸ்வகந்தா சூரணம்',cat:'Immunity',emoji:'🛡️',desc:'Root powder for strength and vitality',ingredients:'Ashwagandha root, Ashwagandha leaf',howToUse:'1 tsp in warm milk at night',price:220,oldPrice:null,badge:'new',rating:4.8,reviews:176,stock:90 },
      { name:'Panchakarma Ghee',tamil:'பஞ்சகர்ம நெய்',cat:'Ghee',emoji:'🧈',desc:'Medicated cow ghee with 8 herbs',ingredients:'Desi Cow Ghee, Triphala, Trikatu, Brahmi',howToUse:'1 tsp with warm water on empty stomach',price:450,oldPrice:550,badge:'sale',rating:4.5,reviews:67,stock:25 },
      { name:'Neem Karela Juice',tamil:'வேம்பு பாகல் சாறு',cat:'Immunity',emoji:'🥤',desc:'Daily detox juice. Sugar-free',ingredients:'Neem, Karela, Amla, Ginger',howToUse:'30ml diluted in water before breakfast',price:199,oldPrice:null,badge:null,rating:4.4,reviews:54,stock:60 },
      { name:'Chandan Ubtan',tamil:'சந்தன உப்தான்',cat:'Skin',emoji:'🌸',desc:'Sandalwood and turmeric face pack',ingredients:'Sandalwood, Turmeric, Rose Petal, Multani Mitti',howToUse:'Mix with rose water to paste, apply 15 mins',price:175,oldPrice:225,badge:'sale',rating:4.6,reviews:121,stock:70 },
      { name:'Dashamool Powder',tamil:'தஷமூல சூரணம்',cat:'Churna',emoji:'🌾',desc:'10-root blend for joint support',ingredients:'10 root herbs as per Charaka Samhita',howToUse:'1 tsp in warm water twice daily',price:260,oldPrice:null,badge:null,rating:4.3,reviews:42,stock:45 },
      { name:'Mahanarayan Oil',tamil:'மஹாநாராயண தைலம்',cat:'Oils',emoji:'🫙',desc:'Classic massage oil for muscles and joints',ingredients:'Shatavari, Ashwagandha, Bala, Sesame Oil',howToUse:'Warm and massage affected area',price:325,oldPrice:400,badge:'best',rating:4.9,reviews:198,stock:55,featured:true },
      { name:'Moringa Green Tea',tamil:'முருங்கை பச்சை தேயிலை',cat:'Kadha',emoji:'🍵',desc:'Drumstick leaf tea rich in iron and calcium',ingredients:'Moringa leaf, Green Tea, Lemongrass',howToUse:'Steep 1 tsp in hot water 3-4 mins',price:130,oldPrice:null,badge:'new',rating:4.7,reviews:88,stock:100 },
      { name:'Saraswatarishta',tamil:'சரஸ்வதாரிஷ்டம்',cat:'Immunity',emoji:'🛡️',desc:'Brain tonic for memory and focus',ingredients:'Brahmi, Shatavari, Ashwagandha, Cardamom',howToUse:'2 tsp with equal water after meals',price:380,oldPrice:480,badge:null,rating:4.5,reviews:63,stock:40 },
    ]);

    // Seed default coupons
    await Coupon.insertMany([
      { code: 'SIDDHA20', type: 'percent', value: 20, minOrder: 100, maxUses: 500 },
      { code: 'WELCOME10', type: 'percent', value: 10, minOrder: 0, maxUses: 1000 },
      { code: 'FLAT50', type: 'flat', value: 50, minOrder: 299, maxUses: 200 },
    ]);
    
    res.json({ success: true, message: 'Seeded 12 products + 3 coupons' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ─── CATCH-ALL ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`🌿 சித்த வளம் server at http://localhost:${PORT}`);
  console.log(`🧑‍💼 Admin panel at http://localhost:${PORT}/admin`);
});
