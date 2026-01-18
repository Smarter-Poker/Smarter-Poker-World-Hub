/**
 * Chart Service
 * Service layer for interacting with memory_charts_gold table
 */

import { supabase } from '../lib/supabase';

/**
 * Fetch all charts from the database
 * @returns {Promise<{data: Array, error: any}>}
 */
export async function getAllCharts() {
    try {
        const { data, error } = await supabase
            .from('memory_charts_gold')
            .select('*')
            .order('created_at', { ascending: false });

        return { data, error };
    } catch (err) {
        console.error('Error fetching charts:', err);
        return { data: null, error: err };
    }
}

/**
 * Fetch a single chart by ID
 * @param {string} id - Chart UUID
 * @returns {Promise<{data: Object, error: any}>}
 */
export async function getChartById(id) {
    try {
        const { data, error } = await supabase
            .from('memory_charts_gold')
            .select('*')
            .eq('id', id)
            .single();

        return { data, error };
    } catch (err) {
        console.error('Error fetching chart:', err);
        return { data: null, error: err };
    }
}

/**
 * Fetch charts by category
 * @param {string} category - Category filter (Preflop, PushFold, Nash)
 * @returns {Promise<{data: Array, error: any}>}
 */
export async function getChartsByCategory(category) {
    try {
        const { data, error } = await supabase
            .from('memory_charts_gold')
            .select('*')
            .eq('category', category)
            .order('created_at', { ascending: false });

        return { data, error };
    } catch (err) {
        console.error('Error fetching charts by category:', err);
        return { data: null, error: err };
    }
}

/**
 * Create a new chart
 * @param {Object} chartData - Chart data object
 * @returns {Promise<{data: Object, error: any}>}
 */
export async function createChart(chartData) {
    try {
        // Validate before insert
        const validation = validateChartData(chartData);
        if (!validation.valid) {
            return { data: null, error: new Error(validation.error) };
        }

        const { data, error } = await supabase
            .from('memory_charts_gold')
            .insert([chartData])
            .select()
            .single();

        return { data, error };
    } catch (err) {
        console.error('Error creating chart:', err);
        return { data: null, error: err };
    }
}

/**
 * Update an existing chart
 * @param {string} id - Chart UUID
 * @param {Object} chartData - Updated chart data
 * @returns {Promise<{data: Object, error: any}>}
 */
export async function updateChart(id, chartData) {
    try {
        // Validate before update
        const validation = validateChartData(chartData);
        if (!validation.valid) {
            return { data: null, error: new Error(validation.error) };
        }

        const { data, error } = await supabase
            .from('memory_charts_gold')
            .update(chartData)
            .eq('id', id)
            .select()
            .single();

        return { data, error };
    } catch (err) {
        console.error('Error updating chart:', err);
        return { data: null, error: err };
    }
}

/**
 * Delete a chart
 * @param {string} id - Chart UUID
 * @returns {Promise<{data: Object, error: any}>}
 */
export async function deleteChart(id) {
    try {
        const { data, error } = await supabase
            .from('memory_charts_gold')
            .delete()
            .eq('id', id)
            .select()
            .single();

        return { data, error };
    } catch (err) {
        console.error('Error deleting chart:', err);
        return { data: null, error: err };
    }
}

/**
 * Validate chart data before save
 * @param {Object} chartData - Chart data to validate
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateChartData(chartData) {
    // Required fields
    if (!chartData.chart_name || chartData.chart_name.trim() === '') {
        return { valid: false, error: 'Chart name is required' };
    }

    if (!chartData.category) {
        return { valid: false, error: 'Category is required' };
    }

    if (!['Preflop', 'PushFold', 'Nash'].includes(chartData.category)) {
        return { valid: false, error: 'Invalid category. Must be Preflop, PushFold, or Nash' };
    }

    if (!chartData.chart_grid || typeof chartData.chart_grid !== 'object') {
        return { valid: false, error: 'Chart grid is required and must be an object' };
    }

    // Validate chart_grid structure
    const gridKeys = Object.keys(chartData.chart_grid);
    if (gridKeys.length === 0) {
        return { valid: false, error: 'Chart grid cannot be empty' };
    }

    // Validate each hand in the grid
    for (const [hand, data] of Object.entries(chartData.chart_grid)) {
        if (!data.action) {
            return { valid: false, error: `Hand ${hand} is missing action` };
        }

        if (!['Fold', 'Call', 'Raise', 'Mixed'].includes(data.action)) {
            return { valid: false, error: `Hand ${hand} has invalid action: ${data.action}` };
        }

        if (data.freq !== undefined && (data.freq < 0 || data.freq > 1)) {
            return { valid: false, error: `Hand ${hand} has invalid frequency: ${data.freq}` };
        }
    }

    return { valid: true, error: null };
}

/**
 * Check if a chart name already exists
 * @param {string} chartName - Chart name to check
 * @param {string} excludeId - Optional ID to exclude from check (for updates)
 * @returns {Promise<boolean>}
 */
export async function chartNameExists(chartName, excludeId = null) {
    try {
        let query = supabase
            .from('memory_charts_gold')
            .select('id')
            .eq('chart_name', chartName);

        if (excludeId) {
            query = query.neq('id', excludeId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error checking chart name:', error);
            return false;
        }

        return data && data.length > 0;
    } catch (err) {
        console.error('Error checking chart name:', err);
        return false;
    }
}
