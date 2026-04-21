import ExcelJS from 'exceljs';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Excel Parser Service (v3.0 — Category-Aware)
 * Auto-detects header row, Category, SKU, and URL columns
 */

/**
 * Find all Excel files in a path
 */
export function findExcelFiles(inputPath) {
    if (!existsSync(inputPath)) return [];

    const stats = statSync(inputPath);
    if (stats.isFile()) {
        const ext = extname(inputPath).toLowerCase();
        return (ext === '.xlsx' || ext === '.xls') ? [inputPath] : [];
    }

    if (stats.isDirectory()) {
        return readdirSync(inputPath)
            .filter(file => {
                const ext = extname(file).toLowerCase();
                return (ext === '.xlsx' || ext === '.xls') && !file.startsWith('~$');
            })
            .map(file => join(inputPath, file))
            .sort();
    }

    return [];
}

/**
 * Auto-detect header row and column mapping.
 * Scans first 50 rows to find a row containing "SKU" and URL columns.
 * Also detects "Category English" or similar category columns.
 */
function detectHeaders(worksheet) {
    const result = {
        headerRowIndex: -1,
        skuColIndex: -1,
        categoryColIndex: -1,
        categoryLabel: null,
        urlColIndices: [],      // original URL columns only
        allUrlColIndices: [],   // all URL columns including "NEW" ones
    };

    for (let i = 1; i <= Math.min(50, worksheet.rowCount); i++) {
        const row = worksheet.getRow(i);
        const values = row.values.map(v => String(v || '').trim());
        const upper = values.map(v => v.toUpperCase());

        const skuIdx = upper.indexOf('SKU');
        if (skuIdx === -1) continue;

        // Find URL columns - only URL 1 through URL 9 (per Excel instructions)
        // Columns 10+ are promotion/brand pictures, "NEW" columns are renamed URLs
        const originalUrlCols = [];
        const allUrlCols = [];
        const downloadableUrlPattern = /^URL\s+[1-9]$/;

        upper.forEach((v, idx) => {
            if (v.includes('URL')) {
                allUrlCols.push(idx);
                // Only include if it matches exactly "URL <number>" with nothing else
                if (downloadableUrlPattern.test(v.trim())) {
                    originalUrlCols.push(idx);
                }
            }
        });

        if (originalUrlCols.length < 1) continue;

        // Detect category column — prefer "Category English" over "Category German"
        let categoryCol = -1;
        let categoryLabel = null;

        for (let c = 0; c < upper.length; c++) {
            const val = upper[c];
            if (val === 'CATEGORY ENGLISH') {
                categoryCol = c;
                categoryLabel = values[c];
                break;
            }
        }

        // Fallback: any column with "CATEGORY" or "KATEGORIE"
        if (categoryCol === -1) {
            for (let c = 0; c < upper.length; c++) {
                const val = upper[c];
                if (val.includes('CATEGOR') || val.includes('KATEGOR')) {
                    categoryCol = c;
                    categoryLabel = values[c];
                    break;
                }
            }
        }

        result.headerRowIndex = i;
        result.skuColIndex = skuIdx;
        result.categoryColIndex = categoryCol;
        result.categoryLabel = categoryLabel;
        result.urlColIndices = originalUrlCols;
        result.allUrlColIndices = allUrlCols;

        break;
    }

    return result;
}

/**
 * Parse a single Excel file
 */
export async function parseExcelFile(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`Excel file not found: ${filePath}`);
    }

    const fileName = basename(filePath);
    logger.info(`⚡ Reading: ${fileName}`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
        logger.warn(`Empty file: ${fileName}`);
        return { data: [], headers: null };
    }

    // Auto-detect headers
    const headers = detectHeaders(worksheet);

    if (headers.headerRowIndex === -1) {
        logger.warn(`Could not detect headers in: ${fileName}`);
        return { data: [], headers: null };
    }

    logger.info(`  📋 Header at row ${headers.headerRowIndex}`);
    logger.info(`  📦 SKU column: ${headers.skuColIndex}`);
    logger.info(`  🔗 URL columns (original): ${headers.urlColIndices.length}`);

    if (headers.categoryColIndex !== -1) {
        logger.info(`  📂 Category column: "${headers.categoryLabel}" (col ${headers.categoryColIndex})`);
    } else {
        logger.warn(`  ⚠️  No category column detected — images will download flat`);
    }

    // Parse data rows
    const parsedData = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headers.headerRowIndex) return;

        const sku = (row.getCell(headers.skuColIndex).text || '').trim();
        if (!sku || sku.toLowerCase() === 'nan') return;

        // Extract category
        let category = '';
        if (headers.categoryColIndex !== -1) {
            category = (row.getCell(headers.categoryColIndex).text || '').trim();
        }

        // Extract original URLs only (pure "URL N" columns)
        const urls = [];
        let sequentialNumber = 1;
        for (const colIdx of headers.urlColIndices) {
            const cell = row.getCell(colIdx);
            const url = cell.text || (cell.value && cell.value.hyperlink) || cell.value;
            if (isValidUrl(url)) {
                urls.push({
                    url: String(url).trim(),
                    columnIndex: colIdx,
                    urlNumber: sequentialNumber,
                });
                sequentialNumber++;
            }
        }

        if (urls.length > 0) {
            parsedData.push({
                sku: String(sku).trim(),
                category: category || 'Uncategorized',
                urls,
                rowIndex: rowNumber,
                sourceFile: fileName,
            });
        }
    });

    logger.success(`  ✅ Parsed ${parsedData.length} SKUs with URLs`);

    // Log category summary
    if (headers.categoryColIndex !== -1) {
        const catMap = new Map();
        for (const item of parsedData) {
            catMap.set(item.category, (catMap.get(item.category) || 0) + 1);
        }
        logger.info(`  📊 ${catMap.size} categories detected`);
    }

    return { data: parsedData, headers };
}

/**
 * Combined parser for multiple files
 */
export async function parseMultipleExcelFiles(filePaths) {
    const allData = [];
    let detectedHeaders = null;

    for (const filePath of filePaths) {
        try {
            const { data, headers } = await parseExcelFile(filePath);
            allData.push(...data);
            if (headers) detectedHeaders = headers;
        } catch (error) {
            logger.error(`Failed to parse ${basename(filePath)}: ${error.message}`);
        }
    }

    return { data: allData, headers: detectedHeaders };
}

function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export function getTotalImageCount(parsedData) {
    return parsedData.reduce((total, item) => total + item.urls.length, 0);
}

export default {
    findExcelFiles,
    parseExcelFile,
    parseMultipleExcelFiles,
    getTotalImageCount,
};
