/**
 * SheetToGeoJSON converts Google Sheets data to GeoJSON format
 * @example
 * // Browser usage
 * const converter = new SheetToGeoJSON();
 * 
 * // From Google Sheet ID
 * const sheetId = '2PACX-1vSCTGg...'; // Your Google Sheet ID
 * const geojson = await converter.fromSheetId(sheetId);
 * 
 * // From direct CSV URL
 * const url = 'https://docs.google.com/spreadsheets/d/.../pub?output=csv';
 * const geojson = await converter.fromUrl(url);
 * 
 * @example
 * // Node.js usage
 * const SheetToGeoJSON = require('./sheet-to-geojson.js');
 * const converter = new SheetToGeoJSON({
 *   requiredFields: ['Latitude', 'Longitude'] // Optional: customize required fields
 * });
 * 
 * @note
 * Input spreadsheet must have 'Latitude' and 'Longitude' columns
 * Returns GeoJSON with:
 * - Automatic type detection (number, boolean, date, string)
 * - Row validation
 * - Metadata including invalid rows and field types
 * - Original row numbers from spreadsheet
 */

class SheetToGeoJSON {
    constructor(options = {}) {
        this.options = {
            requiredFields: ['Latitude', 'Longitude'],
            ...options
        };
    }

    async fromSheetId(sheetId) {
        if (!sheetId) {
            throw new Error('No sheet ID provided');
        }

        const sheetUrl = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?single=true&output=csv`;
        return await this.fromUrl(sheetUrl);
    }

    async fromUrl(url) {
        return new Promise((resolve, reject) => {
            Papa.parse(url, {
                download: true,
                header: true,
                complete: (results) => {
                    try {
                        const geojson = this.processData(results.data);
                        resolve(geojson);
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error) => reject(error)
            });
        });
    }

    processData(data) {
        const validRows = [];
        const invalidRows = [];
        const fieldTypes = this.detectFieldTypes(data);

        data.forEach((row, index) => {
            const lon = parseFloat(row.Longitude);
            const lat = parseFloat(row.Latitude);
            
            if (!isNaN(lon) && !isNaN(lat) && 
                lon >= -180 && lon <= 180 && 
                lat >= -90 && lat <= 90) {
                
                // Convert fields based on detected types
                Object.keys(row).forEach(key => {
                    row[key] = this.convertField(row[key], fieldTypes[key]);
                });
                
                // Add row_number field (matching Google Sheet row numbers)
                row.row_number = index + 2;
                validRows.push(row);
            } else {
                invalidRows.push(row);
            }
        });

        const geojson = {
            type: 'FeatureCollection',
            features: validRows.map(row => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(row.Longitude), parseFloat(row.Latitude)]
                },
                properties: row
            })),
            metadata: {
                fieldTypes,
                invalidRows,
                totalRows: data.length,
                validRows: validRows.length
            }
        };

        return geojson;
    }

    detectFieldTypes(data) {
        const fieldTypes = {};
        if (data.length > 0) {
            Object.keys(data[0]).forEach(key => {
                fieldTypes[key] = this.detectFieldType(data.map(row => row[key]));
            });
        }
        return fieldTypes;
    }

    detectFieldType(values) {
        const nonEmptyValues = values.filter(value => value !== null && value !== undefined && value !== '');
        if (nonEmptyValues.length === 0) return 'string';

        const allNumbers = nonEmptyValues.every(value => !isNaN(parseFloat(value)));
        if (allNumbers) return 'number';

        const allBooleans = nonEmptyValues.every(value => value.toLowerCase() === 'true' || value.toLowerCase() === 'false');
        if (allBooleans) return 'boolean';

        const allDates = nonEmptyValues.every(value => !isNaN(Date.parse(value)));
        if (allDates) {
            // Check if all values are actually dates and not just numbers
            const allAreDates = nonEmptyValues.every(value => {
                const date = new Date(value);
                return date instanceof Date && !isNaN(date) && date.toISOString() !== new Date(0).toISOString();
            });
            if (allAreDates) return 'date';
        }

        return 'string';
    }

    convertField(value, type) {
        switch (type) {
            case 'number':
                return parseFloat(value);
            case 'boolean':
                return value.toLowerCase() === 'true';
            case 'date':
                return new Date(value);
            default:
                return value;
        }
    }
}

// Export for both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SheetToGeoJSON;
} else {
    window.SheetToGeoJSON = SheetToGeoJSON;
} 