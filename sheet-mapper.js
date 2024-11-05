mapboxgl.accessToken = 'pk.eyJ1IjoicGxhbmVtYWQiLCJhIjoiY2x2MzZwbGRyMGdheDJtbXVwdDA4aDNyaCJ9.nbvz6aNGQo68xa4NtWH26A';
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/planemad/clzsr0s3c00f701pihaefhc37',
    center: [73.8567, 18.5204],
    zoom: 5,
    hash: true
});

// Add geocoder control
const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl
});
map.addControl(geocoder);

// Add geolocate control
const geolocate = new mapboxgl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true
    },
    trackUserLocation: true
});
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

        try {
            const converter = new SheetToGeoJSON();
            const geojson = await converter.fromSheetId(sheetId);
            
            console.log("Converted GeoJSON:", geojson);
            console.log("Field types:", geojson.metadata.fieldTypes);
            console.log("Invalid rows:", geojson.metadata.invalidRows);

            // Add source and layers
            map.addSource('deals', {
                type: 'geojson',
                data: geojson,
                promoteId: 'row_number'
            });

            map.addLayer({
                id: 'deals',
                type: 'circle',
                source: 'deals',
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

            map.addLayer({
                id: 'deals-stroke',
                type: 'circle',
                source: 'deals',
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
                        2
                    ],
                    'circle-stroke-color': [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        '#000000',
                        '#ffffff'
                    ],
                    'circle-color': 'rgba(0, 0, 0, 0)'
                }
            });

            // Add transition for circle-stroke-width
            map.setPaintProperty('deals', 'circle-stroke-opacity-transition', {
                duration: 1000,
            });

            // Create filters dynamically using the first feature's properties
            if (geojson.features.length > 0) {
                const filterContainer = document.getElementById('filterContainer');
                const fields = Object.keys(geojson.features[0].properties).slice(0, 4);
                const filters = {};

                fields.forEach(field => {
                    const values = [...new Set(geojson.features.map(item => item.properties[field]))];
                    const select = document.createElement('select');
                    select.id = `${field}Filter`;
                    select.className = 'text-sm border rounded';
                    select.innerHTML = `<option value="">All ${field}</option>`;
                    values.forEach(value => {
                        const option = document.createElement('option');
                        option.value = value;
                        option.textContent = value;
                        select.appendChild(option);
                    });
                    filterContainer.appendChild(select);
                    filters[field] = select;

                    select.addEventListener('change', applyFilters);
                });

                function applyFilters() {
                    const filterConditions = Object.entries(filters).map(([field, select]) => {
                        const value = select.value;
                        return value ? ['==', ['get', field], value] : true;
                    });

                    map.setFilter('deals', ['all', ...filterConditions]);
                    updateSidebar();
                }
            }

            // Wait for both source and layer to be ready
            const checkSourceAndLayer = () => {
                if (map.getSource('deals') && 
                    map.getSource('deals').loaded() && 
                    map.getLayer('deals') && 
                    map.isStyleLoaded()) {
                    updateSidebar();
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
function updateSidebar() {
    // Add check to ensure the layer exists before querying
    if (!map.getLayer('deals')) {
        console.log('Deals layer not yet loaded');
        return;
    }

    const bounds = map.getBounds();
    let visibleFeatures;
    
    const mapCenter = map.getCenter();
    const origin = turf.point([mapCenter.lng, mapCenter.lat]);

    const source = map.getSource('deals');
    if (source && source.loaded()) {
        visibleFeatures = map.querySourceFeatures('deals', {
            filter: ['all',
                ['>=', ['get', 'Longitude'], bounds.getWest()],
                ['<=', ['get', 'Longitude'], bounds.getEast()],
                ['>=', ['get', 'Latitude'], bounds.getSouth()],
                ['<=', ['get', 'Latitude'], bounds.getNorth()]
            ]
        });
        visibleFeatures = [...new Map(visibleFeatures.map(feat => 
            [feat.properties.row_number, feat]
        )).values()];
    }

    if (visibleFeatures) {
        visibleFeatures.sort((a, b) => {
            const pointA = turf.point(a.geometry.coordinates);
            const pointB = turf.point(b.geometry.coordinates);
            const distanceA = turf.distance(origin, pointA);
            const distanceB = turf.distance(origin, pointB);
            return distanceA - distanceB;
        });

        const sidebar = document.getElementById('sidebar');
        sidebar.innerHTML = `<h2 class="text-lg font-bold mb-4">Visible Locations (${visibleFeatures.length})</h2>`;
        
        visibleFeatures.forEach(feature => {
            const props = feature.properties;
            const coords = feature.geometry.coordinates;
            
            const destination = turf.point(coords);
            const distance = turf.distance(origin, destination, {units: 'kilometers'});
            const formattedDistance = distance < 1 
                ? `${Math.round(distance * 1000)} m` 
                : `${Math.round(distance * 10) / 10} km`;

            const rotatedArrow = distance < 0.01 ? '•' : getDirectionalArrow(turf.bearing(origin, destination));

            const div = document.createElement('div');
            div.className = 'mb-4 p-2 bg-gray-100 rounded sidebar-item hover:bg-gray-200 transition-colors duration-150';
            div.setAttribute('data-lng', props.Longitude);
            div.setAttribute('data-lat', props.Latitude);
            div.setAttribute('data-row', props.row_number);
            
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <h4>${props['name'] || 'N/A'}</h4>
                    <span class="text-sm text-gray-600">
                        ${rotatedArrow} ${formattedDistance} away
                    </span>
                </div>
                <p>Address: ${props['Address'] || 'N/A'}</p>
                <p>Category: ${props['Project Category'] || 'N/A'}</p>
                <p>Amount: ${props['Total Amount'] || 'N/A'}</p>
            `;
            
            div.addEventListener('click', () => {
                const lng = parseFloat(div.getAttribute('data-lng'));
                const lat = parseFloat(div.getAttribute('data-lat'));
                const rowNumber = parseInt(div.getAttribute('data-row'));
                
                if (!isNaN(lng) && !isNaN(lat)) {
                    // Clear previous selection
                    if (selectedStateId !== null) {
                        map.setFeatureState(
                            { source: 'deals', id: selectedStateId },
                            { selected: false }
                        );
                        const prevSelected = document.querySelector('.sidebar-item.selected');
                        if (prevSelected) prevSelected.classList.remove('selected');
                    }
                    
                    // Set new selection
                    selectedStateId = rowNumber;
                    map.setFeatureState(
                        { source: 'deals', id: selectedStateId },
                        { selected: true }
                    );
                    div.classList.add('selected');
                    
                    map.flyTo({
                        center: [lng, lat],
                        zoom: 14
                    });
                }
            });

            div.addEventListener('mouseenter', () => {
                const rowNumber = parseInt(div.getAttribute('data-row'));
                if (!isNaN(rowNumber)) {
                    if (hoveredStateId !== null) {
                        map.setFeatureState(
                            { source: 'deals', id: hoveredStateId },
                            { hover: false }
                        );
                    }
                    hoveredStateId = rowNumber;
                    map.setFeatureState(
                        { source: 'deals', id: hoveredStateId },
                        { hover: true }
                    );
                }
            });

            div.addEventListener('mouseleave', () => {
                if (hoveredStateId !== null) {
                    map.setFeatureState(
                        { source: 'deals', id: hoveredStateId },
                        { hover: false }
                    );
                    hoveredStateId = null;
                }
            });

            sidebar.appendChild(div);
        });
    }
}

// Map event listeners
map.on('moveend', updateSidebar);

// Hover state handling
let hoveredStateId = null;
let selectedStateId = null;

map.on('mousemove', (e) => {
    const bbox = [
        [e.point.x - 100, e.point.y - 100],
        [e.point.x + 100, e.point.y + 100]
    ];
    const features = map.queryRenderedFeatures(bbox, { layers: ['deals'] });
    
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

        const newHoveredStateId = closestFeature.properties.row_number;
        
        if (hoveredStateId !== newHoveredStateId) {
            if (hoveredStateId !== null) {
                map.setFeatureState(
                    { source: 'deals', id: hoveredStateId },
                    { hover: false }
                );
            }
            hoveredStateId = newHoveredStateId;
            map.setFeatureState(
                { source: 'deals', id: hoveredStateId },
                { hover: true }
            );
        }
        
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
        
        const sidebarItem = document.querySelector(`[data-row="${hoveredStateId}"]`);
        if (sidebarItem) {
            sidebarItem.classList.add('bg-gray-200');
        }
    }
});

map.on('mouseleave', 'deals', () => {
    if (hoveredStateId !== null) {
        map.setFeatureState(
            { source: 'deals', id: hoveredStateId },
            { hover: false }
        );
        hoveredStateId = null;
    }
});

// Click handling for deals layer
map.on('click', 'deals', (e) => {
    const coordinates = e.features[0].geometry.coordinates.slice();
    const properties = e.features[0].properties;
    const rowNumber = properties.row_number;

    // Clear previous selection
    if (selectedStateId !== null) {
        map.setFeatureState(
            { source: 'deals', id: selectedStateId },
            { selected: false }
        );
        const prevSelected = document.querySelector('.sidebar-item.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
    }

    // Set new selection
    selectedStateId = rowNumber;
    map.setFeatureState(
        { source: 'deals', id: selectedStateId },
        { selected: true }
    );
    
    const sidebarItem = document.querySelector(`[data-row="${rowNumber}"]`);
    if (sidebarItem) {
        sidebarItem.classList.add('selected');
        sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Update the deals-stroke layer to show selected state
    map.setPaintProperty('deals-stroke', 'circle-stroke-width', [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        12,
        ['boolean', ['feature-state', 'hover'], false],
        10,
        2
    ]);

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
map.on('mouseenter', 'deals', () => {
    map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'deals', () => {
    map.getCanvas().style.cursor = '';
}); 