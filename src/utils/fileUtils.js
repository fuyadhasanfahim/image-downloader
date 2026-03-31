import { existsSync, mkdirSync, statSync, readSync, openSync, closeSync } from 'fs';
import { dirname, extname, join } from 'path';

/**
 * File system utility functions (Upgraded)
 */

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath) {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Check for valid image header (Magic Bytes)
 * Supports JPEG, PNG, WebP, GIF
 */
export function isValidImageHeader(filePath) {
    if (!existsSync(filePath)) return false;
    
    const buffer = Buffer.alloc(8);
    try {
        const fd = openSync(filePath, 'r');
        readSync(fd, buffer, 0, 8, 0);
        closeSync(fd);

        // JPEG: FF D8 FF
        if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
        // PNG: 89 50 4E 47
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
        // GIF: 47 49 46 38
        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
        // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return true;

        return false;
    } catch {
        return false;
    }
}

/**
 * Check if a file exists and has valid size & header
 */
export function isValidFile(filePath, minSize = 1024) {
    if (!existsSync(filePath)) return false;

    try {
        const stats = statSync(filePath);
        if (stats.size < minSize) return false;
        
        // Only check header if file is large enough
        return isValidImageHeader(filePath);
    } catch {
        return false;
    }
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(name) {
    if (!name || typeof name !== 'string') return 'unknown';
    return name.toString().trim()
        .replace(/[<>:"/\\|?*\n\r\t]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
}

/**
 * Get file extension from URL
 */
export function getExtensionFromUrl(url) {
    try {
        const urlObj = new URL(url);
        let ext = extname(urlObj.pathname).toLowerCase();
        
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
        return validExtensions.includes(ext) ? ext : '.jpg';
    } catch {
        return '.jpg';
    }
}

/**
 * Generate image filename
 */
export function generateImageFilename(sku, index, url) {
    const sanitizedSku = sanitizeFilename(sku);
    const ext = getExtensionFromUrl(url);
    return `${sanitizedSku}_${index}${ext}`;
}

/**
 * Get image save path
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
    isValidImageHeader,
    sanitizeFilename,
    getExtensionFromUrl,
    generateImageFilename,
    getImageSavePath,
};

