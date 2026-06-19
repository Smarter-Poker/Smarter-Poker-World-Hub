import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import handler from '../pages/api/mlb/dashboard';

async function run() {
    const req = { method: 'GET' } as any;
    const res = {
        status: (code: number) => ({
            json: (data: any) => console.log(`Status: ${code}`, JSON.stringify(data, null, 2).substring(0, 500))
        }),
        setHeader: (key: string, value: string) => console.log(`Set header: ${key}=${value}`)
    } as any;

    await handler(req, res);
}
run();
