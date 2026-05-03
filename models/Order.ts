import mongoose, { Document, Schema, Model } from 'mongoose';

export type OrderStatus    = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus  = 'pending' | 'paid' | 'failed' | 'refunded';
export type PayMethod      = 'razorpay' | 'cod';

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  name:      string;
  tamil?:    string;
  emoji:     string;
  imageUrl?: string;   // Snapshot of image at time of order (product images may change)
  price:     number;   // Snapshot of price at time of order
  qty:       number;
}

export interface IShippingAddress {
  street: string;
  city:   string;
  pin:    string;
  state:  string;
}

export interface ICustomer {
  name:    string;
  phone:   string;
  email:   string;
  address: IShippingAddress;
}

export interface IAppliedCoupon {
  code:           string;
  discountPct:    number;
  discountAmount: number;
}

export interface IOrder extends Document {
  orderId:          string;
  userId?:          mongoose.Types.ObjectId;  // Undefined for guest checkouts
  customer:         ICustomer;
  items:            IOrderItem[];
  subtotal:         number;
  discount:         number;
  shipping:         number;
  total:            number;
  coupon?:          IAppliedCoupon;
  payMethod:        PayMethod;
  status:           OrderStatus;
  paymentStatus:    PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  notes?:           string;
  createdAt:        Date;
  updatedAt:        Date;
}

function generateOrderId(): string {
  const ts   = Date.now().toString().slice(-6);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SV${ts}${rand}`;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name:      { type: String, required: true },
    tamil:     { type: String },
    emoji:     { type: String, default: '🌿' },
    imageUrl:  { type: String },
    price:     { type: Number, required: true, min: 0 },
    qty:       { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const ShippingAddressSchema = new Schema<IShippingAddress>(
  {
    street: { type: String, required: true, trim: true },
    city:   { type: String, required: true, trim: true },
    pin:    { type: String, required: true, match: /^\d{6}$/ },
    state:  { type: String, required: true, trim: true },
  },
  { _id: false }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    name:    { type: String, required: true, trim: true },
    phone:   { type: String, required: true, match: /^\d{10}$/ },
    email:   { type: String, required: true, lowercase: true, trim: true },
    address: { type: ShippingAddressSchema, required: true },
  },
  { _id: false }
);

const CouponSchema = new Schema<IAppliedCoupon>(
  {
    code:           { type: String, uppercase: true },
    discountPct:    { type: Number, min: 0, max: 100 },
    discountAmount: { type: Number, min: 0 },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    orderId:  { type: String, unique: true, default: generateOrderId },
    userId:   { type: Schema.Types.ObjectId, ref: 'User' },
    customer: { type: CustomerSchema, required: true },
    items: {
      type:     [OrderItemSchema],
      required: true,
      validate: {
        validator: (v: IOrderItem[]) => v.length > 0,
        message:   'Order must have at least one item',
      },
    },
    // All amounts in INR, stored as integers (paise avoided — displayed in ₹)
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    shipping: { type: Number, default: 0, min: 0 },
    total:    { type: Number, required: true, min: 0 },
    coupon:   { type: CouponSchema },
    payMethod: {
      type:     String,
      required: true,
      enum:     ['razorpay', 'cod'] as PayMethod[],
    },
    status: {
      type:    String,
      enum:    ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as OrderStatus[],
      default: 'pending',
    },
    paymentStatus: {
      type:    String,
      enum:    ['pending', 'paid', 'failed', 'refunded'] as PaymentStatus[],
      default: 'pending',
    },
    razorpayOrderId:   { type: String },
    razorpayPaymentId: { type: String },
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

// Indexes — optimised for the most common query patterns
OrderSchema.index({ orderId: 1 });
OrderSchema.index({ userId: 1, createdAt: -1 });           // Customer order history
OrderSchema.index({ status: 1, createdAt: -1 });           // Admin: filter by status
OrderSchema.index({ 'customer.email': 1 });                // Admin: search by email
OrderSchema.index({ razorpayOrderId: 1 }, { sparse: true });

const Order: Model<IOrder> =
  mongoose.models.Order ?? mongoose.model<IOrder>('Order', OrderSchema);

export default Order;
