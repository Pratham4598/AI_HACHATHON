// Import necessary packages
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // Load environment variables from .env file

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Fatal Error: GEMINI_API_KEY is not defined in the .env file.");
  process.exit(1);
}

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Enable parsing of JSON request bodies

// --- Initialize Gemini Client ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// --- SINGLE SOURCE OF TRUTH FOR FINANCIAL DATA ---
const mockFinancialData = {
    assets: { cash: 25000, bankBalance: 350000, property: 4500000, otherAssets: 80000 },
    liabilities: { homeLoan: 3200000, carLoan: 450000, creditCardDebt: 75000, otherDebts: 20000 },
    transactions: [
        { id: 1, date: '2025-09-10', amount: -12000, category: 'Groceries', type: 'expense' },
        { id: 2, date: '2025-09-08', amount: -4500, category: 'Utilities', type: 'expense' },
        { id: 3, date: '2025-09-05', amount: 85000, category: 'Salary', type: 'income' },
        { id: 4, date: '2025-08-25', amount: -20000, category: 'Rent', type: 'expense' },
        { id: 5, date: '2025-08-20', amount: -3500, category: 'Dining Out', type: 'expense' },
        { id: 6, date: '2025-08-05', amount: 85000, category: 'Salary', type: 'income' },
    ],
    epfBalance: { currentBalance: 650000, monthlyContribution: 5800, employerMatch: 5800 },
    creditScore: { score: 780, rating: 'Excellent' },
    investments: { stocks: 450000, mutualFunds: 220000, bonds: 150000, others: 50000 }
};

// --- API Routes ---

// This endpoint sends the financial data to the frontend when it first loads.
app.get('/api/financial-data', (req, res) => {
    res.json(mockFinancialData);
});

// This endpoint handles the chat messages
app.post('/api/chat', async (req, res) => {
    try {
        const { query, permissions } = req.body;

        if (!query || !permissions) {
            return res.status(400).json({ error: 'Query and permissions are required.' });
        }

        const accessibleData = {};
        Object.keys(permissions).forEach(key => {
            if (permissions[key] && mockFinancialData[key]) {
                accessibleData[key] = mockFinancialData[key];
            }
        });

        // Pre-calculate totals to ensure consistency
        const totalAssets = accessibleData.assets ? Object.values(accessibleData.assets).reduce((sum, val) => sum + val, 0) : 0;
        const totalLiabilities = accessibleData.liabilities ? Object.values(accessibleData.liabilities).reduce((sum, val) => sum + val, 0) : 0;
        const netWorth = totalAssets - totalLiabilities;

        // Create a summary object for the AI
        const dataForAI = {
            ...accessibleData,
            summary: {
                totalAssets,
                totalLiabilities,
                calculatedNetWorth: netWorth
            }
        };

        const systemPrompt = `You are a friendly and insightful AI personal finance assistant.
        **CRITICAL RULE:** When asked for "Net Worth", you MUST use the pre-calculated values from the 'summary' object in the provided data. Use the 'summary.calculatedNetWorth' for the final answer. Use 'summary.totalAssets' and 'summary.totalLiabilities' to explain the calculation. DO NOT calculate these totals yourself by summing the individual items.
        All financial values are in Indian Rupees (INR). You MUST use the "₹" symbol for all monetary values.
        Base your answers ONLY on the data provided. Do not invent information. Be helpful and clear. Use markdown for formatting. Today's date is September 13, 2025.`;
        
        const userPrompt = `Based on the following financial data, please answer the user's question.\n\n**Financial Data:**\n\`\`\`json\n${JSON.stringify(dataForAI, null, 2)}\n\`\`\`\n\n**User Question:** "${query}"`;
        
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        res.json({ response: text });

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

