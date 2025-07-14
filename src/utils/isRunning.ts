import childProcess from "node:child_process";


export function isRunning(query: string) {
	
	const cmd = {
		darwin: "ps -ax",
		linux: "ps -A",
		win32: "tasklist"
	}[process.platform as "darwin" | "linux" | "win32"];
	
	if (!cmd)
		return false;
	
	return new Promise((resolve, reject) => {
		
		childProcess.exec(cmd, (error, stdout) => {
			if (error)
				reject(error);
			else
				resolve(stdout.toLowerCase().includes(query.toLowerCase()));
			
		});
		
	});
}
