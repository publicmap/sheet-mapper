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

// Function to initialize map layers and events
async function initializeMap(sheetId) {
    try {
        const converter = new SheetToGeoJSON();
        const geojson = await converter.fromSheetId(sheetId);
        
        // Show the buttons
        document.getElementById('sheetButtons').style.display = 'flex';
        document.getElementById('sheetInput').style.display = 'none';
        
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

        // Add layers
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
        }, 'waterway-label');

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
        }, 'waterway-label');

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

        // Add download GeoJSON button functionality
        const downloadGeoJSONButton = document.getElementById('downloadGeoJSON');
        if (downloadGeoJSONButton) {
            downloadGeoJSONButton.addEventListener('click', () => {
                const source = map.getSource('sheet-data');
                if (source && source._data) {
                    const dataStr = JSON.stringify(source._data, null, 2);
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
            });
        }

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
    } catch (error) {
        console.error("Error loading sheet data:", error);
        alert("Error loading sheet data. Please check the Sheet ID and try again.");
    }
}

// Listen for the loadSheetData event
window.addEventListener('loadSheetData', (event) => {
    const { sheetId } = event.detail;
    initializeMap(sheetId);
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