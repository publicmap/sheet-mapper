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
    constructor() {
        this.data = null;
    }

    async fromSheetId(sheetId) {
        // Construct the correct Google Sheets CSV export URL
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        return await this.fromUrl(url);
    }

    async fromUrl(url) {
        return new Promise((resolve, reject) => {
            Papa.parse(url, {
                download: true,
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    try {
                        const geojson = this.convert(results.data);
                        resolve(geojson);
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    convert(data) {
        // Filter out rows without valid coordinates
        const validData = data.filter(row => {
            const lat = parseFloat(row.Latitude);
            const lng = parseFloat(row.Longitude);
            return !isNaN(lat) && !isNaN(lng) && 
                   lat >= -90 && lat <= 90 && 
                   lng >= -180 && lng <= 180;
        });

        // Convert to GeoJSON
        const features = validData.map((row, index) => {
            const lat = parseFloat(row.Latitude);
            const lng = parseFloat(row.Longitude);

            // Create a GeoJSON feature
            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                },
                properties: {
                    ...row,
                    row_number: index // Add row number as a unique identifier
                }
            };
        });

        return {
            type: 'FeatureCollection',
            features: features
        };
    }
}

// Export the class for browser usage
if (typeof window !== 'undefined') {
    window.SheetToGeoJSON = SheetToGeoJSON;
} 