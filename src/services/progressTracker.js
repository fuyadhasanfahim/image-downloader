import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Progress Tracker Service
 * Handles saving and loading download progress for resume capability
 */

/**
 * Default progress state
 */
const defaultProgress = {
    lastRowIndex: 0,
    lastProcessedSku: null,
    stats: {
        success: 0,
        skipped: 0,
        failed: 0,
    },
    startTime: null,
    lastUpdated: null,
    inputFile: null,
};

/**
 * Load progress from file
 * @returns {Object} - Progress state
 */
export function loadProgress() {
    try {
        if (!existsSync(config.paths.progress)) {
            return null;
        }

        const data = readFileSync(config.paths.progress, 'utf-8');
        const progress = JSON.parse(data);

        // Validate that progress is for the same input file
        if (progress.inputFile !== config.inputFile) {
            logger.warn(
                'Previous progress was for a different file. Starting fresh.'
            );
            return null;
        }

        return progress;
    } catch (error) {
        logger.warn(`Could not load progress: ${error.message}`);
        return null;
    }
}

/**
 * Save progress to file
 * @param {Object} progress - Progress state to save
 */
export function saveProgress(progress) {
    try {
        const data = {
            ...progress,
            lastUpdated: new Date().toISOString(),
        };

        writeFileSync(
            config.paths.progress,
            JSON.stringify(data, null, 2),
            'utf-8'
        );
    } catch (error) {
        logger.error(`Could not save progress: ${error.message}`);
    }
}

/**
 * Clear progress file (on successful completion)
 */
export function clearProgress() {
    try {
        if (existsSync(config.paths.progress)) {
            unlinkSync(config.paths.progress);
        }
    } catch (error) {
        logger.warn(`Could not clear progress file: ${error.message}`);
    }
}

/**
 * Create initial progress state
 * @returns {Object} - Initial progress
 */
export function createInitialProgress() {
    return {
        ...defaultProgress,
        startTime: new Date().toISOString(),
        inputFile: config.inputFile,
    };
}

/**
 * Update progress with new stats
 * @param {Object} currentProgress - Current progress state
 * @param {number} lastRowIndex - Last processed row index
 * @param {string} lastSku - Last processed SKU
 * @param {Object} stats - Updated statistics
 * @returns {Object} - Updated progress
 */
export function updateProgress(currentProgress, lastRowIndex, lastSku, stats) {
    const updated = {
        ...currentProgress,
        lastRowIndex,
        lastProcessedSku: lastSku,
        stats: {
            success:
                (currentProgress.stats?.success || 0) + (stats.success || 0),
            skipped:
                (currentProgress.stats?.skipped || 0) + (stats.skipped || 0),
            failed: (currentProgress.stats?.failed || 0) + (stats.failed || 0),
        },
    };

    saveProgress(updated);
    return updated;
}

/**
 * Find resume point from progress and parsed data
 * @param {Object} progress - Saved progress
 * @param {Array} parsedData - Parsed Excel data
 * @returns {number} - Index to resume from
 */
export function findResumePoint(progress, parsedData) {
    if (!progress || !progress.lastRowIndex) {
        return 0;
    }

    // Find the index in parsed data that matches the last row
    const resumeIndex = parsedData.findIndex(
        (item) => item.rowIndex > progress.lastRowIndex
    );

    return resumeIndex >= 0 ? resumeIndex : parsedData.length;
}

export default {
    loadProgress,
    saveProgress,
    clearProgress,
    createInitialProgress,
    updateProgress,
    findResumePoint,
};
