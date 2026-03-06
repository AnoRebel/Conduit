/** Verbosity level for the Conduit client logger. */
export enum LogLevel {
	/** No logging output. */
	Disabled = 0,
	/** Log only errors. */
	Errors = 1,
	/** Log errors and warnings. */
	Warnings = 2,
	/** Log everything (debug). */
	All = 3,
}

/** Logger with configurable verbosity for the Conduit client. */
export class Logger {
	private _logLevel: LogLevel = LogLevel.Disabled;

	get logLevel(): LogLevel {
		return this._logLevel;
	}

	set logLevel(level: LogLevel) {
		this._logLevel = level;
	}

	log(...args: unknown[]): void {
		if (this._logLevel >= LogLevel.All) {
			this._print(LogLevel.All, ...args);
		}
	}

	warn(...args: unknown[]): void {
		if (this._logLevel >= LogLevel.Warnings) {
			this._print(LogLevel.Warnings, ...args);
		}
	}

	error(...args: unknown[]): void {
		if (this._logLevel >= LogLevel.Errors) {
			this._print(LogLevel.Errors, ...args);
		}
	}

	setLogFunction(fn: (level: LogLevel, ...args: unknown[]) => void): void {
		this._print = fn;
	}

	private _print(level: LogLevel, ...args: unknown[]): void {
		const prefix = "[Conduit]";
		const timestamp = new Date().toISOString();

		switch (level) {
			case LogLevel.All:
				console.log(prefix, timestamp, ...args);
				break;
			case LogLevel.Warnings:
				console.warn(prefix, timestamp, ...args);
				break;
			case LogLevel.Errors:
				console.error(prefix, timestamp, ...args);
				break;
		}
	}
}

/** Singleton logger instance used throughout the Conduit client. */
export const logger: Logger = new Logger();
