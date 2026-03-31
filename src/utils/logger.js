import chalk from 'chalk';

/**
 * Professional color-coded logger utility
 * Provides consistent, beautiful console output
 */
class Logger {
    constructor() {
        this.startTime = Date.now();
    }

    /**
     * Get formatted timestamp
     */
    getTimestamp() {
        const now = new Date();
        return chalk.gray(`[${now.toLocaleTimeString()}]`);
    }

    /**
     * Get elapsed time since start
     */
    getElapsedTime() {
        const elapsed = Date.now() - this.startTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return minutes > 0
            ? `${minutes}m ${remainingSeconds}s`
            : `${remainingSeconds}s`;
    }

    /**
     * Log info message
     */
    info(message) {
        console.log(`${this.getTimestamp()} ${chalk.blue('ℹ')} ${message}`);
    }

    /**
     * Log success message
     */
    success(message) {
        console.log(`${this.getTimestamp()} ${chalk.green('✅')} ${message}`);
    }

    /**
     * Log warning message
     */
    warn(message) {
        console.log(`${this.getTimestamp()} ${chalk.yellow('⚠️')} ${message}`);
    }

    /**
     * Log error message
     */
    error(message) {
        console.log(`${this.getTimestamp()} ${chalk.red('❌')} ${message}`);
    }

    /**
     * Log skip message
     */
    skip(message) {
        console.log(`${this.getTimestamp()} ${chalk.cyan('⏭️')} ${message}`);
    }

    /**
     * Log download message
     */
    download(message) {
        console.log(`${this.getTimestamp()} ${chalk.magenta('⬇️')} ${message}`);
    }

    /**
     * Print application header
     */
    printHeader(version = '1.0.0') {
        console.log('');
        console.log(
            chalk.bold.cyan('🚀 Professional Image Downloader') +
                chalk.gray(` v${version}`)
        );
        console.log(chalk.gray('━'.repeat(50)));
    }

    /**
     * Print configuration info
     */
    printConfig(config) {
        console.log(
            chalk.white(`📂 Source: ${chalk.yellow(config.inputFile)}`)
        );
        console.log(
            chalk.white(`📁 Output: ${chalk.yellow(config.paths.downloads)}`)
        );
        console.log(
            chalk.white(
                `⚡ Concurrency: ${chalk.yellow(
                    config.concurrency
                )} parallel downloads`
            )
        );
        console.log(chalk.gray('━'.repeat(50)));
        console.log('');
    }

    /**
     * Print summary statistics
     */
    printSummary(stats) {
        console.log('');
        console.log(chalk.gray('━'.repeat(50)));
        console.log(chalk.bold.white('📊 Download Summary'));
        console.log(chalk.gray('━'.repeat(50)));
        console.log(
            `${chalk.green('✅ Success:')} ${chalk.bold.green(stats.success)}`
        );
        console.log(
            `${chalk.cyan('⏭️  Skipped:')} ${chalk.bold.cyan(stats.skipped)}`
        );
        console.log(
            `${chalk.red('❌ Failed:')} ${chalk.bold.red(stats.failed)}`
        );
        console.log(
            `${chalk.blue('📁 Total SKUs:')} ${chalk.bold.blue(
                stats.totalSkus
            )}`
        );
        console.log(
            `${chalk.magenta('⏱️  Time:')} ${chalk.bold.magenta(
                this.getElapsedTime()
            )}`
        );

        if (stats.reportPath) {
            console.log(
                `${chalk.yellow('📄 Report:')} ${chalk.underline(
                    stats.reportPath
                )}`
            );
        }
        console.log(chalk.gray('━'.repeat(50)));
        console.log('');
    }

    /**
     * Print graceful shutdown message
     */
    printShutdown() {
        console.log('');
        console.log(chalk.yellow('━'.repeat(50)));
        console.log(chalk.yellow.bold('⚠️  Graceful Shutdown Initiated'));
        console.log(
            chalk.yellow(
                '   Saving progress and completing active downloads...'
            )
        );
        console.log(chalk.yellow('━'.repeat(50)));
    }

    /**
     * Print resume message
     */
    printResume(lastRow) {
        console.log(
            chalk.cyan(`⏳ Resuming from row ${chalk.bold(lastRow)}...`)
        );
        console.log('');
    }

    /**
     * Print fresh start message
     */
    printFreshStart() {
        console.log(chalk.green('🆕 Starting fresh download...'));
        console.log('');
    }
}

// Export singleton instance
export const logger = new Logger();
export default logger;
