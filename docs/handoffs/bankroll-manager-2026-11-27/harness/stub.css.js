export default new Proxy({}, { get: (_, k) => String(k) });
