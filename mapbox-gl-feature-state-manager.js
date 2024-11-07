/**
 * MapboxGLFeatureStateManager - A state management plugin for Mapbox GL JS
 * 
 * This class provides efficient management of feature states in Mapbox GL JS,
 * reducing redundant state updates and providing a cleaner API for state management.
 */
class MapboxGLFeatureStateManager {
    constructor(map, sourceId) {
        this.map = map;
        this.sourceId = sourceId;
        this.states = new Map(); // Track current states
        this.hoveredId = null;
        this.selectedId = null;
    }

    /**
     * Sets the hover state for a feature
     * @param {number|string|null} id - Feature ID to hover, or null to clear hover
     * @returns {boolean} - Whether the state was changed
     */
    setHovered(id) {
        if (this.hoveredId === id) return false;

        // Clear previous hover
        if (this.hoveredId !== null) {
            this.setFeatureState(this.hoveredId, { hover: false });
        }

        // Set new hover
        if (id !== null) {
            this.setFeatureState(id, { hover: true });
        }

        this.hoveredId = id;
        return true;
    }

    /**
     * Sets the selected state for a feature
     * @param {number|string|null} id - Feature ID to select, or null to clear selection
     * @returns {boolean} - Whether the state was changed
     */
    setSelected(id) {
        if (this.selectedId === id) return false;

        // Clear previous selection
        if (this.selectedId !== null) {
            this.setFeatureState(this.selectedId, { selected: false });
        }

        // Set new selection
        if (id !== null) {
            this.setFeatureState(id, { selected: true });
        }

        this.selectedId = id;
        return true;
    }

    /**
     * Get the current state of a feature
     * @param {number|string} id - Feature ID
     * @returns {Object} Current state object
     */
    getState(id) {
        return this.states.get(id) || {};
    }

    /**
     * Set multiple state properties at once
     * @param {number|string} id - Feature ID
     * @param {Object} stateObject - Object containing state properties to set
     */
    setFeatureState(id, stateObject) {
        const currentState = this.getState(id);
        const newState = { ...currentState, ...stateObject };
        
        // Only update if state has changed
        if (JSON.stringify(currentState) !== JSON.stringify(newState)) {
            this.states.set(id, newState);
            this.map.setFeatureState(
                { source: this.sourceId, id },
                newState
            );
        }
    }

    /**
     * Clear all states for a feature
     * @param {number|string} id - Feature ID
     */
    clearState(id) {
        if (this.states.has(id)) {
            this.states.delete(id);
            this.map.removeFeatureState(
                { source: this.sourceId, id }
            );
        }
    }

    /**
     * Clear all states for all features
     */
    clearAllStates() {
        this.states.clear();
        this.hoveredId = null;
        this.selectedId = null;
        this.map.removeFeatureState({ source: this.sourceId });
    }

    /**
     * Update paint properties for hover and selection states
     * @param {string} layerId - Layer ID to update
     * @param {Object} options - Paint property options
     */
    updatePaintProperties(layerId, options = {}) {
        const {
            hoverColor = 'yellow',
            selectedColor = 'blue',
            defaultColor = '#000000',
            hoverWidth = 10,
            selectedWidth = 12,
            defaultWidth = 1
        } = options;

        this.map.setPaintProperty(layerId, 'circle-stroke-width', [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            selectedWidth,
            ['boolean', ['feature-state', 'hover'], false],
            hoverWidth,
            defaultWidth
        ]);

        this.map.setPaintProperty(layerId, 'circle-stroke-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            selectedColor,
            ['boolean', ['feature-state', 'hover'], false],
            hoverColor,
            defaultColor
        ]);
    }
}

if (typeof window !== 'undefined') {
    window.MapboxGLFeatureStateManager = MapboxGLFeatureStateManager;
}

export default MapboxGLFeatureStateManager; 