declare module "globrex" {
	function globrex(glob: string): { regex: RegExp };
	
	export = globrex;
}
