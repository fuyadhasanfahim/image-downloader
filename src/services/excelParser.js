import XLSX from 'xlsx';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Excel Parser Service
 * Handles reading and parsing Excel files with automatic header detection
 * Supports single file or folder with multiple Excel files
 */

/**
 * Find all Excel files in a path (file or directory)
 * @param {string} inputPath - Path to file or directory
 * @returns {Array<string>} - Array of Excel file paths
 */
export function findExcelFiles(inputPath) {
    if (!existsSync(inputPath)) {
        return [];
    }

    const stats = statSync(inputPath);

    if (stats.isFile()) {
        // Single file
        const ext = extname(inputPath).toLowerCase();
        if (ext === '.xlsx' || ext === '.xls') {
            return [inputPath];
        }
        return [];
    }

    if (stats.isDirectory()) {
        // Directory - find all Excel files
        const files = readdirSync(inputPath);
        const excelFiles = files
            .filter((file) => {
                const ext = extname(file).toLowerCase();
                return ext === '.xlsx' || ext === '.xls';
            })
            .map((file) => join(inputPath, file))
            .sort(); // Sort for consistent ordering (download1.xlsx, download2.xlsx, etc.)

        return excelFiles;
    }

    return [];
}

/**
 * Find the header row by looking for 'SKU' or 'URL' columns
 * @param {Array} rawData - Raw Excel data as 2D array
 * @returns {number} - Header row index (0-based)
 */
function findHeaderRow(rawData) {
    const maxRowsToCheck = Math.min(50, rawData.length);

    for (let i = 0; i < maxRowsToCheck; i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;

        // Convert row to strings for checking
        const rowStrings = row.map((cell) =>
            String(cell || '')
                .trim()
                .toUpperCase()
        );

        // Check if this row contains 'SKU' header
        const hasSku = rowStrings.some((cell) => cell === 'SKU');

        // Count how many cells look like URL column headers (e.g., "URL 1", "URL 2", "URL1", etc.)
        // Must be a standalone header, not part of a description text
        const urlHeaderCount = rowStrings.filter((cell) => {
            // Match patterns like: "URL", "URL 1", "URL1", "URL 1 - NEW", etc.
            // But NOT long sentences that happen to contain "URL"
            return cell.length < 50 && /^URL\s*\d*/.test(cell);
        }).length;

        // Valid header row must have SKU and at least 2 URL-like column headers
        if (hasSku && urlHeaderCount >= 2) {
            return i;
        }
    }

    // Fallback: return 0 if no header found
    return 0;
}

/**
 * Find image URL columns (columns containing 'URL' in header)
 * @param {Array} headerRow - Header row array
 * @returns {Array<number>} - Array of column indices containing URLs
 */
function findUrlColumns(headerRow) {
    const urlColumns = [];

    for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i] || '')
            .trim()
            .toUpperCase();
        if (header.includes('URL')) {
            urlColumns.push(i);
        }
    }

    return urlColumns;
}

/**
 * Find SKU column index
 * @param {Array} headerRow - Header row array
 * @returns {number} - SKU column index (default: 0)
 */
function findSkuColumn(headerRow) {
    for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i] || '')
            .trim()
            .toUpperCase();
        if (header === 'SKU') {
            return i;
        }
    }
    return 0; // Default to first column
}

/**
 * Parse a single Excel file
 * @param {string} filePath - Path to Excel file
 * @returns {Array<{sku: string, urls: Array, rowIndex: number, sourceFile: string}>}
 */
export function parseExcelFile(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`Excel file not found: ${filePath}`);
    }

    const fileName = basename(filePath);
    logger.info(`Reading: ${fileName}`);

    // Read workbook
    const workbook = XLSX.readFile(filePath);

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON array (each row as array)
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
    });

    if (rawData.length === 0) {
        logger.warn(`Empty file: ${fileName}`);
        return [];
    }

    // Auto-detect header row
    const headerRowIndex = findHeaderRow(rawData);
    const headerRow = rawData[headerRowIndex];

    // Find SKU and URL columns
    const skuColumnIndex = findSkuColumn(headerRow);
    const urlColumnIndices = findUrlColumns(headerRow);

    logger.info(
        `  Header row: ${headerRowIndex + 1}, SKU col: ${
            skuColumnIndex + 1
        }, URL cols: ${urlColumnIndices.length}`
    );

    // Get data rows (everything after header)
    const dataRows = rawData.slice(headerRowIndex + 1);

    // Parse each row
    const parsedData = [];

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const actualRowNumber = i + headerRowIndex + 2;

        // Get SKU from detected column
        const sku = row[skuColumnIndex];

        // Skip if no SKU
        if (
            !sku ||
            String(sku).trim() === '' ||
            String(sku).toLowerCase() === 'nan'
        ) {
            continue;
        }

        // Extract image URLs from detected URL columns
        const urls = [];
        for (const colIndex of urlColumnIndices) {
            const url = row[colIndex];
            if (isValidUrl(url)) {
                urls.push({
                    url: String(url).trim(),
                    columnIndex: colIndex,
                });
            }
        }

        parsedData.push({
            sku: String(sku).trim(),
            urls,
            rowIndex: actualRowNumber,
            sourceFile: fileName,
            originalRow: row,
        });
    }

    logger.success(
        `  Found ${parsedData.length} SKUs with ${getTotalImageCount(
            parsedData
        )} images`
    );

    return parsedData;
}

/**
 * Parse multiple Excel files
 * @param {Array<string>} filePaths - Array of Excel file paths
 * @returns {Array} - Combined parsed data from all files
 */
export function parseMultipleExcelFiles(filePaths) {
    const allData = [];

    for (const filePath of filePaths) {
        try {
            const data = parseExcelFile(filePath);
            allData.push(...data);
        } catch (error) {
            logger.error(
                `Failed to parse ${basename(filePath)}: ${error.message}`
            );
        }
    }

    return allData;
}

/**
 * Check if a string is a valid URL
 * @param {string} url - String to check
 * @returns {boolean}
 */
function isValidUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    const trimmed = url.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Get total image count from parsed data
 * @param {Array} parsedData - Parsed Excel data
 * @returns {number}
 */
export function getTotalImageCount(parsedData) {
    return parsedData.reduce((total, item) => total + item.urls.length, 0);
}

export default {
    findExcelFiles,
    parseExcelFile,
    parseMultipleExcelFiles,
    getTotalImageCount,
};
