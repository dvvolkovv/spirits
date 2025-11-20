/*
  # Token Payments System

  1. New Tables
    - `user_tokens`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `phone` (text, indexed for quick lookup)
      - `tokens` (bigint, default 50000)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `token_transactions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `phone` (text)
      - `transaction_type` (text: 'purchase', 'consumed', 'bonus', 'refund')
      - `amount` (bigint) - positive for additions, negative for deductions
      - `balance_after` (bigint)
      - `description` (text)
      - `metadata` (jsonb) - stores additional info like payment_id, assistant_id, etc.
      - `created_at` (timestamptz)
    
    - `payments`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `phone` (text)
      - `payment_id` (text, unique) - YooKassa payment ID
      - `package_id` (text)
      - `amount` (numeric)
      - `tokens` (bigint)
      - `status` (text: 'pending', 'succeeded', 'canceled', 'failed')
      - `payment_url` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `completed_at` (timestamptz, nullable)

  2. Security
    - Enable RLS on all tables
    - Users can view their own tokens and transactions
    - Users can view their own payments
    - Only authenticated users can access data
    
  3. Indexes
    - Index on phone for quick user lookup
    - Index on payment_id for payment verification
    - Index on user_id and created_at for transaction history
    
  4. Functions
    - Function to update user tokens balance
    - Trigger to automatically update updated_at timestamps
*/

-- Create user_tokens table
CREATE TABLE IF NOT EXISTS user_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  tokens bigint NOT NULL DEFAULT 50000,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(phone)
);

-- Create token_transactions table
CREATE TABLE IF NOT EXISTS token_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'consumed', 'bonus', 'refund')),
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  payment_id text UNIQUE NOT NULL,
  package_id text NOT NULL,
  amount numeric(10, 2) NOT NULL,
  tokens bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled', 'failed')),
  payment_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_tokens_phone ON user_tokens(phone);
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_phone ON token_transactions(phone);
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id_created ON token_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_phone ON payments(phone);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Enable RLS
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_tokens
CREATE POLICY "Users can view own tokens"
  ON user_tokens FOR SELECT
  TO authenticated
  USING (phone = current_setting('request.jwt.claims', true)::json->>'phone');

CREATE POLICY "Users can update own tokens"
  ON user_tokens FOR UPDATE
  TO authenticated
  USING (phone = current_setting('request.jwt.claims', true)::json->>'phone');

-- RLS Policies for token_transactions
CREATE POLICY "Users can view own transactions"
  ON token_transactions FOR SELECT
  TO authenticated
  USING (phone = current_setting('request.jwt.claims', true)::json->>'phone');

CREATE POLICY "Users can insert own transactions"
  ON token_transactions FOR INSERT
  TO authenticated
  WITH CHECK (phone = current_setting('request.jwt.claims', true)::json->>'phone');

-- RLS Policies for payments
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  TO authenticated
  USING (phone = current_setting('request.jwt.claims', true)::json->>'phone');

CREATE POLICY "Users can insert own payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (phone = current_setting('request.jwt.claims', true)::json->>'phone');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_user_tokens_updated_at ON user_tokens;
CREATE TRIGGER update_user_tokens_updated_at
  BEFORE UPDATE ON user_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to add tokens and record transaction
CREATE OR REPLACE FUNCTION add_user_tokens(
  p_phone text,
  p_amount bigint,
  p_transaction_type text,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_current_balance bigint;
  v_new_balance bigint;
  v_transaction_id uuid;
BEGIN
  -- Get user_id from users table
  SELECT id INTO v_user_id FROM users WHERE phone = p_phone;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Get or create user_tokens record
  INSERT INTO user_tokens (user_id, phone, tokens)
  VALUES (v_user_id, p_phone, 0)
  ON CONFLICT (phone) DO NOTHING;

  -- Get current balance
  SELECT tokens INTO v_current_balance FROM user_tokens WHERE phone = p_phone;
  
  -- Calculate new balance
  v_new_balance := v_current_balance + p_amount;
  
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient tokens';
  END IF;
  
  -- Update balance
  UPDATE user_tokens 
  SET tokens = v_new_balance, updated_at = now()
  WHERE phone = p_phone;
  
  -- Record transaction
  INSERT INTO token_transactions (
    user_id, phone, transaction_type, amount, balance_after, description, metadata
  ) VALUES (
    v_user_id, p_phone, p_transaction_type, p_amount, v_new_balance, p_description, p_metadata
  ) RETURNING id INTO v_transaction_id;
  
  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
