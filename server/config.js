import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.HOMEFLIX_DATA || path.join(ROOT_DIR, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const WEB_DIST = path.join(ROOT_DIR, 'web', 'dist');
export const PORT = Number(process.env.PORT || 8080);

export const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi']);
// Containers every modern browser plays without conversion (assuming H.264/AAC inside).
export const BROWSER_SAFE_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov']);
export const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const SUBTITLE_EXTS = new Set(['.srt', '.vtt', '.ass', '.ssa']);

export const QUICK_SCAN_INTERVAL_MS = 30 * 60 * 1000;
