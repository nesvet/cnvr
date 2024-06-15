// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function () {
	
	const string = this.toString();
	
	return this > Number.MAX_SAFE_INTEGER ? string : Number.parseInt(string);
};
