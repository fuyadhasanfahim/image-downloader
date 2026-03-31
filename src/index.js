import { join } from 'path';
import { existsSync } from 'fs';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

import config from './config/index.js';
import logger from './utils/logger.js';
import { ensureDir } from './utils/fileUtils.js';
import {
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
import { runInteractiveSession } from './services/cli.js';

/**
 * Extraordinary Image Downloader
 * Main Entry Point (v2.0.0)
 */

let isShuttingDown = false;
let currentProgress = null;
let downloadResults = [];

async function main() {
    try {
        logger.printHeader('2.0.0 (Extraordinary)');

        // Ensure directories
        ensureDir(config.paths.downloads);
        ensureDir(config.paths.reports);
        ensureDir(config.paths.logs);

        // Interactive File Selection
        const selectedFiles = await runInteractiveSession();
        if (selectedFiles.length === 0) process.exit(0);

        logger.printConfig({
            ...config,
            inputFile: selectedFiles.length === 1 ? selectedFiles[0] : `${selectedFiles.length} files`
        });

        // Parse Data
        const parsedData = await parseMultipleExcelFiles(selectedFiles);
        if (parsedData.length === 0) {
            logger.warn('No valid data found in selected files.');
            process.exit(0);
        }

        const totalImages = getTotalImageCount(parsedData);
        logger.info(`📦 Total Load: ${chalk.bold(parsedData.length)} SKUs, ${chalk.bold(totalImages)} Images`);

        // Progress Tracking
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

        const remainingData = parsedData.slice(startIndex);
        const remainingImages = getTotalImageCount(remainingData);

        // Progress Bar
        const progressBar = new cliProgress.SingleBar({
            format: chalk.cyan('🚀 Downloading') + ' |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | ETA: {eta_formatted} | {status}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true,
            barsize: 30,
            synchronousUpdate: true,
        });

        progressBar.start(remainingImages, 0, { status: 'Initializing...' });
        let processedImages = 0;

        // Start High-Speed Download
        const { results, lastProcessedIndex, wasInterrupted } = await downloadAll(parsedData, startIndex, {
            onProgress: ({ type, sku, filename }) => {
                processedImages++;
                const statusMap = {
                    success: chalk.green('✓'),
                    skip: chalk.yellow('⏭'),
                    error: chalk.red('✗'),
                };
                progressBar.update(processedImages, {
                    status: `${statusMap[type]} ${filename.substring(0, 20)}`
                });
            },
            onSkuComplete: (result, index) => {
                downloadResults.push(result);
                if (index % 5 === 0) {
                    const stats = calculateStats(downloadResults);
                    currentProgress = { ...currentProgress, lastRowIndex: result.rowIndex, lastProcessedSku: result.sku, stats };
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

        const finalStats = calculateStats(downloadResults);
        let reportPath = null;
        try {
            reportPath = await generateSummary(downloadResults, finalStats);
        } catch (error) {
            logger.error(`Summary generation failed: ${error.message}`);
        }

        logger.printSummary({ ...finalStats, reportPath });

        if (!wasInterrupted) {
            clearProgress();
            logger.success('✨ All downloads completed to perfection!');
        } else {
            saveProgress(currentProgress);
            logger.warn('Download paused/interrupted. Run again to resume.');
        }
    } catch (error) {
        logger.error(`Fatal system error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    if (isShuttingDown) process.exit(1);
    isShuttingDown = true;
    logger.printShutdown();

    if (currentProgress && downloadResults.length > 0) {
        saveProgress(currentProgress);
        try {
            const stats = calculateStats(downloadResults);
            const reportPath = await generateSummary(downloadResults, stats);
            logger.printSummary({ ...stats, reportPath });
        } catch (e) {}
    }
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('uncaughtException', (e) => { logger.error(`Uncaught: ${e.message}`); process.exit(1); });
process.on('unhandledRejection', (r) => { logger.error(`Rejection: ${r}`); process.exit(1); });

main();
