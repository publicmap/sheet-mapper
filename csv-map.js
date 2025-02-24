// At the top of the file, import the config
import { config } from './config.js';
import MapboxGLFilterPanel from './mapbox-gl-filter-panel.js';
import MapboxGLFeatureStateManager from './mapbox-gl-feature-state-manager.js';

mapboxgl.accessToken = config.mapboxgl.accessToken;
// Replace the map initialization with the config object
const map = new mapboxgl.Map(config.mapboxgl.map);

// Add geocoder control
const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl
});
map.addControl(geocoder);

// Add geolocate control
const geolocate = new mapboxgl.GeolocateControl(config.mapboxgl.geolocate);
map.addControl(geolocate, 'top-right');

const urlParams = new URLSearchParams(window.location.search);
const sheetId = urlParams.get('sheetId');
const dataFilter = urlParams.get('data_filter');
const showHeader = urlParams.get('show_header') !== 'false'; // Default to true if not specified
const displayFields = urlParams.get('display_fields')?.split(',').map(f => f.trim()) || null;

let stateManager = null; // Initialize stateManager at the top level

// Add this function near the top of the file
function setupDownloadButton(map) {
    const downloadGeoJSONButton = document.getElementById('downloadGeoJSON');
    if (downloadGeoJSONButton) {
        downloadGeoJSONButton.addEventListener('click', () => {
            const source = map.getSource('sheet-data');
            if (source) {
                // Get the current data from the source
                const currentData = source._data;
                if (currentData) {
                    const dataStr = JSON.stringify(currentData, null, 2);
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'map-data.geojson';
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }
            }
        });
    }
}

// Update convertToGeoJSON to use Papa Parse
async function convertToGeoJSON(data) {
    return new Promise((resolve, reject) => {
        // Add debug logging
        console.log('Total rows in data:', data.length);
        console.log('Raw data first row:', data[0]);
        
        // Define possible coordinate field names
        const latitudeFields = ['latitude', 'lat', 'y'];
        const longitudeFields = ['longitude', 'lon', 'lng', 'x'];
        
        // Find matching field names (case-insensitive)
        const latField = Object.keys(data[0]).find(key => 
            latitudeFields.includes(key.toLowerCase())
        );
        const lngField = Object.keys(data[0]).find(key => 
            longitudeFields.includes(key.toLowerCase())
        );
        
        if (!latField || !lngField) {
            reject(new Error(`Required coordinate fields not found. Looking for one of [${latitudeFields.join(', ')}] and one of [${longitudeFields.join(', ')}]. Found fields: ${Object.keys(data[0]).join(', ')}`));
            return;
        }

        console.log(`Using fields: ${latField} and ${lngField}`);

        // Convert to GeoJSON
        const features = data
            .filter(row => {
                const lat = parseFloat(row[latField]);
                const lng = parseFloat(row[lngField]);
                return !isNaN(lat) && !isNaN(lng) && 
                       lat >= -90 && lat <= 90 && 
                       lng >= -180 && lng <= 180;
            })
            .map((row, index) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [
                        parseFloat(row[lngField]),
                        parseFloat(row[latField])
                    ]
                },
                properties: {
                    ...row,
                    row_number: index
                }
            }));

        if (features.length === 0) {
            reject(new Error('No valid coordinates found in the data'));
            return;
        }

        const geojson = {
            type: 'FeatureCollection',
            features: features
        };

        resolve(geojson);
    });
}

// Add this near the top of the file, after the URL params section
if (sheetId) {
    // Wait for map to load before initializing with sheet data
    map.on('load', () => {
        console.log('Map loaded, initializing with sheetId:', sheetId);
        initializeMap(sheetId, 
            () => console.log('Sheet data loaded successfully'), 
            (error) => console.error('Error loading sheet data:', error)
        );
    });
}

// Update initializeMap function to handle the UI state
async function initializeMap(sheetId, onSuccess, onError) {
    try {
        // Hide the sheet input UI immediately
        const sheetInput = document.getElementById('sheetInput');
        if (sheetInput) {
            sheetInput.style.display = 'none';
        }
        
        console.log('Initializing map with sheetId:', sheetId);
        
        // Fetch CSV data from Google Sheets
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        
        // Parse CSV to array of objects using global Papa object
        const parsedData = window.Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true
        }).data;

        // Convert to GeoJSON
        const geojson = await convertToGeoJSON(parsedData);

        // Update URL with sheetId parameter
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.set('sheetId', sheetId);
        window.history.replaceState({}, '', currentUrl);

        // Show the buttons
        const sheetButtons = document.getElementById('sheetButtons');
        if (sheetButtons) {
            sheetButtons.style.display = 'flex';
        }
        
        // Update view sheet data button
        const viewSheetDataButton = document.getElementById('viewSheetData');
        viewSheetDataButton.href = `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`;

        // Initialize the state manager
        stateManager = new MapboxGLFeatureStateManager(map, 'sheet-data');

        // Add source and layers
        map.addSource('sheet-data', {
            type: 'geojson',
            data: geojson,
            promoteId: 'row_number'
        });

        // Add hover line source
        map.addSource('hover-line', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Add layers without depending on 'waterway-label'
        map.addLayer({
            id: 'hover-line',
            type: 'line',
            source: 'hover-line',
            paint: {
                'line-color': '#000',
                'line-width': 1,
                'line-dasharray': [2, 2]
            }
        });

        map.addLayer({
            id: 'sheet-data-stroke',
            type: 'circle',
            source: 'sheet-data',
            paint: {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 3],
                    16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 3]]
                ],
                'circle-stroke-width': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    10,
                    1
                ],
                'circle-stroke-color': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    'yellow',
                    '#000000'
                ],
                'circle-color': 'rgba(0, 0, 0, 0)'
            }
        });

        map.addLayer({
            id: 'sheet-data',
            type: 'circle',
            source: 'sheet-data',
            paint: {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 3],
                    16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 3]]
                ],
                'circle-color': [
                    'case',
                    ['has', 'circle-color'],
                    ['get', 'circle-color'],
                    'grey'
                ],
                'circle-opacity': 1
            }
        });

        // Add transition for circle-stroke-width
        map.setPaintProperty('sheet-data', 'circle-stroke-width-transition', {
            duration: 1000,
        });

        // Initialize paint properties for the layer
        stateManager.updatePaintProperties('sheet-data-stroke', {
            hoverColor: 'yellow',
            selectedColor: 'blue',
            defaultColor: '#000000',
            hoverWidth: 10,
            selectedWidth: 12,
            defaultWidth: 1
        });

        // Initialize filter panel
        window.filterPanel = new MapboxGLFilterPanel({
            geojson: geojson,
            containerId: 'filterContainer',
            sidebarId: 'sidebar',
            map: map,
            layerId: 'sheet-data',
            numFields: 4,
            visible: true,
            displayFields: null
        });

        setupDownloadButton(map);  // Call the new function here

        // Initial sidebar update
        updateSidebar(geojson.features);

        // Listen for filter changes
        document.getElementById('filterContainer').addEventListener('filterchange', (event) => {
            const filteredGeojson = event.detail.filteredGeojson;
            const hasActiveFilters = Object.values(event.detail.filters).some(value => value !== '');
            
            if (!hasActiveFilters && !event.detail.useMapBounds) {
                // If no filters are active, use the original source data
                map.getSource('sheet-data').setData(geojson);
            } else {
                // Update the source data with filtered GeoJSON
                map.getSource('sheet-data').setData(filteredGeojson);
            }
            
            // Update sidebar with filtered data
            updateSidebar(filteredGeojson.features);
        });

        // Update the checkSourceAndLayer function
        const checkSourceAndLayer = () => {
            if (map.getSource('sheet-data') && 
                map.getSource('sheet-data').loaded() && 
                map.getLayer('sheet-data') && 
                map.isStyleLoaded()) {
                // Initial sidebar update with all features
                updateSidebar(geojson.features);
            } else {
                setTimeout(checkSourceAndLayer, 100);
            }
        };
        
        checkSourceAndLayer();

        // Check if URL has a hash (indicating map position)
        const hasMapPosition = window.location.hash.length > 0;

        // Only fit bounds if there's no hash in the URL
        if (!hasMapPosition) {
            const bounds = new mapboxgl.LngLatBounds();
            geojson.features.forEach(feature => {
                bounds.extend(feature.geometry.coordinates);
            });
            map.fitBounds(bounds, { padding: 50 });
        }

        // Call success callback
        if (onSuccess) onSuccess();
    } catch (error) {
        // Show the sheet input UI again on error
        const sheetInput = document.getElementById('sheetInput');
        if (sheetInput) {
            sheetInput.style.display = 'block';
        }
        
        console.error("Error loading sheet data:", error);
        if (onError) onError(error);
    }
}

// Update the loadSheetData event listener
window.addEventListener('loadSheetData', (event) => {
    const { sheetId, onSuccess, onError } = event.detail;
    console.log('Received loadSheetData event with sheetId:', sheetId);
    initializeMap(sheetId, onSuccess, onError);
});

// Update the loadCSVData event listener
window.addEventListener('loadCSVData', (event) => {
    const { data, onSuccess, onError } = event.detail;
    console.log('Received loadCSVData event with rows:', data.length);
    
    // Convert the CSV data directly to GeoJSON
    convertToGeoJSON(data)
        .then(geojson => {
            // Add source and layers
            if (map.getSource('sheet-data')) {
                map.getSource('sheet-data').setData(geojson);
            } else {
                // Add source
                map.addSource('sheet-data', {
                    type: 'geojson',
                    data: geojson,
                    promoteId: 'row_number'
                });

                // Initialize the state manager
                stateManager = new MapboxGLFeatureStateManager(map, 'sheet-data');

                // Add hover line source if it doesn't exist
                if (!map.getSource('hover-line')) {
                    map.addSource('hover-line', {
                        type: 'geojson',
                        data: {
                            type: 'FeatureCollection',
                            features: []
                        }
                    });

                    // Add hover line layer
                    map.addLayer({
                        id: 'hover-line',
                        type: 'line',
                        source: 'hover-line',
                        paint: {
                            'line-color': '#000',
                            'line-width': 1,
                            'line-dasharray': [2, 2]
                        }
                    });
                }

                // Add the circle stroke layer
                map.addLayer({
                    id: 'sheet-data-stroke',
                    type: 'circle',
                    source: 'sheet-data',
                    paint: {
                        'circle-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 3],
                            16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 3]]
                        ],
                        'circle-stroke-width': [
                            'case',
                            ['boolean', ['feature-state', 'hover'], false],
                            10,
                            1
                        ],
                        'circle-stroke-color': [
                            'case',
                            ['boolean', ['feature-state', 'hover'], false],
                            'yellow',
                            '#000000'
                        ],
                        'circle-color': 'rgba(0, 0, 0, 0)'
                    }
                });

                // Add the main circle layer
                map.addLayer({
                    id: 'sheet-data',
                    type: 'circle',
                    source: 'sheet-data',
                    paint: {
                        'circle-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 3],
                            16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 3]]
                        ],
                        'circle-color': [
                            'case',
                            ['has', 'circle-color'],
                            ['get', 'circle-color'],
                            'grey'
                        ],
                        'circle-opacity': 1
                    }
                });

                // Set up paint properties for the state manager
                stateManager.updatePaintProperties('sheet-data-stroke', {
                    hoverColor: 'yellow',
                    selectedColor: 'blue',
                    defaultColor: '#000000',
                    hoverWidth: 10,
                    selectedWidth: 12,
                    defaultWidth: 1
                });

                setupDownloadButton(map);  // Add this line here

                // Set up event listeners if they haven't been set up yet
                setupEventListeners();
            }

            // Show the buttons
            const sheetButtons = document.getElementById('sheetButtons');
            if (sheetButtons) {
                sheetButtons.style.display = 'flex';
            }

            // Update the "Open Sheet" button to "Edit GeoJSON"
            const viewSheetData = document.getElementById('viewSheetData');
            viewSheetData.textContent = 'Edit GeoJSON';
            viewSheetData.innerHTML = 'Edit GeoJSON <svg class="inline-block w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>';
            
            // Create geojson.io URL with data parameter
            const geojsonString = JSON.stringify(geojson);
            const encodedGeojson = encodeURIComponent(geojsonString);
            viewSheetData.href = `https://geojson.io/#data=data:application/json,${encodedGeojson}`;

            // Initialize or update filter panel
            if (!window.filterPanel) {
                window.filterPanel = new MapboxGLFilterPanel({
                    geojson: geojson,
                    containerId: 'filterContainer',
                    sidebarId: 'sidebar',
                    map: map,
                    layerId: 'sheet-data',
                    numFields: 4,
                    visible: true,
                    displayFields: null
                });
            } else {
                window.filterPanel.updateData(geojson);
            }

            // Update sidebar
            updateSidebar(geojson.features);

            // Fit the map to the data bounds
            const bounds = new mapboxgl.LngLatBounds();
            geojson.features.forEach(feature => {
                bounds.extend(feature.geometry.coordinates);
            });
            map.fitBounds(bounds, { padding: 50 });

            if (onSuccess) onSuccess();
        })
        .catch(error => {
            console.error("Error processing CSV data:", error);
            if (onError) onError(error);
        });
});

// Move event listeners inside a function that's called after layers are added
function setupEventListeners() {
    // Hover state handling
    map.on('mousemove', 'sheet-data', (e) => {
        if (!stateManager) return; // Guard clause

        const bbox = [
            [e.point.x - 100, e.point.y - 100],
            [e.point.x + 100, e.point.y + 100]
        ];
        const features = map.queryRenderedFeatures(bbox, { layers: ['sheet-data'] });
        
        if (features.length > 0) {
            const mousePoint = turf.point([e.lngLat.lng, e.lngLat.lat]);
            let closestFeature = features[0];
            let minDistance = Infinity;

            features.forEach(feature => {
                const featurePoint = turf.point(feature.geometry.coordinates);
                const distance = turf.distance(mousePoint, featurePoint);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestFeature = feature;
                }
            });

            stateManager.setHovered(closestFeature.properties.row_number);
            
            // Update hover line
            const mouseCoords = [e.lngLat.lng, e.lngLat.lat];
            const closestPoint = closestFeature.geometry.coordinates;
            
            map.getSource('hover-line').setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [mouseCoords, closestPoint]
                    }
                }]
            });
        }
    });

    // Click handling for sheet-data layer
    map.on('click', 'sheet-data', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const properties = e.features[0].properties;
        const rowNumber = properties.row_number;

        stateManager.setSelected(rowNumber);
        
        const prevSelected = document.querySelector('.sidebar-item.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        
        const sidebarItem = document.querySelector(`[data-row="${rowNumber}"]`);
        if (sidebarItem) {
            sidebarItem.classList.add('selected');
            sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Show popup with filtered properties
        let popupContent = '<div style="max-height: 300px; overflow-y: auto;"><table class="min-w-full divide-y divide-gray-200 text-xs">';
        
        // Filter and display properties
        const propertiesToShow = displayFields 
            ? Object.entries(properties).filter(([key]) => displayFields.includes(key))
            : Object.entries(properties).filter(([key]) => key.toLowerCase() !== 'url');

        for (const [key, value] of propertiesToShow) {
            popupContent += `<tr><td class="px-2 py-1 whitespace-nowrap font-medium text-gray-900">${key}:</td><td class="px-2 py-1 whitespace-nowrap text-gray-500">${value}</td></tr>`;
        }
        popupContent += '</table></div>';

        new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map);
    });

    // Cursor styling
    map.on('mouseenter', 'sheet-data', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'sheet-data', () => {
        map.getCanvas().style.cursor = '';
    });
}

// Call setupEventListeners after map loads
map.on('load', () => {
    setupEventListeners();
});

// Helper function to get directional arrow
function getDirectionalArrow(bearing) {
    bearing = ((bearing + 360) % 360);
    if (bearing >= 337.5 || bearing < 22.5) return '↑';
    if (bearing >= 22.5 && bearing < 67.5) return '↗';
    if (bearing >= 67.5 && bearing < 112.5) return '→';
    if (bearing >= 112.5 && bearing < 157.5) return '↘';
    if (bearing >= 157.5 && bearing < 202.5) return '↓';
    if (bearing >= 202.5 && bearing < 247.5) return '↙';
    if (bearing >= 247.5 && bearing < 292.5) return '←';
    return '↖';
}

// Update sidebar function
function updateSidebar(features) {
    if (window.filterPanel) {
        const geojson = {
            type: 'FeatureCollection',
            features: features || []
        };
        window.filterPanel.updateSidebar(geojson);
    } else {
        console.error('Filter panel not initialized'); // Debug log
    }
}

// Map event listeners
map.on('moveend', () => {
    const source = map.getSource('sheet-data');
    if (source && source._data) {
        console.log('Map moved, updating sidebar with features:', source._data.features.length); // Debug log
        updateSidebar(source._data.features);
    } else {
        console.log('Map moved, no features to update'); // Debug log
        updateSidebar([]);
    }
});

map.on('mouseleave', 'sheet-data', () => {
    stateManager.setHovered(null);
}); 