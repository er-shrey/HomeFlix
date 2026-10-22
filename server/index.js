import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, WEB_DIST } from './config.js';
import { getSetting } from './db.js';
import { sessionMiddleware, accountExists } from './auth.js';
import { scanLibrary, startWatching, libraryEvents } from './scanner.js';
import { invalidateSnapshot } from './catalog.js';
import { invalidateModel } from './recommend.js';
import { invalidateSearch } from './search.js';
import accountRoutes from './routes/account.js';
import catalogRoutes from './routes/catalog.js';
import playerRoutes from './routes/player.js';
import adminRoutes, { lanAddresses } from './routes/admin.js';
import mediaRoutes from './routes/media.js';

libraryEvents.on('changed', () => {
  invalidateSnapshot();
  invalidateModel();
  invalidateSearch();
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '64kb' }));
app.use(sessionMiddleware);

app.use('/api', accountRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', playerRoutes);
app.use('/api', catalogRoutes);
app.use('/media', mediaRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HomeFlix is running.`);
  console.log(`  On this computer: http://localhost:${PORT}`);
  for (const a of lanAddresses()) console.log(`  On your network:  ${a}`);
  if (!accountExists()) console.log('  First time? Open the address above to finish setup.');
  if (getSetting('library_path')) {
    startWatching();
    scanLibrary('app start');
  }
});
