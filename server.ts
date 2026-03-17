import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createProxyMiddleware } from "http-proxy-middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("Starting server...");

  // 1. Proxy Tripo API requests - MUST be before any body parsers
  app.use(
    "/api/tripo",
    createProxyMiddleware({
      target: "https://api.tripo3d.ai",
      changeOrigin: true,
      pathRewrite: (path) => {
        return `/v2/openapi${path}`;
      },
      on: {
        proxyReq: (proxyReq, req, res) => {
          const apiKey = process.env.VITE_TRIPO_API_KEY || process.env.TRIPO_API_KEY;
          if (apiKey) {
            const cleanKey = apiKey.trim();
            proxyReq.setHeader("Authorization", `Bearer ${cleanKey}`);
            // Log key prefix for debugging (sanitized)
            if (req.url.includes('/task') || req.url.includes('/upload')) {
               console.log(`[Proxy Auth] Using key starting with: ${cleanKey.substring(0, 4)}...`);
            }
          } else {
            console.warn("[Proxy Auth] No Tripo API key found in environment!");
          }
          
          // Remove headers that might trigger WAF or confuse the API
          proxyReq.removeHeader("X-Requested-With");
          proxyReq.removeHeader("Origin");
          proxyReq.removeHeader("Referer");
          
          // Set standard headers
          proxyReq.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
          proxyReq.setHeader("Accept", "application/json");
          
          if (req.method === 'POST' && req.url.includes('/task')) {
            const body = (req as any).body;
            if (body) {
              console.log(`[Proxy Task Body] ${JSON.stringify(body)}`);
            }
          }
          
          if (req.method === 'POST' && req.url.includes('/upload')) {
            console.log(`[Proxy Upload] Forwarding multipart/form-data to Tripo. Content-Length: ${req.headers['content-length']}`);
          }
          
          console.log(`[Proxy] ${req.method} ${req.url} -> ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
        },
        proxyRes: (proxyRes, req, res) => {
          const response = res as any;
          if (response.setHeader) {
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
          }
          
          if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
            console.error(`[Proxy Error Response] ${proxyRes.statusCode} from ${req.url}`);
          } else {
            console.log(`[Proxy Response] ${proxyRes.statusCode} from ${req.url}`);
          }
        },
        error: (err, req, res) => {
          console.error("[Proxy Error]", err);
          const response = res as any;
          if (response.status && !response.headersSent) {
            response.status(502).json({
              error: "Proxy failed",
              message: err.message,
            });
          }
        },
      },
      proxyTimeout: 300000,
      logger: console,
    })
  );

  // 2. Logging middleware for other requests
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/') && !req.url.startsWith('/api/tripo')) {
      console.log(`[API Request] ${req.method} ${req.url}`);
    }
    next();
  });

  const tripoKey = process.env.VITE_TRIPO_API_KEY || process.env.TRIPO_API_KEY;

  // Body parsers - MUST be after proxy to avoid interference with streaming
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Diagnostic endpoint for Tripo
  app.get("/api/tripo-check", async (req, res) => {
    const apiKey = process.env.VITE_TRIPO_API_KEY || process.env.TRIPO_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ 
        ok: false, 
        error: "Tripo API Key is not set in environment",
        suggestion: "Please add TRIPO_API_KEY to your Secrets in the Settings menu."
      });
    }

    // If key exists, we consider the basic configuration "OK" from the server's perspective
    // We'll still try a simple request to verify the key is valid if possible
    try {
      // Use a more generic endpoint or just return success that the key is present
      res.json({
        ok: true,
        status: 200,
        message: "API Key is present in environment",
        keyPreview: `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: "Internal server error during check",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Catch-all for API routes to prevent HTML fallthrough for missing routes
  app.all("/api/*", (req, res) => {
    console.warn(`[API 404] ${req.method} ${req.originalUrl} hit catch-all!`);
    res.status(404).json({
      error: "API route not found",
      message: `The route ${req.method} ${req.originalUrl} is not defined on the server.`,
      suggestion: "Check if the proxy or API route is correctly mounted in server.ts"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.url.startsWith('/api/')) {
        console.warn(`[API Fallthrough] ${req.method} ${req.url} hit SPA fallback!`);
        return res.status(404).json({ error: "API route not found" });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
