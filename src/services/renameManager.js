import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import pLimit from 'p-limit';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { ensureDir } from '../utils/fileUtils.js';

const readdir = promisify(fs.readdir);
const rename = promisify(fs.rename);
const copyFile = promisify(fs.copyFile);
const stat = promisify(fs.stat);

/**
 * Rename Manager Service
 * Handles renaming generated images and organizing folders
 */

/**
 * Process a single folder: Rename generated images sequentially
 * @param {string} folderPath - Path to the SKU folder
 * @returns {Promise<Object>} - Statistics for the folder
 */
async function processFolder(folderPath) {
    const stats = {
        renamed: 0,
        total: 0,
        sku: path.basename(folderPath),
    };

    try {
        const files = await readdir(folderPath);
        const sku = stats.sku;

        // precise regex to match {sku}_{number}.{ext}
        // Escape special chars in SKU for regex
        const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
            `^${escapedSku}_(\\d+)\\.(jpg|jpeg|png|webp|gif)$`,
            'i',
        );

        let maxIndex = 0;
        const validFiles = [];
        const filesToRename = [];

        // 1. Scan files to find current sequence
        for (const file of files) {
            const match = file.match(pattern);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxIndex) maxIndex = num;
                validFiles.push(file);
            } else {
                // Check if it's an image file that needs renaming
                if (file.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
                    filesToRename.push(file);
                }
            }
        }

        stats.total = validFiles.length + filesToRename.length;

        // 2. Rename other files sequentially
        let nextIndex = maxIndex + 1;
        for (const file of filesToRename) {
            const ext = path.extname(file);
            const oldPath = path.join(folderPath, file);
            const newFilename = `${sku}_${nextIndex}${ext}`;
            const newPath = path.join(folderPath, newFilename);

            await rename(oldPath, newPath);
            stats.renamed++;
            nextIndex++;
        }

        return stats;
    } catch (error) {
        logger.error(`Error processing folder ${folderPath}: ${error.message}`);
        throw error;
    }
}

/**
 * recursively copy directory
 */
async function copyDir(src, dest) {
    await ensureDir(dest);
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

/**
 * Main Orchestrator
 * @param {Function} onProgress - Callback for updating UI
 */
export async function renameAndOrganize(onProgress) {
    const downloadsDir = config.paths.downloads;
    const doneDir = path.join(config.paths.root, 'done');

    logger.info(`Scanning ${downloadsDir}...`);

    // Get all subdirectories (SKUs)
    const entries = await readdir(downloadsDir, { withFileTypes: true });
    const folders = entries
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => path.join(downloadsDir, dirent.name));

    if (folders.length === 0) {
        return { folders: 0, renamed: 0 };
    }

    const limit = pLimit(config.concurrency || 5);
    let totalRenamed = 0;
    let processedFolders = 0;

    // 1. Process Renaming in Parallel
    const tasks = folders.map((folder) => {
        return limit(async () => {
            const stats = await processFolder(folder);
            totalRenamed += stats.renamed;
            processedFolders++;

            onProgress?.({
                type: 'rename',
                folder: path.basename(folder),
                renamed: stats.renamed,
                total: processedFolders,
                totalFolders: folders.length,
            });

            return stats;
        });
    });

    await Promise.all(tasks);

    // 2. Copy to Done Folder
    logger.info(`Copying to 'done' directory...`);
    await copyDir(downloadsDir, doneDir);

    return {
        folders: folders.length,
        renamed: totalRenamed,
    };
}

export default {
    renameAndOrganize,
};
