import { join } from 'path';
import { existsSync } from 'fs';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

import config from './config/index.js';
import logger from './utils/logger.js';
import { ensureDir } from './utils/fileUtils.js';
import {
    findExcelFiles,
    parseMultipleExcelFiles,
    getTotalImageCount,
} from './services/excelParser.js';
import { downloadAll, calculateStats } from './services/downloadManager.js';
import {
    loadProgress,
    saveProgress,
    clearProgress,
    createInitialProgress,
    findResumePoint,
} from './services/progressTracker.js';
import { generateSummary } from './services/summaryGenerator.js';

/**
 * Professional Image Downloader
 * Main entry point
 */

// Track if shutdown is in progress
let isShuttingDown = false;
let currentProgress = null;
let downloadResults = [];

/**
 * Main application entry point
 */
async function main() {
    try {
        // Print header
        logger.printHeader('1.0.0');

        // Ensure all directories exist
        ensureDir(config.paths.downloads);
        ensureDir(config.paths.reports);
        ensureDir(config.paths.logs);

        // Find Excel files
        const excelFiles = findInputFiles();

        if (excelFiles.length === 0) {
            logger.error('No Excel files found!');
            logger.info(
                'Place .xlsx files in the data folder or specify INPUT_PATH in .env',
            );
            process.exit(1);
        }

        logger.info(`Found ${excelFiles.length} Excel file(s)`);

        // Print configuration
        logger.printConfig({
            ...config,
            inputFile:
                excelFiles.length === 1
                    ? excelFiles[0]
                    : `${excelFiles.length} files`,
        });

        // Parse all Excel files
        const parsedData = parseMultipleExcelFiles(excelFiles);

        if (parsedData.length === 0) {
            logger.warn('No valid SKUs found in Excel files.');
            process.exit(0);
        }

        const totalImages = getTotalImageCount(parsedData);
        logger.info(
            `Total: ${chalk.bold(parsedData.length)} SKUs, ${chalk.bold(
                totalImages,
            )} images`,
        );

        // Check for existing progress
        const savedProgress = loadProgress();
        let startIndex = 0;

        if (savedProgress) {
            startIndex = findResumePoint(savedProgress, parsedData);
            if (startIndex > 0 && startIndex < parsedData.length) {
                logger.printResume(savedProgress.lastRowIndex);
                currentProgress = savedProgress;
            } else {
                logger.printFreshStart();
                currentProgress = createInitialProgress();
            }
        } else {
            logger.printFreshStart();
            currentProgress = createInitialProgress();
        }

        // Calculate remaining images
        const remainingData = parsedData.slice(startIndex);
        const remainingImages = getTotalImageCount(remainingData);

        // Create progress bar with fixed width to prevent line wrapping
        const progressBar = new cliProgress.SingleBar({
            format:
                chalk.cyan('Progress') +
                ' |' +
                chalk.cyan('{bar}') +
                '| {percentage}% | {value}/{total} | ETA: {eta_formatted} | {status}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true,
            barsize: 20, // Reduced bar size to prevent wrapping
            synchronousUpdate: true,
            noTTYOutput: false,
        });

        progressBar.start(remainingImages, 0, { status: 'Starting...' });

        let processedImages = 0;

        // Start download with callbacks
        const { results, lastProcessedIndex, wasInterrupted } =
            await downloadAll(parsedData, startIndex, {
                onProgress: ({ type, sku, filename }) => {
                    processedImages++;
                    const statusMap = {
                        success: chalk.green('✓'),
                        skip: chalk.yellow('⏭'),
                        error: chalk.red('✗'),
                    };
                    progressBar.update(processedImages, {
                        status: `${statusMap[type]} ${filename.substring(
                            0,
                            15,
                        )}`,
                    });
                },
                onSkuComplete: (result, index) => {
                    downloadResults.push(result);

                    // Update progress periodically
                    if (index % 10 === 0) {
                        const stats = calculateStats(downloadResults);
                        currentProgress = {
                            ...currentProgress,
                            lastRowIndex: result.rowIndex,
                            lastProcessedSku: result.sku,
                            stats,
                        };
                        saveProgress(currentProgress);
                    }
                },
                onInterrupt: () => {
                    progressBar.stop();
                    logger.printShutdown();
                },
            });

        progressBar.stop();
        downloadResults = results;

        // Calculate final statistics
        const finalStats = calculateStats(downloadResults);

        // Generate summary report
        let reportPath = null;
        try {
            reportPath = await generateSummary(downloadResults, finalStats);
        } catch (error) {
            logger.error(`Could not generate summary: ${error.message}`);
        }

        // Print summary
        logger.printSummary({ ...finalStats, reportPath });

        // Clear progress on successful completion (unless interrupted)
        if (!wasInterrupted) {
            clearProgress();
            logger.success('All downloads completed successfully!');
        } else {
            saveProgress(currentProgress);
            logger.warn(
                'Download interrupted. Progress saved. Run again to resume.',
            );
        }
    } catch (error) {
        logger.error(`Fatal error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

/**
 * Find input Excel files
 * Checks multiple locations in order of priority
 */
function findInputFiles() {
    const searchLocations = [];

    // 1. Check INPUT_PATH from .env if specified
    if (config.inputPath) {
        // Check as absolute path
        if (existsSync(config.inputPath)) {
            searchLocations.push(config.inputPath);
        }
        // Check relative to project root
        const rootPath = join(config.paths.root, config.inputPath);
        if (existsSync(rootPath)) {
            searchLocations.push(rootPath);
        }
        // Check relative to data directory
        const dataPath = join(config.paths.data, config.inputPath);
        if (existsSync(dataPath)) {
            searchLocations.push(dataPath);
        }
    }

    // 2. Check data directory for any .xlsx files
    searchLocations.push(config.paths.data);

    // Find Excel files from first valid location
    for (const location of searchLocations) {
        const files = findExcelFiles(location);
        if (files.length > 0) {
            return files;
        }
    }

    return [];
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        logger.warn('Force shutdown...');
        process.exit(1);
    }

    isShuttingDown = true;
    logger.printShutdown();

    // Save current progress
    if (currentProgress && downloadResults.length > 0) {
        const stats = calculateStats(downloadResults);
        currentProgress.stats = stats;
        saveProgress(currentProgress);
        logger.info('Progress saved successfully.');

        // Try to generate partial summary
        try {
            const reportPath = await generateSummary(downloadResults, stats);
            logger.printSummary({ ...stats, reportPath });
        } catch (error) {
            logger.warn(`Could not generate summary: ${error.message}`);
        }
    }

    logger.success('Shutdown complete. Run again to resume.');
    process.exit(0);
}

// Register signal handlers for graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.message}`);
    if (currentProgress) {
        saveProgress(currentProgress);
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
    if (currentProgress) {
        saveProgress(currentProgress);
    }
    process.exit(1);
});

// Run the application
main();
