import readlinePromises from "node:readline/promises";// eslint-disable-line import/no-unresolved
import chalk from "chalk";
import ora from "ora";
import { options as oraOptions } from "#utils/oraOptions.js";


const titleTimeoutMs = 10 * 60 * 1000;// eslint-disable-line no-magic-numbers

let prevTitle = "";
let titleTimeout = null;
const handleTitleTimeout = () => (prevTitle = null);

const rl = new readlinePromises.Readline(process.stdout);

export async function log(message, type = "info", title = "", bold = false) {
	
	clearTimeout(titleTimeout);
	
	await rl.clearLine(0).cursorTo(0).commit();
	
	if (prevTitle !== title)
		console.log(title ? `\n${bold ? chalk.underline.bold(title) : chalk.underline(title)}:` : "");
	
	if (message)
		console.log(
			type === "error" ?
				/^Trace:/.test(message) ?
					chalk.blue(message) :
					/^Debugger/.test(message) ?
						`🪲 ${message}` :
						chalk.red(message) :
				message
		);
	
	prevTitle = title;
	titleTimeout = setTimeout(handleTitleTimeout, titleTimeoutMs);// eslint-disable-line require-atomic-updates
	titleTimeout.unref();
	
}


const propsSymbol = Symbol("props");

let progress;

log.progress = async function ({ title, symbol, spinner: spinnerName }, logTitle, bold) {
	
	if (progress)
		this.finish(null, true);
	
	await this(null, null, logTitle, bold);
	
	const {
		spinner,
		color = oraOptions.colors.random(),
		indent = 0,
		outdent = 0
	} = oraOptions.get(spinnerName);
	
	const outdentString = outdent ? (outdent > 0 ? " " : "\b").repeat(Math.abs(outdent)) : "";
	
	// eslint-disable-next-line require-atomic-updates
	progress = ora({
		spinner,
		color,
		indent,
		text: `${outdentString}${title}`,
		stream: process.stdout
	}).start();
	
	let seconds = 0;
	
	// eslint-disable-next-line require-atomic-updates
	progress[propsSymbol] = {
		symbol,
		title,
		startAt: Date.now(),
		interval: setInterval(() => (progress.text = `${outdentString}${title} ${chalk.dim(++seconds)}`), 1000)
	};
	
};

log.finish = function (props, stop) {
	
	if (progress) {
		const {
			symbol,
			title,
			startAt,
			interval
		} = { ...progress[propsSymbol], ...props };
		
		clearInterval(interval);
		
		if (stop)
			progress.stop();
		else {
			progress.indent = 0;
			const total = (Date.now() - startAt) / 1000;
			progress.stopAndPersist({
				symbol,
				text: `${title}${total ? ` ${chalk.dim(total)}` : ""}`
			});
		}
		
		progress = null;
	}
	
};
