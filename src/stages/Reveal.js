import { randomItem } from "@nesvet/n";
import { log, reveal } from "#utils";
import { Stage } from "./Stage.js";


const phrases = [
	"Moment of truth—let’s see what came out",
	"Time to admire our creation",
	"Let’s see what just happened",
	"Well, let’s take a peek, shall we?",
	"Time to inspect the masterpiece",
	"Drumroll, please…",
	"Voilà. Let’s have a look",
	"Behold!",
	"Magic’s done. Let’s see if it worked",
	"Crossing fingers… Opening the results",
	"No smoke? No fire? Let’s find out",
	"Let’s unveil the result",
	"Here goes nothing!"
];


export class Reveal extends Stage {
	constructor(options = {}) {
		super({
			id: "reveal",
			symbol: "📁",
			title: randomItem(phrases),
			noTargetPhrase: "Nothing",
			// target
			...options
		});
		
	}
	
	do() {
		
		const target = this.target ?? this.context.target;
		
		if (target)
			reveal(target);
		else
			log(`   ${this.noTargetPhrase}`);
		
	}
	
}
