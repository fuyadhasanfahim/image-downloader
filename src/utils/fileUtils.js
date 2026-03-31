import { existsSync, mkdirSync, statSync } from 'fs';
import { dirname, extname, join } from 'path';

/**
 * File system utility functions
 */

/**
 * Ensure a directory exists, create if not
 * @param {string} dirPath - Directory path to ensure
 */
export function ensureDir(dirPath) {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Check if a file exists and has valid size
 * @param {string} filePath - File path to check
 * @param {number} minSize - Minimum valid file size in bytes
 * @returns {boolean}
 */
export function isValidFile(filePath, minSize = 1024) {
    if (!existsSync(filePath)) {
        return false;
    }

    try {
        const stats = statSync(filePath);
        return stats.size >= minSize;
    } catch {
        return false;
    }
}

/**
 * Sanitize filename by removing invalid characters
 * @param {string} name - Filename to sanitize
 * @returns {string}
 */
export function sanitizeFilename(name) {
    if (!name || typeof name !== 'string') {
        return 'unknown';
    }

    return name
        .toString()
        .trim()
        .replace(/[<>:"/\\|?*\n\r\t]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
}

/**
 * Get file extension from URL
 * @param {string} url - URL to extract extension from
 * @returns {string}
 */
export function getExtensionFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        let ext = extname(pathname).toLowerCase();

        // Validate extension
        if (!ext || ext.length > 5) {
            ext = '.jpg';
        }

        // Common image extensions
        const validExtensions = [
            '.jpg',
            '.jpeg',
            '.png',
            '.gif',
            '.webp',
            '.bmp',
            '.tiff',
        ];
        if (!validExtensions.includes(ext)) {
            ext = '.jpg';
        }

        return ext;
    } catch {
        return '.jpg';
    }
}

/**
 * Generate image filename
 * @param {string} sku - Product SKU
 * @param {number} index - Image index (1-9)
 * @param {string} url - Image URL for extension
 * @returns {string}
 */
export function generateImageFilename(sku, index, url) {
    const sanitizedSku = sanitizeFilename(sku);
    const ext = getExtensionFromUrl(url);
    return `${sanitizedSku}_${index}${ext}`;
}

/**
 * Get image save path
 * @param {string} baseDir - Base download directory
 * @param {string} sku - Product SKU
 * @param {string} filename - Image filename
 * @returns {string}
 */
export function getImageSavePath(baseDir, sku, filename) {
    const sanitizedSku = sanitizeFilename(sku);
    const skuDir = join(baseDir, sanitizedSku);
    ensureDir(skuDir);
    return join(skuDir, filename);
}

export default {
    ensureDir,
    isValidFile,
    sanitizeFilename,
    getExtensionFromUrl,
    generateImageFilename,
    getImageSavePath,
};
