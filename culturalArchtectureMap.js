// Constants
const CONFIG = {
    GSI_TILE_URL: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    JP_SEARCH_API_URL: 'https://jpsearch.go.jp/api/item/search/jps-cross',
    API_PARAMS: {
        featureType: 'archtecture',
        featureCm: 'cultural',
    },
    MAP: {
        initialCenter: ol.proj.fromLonLat([139.74135, 35.6581]),
        initialZoom: 5,
        maxZoom: 18,
        extent: ol.proj.transformExtent([122.20, 154.46], 'EPSG:4326', 'EPSG:3857'),
    },
    MARKER: {
        radius: 10,
        defaultColor: { fill: 'rgb(0 0 255/ 0.2)', stroke: '#0000FF' },
        selectedColor: { fill: 'rgb(255 0 0/ 0.2)', stroke: '#FF0000' },
    },
    QUERY: {
        minSize: 20,
        maxSize: 500,
        earthRadius: 111,
    },
};

// State
let markerLayer, map;
let defaultStyle, selectedStyle;
let selectedMarker = null;

const init = () => {
    // Create styles
    defaultStyle = createMarkerStyle(CONFIG.MARKER.defaultColor);
    selectedStyle = createMarkerStyle(CONFIG.MARKER.selectedColor);

    // Initialize vector layer
    markerLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
    });

    // Initialize map
    map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.XYZ({
                    url: CONFIG.GSI_TILE_URL,
                }),
            }),
            markerLayer,
        ],
        view: new ol.View({
            center: CONFIG.MAP.initialCenter,
            extent: CONFIG.MAP.extent,
            zoom: CONFIG.MAP.initialZoom,
            maxZoom: CONFIG.MAP.maxZoom,
        }),
    });

    // Set up event listeners
    setupMapEvents();
};

const createMarkerStyle = (colors) => {
    return new ol.style.Style({
        image: new ol.style.Circle({
            radius: CONFIG.MARKER.radius,
            fill: new ol.style.Fill({ color: colors.fill }),
            stroke: new ol.style.Stroke({ color: colors.stroke, width: 4 }),
        }),
    });
};

const setupMapEvents = () => {
    map.on('click', (event) => {
        map.forEachFeatureAtPixel(event.pixel, (feature) => {
            const element = document.getElementById(feature.get('id'));
            if (element) element.open = true;
        });
    });

    map.on('pointermove', (event) => {
        const cursor = map.hasFeatureAtPixel(event.pixel) ? 'pointer' : 'default';
        map.getTargetElement().style.cursor = cursor;
    });
};

const query = async () => {
    const [clng, clat] = ol.proj.transform(
        map.getView().getCenter(),
        'EPSG:3857',
        'EPSG:4326'
    );
    const z = map.getView().getZoom();
    const r = CONFIG.QUERY.earthRadius * Math.cos(clat * Math.PI / 180) * 360 / 2 ** z;

    // Validate and clamp size
    let size = parseInt(document.getElementById('size').value, 10);
    size = Math.min(Math.max(size, CONFIG.QUERY.minSize), CONFIG.QUERY.maxSize);
    document.getElementById('size').value = size;

    // Build API URL
    const params = new URLSearchParams({
        'f-type': CONFIG.API_PARAMS.featureType,
        'f-cm': CONFIG.API_PARAMS.featureCm,
        size: size,
        'g-coordinates': clng,
    });

    try {
        const response = await fetch(`${CONFIG.JP_SEARCH_API_URL}?${params}`);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        renderResults(data.items);
    } catch (error) {
        console.error('Failed to fetch data:', error);
        document.getElementById('list').innerHTML = '<p>データの取得に失敗しました</p>';
    }
};

const renderResults = (items) => {
    const listElement = document.getElementById('list');
    listElement.innerHTML = '';
    markerLayer.getSource().clear();

    items.forEach((item, index) => {
        const details = createDetailsElement(item, index);
        listElement.appendChild(details);

        const marker = createMarker(item, index);
        markerLayer.getSource().addFeature(marker);
    });
};

const createDetailsElement = (item, index) => {
    const details = document.createElement('details');
    details.name = CONFIG.API_PARAMS.featureType;
    details.id = `a_${index}`;

    const summary = document.createElement('summary');
    summary.textContent = item.common.title;
    details.appendChild(summary);

    // Add image if available
    if (item.common.contentsUrl?.length > 0) {
        const img = document.createElement('img');
        img.src = item.common.contentsUrl[0];
        details.appendChild(img);
    }

    // Add description if available
    if (item.common.description) {
        const desc = document.createElement('div');
        desc.textContent = item.common.description;
        details.appendChild(desc);
    }

    return details;
};

const createMarker = (item, index) => {
    const coord = ol.proj.fromLonLat([
        item.common.coordinates.lon,
        item.common.coordinates.lat,
    ]);

    const feature = new ol.Feature({
        geometry: new ol.geom.Point(coord),
        id: `a_${index}`,
    });
    feature.setStyle(defaultStyle);

    // Add toggle event listener
    const details = document.getElementById(`a_${index}`);
    details.addEventListener('toggle', () => handleMarkerToggle(details, feature));

    return feature;
};

const handleMarkerToggle = (details, feature) => {
    if (details.open) {
        // Deselect previous marker
        if (selectedMarker) {
            selectedMarker.setStyle(defaultStyle);
        }
        // Select current marker
        feature.setStyle(selectedStyle);
        selectedMarker = feature;

        // Scroll to summary
        details.querySelector('summary').scrollIntoView({ behavior: 'smooth' });

        // Pan map if needed
        const coord = feature.getGeometry().getCoordinates();
        const extent = map.getView().calculateExtent(map.getSize());
        if (!ol.extent.containsCoordinate(extent, coord)) {
            map.getView().animate({ center: coord });
        }
    } else {
        feature.setStyle(defaultStyle);
        selectedMarker = null;
    }
};