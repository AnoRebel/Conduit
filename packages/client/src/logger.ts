export enum LogLevel {
	Disabled = 0,
	Errors = 1,
	Warnings = 2,
	All = 3,
}

class Logger {
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

export const logger = new Logger();
