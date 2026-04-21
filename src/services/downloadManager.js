import { createWriteStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import pLimit from 'p-limit';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import {
    isValidFile,
    sanitizeFilename,
    getExtensionFromUrl,
    ensureDir,
} from '../utils/fileUtils.js';
import { join } from 'path';

/**
 * Download Manager Service (v3.0 — Category-Aware)
 * Downloads images into Category/SKU folder structure
 * Images are renamed as SKU_1.jpg, SKU_2.jpg, etc.
 */

/**
 * Download a single image with atomic write & validation
 */
async function downloadImage(url, savePath, attempt = 1) {
    const tempPath = `${savePath}.tmp`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Atomic write to temp file
        const fileStream = createWriteStream(tempPath);
        await pipeline(response.body, fileStream);

        // Validate downloaded file
        if (!isValidFile(tempPath, config.minFileSize)) {
            await fs.unlink(tempPath).catch(() => {});
            throw new Error('Invalid image file (corrupted or small size)');
        }

        // Success - rename temp to final
        await fs.rename(tempPath, savePath);
        return { success: true };

    } catch (error) {
        // Cleanup temp file
        await fs.unlink(tempPath).catch(() => {});

        // Fixed: correct operator precedence for retry check
        if (attempt < config.retryAttempts && error.name !== 'AbortError') {
            const delay = config.retryDelay * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, delay));
            return downloadImage(url, savePath, attempt + 1);
        }

        return {
            success: false,
            error: error.message || 'Unknown error',
        };
    }
}

/**
 * Build the save path for an image.
 * Structure: downloads/Category/SKU/SKU_1.jpg
 */
function buildImagePath(baseDir, category, sku, imageNumber, url) {
    const sanitizedCategory = sanitizeFilename(category);
    const sanitizedSku = sanitizeFilename(sku);
    const ext = getExtensionFromUrl(url);

    const categoryDir = join(baseDir, sanitizedCategory);
    const skuDir = join(categoryDir, sanitizedSku);
    ensureDir(skuDir);

    const filename = `${sanitizedSku}_${imageNumber}${ext}`;
    return { savePath: join(skuDir, filename), filename };
}

/**
 * Download all images for a single SKU
 */
async function downloadSkuImages(skuData, onProgress) {
    const { sku, category, urls, rowIndex } = skuData;
    const result = {
        sku,
        category,
        rowIndex,
        downloaded: [],
        skipped: [],
        failed: [],
        timestamp: new Date().toISOString(),
    };

    for (const { url, urlNumber } of urls) {
        const { savePath, filename } = buildImagePath(
            config.paths.downloads,
            category,
            sku,
            urlNumber,
            url
        );

        // Skip if already downloaded and valid
        if (isValidFile(savePath, config.minFileSize)) {
            result.skipped.push({ filename, url, reason: 'Already exists & valid' });
            onProgress?.({ type: 'skip', sku, filename });
            continue;
        }

        const downloadResult = await downloadImage(url, savePath);

        if (downloadResult.success) {
            result.downloaded.push({ filename, url });
            onProgress?.({ type: 'success', sku, filename });
        } else {
            result.failed.push({ filename, url, error: downloadResult.error });
            onProgress?.({ type: 'error', sku, filename, error: downloadResult.error });
        }
    }

    return result;
}

/**
 * Main orchestrator — downloads all SKUs with parallel processing
 */
export async function downloadAll(parsedData, startIndex = 0, callbacks = {}) {
    const { onProgress, onSkuComplete } = callbacks;
    ensureDir(config.paths.downloads);

    const limit = pLimit(config.concurrency);
    const results = [];
    let currentIndex = startIndex;

    const dataToProcess = parsedData.slice(startIndex);
    logger.info(`🚀 Starting download for ${dataToProcess.length} SKUs...`);

    // Show category breakdown
    const catMap = new Map();
    for (const item of dataToProcess) {
        catMap.set(item.category, (catMap.get(item.category) || 0) + 1);
    }
    logger.info(`📂 Downloading into ${catMap.size} category folders`);

    const tasks = dataToProcess.map((skuData, index) => {
        return limit(async () => {
            const result = await downloadSkuImages(skuData, onProgress);
            results.push(result);
            currentIndex = startIndex + index + 1;

            onSkuComplete?.(result, currentIndex);
            return result;
        });
    });

    let wasInterrupted = false;
    try {
        await Promise.all(tasks);
    } catch (error) {
        logger.error(`Critical error during batch: ${error.message}`);
        wasInterrupted = true;
    }

    return {
        results,
        lastProcessedIndex: currentIndex,
        wasInterrupted,
    };
}

export function calculateStats(results) {
    let success = 0, skipped = 0, failed = 0;
    const categories = new Set();

    for (const r of results) {
        success += r.downloaded.length;
        skipped += r.skipped.length;
        failed += r.failed.length;
        if (r.category) categories.add(r.category);
    }

    return {
        success, skipped, failed,
        totalSkus: results.length,
        totalImages: success + skipped + failed,
        totalCategories: categories.size,
    };
}

export default {
    downloadAll,
    calculateStats,
};
