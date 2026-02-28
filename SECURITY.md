# Security Notes

## Known Development Dependencies Vulnerabilities

### esbuild CORS Vulnerability (GHSA-67mh-4wv8-2f99)

**Status:** Known, Development-Only, Moderate Severity  
**Affected Package:** esbuild <=0.24.2 (via vite@5.4.21)  
**Impact:** Development server only - does not affect production builds

#### Description
The esbuild development server sets `Access-Control-Allow-Origin: *` header to all requests, which allows any website to send requests to the development server and read responses.

#### Mitigation
- This vulnerability only affects the development server (`npm run dev`)
- Production builds (`npm run build`) are not affected
- Development server should only be run locally, never on public networks
- Do not expose the development server port (5173) to the internet

#### Resolution Plan
- Upgrading to vite@6+ or vite@7+ requires breaking changes
- Will be addressed in a future major version update
- For now, ensure development server is only accessed via localhost

## Security Best Practices

1. Never run `npm run dev` on a publicly accessible network
2. Use production builds for deployment
3. Keep the development server on localhost only
4. Regularly review npm audit reports for production dependencies
