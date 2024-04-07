import childProcess from "node:child_process";


export function isRunning(query) {
	
	const cmd = {
		win32: "tasklist",
		darwin: "ps -ax",
		linux: "ps -A"
	}[process.platform];
	
	if (!cmd)
		return false;
	
	return new Promise((resolve, reject) => {
		
		childProcess.exec(cmd, (error, stdout) => {
			if (error)
				reject(error);
			else
				resolve(stdout.toLowerCase().indexOf(query.toLowerCase()) > -1);
			
		});
		
	});
}
