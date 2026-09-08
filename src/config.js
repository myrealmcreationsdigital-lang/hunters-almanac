export const INITIAL_VIEW = { center: [-77.33, 42.27], zoom: 11.5, bearing: 0, pitch: 0 };

export const USGS_IMAGERY = {
  id: 'usgs-imagery',
  // Temporary NYS orthoimagery evaluation. Restore USGS with:
  // tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
  // maxzoom: 16,
  // attribution: 'Map services and data available from U.S. Geological Survey, National Geospatial Program. USDA, USGS The National Map: Orthoimagery.',
  tiles: ['https://orthos.its.ny.gov/arcgis/rest/services/wms/Latest/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png24&transparent=false&f=image'],
  tileSize: 256,
  minzoom: 0,
  maxzoom: 19,
  attribution: 'NYS ITS Geospatial Services',
};

export const NYS_PARCELS = {
  providerId: 'us-ny-nys-tax-parcels',
  serviceUrl: 'https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/ArcGIS/rest/services/NYS_Tax_Parcels_Public/FeatureServer/1',
  sourceUrl: 'https://gis.ny.gov/parcels',
  county: 'Steuben',
  minZoom: 13,
  pageSize: 1000,
  maxViewportFeatures: 3000,
  coverageBounds: [-77.77, 41.99, -76.94, 42.58],
};
