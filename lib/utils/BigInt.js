// eslint-disable-next-line no-undef
BigInt.prototype.toJSON = function () {
	
	const string = this.toString();
	
	return this > Number.MAX_SAFE_INTEGER ? string : parseInt(string);
};
