import { localTrainingEquity } from './localTrainingEquity.js';

self.onmessage = ({ data }) => {
    try {
        self.postMessage(localTrainingEquity(data));
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
