class MapboxGLFilterPanel {
    constructor(options) {
        this.options = {
            geojson: null,
            containerId: null,
            map: null,
            layerId: null,
            numFields: 4,
            ...options
        };

        this.filters = {};
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

        // Get first n fields from properties
        const properties = this.options.geojson.features[0].properties;
        const fields = Object.keys(properties).slice(0, this.options.numFields);

        // Clear existing filters
        this.filterContainer.innerHTML = '';
        this.filters = {};

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
        const filterConditions = Object.entries(this.filters)
            .map(([field, select]) => {
                const value = select.value;
                return value ? ['==', ['get', field], value] : true;
            });

        // Apply filters to map layer
        this.options.map.setFilter(this.options.layerId, ['all', ...filterConditions]);

        // Get filtered GeoJSON
        const filteredFeatures = this.options.geojson.features.filter(feature => {
            return Object.entries(this.filters).every(([field, select]) => {
                const value = select.value;
                return !value || feature.properties[field] === value;
            });
        });

        const filteredGeojson = {
            type: 'FeatureCollection',
            features: filteredFeatures,
            metadata: this.options.geojson.metadata
        };

        // Dispatch custom event with filtered data
        const event = new CustomEvent('filterchange', {
            detail: {
                filters: Object.fromEntries(
                    Object.entries(this.filters)
                        .map(([field, select]) => [field, select.value])
                ),
                filteredGeojson: filteredGeojson
            }
        });
        this.filterContainer.dispatchEvent(event);
    }

    reset() {
        Object.values(this.filters).forEach(select => {
            select.value = '';
        });
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