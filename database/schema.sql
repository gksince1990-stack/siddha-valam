-- =============================================================================
-- SIDDHA VALAM — Production PostgreSQL Schema
-- =============================================================================
-- Run order: extensions → types → tables → indexes → triggers → functions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "citext";          -- Case-insensitive text
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- Trigram full-text search

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE user_role         AS ENUM ('customer', 'admin', 'manager');
CREATE TYPE order_status      AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE payment_status    AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE payment_method    AS ENUM ('razorpay', 'cod', 'upi');
CREATE TYPE product_category  AS ENUM ('Oils', 'Churna', 'Kadha', 'Skin', 'Ghee', 'Immunity');
CREATE TYPE product_badge     AS ENUM ('best', 'new', 'sale');
CREATE TYPE discount_type     AS ENUM ('percentage', 'fixed');
CREATE TYPE review_status     AS ENUM ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- HELPER: auto-update updated_at on every row change
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Macro to attach the trigger to any table
-- Usage: SELECT attach_updated_at('table_name');
CREATE OR REPLACE FUNCTION attach_updated_at(tbl TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER set_updated_at
     BEFORE UPDATE ON %I
     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
    tbl
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. USERS
-- =============================================================================

CREATE TABLE users (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100)  NOT NULL,
  email        CITEXT        NOT NULL UNIQUE,         -- case-insensitive unique
  password     TEXT          NOT NULL,                -- bcrypt hash
  phone        CHAR(10)      CHECK (phone ~ '^\d{10}$'),
  role         user_role     NOT NULL DEFAULT 'customer',
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

SELECT attach_updated_at('users');

COMMENT ON TABLE  users                IS 'Customer and admin accounts';
COMMENT ON COLUMN users.password       IS 'bcrypt hash — never store plain text';
COMMENT ON COLUMN users.email          IS 'citext ensures case-insensitive uniqueness';

-- ---------------------------------------------------------------------------
-- 2. ADDRESSES  (a user can have multiple saved addresses)
-- ---------------------------------------------------------------------------

CREATE TABLE addresses (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        VARCHAR(50)   DEFAULT 'Home',          -- Home / Office / Other
  full_name    VARCHAR(100)  NOT NULL,
  phone        CHAR(10)      NOT NULL CHECK (phone ~ '^\d{10}$'),
  street       TEXT          NOT NULL,
  city         VARCHAR(100)  NOT NULL,
  pin          CHAR(6)       NOT NULL CHECK (pin ~ '^\d{6}$'),
  state        VARCHAR(100)  NOT NULL,
  country      VARCHAR(60)   NOT NULL DEFAULT 'India',
  is_default   BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

SELECT attach_updated_at('addresses');

-- Only one default address allowed per user
CREATE UNIQUE INDEX uq_addresses_user_default
  ON addresses (user_id)
  WHERE is_default = TRUE;

COMMENT ON TABLE addresses IS 'Saved shipping/billing addresses per user';

-- ---------------------------------------------------------------------------
-- 3. CATEGORIES  (allows adding new categories without schema change)
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id           SERIAL        PRIMARY KEY,
  name         VARCHAR(100)  NOT NULL UNIQUE,
  tamil_name   VARCHAR(100),
  slug         VARCHAR(100)  NOT NULL UNIQUE,
  emoji        VARCHAR(10)   DEFAULT '🌿',
  description  TEXT,
  sort_order   SMALLINT      NOT NULL DEFAULT 0,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

SELECT attach_updated_at('categories');

-- Seed the 6 core categories
INSERT INTO categories (name, tamil_name, slug, emoji, sort_order) VALUES
  ('Oils',      'எண்ணெய்கள்',    'oils',      '🫙', 1),
  ('Churna',    'சூர்ணங்கள்',    'churna',    '🌿', 2),
  ('Kadha',     'கஷாயங்கள்',     'kadha',     '🍵', 3),
  ('Skin',      'தோல் பராமரிப்பு', 'skin',    '✨', 4),
  ('Ghee',      'நெய்',           'ghee',      '🧈', 5),
  ('Immunity',  'நோய் எதிர்ப்பு', 'immunity', '🛡️', 6);

COMMENT ON TABLE categories IS 'Product categories — add rows here to extend';

-- ---------------------------------------------------------------------------
-- 4. PRODUCTS
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id            UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200)   NOT NULL,
  tamil_name    VARCHAR(200)   DEFAULT '',
  slug          VARCHAR(220)   NOT NULL UNIQUE,
  category_id   INT            NOT NULL REFERENCES categories(id),
  emoji         VARCHAR(10)    DEFAULT '🌿',
  description   TEXT           DEFAULT '',
  price         NUMERIC(10,2)  NOT NULL CHECK (price >= 0),
  old_price     NUMERIC(10,2)  CHECK (old_price >= 0),
  badge         product_badge,
  rating        NUMERIC(3,2)   NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  review_count  INT            NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  stock         INT            NOT NULL DEFAULT 0 CHECK (stock >= 0),
  weight        VARCHAR(50)    DEFAULT '',
  is_active     BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_old_price CHECK (old_price IS NULL OR old_price > price)
);

SELECT attach_updated_at('products');

-- Indexes
CREATE INDEX idx_products_category    ON products (category_id, is_active);
CREATE INDEX idx_products_active      ON products (is_active, created_at DESC);
CREATE INDEX idx_products_badge       ON products (badge) WHERE badge IS NOT NULL;
-- Full-text search index using pg_trgm
CREATE INDEX idx_products_search      ON products USING GIN (
  (name || ' ' || tamil_name || ' ' || description) gin_trgm_ops
);

COMMENT ON TABLE  products            IS 'Ayurvedic product catalogue';
COMMENT ON COLUMN products.price      IS 'Current selling price in INR';
COMMENT ON COLUMN products.old_price  IS 'Original/strikethrough price — must be > price';
COMMENT ON COLUMN products.stock      IS 'Available units; 0 = out of stock';

-- ---------------------------------------------------------------------------
-- 5. PRODUCT IMAGES
-- ---------------------------------------------------------------------------

CREATE TABLE product_images (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url          TEXT         NOT NULL,       -- Cloudinary delivery URL
  public_id    TEXT         NOT NULL,       -- Cloudinary public_id (for deletion)
  alt_text     VARCHAR(200) DEFAULT '',
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  is_primary   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one primary image per product
CREATE UNIQUE INDEX uq_product_images_primary
  ON product_images (product_id)
  WHERE is_primary = TRUE;

CREATE INDEX idx_product_images_product ON product_images (product_id, sort_order);

COMMENT ON TABLE product_images IS 'Cloudinary-hosted product images (multiple per product)';

-- ---------------------------------------------------------------------------
-- 6. COUPONS
-- ---------------------------------------------------------------------------

CREATE TABLE coupons (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(30)    NOT NULL UNIQUE,
  discount_type   discount_type  NOT NULL,
  discount_value  NUMERIC(10,2)  NOT NULL CHECK (discount_value > 0),
  min_order_value NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (min_order_value >= 0),
  -- Cap on savings for percentage coupons (NULL = no cap)
  max_discount    NUMERIC(10,2)  CHECK (max_discount > 0),
  usage_limit     INT            NOT NULL DEFAULT 0 CHECK (usage_limit >= 0), -- 0 = unlimited
  used_count      INT            NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_percentage_range
    CHECK (discount_type != 'percentage' OR discount_value BETWEEN 1 AND 100)
);

SELECT attach_updated_at('coupons');

CREATE INDEX idx_coupons_active ON coupons (is_active, expires_at);

-- Seed default coupons
INSERT INTO coupons (code, discount_type, discount_value, min_order_value, max_discount) VALUES
  ('SIDDHA20',  'percentage', 20,  0,   500),
  ('WELCOME100','fixed',       100, 499, NULL);

COMMENT ON TABLE  coupons             IS 'Discount coupons (replaces hardcoded frontend code)';
COMMENT ON COLUMN coupons.usage_limit IS '0 = unlimited uses';

-- ---------------------------------------------------------------------------
-- 7. ORDERS
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id                   UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id             VARCHAR(20)     NOT NULL UNIQUE,  -- human-readable SV######
  user_id              UUID            REFERENCES users(id) ON DELETE SET NULL,  -- NULL = guest

  -- Customer snapshot (denormalised — survives user deletion / address changes)
  customer_name        VARCHAR(100)    NOT NULL,
  customer_phone       CHAR(10)        NOT NULL CHECK (customer_phone ~ '^\d{10}$'),
  customer_email       CITEXT          NOT NULL,
  shipping_street      TEXT            NOT NULL,
  shipping_city        VARCHAR(100)    NOT NULL,
  shipping_pin         CHAR(6)         NOT NULL CHECK (shipping_pin ~ '^\d{6}$'),
  shipping_state       VARCHAR(100)    NOT NULL,
  shipping_country     VARCHAR(60)     NOT NULL DEFAULT 'India',

  -- Financials
  subtotal             NUMERIC(10,2)   NOT NULL CHECK (subtotal >= 0),
  discount             NUMERIC(10,2)   NOT NULL DEFAULT 0 CHECK (discount >= 0),
  shipping_charge      NUMERIC(10,2)   NOT NULL DEFAULT 0 CHECK (shipping_charge >= 0),
  total                NUMERIC(10,2)   NOT NULL CHECK (total >= 0),

  -- Applied coupon snapshot
  coupon_code          VARCHAR(30),
  coupon_discount_type discount_type,
  coupon_discount_pct  NUMERIC(5,2),
  coupon_discount_amt  NUMERIC(10,2),

  -- Payment
  pay_method           payment_method  NOT NULL,
  status               order_status    NOT NULL DEFAULT 'pending',
  payment_status       payment_status  NOT NULL DEFAULT 'pending',
  razorpay_order_id    VARCHAR(100)    UNIQUE,
  razorpay_payment_id  VARCHAR(100)    UNIQUE,

  notes                TEXT,
  created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

SELECT attach_updated_at('orders');

CREATE INDEX idx_orders_order_id      ON orders (order_id);
CREATE INDEX idx_orders_user          ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_status        ON orders (status, created_at DESC);
CREATE INDEX idx_orders_email         ON orders (customer_email);
CREATE INDEX idx_orders_razorpay      ON orders (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX idx_orders_created       ON orders (created_at DESC);

COMMENT ON TABLE  orders                  IS 'Customer orders';
COMMENT ON COLUMN orders.user_id          IS 'NULL for guest checkouts';
COMMENT ON COLUMN orders.customer_name    IS 'Snapshot — does not change if user updates profile';
COMMENT ON COLUMN orders.order_id         IS 'Human-readable ID shown to customers (format: SV######)';

-- ---------------------------------------------------------------------------
-- 8. ORDER ITEMS
-- ---------------------------------------------------------------------------

CREATE TABLE order_items (
  id            UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID           NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID           REFERENCES products(id) ON DELETE SET NULL, -- NULL if product deleted
  -- Product snapshot at time of order
  product_name  VARCHAR(200)   NOT NULL,
  tamil_name    VARCHAR(200)   DEFAULT '',
  emoji         VARCHAR(10)    DEFAULT '🌿',
  image_url     TEXT,                          -- Primary image URL at time of order
  unit_price    NUMERIC(10,2)  NOT NULL CHECK (unit_price >= 0),
  quantity      INT            NOT NULL CHECK (quantity > 0),
  line_total    NUMERIC(10,2)  NOT NULL,       -- unit_price × quantity

  CONSTRAINT chk_line_total CHECK (line_total = unit_price * quantity)
);

CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

COMMENT ON TABLE  order_items             IS 'Line items per order — prices snapshotted at purchase time';
COMMENT ON COLUMN order_items.unit_price  IS 'Price at time of purchase — not linked to current product price';

-- ---------------------------------------------------------------------------
-- 9. COUPON USAGE  (per-user coupon tracking)
-- ---------------------------------------------------------------------------

CREATE TABLE coupon_usage (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id   UUID         NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  order_id    UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  used_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Prevent same user using same coupon twice if usage_limit = 1
  UNIQUE (coupon_id, user_id)
);

CREATE INDEX idx_coupon_usage_coupon ON coupon_usage (coupon_id);
CREATE INDEX idx_coupon_usage_user   ON coupon_usage (user_id);

COMMENT ON TABLE coupon_usage IS 'Tracks which user used which coupon on which order';

-- ---------------------------------------------------------------------------
-- 10. PRODUCT REVIEWS
-- ---------------------------------------------------------------------------

CREATE TABLE reviews (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id      UUID          REFERENCES users(id) ON DELETE SET NULL,
  order_id     UUID          REFERENCES orders(id) ON DELETE SET NULL, -- proof of purchase
  reviewer     VARCHAR(100)  NOT NULL,
  city         VARCHAR(100)  DEFAULT '',
  rating       SMALLINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title        VARCHAR(200)  DEFAULT '',
  body         TEXT          DEFAULT '',
  status       review_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- One review per user per product
  UNIQUE (product_id, user_id)
);

SELECT attach_updated_at('reviews');

CREATE INDEX idx_reviews_product ON reviews (product_id, status);
CREATE INDEX idx_reviews_user    ON reviews (user_id);

COMMENT ON TABLE  reviews          IS 'Customer product reviews (moderated)';
COMMENT ON COLUMN reviews.order_id IS 'Links to purchase to verify buyer';

-- ---------------------------------------------------------------------------
-- 11. SESSIONS  (for NextAuth or custom JWT refresh tokens)
-- ---------------------------------------------------------------------------

CREATE TABLE sessions (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT         NOT NULL UNIQUE,   -- SHA-256 hash of the actual token
  expires_at    TIMESTAMPTZ  NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user    ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

COMMENT ON TABLE  sessions            IS 'Auth sessions / refresh tokens';
COMMENT ON COLUMN sessions.token_hash IS 'Store hash, never the raw token';

-- ---------------------------------------------------------------------------
-- 12. AUDIT LOG  (immutable record of all admin actions)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id          BIGSERIAL     PRIMARY KEY,
  user_id     UUID          REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100)  NOT NULL,        -- e.g. 'UPDATE_ORDER_STATUS'
  entity      VARCHAR(50)   NOT NULL,        -- e.g. 'orders'
  entity_id   TEXT,                          -- the affected record's ID
  old_value   JSONB,
  new_value   JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user     ON audit_log (user_id);
CREATE INDEX idx_audit_log_entity   ON audit_log (entity, entity_id);
CREATE INDEX idx_audit_log_created  ON audit_log (created_at DESC);

COMMENT ON TABLE audit_log IS 'Immutable log of all admin changes — never UPDATE or DELETE rows here';

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Admin dashboard: per-day revenue summary
CREATE OR REPLACE VIEW vw_daily_revenue AS
SELECT
  DATE(created_at)           AS day,
  COUNT(*)                   AS order_count,
  SUM(total)                 AS revenue,
  SUM(discount)              AS total_discount,
  COUNT(*) FILTER (WHERE pay_method = 'cod')      AS cod_orders,
  COUNT(*) FILTER (WHERE pay_method = 'razorpay') AS online_orders
FROM orders
WHERE payment_status = 'paid'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- Admin: top-selling products
CREATE OR REPLACE VIEW vw_top_products AS
SELECT
  p.id,
  p.name,
  p.tamil_name,
  p.emoji,
  p.price,
  p.stock,
  COALESCE(SUM(oi.quantity), 0)   AS units_sold,
  COALESCE(SUM(oi.line_total), 0) AS revenue
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o       ON o.id = oi.order_id AND o.payment_status = 'paid'
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.tamil_name, p.emoji, p.price, p.stock
ORDER BY units_sold DESC;

-- Customer: order history with item count
CREATE OR REPLACE VIEW vw_order_summary AS
SELECT
  o.id,
  o.order_id,
  o.user_id,
  o.customer_name,
  o.customer_email,
  o.total,
  o.status,
  o.payment_status,
  o.pay_method,
  o.created_at,
  COUNT(oi.id) AS item_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id;

-- =============================================================================
-- ORDER ID GENERATOR (matches SV + 6-digit timestamp + 4 random digits)
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_order_id()
RETURNS TEXT AS $$
DECLARE
  ts    TEXT := RIGHT(EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT, 6);
  rand  TEXT := LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
BEGIN
  RETURN 'SV' || ts || rand;
END;
$$ LANGUAGE plpgsql;

-- Auto-populate order_id on insert
CREATE OR REPLACE FUNCTION trg_set_order_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_id IS NULL OR NEW.order_id = '' THEN
    NEW.order_id := generate_order_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_id
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_set_order_id();

-- =============================================================================
-- STOCK DECREMENT ON ORDER
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_decrement_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET stock = stock - NEW.quantity
  WHERE id = NEW.product_id
    AND stock >= NEW.quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock for product %', NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decrement_stock
  AFTER INSERT ON order_items
  FOR EACH ROW
  WHEN (NEW.product_id IS NOT NULL)
  EXECUTE FUNCTION trg_decrement_stock();

-- =============================================================================
-- REVIEW RATING SYNC
-- Recalculates product.rating and review_count when a review is approved
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_sync_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET
    rating       = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM reviews WHERE product_id = NEW.product_id AND status = 'approved'),
    review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND status = 'approved')
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_product_rating
  AFTER INSERT OR UPDATE OF status ON reviews
  FOR EACH ROW EXECUTE FUNCTION trg_sync_product_rating();

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
