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

if (!sheetId) {
    console.error('No sheet ID provided in URL parameters');
} else {
    const viewSheetDataButton = document.getElementById('viewSheetData');
    viewSheetDataButton.href = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pubhtml`;

    map.on('load', async () => {
        // Add the hover line source and layer
        map.addSource('hover-line', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

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

        // Initialize the state manager
        const stateManager = new MapboxGLFeatureStateManager(map, 'sheet-data');

        try {
            const converter = new SheetToGeoJSON();
            const geojson = await converter.fromSheetId(sheetId);
            
            console.log("Converted GeoJSON:", geojson);
            console.log("Field types:", geojson.metadata.fieldTypes);
            console.log("Invalid rows:", geojson.metadata.invalidRows);

            // Add source and layers
            map.addSource('sheet-data', {
                type: 'geojson',
                data: geojson,
                promoteId: 'row_number'
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

            // Make stateManager available to event handlers
            window.stateManager = stateManager;

            // Initialize filter panel
            window.filterPanel = new MapboxGLFilterPanel({
                geojson: geojson,
                containerId: 'filterContainer',
                sidebarId: 'sidebar',
                map: map,
                layerId: 'sheet-data',
                numFields: 4
            });

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
        }
    });
}

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
    console.log('Updating sidebar with features:', features?.length); // Debug log
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

// Hover state handling
let hoveredStateId = null;
let selectedStateId = null;
map.on('mousemove', (e) => {
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
    } else {
        stateManager.setHovered(null);
        map.getSource('hover-line').setData({
            type: 'FeatureCollection',
            features: []
        });
    }
});

map.on('mouseleave', 'sheet-data', () => {
    stateManager.setHovered(null);
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

    // Show popup
    let popupContent = '<div style="max-height: 300px; overflow-y: auto;"><table class="min-w-full divide-y divide-gray-200 text-xs">';
    
    if (properties.url || properties.URL || properties.Url) {
        const url = properties.url || properties.URL || properties.Url;
        popupContent += `<tr><td colspan="2" class="px-2 py-1 whitespace-nowrap text-center"><a href="${url}" target="_blank" class="text-blue-500 hover:text-blue-700">View Details</a></td></tr>`;
    }
    
    for (const [key, value] of Object.entries(properties)) {
        if (key.toLowerCase() !== 'url') {
            popupContent += `<tr><td class="px-2 py-1 whitespace-nowrap font-medium text-gray-900">${key}:</td><td class="px-2 py-1 whitespace-nowrap text-gray-500">${value}</td></tr>`;
        }
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