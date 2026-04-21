import { promises as fs } from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { ensureDir } from '../utils/fileUtils.js';

/**
 * Rename Manager Service (v3.0 — Category-Aware)
 * Handles renaming and organizing images within Category/SKU structure
 */

async function processFolder(folderPath) {
    const stats = { renamed: 0, total: 0, sku: path.basename(folderPath) };

    try {
        const files = await fs.readdir(folderPath);
        const sku = stats.sku;
        const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^${escapedSku}_(\\d+)\\.(jpg|jpeg|png|webp|gif)$`, 'i');

        let maxIndex = 0;
        const filesToRename = [];

        for (const file of files) {
            const match = file.match(pattern);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxIndex) maxIndex = num;
            } else if (file.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
                filesToRename.push(file);
            }
        }

        let nextIndex = maxIndex + 1;
        for (const file of filesToRename) {
            const ext = path.extname(file);
            const oldPath = path.join(folderPath, file);
            const newPath = path.join(folderPath, `${sku}_${nextIndex}${ext}`);

            await fs.rename(oldPath, newPath);
            stats.renamed++;
            nextIndex++;
        }

        return stats;
    } catch (error) {
        logger.error(`Error in folder ${folderPath}: ${error.message}`);
        throw error;
    }
}

/**
 * Find all SKU folders recursively under downloads/.
 * Supports both flat (downloads/SKU/) and category (downloads/Category/SKU/) structures.
 */
async function findSkuFolders(baseDir) {
    const folders = [];
    const entries = await fs.readdir(baseDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(baseDir, entry.name);

        // Check if this directory contains image files (it's a SKU folder)
        const children = await fs.readdir(fullPath, { withFileTypes: true });
        const hasImages = children.some(c => c.isFile() && /\.(jpg|jpeg|png|webp|gif)$/i.test(c.name));

        if (hasImages) {
            folders.push({ path: fullPath, category: null, sku: entry.name });
        } else {
            // It's probably a category folder — check its children
            for (const child of children) {
                if (!child.isDirectory()) continue;
                const childPath = path.join(fullPath, child.name);
                const grandChildren = await fs.readdir(childPath).catch(() => []);
                const childHasImages = grandChildren.some(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
                if (childHasImages) {
                    folders.push({ path: childPath, category: entry.name, sku: child.name });
                }
            }
        }
    }

    return folders;
}

export async function renameAndOrganize(onProgress) {
    const downloadsDir = config.paths.downloads;
    const doneDir = config.paths.done || path.join(config.paths.root, 'done');

    logger.info(`🔍 Scanning ${downloadsDir} for organization...`);

    const skuFolders = await findSkuFolders(downloadsDir);

    if (skuFolders.length === 0) {
        logger.warn('No SKU folders with images found.');
        return { folders: 0, renamed: 0 };
    }

    logger.info(`📂 Found ${skuFolders.length} SKU folders to process`);

    const limit = pLimit(config.concurrency || 10);
    let totalRenamed = 0;
    let processedFolders = 0;

    await Promise.all(skuFolders.map(folder => limit(async () => {
        const stats = await processFolder(folder.path);
        totalRenamed += stats.renamed;
        processedFolders++;

        onProgress?.({
            type: 'rename',
            folder: folder.sku,
            category: folder.category,
            renamed: stats.renamed,
            total: processedFolders,
            totalFolders: skuFolders.length
        });
    })));

    // Move to done/ preserving category structure
    logger.info(`🚚 Moving processed folders to 'done' directory...`);
    await ensureDir(doneDir);

    for (const folder of skuFolders) {
        let destDir;
        if (folder.category) {
            // Preserve category folder structure: done/Category/SKU
            destDir = path.join(doneDir, folder.category);
            await ensureDir(destDir);
        } else {
            destDir = doneDir;
        }

        const dest = path.join(destDir, folder.sku);
        await fs.rename(folder.path, dest).catch(async (err) => {
            if (err.code === 'EXDEV') {
                // Cross-device move: copy then delete
                logger.warn(`  [Notice] Cross-device move for ${folder.sku}, using copy fallback...`);
                await copyDir(folder.path, dest);
                await fs.rm(folder.path, { recursive: true, force: true });
            } else {
                throw err;
            }
        });
    }

    return { folders: skuFolders.length, renamed: totalRenamed };
}

/**
 * Recursive directory copy fallback for cross-device moves
 */
async function copyDir(src, dest) {
    await ensureDir(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

export default { renameAndOrganize };
