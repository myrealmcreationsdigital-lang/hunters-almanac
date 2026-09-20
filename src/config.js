export const INITIAL_VIEW = { center: [-77.33, 42.27], zoom: 11.5, bearing: 0, pitch: 0 };

export const USGS_IMAGERY = {
  id: 'usgs-imagery',
  tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  minzoom: 0,
  maxzoom: 16,
  attribution: 'Map services and data available from U.S. Geological Survey, National Geospatial Program. USDA, USGS The National Map: Orthoimagery.',
};

export const NYS_IMAGERY = {
  id: 'nys-imagery',
  tiles: ['https://orthos.its.ny.gov/arcgis/rest/services/wms/Latest/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png24&transparent=false&f=image'],
  tileSize: 256,
  minzoom: 0,
  maxzoom: 19,
  attribution: 'NYS ITS Geospatial Services',
};

export const NYS_LIDAR_RELIEF = {
  id: 'nys-lidar-relief',
  tiles: ['https://elevation.its.ny.gov/arcgis/rest/services/NYS_Statewide_Hillshade/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&format=jpg&transparent=false&layers=show%3A0&f=image'],
  tileSize: 512,
  minzoom: 9,
  maxzoom: 17,
  bounds: [-80.00563734663238, 40.40403892102133, -71.60554847558802, 45.04145913931448],
  attribution: 'NYS ITS Geospatial Services; elevation sources USGS/FEMA',
};

export const NYS_PARCELS = {
  providerId: 'us-ny-nys-tax-parcels',
  serviceUrl: 'https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/ArcGIS/rest/services/NYS_Tax_Parcels_Public/FeatureServer/1',
  publicCoverageUrl: 'https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/ArcGIS/rest/services/NYS_Tax_Parcels_Public/FeatureServer/0',
  sourceUrl: 'https://gis.ny.gov/parcels',
  minZoom: 13,
  pageSize: 1000,
  maxViewportFeatures: 3000,
  coverageBounds: [-79.763, 40.496, -71.856, 45.016],
};
