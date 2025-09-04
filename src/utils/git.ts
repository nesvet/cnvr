import { readFile } from "node:fs/promises";


export async function getCurrentCommitId(short = false) {
	
	let commitId;
	
	try {
		const head = (await readFile(".git/HEAD", "utf8")).trim();
		
		commitId =
			head.startsWith("ref: ") ?
				(await readFile(`.git/${head.slice(5)}`, "utf8")).trim() :
				head;
	} catch {}
	
	return commitId && short ?
		commitId.slice(0, 8) :
		commitId;
}
