const NYS_SOURCE = Object.freeze({
  providerId: 'us-ny-nys-tax-parcels',
  name: 'NYS ITS Geospatial Services',
  url: 'https://gis.ny.gov/parcels',
  attribution: 'Contributing counties, NYS Office of Information Technology Services Geospatial Services and NYS Department of Taxation and Finance Office of Real Property Tax Services (ORPTS).',
  disclaimer: 'Property lines are for planning and general use only and are not a substitute for a legal parcel survey.',
});

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned.length ? cleaned : null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== '') ?? null;
}

export function normalizeNysParcel(rawFeature, retrievedAt = new Date().toISOString()) {
  const properties = rawFeature?.properties ?? {};
  const assessedAcres = finiteNumber(properties.ACRES);
  const calculatedAcres = finiteNumber(properties.CALC_ACRES);
  const parcelId = cleanString(firstValue(
    properties.MUNI_PARCEL_ID,
    properties.SWIS_SBL_ID,
    properties.SWIS_PRINT_KEY_ID,
    properties.PRINT_KEY,
    properties.SBL,
  ));
  const displayId = cleanString(firstValue(properties.PRINT_KEY, properties.SBL, parcelId));
  const owner = cleanString(properties.PRIMARY_OWNER);

  return {
    type: 'Feature',
    id: cleanString(properties.OBJECTID),
    geometry: rawFeature?.geometry ?? null,
    properties: {
      parcelId,
      displayId,
      providerFeatureId: cleanString(properties.OBJECTID),
      owner,
      ownerAvailability: owner ? 'available' : 'unavailable',
      acreage: assessedAcres ?? calculatedAcres,
      acreageBasis: assessedAcres !== null ? 'assessed' : calculatedAcres !== null ? 'calculated' : 'unknown',
      jurisdiction: {
        country: 'US',
        subdivision: 'NY',
        county: cleanString(properties.COUNTY_NAME),
        municipality: cleanString(properties.MUNI_NAME),
      },
      source: {
        ...NYS_SOURCE,
        rollYear: finiteNumber(properties.ROLL_YR),
        spatialYear: finiteNumber(properties.SPATIAL_YR),
        retrievedAt,
      },
      duplicateGeometry: cleanString(properties.DUP_GEO)?.toUpperCase() === 'Y',
    },
  };
}

export function toMapFeatureCollection(parcels) {
  return {
    type: 'FeatureCollection',
    features: parcels.filter((parcel) => parcel.geometry).map((parcel) => ({
      type: 'Feature',
      id: parcel.id,
      geometry: parcel.geometry,
      properties: {
        parcelId: parcel.properties.parcelId,
        displayId: parcel.properties.displayId,
        providerFeatureId: parcel.properties.providerFeatureId,
        owner: parcel.properties.owner,
        ownerAvailability: parcel.properties.ownerAvailability,
        acreage: parcel.properties.acreage,
        acreageBasis: parcel.properties.acreageBasis,
        country: parcel.properties.jurisdiction.country,
        subdivision: parcel.properties.jurisdiction.subdivision,
        county: parcel.properties.jurisdiction.county,
        municipality: parcel.properties.jurisdiction.municipality,
        sourceName: parcel.properties.source.name,
        sourceUrl: parcel.properties.source.url,
        rollYear: parcel.properties.source.rollYear,
        spatialYear: parcel.properties.source.spatialYear,
        retrievedAt: parcel.properties.source.retrievedAt,
        duplicateGeometry: parcel.properties.duplicateGeometry,
      },
    })),
  };
}
