import { createWriteStream } from 'fs';
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
 * Download Manager Service
 * Handles parallel image downloads with retry logic
 */

/**
 * Download a single image with retry logic
 * @param {string} url - Image URL
 * @param {string} savePath - Path to save the image
 * @param {number} attempt - Current attempt number
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function downloadImage(url, savePath, attempt = 1) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Create write stream and pipe response body
        const fileStream = createWriteStream(savePath);
        await pipeline(response.body, fileStream);

        return { success: true };
    } catch (error) {
        // Retry logic with exponential backoff
        if (attempt < config.retryAttempts) {
            const delay = config.retryDelay * Math.pow(2, attempt - 1);
            await sleep(delay);
            return downloadImage(url, savePath, attempt + 1);
        }

        return {
            success: false,
            error: error.message || 'Unknown error',
        };
    }
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download all images for a single SKU
 * @param {Object} skuData - SKU data with URLs
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Download result
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
        const savePath = getImageSavePath(
            config.paths.downloads,
            sku,
            filename
        );

        // Check if file already exists and is valid
        if (isValidFile(savePath, config.minFileSize)) {
            result.skipped.push({ filename, url, reason: 'Already exists' });
            onProgress?.({ type: 'skip', sku, filename });
            continue;
        }

        // Download the image
        const downloadResult = await downloadImage(url, savePath);

        if (downloadResult.success) {
            result.downloaded.push({ filename, url });
            onProgress?.({ type: 'success', sku, filename });
        } else {
            result.failed.push({ filename, url, error: downloadResult.error });
            onProgress?.({
                type: 'error',
                sku,
                filename,
                error: downloadResult.error,
            });
        }
    }

    return result;
}

/**
 * Main download orchestrator
 * @param {Array} parsedData - Parsed Excel data
 * @param {number} startIndex - Index to start from (for resume)
 * @param {Object} callbacks - Callback functions
 * @returns {Promise<Array>} - All download results
 */
export async function downloadAll(parsedData, startIndex = 0, callbacks = {}) {
    const { onProgress, onSkuComplete, onInterrupt } = callbacks;

    // Ensure download directory exists
    ensureDir(config.paths.downloads);

    // Create concurrency limiter
    const limit = pLimit(config.concurrency);

    // Track results
    const results = [];
    let isInterrupted = false;
    let currentIndex = startIndex;

    // Handle interrupt signal
    const interruptHandler = () => {
        isInterrupted = true;
        onInterrupt?.();
    };

    // Filter data to start from resume point
    const dataToProcess = parsedData.slice(startIndex);

    logger.info(
        `Processing ${dataToProcess.length} SKUs with ${config.concurrency} parallel workers`
    );

    // Create download tasks
    const tasks = dataToProcess.map((skuData, index) => {
        return limit(async () => {
            if (isInterrupted) {
                return null;
            }

            const result = await downloadSkuImages(skuData, onProgress);
            results.push(result);
            currentIndex = startIndex + index + 1;

            onSkuComplete?.(result, currentIndex);

            return result;
        });
    });

    // Execute all tasks
    try {
        await Promise.all(tasks);
    } catch (error) {
        logger.error(`Download error: ${error.message}`);
    }

    // Return interrupt handler for cleanup
    return {
        results,
        lastProcessedIndex: currentIndex,
        wasInterrupted: isInterrupted,
        interruptHandler,
    };
}

/**
 * Calculate download statistics
 * @param {Array} results - Download results
 * @returns {Object} - Statistics
 */
export function calculateStats(results) {
    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const result of results) {
        success += result.downloaded.length;
        skipped += result.skipped.length;
        failed += result.failed.length;
    }

    return {
        success,
        skipped,
        failed,
        totalSkus: results.length,
        totalImages: success + skipped + failed,
    };
}

export default {
    downloadAll,
    calculateStats,
};
