import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "eslint.config.js",
      "scripts/**",
      ".daily-worktrees/**",
      // A git submodule: someone else's editor, and none of it is in a tsconfig.
      "tools/arcadia-effects/**",
      "tools/daily-video-dashboard/**",
      "apps/controller/scripts/**",
      /*
       * Plain JavaScript on purpose, and the only such file under a `src`.
       *
       * The crew policy is loaded from plain node by the measurement harness,
       * which is why it has no relative runtime imports and no types - and why
       * type-aware linting cannot see it: it is not in a tsconfig. Its shapes
       * are declared beside it in `crewPolicy.d.mts`, which is what the room
       * type-checks against. Turning the policy itself into TypeScript is worth
       * doing and is its own change: done here it would hide behaviour edits
       * inside a rename, and the measurement that proves a move was only a move
       * cannot tell the two apart.
       */
      "apps/server/src/rooms/crewPolicy.mjs",
      "apps/server/scripts/**",
      "apps/display/android/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }]
    }
  }
);
