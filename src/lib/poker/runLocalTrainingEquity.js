import { localTrainingEquity } from './localTrainingEquity.js';

export async function runLocalTrainingEquity(input) {
    // An offline tab already has this module. A new worker chunk may still
    // need a network request on its first use.
    if (navigator.onLine === false) return localTrainingEquity(input);
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./trainingEquity.worker.js', import.meta.url));
        worker.onmessage = ({ data }) => {
            worker.terminate();
            if (data.success) resolve(data);
            else reject(new Error(data.error));
        };
        worker.onerror = () => {
            worker.terminate();
            reject(new Error('Unable To Calculate This Spot'));
        };
        worker.postMessage(input);
    });
}
