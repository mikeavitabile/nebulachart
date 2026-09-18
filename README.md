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

## Cloud accounts (phase 1)

1. Create a Supabase project. In **SQL Editor**, run [supabase.sql](supabase.sql) once. The table's row-level policies limit each Nebula to its owner.
2. In **Authentication → Providers**, enable Email and choose the email link / OTP flow. In **Authentication → URL Configuration**, add your deployed site URL to redirect URLs; add `http://localhost:5173/**` for local testing.
3. Copy `.env.example` to `.env.local`. Fill in your Supabase project URL and **publishable/anon key** from the project API settings. Never put a service role or secret key in a `VITE_` variable.
4. Run `npm install` and `npm run dev`. For the hosted site, add the same two `VITE_` environment variables in the hosting dashboard and redeploy.
5. Enter your email in the Admin panel and open the emailed sign-in link. New accounts start with an empty cloud list. Click **Import browser Nebulas** once to copy existing local charts into the account. The browser originals remain untouched. Duplicate imports make additional copies.

Cloud accounts autosave edits. A failed cloud save displays an error in the Admin panel; save again after fixing the connection. Manual Save, Save As, rename, duplicate, and delete sync to cloud. Signing out switches back to this browser's original local chart list. Without the two environment variables, the existing local-only app runs as before.

This phase supports one account editing a Nebula at a time. Sharing and simultaneous editing are future phases. Don't work on the same Nebula in two open tabs at once; the latest full-document save wins.
