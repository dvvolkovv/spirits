-- =============================================
-- Реферальная система my.linkeon
-- Применено: 2026-03-10
-- =============================================

-- Таблица лидеров
CREATE TABLE referral_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL
    CHECK (slug ~ '^[a-z0-9-]+$'),
  user_phone VARCHAR(20),
  parent_leader_id UUID REFERENCES referral_leaders(id),
  level SMALLINT DEFAULT 1 CHECK (level IN (1, 2)),
  commission_pct DECIMAL(5,2) DEFAULT 10,
  parent_commission_pct DECIMAL(5,2) DEFAULT 0,   -- % для родителя (хранится у дочернего!)
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Кто от кого пришёл (один реферал — один лидер)
CREATE TABLE referral_referees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_phone VARCHAR(20) NOT NULL UNIQUE,
  leader_id UUID NOT NULL REFERENCES referral_leaders(id),
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- История оплат и начислений
CREATE TABLE referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES referral_leaders(id),
  payment_id VARCHAR(255),             -- YooKassa payment_id (для идемпотентности)
  referee_phone VARCHAR(20),
  commission_level SMALLINT,           -- 1 (прямой) или 2 (upstream для родителя)
  payment_amount_rub DECIMAL(10,2),
  commission_pct DECIMAL(5,2),
  commission_rub DECIMAL(10,2),
  paid_out BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_referral_referees_phone ON referral_referees(referee_phone);
CREATE INDEX idx_referral_commissions_payment_id ON referral_commissions(payment_id);
CREATE INDEX idx_referral_commissions_leader_id ON referral_commissions(leader_id);
CREATE INDEX idx_referral_leaders_user_phone ON referral_leaders(user_phone);
