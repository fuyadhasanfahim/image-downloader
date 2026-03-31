import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Professional color-coded logger utility (Upgraded)
 * Provides consistent, beautiful console output with table support
 */
class Logger {
    constructor() {
        this.startTime = Date.now();
    }

    getTimestamp() {
        const now = new Date();
        return chalk.gray(`[${now.toLocaleTimeString()}]`);
    }

    getElapsedTime() {
        const elapsed = Date.now() - this.startTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
    }

    info(message) { console.log(`${this.getTimestamp()} ${chalk.blue('ℹ')} ${message}`); }
    success(message) { console.log(`${this.getTimestamp()} ${chalk.green('✅')} ${message}`); }
    warn(message) { console.log(`${this.getTimestamp()} ${chalk.yellow('⚠️')} ${message}`); }
    error(message) { console.log(`${this.getTimestamp()} ${chalk.red('❌')} ${message}`); }
    skip(message) { console.log(`${this.getTimestamp()} ${chalk.cyan('⏭️')} ${message}`); }

    printHeader(version = '2.0.0') {
        console.log('\n' + chalk.bold.cyan('🚀 EXTRAORDINARY IMAGE DOWNLOADER') + chalk.gray(` v${version}`));
        console.log(chalk.gray('━'.repeat(60)));
    }

    printConfig(config) {
        const table = new Table({
            chars: { 'top': '━' , 'top-mid': '┳' , 'top-left': '┏' , 'top-right': '┓'
                   , 'bottom': '━' , 'bottom-mid': '┻' , 'bottom-left': '┗' , 'bottom-right': '┛'
                   , 'left': '┃' , 'left-mid': '┣' , 'mid': '━' , 'mid-mid': '╋'
                   , 'right': '┃' , 'right-mid': '┫' , 'middle': '┃' },
            style: { head: [], border: ['gray'] }
        });

        table.push(
            [chalk.cyan('Source'), chalk.yellow(config.inputFile || 'Multi-file Mode')],
            [chalk.cyan('Concurrency'), chalk.yellow(`${config.concurrency} workers`)],
            [chalk.cyan('Timeout'), chalk.yellow(`${config.timeout}ms`)],
            [chalk.cyan('Output'), chalk.yellow(config.paths.downloads)]
        );

        console.log(table.toString());
        console.log('');
    }

    printSummary(stats) {
        console.log('\n' + chalk.bold.white('📊 FINAL STATISTICS'));
        
        const table = new Table({
            head: [chalk.gray('Metric'), chalk.gray('Value')],
            colWidths: [20, 30],
            style: { head: [], border: ['gray'] }
        });

        table.push(
            [chalk.green('Success'), chalk.bold.green(stats.success)],
            [chalk.cyan('Skipped'), stats.skipped],
            [chalk.red('Failed'), chalk.bold.red(stats.failed)],
            [chalk.blue('Total SKUs'), stats.totalSkus],
            [chalk.magenta('Duration'), this.getElapsedTime()]
        );

        console.log(table.toString());

        if (stats.reportPath) {
            console.log(`\n${chalk.yellow('📄 REPORT SAVED TO:')} ${chalk.underline.blue(stats.reportPath)}`);
        }
        console.log('');
    }

    printShutdown() {
        console.log('\n' + chalk.yellow.bold('⚠️  GRACEFUL SHUTDOWN INITIATED'));
        console.log(chalk.gray('━'.repeat(60)));
    }

    printResume(lastRow) {
        console.log(chalk.cyan(`⏳ Resuming from row ${chalk.bold(lastRow)}...`));
    }

    printFreshStart() {
        console.log(chalk.green('🆕 Starting fresh download batch...'));
    }
}

export const logger = new Logger();
export default logger;

