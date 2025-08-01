// At the top of the file, import the config
import { config } from './config.js';
import MapboxGLFilterPanel from './mapbox-gl-filter-panel.js';
import MapboxGLFeatureStateManager from './mapbox-gl-feature-state-manager.js';
import RulerControl from './mapbox-controls/ruler/src/index.js';


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

map.addControl(new RulerControl(), 'top-right');
map.on('ruler.on', () => console.log('Ruler activated'));
map.on('ruler.off', () => console.log('Ruler deactivated'));

const urlParams = new URLSearchParams(window.location.search);
const sheetId = urlParams.get('sheetId');
const dataFilter = urlParams.get('data_filter');
const showHeader = urlParams.get('show_header') !== 'false'; // Default to true if not specified
const displayFields = urlParams.get('display_fields')?.split(',').map(f => f.trim()) || null;
const boundaryDataUrl = urlParams.get('boundaryData');

// Hide input UI immediately if we have valid parameters
if (sheetId || boundaryDataUrl) {
    const sheetInput = document.getElementById('sheetInput');
    if (sheetInput) {
        sheetInput.style.display = 'none';
    }
    const sheetButtons = document.getElementById('sheetButtons');
    if (sheetButtons) {
        sheetButtons.style.display = 'flex';
    }
}

let stateManager = null; // Initialize stateManager at the top level

// Add this function near the top of the file
function setupDownloadButton(map) {
    const downloadGeoJSONButton = document.getElementById('downloadGeoJSON');
    if (downloadGeoJSONButton) {
        downloadGeoJSONButton.addEventListener('click', () => {
            const source = map.getSource('sheet-data');
            if (source) {
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

    // Update cluster toggle button
    const toggleClustersButton = document.createElement('button');
    toggleClustersButton.id = 'toggleClusters';
    toggleClustersButton.className = 'flex-1 px-4 py-2 bg-purple-500 text-white font-bold rounded hover:bg-purple-600 text-sm md:text-base md:flex-none';
    toggleClustersButton.textContent = 'Cluster Points';
    downloadGeoJSONButton.insertAdjacentElement('afterend', toggleClustersButton);

    let clustersVisible = false;
    toggleClustersButton.addEventListener('click', () => {
        clustersVisible = !clustersVisible;
        const visibility = clustersVisible ? 'visible' : 'none';
        
        // Toggle cluster point layers
        map.setLayoutProperty('clusters-fill', 'visibility', visibility);
        map.setLayoutProperty('clusters-stroke', 'visibility', visibility);
        
        // Toggle cluster hull layer
        if (map.getLayer('cluster-hulls')) {
            map.setLayoutProperty('cluster-hulls', 'visibility', visibility);
        }
    });
}

function generateBrightColor() {
    // Generate HSL color with:
    // - Random hue (0-360)
    // - High saturation (70-100%)
    // - High lightness (45-65%)
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 30) + 70; // 70-100
    const lightness = Math.floor(Math.random() * 20) + 45;  // 45-65
    
    // Convert HSL to hex
    const h = hue / 360;
    const s = saturation / 100;
    const l = lightness / 100;

    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);

    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

// Update convertToGeoJSON to fix color generation
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

        // Run DBSCAN clustering and add cluster info to properties
        const clustered = turf.clustersDbscan(geojson, 400, { 
            units: 'meters',
            minPoints: 10,
            mutate: true
        });

        // Generate random colors for each cluster
        const clusterColors = {};
        const clusterSizes = {};
        
        // First pass: count cluster sizes and generate colors
        clustered.features.forEach(feature => {
            const cluster = feature.properties.cluster;
            if (cluster !== undefined) {
                if (!clusterColors[cluster]) {
                    clusterColors[cluster] = generateBrightColor();
                }
                clusterSizes[cluster] = (clusterSizes[cluster] || 0) + 1;
            }
        });

        // Second pass: add cluster info to properties
        geojson.features = clustered.features.map(feature => {
            const cluster = feature.properties.cluster;
            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    cluster_id: cluster !== undefined ? cluster : 'noise',
                    cluster_size: cluster !== undefined ? clusterSizes[cluster] : 1,
                    cluster_color: cluster !== undefined ? clusterColors[cluster] : '#666666'
                }
            };
        });

        // After clustering is done, generate concave hulls for each cluster
        const clusterHulls = [];
        const clusterPoints = {};

        // Group points by cluster
        clustered.features.forEach(feature => {
            const cluster = feature.properties.cluster;
            if (cluster !== undefined && cluster !== 'noise') {
                if (!clusterPoints[cluster]) {
                    clusterPoints[cluster] = [];
                }
                clusterPoints[cluster].push(feature);
            }
        });

        // Generate concave hull for each cluster
        Object.entries(clusterPoints).forEach(([clusterId, points]) => {
            if (points.length >= 3) { // Need at least 3 points for a polygon
                const pointCollection = turf.featureCollection(points);
                const hull = turf.concave(pointCollection, {
                    maxEdge: 1, // 1 kilometer max edge length
                    units: 'kilometers'
                });
                
                if (hull) {
                    hull.properties = {
                        cluster_id: clusterId,
                        cluster_color: clusterColors[clusterId]
                    };
                    clusterHulls.push(hull);
                }
            }
        });

        // Add cluster hulls to the response
        geojson.properties = {
            clusterHulls: {
                type: 'FeatureCollection',
                features: clusterHulls
            }
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

// Update initializeMap function to handle existing sources
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

        // Initialize or update the source
        if (map.getSource('sheet-data')) {
            map.getSource('sheet-data').setData(geojson);
        } else {
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
                        10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 2],
                        16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 2]]
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
                    'circle-color': 'rgba(0, 0, 0, 0)',
                    'circle-emissive-strength': 1
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
                        10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 2],
                        16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 2]]
                    ],
                    'circle-color': [
                        'case',
                        ['has', 'circle-color'],
                        ['get', 'circle-color'],
                        'grey'
                    ],
                    'circle-opacity': 1,
                    'circle-emissive-strength': 1
                }
            });

            // Add transition for circle-stroke-width
            map.setPaintProperty('sheet-data', 'circle-stroke-width-transition', {
                duration: 1000,
            });

            // Initialize paint properties for the layer
            stateManager = new MapboxGLFeatureStateManager(map, 'sheet-data');
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

            // Update this section to respect URL hash
            const hasMapPosition = window.location.hash.length > 0;
            if (!hasMapPosition) {
                const bounds = new mapboxgl.LngLatBounds();
                geojson.features.forEach(feature => {
                    bounds.extend(feature.geometry.coordinates);
                });
                map.fitBounds(bounds, { padding: 50 });
            }

            // Add cluster layers using the same source but with cluster properties
            map.addLayer({
                id: 'clusters-stroke',
                type: 'circle',
                source: 'sheet-data', // Use the same source
                layout: {
                    'visibility': 'none'
                },
                paint: {
                    'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 6],
                        16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 6]]
                    ],
                    'circle-color': 'white',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': ['get', 'cluster_color']
                }
            });

            map.addLayer({
                id: 'clusters-fill',
                type: 'circle',
                source: 'sheet-data', // Use the same source
                layout: {
                    'visibility': 'none'
                },
                paint: {
                    'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 4],
                        16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 4]]
                    ],
                    'circle-color': ['get', 'cluster_color'],
                    'circle-opacity': 0.8,
                    'circle-emissive-strength': 1
                }
            });

            // After adding other layers, add the cluster hulls layer
            if (!map.getLayer('cluster-hulls')) {
                map.addSource('cluster-hulls', {
                    type: 'geojson',
                    data: geojson.properties.clusterHulls
                });

                map.addLayer({
                    id: 'cluster-hulls',
                    type: 'fill',
                    source: 'cluster-hulls',
                    layout: {
                        'visibility': 'none'
                    },
                    paint: {
                        'fill-color': ['get', 'cluster_color'],
                        'fill-opacity': 0.2,
                        'fill-outline-color': ['get', 'cluster_color'],
                        'fill-emissive-strength': 1
                    }
                });
            } else {
                map.getSource('cluster-hulls').setData(geojson.properties.clusterHulls);
            }
        }

        // Show the buttons
        const sheetButtons = document.getElementById('sheetButtons');
        if (sheetButtons) {
            sheetButtons.style.display = 'flex';
        }
        
        // Update view sheet data button
        const viewSheetDataButton = document.getElementById('viewSheetData');
        viewSheetDataButton.href = `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`;

        // Update sidebar
        updateSidebar(geojson.features);

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
                        'circle-color': 'rgba(0, 0, 0, 0)',
                        'circle-emissive-strength': 1
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
                            10, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 2],
                            16, ['*', 2, ['case', ['has', 'circle-radius'], ['to-number', ['get', 'circle-radius']], 2]]
                        ],
                        'circle-color': [
                            'case',
                            ['has', 'circle-color'],
                            ['get', 'circle-color'],
                            'grey'
                        ],
                        'circle-opacity': 1,
                        'circle-emissive-strength': 1
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
			.setMaxWidth("300px")
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
    
    // Load boundary data if URL parameter is present
    if (boundaryDataUrl) {
        loadBoundaryData(boundaryDataUrl);
    }

    // Existing sheetId handling
    if (sheetId) {
        console.log('Map loaded, initializing with sheetId:', sheetId);
        initializeMap(sheetId, 
            () => console.log('Sheet data loaded successfully'), 
            (error) => console.error('Error loading sheet data:', error)
        );
    }
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

// Add function to load boundary data
async function loadBoundaryData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Hide the sheet input UI immediately when boundary data loads successfully
        const sheetInput = document.getElementById('sheetInput');
        if (sheetInput) {
            sheetInput.style.display = 'none';
        }
        
        // Show the buttons
        const sheetButtons = document.getElementById('sheetButtons');
        if (sheetButtons) {
            sheetButtons.style.display = 'flex';
        }

        // Add source if it doesn't exist
        if (!map.getSource('boundary-data')) {
            map.addSource('boundary-data', {
                type: 'geojson',
                data: data
            });

            // Add fill layer
            map.addLayer({
                'id': 'boundary-fill',
                'type': 'fill',
                'source': 'boundary-data',
                'paint': {
                    'fill-color': '#088',
                    'fill-opacity': 0.2
                }
            });

            // Add line layer
            map.addLayer({
                'id': 'boundary-line',
                'type': 'line',
                'source': 'boundary-data',
                'paint': {
                    'line-color': '#088',
                    'line-width': 2
                }
            });
        } else {
            // Update existing source
            map.getSource('boundary-data').setData(data);
        }

        // Remove the bounds fitting code here since it's causing the auto-pan
        // The map position should be controlled by the URL hash
        const hasMapPosition = window.location.hash.length > 0;
        if (!hasMapPosition) {
            const bounds = new mapboxgl.LngLatBounds();
            if (data.type === 'FeatureCollection') {
                data.features.forEach(feature => {
                    if (feature.geometry) {
                        const coords = feature.geometry.type === 'Point' 
                            ? [feature.geometry.coordinates] 
                            : feature.geometry.coordinates.flat(2);
                        coords.forEach(coord => bounds.extend(coord));
                    }
                });
            }
            map.fitBounds(bounds, { padding: 50 });
        }

    } catch (error) {
        console.error('Error loading boundary data:', error);
    }
} 