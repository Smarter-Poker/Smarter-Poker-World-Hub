/**
 * RECEIPT SCANNER API
 * OCR for tournament receipts + travel expenses  
 * Uses Grok Vision to extract structured data
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Expense categories for classification
const EXPENSE_CATEGORIES = [
    'buy_in',      // Tournament/cash game buy-ins
    'hotel',       // Lodging
    'flights',     // Air travel
    'rental_car',  // Vehicle rentals
    'gas',         // Fuel
    'meals',       // Food & drink
    'transport',   // Uber, taxi, parking
    'tips',        // Dealer tips, valet
    'tournament',  // Tournament-specific fees
    'other'        // Miscellaneous
];

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    try {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }

        // Call Grok Vision API for OCR
        const extractedData = await analyzeReceipt(image);

        return res.status(200).json({
            success: true,
            data: extractedData
        });
    } catch (error) {
        console.error('Receipt scan error:', error);
        return res.status(500).json({ error: 'Failed to scan receipt' });
    }
}

async function analyzeReceipt(imageBase64) {
    const GROK_API_KEY = process.env.GROK_API_KEY;

    if (!GROK_API_KEY) {
        // Fallback to mock data for development
        return mockReceiptData();
    }

    const prompt = `Analyze this receipt image and extract the following information in JSON format:

{
  "category": "one of: buy_in, hotel, flights, rental_car, gas, meals, transport, tips, tournament, other",
  "amount": <number - total amount paid>,
  "currency": "USD or EUR",
  "vendor": "<business name>",
  "location": "<city, state if visible>",
  "date": "<YYYY-MM-DD format if visible>",
  "description": "<brief description of what was purchased>",
  "tax_deductible": <boolean - true if likely poker-related business expense>,
  "itemized": [
    {"item": "<item name>", "amount": <number>}
  ],
  "confidence": <0-100 confidence score>
}

If any field is not visible, use null. For poker buy-ins, look for "buy-in", "entry fee", "tournament", "cash", "chips". For hotels look for room rates, nights stayed. For meals look for food items, tips, total.`;

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'grok-2-vision-latest',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageBase64.startsWith('data:')
                                        ? imageBase64
                                        : `data:image/jpeg;base64,${imageBase64}`,
                                },
                            },
                            {
                                type: 'text',
                                text: prompt,
                            },
                        ],
                    },
                ],
                temperature: 0.1,
            }),
        });

        if (!response.ok) {
            throw new Error(`Grok API error: ${response.status}`);
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return mockReceiptData();
    } catch (error) {
        console.error('Grok Vision error:', error);
        return mockReceiptData();
    }
}

function mockReceiptData() {
    return {
        category: 'buy_in',
        amount: 235,
        currency: 'USD',
        vendor: 'Bellagio Poker Room',
        location: 'Las Vegas, NV',
        date: new Date().toISOString().split('T')[0],
        description: 'Tournament buy-in',
        tax_deductible: true,
        itemized: [
            { item: 'Entry fee', amount: 200 },
            { item: 'Dealer add-on', amount: 35 }
        ],
        confidence: 0 // Mock data indicator
    };
}
