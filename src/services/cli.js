import inquirer from 'inquirer';
import chalk from 'chalk';
import { basename } from 'path';
import { findExcelFiles } from './excelParser.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Interactive CLI Service
 * Provides a premium selection experience for the user
 */
export async function runInteractiveSession() {
    const dataDir = config.paths.data;
    const allFiles = findExcelFiles(dataDir);

    if (allFiles.length === 0) {
        logger.error(`No Excel files found in ${dataDir}`);
        return [];
    }

    if (allFiles.length === 1) {
        logger.info(`Auto-selecting only file found: ${basename(allFiles[0])}`);
        return allFiles;
    }

    const { selectedFiles } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'selectedFiles',
            message: chalk.cyan('Select Excel files to process:'),
            choices: allFiles.map(f => ({
                name: `${basename(f)}`,
                value: f,
                checked: true
            })),
            validate: (answer) => {
                if (answer.length < 1) return 'You must choose at least one file.';
                return true;
            }
        }
    ]);

    return selectedFiles;
}

export default {
    runInteractiveSession
};
