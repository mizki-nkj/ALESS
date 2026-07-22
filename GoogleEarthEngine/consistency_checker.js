// ============================================================================
// STANDALONE CONSISTENCY CHECK (FIXED)
// Summer Vegetation Statistics - Phases 1-4 + QC
// Main fixes:
// 1) completeFC is created before QC starts.
// 2) QC ClassZone codes match the reclassified analysis values (1-5).
// 3) Forest/Urban targeted checks use codes 203 and 205.
// ============================================================================

// ============================================================================
// COMPLETE INTEGRATED GEE CODE
// Summer Vegetation Statistics - Phases 1-4 in one file / one CSV
// Fukushima DTRZ + 30 km buffer | Landsat Collection 2 Level 2 SR
// Period: 2003-2025 | Summer: June 1 to September 1 (end exclusive)
//
// Integration design:
// - Shared inputs, masks, Landsat preprocessing, composites, and area lookup.
// - NDVI, NDMI, EVI, and NBR are produced in one annual composite.
// - Each index is reduced one band at a time so Reducer.group groupField = 1.
// - One output row per Year x ClassZone, containing every Phase 1-4 metric.
// - One Drive export task and one CSV.
// ============================================================================

// ---------------------------------------------------------------------------
// 0. SETTINGS
// ---------------------------------------------------------------------------
var START_YEAR = 2003;
var END_YEAR = 2025;
var EXPORT_FOLDER = 'GEE_Exports';
var EXPORT_NAME = 'Summer_Vegetation_Statistics_Phases1_4_COMPLETE';

var SCALE = 100;       // use 300 if memory errors occur; 30 for final detail
var TILE_SCALE = 8;
var CRS = 'EPSG:4326';

var LULC_ASSET = 'projects/aless-496900/assets/LC_NEW';
var ADMIN_ASSET = 'projects/aless-496900/assets/N03-19_07_190101';
var DTRZ_ASSET = 'projects/aless-496900/assets/Difficult_to_Return_Zone_DTRZ';

// ---------------------------------------------------------------------------
// 1. INPUT DATA AND STUDY AREA
// ---------------------------------------------------------------------------
var adminTable = ee.FeatureCollection(ADMIN_ASSET);
var fukushima = adminTable
  .filter(ee.Filter.eq('N03_001', '福島県'))
  .geometry()
  .simplify(1000);

var dtrzFC = ee.FeatureCollection(DTRZ_ASSET).filterBounds(fukushima);
var dtrzGeom = dtrzFC.geometry()
  .intersection(fukushima, ee.ErrorMargin(1000))
  .simplify(1000);

var studyArea = dtrzGeom
  .buffer(30000, 1000)
  .intersection(fukushima, ee.ErrorMargin(1000))
  .simplify(1000);

Map.centerObject(studyArea, 8);
Map.addLayer(studyArea, {color: 'yellow'}, 'Study Area', false);
Map.addLayer(dtrzGeom, {color: 'blue'}, 'DTRZ', false);

// ---------------------------------------------------------------------------
// 2. LAND USE AND CLASS-ZONE IMAGE
// Correct reclassification of ALOS/AVNIR-2 LULC v16.09
// ---------------------------------------------------------------------------

// Original ALOS v16.09 classes:
// 1  Water
// 2  Built-up
// 3  Paddy
// 4  Cropland
// 5  Grassland
// 6  Deciduous broadleaf forest
// 7  Deciduous needleleaf forest
// 8  Evergreen broadleaf forest
// 9  Evergreen needleleaf forest
// 10 Bare land

var lulcOriginal = ee.Image(LULC_ASSET)
  .select([0])
  .rename('LULC_Original')
  .clip(studyArea)
  .toInt16();

// New analysis classes:
// 1 = Paddy
// 2 = Cropland
// 3 = Forest
// 4 = Grassland
// 5 = Urban

var lulcAnalysis = ee.Image(0)
  .where(lulcOriginal.eq(3), 1)  // Paddy
  .where(lulcOriginal.eq(4), 2)  // Cropland
  .where(
    lulcOriginal.eq(6)
      .or(lulcOriginal.eq(7))
      .or(lulcOriginal.eq(8))
      .or(lulcOriginal.eq(9)),
    3
  )                              // Forest
  .where(lulcOriginal.eq(5), 4)  // Grassland
  .where(lulcOriginal.eq(2), 5)  // Urban
  .updateMask(
    lulcOriginal.eq(3)
      .or(lulcOriginal.eq(4))
      .or(lulcOriginal.eq(5))
      .or(lulcOriginal.eq(6))
      .or(lulcOriginal.eq(7))
      .or(lulcOriginal.eq(8))
      .or(lulcOriginal.eq(9))
      .or(lulcOriginal.eq(2))
  )
  .rename('LULC')
  .toInt16()
  .clip(studyArea);

var insideDTRZ = ee.Image(0)
  .byte()
  .paint(dtrzFC, 1)
  .clip(studyArea)
  .rename('InsideDTRZ');

var zoneCode = insideDTRZ.eq(1).multiply(1)
  .add(insideDTRZ.eq(0).multiply(2))
  .rename('ZoneCode')
  .toInt16();

// 101-105 = Inside
// 201-205 = Outside
var classZone = zoneCode.multiply(100)
  .add(lulcAnalysis)
  .updateMask(lulcAnalysis.mask())
  .rename('ClassZone')
  .toInt16()
  .clip(studyArea);

var classZoneCodes = ee.List([
  101, 201,  // Paddy
  102, 202,  // Cropland
  103, 203,  // Forest
  104, 204,  // Grassland
  105, 205   // Urban
]);

var classNameDict = ee.Dictionary({
  '101': 'Paddy_Inside_Difficult_Return_Zone',
  '201': 'Paddy_Outside_Difficult_Return_Zone',

  '102': 'Cropland_Inside_Difficult_Return_Zone',
  '202': 'Cropland_Outside_Difficult_Return_Zone',

  '103': 'Forest_Inside_Difficult_Return_Zone',
  '203': 'Forest_Outside_Difficult_Return_Zone',

  '104': 'Grassland_Inside_Difficult_Return_Zone',
  '204': 'Grassland_Outside_Difficult_Return_Zone',

  '105': 'Urban_Inside_Difficult_Return_Zone',
  '205': 'Urban_Outside_Difficult_Return_Zone'
});

var landClassDict = ee.Dictionary({
  '101': 'Paddy',
  '201': 'Paddy',

  '102': 'Cropland',
  '202': 'Cropland',

  '103': 'Forest',
  '203': 'Forest',

  '104': 'Grassland',
  '204': 'Grassland',

  '105': 'Urban',
  '205': 'Urban'
});

var zoneNameDict = ee.Dictionary({
  '101': 'Inside_Difficult_Return_Zone',
  '102': 'Inside_Difficult_Return_Zone',
  '103': 'Inside_Difficult_Return_Zone',
  '104': 'Inside_Difficult_Return_Zone',
  '105': 'Inside_Difficult_Return_Zone',

  '201': 'Outside_Difficult_Return_Zone',
  '202': 'Outside_Difficult_Return_Zone',
  '203': 'Outside_Difficult_Return_Zone',
  '204': 'Outside_Difficult_Return_Zone',
  '205': 'Outside_Difficult_Return_Zone'
});

// ---------------------------------------------------------------------------
// 3. SAFE DICTIONARY AND GROUPED-REDUCTION HELPERS
// ---------------------------------------------------------------------------
function dictFromGroupedReduction(result, groupName) {
  result = ee.Dictionary(result);
  var groups = ee.List(ee.Algorithms.If(
    result.keys().contains('groups'), result.get('groups'), ee.List([])
  ));
  return ee.Dictionary(groups.iterate(function(item, acc) {
    item = ee.Dictionary(item);
    return ee.Dictionary(acc).set(
      ee.Number(item.get(groupName)).format(), item
    );
  }, ee.Dictionary({})));
}

function safeGet(dict, key) {
  dict = ee.Dictionary(dict);
  return ee.Algorithms.If(dict.keys().contains(key), dict.get(key), null);
}

function safeGetDict(dict, key) {
  dict = ee.Dictionary(dict);
  return ee.Dictionary(ee.Algorithms.If(
    dict.keys().contains(key), dict.get(key), ee.Dictionary({})
  ));
}

function safeSubtract(a, b) {
  return ee.Algorithms.If(
    ee.Algorithms.IsEqual(a, null), null,
    ee.Algorithms.If(
      ee.Algorithms.IsEqual(b, null), null,
      ee.Number(a).subtract(ee.Number(b))
    )
  );
}

function groupedAreaDictFromMask(maskImage) {
  var areaImage = ee.Image.pixelArea().divide(10000).rename('Area_ha')
    .updateMask(maskImage)
    .addBands(classZone.rename('ClassZone'));
  var result = areaImage.reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'ClassZone'}),
    geometry: studyArea, scale: SCALE, crs: CRS,
    maxPixels: 1e13, tileScale: TILE_SCALE
  });
  var raw = dictFromGroupedReduction(result, 'ClassZone');
  return ee.Dictionary(raw.keys().iterate(function(codeStr, acc) {
    codeStr = ee.String(codeStr);
    return ee.Dictionary(acc).set(codeStr, ee.Dictionary(raw.get(codeStr)).get('sum'));
  }, ee.Dictionary({})));
}

var totalAreaDict = groupedAreaDictFromMask(classZone.mask());
print('Total area by ClassZone', totalAreaDict);

// ---------------------------------------------------------------------------
// 4. LANDSAT PREPROCESSING: NDVI, NDMI, EVI, NBR
// ---------------------------------------------------------------------------
function maskLandsat(img) {
  var qa = img.select('QA_PIXEL');
  var clear = qa.bitwiseAnd(1 << 0).eq(0) // fill
    .and(qa.bitwiseAnd(1 << 1).eq(0))    // dilated cloud
    .and(qa.bitwiseAnd(1 << 3).eq(0))    // cloud
    .and(qa.bitwiseAnd(1 << 4).eq(0))    // cloud shadow
    .and(qa.bitwiseAnd(1 << 5).eq(0));   // snow
  return img.updateMask(clear);
}

function makeIndices(blue, red, nir, swir1, swir2) {
  var ndviDen = nir.add(red);
  var ndmiDen = nir.add(swir1);
  var eviDen = nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1);
  var nbrDen = nir.add(swir2);

  var ndvi = nir.subtract(red).divide(ndviDen).rename('NDVI')
    .updateMask(ndviDen.abs().gt(0.000001));
  var ndmi = nir.subtract(swir1).divide(ndmiDen).rename('NDMI')
    .updateMask(ndmiDen.abs().gt(0.000001));
  var evi = nir.subtract(red).multiply(2.5).divide(eviDen).rename('EVI')
    .updateMask(eviDen.abs().gt(0.000001));
  var nbr = nir.subtract(swir2).divide(nbrDen).rename('NBR')
    .updateMask(nbrDen.abs().gt(0.000001));
  return ee.Image.cat([ndvi, ndmi, evi, nbr]);
}

function prepL57(img) {
  img = maskLandsat(img);
  var optical = img.select(['SR_B1', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'])
    .multiply(0.0000275).add(-0.2);
  return makeIndices(
    optical.select('SR_B1'), optical.select('SR_B3'),
    optical.select('SR_B4'), optical.select('SR_B5'), optical.select('SR_B7')
  ).copyProperties(img, ['system:time_start']);
}

function prepL89(img) {
  img = maskLandsat(img);
  var optical = img.select(['SR_B2', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'])
    .multiply(0.0000275).add(-0.2);
  return makeIndices(
    optical.select('SR_B2'), optical.select('SR_B4'),
    optical.select('SR_B5'), optical.select('SR_B6'), optical.select('SR_B7')
  ).copyProperties(img, ['system:time_start']);
}

var emptySummerImage = ee.Image.constant([0, 0, 0, 0])
  .rename(['NDVI', 'NDMI', 'EVI', 'NBR'])
  .updateMask(ee.Image.constant(0));

function makeSummerComposite(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 6, 1);
  var end = ee.Date.fromYMD(year, 9, 1);
  var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
    .filterBounds(studyArea).filterDate(start, end).map(prepL57);
  var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
    .filterBounds(studyArea).filterDate(start, end).map(prepL57);
  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(studyArea).filterDate(start, end).map(prepL89);
  var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(studyArea).filterDate(start, end).map(prepL89);
  var col = l5.merge(l7).merge(l8).merge(l9);
  return ee.Image(ee.Algorithms.If(col.size().gt(0), col.median(), emptySummerImage))
    .select(['NDVI', 'NDMI', 'EVI', 'NBR']).clip(studyArea)
    .set('year', year)
    .set('system:time_start', ee.Date.fromYMD(year, 7, 15).millis());
}

// ---------------------------------------------------------------------------
// 5. ONE-BAND REDUCERS AND AREA HELPERS
// ---------------------------------------------------------------------------
var ndStatsReducer = ee.Reducer.count()
  .combine({reducer2: ee.Reducer.mean(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.percentile([10, 25, 75, 90]), sharedInputs: true});

var eviStatsReducer = ee.Reducer.mean()
  .combine({reducer2: ee.Reducer.median(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.percentile([25, 75]), sharedInputs: true});

var nbrStatsReducer = ee.Reducer.mean()
  .combine({reducer2: ee.Reducer.median(), sharedInputs: true});

function groupedStatsForOneBand(image, bandName, reducer) {
  var reduceImage = image.select([bandName]).rename('value')
    .updateMask(classZone.mask())
    .addBands(classZone.rename('ClassZone'));
  var result = reduceImage.reduceRegion({
    reducer: reducer.group({groupField: 1, groupName: 'ClassZone'}),
    geometry: studyArea, scale: SCALE, crs: CRS,
    maxPixels: 1e13, tileScale: TILE_SCALE
  });
  return dictFromGroupedReduction(result, 'ClassZone');
}

function groupedValidAreaDict(image) {
  var validMask = image.select('NDVI').mask()
    .and(image.select('NDMI').mask()).and(classZone.mask());
  return groupedAreaDictFromMask(validMask);
}

function groupedThresholdAreaDict(image, bandName, threshold) {
  var thresholdMask = image.select([bandName]).gt(threshold)
    .and(classZone.mask());
  return groupedAreaDictFromMask(thresholdMask);
}

function areaRatio(areaDict, codeStr, totalArea) {
  areaDict = ee.Dictionary(areaDict);
  var area = ee.Number(ee.Algorithms.If(
    areaDict.keys().contains(codeStr), areaDict.get(codeStr), 0
  ));
  return ee.Algorithms.If(ee.Number(totalArea).gt(0), area.divide(totalArea), null);
}

// ---------------------------------------------------------------------------
// 6. ANNUAL FEATURES: ALL PHASE 1-3 METRICS + PHASE 4 BASE MEANS
// ---------------------------------------------------------------------------
function annualFeaturesForYear(year) {
  year = ee.Number(year);
  var image = makeSummerComposite(year);

  var ndviStatsDict = groupedStatsForOneBand(image, 'NDVI', ndStatsReducer);
  var ndmiStatsDict = groupedStatsForOneBand(image, 'NDMI', ndStatsReducer);
  var eviStatsDict = groupedStatsForOneBand(image, 'EVI', eviStatsReducer);
  var nbrStatsDict = groupedStatsForOneBand(image, 'NBR', nbrStatsReducer);
  var validAreaDict = groupedValidAreaDict(image);

  var ndviGt05 = groupedThresholdAreaDict(image, 'NDVI', 0.5);
  var ndviGt06 = groupedThresholdAreaDict(image, 'NDVI', 0.6);
  var ndviGt07 = groupedThresholdAreaDict(image, 'NDVI', 0.7);
  var ndmiGt02 = groupedThresholdAreaDict(image, 'NDMI', 0.2);
  var ndmiGt03 = groupedThresholdAreaDict(image, 'NDMI', 0.3);
  var ndmiGt04 = groupedThresholdAreaDict(image, 'NDMI', 0.4);

  return ee.FeatureCollection(classZoneCodes.map(function(code) {
    code = ee.Number(code);
    var codeStr = code.format();
    var ndvi = safeGetDict(ndviStatsDict, codeStr);
    var ndmi = safeGetDict(ndmiStatsDict, codeStr);
    var evi = safeGetDict(eviStatsDict, codeStr);
    var nbr = safeGetDict(nbrStatsDict, codeStr);

    var totalArea = ee.Number(ee.Algorithms.If(
      totalAreaDict.keys().contains(codeStr), totalAreaDict.get(codeStr), 0
    ));
    var validArea = ee.Number(ee.Algorithms.If(
      validAreaDict.keys().contains(codeStr), validAreaDict.get(codeStr), 0
    ));
    var validRatio = ee.Algorithms.If(
      totalArea.gt(0), validArea.divide(totalArea), null
    );

    var ndviP25 = safeGet(ndvi, 'p25');
    var ndviP75 = safeGet(ndvi, 'p75');
    var ndmiP25 = safeGet(ndmi, 'p25');
    var ndmiP75 = safeGet(ndmi, 'p75');

    return ee.Feature(null, {
      'Year': year,
      'Season': 'Summer',
      'Analysis': 'Research1_Phases1_4_Integrated',
      'Land_Class': landClassDict.get(codeStr),
      'Zone': zoneNameDict.get(codeStr),
      'ClassZone_Code': code,
      'Class_Name': classNameDict.get(codeStr),
      'Total_Area_ha': totalArea,

      // Phase 1
      'Valid_Area_ha': validArea,
      'Valid_Area_Ratio': validRatio,
      'NDVI_count': safeGet(ndvi, 'count'),
      'NDMI_count': safeGet(ndmi, 'count'),
      'NDVI_stdDev': safeGet(ndvi, 'stdDev'),
      'NDMI_stdDev': safeGet(ndmi, 'stdDev'),
      'NDVI_p25': ndviP25,
      'NDVI_p75': ndviP75,
      'NDMI_p25': ndmiP25,
      'NDMI_p75': ndmiP75,

      // Phase 2
      'NDVI_p10': safeGet(ndvi, 'p10'),
      'NDVI_p90': safeGet(ndvi, 'p90'),
      'NDMI_p10': safeGet(ndmi, 'p10'),
      'NDMI_p90': safeGet(ndmi, 'p90'),
      'NDVI_IQR': safeSubtract(ndviP75, ndviP25),
      'NDMI_IQR': safeSubtract(ndmiP75, ndmiP25),
      'NDVI_gt_0_5_ratio': areaRatio(ndviGt05, codeStr, totalArea),
      'NDVI_gt_0_6_ratio': areaRatio(ndviGt06, codeStr, totalArea),
      'NDVI_gt_0_7_ratio': areaRatio(ndviGt07, codeStr, totalArea),
      'NDMI_gt_0_2_ratio': areaRatio(ndmiGt02, codeStr, totalArea),
      'NDMI_gt_0_3_ratio': areaRatio(ndmiGt03, codeStr, totalArea),
      'NDMI_gt_0_4_ratio': areaRatio(ndmiGt04, codeStr, totalArea),

      // Phase 3
      'EVI_mean': safeGet(evi, 'mean'),
      'EVI_median': safeGet(evi, 'median'),
      'EVI_p25': safeGet(evi, 'p25'),
      'EVI_p75': safeGet(evi, 'p75'),
      'NBR_mean': safeGet(nbr, 'mean'),
      'NBR_median': safeGet(nbr, 'median'),

      // Phase 4 base means
      'NDVI_mean': safeGet(ndvi, 'mean'),
      'NDMI_mean': safeGet(ndmi, 'mean')
    });
  }));
}

var years = ee.List.sequence(START_YEAR, END_YEAR);
var annualFC = ee.FeatureCollection(years.map(annualFeaturesForYear)).flatten();
print('Integrated annual statistics preview', annualFC.limit(20));
print('Expected row count', years.size().multiply(classZoneCodes.size()));
print('Actual row count', annualFC.size());

// ---------------------------------------------------------------------------
// 7. PHASE 4: ADD INSIDE/OUTSIDE DIFFERENCES AND YEAR-TO-YEAR CHANGES
// ---------------------------------------------------------------------------
// annualFC contains the base statistics. completeFC is the final table used by QC.
function addPhase4Metrics(feature) {
  feature = ee.Feature(feature);

  var year = ee.Number(feature.get('Year'));
  var code = ee.Number(feature.get('ClassZone_Code'));

  // Codes below 200 are Inside; corresponding Outside codes are +100.
  var insideCode = ee.Number(ee.Algorithms.If(code.lt(200), code, code.subtract(100)));
  var outsideCode = insideCode.add(100);

  var insideRow = ee.Feature(
    annualFC
      .filter(ee.Filter.eq('Year', year))
      .filter(ee.Filter.eq('ClassZone_Code', insideCode))
      .first()
  );
  var outsideRow = ee.Feature(
    annualFC
      .filter(ee.Filter.eq('Year', year))
      .filter(ee.Filter.eq('ClassZone_Code', outsideCode))
      .first()
  );

  var previousRow = ee.Feature(
    annualFC
      .filter(ee.Filter.eq('ClassZone_Code', code))
      .filter(ee.Filter.eq('Year', year.subtract(1)))
      .first()
  );

  var ndviInsideMinusOutside = safeSubtract(
    insideRow.get('NDVI_mean'),
    outsideRow.get('NDVI_mean')
  );
  var ndmiInsideMinusOutside = safeSubtract(
    insideRow.get('NDMI_mean'),
    outsideRow.get('NDMI_mean')
  );

  var ndviYearToYear = ee.Algorithms.If(
    year.gt(START_YEAR),
    safeSubtract(feature.get('NDVI_mean'), previousRow.get('NDVI_mean')),
    null
  );
  var ndmiYearToYear = ee.Algorithms.If(
    year.gt(START_YEAR),
    safeSubtract(feature.get('NDMI_mean'), previousRow.get('NDMI_mean')),
    null
  );

  return feature.set({
    'NDVI_inside_minus_outside': ndviInsideMinusOutside,
    'NDMI_inside_minus_outside': ndmiInsideMinusOutside,
    'NDVI_year_to_year_change': ndviYearToYear,
    'NDMI_year_to_year_change': ndmiYearToYear
  });
}

var completeFC = annualFC.map(addPhase4Metrics)
  .sort('Year');

print('Complete statistics preview', completeFC.limit(20));
print('Complete row count', completeFC.size());

// Optional export of the integrated statistics table.
Export.table.toDrive({
  collection: completeFC,
  description: EXPORT_NAME,
  folder: EXPORT_FOLDER,
  fileNamePrefix: EXPORT_NAME,
  fileFormat: 'CSV'
});

// ============================================================================
// COMPLETE DATA CONSISTENCY CHECK
// Fukushima DTRZ Summer Vegetation Statistics
//
// Standalone QC section; completeFC is created above.
//
// Required objects/functions already defined in the main script:
// - completeFC
// - annualFC
// - makeSummerComposite(year)
// - classZone
// - studyArea
// - START_YEAR
// - END_YEAR
// - SCALE
// - TILE_SCALE
// - CRS
// - EXPORT_FOLDER
// ============================================================================


// ---------------------------------------------------------------------------
// A. SETTINGS
// ---------------------------------------------------------------------------

var QC_EXPORT_PREFIX = 'Summer_Vegetation_Statistics_QC';

// Percentile settings used for independent verification.
// A large number of histogram buckets is used to reduce approximation error.
var QC_PERCENTILE_REDUCER = ee.Reducer.percentile({
  percentiles: [10, 25, 50, 75, 90],
  outputNames: ['p10', 'p25', 'p50', 'p75', 'p90'],
  maxBuckets: 65536,
  minBucketWidth: 0.000001,
  maxRaw: 100000
});

// Expected analysis classes and ClassZone codes.
var QC_EXPECTED_CLASSES = ee.List([
  'Paddy',
  'Cropland',
  'Forest',
  'Grassland',
  'Urban'
]);

var QC_EXPECTED_ZONES = ee.List([
  'Inside_Difficult_Return_Zone',
  'Outside_Difficult_Return_Zone'
]);

var QC_EXPECTED_CLASSZONE_CODES = ee.List([
  101, 201,  // Paddy
  102, 202,  // Cropland
  103, 203,  // Forest
  104, 204,  // Grassland
  105, 205   // Urban
]);

var QC_EXPECTED_YEARS = ee.List.sequence(
  START_YEAR,
  END_YEAR
);

var QC_EXPECTED_ROW_COUNT = QC_EXPECTED_YEARS
  .size()
  .multiply(QC_EXPECTED_CLASSZONE_CODES.size());


// ---------------------------------------------------------------------------
// B. GENERAL HELPER FUNCTIONS
// ---------------------------------------------------------------------------

// Convert a Boolean expression to 1 or 0.
function qcFlag(condition) {
  return ee.Number(
    ee.Algorithms.If(condition, 1, 0)
  );
}

// Safely test whether a feature property is null.
function qcIsNull(feature, propertyName) {
  return ee.Algorithms.IsEqual(
    ee.Feature(feature).get(propertyName),
    null
  );
}

// Safely calculate absolute difference.
function qcAbsoluteDifference(a, b) {
  return ee.Algorithms.If(
    ee.Algorithms.IsEqual(a, null),
    null,
    ee.Algorithms.If(
      ee.Algorithms.IsEqual(b, null),
      null,
      ee.Number(a).subtract(ee.Number(b)).abs()
    )
  );
}

// Return 1 if a numeric value is outside [lower, upper].
function qcOutsideRange(value, lower, upper) {
  return ee.Number(
    ee.Algorithms.If(
      ee.Algorithms.IsEqual(value, null),
      1,
      ee.Algorithms.If(
        ee.Number(value).lt(lower)
          .or(ee.Number(value).gt(upper)),
        1,
        0
      )
    )
  );
}

// Return 1 if first value is greater than second value.
function qcOrderViolation(firstValue, secondValue) {
  return ee.Number(
    ee.Algorithms.If(
      ee.Algorithms.IsEqual(firstValue, null),
      1,
      ee.Algorithms.If(
        ee.Algorithms.IsEqual(secondValue, null),
        1,
        ee.Algorithms.If(
          ee.Number(firstValue).gt(
            ee.Number(secondValue)
          ),
          1,
          0
        )
      )
    )
  );
}


// ---------------------------------------------------------------------------
// C. BASIC DATASET INFORMATION
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 1: BASIC DATASET INFORMATION');
print('============================================================');

print(
  'Expected row count',
  QC_EXPECTED_ROW_COUNT
);

print(
  'Actual row count',
  completeFC.size()
);

print(
  'Row count is correct',
  completeFC.size().eq(QC_EXPECTED_ROW_COUNT)
);

print(
  'Year histogram',
  completeFC.aggregate_histogram('Year')
);

print(
  'Land class histogram',
  completeFC.aggregate_histogram('Land_Class')
);

print(
  'Zone histogram',
  completeFC.aggregate_histogram('Zone')
);

print(
  'ClassZone code histogram',
  completeFC.aggregate_histogram('ClassZone_Code')
);

print(
  'Season histogram',
  completeFC.aggregate_histogram('Season')
);

print(
  'Analysis label histogram',
  completeFC.aggregate_histogram('Analysis')
);


// ---------------------------------------------------------------------------
// D. DUPLICATE CHECK
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 2: DUPLICATE YEAR x LAND CLASS x ZONE CHECK');
print('============================================================');

// Create a unique row key.
var qcFCWithKey = completeFC.map(function(feature) {
  feature = ee.Feature(feature);

  var rowKey = ee.String(
    ee.Number(feature.get('Year')).format()
  )
    .cat('_')
    .cat(ee.String(feature.get('Land_Class')))
    .cat('_')
    .cat(ee.String(feature.get('Zone')));

  return feature.set('QC_Row_Key', rowKey);
});

var qcRowKeyHistogram =
  qcFCWithKey.aggregate_histogram('QC_Row_Key');

var qcDuplicateKeyList = ee.List(
  qcRowKeyHistogram.keys()
).map(function(key) {
  key = ee.String(key);

  return ee.Algorithms.If(
    ee.Number(qcRowKeyHistogram.get(key)).gt(1),
    key,
    null
  );
}).removeAll([null]);

print(
  'Number of unique Year x Land_Class x Zone keys',
  qcRowKeyHistogram.size()
);

print(
  'Number of duplicate keys',
  qcDuplicateKeyList.size()
);

print(
  'Duplicate keys',
  qcDuplicateKeyList
);


// ---------------------------------------------------------------------------
// E. INSIDE/OUTSIDE PAIR COMPLETENESS
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 3: INSIDE/OUTSIDE PAIR COMPLETENESS');
print('============================================================');

var qcYearClassPairs = ee.FeatureCollection(
  QC_EXPECTED_YEARS.map(function(year) {
    year = ee.Number(year);

    return QC_EXPECTED_CLASSES.map(function(landClass) {
      landClass = ee.String(landClass);

      var subset = completeFC
        .filter(ee.Filter.eq('Year', year))
        .filter(ee.Filter.eq('Land_Class', landClass));

      var insideCount = subset
        .filter(
          ee.Filter.eq(
            'Zone',
            'Inside_Difficult_Return_Zone'
          )
        )
        .size();

      var outsideCount = subset
        .filter(
          ee.Filter.eq(
            'Zone',
            'Outside_Difficult_Return_Zone'
          )
        )
        .size();

      var pairOK = insideCount.eq(1)
        .and(outsideCount.eq(1));

      return ee.Feature(null, {
        Year: year,
        Land_Class: landClass,
        Inside_Count: insideCount,
        Outside_Count: outsideCount,
        Pair_OK: qcFlag(pairOK),
        Pair_Error: qcFlag(pairOK.not())
      });
    });
  }).flatten()
);

print(
  'Number of Year x Land_Class pairs',
  qcYearClassPairs.size()
);

print(
  'Number of incomplete Inside/Outside pairs',
  qcYearClassPairs.aggregate_sum('Pair_Error')
);

print(
  'Incomplete Inside/Outside pairs',
  qcYearClassPairs.filter(
    ee.Filter.eq('Pair_Error', 1)
  )
);


// ---------------------------------------------------------------------------
// F. REQUIRED PROPERTY NULL CHECK
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 4: REQUIRED PROPERTY NULL CHECK');
print('============================================================');

var qcRequiredProperties = [
  'Year',
  'Season',
  'Land_Class',
  'Zone',
  'ClassZone_Code',
  'Class_Name',
  'Total_Area_ha',
  'Valid_Area_ha',
  'Valid_Area_Ratio',

  'NDVI_count',
  'NDMI_count',

  'NDVI_mean',
  'NDMI_mean',
  'EVI_mean',
  'NBR_mean',

  'NDVI_stdDev',
  'NDMI_stdDev',

  'NDVI_p10',
  'NDVI_p25',
  'NDVI_p75',
  'NDVI_p90',

  'NDMI_p10',
  'NDMI_p25',
  'NDMI_p75',
  'NDMI_p90',

  'NDVI_IQR',
  'NDMI_IQR',

  'NDVI_gt_0_5_ratio',
  'NDVI_gt_0_6_ratio',
  'NDVI_gt_0_7_ratio',

  'NDMI_gt_0_2_ratio',
  'NDMI_gt_0_3_ratio',
  'NDMI_gt_0_4_ratio',

  'EVI_median',
  'EVI_p25',
  'EVI_p75',

  'NBR_median'
];

var qcNullSummary = ee.FeatureCollection(
  ee.List(qcRequiredProperties).map(function(propertyName) {
    propertyName = ee.String(propertyName);

    var nonNullCount = completeFC
      .filter(
        ee.Filter.notNull([propertyName])
      )
      .size();

    var nullCount = completeFC
      .size()
      .subtract(nonNullCount);

    return ee.Feature(null, {
      Property: propertyName,
      Non_Null_Count: nonNullCount,
      Null_Count: nullCount,
      Null_Flag: qcFlag(nullCount.gt(0))
    });
  })
);

print(
  'Required-property null summary',
  qcNullSummary
);

print(
  'Properties containing unexpected nulls',
  qcNullSummary.filter(
    ee.Filter.eq('Null_Flag', 1)
  )
);


// ---------------------------------------------------------------------------
// G. ROW-LEVEL LOGICAL CONSISTENCY CHECKS
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 5: ROW-LEVEL LOGICAL CONSISTENCY');
print('============================================================');

var qcCheckedFC = qcFCWithKey.map(function(feature) {
  feature = ee.Feature(feature);

  var year = ee.Number(feature.get('Year'));

  var totalArea = ee.Number(
    feature.get('Total_Area_ha')
  );

  var validArea = ee.Number(
    feature.get('Valid_Area_ha')
  );

  var validRatio = ee.Number(
    feature.get('Valid_Area_Ratio')
  );

  var calculatedValidRatio =
    validArea.divide(totalArea);

  var validRatioDifference =
    calculatedValidRatio
      .subtract(validRatio)
      .abs();

  var ndviCount = ee.Number(
    feature.get('NDVI_count')
  );

  var ndmiCount = ee.Number(
    feature.get('NDMI_count')
  );

  var ndviP10 = ee.Number(
    feature.get('NDVI_p10')
  );

  var ndviP25 = ee.Number(
    feature.get('NDVI_p25')
  );

  var ndviP75 = ee.Number(
    feature.get('NDVI_p75')
  );

  var ndviP90 = ee.Number(
    feature.get('NDVI_p90')
  );

  var ndmiP10 = ee.Number(
    feature.get('NDMI_p10')
  );

  var ndmiP25 = ee.Number(
    feature.get('NDMI_p25')
  );

  var ndmiP75 = ee.Number(
    feature.get('NDMI_p75')
  );

  var ndmiP90 = ee.Number(
    feature.get('NDMI_p90')
  );

  var storedNDVIIQR = ee.Number(
    feature.get('NDVI_IQR')
  );

  var storedNDMIIQR = ee.Number(
    feature.get('NDMI_IQR')
  );

  var recalculatedNDVIIQR =
    ndviP75.subtract(ndviP25);

  var recalculatedNDMIIQR =
    ndmiP75.subtract(ndmiP25);

  var ndviIQRDifference =
    storedNDVIIQR
      .subtract(recalculatedNDVIIQR)
      .abs();

  var ndmiIQRDifference =
    storedNDMIIQR
      .subtract(recalculatedNDMIIQR)
      .abs();

  // Ratio range checks.
  var ratioErrorSum = ee.Number(0)
    .add(
      qcOutsideRange(
        feature.get('Valid_Area_Ratio'),
        0,
        1.000001
      )
    )
    .add(
      qcOutsideRange(
        feature.get('NDVI_gt_0_5_ratio'),
        0,
        1.000001
      )
    )
    .add(
      qcOutsideRange(
        feature.get('NDVI_gt_0_6_ratio'),
        0,
        1.000001
      )
    )
    .add(
      qcOutsideRange(
        feature.get('NDVI_gt_0_7_ratio'),
        0,
        1.000001
      )
    )
    .add(
      qcOutsideRange(
        feature.get('NDMI_gt_0_2_ratio'),
        0,
        1.000001
      )
    )
    .add(
      qcOutsideRange(
        feature.get('NDMI_gt_0_3_ratio'),
        0,
        1.000001
      )
    )
    .add(
      qcOutsideRange(
        feature.get('NDMI_gt_0_4_ratio'),
        0,
        1.000001
      )
    );

  // Threshold nesting:
  // NDVI > 0.7 must be <= NDVI > 0.6 <= NDVI > 0.5.
  var ndviThresholdOrderErrors =
    qcOrderViolation(
      feature.get('NDVI_gt_0_7_ratio'),
      feature.get('NDVI_gt_0_6_ratio')
    ).add(
      qcOrderViolation(
        feature.get('NDVI_gt_0_6_ratio'),
        feature.get('NDVI_gt_0_5_ratio')
      )
    );

  // NDMI > 0.4 must be <= NDMI > 0.3 <= NDMI > 0.2.
  var ndmiThresholdOrderErrors =
    qcOrderViolation(
      feature.get('NDMI_gt_0_4_ratio'),
      feature.get('NDMI_gt_0_3_ratio')
    ).add(
      qcOrderViolation(
        feature.get('NDMI_gt_0_3_ratio'),
        feature.get('NDMI_gt_0_2_ratio')
      )
    );

  // Quantile ordering checks.
  var ndviQuantileOrderErrors =
    qcOrderViolation(ndviP10, ndviP25)
      .add(qcOrderViolation(ndviP25, ndviP75))
      .add(qcOrderViolation(ndviP75, ndviP90));

  var ndmiQuantileOrderErrors =
    qcOrderViolation(ndmiP10, ndmiP25)
      .add(qcOrderViolation(ndmiP25, ndmiP75))
      .add(qcOrderViolation(ndmiP75, ndmiP90));

  // Duplicate percentile warning:
  // This is a warning, not necessarily an error.
  var ndviAllPercentilesEqual =
    ndviP10.subtract(ndviP25).abs().lt(1e-10)
      .and(
        ndviP25.subtract(ndviP75).abs().lt(1e-10)
      )
      .and(
        ndviP75.subtract(ndviP90).abs().lt(1e-10)
      );

  var ndmiAllPercentilesEqual =
    ndmiP10.subtract(ndmiP25).abs().lt(1e-10)
      .and(
        ndmiP25.subtract(ndmiP75).abs().lt(1e-10)
      )
      .and(
        ndmiP75.subtract(ndmiP90).abs().lt(1e-10)
      );

  var validAreaGreaterThanTotal =
    validArea.gt(totalArea.multiply(1.000001));

  var negativeArea =
    totalArea.lt(0).or(validArea.lt(0));

  var nonPositiveCount =
    ndviCount.lte(0).or(ndmiCount.lte(0));

  var countMismatch =
    ndviCount.neq(ndmiCount);

  var iqrError =
    ndviIQRDifference.gt(1e-8)
      .or(ndmiIQRDifference.gt(1e-8));

  var validRatioError =
    validRatioDifference.gt(1e-8);

  var lowValidArea070 =
    validRatio.lt(0.70);

  var lowValidArea080 =
    validRatio.lt(0.80);

  var lowValidArea090 =
    validRatio.lt(0.90);

  // Year-to-year changes should be null only in the first year.
  var ndviYOYIsNull =
    qcIsNull(
      feature,
      'NDVI_year_to_year_change'
    );

  var ndmiYOYIsNull =
    qcIsNull(
      feature,
      'NDMI_year_to_year_change'
    );

  var unexpectedNDVIYOYNull =
    ee.Algorithms.If(
      year.eq(START_YEAR),
      0,
      qcFlag(ndviYOYIsNull)
    );

  var unexpectedNDMIYOYNull =
    ee.Algorithms.If(
      year.eq(START_YEAR),
      0,
      qcFlag(ndmiYOYIsNull)
    );

  var rowErrorCount = ee.Number(0)
    .add(qcFlag(validAreaGreaterThanTotal))
    .add(qcFlag(negativeArea))
    .add(qcFlag(nonPositiveCount))
    .add(qcFlag(countMismatch))
    .add(qcFlag(iqrError))
    .add(qcFlag(validRatioError))
    .add(ratioErrorSum)
    .add(ndviThresholdOrderErrors)
    .add(ndmiThresholdOrderErrors)
    .add(ndviQuantileOrderErrors)
    .add(ndmiQuantileOrderErrors)
    .add(ee.Number(unexpectedNDVIYOYNull))
    .add(ee.Number(unexpectedNDMIYOYNull));

  return feature.set({
    QC_Calculated_Valid_Area_Ratio:
      calculatedValidRatio,

    QC_Valid_Ratio_Abs_Difference:
      validRatioDifference,

    QC_Recalculated_NDVI_IQR:
      recalculatedNDVIIQR,

    QC_Recalculated_NDMI_IQR:
      recalculatedNDMIIQR,

    QC_NDVI_IQR_Abs_Difference:
      ndviIQRDifference,

    QC_NDMI_IQR_Abs_Difference:
      ndmiIQRDifference,

    QC_Valid_Area_Greater_Than_Total:
      qcFlag(validAreaGreaterThanTotal),

    QC_Negative_Area:
      qcFlag(negativeArea),

    QC_Non_Positive_Count:
      qcFlag(nonPositiveCount),

    QC_NDVI_NDMI_Count_Mismatch:
      qcFlag(countMismatch),

    QC_Ratio_Range_Error_Count:
      ratioErrorSum,

    QC_NDVI_Threshold_Order_Error_Count:
      ndviThresholdOrderErrors,

    QC_NDMI_Threshold_Order_Error_Count:
      ndmiThresholdOrderErrors,

    QC_NDVI_Quantile_Order_Error_Count:
      ndviQuantileOrderErrors,

    QC_NDMI_Quantile_Order_Error_Count:
      ndmiQuantileOrderErrors,

    QC_NDVI_All_Percentiles_Equal_Warning:
      qcFlag(ndviAllPercentilesEqual),

    QC_NDMI_All_Percentiles_Equal_Warning:
      qcFlag(ndmiAllPercentilesEqual),

    QC_Low_Valid_Area_070:
      qcFlag(lowValidArea070),

    QC_Low_Valid_Area_080:
      qcFlag(lowValidArea080),

    QC_Low_Valid_Area_090:
      qcFlag(lowValidArea090),

    QC_Unexpected_NDVI_YOY_Null:
      unexpectedNDVIYOYNull,

    QC_Unexpected_NDMI_YOY_Null:
      unexpectedNDMIYOYNull,

    QC_Total_Error_Count:
      rowErrorCount,

    QC_Row_OK:
      qcFlag(rowErrorCount.eq(0))
  });
});

print(
  'Number of rows with one or more logical errors',
  qcCheckedFC
    .filter(ee.Filter.gt('QC_Total_Error_Count', 0))
    .size()
);

print(
  'Rows with logical errors',
  qcCheckedFC.filter(
    ee.Filter.gt('QC_Total_Error_Count', 0)
  )
);

print(
  'Rows with Valid Area Ratio < 0.70',
  qcCheckedFC.filter(
    ee.Filter.eq('QC_Low_Valid_Area_070', 1)
  )
);

print(
  'Rows with Valid Area Ratio < 0.80',
  qcCheckedFC.filter(
    ee.Filter.eq('QC_Low_Valid_Area_080', 1)
  )
);

print(
  'Rows with all NDVI percentiles equal',
  qcCheckedFC.filter(
    ee.Filter.eq(
      'QC_NDVI_All_Percentiles_Equal_Warning',
      1
    )
  )
);

print(
  'Rows with all NDMI percentiles equal',
  qcCheckedFC.filter(
    ee.Filter.eq(
      'QC_NDMI_All_Percentiles_Equal_Warning',
      1
    )
  )
);


// ---------------------------------------------------------------------------
// H. TOTAL AREA STABILITY BY CLASSZONE
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 6: TOTAL AREA STABILITY');
print('============================================================');

var qcAreaStabilityFC = ee.FeatureCollection(
  QC_EXPECTED_CLASSZONE_CODES.map(function(code) {
    code = ee.Number(code);

    var subset = completeFC.filter(
      ee.Filter.eq('ClassZone_Code', code)
    );

    var minArea = ee.Number(
      subset.aggregate_min('Total_Area_ha')
    );

    var maxArea = ee.Number(
      subset.aggregate_max('Total_Area_ha')
    );

    var areaRange = maxArea.subtract(minArea);

    var firstFeature = ee.Feature(subset.first());

    return ee.Feature(null, {
      ClassZone_Code: code,
      Land_Class: firstFeature.get('Land_Class'),
      Zone: firstFeature.get('Zone'),
      Number_Of_Years: subset.size(),
      Minimum_Total_Area_ha: minArea,
      Maximum_Total_Area_ha: maxArea,
      Total_Area_Range_ha: areaRange,
      Area_Stable: qcFlag(areaRange.abs().lt(1e-6))
    });
  })
);

print(
  'Total-area stability by ClassZone',
  qcAreaStabilityFC
);

print(
  'ClassZones with changing total area',
  qcAreaStabilityFC.filter(
    ee.Filter.eq('Area_Stable', 0)
  )
);


// ---------------------------------------------------------------------------
// I. VERIFY INSIDE-MINUS-OUTSIDE PROPERTIES
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 7: INSIDE-MINUS-OUTSIDE PROPERTY CHECK');
print('============================================================');

var qcInsideOutsideCheckFC = ee.FeatureCollection(
  QC_EXPECTED_YEARS.map(function(year) {
    year = ee.Number(year);

    return QC_EXPECTED_CLASSES.map(function(landClass) {
      landClass = ee.String(landClass);

      var subset = completeFC
        .filter(ee.Filter.eq('Year', year))
        .filter(ee.Filter.eq('Land_Class', landClass));

      var inside = ee.Feature(
        subset.filter(
          ee.Filter.eq(
            'Zone',
            'Inside_Difficult_Return_Zone'
          )
        ).first()
      );

      var outside = ee.Feature(
        subset.filter(
          ee.Filter.eq(
            'Zone',
            'Outside_Difficult_Return_Zone'
          )
        ).first()
      );

      var calculatedNDVIDiff =
        ee.Number(inside.get('NDVI_mean'))
          .subtract(
            ee.Number(outside.get('NDVI_mean'))
          );

      var calculatedNDMIDiff =
        ee.Number(inside.get('NDMI_mean'))
          .subtract(
            ee.Number(outside.get('NDMI_mean'))
          );

      var storedNDVIDiff = ee.Number(
        inside.get('NDVI_inside_minus_outside')
      );

      var storedNDMIDiff = ee.Number(
        inside.get('NDMI_inside_minus_outside')
      );

      var ndviDifferenceError =
        calculatedNDVIDiff
          .subtract(storedNDVIDiff)
          .abs();

      var ndmiDifferenceError =
        calculatedNDMIDiff
          .subtract(storedNDMIDiff)
          .abs();

      return ee.Feature(null, {
        Year: year,
        Land_Class: landClass,

        Calculated_NDVI_Inside_Minus_Outside:
          calculatedNDVIDiff,

        Stored_NDVI_Inside_Minus_Outside:
          storedNDVIDiff,

        NDVI_Absolute_Error:
          ndviDifferenceError,

        Calculated_NDMI_Inside_Minus_Outside:
          calculatedNDMIDiff,

        Stored_NDMI_Inside_Minus_Outside:
          storedNDMIDiff,

        NDMI_Absolute_Error:
          ndmiDifferenceError,

        NDVI_Difference_OK:
          qcFlag(ndviDifferenceError.lt(1e-8)),

        NDMI_Difference_OK:
          qcFlag(ndmiDifferenceError.lt(1e-8))
      });
    });
  }).flatten()
);

print(
  'Inside-minus-outside verification',
  qcInsideOutsideCheckFC
);

print(
  'Inside-minus-outside mismatches',
  qcInsideOutsideCheckFC.filter(
    ee.Filter.or(
      ee.Filter.eq('NDVI_Difference_OK', 0),
      ee.Filter.eq('NDMI_Difference_OK', 0)
    )
  )
);


// ---------------------------------------------------------------------------
// J. VERIFY YEAR-TO-YEAR CHANGE
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 8: YEAR-TO-YEAR CHANGE CHECK');
print('============================================================');

var qcYOYCheckFC = ee.FeatureCollection(
  QC_EXPECTED_CLASSZONE_CODES.map(function(code) {
    code = ee.Number(code);

    var yearsAfterStart = ee.List.sequence(
      START_YEAR + 1,
      END_YEAR
    );

    return yearsAfterStart.map(function(year) {
      year = ee.Number(year);

      var current = ee.Feature(
        completeFC
          .filter(
            ee.Filter.eq('ClassZone_Code', code)
          )
          .filter(ee.Filter.eq('Year', year))
          .first()
      );

      var previous = ee.Feature(
        completeFC
          .filter(
            ee.Filter.eq('ClassZone_Code', code)
          )
          .filter(
            ee.Filter.eq('Year', year.subtract(1))
          )
          .first()
      );

      var calculatedNDVIChange =
        ee.Number(current.get('NDVI_mean'))
          .subtract(
            ee.Number(previous.get('NDVI_mean'))
          );

      var calculatedNDMIChange =
        ee.Number(current.get('NDMI_mean'))
          .subtract(
            ee.Number(previous.get('NDMI_mean'))
          );

      var storedNDVIChange = ee.Number(
        current.get('NDVI_year_to_year_change')
      );

      var storedNDMIChange = ee.Number(
        current.get('NDMI_year_to_year_change')
      );

      var ndviError =
        calculatedNDVIChange
          .subtract(storedNDVIChange)
          .abs();

      var ndmiError =
        calculatedNDMIChange
          .subtract(storedNDMIChange)
          .abs();

      return ee.Feature(null, {
        Year: year,
        ClassZone_Code: code,
        Land_Class: current.get('Land_Class'),
        Zone: current.get('Zone'),

        Calculated_NDVI_YOY:
          calculatedNDVIChange,

        Stored_NDVI_YOY:
          storedNDVIChange,

        NDVI_YOY_Absolute_Error:
          ndviError,

        Calculated_NDMI_YOY:
          calculatedNDMIChange,

        Stored_NDMI_YOY:
          storedNDMIChange,

        NDMI_YOY_Absolute_Error:
          ndmiError,

        NDVI_YOY_OK:
          qcFlag(ndviError.lt(1e-8)),

        NDMI_YOY_OK:
          qcFlag(ndmiError.lt(1e-8))
      });
    });
  }).flatten()
);

print(
  'Year-to-year change verification',
  qcYOYCheckFC
);

print(
  'Year-to-year change mismatches',
  qcYOYCheckFC.filter(
    ee.Filter.or(
      ee.Filter.eq('NDVI_YOY_OK', 0),
      ee.Filter.eq('NDMI_YOY_OK', 0)
    )
  )
);


// ---------------------------------------------------------------------------
// K. TARGETED INDEPENDENT PERCENTILE VERIFICATION
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 9: TARGETED PERCENTILE VERIFICATION');
print('============================================================');

// Suspected anomalous cases and normal control cases.
var qcPercentileCases = ee.List([
  ee.Dictionary({
    year: 2008,
    classZone: 203,
    label: 'Forest_Outside_2008_suspected'
  }),

  ee.Dictionary({
    year: 2016,
    classZone: 203,
    label: 'Forest_Outside_2016_suspected'
  }),

  ee.Dictionary({
    year: 2016,
    classZone: 205,
    label: 'Urban_Outside_2016_suspected'
  }),

  ee.Dictionary({
    year: 2009,
    classZone: 203,
    label: 'Forest_Outside_2009_control'
  }),

  ee.Dictionary({
    year: 2015,
    classZone: 203,
    label: 'Forest_Outside_2015_control'
  }),

  ee.Dictionary({
    year: 2017,
    classZone: 203,
    label: 'Forest_Outside_2017_control'
  }),

  ee.Dictionary({
    year: 2015,
    classZone: 205,
    label: 'Urban_Outside_2015_control'
  }),

  ee.Dictionary({
    year: 2017,
    classZone: 205,
    label: 'Urban_Outside_2017_control'
  })
]);

// Independent direct reduction without group().
function qcDirectStatsForCase(
  year,
  classZoneCode,
  scaleValue
) {
  year = ee.Number(year);
  classZoneCode = ee.Number(classZoneCode);
  scaleValue = ee.Number(scaleValue);

  var image = makeSummerComposite(year)
    .select('NDVI')
    .updateMask(
      classZone.eq(classZoneCode)
    )
    .rename('NDVI');

  var reducer = ee.Reducer.count()
    .combine({
      reducer2: ee.Reducer.mean(),
      sharedInputs: true
    })
    .combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    })
    .combine({
      reducer2: ee.Reducer.minMax(),
      sharedInputs: true
    })
    .combine({
      reducer2: QC_PERCENTILE_REDUCER,
      sharedInputs: true
    });

  return image.reduceRegion({
    reducer: reducer,
    geometry: studyArea,
    scale: scaleValue,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });
}

var qcPercentileVerificationFC =
  ee.FeatureCollection(
    qcPercentileCases.map(function(item) {
      item = ee.Dictionary(item);

      var year = ee.Number(item.get('year'));

      var code = ee.Number(
        item.get('classZone')
      );

      var label = ee.String(item.get('label'));

      var sourceRow = ee.Feature(
        completeFC
          .filter(ee.Filter.eq('Year', year))
          .filter(
            ee.Filter.eq('ClassZone_Code', code)
          )
          .first()
      );

      var stats30 = ee.Dictionary(
        qcDirectStatsForCase(
          year,
          code,
          30
        )
      );

      var stats100 = ee.Dictionary(
        qcDirectStatsForCase(
          year,
          code,
          100
        )
      );

      return ee.Feature(null, {
        Label: label,
        Year: year,
        ClassZone_Code: code,
        Land_Class: sourceRow.get('Land_Class'),
        Zone: sourceRow.get('Zone'),

        CSV_NDVI_count:
          sourceRow.get('NDVI_count'),

        CSV_NDVI_mean:
          sourceRow.get('NDVI_mean'),

        CSV_NDVI_stdDev:
          sourceRow.get('NDVI_stdDev'),

        CSV_NDVI_p10:
          sourceRow.get('NDVI_p10'),

        CSV_NDVI_p25:
          sourceRow.get('NDVI_p25'),

        CSV_NDVI_p75:
          sourceRow.get('NDVI_p75'),

        CSV_NDVI_p90:
          sourceRow.get('NDVI_p90'),

        Direct30_count:
          stats30.get('NDVI_count'),

        Direct30_mean:
          stats30.get('NDVI_mean'),

        Direct30_stdDev:
          stats30.get('NDVI_stdDev'),

        Direct30_min:
          stats30.get('NDVI_min'),

        Direct30_max:
          stats30.get('NDVI_max'),

        Direct30_p10:
          stats30.get('NDVI_p10'),

        Direct30_p25:
          stats30.get('NDVI_p25'),

        Direct30_p50:
          stats30.get('NDVI_p50'),

        Direct30_p75:
          stats30.get('NDVI_p75'),

        Direct30_p90:
          stats30.get('NDVI_p90'),

        Direct100_count:
          stats100.get('NDVI_count'),

        Direct100_mean:
          stats100.get('NDVI_mean'),

        Direct100_stdDev:
          stats100.get('NDVI_stdDev'),

        Direct100_min:
          stats100.get('NDVI_min'),

        Direct100_max:
          stats100.get('NDVI_max'),

        Direct100_p10:
          stats100.get('NDVI_p10'),

        Direct100_p25:
          stats100.get('NDVI_p25'),

        Direct100_p50:
          stats100.get('NDVI_p50'),

        Direct100_p75:
          stats100.get('NDVI_p75'),

        Direct100_p90:
          stats100.get('NDVI_p90'),

        CSV_vs_Direct100_p10_abs_diff:
          qcAbsoluteDifference(
            sourceRow.get('NDVI_p10'),
            stats100.get('NDVI_p10')
          ),

        CSV_vs_Direct100_p25_abs_diff:
          qcAbsoluteDifference(
            sourceRow.get('NDVI_p25'),
            stats100.get('NDVI_p25')
          ),

        CSV_vs_Direct100_p75_abs_diff:
          qcAbsoluteDifference(
            sourceRow.get('NDVI_p75'),
            stats100.get('NDVI_p75')
          ),

        CSV_vs_Direct100_p90_abs_diff:
          qcAbsoluteDifference(
            sourceRow.get('NDVI_p90'),
            stats100.get('NDVI_p90')
          )
      });
    })
  );

print(
  'Targeted percentile verification table',
  qcPercentileVerificationFC
);


// ---------------------------------------------------------------------------
// L. PRINT FIXED HISTOGRAMS FOR SUSPECTED CASES
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 10: FIXED HISTOGRAMS FOR SUSPECTED CASES');
print('============================================================');

function qcPrintHistogram(
  year,
  classZoneCode,
  label
) {
  var image = makeSummerComposite(year)
    .select('NDVI')
    .updateMask(
      classZone.eq(classZoneCode)
    )
    .rename('NDVI');

  var histogram30 = image.reduceRegion({
    reducer: ee.Reducer.fixedHistogram(
      -1,
      1,
      200
    ),
    geometry: studyArea,
    scale: 30,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  var histogram100 = image.reduceRegion({
    reducer: ee.Reducer.fixedHistogram(
      -1,
      1,
      200
    ),
    geometry: studyArea,
    scale: 100,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  print(
    label + ' - fixed histogram at 30 m',
    histogram30
  );

  print(
    label + ' - fixed histogram at 100 m',
    histogram100
  );

  var chart = ui.Chart.image.histogram({
    image: image,
    region: studyArea,
    scale: 30,
    maxBuckets: 200,
    minBucketWidth: 0.001
  }).setOptions({
    title: label + ' NDVI histogram at 30 m',
    hAxis: {
      title: 'NDVI'
    },
    vAxis: {
      title: 'Pixel frequency'
    },
    legend: {
      position: 'none'
    }
  });

  print(chart);
}

qcPrintHistogram(
  2008,
  203,
  'Forest Outside 2008'
);

qcPrintHistogram(
  2016,
  203,
  'Forest Outside 2016'
);

qcPrintHistogram(
  2016,
  205,
  'Urban Outside 2016'
);


// ---------------------------------------------------------------------------
// M. CREATE A COMPACT QC SUMMARY
// ---------------------------------------------------------------------------

print('============================================================');
print('QC 11: COMPACT SUMMARY');
print('============================================================');

var qcSummary = ee.FeatureCollection([
  ee.Feature(null, {
    Check: 'Expected row count',
    Expected: QC_EXPECTED_ROW_COUNT,
    Observed: completeFC.size(),
    Pass: qcFlag(
      completeFC.size().eq(
        QC_EXPECTED_ROW_COUNT
      )
    )
  }),

  ee.Feature(null, {
    Check: 'Unique Year x Land_Class x Zone keys',
    Expected: QC_EXPECTED_ROW_COUNT,
    Observed: qcRowKeyHistogram.size(),
    Pass: qcFlag(
      qcRowKeyHistogram.size().eq(
        QC_EXPECTED_ROW_COUNT
      )
    )
  }),

  ee.Feature(null, {
    Check: 'Duplicate keys',
    Expected: 0,
    Observed: qcDuplicateKeyList.size(),
    Pass: qcFlag(
      qcDuplicateKeyList.size().eq(0)
    )
  }),

  ee.Feature(null, {
    Check: 'Incomplete Inside/Outside pairs',
    Expected: 0,
    Observed:
      qcYearClassPairs.aggregate_sum(
        'Pair_Error'
      ),
    Pass: qcFlag(
      ee.Number(
        qcYearClassPairs.aggregate_sum(
          'Pair_Error'
        )
      ).eq(0)
    )
  }),

  ee.Feature(null, {
    Check: 'Rows with logical errors',
    Expected: 0,
    Observed:
      qcCheckedFC
        .filter(
          ee.Filter.gt(
            'QC_Total_Error_Count',
            0
          )
        )
        .size(),
    Pass: qcFlag(
      qcCheckedFC
        .filter(
          ee.Filter.gt(
            'QC_Total_Error_Count',
            0
          )
        )
        .size()
        .eq(0)
    )
  }),

  ee.Feature(null, {
    Check: 'ClassZones with changing total area',
    Expected: 0,
    Observed:
      qcAreaStabilityFC
        .filter(
          ee.Filter.eq(
            'Area_Stable',
            0
          )
        )
        .size(),
    Pass: qcFlag(
      qcAreaStabilityFC
        .filter(
          ee.Filter.eq(
            'Area_Stable',
            0
          )
        )
        .size()
        .eq(0)
    )
  }),

  ee.Feature(null, {
    Check: 'Inside-minus-outside mismatches',
    Expected: 0,
    Observed:
      qcInsideOutsideCheckFC
        .filter(
          ee.Filter.or(
            ee.Filter.eq(
              'NDVI_Difference_OK',
              0
            ),
            ee.Filter.eq(
              'NDMI_Difference_OK',
              0
            )
          )
        )
        .size(),
    Pass: qcFlag(
      qcInsideOutsideCheckFC
        .filter(
          ee.Filter.or(
            ee.Filter.eq(
              'NDVI_Difference_OK',
              0
            ),
            ee.Filter.eq(
              'NDMI_Difference_OK',
              0
            )
          )
        )
        .size()
        .eq(0)
    )
  }),

  ee.Feature(null, {
    Check: 'Year-to-year change mismatches',
    Expected: 0,
    Observed:
      qcYOYCheckFC
        .filter(
          ee.Filter.or(
            ee.Filter.eq(
              'NDVI_YOY_OK',
              0
            ),
            ee.Filter.eq(
              'NDMI_YOY_OK',
              0
            )
          )
        )
        .size(),
    Pass: qcFlag(
      qcYOYCheckFC
        .filter(
          ee.Filter.or(
            ee.Filter.eq(
              'NDVI_YOY_OK',
              0
            ),
            ee.Filter.eq(
              'NDMI_YOY_OK',
              0
            )
          )
        )
        .size()
        .eq(0)
    )
  }),

  ee.Feature(null, {
    Check: 'Rows with Valid Area Ratio below 0.70',
    Expected: 'Review only',
    Observed:
      qcCheckedFC
        .filter(
          ee.Filter.eq(
            'QC_Low_Valid_Area_070',
            1
          )
        )
        .size(),
    Pass: 'REVIEW'
  }),

  ee.Feature(null, {
    Check: 'Rows with all NDVI percentiles equal',
    Expected: 'Review only',
    Observed:
      qcCheckedFC
        .filter(
          ee.Filter.eq(
            'QC_NDVI_All_Percentiles_Equal_Warning',
            1
          )
        )
        .size(),
    Pass: 'REVIEW'
  })
]);

print(
  'FINAL QC SUMMARY',
  qcSummary
);


// ---------------------------------------------------------------------------
// N. EXPORT QC TABLES
// ---------------------------------------------------------------------------

// 1. Compact summary.
Export.table.toDrive({
  collection: qcSummary,
  description:
    QC_EXPORT_PREFIX + '_Summary',
  folder: EXPORT_FOLDER,
  fileNamePrefix:
    QC_EXPORT_PREFIX + '_Summary',
  fileFormat: 'CSV'
});

// 2. Full row-level QC table.
Export.table.toDrive({
  collection: qcCheckedFC,
  description:
    QC_EXPORT_PREFIX + '_Row_Level',
  folder: EXPORT_FOLDER,
  fileNamePrefix:
    QC_EXPORT_PREFIX + '_Row_Level',
  fileFormat: 'CSV'
});

// 3. Inside/outside pair check.
Export.table.toDrive({
  collection: qcYearClassPairs,
  description:
    QC_EXPORT_PREFIX + '_Pair_Check',
  folder: EXPORT_FOLDER,
  fileNamePrefix:
    QC_EXPORT_PREFIX + '_Pair_Check',
  fileFormat: 'CSV'
});

// 4. Area stability.
Export.table.toDrive({
  collection: qcAreaStabilityFC,
  description:
    QC_EXPORT_PREFIX + '_Area_Stability',
  folder: EXPORT_FOLDER,
  fileNamePrefix:
    QC_EXPORT_PREFIX + '_Area_Stability',
  fileFormat: 'CSV'
});

// 5. Inside-minus-outside check.
Export.table.toDrive({
  collection: qcInsideOutsideCheckFC,
  description:
    QC_EXPORT_PREFIX + '_Inside_Outside_Check',
  folder: EXPORT_FOLDER,
  fileNamePrefix:
    QC_EXPORT_PREFIX + '_Inside_Outside_Check',
  fileFormat: 'CSV'
});

// 6. Year-to-year check.
Export.table.toDrive({
  collection: qcYOYCheckFC,
  description:
    QC_EXPORT_PREFIX + '_YOY_Check',
  folder: EXPORT_FOLDER,
  fileNamePrefix:
    QC_EXPORT_PREFIX + '_YOY_Check',
  fileFormat: 'CSV'
});

// 7. Targeted percentile verification.
Export.table.toDrive({
  collection: qcPercentileVerificationFC,
  description:
    QC_EXPORT_PREFIX + '_Percentile_Verification',
  folder: EXPORT_FOLDER,
  fileNamePrefix:
    QC_EXPORT_PREFIX + '_Percentile_Verification',
  fileFormat: 'CSV'
});

// 8. Required-property null summary.
Export.table.toDrive({
  collection: qcNullSummary,
  description:
    QC_EXPORT_PREFIX + '_Null_Summary',
  folder: EXPORT_FOLDER,
  fileNamePrefix:
    QC_EXPORT_PREFIX + '_Null_Summary',
  fileFormat: 'CSV'
});

print('============================================================');
print('QC CODE FINISHED PREPARING OUTPUTS');
print('Run all QC export tasks from the Tasks tab.');
print('Send the following files for review:');
print('1. ' + QC_EXPORT_PREFIX + '_Summary.csv');
print('2. ' + QC_EXPORT_PREFIX + '_Row_Level.csv');
print('3. ' + QC_EXPORT_PREFIX + '_Percentile_Verification.csv');
print('4. ' + QC_EXPORT_PREFIX + '_Area_Stability.csv');
print('5. Console screenshots or copied output for the three histograms.');
print('============================================================');
