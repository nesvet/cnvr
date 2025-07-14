import { parentPort, workerData } from "node:worker_threads";
import { zip } from "zip-a-folder";


await zip(workerData.src, workerData.dest);

parentPort!.postMessage(true);
