import { calculateEquity } from './pokerOddsEngine.js';

self.onmessage = ({ data }) => {
    try {
        self.postMessage({ results: calculateEquity(data) });
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};
