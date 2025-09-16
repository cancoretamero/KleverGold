import { Router } from 'express';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const EMAIL_SIGNUPS_PATH = path.join(DATA_DIR, 'email-signups.json');

async function readJsonSafe(fallback = []) {
  try {
    const raw = await fs.readFile(EMAIL_SIGNUPS_PATH, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonSafe(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(EMAIL_SIGNUPS_PATH, serialized, 'utf-8');
}

const router = Router();

router.post('/email', async (req, res) => {
  try {
    const { fullName, email, password, referralCode } = req.body ?? {};

    const rawName = typeof fullName === 'string' ? fullName.trim() : '';
    if (rawName.length < 2) {
      return res.status(400).json({ ok: false, error: 'Necesitamos tu nombre completo.' });
    }
    const normalizedName = rawName.replace(/\s+/g, ' ');

    const rawEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!EMAIL_REGEX.test(rawEmail)) {
      return res.status(400).json({ ok: false, error: 'El correo electrónico no es válido.' });
    }

    const passwordValue = typeof password === 'string' ? password : '';
    if (passwordValue.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      });
    }
    if (passwordValue.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: 'La contraseña es demasiado larga.',
      });
    }

    const hasLetter = /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]/.test(passwordValue);
    const hasNumber = /\d/.test(passwordValue);
    if (!hasLetter || !hasNumber) {
      return res.status(400).json({
        ok: false,
        error: 'Usa una combinación de letras y números en tu contraseña.',
      });
    }

    const signups = await readJsonSafe([]);
    const alreadyRegistered = signups.find((entry) => entry?.email === rawEmail);
    if (alreadyRegistered) {
      return res.status(409).json({ ok: false, error: 'Este correo ya está registrado.' });
    }

    const passwordHash = crypto.createHash('sha256').update(passwordValue).digest('hex');
    const sanitizedReferral =
      typeof referralCode === 'string' && referralCode.trim() ? referralCode.trim().slice(0, 120) : null;

    const entry = {
      id: crypto.randomUUID(),
      method: 'email',
      fullName: normalizedName,
      email: rawEmail,
      passwordHash,
      referralCode: sanitizedReferral,
      createdAt: new Date().toISOString(),
      metadata: {
        ip: req.ip,
        userAgent:
          typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 200) : null,
        acceptLanguage:
          typeof req.headers['accept-language'] === 'string'
            ? req.headers['accept-language'].slice(0, 120)
            : null,
      },
    };

    await writeJsonSafe([...signups, entry]);

    return res.status(201).json({ ok: true, id: entry.id });
  } catch (error) {
    console.error('Email signup failed', error);
    return res.status(500).json({ ok: false, error: 'No se pudo completar el registro.' });
  }
});

export default router;
