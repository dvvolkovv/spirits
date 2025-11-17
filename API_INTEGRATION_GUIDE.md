# Token Management API Integration Guide

This guide explains how to integrate the token management system with the backend API.

## Current Implementation

The application now has a complete token management system:

### Frontend Components

1. **AuthContext** (`src/contexts/AuthContext.tsx`)
   - Stores user tokens in `user.tokens` field
   - Provides methods:
     - `updateTokens(tokens: number)` - Update the total token count
     - `consumeTokens(amount: number)` - Reduce tokens by specified amount

2. **Token Display Locations**
   - **Navigation** - Shows token balance in sidebar (desktop only)
   - **Chat Interface** - Shows token balance in chat header

3. **Initial Token Assignment**
   - New users automatically receive 50,000 tokens on first load
   - Tokens are stored in localStorage along with other user data

## API Integration Points

### 1. Fetch User Token Balance

When a user logs in or the app loads, fetch their token balance from the backend:

```typescript
// Location: src/contexts/AuthContext.tsx - login() function
const fetchUserTokens = async (phone: string) => {
  const response = await fetch(`${API_URL}/user/tokens/${phone}`);
  const data = await response.json();
  return data.tokens; // Expected: number
};

// Update the login function to include tokens:
const login = async (phone: string, token: string) => {
  const userData = {
    id: generateUserId(),
    phone,
    tokens: await fetchUserTokens(phone), // Add this
  };
  setUser(userData);
  localStorage.setItem('userData', JSON.stringify(userData));
};
```

### 2. Deduct Tokens on AI Messages

When sending a message to the AI assistant:

```typescript
// Location: src/components/chat/ChatInterface.tsx - sendMessageToAI() function

const sendMessageToAI = async (text: string, forceAssistantId?: number) => {
  // ... existing code ...

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: cleanPhone,
        msg: text,
        agent_id: selectedId,
      }),
    });

    if (response.ok) {
      const data = await response.json();

      // NEW: Extract tokens consumed from response
      if (data.tokens_used) {
        consumeTokens(data.tokens_used);
      }

      // Continue with existing streaming logic...
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

### 3. Backend API Expected Response Format

The AI chat endpoint should return:

```json
{
  "answer": "AI response text...",
  "tokens_used": 150,
  "remaining_tokens": 49850
}
```

- `tokens_used`: Number of tokens consumed by this request
- `remaining_tokens`: Optional - can be used to verify sync with frontend

### 4. Token Purchase Integration

When users purchase token packages:

```typescript
// Create a new service for token purchases
// Location: src/services/tokenService.ts

export const purchaseTokens = async (
  phone: string,
  packageType: 'basic' | 'extended' | 'professional'
) => {
  const packages = {
    basic: { tokens: 50000, price: 149 },
    extended: { tokens: 200000, price: 499 },
    professional: { tokens: 1000000, price: 1990 },
  };

  const response = await fetch(`${API_URL}/tokens/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      package: packageType,
      tokens: packages[packageType].tokens,
      amount: packages[packageType].price,
    }),
  });

  if (response.ok) {
    const data = await response.json();
    return data.new_balance; // Return updated token balance
  }

  throw new Error('Purchase failed');
};
```

### 5. Sync Tokens Across Sessions

To keep tokens in sync when user uses multiple devices:

```typescript
// Add to AuthContext.tsx - checkAdminStatus() or create new function
const syncTokens = async () => {
  if (!user?.phone) return;

  const cleanPhone = user.phone.replace(/\D/g, '');

  try {
    const response = await fetch(
      `${API_URL}/user/tokens/${cleanPhone}`
    );

    if (response.ok) {
      const data = await response.json();
      updateTokens(data.tokens);
    }
  } catch (error) {
    console.error('Error syncing tokens:', error);
  }
};

// Call periodically or on app focus
useEffect(() => {
  const interval = setInterval(syncTokens, 60000); // Every minute
  return () => clearInterval(interval);
}, [user?.phone]);
```

## Backend Requirements

The backend should implement:

1. **GET /user/tokens/:phone**
   - Returns current token balance for user

2. **POST /chat/message**
   - Processes AI message
   - Deducts tokens from user balance
   - Returns tokens_used in response

3. **POST /tokens/purchase**
   - Processes payment
   - Adds tokens to user account
   - Returns new balance

4. **Token Validation**
   - Check user has sufficient tokens before processing AI requests
   - Return error if insufficient tokens

## Testing

To test the token system without backend:

```typescript
// In ChatInterface.tsx, add temporary token consumption:
const sendMessageToAI = async (text: string) => {
  // ... existing code ...

  // TEMPORARY: Simulate token consumption
  const simulatedTokenUse = Math.floor(Math.random() * 200) + 50;
  consumeTokens(simulatedTokenUse);

  // ... rest of code ...
};
```

## Error Handling

Handle insufficient tokens:

```typescript
if (user?.tokens !== undefined && user.tokens < MINIMUM_REQUIRED_TOKENS) {
  // Show error message
  alert('Недостаточно токенов. Пожалуйста, приобретите дополнительные токены.');
  return;
}
```

## Notes

- Tokens are stored in localStorage and persisted across sessions
- Initial token amount (50,000) is a placeholder - adjust as needed
- Token display format uses Russian locale (1,234,567)
- All token operations update both state and localStorage
- Consider adding a low balance warning (e.g., < 1000 tokens)
