import { defineConfig, type Plugin } from 'vite';

/**
 * Inject a verification meta tag (Talent Protocol, Farcaster, etc.) into
 * `<head>` at build time when the matching env var is set.
 *
 * Build the Celo variant with:
 *   VITE_TALENT_VERIFICATION=<hash> VITE_DEFAULT_NETWORK=celo npm run build
 *
 * Default / Base builds without the env var: the tag is simply omitted —
 * no `%VITE_*%` placeholder is left in the HTML, no extra build step.
 */
function injectMetaPlugin(): Plugin {
  return {
    name: 'inject-build-meta',
    transformIndexHtml() {
      const tags: Array<{ tag: string; attrs: Record<string, string>; injectTo: 'head' }> = [];
      const talent = process.env.VITE_TALENT_VERIFICATION;
      if (talent) {
        tags.push({
          tag: 'meta',
          attrs: { name: 'talentapp:project_verification', content: talent },
          injectTo: 'head',
        });
      }
      return tags;
    },
  };
}

export default defineConfig({
  plugins: [injectMetaPlugin()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
