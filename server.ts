import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { MultiplayerRoomServer } from './src/server/RoomServer.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const httpServer = http.createServer(app);
  const roomServer = new MultiplayerRoomServer();
  roomServer.attachToHttpServer(httpServer, '/ws');

  // Read-only health & public room directory APIs (never expose private rooms or internal secrets)
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      version: '1.0.0',
      mode: IS_PROD ? 'production' : 'development',
      rooms: roomServer.getRoomCount(),
      clients: roomServer.getConnectedClientCount(),
    });
  });

  app.get('/api/multiplayer/rooms', (_req, res) => {
    res.json({
      rooms: roomServer.getPublicRooms(),
      serverTime: Date.now(),
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');

    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        immutable: true,
        maxAge: '1y',
      }),
    );
    app.use(
      express.static(distDir, {
        maxAge: '1h',
      }),
    );
    app.get('*', (_req, res) => {
      if (!fs.existsSync(indexHtmlPath)) {
        res
          .status(503)
          .type('text/plain')
          .send('Production build not found. Run "npm run build" before starting in production mode.');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtmlPath);
    });
  }

  const shutdown = () => {
    roomServer.dispose();
    httpServer.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Wobblepeak server listening on http://0.0.0.0:${PORT} (WS /ws)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Wobblepeak server:', err);
  process.exit(1);
});
