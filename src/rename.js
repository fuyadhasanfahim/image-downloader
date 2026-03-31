import cliProgress from 'cli-progress';
import chalk from 'chalk';
import logger from './utils/logger.js';
import { renameAndOrganize } from './services/renameManager.js';

async function main() {
    try {
        logger.printHeader('2.0.0 - SMART ORGANIZER');

        const progressBar = new cliProgress.SingleBar({
            format: chalk.cyan('🚚 Moving & Renaming') + ' |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | {status}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true,
            barsize: 30,
        });

        let isStarted = false;
        logger.info('🚀 Starting the smart organization process...');

        const result = await renameAndOrganize(({ type, folder, total, totalFolders }) => {
            if (!isStarted) {
                progressBar.start(totalFolders, 0, { status: 'Initializing...' });
                isStarted = true;
            }
            progressBar.update(total, {
                status: `Processing ${folder.substring(0, 20)}...`
            });
        });

        if (isStarted) progressBar.stop();

        // Print a custom summary for the renamer since it doesn't need all download stats
        logger.printSummary({
            success: result.renamed,
            skipped: 0,
            failed: 0,
            totalSkus: result.folders,
        });

        logger.success('✨ Folders organized and moved to "done" directory!');
        
    } catch (error) {
        logger.error(`Fatal organizer error: ${error.message}`);
        process.exit(1);
    }
}

main();

