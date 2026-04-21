import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// __dirname points to src/config, so:
// ROOT_DIR = go up 2 levels to image-downloader folder
// PARENT_DIR = go up 3 levels to the folder containing image-downloader

const ROOT_DIR = resolve(__dirname, '..', '..'); // src/config -> src -> image-downloader
const PARENT_DIR = resolve(__dirname, '..', '..', '..'); // src/config -> src -> image-downloader -> parent

/**
 * Application configuration
 * All settings are loaded from environment variables with sensible defaults
 */
export const config = {
    // Parallel download settings
    concurrency: parseInt(process.env.CONCURRENCY || '10', 10),
    timeout: parseInt(process.env.TIMEOUT || '30000', 10),
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10),

    // Excel settings - can be a single file or folder with multiple xlsx files
    inputPath: process.env.INPUT_PATH || '',
    inputFile: process.env.INPUT_PATH || '',  // alias for progressTracker compatibility

    // Directory paths - downloads folder is OUTSIDE the project (parent directory)
    paths: {
        root: ROOT_DIR,
        parent: PARENT_DIR,
        data: join(ROOT_DIR, 'data'), // xlsx files location inside project
        downloads: join(ROOT_DIR, process.env.OUTPUT_DIR || 'downloads'),
        reports: join(ROOT_DIR, process.env.REPORTS_DIR || 'reports'),
        done: join(ROOT_DIR, 'done'),
        logs: join(ROOT_DIR, 'logs'),
        progress: join(ROOT_DIR, '.progress.json'),
    },

    // Minimum valid file size (1KB)
    minFileSize: 1024,
};

export default config;
