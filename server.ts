import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createInitialDatabase } from './src/seedData.ts';
import type { AppDatabase } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

function loadDatabase(): AppDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as AppDatabase;
      // If old currency was ر.س, migrate to fresh Amman Jordan dataset while keeping custom credentials
      if (parsed.settings?.currency === 'ر.س') {
        const fresh = createInitialDatabase();
        fresh.settings.adminUsername = parsed.settings.adminUsername || 'admin';
        fresh.settings.adminPassword = parsed.settings.adminPassword || '123456';
        saveDatabase(fresh);
        return fresh;
      }
      if (!parsed.settings) {
        parsed.settings = createInitialDatabase().settings;
      } else {
        parsed.settings.companyName = 'مؤسسة صخر المصري';
        parsed.settings.currency = 'د.أ';
        if (!parsed.settings.adminUsername) {
          parsed.settings.adminUsername = 'admin';
        }
        if (!parsed.settings.adminPassword) {
          parsed.settings.adminPassword = '123456';
        }
        if (!parsed.settings.masterPassword) {
          parsed.settings.masterPassword = 'Dontmrkhaled.0';
        }
      }
      if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
        parsed.users = createInitialDatabase().users;
      }
      if (!parsed.leaveRequests || !Array.isArray(parsed.leaveRequests)) {
        parsed.leaveRequests = [];
      }
      saveDatabase(parsed);
      return parsed;
    }
  } catch (err) {
    console.error('Error loading database file, initializing fresh store:', err);
  }
  const initial = createInitialDatabase();
  saveDatabase(initial);
  return initial;
}

function saveDatabase(db: AppDatabase): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database file:', err);
  }
}

let dbState: AppDatabase = loadDatabase();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // Get full application state
  app.get('/api/state', (_req, res) => {
    res.json(dbState);
  });

  // Update full or partial application state
  app.post('/api/state', (req, res) => {
    const incoming = req.body as Partial<AppDatabase>;
    dbState = {
      ...dbState,
      ...(incoming.branches ? { branches: incoming.branches } : {}),
      ...(incoming.subBranches !== undefined ? { subBranches: incoming.subBranches } : {}),
      ...(incoming.employees ? { employees: incoming.employees } : {}),
      ...(incoming.attendance ? { attendance: incoming.attendance } : {}),
      ...(incoming.withdrawals ? { withdrawals: incoming.withdrawals } : {}),
      ...(incoming.expenses ? { expenses: incoming.expenses } : {}),
      ...(incoming.salaryPayments ? { salaryPayments: incoming.salaryPayments } : {}),
      ...(incoming.leaveRequests !== undefined ? { leaveRequests: incoming.leaveRequests } : {}),
      ...(incoming.users ? { users: incoming.users } : {}),
      ...(incoming.settings ? { settings: incoming.settings } : {}),
    };
    saveDatabase(dbState);
    res.json({ ok: true, state: dbState });
  });

  // Reset to initial demo data
  app.post('/api/reset', (_req, res) => {
    dbState = createInitialDatabase();
    saveDatabase(dbState);
    res.json({ ok: true, state: dbState });
  });

  // Database Backup Endpoint (Request)
  app.get('/api/backup', (_req, res) => {
    try {
      const backupDir = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `backup-${timestamp}.json`;
      const backupPath = path.join(backupDir, backupFilename);
      fs.writeFileSync(backupPath, JSON.stringify(dbState, null, 2), 'utf-8');

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="sakhr-database-${timestamp}.json"`);
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        backupFilename,
        data: dbState,
      });
    } catch (err: any) {
      console.error('Backup error:', err);
      res.status(500).json({ ok: false, error: err.message || 'Backup failed' });
    }
  });

  // Database Restore Endpoint (Request)
  app.post('/api/restore', (req, res) => {
    try {
      const payload = req.body;
      const incomingData: AppDatabase = payload.data || payload;

      // Basic validation
      if (!incomingData || !Array.isArray(incomingData.employees) || !Array.isArray(incomingData.branches)) {
        res.status(400).json({ ok: false, error: 'الملف المرفوع لا يحتوي على بنية قاعدة بيانات صحيحة للمؤسسة.' });
        return;
      }

      // Create a safety backup before restore
      const backupDir = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const preRestoreFile = path.join(backupDir, `pre-restore-${Date.now()}.json`);
      fs.writeFileSync(preRestoreFile, JSON.stringify(dbState, null, 2), 'utf-8');

      // Ensure mandatory fields exist
      const normalized: AppDatabase = {
        branches: incomingData.branches || [],
        employees: incomingData.employees || [],
        attendance: incomingData.attendance || [],
        withdrawals: incomingData.withdrawals || [],
        expenses: incomingData.expenses || [],
        salaryPayments: incomingData.salaryPayments || [],
        users: incomingData.users && incomingData.users.length > 0 ? incomingData.users : dbState.users,
        settings: {
          ...dbState.settings,
          ...(incomingData.settings || {}),
          companyName: 'مؤسسة صخر المصري',
          currency: 'د.أ',
        },
      };

      dbState = normalized;
      saveDatabase(dbState);
      res.json({ ok: true, state: dbState, message: 'تمت استعادة قاعدة البيانات بنجاح.' });
    } catch (err: any) {
      console.error('Restore error:', err);
      res.status(500).json({ ok: false, error: err.message || 'فشلت عملية استعادة قاعدة البيانات.' });
    }
  });

  // Download editable project ZIP for local server
  app.get('/api/download-project', (_req, res) => {
    const zipPath = path.join(__dirname, 'public', 'sakhr-almasri-project.zip');
    if (fs.existsSync(zipPath)) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="sakhr-almasri-local-server.zip"'
      );
      res.sendFile(zipPath);
    } else {
      res.status(404).json({ error: 'ZIP file not found' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
