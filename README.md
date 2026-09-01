# TradingCore OS — Institutional Algorithmic Trading Platform

**TradingCore OS** is a high-performance, non-custodial web application and institutional algorithmic trading platform built for Indian stock markets (NSE/BSE). It features direct broker OAuth 2.0 integration, visual strategy builder, real-time algo terminal execution, and comprehensive risk management.

---

## 🛠️ Tech Stack & Architecture

- **Frontend Framework**: React 19, TypeScript, Vite
- **Styling & UI**: Tailwind CSS v4, Lucide React Icons, Framer Motion (`motion/react`)
- **Backend & Authentication**: Supabase Auth (Google OAuth 2.0 & Email/Password Sign-In), Supabase Database (Profiles persistence & session synchronization)
- **State Management**: React Context (`AuthContext`, `useProfile`), custom hooks, and local non-custodial state engines

---

## 🚀 Key Features Implemented

### 1. **Institutional Landing Page**
- **Hero & Live Workspace Preview**: Interactive preview of the trading terminal, live ticker tapes, and execution widgets.
- **Supported Brokers Strip**: Integration status cards for Upstox and Fyers. Additional broker adapters are planned and are not currently advertised as live integrations.
- **Why TradingCore Bento Grid**: Highlights keyboard-first execution, risk guardrails, and broker-aware order routing.
- **Features Deep Dive & Timeline**: Visual breakdown of algo backtesting, multi-account routing, and interactive how-it-works timeline.
- **Pricing & FAQ**: Transparent plan tiers (Free Core and Pro Trader) with interactive FAQ accordions.

### 2. **Authentication & User Management**
- **Supabase Authentication**: Native integration with Google OAuth 2.0 and Email/Password credentials.
- **Graceful Fallbacks & Lazy Initialization**: Safe environment variable handling with user-friendly error banners (`ErrorCard`) and non-blocking loading states (`LoadingScreen`).
- **User Profile Synchronization**: Tracks user onboarding status (`is_onboarded`), display avatar, full name, and broker connections in Supabase.
- **User Menu**: Top navigation user drawer supporting navigation to profile, connected brokers, settings, and sign-out.

### 3. **Broker Connection & Step-2 Onboarding**
- **Protected Onboarding Route**: Un-onboarded users are routed to connect a broker before entering the live workspace.
- **OAuth Gateway Cards**: Direct authentication cards for Upstox and Fyers.
- **Security Protocols**: Non-custodial design with AES-256-GCM encrypted broker access tokens; TradingCore does not store user trading PINs.

### 4. **Full Trading Workspace**
- **Live Terminal & Strategy Engine**: Visual drag-and-drop strategy node canvas and real-time execution monitor.
- **Orders & Positions Dashboard**: Institutional order book, open positions tracker, and risk margin metrics.
- **Sub-View Navigation**: Switch between Market Overview, Strategy Builder, Algo Terminal, Orders & Positions, and Risk Management.

---

## ⚙️ Setup & Local Development

To run the application with full persistence and Google OAuth sign-in, configure the environment below and run `npm run dev`. The dev server uses the same Express API + Vite middleware path used by the production serverless API.

### 1. Environment Variables in AI Studio Settings
Ensure the following variables are declared in your AI Studio Settings (and copied to `.env` during local deployment):
```env
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

---

### 2. Supabase SQL Database Schema Setup
Run the following SQL script in your **Supabase SQL Editor** (`https://supabase.com/dashboard/project/<your-project-id>/sql`) to create the `profiles` table and set up row-level security (RLS):

```sql
-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  is_onboarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
CREATE POLICY "Public profiles are viewable by owner" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. Automatic Profile Creation Trigger on New User Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, is_onboarded)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### 3. Supabase Auth URL Configuration
In your Supabase Dashboard under **Authentication > URL Configuration**:
1. Set **Site URL** to your AI Studio domain:
   `https://ais-dev-ogukhwboaaosixnm2dyp4a-313444256858.asia-southeast1.run.app`
2. Add your application URL to **Redirect URLs**:
   `https://ais-dev-ogukhwboaaosixnm2dyp4a-313444256858.asia-southeast1.run.app/**`

---

### 4. Google OAuth 2.0 Configuration (Optional for Google Sign-In)
In your Supabase Dashboard under **Authentication > Providers > Google**:
1. Toggle **Enable Sign in with Google** to ON.
2. In Google Cloud Console (`https://console.cloud.google.com`), create an OAuth 2.0 Client ID for Web Applications.
3. Paste the **Authorized Redirect URI** provided by Supabase into Google Cloud Console:
   `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
4. Copy the generated **Client ID** and **Client Secret** from Google Cloud Console into the Supabase Google Provider fields.
5. Click **Save**.

---

## 🔒 Security & Privacy Standard
- **Non-Custodial Design**: No passwords or trading PINs are stored. Broker access/refresh tokens are encrypted at rest with AES-256-GCM and require a server-only encryption secret.
- **Row-Level Security**: Supabase RLS guarantees users can only access and modify their own workspace state and profile records.
---

## Vercel Production Deployment

Current production deployment is environment-specific; configure the public app URL in `VITE_APP_URL` and broker redirect variables rather than hard-coding a deployment URL in application code.

The Vite frontend and Express API both deploy through Vercel. Before live Upstox login can work in production, add these environment variables in Vercel Project Settings:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
UPSTOX_CLIENT_ID=your-upstox-client-id
UPSTOX_CLIENT_SECRET=your-upstox-client-secret
UPSTOX_REDIRECT_URI=https://tradingcoreos.vercel.app/auth/broker-callback
FYERS_CLIENT_ID=your-fyers-app-id
FYERS_CLIENT_SECRET=your-fyers-app-secret
FYERS_REDIRECT_URI=https://tradingcoreos.vercel.app/auth/broker-callback
ENCRYPTION_SECRET=use-a-long-random-secret-from-a-secret-manager
```

Run `supabase/broker_sessions.sql` in the Supabase SQL Editor so encrypted broker sessions and one-time OAuth state records persist across serverless calls. In production, do not enable the in-memory development fallbacks.


### Multi-user broker architecture

TradingCore is designed as a multi-tenant application: every signed-in TradingCore user receives an isolated broker OAuth state and a broker session keyed by `(user_id, broker_id)`. Broker access/refresh tokens are encrypted at rest and never sent to the browser. OAuth callbacks derive the user from the short-lived state instead of trusting a browser-supplied user ID.

### Upstox API versioning

Upstox versioning is endpoint-specific. TradingCore uses the documented V3 routes for order operations, market-data feed, and Fund & Margin where available. OAuth authorization and several portfolio endpoints remain on documented V2 routes. This is intentional and should not be replaced by a blanket `v3` URL prefix.

### Latency architecture

TradingCore cannot truthfully guarantee that it will execute faster than a broker's own native terminal because the broker/exchange gateway remains in the execution path. The platform can reduce TradingCore-added latency by using persistent connections, regional deployment, connection reuse, minimal serialization, fast authentication/session lookup, preloaded instrument metadata, WebSocket streaming, and an execution gateway rather than cold-start serverless functions.
