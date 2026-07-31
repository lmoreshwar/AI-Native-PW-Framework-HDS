export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

export class Logger {
    private context: string;
    private static logLevel: LogLevel = LogLevel.INFO;

    constructor(context: string) {
        this.context = context;
    }

    static create(context: string): Logger {
        return new Logger(context);
    }

    static setLogLevel(level: LogLevel): void {
        Logger.logLevel = level;
    }

    static getLogLevel(): LogLevel {
        return Logger.logLevel;
    }

    private formatMessage(level: LogLevel, message: string): string {
        return `[${new Date().toISOString()}] [${level}] [${this.context}] ${message}`;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        return levels.indexOf(level) >= levels.indexOf(Logger.logLevel);
    }

    debug(message: string): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.debug(this.formatMessage(LogLevel.DEBUG, message));
        }
    }

    info(message: string): void {
        if (this.shouldLog(LogLevel.INFO)) {
            console.info(this.formatMessage(LogLevel.INFO, message));
        }
    }

    warn(message: string): void {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage(LogLevel.WARN, message));
        }
    }

    error(message: string, error?: unknown): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(this.formatMessage(LogLevel.ERROR, message), error || '');
        }
    }

    step(stepNumber: number, description: string): void {
        this.info(`Step ${stepNumber}: ${description}`);
    }

    testStart(testName: string): void {
        this.info(`========== START: ${testName} ==========`);
    }

    testEnd(testName: string): void {
        this.info(`========== END: ${testName} ==========`);
    }
}
