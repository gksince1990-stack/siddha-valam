import mongoose, { Document, Schema, Model } from 'mongoose';

export type DiscountType = 'percentage' | 'fixed';

export interface ICoupon extends Document {
  code:          string;
  discountType:  DiscountType;
  discountValue: number;      // Percentage (0–100) or fixed INR amount
  minOrderValue: number;      // Minimum cart value to apply coupon
  maxDiscount?:  number;      // Cap on discount for percentage coupons
  usageLimit:    number;      // Total times this code can be used (0 = unlimited)
  usedCount:     number;
  expiresAt?:    Date;
  active:        boolean;
  createdAt:     Date;
  updatedAt:     Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: {
      type:      String,
      required:  true,
      unique:    true,
      uppercase: true,
      trim:      true,
      maxlength: 30,
    },
    discountType:  { type: String, required: true, enum: ['percentage', 'fixed'] },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    // maxDiscount only applies to percentage coupons to prevent abuse
    maxDiscount:   { type: Number, min: 0 },
    usageLimit:    { type: Number, default: 0, min: 0 },  // 0 = no limit
    usedCount:     { type: Number, default: 0, min: 0 },
    expiresAt:     { type: Date },
    active:        { type: Boolean, default: true },
  },
  { timestamps: true }
);

CouponSchema.index({ code: 1 });
CouponSchema.index({ active: 1, expiresAt: 1 });

const Coupon: Model<ICoupon> =
  mongoose.models.Coupon ?? mongoose.model<ICoupon>('Coupon', CouponSchema);

export default Coupon;
