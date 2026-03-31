import { createWriteStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import pLimit from 'p-limit';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import {
    isValidFile,
    generateImageFilename,
    getImageSavePath,
    ensureDir,
} from '../utils/fileUtils.js';

/**
 * Download Manager Service (Upgraded)
 * Uses high-performance persistent connections and atomic writes
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

        // Check content type
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.startsWith('image/')) {
            logger.warn(`  [Warning] Content-type is ${contentType} for ${url}`);
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

        if (attempt < config.retryAttempts && !error.name === 'AbortError') {
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
 * Download all images for a single SKU
 */
async function downloadSkuImages(skuData, onProgress) {
    const { sku, urls, rowIndex } = skuData;
    const result = {
        sku,
        rowIndex,
        downloaded: [],
        skipped: [],
        failed: [],
        timestamp: new Date().toISOString(),
    };

    for (const { url, columnIndex } of urls) {
        const filename = generateImageFilename(sku, columnIndex, url);
        const savePath = getImageSavePath(config.paths.downloads, sku, filename);

        // Advanced file validation
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
 * Main orchestrator
 */
export async function downloadAll(parsedData, startIndex = 0, callbacks = {}) {
    const { onProgress, onSkuComplete, onInterrupt } = callbacks;
    ensureDir(config.paths.downloads);

    const limit = pLimit(config.concurrency);
    const results = [];
    let isInterrupted = false;
    let currentIndex = startIndex;

    const dataToProcess = parsedData.slice(startIndex);
    logger.info(`🚀 Starting high-speed download for ${dataToProcess.length} SKUs...`);

    const tasks = dataToProcess.map((skuData, index) => {
        return limit(async () => {
            if (isInterrupted) return null;

            const result = await downloadSkuImages(skuData, onProgress);
            results.push(result);
            currentIndex = startIndex + index + 1;

            onSkuComplete?.(result, currentIndex);
            return result;
        });
    });

    try {
        await Promise.all(tasks);
    } catch (error) {
        logger.error(`Critical error during batch: ${error.message}`);
    }

    return {
        results,
        lastProcessedIndex: currentIndex,
        wasInterrupted: isInterrupted
    };
}

export function calculateStats(results) {
    let success = 0, skipped = 0, failed = 0;
    for (const r of results) {
        success += r.downloaded.length;
        skipped += r.skipped.length;
        failed += r.failed.length;
    }
    return {
        success, skipped, failed,
        totalSkus: results.length,
        totalImages: success + skipped + failed,
    };
}

export default {
    downloadAll,
    calculateStats,
};

