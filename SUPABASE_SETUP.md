# Supabase & Vercel Setup Guide — SelectBot SaaS Platform

This guide walks you through connecting your central Supabase project to your SelectBot application deployed on Vercel at `https://select-bot-universal-8bxn-5ic3awrub-wan0.vercel.app`.

---

## 1. Where to Find Supabase Project URL & API Keys

1. Sign in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open your project.
3. In the left navigation menu, go to **Project Settings** (gear icon) -> **API**.
4. Copy the following credentials:
   - **Project URL**: e.g. `https://abcdefghijkl.supabase.co`
     -> Set this as `VITE_SUPABASE_URL`
   - **anon / public key**: A JWT token starting with `eyJhb...`
     -> Set this as `VITE_SUPABASE_ANON_KEY`
   - **service_role / secret key**: Another JWT token with elevated privileges
     -> Set this as `SUPABASE_SERVICE_ROLE_KEY` in Vercel environment variables (backend only, never prefix with `VITE_`).

---

## 2. Configure Vercel Environment Variables

In your Vercel Project Dashboard:
1. Go to **Settings** -> **Environment Variables**.
2. Add the following:
   - `VITE_SUPABASE_URL`: Your Supabase Project URL (e.g. `https://abcdefghijkl.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase publishable anon key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (optional, for backend operations)
   - `APP_URL`: `https://select-bot-universal-8bxn-5ic3awrub-wan0.vercel.app`
3. Check all environments (**Production**, **Preview**, **Development**).
4. Click **Save** and trigger a **Redeploy** so Vite injects the `VITE_` variables into your production build.

> **Tip**: You can also enter your Supabase Project URL and Anon Key directly in the **Supabase Auth Engine** drawer on the Login screen in your browser for instant testing without redeploying.

---

## 3. Configure Supabase Authentication & Redirect URLs

To ensure redirects work after Google OAuth login and email verification:

1. In the Supabase Dashboard, navigate to **Authentication** -> **URL Configuration**.
2. Set **Site URL**:
   ```
   https://select-bot-universal-8bxn-5ic3awrub-wan0.vercel.app
   ```
3. Under **Redirect URLs**, add:
   ```
   https://select-bot-universal-8bxn-5ic3awrub-wan0.vercel.app/**
   https://select-bot-universal-8bxn-5ic3awrub-wan0.vercel.app/
   https://select-bot-universal-8bxn-5ic3awrub-wan0.vercel.app/dashboard
   ```
4. Click **Save**.

---

## 4. Enable Google OAuth in Supabase (Zero Firebase)

To enable "Continue with Google":
1. In your Google Cloud Console, create an OAuth 2.0 Client ID (Web Application).
2. In the Google OAuth Client ID settings, add the Authorized Redirect URI provided by Supabase:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
3. In your Supabase Dashboard, go to **Authentication** -> **Providers** -> **Google**.
4. Enable the Google provider, paste your Google **Client ID** and **Client Secret**, and click **Save**.
5. When users click "Continue with Google" in SelectBot, Supabase directly manages the authentication flow with zero Firebase dependencies and zero `auth/unauthorized-domain` errors!

---

## 5. Run Database Schema & Profiles Trigger

1. In your Supabase Dashboard, open the **SQL Editor**.
2. Click **New query**.
3. Paste the contents of `supabase_schema.sql` (or `supabase/migrations/20250101_initial_schema.sql`).
4. Click **Run**.
5. This creates:
   - `public.profiles` synchronized with `auth.users` via the `on_auth_user_created` trigger
   - `public.bots` (multi-tenant chatbot configurations)
   - `public.knowledge_sources`
   - `public.deployments`
   - `public.conversations` & `public.messages`
   - Row-Level Security (RLS) policies ensuring users only access their own chatbots and data

---

## 6. Troubleshooting "Failed to fetch"

If Email Sign-In or Sign-Up shows `Failed to fetch`:
- **Unset Environment Variables**: If `VITE_SUPABASE_URL` was not set in Vercel before building, the app cannot reach Supabase. Add the env vars in Vercel and redeploy, or enter them in the login screen's "Configure" drawer.
- **Paused Project**: In Supabase free tier, projects pause after periods of inactivity. Go to the Supabase Dashboard and click **Restore project** if paused.
- **Protocol**: Verify `VITE_SUPABASE_URL` begins with `https://`.
