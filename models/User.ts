import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAddress {
  street: string;
  city: string;
  pin: string;
  state: string;
  isDefault: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: 'customer' | 'admin';
  addresses: IAddress[];
  isActive: boolean;
  comparePassword(candidate: string): Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema<IAddress>(
  {
    street:    { type: String, required: true, trim: true },
    city:      { type: String, required: true, trim: true },
    pin:       { type: String, required: true, match: /^\d{6}$/ },
    state:     { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name:      { type: String, required: true, trim: true, maxlength: 100 },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select:false keeps password out of all queries unless explicitly requested
    password:  { type: String, required: true, minlength: 8, select: false },
    phone:     { type: String, trim: true, match: /^\d{10}$/ },
    role:      { type: String, enum: ['customer', 'admin'], default: 'customer' },
    addresses: { type: [AddressSchema], default: [] },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hash password only when it has been modified
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// Prevent returning password in JSON responses
UserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    return ret;
  },
});

// Compound index: active customers sorted by newest
UserSchema.index({ role: 1, isActive: 1, createdAt: -1 });

const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>('User', UserSchema);

export default User;
