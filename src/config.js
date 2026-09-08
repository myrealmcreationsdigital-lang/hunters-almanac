export const INITIAL_VIEW = { center: [-77.33, 42.27], zoom: 11.5, bearing: 0, pitch: 0 };

export const USGS_IMAGERY = {
  id: 'usgs-imagery',
  tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  minzoom: 0,
  maxzoom: 16,
  attribution: 'Map services and data available from U.S. Geological Survey, National Geospatial Program. USDA, USGS The National Map: Orthoimagery.',
};

export const NYS_PARCELS = {
  providerId: 'us-ny-nys-tax-parcels',
  serviceUrl: 'https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/ArcGIS/rest/services/NYS_Tax_Parcels_Public/FeatureServer/1',
  sourceUrl: 'https://gis.ny.gov/parcels',
  county: 'Steuben',
  minZoom: 14,
  pageSize: 1000,
  maxViewportFeatures: 3000,
  coverageBounds: [-77.77, 41.99, -76.94, 42.58],
};
