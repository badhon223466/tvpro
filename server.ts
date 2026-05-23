import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add JSON body parsing middleware
  app.use(express.json());

  // Server-side playlist fetch proxy to bypass CORS restrictions
  app.get("/api/fetch-playlist", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== "string") {
      return res.status(400).json({ error: "Missing 'url' query parameter" });
    }

    try {
      console.log(`[Proxy] Fetching playlist URL backend-side: ${targetUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*"
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(200).json({ 
          error: `The media server returned an HTTP error code ${response.status}. Please check if the URL is active.` 
        });
      }

      const text = await response.text();
      
      // Send the content directly with plain text headers
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.send(text);
    } catch (err: any) {
      console.error(`[Proxy Error] Failed to retrieve ${targetUrl}:`, err);
      const isTimeout = err.name === 'AbortError';
      const msg = isTimeout 
        ? "Request to the playlist server timed out (15s)." 
        : (err.message || "Unknown retrieval failure");
        
      return res.status(200).json({ 
        error: `Could not retrieve playlist. Reason: ${msg}` 
      });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Integration with Vite dev / prod middlewares
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Notice the Express version is Express 4, so app.get('*', ...) is standard
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is booted up at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical: failed to start full-stack server:", err);
});
