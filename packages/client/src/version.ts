declare const __VERSION__: string;

export const version: string =
	typeof __VERSION__ !== "undefined" ? __VERSION__ : "1.0.0";
