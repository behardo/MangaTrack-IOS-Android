/**
 * Production stub for the dev-only visual QA fixtures.
 *
 * Vite aliases every `dev/previewData` import to this module during `vite build`
 * so the demo library, profiles and activity never ship in the production
 * bundle. `<AuthProvider>` only activates the preview session in development,
 * and all preview branches are gated by `import.meta.env.DEV`.
 */
export const PREVIEW_USER = {};
export const PREVIEW_PROFILE = {};
export const PREVIEW_LIBRARY = [];
export const PREVIEW_USER_LIBRARIES = {};
export const PREVIEW_FOLLOWING = [];
export const PREVIEW_ACTIVITY = [];
export const PREVIEW_RECS = [];
export const PREVIEW_FOR_YOU = [];
