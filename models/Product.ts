import mongoose, { Document, Schema, Model } from 'mongoose';

export type ProductCategory = 'Oils' | 'Churna' | 'Kadha' | 'Skin' | 'Ghee' | 'Immunity';
export type ProductBadge   = 'best' | 'new' | 'sale';

export interface IProductImage {
  url:       string;   // Cloudinary delivery URL
  publicId:  string;   // Cloudinary public_id — needed for deletion
  alt?:      string;
}

export interface IProduct extends Document {
  name:        string;
  tamil:       string;
  slug:        string;
  cat:         ProductCategory;
  emoji:       string;        // Optional decorative icon shown when no image
  images:      IProductImage[];
  desc:        string;
  price:       number;
  oldPrice?:   number;
  badge?:      ProductBadge;
  rating:      number;
  reviewCount: number;
  stock:       number;
  weight:      string;
  active:      boolean;
  createdAt:   Date;
  updatedAt:   Date;
}

const ProductImageSchema = new Schema<IProductImage>(
  {
    url:      { type: String, required: true },
    publicId: { type: String, required: true },
    alt:      { type: String, default: '' },
  },
  { _id: false }
);

const ProductSchema = new Schema<IProduct>(
  {
    name:  { type: String, required: true, trim: true, maxlength: 200 },
    tamil: { type: String, trim: true, default: '' },
    // slug is auto-generated from name if not provided (see pre-validate hook)
    slug:  { type: String, required: true, unique: true, lowercase: true, trim: true },
    cat:   {
      type:     String,
      required: true,
      enum:     ['Oils', 'Churna', 'Kadha', 'Skin', 'Ghee', 'Immunity'] as ProductCategory[],
    },
    emoji:       { type: String, default: '🌿' },
    images:      { type: [ProductImageSchema], default: [] },
    desc:        { type: String, trim: true, maxlength: 1000, default: '' },
    price:       { type: Number, required: true, min: 0 },
    oldPrice:    { type: Number, min: 0 },
    badge:       { type: String, enum: ['best', 'new', 'sale'], sparse: true },
    rating:      { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    stock:       { type: Number, required: true, default: 0, min: 0 },
    weight:      { type: String, trim: true, default: '' },
    active:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Auto-generate slug from name on create (not on update)
ProductSchema.pre('validate', function (next) {
  if (this.isNew && this.name && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }
  next();
});

// Indexes
ProductSchema.index({ cat: 1, active: 1 });
ProductSchema.index({ active: 1, createdAt: -1 });
// Full-text search across name and description
ProductSchema.index({ name: 'text', desc: 'text', tamil: 'text' });

const Product: Model<IProduct> =
  mongoose.models.Product ?? mongoose.model<IProduct>('Product', ProductSchema);

export default Product;
