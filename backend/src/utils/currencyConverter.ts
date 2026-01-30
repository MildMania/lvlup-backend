/**
 * Currency Converter Utility
 * 
 * Converts revenue amounts from various currencies to USD for analytics aggregation.
 * Uses static exchange rates as fallback. In production, you can integrate with
 * a live currency API (e.g., exchangerate-api.com, fixer.io, openexchangerates.org)
 */

import logger from './logger';

// Static exchange rates (updated periodically)
// These are approximate rates and should be updated regularly for accuracy
const STATIC_EXCHANGE_RATES: { [currency: string]: number } = {
    // Base currency
    'USD': 1.0,
    
    // Major currencies
    'EUR': 1.09,   // Euro
    'GBP': 1.27,   // British Pound
    'JPY': 0.0067, // Japanese Yen
    'CNY': 0.14,   // Chinese Yuan
    'INR': 0.012,  // Indian Rupee
    'CAD': 0.74,   // Canadian Dollar
    'AUD': 0.65,   // Australian Dollar
    'CHF': 1.16,   // Swiss Franc
    'KRW': 0.00075,// South Korean Won
    'MXN': 0.056,  // Mexican Peso
    'BRL': 0.19,   // Brazilian Real
    'RUB': 0.011,  // Russian Ruble
    'TRY': 0.032,  // Turkish Lira
    'SGD': 0.74,   // Singapore Dollar
    'HKD': 0.13,   // Hong Kong Dollar
    'SEK': 0.095,  // Swedish Krona
    'NOK': 0.093,  // Norwegian Krone
    'DKK': 0.15,   // Danish Krone
    'PLN': 0.25,   // Polish Złoty
    'THB': 0.028,  // Thai Baht
    'IDR': 0.000063,// Indonesian Rupiah
    'MYR': 0.22,   // Malaysian Ringgit
    'PHP': 0.018,  // Philippine Peso
    'ZAR': 0.053,  // South African Rand
    'AED': 0.27,   // UAE Dirham
    'SAR': 0.27,   // Saudi Riyal
    'EGP': 0.020,  // Egyptian Pound
    'VND': 0.000040,// Vietnamese Dong
    'ARS': 0.0010, // Argentine Peso
    'CLP': 0.0011, // Chilean Peso
    'COP': 0.00025,// Colombian Peso
    'PEN': 0.27,   // Peruvian Sol
    'ILS': 0.28,   // Israeli Shekel
    'NZD': 0.60,   // New Zealand Dollar
    'TWD': 0.031,  // Taiwan Dollar
};

/**
 * Convert amount from source currency to USD
 */
export function convertToUSD(amount: number, currency: string): number {
    // Normalize currency code
    const currencyUpper = currency.toUpperCase().trim();
    
    // Already in USD
    if (currencyUpper === 'USD') {
        return amount;
    }
    
    // Get exchange rate
    const rate = STATIC_EXCHANGE_RATES[currencyUpper];
    
    if (!rate) {
        logger.warn(`Unknown currency: ${currency}, treating as USD`);
        return amount;
    }
    
    const convertedAmount = amount * rate;
    logger.debug(`Converted ${amount} ${currency} to ${convertedAmount.toFixed(2)} USD (rate: ${rate})`);
    
    return convertedAmount;
}

/**
 * Convert amount from USD to target currency
 */
export function convertFromUSD(amountUSD: number, targetCurrency: string): number {
    const currencyUpper = targetCurrency.toUpperCase().trim();
    
    if (currencyUpper === 'USD') {
        return amountUSD;
    }
    
    const rate = STATIC_EXCHANGE_RATES[currencyUpper];
    
    if (!rate) {
        logger.warn(`Unknown currency: ${targetCurrency}, treating as USD`);
        return amountUSD;
    }
    
    return amountUSD / rate;
}

/**
 * Get all supported currencies
 */
export function getSupportedCurrencies(): string[] {
    return Object.keys(STATIC_EXCHANGE_RATES);
}

/**
 * Check if currency is supported
 */
export function isSupportedCurrency(currency: string): boolean {
    return currency.toUpperCase() in STATIC_EXCHANGE_RATES;
}

/**
 * Get exchange rate for a currency (relative to USD)
 */
export function getExchangeRate(currency: string): number | null {
    const currencyUpper = currency.toUpperCase().trim();
    return STATIC_EXCHANGE_RATES[currencyUpper] || null;
}

/**
 * Format currency with symbol
 */
export function formatCurrency(amount: number, currency: string): string {
    const currencyUpper = currency.toUpperCase().trim();
    
    // Currency symbols
    const symbols: { [key: string]: string } = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'CNY': '¥',
        'INR': '₹',
        'CAD': 'CA$',
        'AUD': 'A$',
        'CHF': 'CHF',
        'KRW': '₩',
        'MXN': 'MX$',
        'BRL': 'R$',
        'RUB': '₽',
        'TRY': '₺',
    };
    
    const symbol = symbols[currencyUpper] || currencyUpper;
    return `${symbol}${amount.toFixed(2)}`;
}

export default {
    convertToUSD,
    convertFromUSD,
    getSupportedCurrencies,
    isSupportedCurrency,
    getExchangeRate,
    formatCurrency
};

