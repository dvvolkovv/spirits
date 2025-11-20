# ЮKassa Integration Guide

This guide explains how to integrate ЮKassa payments for token purchases.

## Overview

The application now has a complete payment system for token purchases:

- Frontend: Token packages modal with YooKassa integration
- Database: Tables for tokens, transactions, and payments
- Payment flow: Create payment → Redirect to YooKassa → Verify payment → Add tokens

## Frontend Components

### 1. Token Packages Modal
**Location:** `src/components/tokens/TokenPackages.tsx`

Shows available token packages and initiates payment:
- Starter: 50,000 tokens - 149₽
- Extended: 200,000 tokens - 499₽ (Popular)
- Professional: 1,000,000 tokens - 1,990₽

### 2. Payment Success Page
**Location:** `src/pages/PaymentSuccessPage.tsx`

Handles payment verification after user returns from YooKassa:
- Receives `payment_id` from URL query parameter
- Verifies payment status with backend
- Updates user token balance
- Redirects to chat

### 3. Navigation Integration
**Location:** `src/components/layout/Navigation.tsx`

Token balance display with "Пополнить" button that opens the packages modal.

## Database Schema

### Tables

#### `user_tokens`
Stores user token balances:
```sql
- id (uuid, primary key)
- user_id (uuid, references users)
- phone (text, unique)
- tokens (bigint, default 50000)
- created_at, updated_at (timestamptz)
```

#### `token_transactions`
Records all token movements:
```sql
- id (uuid, primary key)
- user_id (uuid, references users)
- phone (text)
- transaction_type (enum: 'purchase', 'consumed', 'bonus', 'refund')
- amount (bigint) - positive for additions, negative for deductions
- balance_after (bigint)
- description (text)
- metadata (jsonb)
- created_at (timestamptz)
```

#### `payments`
Tracks payment status:
```sql
- id (uuid, primary key)
- user_id (uuid, references users)
- phone (text)
- payment_id (text, unique) - YooKassa payment ID
- package_id (text)
- amount (numeric)
- tokens (bigint)
- status (enum: 'pending', 'succeeded', 'canceled', 'failed')
- payment_url (text)
- created_at, updated_at, completed_at (timestamptz)
```

### Database Functions

#### `add_user_tokens()`
Adds tokens and creates transaction record:
```sql
SELECT add_user_tokens(
  p_phone := '+79991234567',
  p_amount := 50000,
  p_transaction_type := 'purchase',
  p_description := 'Token purchase - Starter package',
  p_metadata := '{"payment_id": "abc123", "package_id": "starter"}'::jsonb
);
```

Returns:
```json
{
  "transaction_id": "uuid",
  "previous_balance": 50000,
  "new_balance": 100000
}
```

## Backend API Endpoints

### 1. Create Payment
**Endpoint:** `POST /webhook/yookassa/create-payment`

Creates a new payment and returns YooKassa payment URL.

**Request:**
```json
{
  "phone": "79991234567",
  "package_id": "starter",
  "tokens": 50000,
  "amount": 149,
  "description": "Пополнение 50,000 токенов"
}
```

**Response:**
```json
{
  "payment_id": "2c5b8228-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "confirmation_url": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=...",
  "status": "pending"
}
```

**Backend Implementation Steps:**

1. Validate user exists by phone
2. Create YooKassa payment:
```javascript
const payment = await yooKassa.createPayment({
  amount: {
    value: amount.toFixed(2),
    currency: 'RUB'
  },
  confirmation: {
    type: 'redirect',
    return_url: `${FRONTEND_URL}/payment/success?payment_id={payment_id}`
  },
  capture: true,
  description: description,
  metadata: {
    phone: phone,
    package_id: package_id,
    tokens: tokens
  }
});
```

3. Save payment to database:
```sql
INSERT INTO payments (user_id, phone, payment_id, package_id, amount, tokens, status, payment_url)
VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7);
```

4. Return confirmation URL to frontend

### 2. Verify Payment
**Endpoint:** `POST /webhook/yookassa/verify-payment`

Verifies payment status and adds tokens if successful.

**Request:**
```json
{
  "payment_id": "2c5b8228-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "phone": "79991234567"
}
```

**Response (Success):**
```json
{
  "status": "succeeded",
  "tokens_added": 50000,
  "new_balance": 100000,
  "transaction_id": "uuid"
}
```

**Response (Failed):**
```json
{
  "status": "failed",
  "message": "Payment was not completed"
}
```

**Backend Implementation Steps:**

1. Get payment from YooKassa:
```javascript
const payment = await yooKassa.getPayment(payment_id);
```

2. Check if payment already processed:
```sql
SELECT status FROM payments WHERE payment_id = $1;
```

3. If payment succeeded and not yet processed:
   - Update payment status in database
   - Add tokens using database function
   - Return success response

4. If payment failed or canceled:
   - Update payment status
   - Return error response

### 3. YooKassa Webhook (Optional but Recommended)
**Endpoint:** `POST /webhook/yookassa/notification`

Receives automatic notifications from YooKassa about payment status changes.

**Request (from YooKassa):**
```json
{
  "type": "notification",
  "event": "payment.succeeded",
  "object": {
    "id": "2c5b8228-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "status": "succeeded",
    "amount": {
      "value": "149.00",
      "currency": "RUB"
    },
    "metadata": {
      "phone": "79991234567",
      "package_id": "starter",
      "tokens": "50000"
    }
  }
}
```

**Backend Implementation:**

1. Verify webhook authenticity (check signature if configured)
2. Extract payment_id and metadata
3. Process payment same as verify-payment endpoint
4. Return 200 OK to acknowledge receipt

## YooKassa Setup

### 1. Get API Credentials
1. Register at https://yookassa.ru/
2. Get Shop ID and Secret Key from settings
3. Add to environment variables:
```env
YOOKASSA_SHOP_ID=your_shop_id
YOOKASSA_SECRET_KEY=your_secret_key
```

### 2. Install YooKassa SDK
```bash
npm install @a2seven/yoo-checkout
```

### 3. Initialize Client
```javascript
const YooKassa = require('@a2seven/yoo-checkout');

const yooKassa = new YooKassa({
  shopId: process.env.YOOKASSA_SHOP_ID,
  secretKey: process.env.YOOKASSA_SECRET_KEY
});
```

### 4. Configure Webhooks (Optional)
In YooKassa dashboard, set webhook URL:
```
https://your-backend.com/webhook/yookassa/notification
```

## Payment Flow Diagram

```
User clicks "Купить" on package
         ↓
Frontend calls /create-payment
         ↓
Backend creates payment in YooKassa
         ↓
Backend saves payment to database (status: pending)
         ↓
Backend returns confirmation_url
         ↓
Frontend redirects to YooKassa payment page
         ↓
User completes payment
         ↓
YooKassa redirects to /payment/success?payment_id=xxx
         ↓
Frontend calls /verify-payment
         ↓
Backend checks payment status with YooKassa
         ↓
If succeeded:
  - Update payment (status: succeeded)
  - Call add_user_tokens() function
  - Create transaction record
  - Return new balance
         ↓
Frontend updates user.tokens and shows success
```

## Security Considerations

1. **Never expose Secret Key in frontend**
   - All YooKassa API calls must go through backend

2. **Verify payment status server-side**
   - Don't trust payment_id from URL alone
   - Always verify with YooKassa API

3. **Prevent double-processing**
   - Check payment status in database before processing
   - Use database transactions to ensure atomicity

4. **RLS Policies**
   - Users can only access their own tokens and transactions
   - Payment creation requires authentication

5. **Idempotency**
   - Use idempotency keys for YooKassa requests
   - Handle duplicate webhook notifications

## Testing

### Test Credentials
YooKassa provides test credentials for development:
- Test Shop ID: Available in sandbox mode
- Test cards: https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing

### Test Card Numbers
```
Successful payment: 5555 5555 5555 4477
Failed payment: 5555 5555 5555 5599
3D Secure: 5555 5555 5555 5614
```

### Testing Flow
1. Use test credentials in development
2. Create payment with test amount
3. Use test card number
4. Verify tokens added correctly
5. Check transaction recorded in database

## Error Handling

### Common Errors

1. **Insufficient funds**
```json
{
  "error": "INSUFFICIENT_TOKENS",
  "message": "Not enough tokens for this operation"
}
```

2. **Payment not found**
```json
{
  "error": "PAYMENT_NOT_FOUND",
  "message": "Payment with this ID not found"
}
```

3. **Payment already processed**
```json
{
  "error": "ALREADY_PROCESSED",
  "message": "This payment has already been processed"
}
```

4. **YooKassa API error**
```json
{
  "error": "PAYMENT_PROVIDER_ERROR",
  "message": "Error communicating with payment provider",
  "details": "..."
}
```

## Monitoring

Track these metrics:
- Total payments created
- Successful payment rate
- Failed/canceled payments
- Average payment processing time
- Token purchase trends by package

## Support

For YooKassa API documentation:
- https://yookassa.ru/developers/api
- https://github.com/a2seven/yookassa-sdk-nodejs

For integration help:
- support@yookassa.ru
- https://yookassa.ru/docs/support
