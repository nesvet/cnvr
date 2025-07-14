export const options = [
	{
		spinner: "dots",
		indent: 1
	},
	{
		spinner: "dots2",
		indent: 1
	},
	{
		spinner: "dots3",
		indent: 1
	},
	{
		spinner: "dots4",
		indent: 1
	},
	{
		spinner: "dots5",
		indent: 1
	},
	{
		spinner: "dots6",
		indent: 1
	},
	{
		spinner: "dots7",
		indent: 1
	},
	{
		spinner: "dots8",
		indent: 1
	},
	{
		spinner: "dots9",
		indent: 1
	},
	{
		spinner: "dots10",
		indent: 1
	},
	{
		spinner: "dots12"
	},
	{
		spinner: "dots8Bit",
		indent: 1
	},
	{
		spinner: "line",
		indent: 1
	},
	{
		spinner: "pipe",
		indent: 1
	},
	{
		spinner: "star",
		indent: 1
	},
	{
		spinner: "star2",
		indent: 1
	},
	{
		spinner: "growVertical",
		indent: 1
	},
	{
		spinner: "balloon",
		indent: 1
	},
	{
		spinner: "noise",
		indent: 1
	},
	{
		spinner: "boxBounce",
		indent: 1
	},
	{
		spinner: "boxBounce2",
		indent: 1
	},
	{
		spinner: "triangle",
		indent: 1
	},
	{
		spinner: "squareCorners",
		indent: 1
	},
	{
		spinner: "circleQuarters",
		indent: 1
	},
	{
		spinner: "circleHalves",
		indent: 1
	},
	{
		spinner: "toggle13",
		indent: 1
	},
	{
		spinner: "arrow",
		indent: 1
	},
	{
		spinner: "arrow2"
	},
	{
		spinner: "smiley",
		outdent: -1
	},
	{
		spinner: "monkey",
		outdent: -1
	},
	{
		spinner: "hearts"
	},
	{
		spinner: "clock",
		outdent: -1
	},
	{
		spinner: "earth",
		outdent: -1
	},
	{
		spinner: "moon",
		outdent: -1
	},
	{
		spinner: "runner",
		outdent: -1
	},
	{
		spinner: "weather"
	},
	{
		spinner: "christmas"
	},
	{
		spinner: "layer",
		indent: 1
	},
	{
		spinner: "fingerDance",
		outdent: -1
	},
	{
		spinner: "mindblown",
		outdent: -1
	},
	{
		spinner: "speaker",
		outdent: -1
	},
	{
		spinner: "orangePulse",
		outdent: -1
	},
	{
		spinner: "bluePulse",
		outdent: -1
	},
	{
		spinner: "orangeBluePulse",
		outdent: -1
	},
	{
		spinner: "timeTravel",
		outdent: -1
	}
];

const dots = [
	"dots",
	"dots2",
	"dots3",
	"dots4",
	"dots5",
	"dots6",
	"dots7",
	"dots8",
	"dots9",
	"dots10",
	"dots12",
	"dots8Bit"
];

const simple = [
	"line",
	"pipe",
	"star",
	"star2",
	"growVertical",
	"balloon",
	"noise",
	"boxBounce",
	"boxBounce2",
	"triangle",
	"squareCorners",
	"circleQuarters",
	"circleHalves",
	"toggle13",
	"arrow",
	"layer"
];

const emojis = [
	"arrow2",
	"smiley",
	"monkey",
	"hearts",
	"clock",
	"earth",
	"moon",
	"runner",
	"weather",
	"christmas",
	"fingerDance",
	"mindblown",
	"speaker",
	"orangePulse",
	"bluePulse",
	"orangeBluePulse",
	"timeTravel"
];

for (const spinnerOptions of options)
	options[spinnerOptions.spinner] = spinnerOptions;

/** @this options */
function random() {
	return this[this.length * Math.random() | 0];// eslint-disable-line no-bitwise
}

options.random = random;

options.get = function (spinner) {
	return (
		(!spinner || spinner === "dots") ?
			options[random.call(dots)] :
			spinner === "simple" ?
				options[random.call(simple)] :
				(spinner === "emoji" || spinner === "emojis") ?
					options[random.call(emojis)] :
					spinner === "random" ?
						options.random() :
						(options[spinner] ?? options[0])
	);
};

options.colors = [ "red", "green", "yellow", "blue", "magenta", "cyan" ];

options.colors.random = random;
