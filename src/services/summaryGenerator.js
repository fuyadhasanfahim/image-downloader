import ExcelJS from 'exceljs';
import { join } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { ensureDir } from '../utils/fileUtils.js';

/**
 * Summary Generator Service
 * Creates professional Excel summary reports
 */

/**
 * Generate summary Excel file
 * @param {Array} results - Download results
 * @param {Object} stats - Overall statistics
 * @returns {Promise<string>} - Path to generated file
 */
export async function generateSummary(results, stats) {
    ensureDir(config.paths.reports);

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `download_summary_${timestamp}.xlsx`;
    const filePath = join(config.paths.reports, filename);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Professional Image Downloader';
    workbook.created = new Date();

    // Create Overview sheet
    await createOverviewSheet(workbook, stats);

    // Create Details sheet
    await createDetailsSheet(workbook, results);

    // Create Failed Downloads sheet (if any)
    const failedItems = results.flatMap((r) =>
        r.failed.map((f) => ({ sku: r.sku, rowIndex: r.rowIndex, ...f }))
    );

    if (failedItems.length > 0) {
        await createFailedSheet(workbook, failedItems);
    }

    // Save workbook
    await workbook.xlsx.writeFile(filePath);

    logger.success(`Summary report saved: ${filePath}`);

    return filePath;
}

/**
 * Create Overview sheet with statistics
 */
async function createOverviewSheet(workbook, stats) {
    const sheet = workbook.addWorksheet('Overview', {
        properties: { tabColor: { argb: '4CAF50' } },
    });

    // Title
    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = '📊 Download Summary Report';
    titleCell.font = { size: 18, bold: true, color: { argb: '2196F3' } };
    titleCell.alignment = { horizontal: 'center' };

    // Timestamp
    sheet.mergeCells('A2:D2');
    const dateCell = sheet.getCell('A2');
    dateCell.value = `Generated: ${new Date().toLocaleString()}`;
    dateCell.font = { size: 10, italic: true, color: { argb: '757575' } };
    dateCell.alignment = { horizontal: 'center' };

    // Statistics
    const statsData = [
        ['', '', '', ''],
        ['Metric', 'Count', 'Percentage', 'Status'],
        [
            '✅ Successful Downloads',
            stats.success,
            getPercentage(stats.success, stats.totalImages),
            'SUCCESS',
        ],
        [
            '⏭️ Skipped (Already Exists)',
            stats.skipped,
            getPercentage(stats.skipped, stats.totalImages),
            'SKIPPED',
        ],
        [
            '❌ Failed Downloads',
            stats.failed,
            getPercentage(stats.failed, stats.totalImages),
            'FAILED',
        ],
        ['', '', '', ''],
        ['📁 Total SKUs Processed', stats.totalSkus, '', ''],
        ['🖼️ Total Images', stats.totalImages, '', ''],
    ];

    statsData.forEach((row, index) => {
        const excelRow = sheet.addRow(row);

        if (index === 1) {
            // Header row styling
            excelRow.font = { bold: true };
            excelRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'E3F2FD' },
            };
        }

        if (row[3] === 'SUCCESS') {
            excelRow.getCell(2).font = {
                bold: true,
                color: { argb: '4CAF50' },
            };
        } else if (row[3] === 'FAILED') {
            excelRow.getCell(2).font = {
                bold: true,
                color: { argb: 'F44336' },
            };
        }
    });

    // Set column widths
    sheet.columns = [
        { width: 30 },
        { width: 15 },
        { width: 15 },
        { width: 10 },
    ];
}

/**
 * Create Details sheet with per-SKU information
 */
async function createDetailsSheet(workbook, results) {
    const sheet = workbook.addWorksheet('Details', {
        properties: { tabColor: { argb: '2196F3' } },
    });

    // Headers
    const headers = [
        'SKU',
        'Row',
        'Downloaded',
        'Skipped',
        'Failed',
        'Status',
        'Timestamp',
    ];
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2196F3' },
    };

    // Data rows
    results.forEach((result) => {
        const status =
            result.failed.length > 0
                ? '⚠️ Partial'
                : result.downloaded.length > 0
                ? '✅ Complete'
                : result.skipped.length > 0
                ? '⏭️ Skipped'
                : '❌ Empty';

        const row = sheet.addRow([
            result.sku,
            result.rowIndex,
            result.downloaded.length,
            result.skipped.length,
            result.failed.length,
            status,
            result.timestamp,
        ]);

        // Color code based on status
        if (result.failed.length > 0) {
            row.getCell(5).font = { color: { argb: 'F44336' } };
        }
        if (result.downloaded.length > 0) {
            row.getCell(3).font = { color: { argb: '4CAF50' } };
        }
    });

    // Auto-fit columns
    sheet.columns = [
        { width: 35 },
        { width: 8 },
        { width: 12 },
        { width: 10 },
        { width: 8 },
        { width: 12 },
        { width: 22 },
    ];

    // Add filters
    sheet.autoFilter = {
        from: 'A1',
        to: 'G1',
    };
}

/**
 * Create Failed Downloads sheet
 */
async function createFailedSheet(workbook, failedItems) {
    const sheet = workbook.addWorksheet('Failed Downloads', {
        properties: { tabColor: { argb: 'F44336' } },
    });

    // Headers
    const headers = ['SKU', 'Row', 'Filename', 'URL', 'Error Message'];
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'F44336' },
    };

    // Data rows
    failedItems.forEach((item) => {
        sheet.addRow([
            item.sku,
            item.rowIndex,
            item.filename,
            item.url,
            item.error,
        ]);
    });

    // Set column widths
    sheet.columns = [
        { width: 35 },
        { width: 8 },
        { width: 30 },
        { width: 60 },
        { width: 40 },
    ];
}

/**
 * Calculate percentage
 */
function getPercentage(value, total) {
    if (total === 0) return '0%';
    return `${((value / total) * 100).toFixed(1)}%`;
}

export default {
    generateSummary,
};
