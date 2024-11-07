/**
 * MapboxGLFilterPanel - A customizable filter panel for Mapbox GL JS
 * 
 * This class creates an interactive filter interface for GeoJSON data displayed on a Mapbox map.
 * Features include:
 * - Dynamic filter creation based on GeoJSON properties
 * - Map bounds filtering
 * - Sidebar with sorted locations by distance from map center
 * - Interactive hover and selection states
 * - Directional indicators and distance calculations
 * - Custom event dispatching for filter changes
 * 
 * @requires turf.js for geospatial calculations
 */

class MapboxGLFilterPanel {
    constructor(options) {
        this.options = {
            geojson: null,
            containerId: null,
            sidebarId: null,
            map: null,
            layerId: null,
            numFields: 4,
            ...options
        };

        this.filters = {};
        this.useMapBounds = false;
        this.hoveredStateId = null;
        this.selectedStateId = null;
        this.init();
    }

    init() {
        // Get filter container
        this.filterContainer = document.getElementById(this.options.containerId);
        if (!this.filterContainer) {
            console.error('Filter container not found');
            return;
        }

        this.createFilters();
    }

    createFilters() {
        if (!this.options.geojson.features || !this.options.geojson.features.length) {
            console.error('No features found in GeoJSON');
            return;
        }

        // Clear existing filters
        this.filterContainer.innerHTML = '';

        // Add label and map bounds checkbox
        const labelContainer = document.createElement('div');
        labelContainer.className = 'inline-flex items-center m-1';
        
        const label = document.createElement('label');
        label.textContent = 'Data filter: ';
        label.className = 'text-sm mr-2';
        labelContainer.appendChild(label);

        const mapCheckboxLabel = document.createElement('label');
        mapCheckboxLabel.className = 'inline-flex items-center';
        
        const mapCheckbox = document.createElement('input');
        mapCheckbox.type = 'checkbox';
        mapCheckbox.className = 'form-checkbox h-4 w-4 mr-1';
        mapCheckbox.addEventListener('change', (e) => {
            this.useMapBounds = e.target.checked;
            this.applyFilters();
        });
        
        mapCheckboxLabel.appendChild(mapCheckbox);
        mapCheckboxLabel.appendChild(document.createTextNode(' Use Map'));
        labelContainer.appendChild(mapCheckboxLabel);
        
        this.filterContainer.appendChild(labelContainer);

        // Rest of the filter creation code...
        // Get first n fields from properties
        const properties = this.options.geojson.features[0].properties;
        const fields = Object.keys(properties).slice(0, this.options.numFields);

        // Create filter for each field
        fields.forEach(field => {
            // Get unique values for this field
            const values = [...new Set(
                this.options.geojson.features
                    .map(item => item.properties[field])
                    .filter(value => value !== null && value !== undefined)
            )];

            // Create select element
            const select = document.createElement('select');
            select.id = `${field}Filter`;
            select.className = 'text-sm border rounded p-2 m-1';
            select.innerHTML = `<option value="">All ${field}</option>`;

            // Add options
            values.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                select.appendChild(option);
            });

            // Add to container
            this.filterContainer.appendChild(select);
            this.filters[field] = select;

            // Add change listener
            select.addEventListener('change', () => this.applyFilters());
        });

        // Add clear filters button
        const clearButton = document.createElement('button');
        clearButton.className = 'px-3 py-2 bg-gray-200 hover:bg-gray-300 text-sm rounded m-1';
        clearButton.textContent = 'Clear Filters';
        clearButton.addEventListener('click', () => this.reset());
        this.filterContainer.appendChild(clearButton);
    }

    applyFilters() {
        let filteredFeatures = this.options.geojson.features.filter(feature => {
            return Object.entries(this.filters).every(([field, select]) => {
                const value = select.value;
                return !value || feature.properties[field] === value;
            });
        });

        // Apply map bounds filter if enabled
        if (this.useMapBounds && this.options.map) {
            const bounds = this.options.map.getBounds();
            const bboxPolygon = turf.bboxPolygon([
                bounds.getWest(),
                bounds.getSouth(),
                bounds.getEast(),
                bounds.getNorth()
            ]);

            filteredFeatures = filteredFeatures.filter(feature => 
                turf.booleanPointInPolygon(feature, bboxPolygon)
            );
        }

        const filteredGeojson = {
            type: 'FeatureCollection',
            features: filteredFeatures,
            metadata: this.options.geojson.metadata
        };

        // Apply filters to map layer
        const filterConditions = Object.entries(this.filters)
            .map(([field, select]) => {
                const value = select.value;
                return value ? ['==', ['get', field], value] : true;
            });

        this.options.map.setFilter(this.options.layerId, ['all', ...filterConditions]);

        // Update the map source
        this.options.map.getSource('sheet-data').setData(filteredGeojson);

        // Update the sidebar if sidebarId is provided
        if (this.options.sidebarId) {
            this.updateSidebar(filteredGeojson);
        }

        // Dispatch custom event with filtered data
        const event = new CustomEvent('filterchange', {
            detail: {
                filters: Object.fromEntries(
                    Object.entries(this.filters)
                        .map(([field, select]) => [field, select.value])
                ),
                filteredGeojson: filteredGeojson,
                useMapBounds: this.useMapBounds
            }
        });
        this.filterContainer.dispatchEvent(event);
    }

    updateSidebar(geojson) {
        const sidebar = document.getElementById(this.options.sidebarId);
        if (!sidebar) return;

        const mapCenter = this.options.map.getCenter();
        const origin = turf.point([mapCenter.lng, mapCenter.lat]);

        // Ensure we have an array of features
        const features = Array.isArray(geojson.features) ? geojson.features : [];

        // Sort features by distance from map center
        const sortedFeatures = [...features].sort((a, b) => {
            const pointA = turf.point(a.geometry.coordinates);
            const pointB = turf.point(b.geometry.coordinates);
            const distanceA = turf.distance(origin, pointA);
            const distanceB = turf.distance(origin, pointB);
            return distanceA - distanceB;
        });

        sidebar.innerHTML = `
            <div class="sticky top-0 bg-white p-4 border-b">
                <h2 class="text-lg font-bold">Nearest Locations (${sortedFeatures.length})</h2>
            </div>
            <div class="p-4">
        `;

        sortedFeatures.forEach(feature => {
            const props = feature.properties;
            const coords = feature.geometry.coordinates;
            
            const circleRadius = props['circle-radius'] || 3;
            const circleColor = props['circle-color'] || 'grey';
            
            const destination = turf.point(coords);
            const distance = turf.distance(origin, destination, {units: 'kilometers'});
            const formattedDistance = distance < 1 
                ? `${Math.round(distance * 1000)} m` 
                : `${Math.round(distance * 10) / 10} km`;

            const rotatedArrow = distance < 0.01 ? '•' : this.getDirectionalArrow(turf.bearing(origin, destination));

            const div = document.createElement('div');
            div.className = 'mb-4 p-2 bg-gray-100 rounded sidebar-item hover:bg-gray-200 transition-colors duration-150';
            div.setAttribute('data-lng', props.Longitude);
            div.setAttribute('data-lat', props.Latitude);
            div.setAttribute('data-row', props.row_number);

            // Get the first four fields dynamically
            const fields = Object.keys(props).slice(0, 4);

            div.innerHTML = this.createSidebarItemHTML(props, fields, circleRadius, circleColor, rotatedArrow, formattedDistance);
            
            this.addSidebarItemListeners(div);
            sidebar.appendChild(div);
        });
    }

    createSidebarItemHTML(props, fields, circleRadius, circleColor, rotatedArrow, formattedDistance) {
        let html = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <svg width="${circleRadius * 4 + 8}" height="${circleRadius * 4 + 8}" class="flex-shrink-0">
                        <circle 
                            cx="${circleRadius * 2 + 4}" 
                            cy="${circleRadius * 2 + 4}" 
                            r="${circleRadius * 2}"
                            fill="${circleColor}"
                            stroke="white"
                            stroke-width="2"
                        />
                    </svg>
                    <h4 class="text-lg">${props[fields[0]] || 'N/A'}</h4>
                </div>
                <span class="text-sm text-gray-600">
                    ${rotatedArrow} ${formattedDistance} away
                </span>
            </div>
        `;

        // Add the next three fields dynamically
        for (let i = 1; i < 4 && i < fields.length; i++) {
            html += `<p>${fields[i]}: ${props[fields[i]] || 'N/A'}</p>`;
        }

        html += `
            <div class="mt-2 flex gap-2 text-sm">
                ${props.url ? `
                    <a href="${props.url}" target="_blank" class="text-blue-600 hover:text-blue-800">
                        Open
                    </a>
                ` : ''}
                <a href="https://www.google.com/maps/search/?api=1&query=${props.Latitude},${props.Longitude}" 
                   target="_blank" 
                   class="text-blue-600 hover:text-blue-800">
                    View in Google Maps
                </a>
            </div>
        `;

        return html;
    }

    addSidebarItemListeners(div) {
        div.addEventListener('click', () => {
            const lng = parseFloat(div.getAttribute('data-lng'));
            const lat = parseFloat(div.getAttribute('data-lat'));
            const rowNumber = parseInt(div.getAttribute('data-row'));
            
            if (!isNaN(lng) && !isNaN(lat)) {
                // Clear previous selection
                if (this.selectedStateId !== null) {
                    this.options.map.setFeatureState(
                        { source: 'sheet-data', id: this.selectedStateId },
                        { selected: false }
                    );
                    const prevSelected = document.querySelector('.sidebar-item.selected');
                    if (prevSelected) prevSelected.classList.remove('selected');
                }
                
                // Set new selection
                this.selectedStateId = rowNumber;
                this.options.map.setFeatureState(
                    { source: 'sheet-data', id: this.selectedStateId },
                    { selected: true }
                );
                div.classList.add('selected');
                
                this.options.map.flyTo({
                    center: [lng, lat],
                    zoom: 14
                });
            }
        });

        // Add hover effects
        div.addEventListener('mouseenter', () => {
            const rowNumber = parseInt(div.getAttribute('data-row'));
            if (!isNaN(rowNumber)) {
                if (this.hoveredStateId !== null) {
                    this.options.map.setFeatureState(
                        { source: 'sheet-data', id: this.hoveredStateId },
                        { hover: false }
                    );
                }
                this.hoveredStateId = rowNumber;
                this.options.map.setFeatureState(
                    { source: 'sheet-data', id: this.hoveredStateId },
                    { hover: true }
                );
            }
        });

        div.addEventListener('mouseleave', () => {
            if (this.hoveredStateId !== null) {
                this.options.map.setFeatureState(
                    { source: 'sheet-data', id: this.hoveredStateId },
                    { hover: false }
                );
                this.hoveredStateId = null;
            }
        });
    }

    getDirectionalArrow(bearing) {
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

    reset() {
        Object.values(this.filters).forEach(select => {
            select.value = '';
        });
        this.useMapBounds = false;
        const mapCheckbox = this.filterContainer.querySelector('input[type="checkbox"]');
        if (mapCheckbox) {
            mapCheckbox.checked = false;
        }
        this.applyFilters();
    }

    updateData(newGeojson) {
        this.options.geojson = newGeojson;
        this.createFilters();
    }

    // Get current filtered GeoJSON
    getFilteredGeojson() {
        const filteredFeatures = this.options.geojson.features.filter(feature => {
            return Object.entries(this.filters).every(([field, select]) => {
                const value = select.value;
                return !value || feature.properties[field] === value;
            });
        });

        return {
            type: 'FeatureCollection',
            features: filteredFeatures,
            metadata: this.options.geojson.metadata
        };
    }
}

if (typeof window !== 'undefined') {
    window.MapboxGLFilterPanel = MapboxGLFilterPanel;
}

export default MapboxGLFilterPanel; 