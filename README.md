# InvoiceAI — Autonomous Invoice Chaser

InvoiceAI is a full-stack web app for small business owners to automatically send escalating invoice reminder emails to clients with unpaid invoices.

## Tech stack

- React + TypeScript + Vite
- Tailwind CSS (dark theme)
- Supabase (Postgres, Auth, Edge Functions) — your project: `https://zurdihlvbsoojllcgavs.supabase.co`
- Resend (email delivery) used from a Supabase Edge Function

## Getting started

### 1. Clone & install

```bash
npm install
```

### 2. Configure Supabase env

Create a `.env.local` file in the project root based on `.env.example`:

```bash
cp .env.example .env.local
```

Set:

- `VITE_SUPABASE_URL=https://zurdihlvbsoojllcgavs.supabase.co`
- `VITE_SUPABASE_ANON_KEY=your-public-anon-key` (from Supabase dashboard → Project Settings → API)

### 3. Apply database schema

In the Supabase SQL editor for your project, paste and run the contents of:

- `supabase/schema.sql`

This creates:

- `profiles`, `invoices`, `email_templates`, `email_activity`, optional `chase_runs`
- Enum types `invoice_status`, `chase_level`
- RLS policies so each user only sees their own data
- `invoice_portal_view` for the public client portal

### 4. Edge Function & cron

The autonomous email chaser is implemented as a Supabase Edge Function at:

- `supabase/functions/invoice-chaser/index.ts`

To deploy (using Supabase CLI):

```bash
supabase functions deploy invoice-chaser --project-ref zurdihlvbsoojllcgavs --no-verify-jwt
```

Set function environment variables in Supabase:

- `SUPABASE_URL=https://zurdihlvbsoojllcgavs.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`
- `RESEND_API_KEY=your-resend-api-key`
- `RESEND_FROM="Your Business <invoices@yourdomain.com>"`
- `FRONTEND_BASE_URL=https://your-frontend-domain` (or `http://localhost:5173` for dev)

Create a schedule in Supabase to run the function daily, for example:

```bash
supabase cron create invoice-chaser-daily \
  --project-ref zurdihlvbsoojllcgavs \
  --schedule "0 2 * * *" \
  --request-body '{}' \
  --function-name invoice-chaser
```

This runs the chaser every day at 02:00 UTC.

### 5. Run the frontend

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### 6. User flow

1. **Sign up / sign in** via `/auth` (Supabase email + password).
2. **Business settings**: Fill in business name, sender name, and reply-to email in the Settings page.
3. **Templates**: Configure escalation templates (Day 1, Day 7, Day 14, Day 30+).
4. **Invoices**: Create invoices in Supabase (or future in-app forms) with `auto_chase_enabled = true`.
5. **Autonomous chase**: The daily Edge Function run checks overdue invoices, picks the right template and level, sends via Resend, and logs to `email_activity`.
6. **Client portal**: Clients receive a link like `/portal/{client_portal_token}` to view and pay their invoice online.

## Notes

- Never expose your Supabase service role key to the frontend; it is only used in Edge Functions.
- The \"Pay now\" button in the client portal is a placeholder for integrating your preferred payment provider (Stripe, Razorpay, etc.).

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
