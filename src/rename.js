import cliProgress from 'cli-progress';
import chalk from 'chalk';
import logger from './utils/logger.js';
import { renameAndOrganize } from './services/renameManager.js';

async function main() {
    try {
        logger.printHeader('1.0.0 - Renamer');

        // Progress Bar
        const progressBar = new cliProgress.SingleBar({
            format:
                chalk.cyan('Renaming') +
                ' |' +
                chalk.cyan('{bar}') +
                '| {percentage}% | {value}/{total} | {status}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true,
            barsize: 25,
        });

        // We don't know total yet, will update when start
        let isStarted = false;

        logger.info('Starting renaming process...');

        const result = await renameAndOrganize(
            ({ type, folder, total, totalFolders }) => {
                if (!isStarted) {
                    progressBar.start(totalFolders, 0, {
                        status: 'Starting...',
                    });
                    isStarted = true;
                }

                progressBar.update(total, {
                    status: `Checked ${folder.substring(0, 15)}...`,
                });
            },
        );

        if (isStarted) {
            progressBar.stop();
        }

        logger.success('--------------------------------------------------');
        logger.success(`✅ Process Complete!`);
        logger.info(`   Folders Processed: ${result.folders}`);
        logger.info(`   Images Renamed:    ${result.renamed}`);
        logger.info(`   Backup created in: 'done' folder`);
        logger.success('--------------------------------------------------');
    } catch (error) {
        logger.error(`Fatal error: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

main();
